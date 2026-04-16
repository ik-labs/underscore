const kvRequiredKeys = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN",
] as const;

const ingestRequiredKeys = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "TURBOPUFFER_API_KEY",
] as const;

export class MissingServerEnvError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(`Missing server environment variables: ${missing.join(", ")}`);
    this.name = "MissingServerEnvError";
    this.missing = missing;
  }
}

function readEnvValue(key: string) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function missingKeys(keys: readonly string[]) {
  return keys.filter((key) => !readEnvValue(key));
}

export function assertKvEnv() {
  const missing = missingKeys(kvRequiredKeys);

  if (missing.length > 0) {
    throw new MissingServerEnvError(missing);
  }
}

export function assertPhase1IngestEnv() {
  const missing = missingKeys(ingestRequiredKeys);

  if (missing.length > 0) {
    throw new MissingServerEnvError(missing);
  }

  return {
    googleApiKey: readEnvValue("GOOGLE_GENERATIVE_AI_API_KEY"),
    turbopufferApiKey: readEnvValue("TURBOPUFFER_API_KEY"),
  };
}

export function getAnthropicApiKey() {
  const apiKey = readEnvValue("ANTHROPIC_API_KEY");
  return apiKey.length > 0 ? apiKey : null;
}

export function assertPhase3RetrievalEnv() {
  const missing = missingKeys([
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "TURBOPUFFER_API_KEY",
  ]);

  if (missing.length > 0) {
    throw new MissingServerEnvError(missing);
  }

  return {
    googleApiKey: readEnvValue("GOOGLE_GENERATIVE_AI_API_KEY"),
    turbopufferApiKey: readEnvValue("TURBOPUFFER_API_KEY"),
    anthropicApiKey: getAnthropicApiKey(),
    hfApiKey: getHuggingFaceApiKey(),
  };
}

export function getHuggingFaceApiKey() {
  const key = readEnvValue("HUGGINGFACE_API_KEY");
  return key.length > 0 ? key : null;
}

export function assertPhase4SynthesisEnv() {
  const missing = missingKeys([
    "ANTHROPIC_API_KEY",
    "ELEVENLABS_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
  ]);

  if (missing.length > 0) {
    throw new MissingServerEnvError(missing);
  }

  return {
    anthropicApiKey: readEnvValue("ANTHROPIC_API_KEY"),
    elevenLabsApiKey: readEnvValue("ELEVENLABS_API_KEY"),
    blobToken: readEnvValue("BLOB_READ_WRITE_TOKEN"),
  };
}

export function assertPhase2AudioEnv() {
  const missing = missingKeys([
    "HUGGINGFACE_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
    "TURBOPUFFER_API_KEY",
  ]);

  if (missing.length > 0) {
    throw new MissingServerEnvError(missing);
  }

  return {
    hfApiKey: readEnvValue("HUGGINGFACE_API_KEY"),
    blobToken: readEnvValue("BLOB_READ_WRITE_TOKEN"),
    turbopufferApiKey: readEnvValue("TURBOPUFFER_API_KEY"),
  };
}
