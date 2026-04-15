"use client";

import type { QueryOrigin, RetrievedChunk, SourceType } from "@/lib/project-types";

// ─── Color maps ───────────────────────────────────────────────────────────────

const namespaceStyle: Record<string, string> = {
  prose: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
  sonic: "border-violet-300/25 bg-violet-300/10 text-violet-200",
};

const sourceTypeStyle: Record<SourceType, string> = {
  script: "border-stone-300/20 bg-stone-300/8 text-stone-300",
  director_notes: "border-amber-300/25 bg-amber-300/10 text-amber-200",
  subtitle: "border-sky-300/25 bg-sky-300/10 text-sky-200",
  moodboard: "border-pink-300/25 bg-pink-300/10 text-pink-200",
  audio_reference: "border-violet-300/25 bg-violet-300/10 text-violet-200",
  voice_memo: "border-rose-300/25 bg-rose-300/10 text-rose-200",
};

const originStyle: Record<QueryOrigin, string> = {
  prose_vector: "border-emerald-300/20 bg-emerald-300/8 text-emerald-300",
  prose_bm25: "border-teal-300/20 bg-teal-300/8 text-teal-300",
  prose_director: "border-amber-300/20 bg-amber-300/8 text-amber-300",
  sonic_text: "border-violet-300/20 bg-violet-300/8 text-violet-300",
  sonic_audio: "border-rose-300/20 bg-rose-300/8 text-rose-300",
};

const originLabel: Record<QueryOrigin, string> = {
  prose_vector: "prose vector",
  prose_bm25: "BM25",
  prose_director: "director",
  sonic_text: "sonic text",
  sonic_audio: "sonic audio",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AttributionPanel({
  chunks,
  queriesExecuted,
  voiceTranscript,
}: {
  chunks: RetrievedChunk[];
  queriesExecuted: QueryOrigin[];
  voiceTranscript?: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
            Corpus Evidence
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-100">
            {chunks.length} matched chunk{chunks.length !== 1 ? "s" : ""}
          </h2>
        </div>

        {/* Queries executed badges */}
        {queriesExecuted.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {queriesExecuted.map((origin) => (
              <span
                key={origin}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${originStyle[origin]}`}
              >
                {originLabel[origin]}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Voice transcript */}
      {voiceTranscript ? (
        <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-300/65">
            Director&apos;s voice note (transcribed)
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-200/85 italic">
            &ldquo;{voiceTranscript}&rdquo;
          </p>
        </div>
      ) : null}

      {/* Empty state */}
      {chunks.length === 0 ? (
        <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/15 bg-white/4 px-5 py-8 text-center text-sm text-stone-200/65">
          No evidence matched — try rephrasing your scene description.
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {chunks.map((chunk) => (
            <li
              key={chunk.id}
              className="rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-4"
            >
              {/* Top row: namespace + type + location + RRF */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${namespaceStyle[chunk.namespace]}`}
                >
                  {chunk.namespace}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${sourceTypeStyle[chunk.sourceType] ?? "border-white/15 bg-white/5 text-stone-300"}`}
                >
                  {chunk.sourceType.replaceAll("_", " ")}
                  {chunk.pageNum != null ? ` · p.${chunk.pageNum}` : ""}
                  {chunk.timestampMs != null
                    ? ` · ${Math.round(chunk.timestampMs / 1000)}s`
                    : ""}
                </span>
                <span className="ml-auto text-xs text-stone-400">
                  {chunk.rrfScore.toFixed(4)}
                </span>
              </div>

              {/* Source file */}
              <p className="mt-2 text-xs text-stone-300/65 truncate">
                {chunk.sourceFile}
                {chunk.locationHint ? ` · ${chunk.locationHint}` : ""}
              </p>

              {/* Text snippet */}
              {chunk.text ? (
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-200/85">
                  &ldquo;{chunk.text}&rdquo;
                </p>
              ) : null}

              {/* Sonic signature */}
              {chunk.sonicSignature ? (
                <p className="mt-2 text-xs text-violet-200/75">
                  Sonic: {chunk.sonicSignature}
                </p>
              ) : null}

              {/* Bottom row: tags + origins */}
              {(chunk.emotionalTags.length > 0 || chunk.queryOrigins.length > 0) ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {chunk.emotionalTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-stone-300/80"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="flex-1" />
                  {chunk.queryOrigins.map((origin) => (
                    <span
                      key={origin}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${originStyle[origin]}`}
                    >
                      {originLabel[origin]}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
