export type SourceType =
  | "script"
  | "director_notes"
  | "subtitle"
  | "moodboard"
  | "audio_reference"
  | "voice_memo";

export type SourceStatus = "indexed" | "failed";

export interface ProjectSourceMetadata {
  sourceId: string;
  fileName: string;
  sourceType: SourceType;
  mimeType: string;
  uploadedAt: string;
  chunkCount: number;
  status: SourceStatus;
  errorMessage?: string;
  blobUrl?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  proseNamespaceId: string;
  sonicNamespaceId: string;
  sourceCount: number;
  proseChunkCount: number;
  sonicChunkCount: number;
  sources: ProjectSourceMetadata[];
}

export interface ProjectCreateResponse {
  id: string;
  name: string;
  createdAt: string;
  proseNamespaceId: string;
  sonicNamespaceId: string;
}

export interface IngestSourceResult {
  sourceId: string;
  fileName: string;
  sourceType: SourceType;
  mimeType: string;
  status: SourceStatus;
  chunkCount: number;
  errorMessage?: string;
}

export interface IngestResponse {
  projectId: string;
  processedFiles: string[];
  failedFiles: Array<{ fileName: string; errorMessage: string }>;
  proseChunkCountAdded: number;
  proseChunkCountTotal: number;
  sources: IngestSourceResult[];
  warnings: string[];
}

export interface SonicIngestResponse {
  projectId: string;
  processedFiles: string[];
  failedFiles: Array<{ fileName: string; errorMessage: string }>;
  sonicChunkCountAdded: number;
  sonicChunkCountTotal: number;
  sources: IngestSourceResult[];
  warnings: string[];
}

export type QueryOrigin =
  | "prose_vector"
  | "prose_bm25"
  | "prose_director"
  | "sonic_text"
  | "sonic_audio";

export interface RetrievedChunk {
  id: string;
  namespace: "prose" | "sonic";
  queryOrigin: QueryOrigin;
  rawDist?: number;
  rrfScore: number;
  text: string;
  sonicSignature?: string;
  sourceId: string;
  sourceFile: string;
  sourceType: SourceType;
  locationHint: string;
  emotionalTags: string[];
  timestampMs?: number;
  pageNum?: number;
  durationMs?: number;
  blobUrl?: string;
}

export interface RetrievalResponse {
  projectId: string;
  sceneText: string;
  voiceTranscript?: string;
  chunks: RetrievedChunk[];
  queriesExecuted: QueryOrigin[];
  warnings: string[];
  synthesis: null;
}
