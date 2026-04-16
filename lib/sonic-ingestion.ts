import Anthropic from "@anthropic-ai/sdk";
import { put } from "@vercel/blob";
import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";

import type {
  IngestSourceResult,
  ProjectRecord,
  ProjectSourceMetadata,
  SonicIngestResponse,
  SourceType,
} from "@/lib/project-types";
import { getAnthropicApiKey } from "@/lib/server-env";

const SONIC_SCHEMA = {
  project_id: { type: "string", filterable: true },
  source_id: { type: "string", filterable: true },
  source_file: { type: "string", filterable: true },
  source_type: { type: "string", filterable: true },
  text: { type: "string", full_text_search: true },
  emotional_tags: { type: "[]string", filterable: true },
  location_hint: { type: "string" },
  blob_url: { type: "string" },
  chunk_index: { type: "int", filterable: true },
  upload_ts: { type: "int", filterable: true },
  timestamp_ms: { type: "int", filterable: true },
  duration_ms: { type: "int", filterable: true },
} as const;

const SUPPORTED_AUDIO_EXTENSIONS = new Set(["wav", "mp3", "m4a", "webm"]);
const HF_CLAP_URL =
  "https://api-inference.huggingface.co/models/laion/larger_clap_general";
const MAX_SEGMENT_COUNT = 10;
const MAX_SINGLE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

type AudioSegment = {
  segmentBuffer: Buffer;
  startMs: number;
  durationMs: number;
};

type AudioChunkDraft = {
  sourceId: string;
  fileName: string;
  mimeType: string;
  sourceType: SourceType;
  text: string;
  chunkIndex: number;
  locationHint: string;
  blobUrl: string;
  timestampMs: number;
  durationMs: number;
  uploadedAt: string;
};

type EnrichedAudioChunk = AudioChunkDraft & {
  emotionalTags: string[];
};

type EmbeddedAudioChunk = EnrichedAudioChunk & {
  embedding: number[];
};

function getFileExtension(fileName: string) {
  const ext = fileName.split(".").pop();
  return ext ? ext.toLowerCase() : "";
}

function formatTimestampMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function buildWavHeader(
  dataLength: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);

  return header;
}

function segmentWav(buffer: Buffer, warnings: string[]): AudioSegment[] {
  if (buffer.length < 44) {
    warnings.push("WAV file too small to parse header; treating as single segment.");
    return [{ segmentBuffer: buffer, startMs: 0, durationMs: 0 }];
  }

  const numChannels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  if (numChannels === 0 || sampleRate === 0 || bitsPerSample === 0) {
    warnings.push("WAV header values are zero; treating as single segment.");
    return [{ segmentBuffer: buffer, startMs: 0, durationMs: 0 }];
  }

  const bytesPerSecond = (sampleRate * numChannels * bitsPerSample) / 8;
  const dataOffset = 44;
  const dataBuffer = buffer.slice(dataOffset);
  const totalMs = Math.round((dataBuffer.length / bytesPerSecond) * 1000);
  const segmentBytes = bytesPerSecond * 30; // 30s segments

  if (dataBuffer.length <= segmentBytes) {
    return [{ segmentBuffer: buffer, startMs: 0, durationMs: totalMs }];
  }

  const segments: AudioSegment[] = [];
  let offset = 0;

  while (offset < dataBuffer.length && segments.length < MAX_SEGMENT_COUNT) {
    const slice = dataBuffer.slice(offset, offset + segmentBytes);
    const durationMs = Math.round((slice.length / bytesPerSecond) * 1000);
    const startMs = Math.round((offset / bytesPerSecond) * 1000);
    const header = buildWavHeader(
      slice.length,
      sampleRate,
      numChannels,
      bitsPerSample
    );
    segments.push({
      segmentBuffer: Buffer.concat([header, slice]),
      startMs,
      durationMs,
    });
    offset += segmentBytes;
  }

  if (offset < dataBuffer.length) {
    warnings.push(
      `Audio file exceeds ${MAX_SEGMENT_COUNT * 30}s; only first ${MAX_SEGMENT_COUNT} segments indexed.`
    );
  }

  return segments;
}

