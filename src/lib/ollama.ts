/**
 * Ollama Cloud client.
 * Calls the Ollama native /api/chat endpoint with JSON mode.
 * Requires OLLAMA_API_KEY env var (set in Railway / .env).
 */

const OLLAMA_BASE_URL = "https://ollama.com";
const DEFAULT_MODEL = "gemma4:31b-cloud";
const TIMEOUT_MS = 60_000; // 60 s — large model generation can be slow

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

/**
 * Send a chat completion request to Ollama Cloud.
 * Returns the content string from the model's response message.
 * Throws OllamaError on API errors, timeouts, or missing API key.
 */
export async function generateFromOllama(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { model?: string } = {}
): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    throw new OllamaError("OLLAMA_API_KEY is not configured");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: "json",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OllamaError(
        `Ollama API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`,
        response.status
      );
    }

    const data = await response.json();
    // Ollama /api/chat response shape: { message: { role, content }, done, ... }
    const content = data?.message?.content;
    if (typeof content !== "string") {
      throw new OllamaError("Unexpected response format from Ollama API");
    }

    return content;
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaError("Ollama API request timed out after 60 seconds");
    }
    throw new OllamaError(
      `Failed to connect to Ollama API: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}
