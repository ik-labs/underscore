"use client";

import type { MusicPromptShape, SynthesisResult } from "@/lib/project-types";
import { SfxSection } from "@/components/sfx-section";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const shapeLabel: Record<MusicPromptShape, string> = {
  fast_burst: "Fast Burst",
  cinematic: "Cinematic",
  voice_weighted: "Voice Weighted",
};

const shapeDescription: Record<MusicPromptShape, string> = {
  fast_burst: "Energetic · 15–30s · quick cuts",
  cinematic: "Atmospheric · full arc · builds tension",
  voice_weighted: "Intimate · tonal · director-weighted",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ScoreResults({ synthesis }: { synthesis: SynthesisResult | null }) {
  if (!synthesis) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/10">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
          Score Results
        </p>
        <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/15 bg-white/4 px-5 py-8 text-center text-sm text-stone-200/65">
          Score synthesis unavailable — retrieval data is shown below.
        </div>
      </div>
    );
  }

  const { cueBrief, variants, sfxVariants = [], warnings } = synthesis;

  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/10">
      <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
        Score Results
      </p>

      {/* Cue Brief */}
      <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-300/65">
          Cue Brief
        </p>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <CueBriefRow label="Mood" value={cueBrief.mood} />
          <CueBriefRow label="Tempo" value={cueBrief.tempo} />
          <div className="sm:col-span-2">
            <CueBriefRow label="Instrumentation" value={cueBrief.instrumentation} />
          </div>
          {cueBrief.keyThemes.length > 0 ? (
            <div className="sm:col-span-2">
              <CueBriefRow
                label="Key themes"
                value={cueBrief.keyThemes.join(" · ")}
              />
            </div>
          ) : null}
          {cueBrief.sourceAttribution.length > 0 ? (
            <div className="sm:col-span-2">
              <CueBriefRow
                label="Sources used"
                value={cueBrief.sourceAttribution.join(" · ")}
                dim
              />
            </div>
          ) : null}
        </dl>
      </div>

      {/* Score Variants */}
      {variants.length === 0 ? (
        <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/15 bg-white/4 px-5 py-6 text-center text-sm text-stone-200/65">
          No audio variants were generated. Check warnings below.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {variants.map((variant) => (
            <div
              key={variant.shape}
              className="flex flex-col rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-5"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
                {shapeLabel[variant.shape]}
              </p>
              <p className="mt-1 text-xs text-stone-300/55">
                {shapeDescription[variant.shape]}
              </p>

              <audio
                controls
                src={variant.blobUrl}
                className="mt-4 w-full"
                preload="metadata"
              />

              <div className="mt-3 flex items-center gap-3">
                <a
                  href={variant.blobUrl}
                  download={`underscore-${variant.shape}.mp3`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-medium text-stone-100 transition hover:bg-white/10"
                >
                  <span>↓</span>
                  <span>Download</span>
                </a>

                {variant.compositionPlan ? (
                  <details className="flex-1">
                    <summary className="cursor-pointer text-xs text-stone-400 hover:text-stone-200 transition">
                      Composition plan
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-stone-300/70">
                      {JSON.stringify(variant.compositionPlan, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SFX Variants */}
      <SfxSection sfxVariants={sfxVariants} />

      {/* Warnings */}
      {warnings.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function CueBriefRow({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-[0.24em] text-stone-400/80">{label}</dt>
      <dd className={`text-sm leading-6 ${dim ? "text-stone-300/65" : "text-stone-100"}`}>
        {value}
      </dd>
    </div>
  );
}
