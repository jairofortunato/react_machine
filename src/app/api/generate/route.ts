import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { humanizeError } from "@/lib/errors";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  const { instructions, instagramUrl } = await req.json();

  if (!instructions || !instagramUrl) {
    return NextResponse.json(
      { error: "Instruções e link do Instagram são obrigatórios." },
      { status: 400 }
    );
  }

  if (!instagramUrl.startsWith("http")) {
    return NextResponse.json(
      { error: "Por favor, insira um link válido." },
      { status: 400 }
    );
  }

  try {
    // 1. Call Python backend to process video (yt-dlp + ffmpeg + Whisper)
    const backendRes = await fetch(`${BACKEND_URL}/api/process-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagram_url: instagramUrl }),
    });

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || "Erro ao processar o vídeo." },
        { status: 500 }
      );
    }

    const { transcript, frameImage, thumbnailImage, videoStats } =
      await backendRes.json();

    // 2. Prepare images for Claude Vision
    const imageBlocks: Anthropic.ImageBlockParam[] = [];

    if (thumbnailImage) {
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: thumbnailImage,
        },
      });
    }

    if (frameImage) {
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: frameImage,
        },
      });
    }

    // 3. Build visual context
    let visualContext = "";
    if (imageBlocks.length > 0) {
      const parts: string[] = [];
      if (thumbnailImage)
        parts.push("A primeira imagem é a CAPA/THUMBNAIL do vídeo original.");
      if (frameImage)
        parts.push(
          "A próxima imagem é um FRAME do início do vídeo original."
        );
      visualContext = `\nCONTEXTO VISUAL:\n${parts.map((p) => `- ${p}`).join("\n")}\nUse essas imagens para entender melhor o contexto visual do vídeo (cenário, pessoa, estilo, texto na tela, etc).\n`;
    }

    const description = videoStats?.description;

    // 4. Generate script with Claude + Vision
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Você é um roteirista especializado em vídeos curtos para Instagram/Reels.

CONTEXTO E INSTRUÇÕES DO CRIADOR:
${instructions}

TRANSCRIÇÃO DO VÍDEO ORIGINAL:
${transcript}
${description ? `\nDESCRIÇÃO DO VÍDEO ORIGINAL:\n${description}\n` : ""}${visualContext}
TAREFA:
Com base na transcrição acima, nas instruções do criador${imageBlocks.length > 0 ? " e no contexto visual" : ""}, escreva um roteiro completo de um vídeo de reação de 1 minuto e 30 segundos (aproximadamente 250-300 palavras faladas).

O roteiro deve:
- Ser uma REAÇÃO ao conteúdo do vídeo transcrito
- Seguir o tom e estilo indicados nas instruções do criador
- Incluir indicações de emoção/expressão entre parênteses quando relevante
- Ter um gancho forte nos primeiros 3 segundos
- Ter uma conclusão com call-to-action
- Considerar os elementos visuais do vídeo original na reação

Escreva APENAS o roteiro, sem explicações adicionais.`,
            },
          ],
        },
      ],
    });

    const scriptContent =
      message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({
      script: scriptContent,
      transcript,
      frameImage,
      videoStats,
    });
  } catch (err: unknown) {
    console.error("Error:", err);
    return NextResponse.json(
      { error: humanizeError(err) },
      { status: 500 }
    );
  }
}
