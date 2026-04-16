import Anthropic from "@anthropic-ai/sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, generateText } from "ai";
import { Turbopuffer } from "@turbopuffer/turbopuffer";

import { embedWithClap } from "@/lib/sonic-ingestion";
import type {
  ProjectRecord,
  QueryOrigin,
  RetrievalResponse,
  RetrievedChunk,
  SourceType,
} from "@/lib/project-types";

// ─── Constants ────────────────────────────────────────────────────────────────

const RRF_K = 60;
const TOP_K_PER_QUERY = 20;
const FINAL_TOP_N = 15;
const PROPER_NOUN_REGEX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

// ─── Input type ───────────────────────────────────────────────────────────────

export interface RetrievalInput {
  project: ProjectRecord;
  sceneText: string;
  voiceBuffer?: Buffer;
  voiceMimeType?: string;
  googleApiKey: string;
  turbopufferApiKey: string;
  anthropicApiKey: string | null;
  hfApiKey: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function embedSceneText(
  text: string,
  googleApiKey: string
): Promise<number[]> {
  const google = createGoogleGenerativeAI({ apiKey: googleApiKey });
  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: text,
  });
  return embedding;
}

async function extractSearchTerms(
  text: string,
  anthropicApiKey: string | null
): Promise<string> {
  const regexMatches = Array.from(
    new Set(text.match(PROPER_NOUN_REGEX) ?? [])
  ).slice(0, 10);
  const regexFallback = regexMatches.join(" ");

  if (!anthropicApiKey) return regexFallback;

  try {
    const client = new Anthropic({ apiKey: anthropicApiKey });
    const response = await client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 200,
      system:
        "Extract the most important search terms from the scene description for full-text search. " +
        "Include: character names, location names, object names, and key thematic nouns. " +
        "Return only a space-separated list of terms, no explanation, no punctuation.",
      messages: [{ role: "user", content: text }],
    });
    const terms = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return terms.length > 0 ? terms : regexFallback;
  } catch {
    return regexFallback;
  }
}

async function processVoiceMemo(
  voiceBuffer: Buffer,
  mimeType: string,
  googleApiKey: string,
  hfApiKey: string | null,
  warnings: string[]
): Promise<{ transcript: string; clapEmbedding: number[] | null }> {
  const google = createGoogleGenerativeAI({ apiKey: googleApiKey });

  const [transcriptResult, clapResult] = await Promise.allSettled([
    generateText({
      model: google("gemini-2.0-flash"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: voiceBuffer.buffer as ArrayBuffer,
              mediaType: mimeType as `audio/${string}`,
            },
            {
              type: "text",
              text: "Transcribe this audio verbatim. Return only the transcript, no other text.",
            },
          ],
        },
      ],
    }).then((r) => r.text),

    hfApiKey
      ? embedWithClap({ kind: "audio", buffer: voiceBuffer, mimeType }, hfApiKey)
      : Promise.resolve(null),
  ]);

  const transcript =
    transcriptResult.status === "fulfilled"
      ? transcriptResult.value.trim()
      : (() => {
          const msg =
            transcriptResult.reason instanceof Error
              ? transcriptResult.reason.message
              : "unknown error";
          warnings.push(`Voice memo transcription failed: ${msg}`);
          return "";
        })();

  const clapEmbedding =
    clapResult.status === "fulfilled"
      ? clapResult.value
      : (() => {
          if (hfApiKey) {
            const msg =
              clapResult.reason instanceof Error
                ? clapResult.reason.message
                : "unknown error";
            if (msg.toLowerCase().includes("warming")) {
              warnings.push(
                "CLAP model is warming up; voice audio query skipped."
              );
            } else {
              warnings.push(
                `CLAP audio embedding failed: ${msg}; voice audio query skipped.`
              );
            }
          }
          return null;
        })();

  return { transcript, clapEmbedding };
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeProseResult(
  r: { id: string | number; dist?: number; attributes?: Record<string, unknown> },
  origin: QueryOrigin
): RetrievedChunk {
  const a = r.attributes ?? {};
  return {
    id: String(r.id),
    namespace: "prose",
    queryOrigins: [origin],
    rawDist: typeof r.dist === "number" ? r.dist : undefined,
    rrfScore: 0,
    text: typeof a.text === "string" ? a.text : "",
    sonicSignature:
      typeof a.sonic_signature === "string" && a.sonic_signature.length > 0
        ? a.sonic_signature
        : undefined,
    sourceId: typeof a.source_id === "string" ? a.source_id : "",
    sourceFile: typeof a.source_file === "string" ? a.source_file : "",
    sourceType: (typeof a.source_type === "string"
      ? a.source_type
      : "script") as SourceType,
    locationHint: typeof a.location_hint === "string" ? a.location_hint : "",
    emotionalTags: Array.isArray(a.emotional_tags)
      ? (a.emotional_tags as string[])
      : [],
    timestampMs:
      typeof a.timestamp_ms === "number" ? a.timestamp_ms : undefined,
    pageNum: typeof a.page_num === "number" ? a.page_num : undefined,
  };
}

