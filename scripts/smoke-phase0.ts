import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Music } from "@elevenlabs/elevenlabs-js";
import { Turbopuffer } from "@turbopuffer/turbopuffer";

import { assertPhase0Env } from "../lib/phase0-env";

const smokeText = "underscore phase zero smoke test";
const smokeNamespaceId = "underscore-phase0-smoke-prose";
const smokeVectorId = "phase0-smoke-vector";

function loadLocalEnvFiles() {
  const maybeLoadEnvFile = (
    process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }
  ).loadEnvFile;

  if (!maybeLoadEnvFile) {
    return;
  }

  for (const file of [".env", ".env.local"]) {
    try {
      maybeLoadEnvFile(file);
    } catch (error) {
      const maybeNodeError = error as NodeJS.ErrnoException;

      if (maybeNodeError.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function logSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function runGeminiSmokeTest(apiKey: string) {
  logSection("Gemini Embedding");

  const google = createGoogleGenerativeAI({ apiKey });

  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: smokeText,
  });

  console.log(`Embedding length: ${embedding.length}`);

  return embedding;
}

async function runTurbopufferSmokeTest(apiKey: string, embedding: number[]) {
  logSection("turbopuffer");

  const tpuf = new Turbopuffer({ apiKey });
  const namespace = tpuf.namespace(smokeNamespaceId);

  await namespace.upsert({
    distance_metric: "cosine_distance",
    vectors: [
      {
        id: smokeVectorId,
        vector: embedding,
        attributes: {
          text: smokeText,
          source: "phase0-smoke",
          created_at: new Date().toISOString(),
        },
      },
    ],
    schema: {
      text: {
        type: "string",
        full_text_search: true,
      },
      source: {
        type: "string",
        filterable: true,
      },
      created_at: {
        type: "string",
        filterable: true,
      },
    },
  });

  const results = await namespace.query({
    vector: embedding,
    distance_metric: "cosine_distance",
    top_k: 1,
    include_attributes: true,
  });

  if (results.length === 0 || results[0]?.id !== smokeVectorId) {
    throw new Error("turbopuffer smoke query did not return the expected record");
  }

  const count = await namespace.approxNumVectors();

  console.log(`Namespace: ${smokeNamespaceId}`);
  console.log(`Approx vector count: ${count}`);
  console.log(`Top result distance: ${results[0]?.dist ?? "n/a"}`);
}

async function runElevenLabsSmokeTest(apiKey: string) {
  logSection("ElevenLabs Music");

  const music = new Music({ apiKey });

  const response = await music.composeDetailed({
    prompt:
      "Instrumental ambient cue with restrained piano, soft pulse, and a calm cinematic swell.",
    musicLengthMs: 3000,
    forceInstrumental: true,
    outputFormat: "mp3_22050_32",
    modelId: "music_v1",
  });

  const sectionCount = response.json.compositionPlan.sections.length;

  console.log(`Filename: ${response.filename}`);
  console.log(`Metadata title: ${response.json.songMetadata.title}`);
  console.log(`Composition sections: ${sectionCount}`);
  console.log(`Audio bytes: ${response.audio.byteLength}`);
}

async function main() {
  loadLocalEnvFiles();

  const env = assertPhase0Env();

  if (env.softMissing.length > 0) {
    console.warn(
      `Soft-missing Phase 0 env vars: ${env.softMissing.join(", ")}`
    );
  }

  const embedding = await runGeminiSmokeTest(
    env.values.GOOGLE_GENERATIVE_AI_API_KEY
  );
  await runTurbopufferSmokeTest(env.values.TURBOPUFFER_API_KEY, embedding);
  await runElevenLabsSmokeTest(env.values.ELEVENLABS_API_KEY);

  console.log("\nPhase 0 smoke tests passed.");
}

main().catch((error) => {
  console.error("\nPhase 0 smoke tests failed.");
  console.error(error);
  process.exitCode = 1;
});
