import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

import type { SfxVariant } from "@/lib/project-types";

export async function generateSfxClip(
  description: string,
  projectId: string,
  elevenLabsApiKey: string,
  blobToken: string
): Promise<SfxVariant> {
  const client = new ElevenLabsClient({ apiKey: elevenLabsApiKey });

  const audioStream = await client.textToSoundEffects.convert({
    text: description,
    durationSeconds: 8,
    promptInfluence: 0.7,
  });

  // Collect ReadableStream into Buffer
  const buffer = Buffer.from(await new Response(audioStream).arrayBuffer());

  const key = `sfx/${projectId}/${uuidv4()}.mp3`;
  const { url } = await put(key, buffer, {
    access: "private",
    token: blobToken,
    contentType: "audio/mpeg",
  });

  return {
    description,
    blobUrl: `/api/audio?u=${encodeURIComponent(url)}`,
    durationSeconds: 8,
  };
}
