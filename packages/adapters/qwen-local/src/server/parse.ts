interface QwenResultEvent {
  type?: string;
  error?: string;
  message?: string;
  sessionId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  summary?: string;
  question?: string;
}

interface ParsedQwenOutput {
  sessionId: string | null;
  resultEvent: QwenResultEvent | null;
  errorMessage: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  costUsd: number | null;
  summary: string | null;
}

export function parseQwenJsonl(stdout: string): ParsedQwenOutput {
  const result: ParsedQwenOutput = {
    sessionId: null,
    resultEvent: null,
    errorMessage: null,
    usage: null,
    costUsd: null,
    summary: null,
  };

  const lines = stdout.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as QwenResultEvent;

      if (parsed.sessionId) {
        result.sessionId = parsed.sessionId;
      }

      if (parsed.type === "result" || parsed.type === "error") {
        result.resultEvent = parsed;
      }

      if (parsed.error) {
        result.errorMessage = parsed.error;
      }

      if (parsed.usage) {
        result.usage = {
          inputTokens: parsed.usage.inputTokens ?? 0,
          outputTokens: parsed.usage.outputTokens ?? 0,
        };
      }

      if (parsed.summary) {
        result.summary = parsed.summary;
      }
    } catch {
      // Not JSON, skip
    }
  }

  return result;
}

export function isQwenSessionUnrecoverableError(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return (
    combined.includes("session not found") ||
    combined.includes("session expired") ||
    combined.includes("invalid session")
  );
}

export function isQwenTransientNetworkError(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return (
    combined.includes("network error") ||
    combined.includes("connection refused") ||
    combined.includes("timeout") ||
    combined.includes("econnreset") ||
    combined.includes("enotfound")
  );
}

export function describeQwenFailure(resultEvent: QwenResultEvent | null): string | null {
  if (!resultEvent) return null;
  if (resultEvent.error) return resultEvent.error;
  if (resultEvent.message) return resultEvent.message;
  return null;
}

export function detectQwenAuthRequired(params: {
  parsed: QwenResultEvent | null;
  stdout: string;
  stderr: string;
}): { requiresAuth: boolean; reason?: string } {
  const { parsed, stdout, stderr } = params;
  const combined = `${stdout}\n${stderr}`.toLowerCase();

  if (
    combined.includes("invalid api key") ||
    combined.includes("authentication failed") ||
    combined.includes("unauthorized") ||
    combined.includes("dashscope_api_key") ||
    combined.includes("qwen_api_key")
  ) {
    return { requiresAuth: true, reason: "API key required" };
  }

  if (parsed?.error?.toLowerCase().includes("auth")) {
    return { requiresAuth: true, reason: parsed.error };
  }

  return { requiresAuth: false };
}
