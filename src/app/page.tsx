"use client";

import { useState } from "react";

export default function Home() {
  const [instructions, setInstructions] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!instructions.trim() || !instagramUrl.trim()) {
      setError("Preencha as instruções e o link do Instagram.");
      return;
    }

    setError("");
    setScript("");
    setLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions, instagramUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao gerar roteiro.");
        return;
      }

      setScript(data.script);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Gerador de Roteiros
          </h1>
          <p className="text-zinc-400">
            Cole um link de vídeo do Instagram, adicione suas instruções, e
            receba um roteiro de reação de 1m30s.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="instructions"
              className="block text-sm font-medium text-zinc-300 mb-1.5"
            >
              Contexto e Instruções
            </label>
            <textarea
              id="instructions"
              rows={6}
              placeholder="Ex: Sou um criador de conteúdo sobre finanças pessoais. Quero reagir a esse vídeo com tom descontraído e educativo..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-y"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="instagram-url"
              className="block text-sm font-medium text-zinc-300 mb-1.5"
            >
              Link do Vídeo (Instagram)
            </label>
            <input
              id="instagram-url"
              type="url"
              placeholder="https://www.instagram.com/reel/..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-4 py-3 font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Gerando roteiro..." : "Gerar Roteiro"}
          </button>
        </div>

        {script && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-zinc-200">
              Roteiro Gerado
            </h2>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {script}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
