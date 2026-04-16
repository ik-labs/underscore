import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";

import type { RetrievedChunk, Scene, SceneExtractionResult } from "@/lib/project-types";

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a film story analyst. Given corpus evidence (prose excerpts, script fragments, director notes), identify 3 distinct dramatic moments or scenes that would benefit from original music scoring.

STRICT RULES:
- Base ALL scene selections on the provided corpus evidence only
- Each scene must be distinct in mood, location, or dramatic weight
- The description must work as a direct score generation prompt (2 sentences max)
- Return ONLY valid JSON — no markdown, no prose, no explanation

OUTPUT SCHEMA:
{
  "scenes": [
    {
      "title": "string — short scene title (3–6 words)",
      "description": "string — 1-2 sentences describing the scene for score generation, rich in sensory and emotional detail",
      "timecode": "string — optional, e.g. 'Act 1' or 'p.12' if inferable from evidence"
    }
  ]
}`;

// ─── Main export ──────────────────────────────────────────────────────────────

export async function extractScenes(
  chunks: RetrievedChunk[],
  anthropicApiKey: string
): Promise<SceneExtractionResult> {
  const warnings: string[] = [];

  // Build a condensed context from top chunks
  const contextBlock = chunks
    .slice(0, 15)
    .map((c, i) => {
      const loc =
        c.namespace === "prose"
          ? `${c.sourceType}${c.pageNum != null ? `, p.${c.pageNum}` : ""}`
          : `${c.sourceType}${c.timestampMs != null ? `, ${Math.round(c.timestampMs / 1000)}s` : ""}`;
      return `[${i + 1}] (${loc}, ${c.sourceFile}) "${c.text.slice(0, 300).replace(/\n/g, " ")}"`;
    })
    .join("\n\n");

  try {
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `CORPUS EVIDENCE:\n${contextBlock}` }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(jsonText) as { scenes: Omit<Scene, "id">[] };

    if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      throw new Error("Claude returned no scenes");
    }

    const scenes: Scene[] = parsed.scenes.slice(0, 3).map((s) => ({
      id: uuidv4(),
      title: s.title ?? "Untitled Scene",
      description: s.description ?? "",
      timecode: s.timecode,
    }));

    return { scenes, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    warnings.push(`Scene extraction failed: ${msg}`);
    return { scenes: [], warnings };
  }
}
