import { NextResponse } from "next/server";

import { retrieveForScene } from "@/lib/retrieval";
import { synthesizeAndGenerate } from "@/lib/synthesis";
import { getProject } from "@/lib/projects";
import {
  assertKvEnv,
  assertPhase3RetrievalEnv,
  assertPhase4SynthesisEnv,
  MissingServerEnvError,
} from "@/lib/server-env";
import type { SynthesisResult } from "@/lib/project-types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<NextResponse> {
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
  const sceneText = formData.get("sceneText");

  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    return NextResponse.json(
      { error: "missing_project_id", message: "projectId is required." },
      { status: 400 }
    );
  }

  if (typeof sceneText !== "string" || sceneText.trim().length === 0) {
    return NextResponse.json(
      { error: "missing_scene_text", message: "sceneText is required." },
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
        { error: "missing_server_env", missing: error.missing },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "project_load_failed", message: "Failed to load project." },
      { status: 500 }
    );
  }

  if (!project) {
    return NextResponse.json(
      { error: "project_not_found" },
      { status: 404 }
    );
  }

  const voiceMemoField = formData.get("voiceMemo");
  let voiceBuffer: Buffer | undefined;
  let voiceMimeType: string | undefined;

  if (voiceMemoField instanceof File && voiceMemoField.size > 0) {
    voiceBuffer = Buffer.from(await voiceMemoField.arrayBuffer());
    voiceMimeType = voiceMemoField.type || "audio/webm";
  }

  let env: ReturnType<typeof assertPhase3RetrievalEnv>;

  try {
    env = assertPhase3RetrievalEnv();
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return NextResponse.json(
        { error: "missing_server_env", missing: error.missing },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "env_load_failed", message: "Failed to load environment." },
      { status: 500 }
    );
  }

  let retrievalResult;

  try {
    retrievalResult = await retrieveForScene({
      project,
      sceneText: sceneText.trim(),
      voiceBuffer,
      voiceMimeType,
      googleApiKey: env.googleApiKey,
      turbopufferApiKey: env.turbopufferApiKey,
      anthropicApiKey: env.anthropicApiKey,
      hfApiKey: env.hfApiKey,
    });
  } catch (error) {
    console.error("[/api/score] retrieval failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown retrieval error";
    return NextResponse.json(
      { error: "retrieval_failed", message },
      { status: 500 }
    );
  }

  let synthesis: SynthesisResult | null = null;

  try {
    const synthEnv = assertPhase4SynthesisEnv();
    synthesis = await synthesizeAndGenerate({
      projectId: project.id,
      sceneText: sceneText.trim(),
      voiceTranscript: retrievalResult.voiceTranscript,
      chunks: retrievalResult.chunks,
      anthropicApiKey: synthEnv.anthropicApiKey,
      elevenLabsApiKey: synthEnv.elevenLabsApiKey,
      blobToken: synthEnv.blobToken,
    });
  } catch (error) {
    console.warn("[/api/score] synthesis skipped:", error);
    // synthesis stays null — retrieval result still returned
  }

  return NextResponse.json({ ...retrievalResult, synthesis }, { status: 200 });
}
