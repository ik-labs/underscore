import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";
import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { Music, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

import { getProject } from "@/lib/projects";
import {
  assertKvEnv,
  assertPhase1IngestEnv,
  assertPhase4SynthesisEnv,
  MissingServerEnvError,
} from "@/lib/server-env";
import type { SourceType } from "@/lib/project-types";

export const runtime = "nodejs";
export const maxDuration = 180;

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

  let ingestEnv: ReturnType<typeof assertPhase1IngestEnv>;
  let synthEnv: ReturnType<typeof assertPhase4SynthesisEnv>;

  try {
    ingestEnv = assertPhase1IngestEnv();
    synthEnv = assertPhase4SynthesisEnv();
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

  try {
    // Fetch representative corpus chunks with a broad thematic query
    const google = createGoogleGenerativeAI({ apiKey: ingestEnv.googleApiKey });
    const { embedding } = await embed({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      value: "film narrative arc emotional journey themes conflict resolution",
    });

    const tpuf = new Turbopuffer({ apiKey: ingestEnv.turbopufferApiKey });
    const proseNs = tpuf.namespace(project.proseNamespaceId);

    const results = await proseNs.query({
      vector: embedding,
      distance_metric: "cosine_distance",
      top_k: 15,
      include_attributes: true,
      filters: ["project_id", "Eq", project.id],
    });

    const contextBlock = results
      .map((r, i) => {
        const a = r.attributes ?? {};
        const text = typeof a.text === "string" ? a.text : "";
        const sourceFile = typeof a.source_file === "string" ? a.source_file : "";
        const sourceType = typeof a.source_type === "string"
          ? (a.source_type as SourceType)
          : "script";
        return `[${i + 1}] (${sourceType}, ${sourceFile}) "${text.slice(0, 300).replace(/\n/g, " ")}"`;
      })
      .join("\n\n");

    // Claude generates a comprehensive film-arc music prompt
    const anthropic = new Anthropic({ apiKey: synthEnv.anthropicApiKey });
    const claudeRes = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 600,
      system: `You are a film music supervisor. Generate a single comprehensive music prompt for a 120-second title track that captures the entire emotional and thematic arc of the film.

STRICT RULES:
- NEVER reference real artists, bands, composers, or trademarked works
- Base all creative decisions on the provided corpus evidence
- Return ONLY valid JSON — no markdown, no prose

OUTPUT SCHEMA:
{
  "prompt": "string — detailed music generation prompt for a 120s cinematic title cue covering the full film arc"
}`,
      messages: [
        {
          role: "user",
          content: `PROJECT: ${project.name}\n\nCORPUS EVIDENCE:\n${contextBlock}`,
        },
      ],
    });

    const rawText = claudeRes.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");

    const parsed = JSON.parse(jsonText) as { prompt: string };

    if (!parsed.prompt) {
      throw new Error("Claude returned empty prompt for title track");
    }

    // Generate via ElevenLabs with 120s target
    const music = new Music({ apiKey: synthEnv.elevenLabsApiKey });

    let result;
    try {
      result = await music.composeDetailed({
        prompt: parsed.prompt,
        musicLengthMs: 120000,
      });
    } catch (err) {
      if (err instanceof ElevenLabsError && err.statusCode === 422) {
        const body = err.body as Record<string, unknown> | null | undefined;
        if (
          body?.status === "bad_prompt" &&
          typeof body.prompt_suggestion === "string"
        ) {
          result = await music.composeDetailed({
            prompt: body.prompt_suggestion,
            musicLengthMs: 120000,
          });
        } else if (
          body?.status === "bad_composition_plan" &&
          body.composition_plan_suggestion
        ) {
          result = await music.composeDetailed({
            compositionPlan: body.composition_plan_suggestion as Parameters<
              typeof music.composeDetailed
            >[0] extends { compositionPlan?: infer P } ? P : never,
            musicLengthMs: 120000,
          });
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const key = `title-tracks/${project.id}/${uuidv4()}.mp3`;
    const { url } = await put(key, result.audio, {
      access: "private",
      token: synthEnv.blobToken,
      contentType: "audio/mpeg",
    });

    const blobUrl = `/api/audio?u=${encodeURIComponent(url)}`;

    return NextResponse.json(
      {
        blobUrl,
        compositionPlan: result.json?.compositionPlan,
        warnings: [],
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
