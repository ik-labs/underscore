import { notFound } from "next/navigation";

import { ProseUploader } from "@/components/prose-uploader";
import { ScoreWorkflow } from "@/components/score-workflow";
import { getProject } from "@/lib/projects";
import { MissingServerEnvError } from "@/lib/server-env";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ProjectWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let project;

  try {
    project = await getProject(id);
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#2f6d62,_#081714_52%,_#050807_100%)] px-6 py-10 text-stone-100">
          <div className="mx-auto max-w-4xl rounded-[2rem] border border-rose-200/20 bg-black/20 p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-rose-200/70">
              Missing server environment
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
              Project metadata store is not configured.
            </h1>
            <p className="mt-4 text-sm leading-7 text-stone-200/80">
              Set the required KV variables before using the workspace:
              {" "}
              {error.missing.join(", ")}.
            </p>
          </div>
        </main>
      );
    }

    throw error;
  }

  if (!project) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#2f6d62,_#081714_52%,_#050807_100%)] px-6 py-10 text-stone-100">
      <div className="mx-auto max-w-6xl space-y-8">

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
                <p className="mt-2 text-sm text-stone-100">{formatDate(project.createdAt)}</p>
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
        </header>

        {/* Prose upload */}
        <ProseUploader projectId={project.id} />

        {/* Corpus summary */}
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
                      <p className="mt-3 text-sm text-rose-200">{source.errorMessage}</p>
                    ) : null}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Score generation */}
        <ScoreWorkflow projectId={project.id} />

      </div>
    </main>
  );
}
