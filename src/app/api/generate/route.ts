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

export async function POST(req: NextRequest) {
  const { instructions, instagramUrl } = await req.json();

  if (!instructions || !instagramUrl) {
    return NextResponse.json(
      { error: "Instruções e link do Instagram são obrigatórios." },
      { status: 400 }
    );
  }

  // Validate it looks like an Instagram URL
  if (!instagramUrl.includes("instagram.com")) {
    return NextResponse.json(
      { error: "Por favor, insira um link válido do Instagram." },
      { status: 400 }
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "react-machine-"));
  const audioPath = path.join(tmpDir, "audio.m4a");

  try {
    // 1. Download audio from Instagram video using yt-dlp
    await execFileAsync("yt-dlp", [
      "--extract-audio",
      "--audio-format", "m4a",
      "--output", audioPath,
      "--no-playlist",
      instagramUrl,
    ], { timeout: 60000 });

    // Find the actual downloaded file (yt-dlp may add extension)
    const files = await fs.readdir(tmpDir);
    const audioFile = files.find((f) => f.endsWith(".m4a") || f.endsWith(".mp3") || f.endsWith(".opus") || f.endsWith(".webm"));

    if (!audioFile) {
      return NextResponse.json(
        { error: "Não foi possível baixar o áudio do vídeo." },
        { status: 500 }
      );
    }

    const finalAudioPath = path.join(tmpDir, audioFile);

    // 2. Transcribe with OpenAI Whisper
    const audioBuffer = await fs.readFile(finalAudioPath);
    const audioBlob = new File([audioBuffer], audioFile, {
      type: "audio/m4a",
    });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioBlob,
      language: "pt",
    });

    const transcript = transcription.text;

    // 3. Generate script with Claude
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Você é um roteirista especializado em vídeos curtos para Instagram/Reels.

CONTEXTO E INSTRUÇÕES DO CRIADOR:
${instructions}

TRANSCRIÇÃO DO VÍDEO ORIGINAL:
${transcript}

TAREFA:
Com base na transcrição acima e nas instruções do criador, escreva um roteiro completo de um vídeo de reação de 1 minuto e 30 segundos (aproximadamente 250-300 palavras faladas).

O roteiro deve:
- Ser uma REAÇÃO ao conteúdo do vídeo transcrito
- Seguir o tom e estilo indicados nas instruções do criador
- Incluir marcações de tempo aproximadas [00:00], [00:15], [00:30], etc.
- Incluir indicações de emoção/expressão entre parênteses quando relevante
- Ter um gancho forte nos primeiros 3 segundos
- Ter uma conclusão com call-to-action

Escreva APENAS o roteiro, sem explicações adicionais.`,
        },
      ],
    });

    const scriptContent =
      message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({ script: scriptContent, transcript });
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
    // Cleanup temp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
