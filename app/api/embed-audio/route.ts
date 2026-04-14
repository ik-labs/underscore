import { NextResponse } from "next/server";

import { embedWithClap } from "@/lib/sonic-ingestion";
import { MissingServerEnvError, assertPhase2AudioEnv } from "@/lib/server-env";

export const runtime = "nodejs";
export const maxDuration = 60;

const SUPPORTED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
]);

export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  const mimeType = contentType.split(";")[0]?.trim() ?? "";

  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      {
        error: `Unsupported audio MIME type: "${mimeType}". Supported: ${[...SUPPORTED_MIME_TYPES].join(", ")}`,
      },
      { status: 400 }
    );
  }

  let env;

  try {
    env = assertPhase2AudioEnv();
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return NextResponse.json(
        { error: error.message, missing: error.missing },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to load environment configuration." },
      { status: 500 }
    );
  }

  let buffer: Buffer;
  let bodyLength: number;

  try {
    const arrayBuffer = await request.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    bodyLength = arrayBuffer.byteLength;
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body." },
      { status: 400 }
    );
  }

  if (bodyLength === 0) {
    return NextResponse.json(
      { error: "Request body is empty." },
      { status: 400 }
    );
  }

  try {
    const embedding = await embedWithClap(
      { kind: "audio", buffer, mimeType },
      env.hfApiKey
    );

    return NextResponse.json({ embedding }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown embedding error";

    if (message.includes("warming up")) {
      return NextResponse.json(
        { error: "model_warming", retryAfterSeconds: 20, message },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
