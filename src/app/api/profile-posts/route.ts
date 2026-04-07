import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  const { username, maxId } = await req.json();

  if (!username) {
    return NextResponse.json(
      { error: "Username é obrigatório." },
      { status: 400 }
    );
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/profile-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, max_posts: 12, max_id: maxId || "" }),
    });

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || "Erro ao buscar posts." },
        { status: 500 }
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("Profile posts error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro ao buscar posts: ${errorMessage}` },
      { status: 500 }
    );
  }
}
