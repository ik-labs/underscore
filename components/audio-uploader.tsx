"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type AudioUploadStage =
  | "idle"
  | "uploading"
  | "segmenting"
  | "embedding"
  | "indexing"
  | "done"
  | "failed";

type SonicIngestResult = {
  projectId: string;
  processedFiles: string[];
  failedFiles: Array<{ fileName: string; errorMessage: string }>;
  sonicChunkCountAdded: number;
  sonicChunkCountTotal: number;
  warnings: string[];
};

const STAGE_LABELS: Record<AudioUploadStage, string> = {
  idle: "Select audio files",
  uploading: "Uploading audio files…",
  segmenting: "Segmenting audio into chunks…",
  embedding: "Generating CLAP embeddings…",
  indexing: "Indexing sonic corpus…",
  done: "Sonic ingestion complete",
  failed: "Ingestion failed",
};

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function acceptedFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ["wav", "mp3", "m4a"].includes(ext);
}

export function AudioUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<AudioUploadStage>("idle");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<SonicIngestResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleFiles(files: File[]) {
    const valid = files.filter(acceptedFile);
    if (valid.length === 0) {
      setError("Please select WAV, MP3, or M4A audio files.");
      return;
    }
    setSelectedFiles(valid);
    setError(null);
    setWarnings([]);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
  }

  async function onUpload() {
    if (selectedFiles.length === 0) return;

    const largeFiles = selectedFiles.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    const extraWarnings: string[] = largeFiles.map(
      (f) =>
        `${f.name} is larger than ${MAX_FILE_SIZE_MB} MB and will be truncated.`
    );

    setError(null);
    setWarnings(extraWarnings);
    setStage("uploading");

    const formData = new FormData();
    formData.append("projectId", projectId);
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    // Simulate stage progression while waiting
    timerRef.current = setTimeout(() => setStage("segmenting"), 1200);
    timerRef.current = setTimeout(() => setStage("embedding"), 3500);

    try {
      const response = await fetch("/api/ingest-audio", {
        method: "POST",
        body: formData,
      });

      clearTimer();

      setStage("indexing");

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Ingestion failed.");
        setWarnings((prev) => [...prev, ...(data.warnings ?? [])]);
        setStage("failed");
        return;
      }

      if (data.warnings?.length) {
        setWarnings((prev) => [...prev, ...data.warnings]);
      }

      setResult(data as SonicIngestResult);
      setStage("done");
      router.refresh();
    } catch (err) {
      clearTimer();
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setStage("failed");
    }
  }

  function onReset() {
    clearTimer();
    setStage("idle");
    setSelectedFiles([]);
    setError(null);
    setWarnings([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const isProcessing =
    stage === "uploading" ||
    stage === "segmenting" ||
    stage === "embedding" ||
    stage === "indexing";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "1.5rem",
        padding: "1.5rem",
      }}
    >
      <p
        className="text-xs uppercase tracking-widest text-emerald-200/70 mb-4"
        style={{ letterSpacing: "0.15em" }}
      >
        Audio References
      </p>

      {stage === "idle" && (
        <>
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `1.5px dashed ${isDragOver ? "rgba(110,231,183,0.5)" : "rgba(255,255,255,0.15)"}`,
              borderRadius: "1rem",
              padding: "2rem 1.5rem",
              textAlign: "center",
              cursor: "pointer",
              background: isDragOver ? "rgba(110,231,183,0.04)" : "transparent",
              transition: "all 0.15s ease",
            }}
          >
            <p className="text-stone-200/75 text-sm">
              Drag &amp; drop WAV, MP3, or M4A files here
            </p>
            <p className="text-stone-200/50 text-xs mt-1">or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
            multiple
            className="hidden"
            onChange={onFileInputChange}
          />
        </>
      )}

      {selectedFiles.length > 0 && stage === "idle" && (
        <div className="mt-3 space-y-1">
          {selectedFiles.map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-between text-xs text-stone-200/75"
            >
              <span>{f.name}</span>
              <span className="text-stone-200/50">
                {(f.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          ))}
          <button
            onClick={onUpload}
            disabled={isProcessing}
            style={{
              marginTop: "0.75rem",
              width: "100%",
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              background: "rgba(110,231,183,0.15)",
              border: "1px solid rgba(110,231,183,0.3)",
              color: "rgb(167,243,208)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Index Audio Files
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-100">{STAGE_LABELS[stage]}</span>
          </div>
          {["uploading", "segmenting", "embedding", "indexing"].map((s) => (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  width: "0.5rem",
                  height: "0.5rem",
                  borderRadius: "9999px",
                  background:
                    stage === s
                      ? "rgb(110,231,183)"
                      : ["uploading", "segmenting", "embedding", "indexing"].indexOf(s) <
                          ["uploading", "segmenting", "embedding", "indexing"].indexOf(stage)
                        ? "rgba(110,231,183,0.4)"
                        : "rgba(255,255,255,0.15)",
                  transition: "background 0.3s ease",
                }}
              />
              <span
                style={{
                  fontSize: "0.75rem",
                  color:
                    stage === s
                      ? "rgb(209,250,229)"
                      : "rgba(255,255,255,0.4)",
                }}
              >
                {STAGE_LABELS[s as AudioUploadStage]}
              </span>
            </div>
          ))}
        </div>
      )}

      {stage === "done" && result && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-emerald-300">
            {STAGE_LABELS.done} — {result.sonicChunkCountAdded} new sonic chunks
            ({result.sonicChunkCountTotal} total)
          </p>
          <p className="text-xs text-stone-200/60">
            Indexed: {result.processedFiles.join(", ")}
          </p>
          {result.failedFiles.length > 0 && (
            <p className="text-xs text-rose-200/80">
              Failed: {result.failedFiles.map((f) => f.fileName).join(", ")}
            </p>
          )}
          <button
            onClick={onReset}
            style={{
              marginTop: "0.5rem",
              padding: "0.375rem 0.875rem",
              borderRadius: "9999px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            Upload more
          </button>
        </div>
      )}

      {error && (
        <div
          className="mt-3 text-xs text-rose-200"
          style={{
            background: "rgba(251,113,133,0.08)",
            border: "1px solid rgba(251,113,133,0.2)",
            borderRadius: "0.75rem",
            padding: "0.75rem",
          }}
        >
          {error}
          {stage === "failed" && (
            <button
              onClick={onReset}
              className="block mt-2 text-rose-200/60 hover:text-rose-200 underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          className="mt-3 text-xs text-amber-200/80 space-y-1"
          style={{
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.15)",
            borderRadius: "0.75rem",
            padding: "0.75rem",
          }}
        >
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
