import pc from "picocolors";

export interface QwenEvent {
  type?: string;
  content?: string;
  text?: string;
  message?: string;
  name?: string;
  tool?: string;
  function?: string;
  input?: unknown;
  arguments?: unknown;
  params?: unknown;
  result?: unknown;
  output?: unknown;
  thought?: string;
  error?: string;
  sessionId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export function formatQwenEvent(event: QwenEvent): string {
  const lines: string[] = [];

  if (event.type === "text" || event.type === "message") {
    const content = event.content || event.text || event.message || "";
    lines.push(content);
  } else if (event.type === "tool_use" || event.type === "function_call") {
    const toolName = event.name || event.tool || event.function || "unknown";
    const input = event.input || event.arguments || event.params;
    lines.push(pc.cyan(`[Tool: ${toolName}]`));
    if (input) {
      lines.push(pc.dim(JSON.stringify(input, null, 2)));
    }
  } else if (event.type === "tool_result" || event.type === "function_result") {
    const toolName = event.name || event.tool || event.function || "unknown";
    const result = event.result || event.output;
    lines.push(pc.green(`[Result: ${toolName}]`));
    if (result) {
      const resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      lines.push(pc.dim(resultStr));
    }
  } else if (event.type === "thinking" || event.type === "thought") {
    const thought = event.content || event.thought || "";
    lines.push(pc.yellow(`[Thinking] ${thought}`));
  } else if (event.type === "error" || event.error) {
    const error = event.error || event.message || "Unknown error";
    lines.push(pc.red(`[Error] ${error}`));
  } else if (event.sessionId) {
    lines.push(pc.dim(`[Session: ${event.sessionId}]`));
  } else if (event.usage) {
    const { inputTokens, outputTokens, totalTokens } = event.usage;
    const parts: string[] = [];
    if (inputTokens !== undefined) parts.push(`in: ${inputTokens}`);
    if (outputTokens !== undefined) parts.push(`out: ${outputTokens}`);
    if (totalTokens !== undefined) parts.push(`total: ${totalTokens}`);
    if (parts.length > 0) {
      lines.push(pc.dim(`[Usage: ${parts.join(", ")}]`));
    }
  }

  return lines.join("\n");
}
