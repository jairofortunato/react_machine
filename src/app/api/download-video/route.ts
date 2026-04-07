import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json(
      { error: "URL é obrigatória." },
      { status: 400 }
    );
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/download-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || "Erro ao baixar vídeo." },
        { status: 500 }
      );
    }

    const videoBuffer = await backendRes.arrayBuffer();
    const disposition = backendRes.headers.get("content-disposition");
    const filename =
      disposition?.match(/filename="?(.+?)"?$/)?.[1] || "video.mp4";

    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    console.error("Download error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro ao baixar: ${errorMessage}` },
      { status: 500 }
    );
  }
}
