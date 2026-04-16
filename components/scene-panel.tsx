"use client";

import { useState } from "react";

import type { Scene, TitleTrackResult } from "@/lib/project-types";

interface ScenePanelProps {
  scenes: Scene[];
  scenesLoading: boolean;
  selectedId: string | null;
  onSelect: (scene: Scene | null) => void;
  projectId: string;
  titleTrack: TitleTrackResult | null;
  onTitleTrackGenerated: (result: TitleTrackResult) => void;
}

export function ScenePanel({
  scenes,
  scenesLoading,
  selectedId,
  onSelect,
  projectId,
  titleTrack,
  onTitleTrackGenerated,
}: ScenePanelProps) {
  const [titleTrackLoading, setTitleTrackLoading] = useState(false);
  const [titleTrackError, setTitleTrackError] = useState<string | null>(null);

  async function handleGenerateTitleTrack() {
    setTitleTrackLoading(true);
    setTitleTrackError(null);
    try {
      const res = await fetch("/api/title-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const payload = await res.json();
      if (!res.ok || !("blobUrl" in payload)) {
        setTitleTrackError(
          (payload as { error?: string }).error ?? "Title track generation failed."
        );
        return;
      }
      onTitleTrackGenerated(payload as TitleTrackResult);
    } catch {
      setTitleTrackError("Network error — check your connection and try again.");
    } finally {
      setTitleTrackLoading(false);
    }
  }

  return (
    <aside className="w-72 shrink-0 space-y-4">
      {/* Title track card */}
      <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/5 px-5 py-5">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">
          Title Track
        </p>
        <p className="mt-1 text-xs text-stone-300/60 leading-5">
          120-second film arc cue
        </p>

        {titleTrack ? (
          <div className="mt-4 space-y-3">
            <audio
              controls
              src={titleTrack.blobUrl}
              className="w-full"
              preload="metadata"
            />
            <a
              href={titleTrack.blobUrl}
              download="title-track.mp3"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-medium text-stone-100 transition hover:bg-white/10"
            >
              <span>↓</span>
              <span>Download</span>
            </a>
            <button
              type="button"
              onClick={handleGenerateTitleTrack}
              disabled={titleTrackLoading}
              className="block w-full rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Regenerate
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateTitleTrack}
            disabled={titleTrackLoading}
            className="mt-4 w-full rounded-full bg-amber-200/90 px-4 py-2.5 text-xs font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {titleTrackLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
                Generating…
              </span>
            ) : (
              "Generate Title Track"
            )}
          </button>
        )}

        {titleTrackError ? (
          <p className="mt-3 text-xs text-rose-200">{titleTrackError}</p>
        ) : null}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/8" />

      {/* Scenes */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
          Scenes
        </p>

        {scenesLoading ? (
          // Skeleton cards
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-[1.25rem] border border-white/8 bg-white/4 px-4 py-4"
            >
              <div className="h-3 w-3/4 rounded-full bg-white/10" />
              <div className="mt-2 h-2.5 w-full rounded-full bg-white/6" />
              <div className="mt-1.5 h-2.5 w-5/6 rounded-full bg-white/6" />
            </div>
          ))
        ) : scenes.length === 0 ? (
          <p className="text-xs leading-6 text-stone-400/60">
            Upload prose files to auto-generate scenes.
          </p>
        ) : (
          scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelect(selectedId === scene.id ? null : scene)}
              className={`w-full rounded-[1.25rem] border px-4 py-4 text-left transition ${
                selectedId === scene.id
                  ? "border-emerald-300/40 bg-emerald-300/8"
                  : "border-white/8 bg-white/4 hover:bg-white/8 cursor-pointer"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-stone-100 leading-5">
                  {scene.title}
                </p>
                {selectedId === scene.id ? (
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                ) : null}
              </div>
              {scene.timecode ? (
                <p className="mt-1 text-xs text-stone-400/60">{scene.timecode}</p>
              ) : null}
              <p className="mt-1.5 text-xs leading-5 text-stone-300/60 line-clamp-2">
                {scene.description}
              </p>
            </button>
          ))
        )}

        {/* Custom scene option */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`w-full rounded-[1.25rem] border px-4 py-3 text-left transition ${
            selectedId === null && !scenesLoading
              ? "border-white/20 bg-white/8"
              : "border-dashed border-white/15 hover:bg-white/4 cursor-pointer"
          }`}
        >
          <p className="text-xs text-stone-400 hover:text-stone-200 transition">
            + Custom scene
          </p>
        </button>
      </div>
    </aside>
  );
}
