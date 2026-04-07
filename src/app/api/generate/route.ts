import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const execFileAsync = promisify(execFile);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function getMediaType(filename: string): ImageMediaType {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function POST(req: NextRequest) {
  const { instructions, instagramUrl } = await req.json();

  if (!instructions || !instagramUrl) {
    return NextResponse.json(
      { error: "Instruções e link do Instagram são obrigatórios." },
      { status: 400 }
    );
  }

  if (!instagramUrl.includes("instagram.com")) {
    return NextResponse.json(
      { error: "Por favor, insira um link válido do Instagram." },
      { status: 400 }
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "react-machine-"));
  const audioPath = path.join(tmpDir, "audio.m4a");
  const framePath = path.join(tmpDir, "frame.jpg");

  try {
    // 1. Download video + thumbnail + metadata from Instagram
    await execFileAsync(
      "yt-dlp",
      [
        "--write-thumbnail",
        "--write-info-json",
        "--output",
        path.join(tmpDir, "video.%(ext)s"),
        "--no-playlist",
        instagramUrl,
      ],
      { timeout: 60000 }
    );

    const files = await fs.readdir(tmpDir);
    const videoFile = files.find((f) => /\.(mp4|webm|mkv|mov)$/i.test(f));
    const thumbnailFile = files.find((f) =>
      /\.(jpg|jpeg|png|webp)$/i.test(f)
    );
    const infoFile = files.find((f) => f.endsWith(".info.json"));

    if (!videoFile) {
      return NextResponse.json(
        { error: "Não foi possível baixar o vídeo." },
        { status: 500 }
      );
    }

    const videoPath = path.join(tmpDir, videoFile);

    // 2. Parse video metadata (likes, comments, date, etc.)
    let videoStats: {
      likes: number | null;
      comments: number | null;
      shares: number | null;
      date: string | null;
    } = { likes: null, comments: null, shares: null, date: null };

    if (infoFile) {
      const infoRaw = await fs.readFile(path.join(tmpDir, infoFile), "utf-8");
      const info = JSON.parse(infoRaw);
      const rawDate = info.upload_date; // YYYYMMDD
      videoStats = {
        likes: info.like_count ?? null,
        comments: info.comment_count ?? null,
        shares: info.repost_count ?? info.share_count ?? null,
        date: rawDate
          ? `${rawDate.slice(6, 8)}/${rawDate.slice(4, 6)}/${rawDate.slice(0, 4)}`
          : null,
      };
    }

    // 3. Extract audio from video with ffmpeg
    await execFileAsync(
      "ffmpeg",
      ["-i", videoPath, "-vn", "-acodec", "aac", "-y", audioPath],
      { timeout: 30000 }
    );

    // 4. Extract frame from ~1 second into the video
    await execFileAsync(
      "ffmpeg",
      ["-i", videoPath, "-ss", "1", "-vframes", "1", "-y", framePath],
      { timeout: 15000 }
    );

    // 5. Transcribe audio with OpenAI Whisper
    const audioBuffer = await fs.readFile(audioPath);
    const audioBlob = new File([audioBuffer], "audio.m4a", {
      type: "audio/m4a",
    });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioBlob,
      language: "pt",
    });

    const transcript = transcription.text;

    // 6. Prepare images for Claude Vision
    const imageBlocks: Anthropic.ImageBlockParam[] = [];

    if (thumbnailFile) {
      const thumbBuffer = await fs.readFile(path.join(tmpDir, thumbnailFile));
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: getMediaType(thumbnailFile),
          data: thumbBuffer.toString("base64"),
        },
      });
    }

    let frameBase64: string | null = null;
    try {
      const frameBuffer = await fs.readFile(framePath);
      frameBase64 = frameBuffer.toString("base64");
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: frameBase64,
        },
      });
    } catch {
      // Frame extraction may fail for very short videos
    }

    // 7. Build visual context description
    let visualContext = "";
    if (imageBlocks.length > 0) {
      const parts: string[] = [];
      if (thumbnailFile)
        parts.push("A primeira imagem é a CAPA/THUMBNAIL do vídeo original.");
      if (frameBase64)
        parts.push(
          "A próxima imagem é um FRAME do início do vídeo original."
        );
      visualContext = `\nCONTEXTO VISUAL:\n${parts.map((p) => `- ${p}`).join("\n")}\nUse essas imagens para entender melhor o contexto visual do vídeo (cenário, pessoa, estilo, texto na tela, etc).\n`;
    }

    // 8. Generate script with Claude + Vision
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
${visualContext}
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
      frameImage: frameBase64,
      videoStats,
    });
  } catch (err: unknown) {
    console.error("Error:", err);

    const errorMessage =
      err instanceof Error ? err.message : "Erro desconhecido";

    if (errorMessage.includes("yt-dlp")) {
      return NextResponse.json(
        {
          error:
            "Erro ao baixar o vídeo. Verifique se o link está correto e se o yt-dlp está instalado.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: `Erro ao processar: ${errorMessage}` },
      { status: 500 }
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