function normalizeSonicResult(
  r: { id: string | number; dist?: number; attributes?: Record<string, unknown> },
  origin: QueryOrigin
): RetrievedChunk {
  const a = r.attributes ?? {};
  return {
    id: String(r.id),
    namespace: "sonic",
    queryOrigins: [origin],
    rawDist: typeof r.dist === "number" ? r.dist : undefined,
    rrfScore: 0,
    text: typeof a.text === "string" ? a.text : "",
    sourceId: typeof a.source_id === "string" ? a.source_id : "",
    sourceFile: typeof a.source_file === "string" ? a.source_file : "",
    sourceType: (typeof a.source_type === "string"
      ? a.source_type
      : "audio_reference") as SourceType,
    locationHint: typeof a.location_hint === "string" ? a.location_hint : "",
    emotionalTags: Array.isArray(a.emotional_tags)
      ? (a.emotional_tags as string[])
      : [],
    timestampMs:
      typeof a.timestamp_ms === "number" ? a.timestamp_ms : undefined,
    durationMs:
      typeof a.duration_ms === "number" ? a.duration_ms : undefined,
    blobUrl:
      typeof a.blob_url === "string" && a.blob_url.length > 0
        ? a.blob_url
        : undefined,
  };
}

// ─── Turbopuffer query wrappers ───────────────────────────────────────────────

type TpufNs = ReturnType<InstanceType<typeof Turbopuffer>["namespace"]>;

async function queryProseVector(
  ns: TpufNs,
  sceneEmbedding: number[],
  projectId: string
): Promise<RetrievedChunk[]> {
  const results = await ns.query({
    vector: sceneEmbedding,
    distance_metric: "cosine_distance",
    top_k: TOP_K_PER_QUERY,
    include_attributes: true,
    filters: ["project_id", "Eq", projectId],
  });
  return results.map((r) => normalizeProseResult(r, "prose_vector"));
}

async function queryProseBM25(
  ns: TpufNs,
  searchTerms: string,
  projectId: string
): Promise<RetrievedChunk[]> {
  if (searchTerms.trim().length === 0) return [];
  const results = await ns.query({
    rank_by: ["text", "BM25", searchTerms],
    top_k: TOP_K_PER_QUERY,
    include_attributes: [
      "source_id",
      "source_file",
      "source_type",
      "text",
      "sonic_signature",
      "emotional_tags",
      "location_hint",
      "chunk_index",
      "timestamp_ms",
      "page_num",
    ],
    filters: ["project_id", "Eq", projectId],
  });
  return results.map((r) => normalizeProseResult(r, "prose_bm25"));
}

async function queryProseDirectorNotes(
  ns: TpufNs,
  sceneEmbedding: number[],
  projectId: string
): Promise<RetrievedChunk[]> {
  const results = await ns.query({
    vector: sceneEmbedding,
    distance_metric: "cosine_distance",
    top_k: TOP_K_PER_QUERY,
    include_attributes: true,
    filters: [
      "And",
      [
        ["project_id", "Eq", projectId],
        ["source_type", "Eq", "director_notes"],
      ],
    ],
  });
  return results.map((r) => normalizeProseResult(r, "prose_director"));
}

async function querySonicText(
  ns: TpufNs,
  clapTextEmbedding: number[],
  projectId: string
): Promise<RetrievedChunk[]> {
  const results = await ns.query({
    vector: clapTextEmbedding,
    distance_metric: "cosine_distance",
    top_k: TOP_K_PER_QUERY,
    include_attributes: true,
    filters: ["project_id", "Eq", projectId],
  });
  return results.map((r) => normalizeSonicResult(r, "sonic_text"));
}

async function querySonicAudio(
  ns: TpufNs,
  clapAudioEmbedding: number[],
  projectId: string
): Promise<RetrievedChunk[]> {
  const results = await ns.query({
    vector: clapAudioEmbedding,
    distance_metric: "cosine_distance",
    top_k: TOP_K_PER_QUERY,
    include_attributes: true,
    filters: ["project_id", "Eq", projectId],
  });
  return results.map((r) => normalizeSonicResult(r, "sonic_audio"));
}

// ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────

function reciprocalRankFusion(
  rankedLists: RetrievedChunk[][]
): RetrievedChunk[] {
  const scoreMap = new Map<
    string,
    { chunk: RetrievedChunk; score: number; origins: Set<QueryOrigin> }
  >();

  for (const list of rankedLists) {
    list.forEach((chunk, rankIndex) => {
      const contribution = 1 / (RRF_K + rankIndex + 1);
      const existing = scoreMap.get(chunk.id);
      if (existing) {
        existing.score += contribution;
        for (const o of chunk.queryOrigins) existing.origins.add(o);
      } else {
        scoreMap.set(chunk.id, {
          chunk,
          score: contribution,
          origins: new Set(chunk.queryOrigins),
        });
      }
    });
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, FINAL_TOP_N)
    .map(({ chunk, score, origins }) => ({
      ...chunk,
      rrfScore: score,
      queryOrigins: Array.from(origins),
    }));
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function retrieveForScene(
  input: RetrievalInput
): Promise<RetrievalResponse> {
  const {
    project,
    sceneText,
    voiceBuffer,
    voiceMimeType,
    googleApiKey,
    turbopufferApiKey,
    anthropicApiKey,
    hfApiKey,
  } = input;

  const warnings: string[] = [];

  // ── Step 1: Preparation group (parallel, all needed before queries) ─────────
  const [sceneEmbedding, voiceMemoResult, searchTerms] = await Promise.all([
    embedSceneText(sceneText, googleApiKey), // throws on failure
    voiceBuffer && voiceMimeType
      ? processVoiceMemo(
          voiceBuffer,
          voiceMimeType,
          googleApiKey,
          hfApiKey,
          warnings
        )
      : Promise.resolve({ transcript: "", clapEmbedding: null as null }),
    extractSearchTerms(sceneText, anthropicApiKey), // never throws
  ]);

  const { transcript, clapEmbedding: clapAudioEmbedding } = voiceMemoResult;

  // ── Step 2: Sonic text embedding reuses sceneEmbedding (Gemini) ─────────────
  // Sonic namespace is cross-populated with Gemini embeddings from prose ingestion,
  // so we query it with the same Gemini sceneEmbedding — no separate CLAP step needed.

  // ── Step 3: Five parallel queries ───────────────────────────────────────────
  const tpuf = new Turbopuffer({ apiKey: turbopufferApiKey });
  const proseNs = tpuf.namespace(project.proseNamespaceId);
  const sonicNs = tpuf.namespace(project.sonicNamespaceId);

  const queryTasks: Array<{
    origin: QueryOrigin;
    promise: Promise<RetrievedChunk[]>;
  }> = [
    { origin: "prose_vector", promise: queryProseVector(proseNs, sceneEmbedding, project.id) },
    { origin: "prose_bm25", promise: queryProseBM25(proseNs, searchTerms, project.id) },
    { origin: "prose_director", promise: queryProseDirectorNotes(proseNs, sceneEmbedding, project.id) },
    // Sonic namespace is cross-populated with Gemini embeddings — query with same sceneEmbedding
    { origin: "sonic_text", promise: querySonicText(sonicNs, sceneEmbedding, project.id) },
    ...(clapAudioEmbedding
      ? [{ origin: "sonic_audio" as const, promise: querySonicAudio(sonicNs, clapAudioEmbedding, project.id) }]
      : []),
  ];

  const settled = await Promise.allSettled(queryTasks.map((t) => t.promise));

  const rankedLists: RetrievedChunk[][] = [];
  const queriesExecuted: QueryOrigin[] = [];

  settled.forEach((result, i) => {
    const origin = queryTasks[i]!.origin;
    if (result.status === "fulfilled") {
      queriesExecuted.push(origin); // record all executed queries, even zero-hit ones
      rankedLists.push(result.value);
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : "unknown error";
      warnings.push(`Query "${origin}" failed: ${msg}`);
      rankedLists.push([]);
    }
  });

  // ── Step 4: Fuse and return ──────────────────────────────────────────────────
  const chunks = reciprocalRankFusion(rankedLists);

  return {
    projectId: project.id,
    sceneText,
    voiceTranscript: transcript.length > 0 ? transcript : undefined,
    chunks,
    queriesExecuted,
    warnings,
    synthesis: null,
  };
}
