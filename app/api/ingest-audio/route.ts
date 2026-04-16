import { NextResponse } from "next/server";

import { ingestAudioFiles } from "@/lib/sonic-ingestion";
import { readSourceTypeOverrides } from "@/lib/prose-ingestion";
import { getProject, saveProject } from "@/lib/projects";
import {
  assertKvEnv,
  assertPhase2AudioEnv,
  MissingServerEnvError,
} from "@/lib/server-env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse form data." },
      { status: 400 }
    );
  }

  const projectId = formData.get("projectId");

  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    return NextResponse.json(
      { error: "projectId is required." },
      { status: 400 }
    );
  }

  let project;

  try {
    assertKvEnv();
    project = await getProject(projectId.trim());
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return NextResponse.json(
        { error: error.message, missing: error.missing },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to load project." },
      { status: 500 }
    );
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const rawFiles = formData.getAll("files");
  const files = rawFiles.filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files provided." },
      { status: 400 }
    );
  }

  const sourceTypeOverrides = readSourceTypeOverrides(formData);

  let env;

  try {
    env = assertPhase2AudioEnv();
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return NextResponse.json(
        { error: error.message, missing: error.missing },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to load environment configuration." },
      { status: 500 }
    );
  }

  try {
    const result = await ingestAudioFiles({
      project,
      files,
      sourceTypeOverrides,
      hfApiKey: env.hfApiKey,
      turbopufferApiKey: env.turbopufferApiKey,
      blobToken: env.blobToken,
    });

    if (result.kind === "no_supported_files") {
      return NextResponse.json(
        { error: "No supported audio files found.", warnings: result.warnings },
        { status: 400 }
      );
    }

    if (result.kind === "all_failed") {
      return NextResponse.json(
        {
          error: "All files failed to ingest.",
          failedFiles: result.failedFiles,
          warnings: result.warnings,
        },
        { status: 422 }
      );
    }

    await saveProject(result.updatedProject);

    return NextResponse.json(result.response, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
