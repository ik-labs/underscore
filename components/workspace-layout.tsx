"use client";

import { useState } from "react";

import { CorpusTab } from "@/components/corpus-tab";
import { ScoreTab } from "@/components/score-tab";
import type { ProjectRecord } from "@/lib/project-types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type Tab = "corpus" | "score";

export function WorkspaceLayout({ project }: { project: ProjectRecord }) {
  const [tab, setTab] = useState<Tab>("corpus");
  // Bump this to trigger scene re-extraction after ingest
  const [sceneLoadTick, setSceneLoadTick] = useState(0);

  function handleIngestSuccess() {
    setTab("score");
    setSceneLoadTick((n) => n + 1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-[2rem] border border-white/10 bg-black/20 p-8 shadow-2xl shadow-black/10">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">
              Project workspace
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance">
              {project.name}
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-stone-200/78">
              Build your corpus by uploading prose files. Scripts, director notes,
              subtitles, and moodboards all feed the retrieval layer.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/6 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-300/65">
                Created
              </p>
              <p className="mt-2 text-sm text-stone-100">
                {formatDate(project.createdAt)}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/6 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-300/65">
                Corpus
              </p>
              <p className="mt-2 text-sm text-stone-100">
                {project.sourceCount} source{project.sourceCount !== 1 ? "s" : ""}{" "}
                · {project.proseChunkCount} prose{" "}
                · {project.sonicChunkCount ?? 0} sonic
              </p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("corpus")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              tab === "corpus"
                ? "bg-white/10 text-stone-100"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Corpus
          </button>
          <button
            type="button"
            onClick={() => setTab("score")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              tab === "score"
                ? "bg-white/10 text-stone-100"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Score
          </button>
        </div>
      </header>

      {/* Tab content */}
      {tab === "corpus" ? (
        <CorpusTab project={project} onIngestSuccess={handleIngestSuccess} />
      ) : (
        <ScoreTab project={project} triggerSceneLoad={sceneLoadTick} />
      )}
    </div>
  );
}
