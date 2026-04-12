/**
 * Ollama Cloud client.
 * Calls the Ollama native /api/chat endpoint.
 * Requires OLLAMA_API_KEY env var (set in Railway / .env).
 */

const OLLAMA_BASE_URL = "https://ollama.com";
const DEFAULT_MODEL = "gemma4:31b-cloud";
const TIMEOUT_MS = 90_000; // 90 s — allow for slow cloud model starts

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

function getApiKey(): string {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw new OllamaError("OLLAMA_API_KEY is not configured");
  return apiKey;
}

/**
 * Stream a chat completion from Ollama Cloud.
 * Yields raw content string chunks as they arrive.
 * Throws OllamaError on API errors, timeouts, or missing API key.
 */
export async function* streamFromOllama(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { model?: string } = {}
): AsyncGenerator<string> {
  const apiKey = getApiKey();
  const model = opts.model ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaError("Ollama API request timed out");
    }
    throw new OllamaError(
      `Failed to connect to Ollama API: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    clearTimeout(timeout);
    const text = await response.text().catch(() => "");
    throw new OllamaError(
      `Ollama API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`,
      response.status
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    clearTimeout(timeout);
    throw new OllamaError("No response body from Ollama API");
  }

  const decoder = new TextDecoder();
  let lineBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });

      // Ollama streams newline-delimited JSON objects
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed);
          const content = chunk?.message?.content;
          if (typeof content === "string" && content) {
            yield content;
          }
          if (chunk?.done === true) return;
        } catch {
          // skip unparseable lines
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaError("Ollama API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
