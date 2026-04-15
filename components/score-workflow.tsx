"use client";

import { useEffect, useRef, useState } from "react";

import type { RetrievalResponse } from "@/lib/project-types";
import { AttributionPanel } from "@/components/attribution-panel";
import { ScoreResults } from "@/components/score-results";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage =
  | "idle"
  | "retrieving"
  | "synthesizing"
  | "generating"
  | "done"
  | "failed";

const stageLabel: Record<Stage, string> = {
  idle: "Generate Score",
  retrieving: "Retrieving corpus evidence…",
  synthesizing: "Synthesizing cue brief with Claude…",
  generating: "Generating 3 score variations…",
  done: "Generate Again",
  failed: "Retry",
};

const progressSteps: { key: Stage; label: string }[] = [
  { key: "retrieving", label: "Retrieve" },
  { key: "synthesizing", label: "Synthesize" },
  { key: "generating", label: "Generate" },
];

const stageOrder: Stage[] = [
  "idle",
  "retrieving",
  "synthesizing",
  "generating",
  "done",
  "failed",
];

function stageIndex(s: Stage) {
  return stageOrder.indexOf(s);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScoreWorkflow({ projectId }: { projectId: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [sceneText, setSceneText] = useState("");
  const [voiceMemoFile, setVoiceMemoFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [response, setResponse] = useState<RetrievalResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const timersRef = useRef<number[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubmitting =
    stage === "retrieving" || stage === "synthesizing" || stage === "generating";

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Voice recorder ──────────────────────────────────────────────────────────

  async function startRecording() {
    recordedChunksRef.current = [];

    // Check codec support before acquiring the mic so we can give an accurate
    // error message and avoid leaving the stream open if construction fails.
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : null;

    if (!mimeType) {
      setErrorMessage("Audio recording is not supported in this browser. Attach a file instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMessage("Microphone access denied.");
      return;
    }

    streamRef.current = stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setErrorMessage("Could not start recorder — codec not supported. Attach a file instead.");
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const ext = mimeType.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-direction.${ext}`, {
        type: mimeType,
      });
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setVoiceMemoFile(file);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecording(false);
    };

    recorder.start(250);
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function clearVoiceMemo() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setVoiceMemoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setVoiceMemoFile(file);
  }

  // ── Score generation ────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!sceneText.trim() || isSubmitting) return;

    setErrorMessage(null);
    setWarnings([]);
    setResponse(null);

    setStage("retrieving");
    const t1 = window.setTimeout(() => setStage("synthesizing"), 6000);
    const t2 = window.setTimeout(() => setStage("generating"), 18000);
    timersRef.current = [t1, t2];

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("sceneText", sceneText.trim());
    if (voiceMemoFile) formData.append("voiceMemo", voiceMemoFile);

    try {
      const res = await fetch("/api/score", { method: "POST", body: formData });
      const payload = await res.json();
      timersRef.current.forEach((t) => window.clearTimeout(t));

      if (!res.ok || !("chunks" in payload)) {
        const p = payload as {
          message?: string;
          error?: string;
          missing?: string[];
        };
        let msg = p.message ?? "Score generation failed.";
        if (
          p.error === "missing_server_env" &&
          Array.isArray(p.missing) &&
          p.missing.length > 0
        ) {
          msg = `Missing server environment variables: ${p.missing.join(", ")}.`;
        }
        setErrorMessage(msg);
        setStage("failed");
        return;
      }

      const data = payload as RetrievalResponse;
      if (data.warnings?.length > 0) setWarnings(data.warnings);
      setResponse(data);
      setStage("done");
    } catch {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      setErrorMessage("Network error — check your connection and try again.");
      setStage("failed");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Scene input card */}
      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/10">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
          Generate Score
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-stone-100">
          Describe your scene
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-200/70">
          The retrieval engine searches your corpus for matching prose and sonic
          evidence, then Claude synthesizes a cue brief and generates 3 score
          variations grounded in your materials.
        </p>

        {/* Scene text */}
        <textarea
          value={sceneText}
          onChange={(e) => setSceneText(e.target.value)}
          placeholder="e.g. Rain on a tin roof at 3am. The detective sits alone in a flooded parking lot, engine running…"
          rows={5}
          disabled={isSubmitting}
          className="mt-5 w-full resize-none rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-400/60 transition focus:border-emerald-300/60 focus:bg-black/30 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {/* Voice direction */}
        <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-300/65">
            Voice direction (optional)
          </p>
          <p className="mt-1 text-xs text-stone-300/50">
            Record or attach a voice memo to weight the score toward your
            tonal direction.
          </p>

          {/* Controls */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!recording && !voiceMemoFile ? (
              <>
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-300/8 px-4 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-300/14 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  Record
                </button>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-medium text-stone-100 transition hover:bg-white/10">
                  Attach file
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileAttach}
                    className="sr-only"
                    disabled={isSubmitting}
                  />
                </label>
              </>
            ) : recording ? (
              <>
                <span className="flex items-center gap-2 text-xs text-rose-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                  Recording…
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-medium text-stone-100 transition hover:bg-white/10"
                >
                  Stop
                </button>
              </>
            ) : (
              /* Has file/recording */
              <button
                type="button"
                onClick={clearVoiceMemo}
                disabled={isSubmitting}
                className="text-xs text-stone-400 transition hover:text-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✕ Remove voice memo
              </button>
            )}
          </div>

          {/* Preview */}
          {previewUrl ? (
            <audio
              controls
              src={previewUrl}
              className="mt-4 w-full"
              preload="metadata"
            />
          ) : null}
        </div>

        {/* Submit */}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!sceneText.trim() || isSubmitting}
            className="rounded-full bg-stone-100 px-6 py-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? stageLabel[stage] : stageLabel[stage]}
          </button>

          {isSubmitting ? (
            <p className="text-xs text-stone-400/80">
              Score generation takes 60–90 seconds
            </p>
          ) : null}
        </div>

        {/* Stage indicator */}
        {isSubmitting ? (
          <div className="mt-5 flex items-center gap-3">
            {progressSteps.map((step, i) => {
              const current = stageIndex(stage);
              const stepIdx = stageIndex(step.key);
              const isDone = current > stepIdx;
              const isActive = current === stepIdx;
              return (
                <div key={step.key} className="flex items-center gap-2">
                  {i > 0 ? (
                    <div
                      className={`h-px w-8 ${isDone ? "bg-emerald-300/60" : "bg-white/15"}`}
                    />
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full transition-all ${
                        isActive
                          ? "animate-pulse bg-emerald-300"
                          : isDone
                          ? "bg-emerald-300/50"
                          : "bg-white/20"
                      }`}
                    />
                    <span
                      className={`text-xs ${isActive ? "text-emerald-200" : isDone ? "text-stone-300/60" : "text-stone-400/50"}`}
                    >
                      {step.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Error */}
        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {/* Warnings */}
        {warnings.length > 0 && stage === "done" ? (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        ) : null}
      </div>

      {/* Results */}
      {response ? (
        <>
          <ScoreResults synthesis={response.synthesis} />
          <AttributionPanel
            chunks={response.chunks}
            queriesExecuted={response.queriesExecuted}
            voiceTranscript={response.voiceTranscript}
          />
        </>
      ) : null}
    </div>
  );
}
