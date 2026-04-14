import Anthropic from "@anthropic-ai/sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import { PDFParse } from "pdf-parse";
import subtitlesParser from "subtitles-parser";
import { Turbopuffer } from "@turbopuffer/turbopuffer";

import type {
  IngestResponse,
  IngestSourceResult,
  ProjectRecord,
  ProjectSourceMetadata,
  SourceType,
} from "@/lib/project-types";
import { getAnthropicApiKey, getHuggingFaceApiKey } from "@/lib/server-env";
import { embedSonicSignaturesFromProse } from "@/lib/sonic-ingestion";

const PROSE_SCHEMA = {
  project_id: {
    type: "string",
    filterable: true,
  },
  source_id: {
    type: "string",
    filterable: true,
  },
  source_file: {
    type: "string",
    filterable: true,
  },
  source_type: {
    type: "string",
    filterable: true,
  },
  text: {
    type: "string",
    full_text_search: true,
  },
  emotional_tags: {
    type: "[]string",
    filterable: true,
  },
  sonic_signature: {
    type: "string",
    full_text_search: true,
  },
  location_hint: {
    type: "string",
  },
  chunk_index: {
    type: "int",
    filterable: true,
  },
  upload_ts: {
    type: "int",
    filterable: true,
  },
  timestamp_ms: {
    type: "int",
    filterable: true,
  },
  page_num: {
    type: "int",
    filterable: true,
  },
} as const;

const SUPPORTED_EXTENSIONS = new Set(["pdf", "txt", "md", "srt"]);

type ParsedSubtitleCue = {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
};

type ParsedSource =
  | {
      kind: "text";
      text: string;
      sourceType: SourceType;
      fileName: string;
      mimeType: string;
    }
  | {
      kind: "subtitle";
      cues: ParsedSubtitleCue[];
      sourceType: SourceType;
      fileName: string;
      mimeType: string;
    };

type ChunkDraft = {
  sourceId: string;
  fileName: string;
  mimeType: string;
  sourceType: SourceType;
  text: string;
  chunkIndex: number;
  locationHint: string;
  pageNum?: number;
  timestampMs?: number;
  uploadedAt: string;
};

type EnrichedChunk = ChunkDraft & {
  emotionalTags: string[];
  sonicSignature: string;
};

type SuccessfulSource = {
  sourceId: string;
  fileName: string;
  mimeType: string;
  sourceType: SourceType;
  uploadedAt: string;
  chunks: ChunkDraft[];
};

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "";
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, "").replace(/\t/g, " ").trim();
}

function normalizeTextBlock(value: string) {
  return normalizeWhitespace(value)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ");
}

function sentenceExcerpt(text: string) {
  const normalized = normalizeTextBlock(text);
  const match = normalized.match(/[^.!?\n]+[.!?]?/);

  if (!match) {
    return normalized.slice(0, 180).trim() || "No concise sonic signature available.";
  }

  return match[0].trim().slice(0, 180);
}

function fallbackEnrichment(text: string) {
  return {
    emotionalTags: ["unclassified"],
    sonicSignature: sentenceExcerpt(text),
  };
}

