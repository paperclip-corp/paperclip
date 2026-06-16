import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { asNumber, asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

const DEFAULT_DIFY_BASE_URL = "https://api.dify.ai";
const DEFAULT_TIMEOUT_SEC = 120;

interface DifyWorkflowResponse {
  task_id: string;
  workflow_run_id: string;
  data: {
    id: string;
    workflow_id: string;
    status: "running" | "succeeded" | "failed" | "stopped";
    outputs: Record<string, unknown>;
    error?: string | null;
    elapsed_time: number;
    total_tokens: number;
    total_steps: number;
    created_at: number;
    finished_at: number;
  };
}

interface DifyStreamEvent {
  event: string;
  task_id?: string;
  workflow_run_id?: string;
  data?: {
    id?: string;
    node_id?: string;
    node_type?: string;
    title?: string;
    index?: number;
    outputs?: Record<string, unknown>;
    status?: string;
    error?: string;
    elapsed_time?: number;
    total_tokens?: number;
  };
}

function getApiKey(config: Record<string, unknown>, env: Record<string, string>): string | null {
  const configKey = asString(config.workflowApiKey, "").trim();
  if (configKey) return configKey;

  if (env.DIFY_API_KEY?.trim()) return env.DIFY_API_KEY.trim();
  return null;
}

function getBaseUrl(config: Record<string, unknown>, env: Record<string, string>): string {
  const configUrl = asString(config.workflowBaseUrl, "").trim();
  if (configUrl) return configUrl.replace(/\/$/, "");

  if (env.DIFY_BASE_URL?.trim()) return env.DIFY_BASE_URL.trim().replace(/\/$/, "");
  return DEFAULT_DIFY_BASE_URL;
}

async function callDifyWorkflowBlocking(params: {
  baseUrl: string;
  apiKey: string;
  inputs: Record<string, unknown>;
  user: string;
  onLog: (stream: "stdout" | "stderr", data: string) => Promise<void>;
  signal?: AbortSignal;
}): Promise<{
  outputs: Record<string, unknown>;
  totalTokens: number;
  elapsedTime: number;
  error: string | null;
}> {
  const { baseUrl, apiKey, inputs, user, onLog, signal } = params;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/workflows/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs,
        response_mode: "blocking",
        user,
      }),
      signal,
    });
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    await onLog("stderr", `[dify] Network error: ${errMsg}\n`);
    return {
      outputs: {},
      totalTokens: 0,
      elapsedTime: 0,
      error: `Network error: ${errMsg}`,
    };
  }

  if (!response.ok) {
    const errorText = await response.text();
    return {
      outputs: {},
      totalTokens: 0,
      elapsedTime: 0,
      error: `API error ${response.status}: ${errorText}`,
    };
  }

  try {
    const result = await response.json() as DifyWorkflowResponse;

    if (result.data.status === "failed") {
      return {
        outputs: result.data.outputs,
        totalTokens: result.data.total_tokens,
        elapsedTime: result.data.elapsed_time,
        error: result.data.error || "Workflow failed",
      };
    }

    return {
      outputs: result.data.outputs,
      totalTokens: result.data.total_tokens,
      elapsedTime: result.data.elapsed_time,
      error: null,
    };
  } catch (parseError) {
    const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
    return {
      outputs: {},
      totalTokens: 0,
      elapsedTime: 0,
      error: `Parse error: ${errMsg}`,
    };
  }
}

