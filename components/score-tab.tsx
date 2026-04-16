"use client";

import { useEffect, useState } from "react";

import { ScenePanel } from "@/components/scene-panel";
import { ScoreWorkflow } from "@/components/score-workflow";
import type { ProjectRecord, Scene, SceneExtractionResult, TitleTrackResult } from "@/lib/project-types";

export function ScoreTab({
  project,
  triggerSceneLoad,
}: {
  project: ProjectRecord;
  triggerSceneLoad: number; // bump to re-fetch scenes (e.g. after ingest)
}) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [titleTrack, setTitleTrack] = useState<TitleTrackResult | null>(null);

  // Load scenes on mount and whenever triggered after ingest.
  // Don't guard on proseChunkCount here — it's stale at the moment onIngestSuccess fires.
  // The /api/scenes route reads fresh project data from KV itself.
  useEffect(() => {
    let cancelled = false;
    // Only show skeleton if triggered after an ingest (tick > 0) or project already has chunks
    if (triggerSceneLoad > 0 || project.proseChunkCount > 0) {
      setScenesLoading(true);
    }

    fetch("/api/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    })
      .then((r) => r.json())
      .then((payload: SceneExtractionResult & { error?: string }) => {
        if (cancelled) return;
        if (Array.isArray(payload.scenes)) {
          setScenes(payload.scenes);
        }
      })
      .catch(() => {
        // silent — scene panel will show empty state
      })
      .finally(() => {
        if (!cancelled) setScenesLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, triggerSceneLoad]);

  function handleSceneSelect(scene: Scene | null) {
    setSelectedScene(scene);
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Left panel */}
      <ScenePanel
        scenes={scenes}
        scenesLoading={scenesLoading}
        selectedId={selectedScene?.id ?? null}
        onSelect={handleSceneSelect}
        projectId={project.id}
        titleTrack={titleTrack}
        onTitleTrackGenerated={setTitleTrack}
      />

      {/* Right panel */}
      <div className="min-w-0 flex-1">
        <ScoreWorkflow
          projectId={project.id}
          initialSceneText={selectedScene?.description ?? ""}
        />
      </div>
    </div>
  );
}
