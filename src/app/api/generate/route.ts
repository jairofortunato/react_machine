import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { humanizeError } from "@/lib/errors";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  const { instructions, instagramUrl, mediaType, thumbnailUrl, postDescription, postStats } = await req.json();

  if (!instructions || !instagramUrl) {
    return NextResponse.json(
      { error: "Instruções e link são obrigatórios." },
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
    // Handle image posts (no video processing needed)
    if (mediaType === "image") {
      const imgBlocks: Anthropic.ImageBlockParam[] = [];
      let imageBase64: string | null = null;

      if (thumbnailUrl) {
        try {
          const imgRes = await fetch(thumbnailUrl);
          if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer();
            imageBase64 = Buffer.from(imgBuffer).toString("base64");
            const contentType = imgRes.headers.get("content-type") || "image/jpeg";
            imgBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: imageBase64,
              },
            });
          }
        } catch (e) {
          console.error("Failed to fetch image:", e);
        }
      }

      const imgDescription = postDescription || "";
      let statsContext = "";
      if (postStats) {
        const statParts: string[] = [];
        if (postStats.likes != null) statParts.push(`Curtidas: ${postStats.likes}`);
        if (postStats.comments != null) statParts.push(`Comentários: ${postStats.comments}`);
        if (postStats.date) statParts.push(`Data: ${postStats.date}`);
        if (statParts.length > 0) statsContext = `\nESTATÍSTICAS DO POST:\n${statParts.join("\n")}\n`;
      }

      const imgMessage = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              ...imgBlocks,
              {
                type: "text",
                text: `Você é um roteirista especializado em vídeos curtos para Instagram/Reels.

CONTEXTO E INSTRUÇÕES DO CRIADOR:
${instructions}
${imgDescription ? `\nDESCRIÇÃO/LEGENDA DO POST ORIGINAL:\n${imgDescription}\n` : ""}${statsContext}
CONTEXTO VISUAL:
- A imagem acima é o POST ORIGINAL do Instagram ao qual o criador vai reagir.
- Analise todos os elementos visuais: cenário, pessoas, objetos, texto na imagem, estilo, cores, composição.

TAREFA:
Com base na imagem acima, na legenda do post, nas instruções do criador e no contexto visual, escreva um roteiro completo de um vídeo de reação de 1 minuto e 30 segundos (aproximadamente 250-300 palavras faladas).

O roteiro deve:
- Ser uma REAÇÃO ao conteúdo da IMAGEM do post
- Seguir o tom e estilo indicados nas instruções do criador
- Incluir indicações de emoção/expressão entre parênteses quando relevante
- Descrever o que o criador deve mostrar/apontar na imagem durante a reação
- Ter um gancho forte nos primeiros 3 segundos
- Ter uma conclusão com call-to-action

Escreva APENAS o roteiro, sem explicações adicionais.`,
              },
            ],
          },
        ],
      });

      const imgScript =
        imgMessage.content[0].type === "text" ? imgMessage.content[0].text : "";

      return NextResponse.json({
        script: imgScript,
        transcript: "",
        frameImage: imageBase64,
        videoStats: postStats
          ? {
              likes: postStats.likes ?? null,
              comments: postStats.comments ?? null,
              shares: null,
              date: postStats.date ?? null,
              description: imgDescription || null,
            }
          : null,
      });
    }

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