function formatTimestampMs(timestampMs: number) {
  const totalSeconds = Math.floor(timestampMs / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function buildLocationHint(options: {
  fileName: string;
  chunkIndex: number;
  pageNum?: number;
  timestampMs?: number;
}) {
  if (typeof options.pageNum === "number") {
    return `${options.fileName} · page ${options.pageNum}`;
  }

  if (typeof options.timestampMs === "number") {
    return `${options.fileName} · ${formatTimestampMs(options.timestampMs)}`;
  }

  return `${options.fileName} · chunk ${options.chunkIndex + 1}`;
}

function splitOversizedParagraph(paragraph: string, maxChars: number) {
  if (paragraph.length <= maxChars) {
    return [paragraph];
  }

  const parts: string[] = [];
  let remaining = paragraph;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(" ", maxChars);

    if (splitAt < Math.floor(maxChars * 0.6)) {
      splitAt = maxChars;
    }

    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

function paragraphBlocks(text: string, maxChars: number) {
  return normalizeTextBlock(text)
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitOversizedParagraph(paragraph.trim(), maxChars))
    .filter(Boolean);
}

function chunkBlocks(
  blocks: string[],
  maxChars: number,
  overlapChars: number
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < blocks.length) {
    let end = start;
    let currentLength = 0;

    while (end < blocks.length) {
      const block = blocks[end];
      const separatorLength = currentLength === 0 ? 0 : 2;

      if (currentLength > 0 && currentLength + separatorLength + block.length > maxChars) {
        break;
      }

      currentLength += separatorLength + block.length;
      end += 1;
    }

    if (end === start) {
      end = start + 1;
    }

    chunks.push(blocks.slice(start, end).join("\n\n"));

    if (end >= blocks.length) {
      break;
    }

    let nextStart = end;
    let overlapLength = 0;

    while (nextStart > start + 1 && overlapLength < overlapChars) {
      nextStart -= 1;
      overlapLength += blocks[nextStart].length;
    }

    start = nextStart;
  }

  return chunks;
}

function splitMarkdownSections(text: string) {
  const normalized = normalizeTextBlock(text);
  const matches = [...normalized.matchAll(/^#{1,6}\s.*$/gm)];

  if (matches.length === 0) {
    return [normalized];
  }

  const sections: string[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index]?.index ?? 0;
    const end =
      index + 1 < matches.length
        ? (matches[index + 1]?.index ?? normalized.length)
        : normalized.length;
    const section = normalized.slice(start, end).trim();

    if (section.length > 0) {
      sections.push(section);
    }
  }

  return sections;
}

function chunkPlainText(text: string, maxChars = 1600, overlapChars = 160) {
  return chunkBlocks(paragraphBlocks(text, maxChars), maxChars, overlapChars);
}

function chunkMarkdownText(text: string, maxChars = 1600, overlapChars = 160) {
  const sections = splitMarkdownSections(text);
  return sections.flatMap((section) => chunkPlainText(section, maxChars, overlapChars));
}

function chunkSubtitleCues(cues: ParsedSubtitleCue[], maxChars = 1600) {
  const chunks: Array<{ text: string; timestampMs: number }> = [];
  let start = 0;

  while (start < cues.length) {
    let end = start;
    let currentLength = 0;

    while (end < cues.length) {
      const cueText = normalizeTextBlock(cues[end]?.text ?? "");
      const separatorLength = currentLength === 0 ? 0 : 1;

      if (currentLength > 0 && currentLength + separatorLength + cueText.length > maxChars) {
        break;
      }

      currentLength += separatorLength + cueText.length;
      end += 1;
    }

    if (end === start) {
      end = start + 1;
    }

    const window = cues.slice(start, end);
    const text = window.map((cue) => normalizeTextBlock(cue.text)).join("\n");
    const timestampMs = window[0]?.startTime ?? 0;

    chunks.push({ text, timestampMs });

    if (end >= cues.length) {
      break;
    }

    start = Math.max(start + 1, end - 1);
  }

  return chunks;
}

function isSupportedFile(file: File) {
  const extension = getFileExtension(file.name);
  return SUPPORTED_EXTENSIONS.has(extension);
}

function detectSourceType(
  fileName: string,
  mimeType: string,
  manualOverride?: string | null
): SourceType {
  if (
    manualOverride === "script" ||
    manualOverride === "director_notes" ||
    manualOverride === "subtitle" ||
    manualOverride === "moodboard"
  ) {
    return manualOverride;
  }

  const extension = getFileExtension(fileName);
  const lowerName = fileName.toLowerCase();

  if (extension === "srt") {
    return "subtitle";
  }

  if (
    extension === "md" &&
    (lowerName.includes("note") || lowerName.includes("director"))
  ) {
    return "director_notes";
  }

  if (extension === "pdf" || extension === "txt" || mimeType === "text/plain") {
    return "script";
  }

  return "moodboard";
}

async function parsePdf(file: File) {
  const parser = new PDFParse({
    data: Buffer.from(await file.arrayBuffer()),
  });

  try {
    const result = await parser.getText();
    return normalizeTextBlock(result.text);
  } finally {
    await parser.destroy();
  }
}

async function parseSource(
  file: File,
  manualSourceType?: string | null
): Promise<ParsedSource> {
  const mimeType = file.type || "application/octet-stream";
  const sourceType = detectSourceType(file.name, mimeType, manualSourceType);
  const extension = getFileExtension(file.name);

  if (extension === "pdf" || mimeType === "application/pdf") {
    return {
      kind: "text",
      text: await parsePdf(file),
      sourceType,
      fileName: file.name,
      mimeType,
    };
  }

  const text = await file.text();

  if (extension === "srt") {
    const cues = (subtitlesParser.fromSrt(text, true) as ParsedSubtitleCue[])
      .map((cue) => ({
        ...cue,
        text: normalizeTextBlock(cue.text),
      }))
      .filter((cue) => cue.text.length > 0);

    return {
      kind: "subtitle",
      cues,
      sourceType,
      fileName: file.name,
      mimeType,
    };
  }

  return {
    kind: "text",
    text: normalizeTextBlock(text),
    sourceType,
    fileName: file.name,
    mimeType,
  };
}

function createChunkDrafts(parsed: ParsedSource, uploadedAt: string): ChunkDraft[] {
  const sourceId = crypto.randomUUID();

  if (parsed.kind === "subtitle") {
    return chunkSubtitleCues(parsed.cues).map((chunk, chunkIndex) => ({
      sourceId,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      sourceType: parsed.sourceType,
      text: chunk.text,
      chunkIndex,
      timestampMs: chunk.timestampMs,
      locationHint: buildLocationHint({
        fileName: parsed.fileName,
        chunkIndex,
        timestampMs: chunk.timestampMs,
      }),
      uploadedAt,
    }));
  }

  const extension = getFileExtension(parsed.fileName);
  const chunks =
    extension === "md" ? chunkMarkdownText(parsed.text) : chunkPlainText(parsed.text);

  return chunks
    .filter((chunk) => chunk.length > 0)
    .map((chunk, chunkIndex) => ({
      sourceId,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      sourceType: parsed.sourceType,
      text: chunk,
      chunkIndex,
      locationHint: buildLocationHint({
        fileName: parsed.fileName,
        chunkIndex,
      }),
      uploadedAt,
    }));
}

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return ["unclassified"];
  }

  const normalized = tags
    .map((tag) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
    .filter(Boolean)
    .slice(0, 5);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : ["unclassified"];
}

function extractJsonArray(value: string) {
  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1];
  }

  const arrayStart = value.indexOf("[");
  const arrayEnd = value.lastIndexOf("]");

  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    return null;
  }

  return value.slice(arrayStart, arrayEnd + 1);
}

