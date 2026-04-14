const hardRequiredKeys = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "TURBOPUFFER_API_KEY",
  "ELEVENLABS_API_KEY",
] as const;

const softRequiredKeys = [
  "ANTHROPIC_API_KEY",
  "HUGGINGFACE_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN",
] as const;

type HardRequiredKey = (typeof hardRequiredKeys)[number];
type SoftRequiredKey = (typeof softRequiredKeys)[number];

function readEnvValue(key: string) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function collectPhase0Env() {
  const hardMissing = hardRequiredKeys.filter((key) => !readEnvValue(key));
  const softMissing = softRequiredKeys.filter((key) => !readEnvValue(key));

  return {
    hardMissing,
    softMissing,
    values: Object.fromEntries(
      [...hardRequiredKeys, ...softRequiredKeys].map((key) => [key, readEnvValue(key)])
    ) as Record<HardRequiredKey | SoftRequiredKey, string>,
  };
}

export function assertPhase0Env() {
  const env = collectPhase0Env();

  if (env.hardMissing.length > 0) {
    throw new Error(
      `Missing required Phase 0 environment variables: ${env.hardMissing.join(", ")}`
    );
  }

  return env;
}
