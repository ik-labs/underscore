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
  const [response, setResponse] = useState<RetrievalResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const timersRef = useRef<number[]>([]);

  const isSubmitting =
    stage === "retrieving" || stage === "synthesizing" || stage === "generating";

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

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

        {/* Submit */}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!sceneText.trim() || isSubmitting}
            className="rounded-full bg-stone-100 px-6 py-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stageLabel[stage]}
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