async function enrichChunks(chunks: ChunkDraft[], warnings: string[]) {
  const anthropicApiKey = getAnthropicApiKey();

  if (!anthropicApiKey) {
    warnings.push(
      "ANTHROPIC_API_KEY is not set. Falling back to deterministic chunk enrichment."
    );
    return chunks.map((chunk) => ({
      ...chunk,
      ...fallbackEnrichment(chunk.text),
    }));
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const enriched: EnrichedChunk[] = [];

  for (let start = 0; start < chunks.length; start += 20) {
    const batch = chunks.slice(start, start + 20);

    try {
      const response = await client.messages.create({
        model: "claude-3-5-haiku-latest",
        max_tokens: 2000,
        system:
          "You enrich screenplay and reference text chunks. Return only JSON. Each item must contain emotional_tags as 2-5 short lowercase tags and sonic_signature as one concise sentence.",
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              batch.map((chunk, index) => ({
                index,
                text: chunk.text,
              }))
            ),
          },
        ],
      });

      const rawText = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      const json = extractJsonArray(rawText);

      if (!json) {
        throw new Error("No JSON array found in Anthropic response");
      }

      const parsed = JSON.parse(json) as Array<{
        emotional_tags?: unknown;
        sonic_signature?: unknown;
      }>;

      if (!Array.isArray(parsed) || parsed.length !== batch.length) {
        throw new Error("Anthropic enrichment payload length mismatch");
      }

      enriched.push(
        ...batch.map((chunk, index) => ({
          ...chunk,
          emotionalTags: normalizeTags(parsed[index]?.emotional_tags),
          sonicSignature:
            typeof parsed[index]?.sonic_signature === "string" &&
            parsed[index]?.sonic_signature.trim().length > 0
              ? parsed[index].sonic_signature.trim()
              : sentenceExcerpt(chunk.text),
        }))
      );
    } catch (error) {
      warnings.push(
        `Anthropic enrichment failed for chunk batch ${start / 20 + 1}. Falling back to deterministic enrichment.`
      );

      enriched.push(
        ...batch.map((chunk) => ({
          ...chunk,
          ...fallbackEnrichment(chunk.text),
        }))
      );

      console.error(error);
    }
  }

  return enriched;
}

