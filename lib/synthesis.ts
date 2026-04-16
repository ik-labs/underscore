import Anthropic from "@anthropic-ai/sdk";
import { Music, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";

import type {
  ClaudeSynthesisOutput,
  MusicPromptShape,
  RetrievedChunk,
  ScoreVariant,
  SynthesisResult,
} from "@/lib/project-types";

// ─── Input type ───────────────────────────────────────────────────────────────

export interface SynthesisInput {
  projectId: string;
  sceneText: string;
  voiceTranscript?: string;
  chunks: RetrievedChunk[];
  anthropicApiKey: string;
  elevenLabsApiKey: string;
  blobToken: string;
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContextBlock(chunks: RetrievedChunk[]): string {
  return chunks
    .slice(0, 12)
    .map((c, i) => {
      const loc =
        c.namespace === "prose"
          ? `${c.sourceType}${c.pageNum != null ? `, p.${c.pageNum}` : ""}`
          : `${c.sourceType}${c.timestampMs != null ? `, ${Math.round(c.timestampMs / 1000)}s` : ""}`;
      const lines: string[] = [
        `[${i + 1}] (${c.namespace}, ${loc}, ${c.sourceFile}) "${c.text.slice(0, 200).replace(/\n/g, " ")}"`,
      ];
      if (c.sonicSignature) {
        lines.push(`    sonic_signature: "${c.sonicSignature}"`);
      }
      if (c.emotionalTags.length > 0) {
        lines.push(`    tags: [${c.emotionalTags.join(", ")}]`);
      }
      if (c.locationHint) {
        lines.push(`    location: "${c.locationHint}"`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

// ─── Claude call ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a film music supervisor translating scene evidence into precise ElevenLabs music generation prompts.

STRICT RULES:
- NEVER reference real artists, bands, composers, film titles, or trademarked works by name
- Base ALL creative decisions on the provided corpus evidence
- Return ONLY valid JSON — no markdown, no prose, no explanation

OUTPUT SCHEMA (return exactly this structure):
{
  "cueBrief": {
    "mood": "string — one concise phrase, e.g. 'melancholic dread'",
    "tempo": "string — e.g. 'slow, 60 bpm' or 'building tension, 80–120 bpm'",
    "instrumentation": "string — key instruments, e.g. 'solo piano, distant strings, sparse percussion'",
    "avoidArtists": ["string — descriptions of styles/genres to avoid, NOT artist names"],
    "keyThemes": ["string"],
    "sourceAttribution": ["string — source file names from the evidence used"]
  },
  "prompts": [
    {
      "shape": "fast_burst",
      "prompt": "string — energetic 15–30s burst for quick cuts; punchy, immediate, high contrast"
    },
    {
      "shape": "cinematic",
      "prompt": "string — full atmospheric arc (60–180s feel); builds and releases tension"
    },
    {
      "shape": "voice_weighted",
      "prompt": "string — foregrounds tonal/textural qualities that complement the director's voice; if no voice transcript, similar to cinematic but more intimate"
    }
  ]
}`;

async function callClaude(
  sceneText: string,
  voiceTranscript: string | undefined,
  contextBlock: string,
  anthropicApiKey: string
): Promise<ClaudeSynthesisOutput> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const userContent = [
    `SCENE DESCRIPTION:\n${sceneText}`,
    voiceTranscript
      ? `DIRECTOR'S VOICE NOTE (transcribed):\n${voiceTranscript}`
      : null,
    `CORPUS EVIDENCE:\n${contextBlock}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Strip optional markdown code fences
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(jsonText) as ClaudeSynthesisOutput;

  if (!parsed.cueBrief || !Array.isArray(parsed.prompts) || parsed.prompts.length !== 3) {
    throw new Error("Claude returned malformed synthesis JSON");
  }

  return parsed;
}

// ─── ElevenLabs + Blob ────────────────────────────────────────────────────────

type BadPromptBody = { status: "bad_prompt"; prompt_suggestion: string };
type BadPlanBody = {
  status: "bad_composition_plan";
  composition_plan_suggestion: unknown;
};

function extractSuggestion(
  error: ElevenLabsError
): { kind: "prompt"; value: string } | { kind: "plan"; value: unknown } | null {
  if (error.statusCode !== 422) return null;
  const body = error.body as Record<string, unknown> | null | undefined;
  if (!body) return null;
  if (body.status === "bad_prompt" && typeof body.prompt_suggestion === "string") {
    return { kind: "prompt", value: (body as BadPromptBody).prompt_suggestion };
  }
  if (body.status === "bad_composition_plan" && body.composition_plan_suggestion) {
    return { kind: "plan", value: (body as BadPlanBody).composition_plan_suggestion };
  }
  return null;
}

async function generateAndUpload(
  prompt: string,
  shape: MusicPromptShape,
  projectId: string,
  elevenLabsApiKey: string,
  blobToken: string
): Promise<ScoreVariant> {
  const music = new Music({ apiKey: elevenLabsApiKey });

  let result;
  try {
    result = await music.composeDetailed({ prompt });
  } catch (err) {
    if (err instanceof ElevenLabsError) {
      const suggestion = extractSuggestion(err);
      if (suggestion?.kind === "prompt") {
        // Retry once with ElevenLabs' copyright-safe suggestion
        result = await music.composeDetailed({ prompt: suggestion.value });
      } else if (suggestion?.kind === "plan") {
        result = await music.composeDetailed({
          compositionPlan: suggestion.value as Parameters<
            typeof music.composeDetailed
          >[0] extends { compositionPlan?: infer P } ? P : never,
        });
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const key = `scores/${projectId}/${uuidv4()}.mp3`;
  const { url } = await put(key, result.audio, {
    access: "private",
    token: blobToken,
    contentType: "audio/mpeg",
  });

  // Route through our proxy so private blobs are playable in the browser
  const proxyUrl = `/api/audio?u=${encodeURIComponent(url)}`;

  return {
    shape,
    blobUrl: proxyUrl,
    compositionPlan: result.json?.compositionPlan,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function synthesizeAndGenerate(
  input: SynthesisInput
): Promise<SynthesisResult> {
  const {
    projectId,
    sceneText,
    voiceTranscript,
    chunks,
    anthropicApiKey,
    elevenLabsApiKey,
    blobToken,
  } = input;

  if (chunks.length === 0) {
    throw new Error(
      "No corpus evidence retrieved; synthesis requires at least one matched chunk."
    );
  }

  const contextBlock = buildContextBlock(chunks);

  // Claude call — throws on failure (caller catches → synthesis: null)
  const claudeOutput = await callClaude(
    sceneText,
    voiceTranscript,
    contextBlock,
    anthropicApiKey
  );

  // Three parallel ElevenLabs generations
  const promptEntries = claudeOutput.prompts;
  const settled = await Promise.allSettled(
    promptEntries.map((p) =>
      generateAndUpload(
        p.prompt,
        p.shape,
        projectId,
        elevenLabsApiKey,
        blobToken
      )
    )
  );

  const variants: ScoreVariant[] = [];
  const warnings: string[] = [];

  settled.forEach((result, i) => {
    const shape = promptEntries[i]!.shape;
    if (result.status === "fulfilled") {
      variants.push(result.value);
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : "unknown error";
      warnings.push(`Score variant "${shape}" failed: ${msg}`);
    }
  });

  return {
    cueBrief: claudeOutput.cueBrief,
    variants,
    warnings,
  };
}
