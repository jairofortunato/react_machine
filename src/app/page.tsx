"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

interface VideoStats {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  date: string | null;
  description: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface EditHistory {
  prompt: string;
  result: string;
}

interface ProfilePost {
  id: string;
  url: string;
  title: string;
  description: string;
  thumbnail: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  date: string | null;
}

export default function Home() {
  const [instructions, setInstructions] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [script, setScript] = useState("");
  const [transcript, setTranscript] = useState("");
  const [frameImage, setFrameImage] = useState<string | null>(null);
  const [videoStats, setVideoStats] = useState<VideoStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [editHistory, setEditHistory] = useState<EditHistory[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Profile explorer state
  const [profileInput, setProfileInput] = useState("");
  const [savedProfiles, setSavedProfiles] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [nextMaxId, setNextMaxId] = useState<string | null>(null);

  // Load saved profiles from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("react-machine-profiles");
    if (stored) {
      setSavedProfiles(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function addProfile() {
    const username = profileInput.trim().replace("@", "");
    if (!username) return;
    if (savedProfiles.includes(username)) {
      setProfileInput("");
      return;
    }
    const updated = [...savedProfiles, username];
    setSavedProfiles(updated);
    localStorage.setItem("react-machine-profiles", JSON.stringify(updated));
    setProfileInput("");
  }

  function removeProfile(username: string) {
    const updated = savedProfiles.filter((p) => p !== username);
    setSavedProfiles(updated);
    localStorage.setItem("react-machine-profiles", JSON.stringify(updated));
    if (activeProfile === username) {
      setActiveProfile(null);
      setProfilePosts([]);
    }
  }

  async function loadProfilePosts(username: string) {
    if (activeProfile === username && profilePosts.length > 0) {
      setActiveProfile(null);
      setProfilePosts([]);
      setNextMaxId(null);
      return;
    }

    setActiveProfile(username);
    setProfilePosts([]);
    setNextMaxId(null);
    setProfileError("");
    setProfileLoading(true);

    try {
      const res = await fetch("/api/profile-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      const data = await res.json();

      if (!res.ok) {
        setProfileError(data.error || "Erro ao buscar posts.");
        return;
      }

      setProfilePosts(data.posts || []);
      setNextMaxId(data.nextMaxId || null);
    } catch {
      setProfileError("Erro de conexão ao buscar posts.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadMorePosts() {
    if (!activeProfile || !nextMaxId || profileLoading) return;

    setProfileLoading(true);

    try {
      const res = await fetch("/api/profile-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: activeProfile, maxId: nextMaxId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setProfileError(data.error || "Erro ao carregar mais posts.");
        return;
      }

      setProfilePosts((prev) => [...prev, ...(data.posts || [])]);
      setNextMaxId(data.nextMaxId || null);
    } catch {
      setProfileError("Erro de conexão ao carregar mais posts.");
    } finally {
      setProfileLoading(false);
    }
  }

  function selectPost(post: ProfilePost) {
    setInstagramUrl(post.url);
  }

  async function handleGenerate() {
    if (!instructions.trim() || !instagramUrl.trim()) {
      setError("Preencha as instruções e o link do Instagram.");
      return;
    }

    setError("");
    setScript("");
    setTranscript("");
    setFrameImage(null);
    setVideoStats(null);
    setChatMessages([]);
    setEditHistory([]);
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
      setTranscript(data.transcript || "");
      setFrameImage(data.frameImage || null);
      setVideoStats(data.videoStats || null);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChatSend() {
    const prompt = chatInput.trim();
    if (!prompt || chatLoading) return;

    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          transcript,
          instructions,
          prompt,
          history: editHistory,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Erro ao editar." },
        ]);
        return;
      }

      setScript(data.script);
      setEditHistory((prev) => [...prev, { prompt, result: data.script }]);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Roteiro atualizado!" },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro de conexão. Tente novamente." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleDownloadVideo() {
    if (!instagramUrl.trim() || downloading) return;
    setDownloading(true);

    try {
      const res = await fetch("/api/download-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: instagramUrl }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Erro ao baixar vídeo.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "video.mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Erro ao baixar vídeo.");
    } finally {
      setDownloading(false);
    }
  }

  const hasResults = script || transcript || frameImage;

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-amber-400 uppercase">
            MÁQUINA DE REACTS
          </h1>
          <p className="text-white/60">
            Cole um link de vídeo (Instagram, YouTube, TikTok, X, Facebook),
            adicione suas instruções, e receba um roteiro de reação.
          </p>
        </div>

        {/* Explorar Perfis */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-amber-400">
            EXPLORAR PERFIS
          </h2>

          {/* Adicionar perfil */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="@usuario"
              className="flex-1 rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              value={profileInput}
              onChange={(e) => setProfileInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addProfile();
                }
              }}
            />
            <button
              onClick={addProfile}
              className="rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-black transition-colors hover:bg-amber-400 shrink-0"
            >
              ADICIONAR
            </button>
          </div>

          {/* Lista de perfis salvos */}
          {savedProfiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {savedProfiles.map((username) => (
                <div key={username} className="flex items-center gap-1">
                  <button
                    onClick={() => loadProfilePosts(username)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeProfile === username
                        ? "bg-amber-500 text-black"
                        : "bg-neutral-800 text-white hover:bg-neutral-700"
                    }`}
                  >
                    @{username}
                  </button>
                  <button
                    onClick={() => removeProfile(username)}
                    className="text-white/30 hover:text-red-400 text-sm px-1 transition-colors"
                    title="Remover perfil"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Loading / Error */}
          {profileLoading && (
            <p className="text-amber-400/60 text-sm">
              Buscando posts de @{activeProfile}...
            </p>
          )}
          {profileError && (
            <p className="text-red-400 text-sm">{profileError}</p>
          )}

          {/* Grid de posts */}
          {profilePosts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {profilePosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => selectPost(post)}
                  className={`rounded-lg border overflow-hidden text-left transition-all hover:scale-[1.02] ${
                    instagramUrl === post.url
                      ? "border-amber-500 ring-2 ring-amber-500"
                      : "border-amber-500/20 hover:border-amber-500/50"
                  }`}
                >
                  {post.thumbnail ? (
                    <div className="relative aspect-square bg-neutral-800">
                      <Image
                        src={post.thumbnail}
                        alt={post.description || "Post"}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="aspect-square bg-neutral-800 flex items-center justify-center">
                      <span className="text-white/20 text-xs">SEM THUMB</span>
                    </div>
                  )}
                  <div className="p-2 bg-neutral-900 space-y-1">
                    {post.date && (
                      <p className="text-[10px] text-amber-400/50">
                        {post.date}
                      </p>
                    )}
                    <div className="flex gap-2 text-[10px] text-white/50">
                      {post.likes !== null && (
                        <span>{post.likes.toLocaleString("pt-BR")} curtidas</span>
                      )}
                      {post.comments !== null && (
                        <span>{post.comments.toLocaleString("pt-BR")} coment.</span>
                      )}
                    </div>
                    {post.description && (
                      <p className="text-[11px] text-white/40 line-clamp-2">
                        {post.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Carregar mais */}
          {nextMaxId && !profileLoading && (
            <button
              onClick={loadMorePosts}
              className="w-full rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-amber-400 transition-colors hover:bg-neutral-800"
            >
              CARREGAR MAIS
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="instructions"
              className="block text-sm font-medium text-white mb-1.5"
            >
              CONTEXTO E INSTRUÇÕES
            </label>
            <textarea
              id="instructions"
              rows={6}
              placeholder="Ex: Sou um criador de conteúdo sobre finanças pessoais. Quero reagir a esse vídeo com tom descontraído e educativo..."
              className="w-full rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="instagram-url"
              className="block text-sm font-medium text-white mb-1.5"
            >
              LINK DO VÍDEO
            </label>
            <input
              id="instagram-url"
              type="url"
              placeholder="https://www.instagram.com/reel/... ou YouTube, TikTok, X, Facebook"
              className="w-full rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 px-4 py-3 font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "GERANDO ROTEIRO..." : "GERAR ROTEIRO"}
          </button>
        </div>

        {hasResults && (
          <div className="space-y-6">
            {/* Frame + Stats */}
            {(frameImage || videoStats) && (
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {frameImage && (
                  <div className="shrink-0">
                    <h2 className="text-lg font-semibold text-amber-400 mb-2">
                      FRAME DO VÍDEO
                    </h2>
                    <Image
                      src={`data:image/jpeg;base64,${frameImage}`}
                      alt="Frame do início do vídeo"
                      width={320}
                      height={568}
                      className="rounded-lg border border-amber-500/30 object-cover"
                    />
                  </div>
                )}

                {videoStats && (
                  <div className="flex-1 space-y-3">
                    <h2 className="text-lg font-semibold text-amber-400">
                      DADOS DO VÍDEO
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                      {videoStats.date && (
                        <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-4">
                          <p className="text-xs text-amber-400/50 uppercase tracking-wide">
                            Data
                          </p>
                          <p className="text-lg font-semibold text-white mt-1">
                            {videoStats.date}
                          </p>
                        </div>
                      )}
                      {videoStats.likes !== null && (
                        <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-4">
                          <p className="text-xs text-amber-400/50 uppercase tracking-wide">
                            Curtidas
                          </p>
                          <p className="text-lg font-semibold text-white mt-1">
                            {videoStats.likes.toLocaleString("pt-BR")}
                          </p>
                        </div>
                      )}
                      {videoStats.comments !== null && (
                        <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-4">
                          <p className="text-xs text-amber-400/50 uppercase tracking-wide">
                            Comentários
                          </p>
                          <p className="text-lg font-semibold text-white mt-1">
                            {videoStats.comments.toLocaleString("pt-BR")}
                          </p>
                        </div>
                      )}
                      {videoStats.shares !== null && (
                        <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-4">
                          <p className="text-xs text-amber-400/50 uppercase tracking-wide">
                            Enviados
                          </p>
                          <p className="text-lg font-semibold text-white mt-1">
                            {videoStats.shares.toLocaleString("pt-BR")}
                          </p>
                        </div>
                      )}
                    </div>

                    {videoStats.description && (
                      <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-4">
                        <p className="text-xs text-amber-400/50 uppercase tracking-wide">
                          DESCRIÇÃO
                        </p>
                        <p className="text-sm text-white/80 mt-1 whitespace-pre-wrap">
                          {videoStats.description}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Transcrição */}
            {transcript && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-amber-400">
                  TRANSCRIÇÃO
                </h2>
                <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-5 whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                  {transcript}
                </div>
              </div>
            )}

            {/* Roteiro */}
            {script && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-amber-400">
                  ROTEIRO GERADO
                </h2>
                <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-5 whitespace-pre-wrap text-sm leading-relaxed text-white">
                  {script}
                </div>

                <button
                  onClick={handleDownloadVideo}
                  disabled={downloading}
                  className="w-full rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-3 font-medium text-amber-400 transition-colors hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? "BAIXANDO VÍDEO..." : "BAIXAR VÍDEO ORIGINAL"}
                </button>

                <button
                  onClick={() => {
                    const blob = new Blob([script], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "roteiro.txt";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-3 font-medium text-amber-400 transition-colors hover:bg-neutral-800"
                >
                  SALVAR ROTEIRO (.TXT)
                </button>
              </div>
            )}

            {/* Chat para editar roteiro */}
            {script && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-amber-400">
                  EDITAR ROTEIRO
                </h2>

                {/* Mensagens do chat */}
                {chatMessages.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-neutral-900 p-4 max-h-60 overflow-y-auto space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            msg.role === "user"
                              ? "bg-amber-500 text-black"
                              : "bg-neutral-800 text-white"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-neutral-800 text-amber-400/60 rounded-lg px-3 py-2 text-sm">
                          Editando...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Input do chat */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Mude o gancho inicial para algo mais provocativo..."
                    className="flex-1 rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSend();
                      }
                    }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={chatLoading || !chatInput.trim()}
                    className="rounded-lg bg-amber-500 px-5 py-3 font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    ENVIAR
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