async function embedChunks(chunks: EnrichedChunk[], googleApiKey: string) {
  const google = createGoogleGenerativeAI({ apiKey: googleApiKey });
  const values = chunks.map((chunk) => chunk.text);

  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    values,
  });

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index] ?? [],
  }));
}

async function upsertChunks(
  project: ProjectRecord,
  chunks: Array<EnrichedChunk & { embedding: number[] }>,
  turbopufferApiKey: string
) {
  const tpuf = new Turbopuffer({ apiKey: turbopufferApiKey });
  const namespace = tpuf.namespace(project.proseNamespaceId);

  await namespace.upsert({
    distance_metric: "cosine_distance",
    schema: PROSE_SCHEMA,
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
        sonic_signature: chunk.sonicSignature,
        location_hint: chunk.locationHint,
        chunk_index: chunk.chunkIndex,
        upload_ts: Date.parse(chunk.uploadedAt),
        ...(typeof chunk.timestampMs === "number"
          ? { timestamp_ms: chunk.timestampMs }
          : {}),
        ...(typeof chunk.pageNum === "number" ? { page_num: chunk.pageNum } : {}),
      },
    })),
  });
}

function sourceMetadataFromSuccess(source: SuccessfulSource): ProjectSourceMetadata {
  return {
    sourceId: source.sourceId,
    fileName: source.fileName,
    sourceType: source.sourceType,
    mimeType: source.mimeType,
    uploadedAt: source.uploadedAt,
    chunkCount: source.chunks.length,
    status: "indexed",
  };
}

function sourceResultFromSuccess(source: SuccessfulSource): IngestSourceResult {
  return {
    sourceId: source.sourceId,
    fileName: source.fileName,
    sourceType: source.sourceType,
    mimeType: source.mimeType,
    status: "indexed",
    chunkCount: source.chunks.length,
  };
}

function sourceMetadataFromFailure(
  fileName: string,
  mimeType: string,
  sourceType: SourceType,
  uploadedAt: string,
  errorMessage: string
): ProjectSourceMetadata {
  return {
    sourceId: crypto.randomUUID(),
    fileName,
    sourceType,
    mimeType,
    uploadedAt,
    chunkCount: 0,
    status: "failed",
    errorMessage,
  };
}

export function readSourceTypeOverrides(formData: FormData) {
  const overrides = new Map<string, string>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("sourceTypeByFile:") || typeof value !== "string") {
      continue;
    }

    overrides.set(key.slice("sourceTypeByFile:".length), value);
  }

  return overrides;
}

export function collectSupportedFiles(
  files: File[],
  sourceTypeOverrides: Map<string, string>
) {
  const supported: Array<{ file: File; manualSourceType?: string | null }> = [];
  const warnings: string[] = [];

  for (const file of files) {
    if (!isSupportedFile(file)) {
      warnings.push(`Skipped unsupported file: ${file.name}`);
      continue;
    }

    supported.push({
      file,
      manualSourceType: sourceTypeOverrides.get(file.name) ?? null,
    });
  }

  return { supported, warnings };
}

