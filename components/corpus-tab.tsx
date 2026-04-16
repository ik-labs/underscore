"use client";

import { ProseUploader } from "@/components/prose-uploader";
import type { ProjectRecord } from "@/lib/project-types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CorpusTab({
  project,
  onIngestSuccess,
}: {
  project: ProjectRecord;
  onIngestSuccess?: () => void;
}) {
  return (
    <div className="space-y-6">
      <ProseUploader projectId={project.id} onIngestSuccess={onIngestSuccess} />

      {/* Indexed sources */}
      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
              Indexed sources
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-stone-100">
              Corpus summary
            </h2>
          </div>
        </div>

        {project.sources.length === 0 ? (
          <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/15 bg-white/4 px-5 py-8 text-sm leading-7 text-stone-200/75">
            No sources indexed yet. Upload prose files to create the first
            searchable corpus for this project.
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {project.sources
              .slice()
              .reverse()
              .map((source) => (
                <li
                  key={source.sourceId}
                  className="rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-stone-100">
                        {source.fileName}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-300/60">
                        {source.sourceType.replaceAll("_", " ")}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        source.status === "indexed"
                          ? "bg-emerald-300/12 text-emerald-100"
                          : "bg-rose-300/12 text-rose-100"
                      }`}
                    >
                      {source.status}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 text-sm text-stone-200/75 sm:flex-row sm:items-center sm:justify-between">
                    <span>{source.chunkCount} chunks</span>
                    <span>{formatDate(source.uploadedAt)}</span>
                  </div>

                  {source.errorMessage ? (
                    <p className="mt-3 text-sm text-rose-200">
                      {source.errorMessage}
                    </p>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
