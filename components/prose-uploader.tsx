"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type UploadStage =
  | "idle"
  | "uploading"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexing"
  | "done"
  | "failed";

type IngestResponse = {
  projectId: string;
  processedFiles: string[];
  failedFiles: Array<{ fileName: string; errorMessage: string }>;
  proseChunkCountAdded: number;
  proseChunkCountTotal: number;
  sources: Array<{
    sourceId: string;
    fileName: string;
    sourceType: string;
    mimeType: string;
    status: "indexed" | "failed";
    chunkCount: number;
    errorMessage?: string;
  }>;
  warnings: string[];
};

const uploadStages: UploadStage[] = [
  "uploading",
  "parsing",
  "chunking",
  "embedding",
  "indexing",
];

function acceptedFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "pdf" || extension === "txt" || extension === "md" || extension === "srt";
}

function stageLabel(stage: UploadStage) {
  switch (stage) {
    case "uploading":
      return "Uploading files";
    case "parsing":
      return "Parsing prose sources";
    case "chunking":
      return "Chunking extracted text";
    case "embedding":
      return "Generating Gemini embeddings";
    case "indexing":
      return "Indexing project corpus";
    case "done":
      return "Ingestion complete";
    case "failed":
      return "Ingestion failed";
    default:
      return "Ready for upload";
  }
}

export function ProseUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const selectedSummary = useMemo(
    () => selectedFiles.map((file) => `${file.name} · ${(file.size / 1024).toFixed(1)} KB`),
    [selectedFiles]
  );

  function replaceFiles(files: File[]) {
    const valid = files.filter(acceptedFile);
    setSelectedFiles(valid);
    setWarnings(
      files.length === valid.length
        ? []
        : ["Some unsupported files were ignored. Supported types: PDF, TXT, MD, SRT."]
    );
    setResult(null);
    setErrorMessage(null);
  }

  function startStageProgress() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = uploadStages.map((nextStage, index) =>
      window.setTimeout(() => setStage(nextStage), index * 550)
    );
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) {
      setErrorMessage("Select at least one supported prose file.");
      return;
    }

    setErrorMessage(null);
    setResult(null);
    startStageProgress();

    const formData = new FormData();
    formData.append("projectId", projectId);

    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | IngestResponse
        | { error?: string; message?: string; warnings?: string[] };

      timersRef.current.forEach((timer) => window.clearTimeout(timer));

      if (!response.ok || !("projectId" in payload)) {
        setStage("failed");
        const warnings = "warnings" in payload ? payload.warnings : undefined;
        const message = "message" in payload ? payload.message : undefined;
        setWarnings(Array.isArray(warnings) ? warnings : []);
        setErrorMessage(message ?? "Failed to ingest files.");
        return;
      }

      setStage("done");
      setWarnings(payload.warnings);
      setResult(payload);
      router.refresh();
    } catch (error) {
      console.error(error);
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      setStage("failed");
      setErrorMessage("Failed to ingest files.");
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/10 backdrop-blur">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
          Corpus uploader
        </p>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-stone-100">
          Upload prose sources
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-stone-300/80">
          Phase 1 supports PDF, TXT, Markdown, and SRT files. Uploads are parsed,
          chunked, enriched, embedded, and indexed into the project prose namespace.
        </p>
      </div>

      <label
        className={`mt-6 flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed px-6 py-8 text-center transition ${
          isDragging
            ? "border-emerald-300/80 bg-emerald-300/8"
            : "border-white/15 bg-white/4 hover:border-white/25 hover:bg-white/6"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          replaceFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          type="file"
          className="hidden"
          accept=".pdf,.txt,.md,.srt,application/pdf,text/plain,text/markdown"
          multiple
          onChange={(event) =>
            replaceFiles(Array.from(event.target.files ?? []))
          }
        />
        <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.28em] text-stone-300/75">
          Drag and drop or browse
        </span>
        <p className="mt-5 text-lg font-medium text-stone-100">
          Build your first project corpus
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300/75">
          Scripts, director notes, moodboard markdown, and subtitle references all
          land in the prose index during this phase.
        </p>
      </label>

      {selectedSummary.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {selectedSummary.map((summary) => (
            <li
              key={summary}
              className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-stone-200/85"
            >
              {summary}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-stone-200/80">
          <span className="font-medium text-stone-100">{stageLabel(stage)}</span>
        </div>
        <button
          type="button"
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || uploadStages.includes(stage)}
          className="rounded-full bg-stone-100 px-6 py-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploadStages.includes(stage) ? "Indexing..." : "Upload and index"}
        </button>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-medium text-stone-100">
            Added {result.proseChunkCountAdded} prose chunks. Corpus total:{" "}
            {result.proseChunkCountTotal}.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-stone-200/80">
              Processed files: {result.processedFiles.length}
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-stone-200/80">
              Failed files: {result.failedFiles.length}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
