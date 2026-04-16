import { notFound } from "next/navigation";

import { WorkspaceLayout } from "@/components/workspace-layout";
import { getProject } from "@/lib/projects";
import { MissingServerEnvError } from "@/lib/server-env";

export const dynamic = "force-dynamic";

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
              Set the required KV variables before using the workspace:{" "}
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
      <div className="mx-auto max-w-6xl">
        <WorkspaceLayout project={project} />
      </div>
    </main>
  );
}
