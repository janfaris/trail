import OpenAI, { AzureOpenAI } from "openai";

/**
 * Returns an OpenAI-compatible client. Prefers Azure OpenAI when
 * AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT are set, otherwise
 * falls back to direct OpenAI via OPENAI_API_KEY. Returns null if
 * neither is configured, so callers can treat AI as best-effort.
 */
let _client: OpenAI | null = null;
let _isAzure = false;

export function aiClient(): OpenAI | null {
  if (_client) return _client;

  const azKey = process.env.AZURE_OPENAI_API_KEY;
  const azEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (azKey && azEndpoint) {
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
    _client = new AzureOpenAI({
      apiKey: azKey,
      endpoint: azEndpoint,
      apiVersion,
    }) as unknown as OpenAI;
    _isAzure = true;
    return _client;
  }

  const oaKey = process.env.OPENAI_API_KEY;
  if (oaKey) {
    _client = new OpenAI({ apiKey: oaKey });
    _isAzure = false;
    return _client;
  }
  return null;
}

export function isAzure(): boolean {
  // ensure client init has run
  aiClient();
  return _isAzure;
}

/**
 * Resolve which model identifier to pass for chat completions.
 * On Azure this MUST be the deployment name, not the upstream model name.
 */
export function textModel(): string {
  if (isAzure()) {
    return process.env.AZURE_OPENAI_GPT_DEPLOYMENT || "gpt-5.4-mini";
  }
  return process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";
}

/**
 * Resolve which model identifier to pass for embeddings.
 * On Azure this MUST be the deployment name.
 */
export function embeddingModel(): string {
  if (isAzure()) {
    return process.env.AZURE_OPENAI_EMBED_DEPLOYMENT || "text-embedding-3-small";
  }
  return process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
}