function segmentAudioFile(
  buffer: Buffer,
  mimeType: string,
  _fileName: string,
  warnings: string[]
): AudioSegment[] {
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return segmentWav(buffer, warnings);
  }

  // MP3, M4A, WebM: no reliable frame-boundary splitting; treat as single chunk
  if (buffer.length > MAX_SINGLE_FILE_BYTES) {
    warnings.push(
      `Audio file exceeds 25 MB; truncating to first 25 MB for embedding.`
    );
    return [
      {
        segmentBuffer: buffer.slice(0, MAX_SINGLE_FILE_BYTES),
        startMs: 0,
        durationMs: 0,
      },
    ];
  }

  return [{ segmentBuffer: buffer, startMs: 0, durationMs: 0 }];
}

async function callHfClap(
  body: ArrayBuffer | string,
  contentType: string,
  hfApiKey: string,
  retried = false
): Promise<number[]> {
  const response = await fetch(HF_CLAP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfApiKey}`,
      "Content-Type": contentType,
    },
    body,
  });

  if (response.status === 503 && !retried) {
    const text = await response.text();
    if (text.includes("loading")) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return callHfClap(body, contentType, hfApiKey, true);
    }
  }

  if (response.status === 503) {
    throw new Error(
      "HuggingFace model is warming up. Please retry in ~20 seconds."
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HuggingFace CLAP request failed (${response.status}): ${text}`);
  }

  const raw = (await response.json()) as number[] | number[][];
  const embedding = Array.isArray(raw[0])
    ? (raw as number[][])[0]!
    : (raw as number[]);

  if (embedding.length !== 512) {
    throw new Error(
      `CLAP embedding dimension mismatch: expected 512, got ${embedding.length}`
    );
  }

  return embedding;
}

export async function embedWithClap(
  input:
    | { kind: "audio"; buffer: Buffer; mimeType: string }
    | { kind: "text"; text: string },
  hfApiKey: string
): Promise<number[]> {
  if (input.kind === "text") {
    const body = JSON.stringify({ inputs: input.text });
    return callHfClap(body, "application/json", hfApiKey);
  }

  return callHfClap(input.buffer.buffer as ArrayBuffer, input.mimeType, hfApiKey);
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return ["unclassified"];
  const normalized = tags
    .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
    .filter(Boolean)
    .slice(0, 5);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ["unclassified"];
}

function extractJsonArray(value: string) {
  const fenced = value.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  const start = value.indexOf("[");
  const end = value.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return value.slice(start, end + 1);
}

async function enrichAudioChunks(
  chunks: AudioChunkDraft[],
  warnings: string[]
): Promise<EnrichedAudioChunk[]> {
  const anthropicApiKey = getAnthropicApiKey();

  if (!anthropicApiKey) {
    warnings.push(
      "ANTHROPIC_API_KEY is not set. Falling back to deterministic audio enrichment."
    );
    return chunks.map((chunk) => ({
      ...chunk,
      emotionalTags: ["unclassified"],
    }));
  }

  // Enrich once per unique source (not per chunk) — audio chunks share a source
  const uniqueSources = Array.from(
    new Map(chunks.map((c) => [c.sourceId, { fileName: c.fileName, sourceType: c.sourceType }]))
  );

  const tagsBySourceId = new Map<string, string[]>();
  const client = new Anthropic({ apiKey: anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1000,
      system:
        "You assign emotional and sonic tags to audio reference files for film scoring. Return only JSON array. Each item: { index: number, tags: string[] } where tags are 2-5 short lowercase emotional/sonic descriptors.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            uniqueSources.map(([sourceId, meta], index) => ({
              index,
              sourceId,
              fileName: meta.fileName,
              sourceType: meta.sourceType,
            }))
          ),
        },
      ],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const json = extractJsonArray(rawText);
    if (!json) throw new Error("No JSON array in Anthropic response");

    const parsed = JSON.parse(json) as Array<{ index?: number; tags?: unknown }>;

    for (let i = 0; i < uniqueSources.length; i++) {
      const [sourceId] = uniqueSources[i]!;
      const item = parsed.find((p) => p.index === i) ?? parsed[i];
      tagsBySourceId.set(sourceId, normalizeTags(item?.tags));
    }
  } catch (error) {
    warnings.push(
      "Anthropic audio enrichment failed. Falling back to deterministic enrichment."
    );
    console.error(error);
    for (const [sourceId] of uniqueSources) {
      tagsBySourceId.set(sourceId, ["unclassified"]);
    }
  }

  return chunks.map((chunk) => ({
    ...chunk,
    emotionalTags: tagsBySourceId.get(chunk.sourceId) ?? ["unclassified"],
  }));
}

