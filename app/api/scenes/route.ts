import { NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";
import { Turbopuffer } from "@turbopuffer/turbopuffer";

import { extractScenes } from "@/lib/scene-extraction";
import { getProject } from "@/lib/projects";
import {
  assertKvEnv,
  assertPhase1IngestEnv,
  getAnthropicApiKey,
  MissingServerEnvError,
} from "@/lib/server-env";
import type { RetrievedChunk, SourceType } from "@/lib/project-types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<NextResponse> {
  let body: { projectId?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const projectId = body.projectId;

  if (typeof projectId !== "string" || projectId.trim().length === 0) {
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
        { error: "missing_server_env", missing: error.missing },
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

  if (project.proseChunkCount === 0) {
    return NextResponse.json({ scenes: [], warnings: ["No prose chunks indexed yet."] });
  }

  let env: ReturnType<typeof assertPhase1IngestEnv>;

  try {
    env = assertPhase1IngestEnv();
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return NextResponse.json(
        { error: "missing_server_env", missing: error.missing },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to load environment." },
      { status: 500 }
    );
  }

  const anthropicApiKey = getAnthropicApiKey();

  try {
    // Embed a broad dramatic query to pull a representative sample of chunks
    const google = createGoogleGenerativeAI({ apiKey: env.googleApiKey });
    const { embedding } = await embed({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      value: "dramatic scene emotional moment character conflict tension",
    });

    const tpuf = new Turbopuffer({ apiKey: env.turbopufferApiKey });
    const proseNs = tpuf.namespace(project.proseNamespaceId);

    const results = await proseNs.query({
      vector: embedding,
      distance_metric: "cosine_distance",
      top_k: 15,
      include_attributes: true,
      filters: ["project_id", "Eq", project.id],
    });

    const chunks: RetrievedChunk[] = results.map((r) => {
      const a = r.attributes ?? {};
      return {
        id: String(r.id),
        namespace: "prose",
        queryOrigins: ["prose_vector"],
        rawDist: typeof r.dist === "number" ? r.dist : undefined,
        rrfScore: 0,
        text: typeof a.text === "string" ? a.text : "",
        sourceId: typeof a.source_id === "string" ? a.source_id : "",
        sourceFile: typeof a.source_file === "string" ? a.source_file : "",
        sourceType: (typeof a.source_type === "string"
          ? a.source_type
          : "script") as SourceType,
        locationHint: typeof a.location_hint === "string" ? a.location_hint : "",
        emotionalTags: Array.isArray(a.emotional_tags)
          ? (a.emotional_tags as string[])
          : [],
        timestampMs:
          typeof a.timestamp_ms === "number" ? a.timestamp_ms : undefined,
        pageNum: typeof a.page_num === "number" ? a.page_num : undefined,
      };
    });

    if (chunks.length === 0) {
      return NextResponse.json({ scenes: [], warnings: ["No chunks returned from vector search."] });
    }

    if (!anthropicApiKey) {
      return NextResponse.json(
        { scenes: [], warnings: ["ANTHROPIC_API_KEY not configured; scene extraction skipped."] }
      );
    }

    const result = await extractScenes(chunks, anthropicApiKey);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