async function callDifyWorkflowStreaming(params: {
  baseUrl: string;
  apiKey: string;
  inputs: Record<string, unknown>;
  user: string;
  onLog: (stream: "stdout" | "stderr", data: string) => Promise<void>;
  signal?: AbortSignal;
}): Promise<{
  outputs: Record<string, unknown>;
  totalTokens: number;
  elapsedTime: number;
  error: string | null;
}> {
  const { baseUrl, apiKey, inputs, user, onLog, signal } = params;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/workflows/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs,
        response_mode: "streaming",
        user,
      }),
      signal,
    });
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    await onLog("stderr", `[dify] Network error: ${errMsg}\n`);
    return {
      outputs: {},
      totalTokens: 0,
      elapsedTime: 0,
      error: `Network error: ${errMsg}`,
    };
  }

  if (!response.ok) {
    const errorText = await response.text();
    return {
      outputs: {},
      totalTokens: 0,
      elapsedTime: 0,
      error: `API error ${response.status}: ${errorText}`,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      outputs: {},
      totalTokens: 0,
      elapsedTime: 0,
      error: "No response body",
    };
  }

  const decoder = new TextDecoder();
  let outputs: Record<string, unknown> = {};
  let totalTokens = 0;
  let elapsedTime = 0;
  let error: string | null = null;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        try {
          const event = JSON.parse(trimmed.slice(6)) as DifyStreamEvent;

          if (event.event === "workflow_finished" && event.data) {
            if (event.data.outputs) {
              outputs = event.data.outputs;
            }
            if (event.data.total_tokens) {
              totalTokens = event.data.total_tokens;
            }
            if (event.data.elapsed_time) {
              elapsedTime = event.data.elapsed_time;
            }
            if (event.data.status === "failed" && event.data.error) {
              error = event.data.error;
            }
          } else if (event.event === "node_finished" && event.data) {
            await onLog("stdout", JSON.stringify({
              type: "node",
              node: event.data.title,
              status: event.data.status
            }) + "\n");
          } else if (event.event === "error" && event.data?.error) {
            error = event.data.error;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { outputs, totalTokens, elapsedTime, error };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;

  const configObj = parseObject(config);
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, ...envConfig }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  // Get API key and base URL
  const apiKey = getApiKey(configObj, env);
  if (!apiKey) {
    await onLog("stderr", "[dify] Error: No API key found. Set workflowApiKey in config or DIFY_API_KEY environment variable.\n");
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "No API key found. Set workflowApiKey in agent config or DIFY_API_KEY environment variable.",
      errorCode: "dify_auth_required",
    };
  }

  const baseUrl = getBaseUrl(configObj, env);
  const responseMode = asString(config.responseMode, "blocking");
  const timeoutSec = asNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC);

  // Build inputs from config and context
  const configInputs = parseObject(config.inputs);
  const contextInputs = parseObject(context.difyInputs);
  const wakePayload = parseObject(context.paperclipWake);

  const inputs: Record<string, unknown> = {
    ...configInputs,
    ...contextInputs,
    date: new Date().toISOString().split("T")[0],
  };

  // Add any relevant context as inputs
  if (wakePayload.prompt) {
    inputs.prompt = wakePayload.prompt;
  }

  const user = `paperclip-${agent.id}-${runId}`;

  if (onMeta) {
    await onMeta({
      adapterType: "dify_workflow",
      command: `Dify Workflow API (${responseMode})`,
      cwd: process.cwd(),
      commandNotes: [`Calling ${baseUrl}/v1/workflows/run`],
      commandArgs: [`inputs=${JSON.stringify(inputs)}`],
      env: { DIFY_BASE_URL: baseUrl },
      prompt: JSON.stringify(inputs, null, 2),
      context,
    });
  }

  await onLog("stdout", `[dify] Starting Dify workflow call to ${baseUrl}\n`);
  await onLog("stdout", `[dify] Inputs: ${JSON.stringify(inputs)}\n`);

  // Set up timeout
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeoutSec > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);
  }

  try {
    const callFn = responseMode === "streaming" ? callDifyWorkflowStreaming : callDifyWorkflowBlocking;

    const result = await callFn({
      baseUrl,
      apiKey,
      inputs,
      user,
      onLog,
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (result.error) {
      const isAuthError = result.error.toLowerCase().includes("auth") ||
                          result.error.toLowerCase().includes("api key") ||
                          result.error.toLowerCase().includes("unauthorized") ||
                          result.error.includes("401");

      await onLog("stderr", `[dify] Workflow error: ${result.error}\n`);

      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: result.error,
        errorCode: isAuthError ? "dify_auth_required" : null,
      };
    }

    // Extract the main output text
    const outputText = Object.values(result.outputs)
      .filter((v): v is string => typeof v === "string")
      .join("\n");

    await onLog("stdout", JSON.stringify({
      type: "workflow_complete",
      outputs: result.outputs,
      totalTokens: result.totalTokens,
      elapsedTime: result.elapsedTime,
    }) + "\n");

    // Generate session ID
    const sessionId = `dify-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      errorMessage: null,
      usage: {
        inputTokens: Math.floor(result.totalTokens * 0.3),
        outputTokens: Math.floor(result.totalTokens * 0.7),
      },
      sessionId,
      sessionParams: { sessionId, outputs: result.outputs },
      sessionDisplayId: sessionId,
      provider: "dify",
      biller: "dify",
      model: "workflow",
      billingType: "api",
      summary: outputText.slice(0, 500),
    };
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        exitCode: null,
        signal: "SIGTERM",
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
      };
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    await onLog("stderr", `[dify] Error: ${errorMessage}\n`);

    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
      errorCode: errorMessage.toLowerCase().includes("network") ? "dify_network_unavailable" : null,
    };
  }
}