async function upsertSonicChunks(
  project: ProjectRecord,
  chunks: EmbeddedAudioChunk[],
  turbopufferApiKey: string
): Promise<void> {
  const tpuf = new Turbopuffer({ apiKey: turbopufferApiKey });
  const namespace = tpuf.namespace(project.sonicNamespaceId);

  await namespace.upsert({
    distance_metric: "cosine_distance",
    schema: SONIC_SCHEMA,
    vectors: chunks.map((chunk) => ({
      id: `${chunk.sourceId}:${chunk.chunkIndex}`,
      vector: chunk.embedding,
      attributes: {
        project_id: project.id,
        source_id: chunk.sourceId,
        source_file: chunk.fileName,
        source_type: chunk.sourceType,
        text: chunk.text,
        emotional_tags: chunk.emotionalTags,
        location_hint: chunk.locationHint,
        blob_url: chunk.blobUrl,
        chunk_index: chunk.chunkIndex,
        upload_ts: Date.parse(chunk.uploadedAt),
        timestamp_ms: chunk.timestampMs,
        duration_ms: chunk.durationMs,
      },
    })),
  });
}

export async function embedSonicSignaturesFromProse(options: {
  project: ProjectRecord;
  sonicSignatures: Array<{
    sourceId: string;
    fileName: string;
    sourceType: SourceType;
    signature: string;
    chunkIndex: number;
    uploadedAt: string;
  }>;
  googleApiKey: string;
  turbopufferApiKey: string;
}): Promise<{ count: number; warnings: string[] }> {
  const { project, sonicSignatures, googleApiKey, turbopufferApiKey } = options;
  const warnings: string[] = [];
  const embedded: EmbeddedAudioChunk[] = [];

  const google = createGoogleGenerativeAI({ apiKey: googleApiKey });

  for (const sig of sonicSignatures) {
    try {
      const { embedding } = await embed({
        model: google.textEmbeddingModel("gemini-embedding-001"),
        value: sig.signature,
      });
      embedded.push({
        sourceId: sig.sourceId,
        fileName: sig.fileName,
        mimeType: "text/plain",
        sourceType: sig.sourceType,
        text: sig.signature,
        chunkIndex: sig.chunkIndex,
        locationHint: `${sig.fileName} · sonic signature · chunk ${sig.chunkIndex + 1}`,
        blobUrl: "",
        timestampMs: 0,
        durationMs: 0,
        uploadedAt: sig.uploadedAt,
        emotionalTags: ["prose-derived"],
        embedding,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      warnings.push(
        `Failed to embed sonic signature for ${sig.fileName} chunk ${sig.chunkIndex}: ${msg}`
      );
    }
  }

  if (embedded.length === 0) {
    return { count: 0, warnings };
  }

  const tpuf = new Turbopuffer({ apiKey: turbopufferApiKey });
  const namespace = tpuf.namespace(project.sonicNamespaceId);

  try {
    await namespace.upsert({
      distance_metric: "cosine_distance",
      schema: SONIC_SCHEMA,
      vectors: embedded.map((chunk) => ({
        // prose_sonic: prefix to avoid collision with real audio chunk IDs
        id: `prose_sonic:${chunk.sourceId}:${chunk.chunkIndex}`,
        vector: chunk.embedding,
        attributes: {
          project_id: project.id,
          source_id: chunk.sourceId,
          source_file: chunk.fileName,
          source_type: chunk.sourceType,
          text: chunk.text,
          emotional_tags: chunk.emotionalTags,
          location_hint: chunk.locationHint,
          blob_url: chunk.blobUrl,
          chunk_index: chunk.chunkIndex,
          upload_ts: Date.parse(chunk.uploadedAt),
          timestamp_ms: chunk.timestampMs,
          duration_ms: chunk.durationMs,
        },
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    warnings.push(`Failed to upsert sonic signatures to turbopuffer: ${msg}`);
    return { count: 0, warnings };
  }

  return { count: embedded.length, warnings };
}

export async function ingestAudioFiles(options: {
  project: ProjectRecord;
  files: File[];
  sourceTypeOverrides: Map<string, string>;
  hfApiKey: string;
  turbopufferApiKey: string;
  blobToken: string;
}): Promise<
  | { kind: "no_supported_files"; warnings: string[] }
  | {
      kind: "all_failed";
      warnings: string[];
      failedFiles: Array<{ fileName: string; errorMessage: string }>;
      failedMetadata: ProjectSourceMetadata[];
    }
  | {
      kind: "success";
      updatedProject: ProjectRecord;
      response: SonicIngestResponse;
    }
> {
  const { project, files, sourceTypeOverrides, hfApiKey, turbopufferApiKey, blobToken } =
    options;

  const warnings: string[] = [];
  const failedFiles: Array<{ fileName: string; errorMessage: string }> = [];
  const failedMetadata: ProjectSourceMetadata[] = [];
  const allChunks: EmbeddedAudioChunk[] = [];
  const successfulSources: Array<{
    sourceId: string;
    fileName: string;
    mimeType: string;
    sourceType: SourceType;
    blobUrl: string;
    uploadedAt: string;
    chunkCount: number;
  }> = [];

  const supportedFiles = files.filter((f) =>
    SUPPORTED_AUDIO_EXTENSIONS.has(getFileExtension(f.name))
  );

  for (const file of files) {
    if (!SUPPORTED_AUDIO_EXTENSIONS.has(getFileExtension(file.name))) {
      warnings.push(`Skipped unsupported file: ${file.name}`);
    }
  }

  if (supportedFiles.length === 0) {
    return { kind: "no_supported_files", warnings };
  }

  for (const file of supportedFiles) {
    const uploadedAt = new Date().toISOString();
    const overrideType = sourceTypeOverrides.get(file.name);
    const sourceType: SourceType =
      overrideType === "voice_memo"
        ? "voice_memo"
        : overrideType === "audio_reference"
          ? "audio_reference"
          : getFileExtension(file.name) === "webm"
            ? "voice_memo"
            : "audio_reference";
    const mimeType = file.type || "audio/octet-stream";

    let blobUrl = "";

    try {
      // 1. Upload to Vercel Blob
      const blob = await put(file.name, file, {
        access: "public",
        token: blobToken,
      });
      blobUrl = blob.url;

      // 2. Read buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      // 3. Segment
      const fileWarnings: string[] = [];
      const segments = segmentAudioFile(buffer, mimeType, file.name, fileWarnings);
      warnings.push(...fileWarnings);

      // Cap at 3 segments per file to stay within maxDuration
      const cappedSegments = segments.slice(0, 3);
      if (segments.length > 3) {
        warnings.push(
          `${file.name}: only first 3 segments embedded to stay within time budget.`
        );
      }

      const sourceId = crypto.randomUUID();

      // 4. Create chunk drafts
      const drafts: AudioChunkDraft[] = cappedSegments.map((seg, i) => ({
        sourceId,
        fileName: file.name,
        mimeType,
        sourceType,
        text: `${sourceType} audio: ${file.name}${cappedSegments.length > 1 ? ` (segment ${i + 1} of ${cappedSegments.length})` : ""}`,
        chunkIndex: i,
        locationHint:
          seg.startMs > 0
            ? `${file.name} · ${formatTimestampMs(seg.startMs)}`
            : `${file.name} · chunk ${i + 1}`,
        blobUrl,
        timestampMs: seg.startMs,
        durationMs: seg.durationMs,
        uploadedAt,
      }));

      // 5. Enrich
      const enriched = await enrichAudioChunks(drafts, warnings);

      // 6. Embed (sequential to avoid HF rate limits)
      const fileEmbedded: EmbeddedAudioChunk[] = [];
      for (let i = 0; i < enriched.length; i++) {
        const chunk = enriched[i]!;
        const seg = cappedSegments[i]!;
        try {
          const embedding = await embedWithClap(
            { kind: "audio", buffer: seg.segmentBuffer, mimeType },
            hfApiKey
          );
          fileEmbedded.push({ ...chunk, embedding });
        } catch (embedError) {
          // Fallback: try embedding the full file if segment failed
          if (i === 0 && cappedSegments.length === 1) throw embedError;
          const msg =
            embedError instanceof Error ? embedError.message : "Unknown error";
          warnings.push(
            `${file.name} segment ${i + 1}: embedding failed (${msg}). Skipping segment.`
          );
        }
      }

      if (fileEmbedded.length === 0) {
        throw new Error("All segments failed CLAP embedding.");
      }

      allChunks.push(...fileEmbedded);
      successfulSources.push({
        sourceId,
        fileName: file.name,
        mimeType,
        sourceType,
        blobUrl,
        uploadedAt,
        chunkCount: fileEmbedded.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown ingestion error";
      failedFiles.push({ fileName: file.name, errorMessage });
      failedMetadata.push({
        sourceId: crypto.randomUUID(),
        fileName: file.name,
        sourceType,
        mimeType,
        uploadedAt,
        chunkCount: 0,
        status: "failed",
        errorMessage,
        blobUrl: blobUrl || undefined,
      });
    }
  }

  if (successfulSources.length === 0) {
    return { kind: "all_failed", warnings, failedFiles, failedMetadata };
  }

  try {
    await upsertSonicChunks(project, allChunks, turbopufferApiKey);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown indexing error";
    for (const source of successfulSources) {
      failedFiles.push({ fileName: source.fileName, errorMessage });
      failedMetadata.push({
        sourceId: source.sourceId,
        fileName: source.fileName,
        sourceType: source.sourceType,
        mimeType: source.mimeType,
        uploadedAt: source.uploadedAt,
        chunkCount: 0,
        status: "failed",
        errorMessage,
        blobUrl: source.blobUrl,
      });
    }
    return { kind: "all_failed", warnings, failedFiles, failedMetadata };
  }

  const successfulMetadata: ProjectSourceMetadata[] = successfulSources.map(
    (source) => ({
      sourceId: source.sourceId,
      fileName: source.fileName,
      sourceType: source.sourceType,
      mimeType: source.mimeType,
      uploadedAt: source.uploadedAt,
      chunkCount: source.chunkCount,
      status: "indexed",
      blobUrl: source.blobUrl,
    })
  );

  const successfulResults: IngestSourceResult[] = successfulSources.map(
    (source) => ({
      sourceId: source.sourceId,
      fileName: source.fileName,
      sourceType: source.sourceType,
      mimeType: source.mimeType,
      status: "indexed",
      chunkCount: source.chunkCount,
    })
  );

  const sonicChunkCountAdded = successfulSources.reduce(
    (sum, s) => sum + s.chunkCount,
    0
  );
  const updatedSources = [
    ...project.sources,
    ...successfulMetadata,
    ...failedMetadata,
  ];

  const updatedProject: ProjectRecord = {
    ...project,
    updatedAt: new Date().toISOString(),
    sourceCount: updatedSources.length,
    sonicChunkCount: project.sonicChunkCount + sonicChunkCountAdded,
    sources: updatedSources,
  };

  const response: SonicIngestResponse = {
    projectId: project.id,
    processedFiles: successfulSources.map((s) => s.fileName),
    failedFiles,
    sonicChunkCountAdded,
    sonicChunkCountTotal: updatedProject.sonicChunkCount,
    sources: [
      ...successfulResults,
      ...failedMetadata.map((item) => ({
        sourceId: item.sourceId,
        fileName: item.fileName,
        sourceType: item.sourceType,
        mimeType: item.mimeType,
        status: "failed" as const,
        chunkCount: 0,
        errorMessage: item.errorMessage,
      })),
    ],
    warnings,
  };

  return { kind: "success", updatedProject, response };
}