export async function ingestProseFiles(options: {
  project: ProjectRecord;
  files: File[];
  sourceTypeOverrides: Map<string, string>;
  googleApiKey: string;
  turbopufferApiKey: string;
}) {
  const { project, files, sourceTypeOverrides, googleApiKey, turbopufferApiKey } =
    options;

  const warnings: string[] = [];
  const failedFiles: Array<{ fileName: string; errorMessage: string }> = [];
  const failedMetadata: ProjectSourceMetadata[] = [];
  const successfulSources: SuccessfulSource[] = [];

  const { supported, warnings: fileWarnings } = collectSupportedFiles(
    files,
    sourceTypeOverrides
  );
  warnings.push(...fileWarnings);

  if (supported.length === 0) {
    return {
      kind: "no_supported_files" as const,
      warnings,
    };
  }

  for (const entry of supported) {
    const uploadedAt = new Date().toISOString();
    const fallbackSourceType = detectSourceType(
      entry.file.name,
      entry.file.type,
      entry.manualSourceType
    );

    try {
      const parsed = await parseSource(entry.file, entry.manualSourceType);
      const chunks = createChunkDrafts(parsed, uploadedAt);

      if (chunks.length === 0) {
        throw new Error("No indexable text was found in the uploaded file.");
      }

      successfulSources.push({
        sourceId: chunks[0]!.sourceId,
        fileName: entry.file.name,
        mimeType: entry.file.type || "application/octet-stream",
        sourceType: parsed.sourceType,
        uploadedAt,
        chunks,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown parsing error";

      failedFiles.push({
        fileName: entry.file.name,
        errorMessage,
      });
      failedMetadata.push(
        sourceMetadataFromFailure(
          entry.file.name,
          entry.file.type || "application/octet-stream",
          fallbackSourceType,
          uploadedAt,
          errorMessage
        )
      );
    }
  }

  if (successfulSources.length === 0) {
    return {
      kind: "all_failed" as const,
      warnings,
      failedFiles,
      failedMetadata,
    };
  }

  const chunkDrafts = successfulSources.flatMap((source) => source.chunks);
  const enriched = await enrichChunks(chunkDrafts, warnings);
  const embedded = await embedChunks(enriched, googleApiKey);

  try {
    await upsertChunks(project, embedded, turbopufferApiKey);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown indexing error";

    for (const source of successfulSources) {
      failedFiles.push({
        fileName: source.fileName,
        errorMessage,
      });
      failedMetadata.push(
        sourceMetadataFromFailure(
          source.fileName,
          source.mimeType,
          source.sourceType,
          source.uploadedAt,
          errorMessage
        )
      );
    }

    return {
      kind: "all_failed" as const,
      warnings,
      failedFiles,
      failedMetadata,
    };
  }

  const successfulMetadata = successfulSources.map(sourceMetadataFromSuccess);
  const successfulResults = successfulSources.map(sourceResultFromSuccess);
  const updatedSources = [...project.sources, ...successfulMetadata, ...failedMetadata];
  const proseChunkCountAdded = successfulSources.reduce(
    (sum, source) => sum + source.chunks.length,
    0
  );

  const updatedProject: ProjectRecord = {
    ...project,
    updatedAt: new Date().toISOString(),
    sourceCount: updatedSources.length,
    proseChunkCount: project.proseChunkCount + proseChunkCountAdded,
    sources: updatedSources,
  };

  const response: IngestResponse = {
    projectId: project.id,
    processedFiles: successfulSources.map((source) => source.fileName),
    failedFiles,
    proseChunkCountAdded,
    proseChunkCountTotal: updatedProject.proseChunkCount,
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

  // Cross-populate sonic namespace with CLAP-embedded sonic signatures from prose
  const hfApiKey = getHuggingFaceApiKey();
  if (hfApiKey) {
    const signatures = enriched.map((chunk) => ({
      sourceId: chunk.sourceId,
      fileName: chunk.fileName,
      sourceType: chunk.sourceType,
      signature: chunk.sonicSignature,
      chunkIndex: chunk.chunkIndex,
      uploadedAt: chunk.uploadedAt,
    }));
    const crossResult = await embedSonicSignaturesFromProse({
      project,
      sonicSignatures: signatures,
      hfApiKey,
      turbopufferApiKey,
    });
    warnings.push(
      ...crossResult.warnings.map((w) => `[sonic cross-pop] ${w}`)
    );
  }

  return {
    kind: "success" as const,
    updatedProject,
    response,
  };
}
