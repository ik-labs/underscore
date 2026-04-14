import { NextResponse } from "next/server";

import { ingestProseFiles, readSourceTypeOverrides } from "@/lib/prose-ingestion";
import { getProject, saveProject } from "@/lib/projects";
import { assertPhase1IngestEnv, MissingServerEnvError } from "@/lib/server-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_form_data", message: "Expected multipart form data." },
      { status: 400 }
    );
  }

  const projectId = formData.get("projectId");

  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    return NextResponse.json(
      { error: "project_not_found", message: "Project ID is required." },
      { status: 404 }
    );
  }

  try {
    const project = await getProject(projectId.trim());

    if (!project) {
      return NextResponse.json(
        { error: "project_not_found", message: "Project not found." },
        { status: 404 }
      );
    }

    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "no_supported_files", message: "No files were uploaded." },
        { status: 400 }
      );
    }

    const env = assertPhase1IngestEnv();
    const sourceTypeOverrides = readSourceTypeOverrides(formData);
    const result = await ingestProseFiles({
      project,
      files,
      sourceTypeOverrides,
      googleApiKey: env.googleApiKey,
      turbopufferApiKey: env.turbopufferApiKey,
    });

    if (result.kind === "no_supported_files") {
      return NextResponse.json(
        {
          error: "no_supported_files",
          message: "No supported prose files were provided.",
          warnings: result.warnings,
        },
        { status: 400 }
      );
    }

    if (result.kind === "all_failed") {
      return NextResponse.json(
        {
          error: "ingest_failed",
          message: "All supported files failed during ingestion.",
          warnings: result.warnings,
          failedFiles: result.failedFiles,
          sources: result.failedMetadata.map((item) => ({
            sourceId: item.sourceId,
            fileName: item.fileName,
            sourceType: item.sourceType,
            mimeType: item.mimeType,
            status: item.status,
            chunkCount: item.chunkCount,
            errorMessage: item.errorMessage,
          })),
        },
        { status: 422 }
      );
    }

    await saveProject(result.updatedProject);
    return NextResponse.json(result.response);
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return NextResponse.json(
        { error: "missing_server_env", missing: error.missing },
        { status: 500 }
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: "ingest_failed", message: "Failed to ingest uploaded files." },
      { status: 500 }
    );
  }
}
