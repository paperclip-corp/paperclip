import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseLineInternal(line: string, ts: string): TranscriptEntry[] {
  if (!line.trim()) return [];

  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) {
    // Not JSON, treat as plain text output
    return [{ kind: "stdout", ts, text: line }];
  }

  const type = asString(parsed.type).trim();

  if (type === "text" || type === "message") {
    const text = asString(parsed.content) || asString(parsed.text) || asString(parsed.message);
    if (!text) return [];
    return [{ kind: "assistant", ts, text, delta: true }];
  }

  if (type === "thinking" || type === "thought") {
    const text = asString(parsed.content) || asString(parsed.thought);
    if (!text) return [];
    return [{ kind: "thinking", ts, text, delta: true }];
  }

  if (type === "tool_use" || type === "function_call") {
    const toolName = asString(parsed.name) || asString(parsed.tool) || asString(parsed.function);
    const toolInput = parsed.input || parsed.arguments || parsed.params;
    const toolUseId = asString(parsed.id) || asString(parsed.tool_use_id) || "";
    return [{ kind: "tool_call", ts, name: toolName, input: toolInput, toolUseId }];
  }

  if (type === "tool_result" || type === "function_result") {
    const toolName = asString(parsed.name) || asString(parsed.tool) || asString(parsed.function);
    const toolUseId = asString(parsed.id) || asString(parsed.tool_use_id) || "";
    const toolResult = parsed.result || parsed.output;
    const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult, null, 2);
    const isError = Boolean(parsed.is_error || parsed.isError);
    return [{ kind: "tool_result", ts, toolUseId, toolName, content: resultStr, isError }];
  }

  if (type === "error" || parsed.error) {
    const text = asString(parsed.error) || asString(parsed.message);
    return text ? [{ kind: "stderr", ts, text }] : [{ kind: "stderr", ts, text: "Qwen error" }];
  }

  if (type === "end" || type === "result") {
    const sessionId = asString(parsed.sessionId).trim();
    const summary = asString(parsed.summary).trim();
    const parts = [
      summary ? `summary: ${summary}` : "",
      sessionId ? `session=${sessionId}` : "",
    ].filter(Boolean);
    return [{ kind: "system", ts, text: parts.join(" ") || "run completed" }];
  }

  // Unknown event type
  return [{ kind: "system", ts, text: `event: ${type || "unknown"}` }];
}

export function createQwenStdoutParser() {
  return {
    parseLine(line: string, ts: string): TranscriptEntry[] {
      return parseLineInternal(line, ts);
    },
    reset() {
      // No state to reset for Qwen parser
    },
  };
}

// Stateless fallback for callers that haven't migrated to the stateful factory.
export function parseQwenStdoutLine(line: string, ts: string): TranscriptEntry[] {
  return parseLineInternal(line, ts);
}
