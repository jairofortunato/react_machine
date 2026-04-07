import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { humanizeError } from "@/lib/errors";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { script, transcript, instructions, prompt, history } =
    await req.json();

  if (!script || !prompt) {
    return NextResponse.json(
      { error: "Roteiro e prompt são obrigatórios." },
      { status: 400 }
    );
  }

  try {
    // Build conversation history for multi-turn editing
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Você é um editor de roteiros para vídeos curtos de Instagram/Reels.

CONTEXTO DO CRIADOR:
${instructions || "Não fornecido."}

TRANSCRIÇÃO DO VÍDEO ORIGINAL:
${transcript || "Não fornecida."}

ROTEIRO ATUAL:
${script}

A partir de agora, o criador vai te pedir ajustes no roteiro. Sempre retorne o roteiro COMPLETO atualizado, sem explicações. Apenas o roteiro editado.`,
      },
      {
        role: "assistant",
        content:
          "Entendido. Envie suas alterações e eu retornarei o roteiro completo atualizado.",
      },
    ];

    // Add previous edit history
    if (history && Array.isArray(history)) {
      for (const entry of history) {
        messages.push({ role: "user", content: entry.prompt });
        messages.push({ role: "assistant", content: entry.result });
      }
    }

    // Add current edit request
    messages.push({ role: "user", content: prompt });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages,
    });

    const updatedScript =
      message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({ script: updatedScript });
  } catch (err: unknown) {
    console.error("Edit error:", err);
    return NextResponse.json(
      { error: humanizeError(err) },
      { status: 500 }
    );
  }
}
