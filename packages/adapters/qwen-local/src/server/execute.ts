import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  adapterExecutionTargetIsRemote,
  adapterExecutionTargetRemoteCwd,
  adapterExecutionTargetSessionIdentity,
  adapterExecutionTargetSessionMatches,
  readAdapterExecutionTarget,
} from "@paperclipai/adapter-utils/execution-target";
import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  buildInvocationEnvForLogs,
  ensureAbsoluteDirectory,
  joinPromptSections,
  refreshPaperclipWorkspaceEnvForExecution,
  readPaperclipIssueWorkModeFromContext,
  parseObject,
  renderTemplate,
  renderPaperclipWakePrompt,
  stringifyPaperclipWakePayload,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_QWEN_LOCAL_MODEL, SANDBOX_INSTALL_COMMAND } from "../index.js";
import fs from "node:fs/promises";

// DashScope API endpoints - use international by default for broader compatibility
const DASHSCOPE_API_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

interface QwenMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface QwenStreamDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
}

interface QwenStreamChoice {
  index: number;
  delta: QwenStreamDelta;
  finish_reason: string | null;
}

interface QwenStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: QwenStreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface QwenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

function hasNonEmptyEnvValue(env: Record<string, string>, key: string): boolean {
  const raw = env[key];
  return typeof raw === "string" && raw.trim().length > 0;
}

function getApiKey(env: Record<string, string>): string | null {
  if (hasNonEmptyEnvValue(env, "DASHSCOPE_API_KEY")) {
    return env.DASHSCOPE_API_KEY.trim();
  }
  if (hasNonEmptyEnvValue(env, "QWEN_API_KEY")) {
    return env.QWEN_API_KEY.trim();
  }
  return null;
}

function renderPaperclipEnvNote(env: Record<string, string>): string {
  const paperclipKeys = Object.keys(env)
    .filter((key) => key.startsWith("PAPERCLIP_"))
    .sort();
  if (paperclipKeys.length === 0) return "";
  return [
    "Paperclip runtime note:",
    `The following PAPERCLIP_* environment variables are available in this run: ${paperclipKeys.join(", ")}`,
    "Do not assume these variables are missing without checking your shell environment.",
    "",
    "",
  ].join("\n");
}

function renderApiAccessNote(env: Record<string, string>): string {
  if (!hasNonEmptyEnvValue(env, "PAPERCLIP_API_URL") || !hasNonEmptyEnvValue(env, "PAPERCLIP_API_KEY")) return "";
  return [
    "Paperclip API access note:",
    "Use curl to make Paperclip API requests.",
    "GET example:",
    `  curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_URL/api/agents/me"`,
    "POST/PATCH example:",
    `  curl -s -X POST -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H 'Content-Type: application/json' -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" -d '{...}' "$PAPERCLIP_API_URL/api/issues/{id}/checkout"`,
    "",
    "",
  ].join("\n");
}

async function callQwenApi(params: {
  apiKey: string;
  model: string;
  messages: QwenMessage[];
  onLog: (stream: "stdout" | "stderr", data: string) => Promise<void>;
  signal?: AbortSignal;
}): Promise<{
  content: string;
  reasoningContent: string;
  usage: QwenUsage | null;
  error: string | null;
}> {
  const { apiKey, model, messages, onLog, signal } = params;

  let response: Response;
  try {
    response = await fetch(`${DASHSCOPE_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
      signal,
    });
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    await onLog("stderr", `[qwen] Network error: ${errMsg}\n`);
    return {
      content: "",
      reasoningContent: "",
      usage: null,
      error: `Network error: ${errMsg}`,
    };
  }

  if (!response.ok) {
    const errorText = await response.text();
    return {
      content: "",
      reasoningContent: "",
      usage: null,
      error: `API error ${response.status}: ${errorText}`,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      content: "",
      reasoningContent: "",
      usage: null,
      error: "No response body",
    };
  }

  const decoder = new TextDecoder();
  let content = "";
  let reasoningContent = "";
  let usage: QwenUsage | null = null;
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
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const chunk = JSON.parse(trimmed.slice(6)) as QwenStreamChunk;

          for (const choice of chunk.choices) {
            if (choice.delta.content) {
              content += choice.delta.content;
              await onLog("stdout", JSON.stringify({ type: "text", content: choice.delta.content }) + "\n");
            }
            if (choice.delta.reasoning_content) {
              reasoningContent += choice.delta.reasoning_content;
              await onLog("stdout", JSON.stringify({ type: "thinking", content: choice.delta.reasoning_content }) + "\n");
            }
          }

          if (chunk.usage) {
            usage = chunk.usage;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content, reasoningContent, usage, error: null };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;
  const executionTarget = readAdapterExecutionTarget({
    executionTarget: ctx.executionTarget,
    legacyRemoteExecution: ctx.executionTransport?.remoteExecution,
  });
  const executionTargetIsRemote = adapterExecutionTargetIsRemote(executionTarget);

  const promptTemplate = asString(
    config.promptTemplate,
    DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  );
  const model = asString(config.model, DEFAULT_QWEN_LOCAL_MODEL).trim();

  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const workspaceId = asString(workspaceContext.workspaceId, "");
  const workspaceRepoUrl = asString(workspaceContext.repoUrl, "");
  const workspaceRepoRef = asString(workspaceContext.repoRef, "");
  const agentHome = asString(workspaceContext.agentHome, "");
  const workspaceHints = Array.isArray(context.paperclipWorkspaces)
    ? context.paperclipWorkspaces.filter(
      (value): value is Record<string, unknown> => typeof value === "object" && value !== null,
    )
    : [];
  const configuredCwd = asString(config.cwd, "");
  const useConfiguredInsteadOfAgentHome = workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  const effectiveExecutionCwd = adapterExecutionTargetRemoteCwd(executionTarget, cwd);
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const envConfig = parseObject(config.env);
  const hasExplicitApiKey =
    typeof envConfig.PAPERCLIP_API_KEY === "string" && envConfig.PAPERCLIP_API_KEY.trim().length > 0;
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  // Copy API keys from envConfig
  if (typeof envConfig.DASHSCOPE_API_KEY === "string") {
    env.DASHSCOPE_API_KEY = envConfig.DASHSCOPE_API_KEY;
  }
  if (typeof envConfig.QWEN_API_KEY === "string") {
    env.QWEN_API_KEY = envConfig.QWEN_API_KEY;
  }

  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim().length > 0 && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim().length > 0 && context.issueId.trim()) ||
    null;
  const wakeReason =
    typeof context.wakeReason === "string" && context.wakeReason.trim().length > 0
      ? context.wakeReason.trim()
      : null;
  const wakeCommentId =
    (typeof context.wakeCommentId === "string" && context.wakeCommentId.trim().length > 0 && context.wakeCommentId.trim()) ||
    (typeof context.commentId === "string" && context.commentId.trim().length > 0 && context.commentId.trim()) ||
    null;
  const approvalId =
    typeof context.approvalId === "string" && context.approvalId.trim().length > 0
      ? context.approvalId.trim()
      : null;
  const approvalStatus =
    typeof context.approvalStatus === "string" && context.approvalStatus.trim().length > 0
      ? context.approvalStatus.trim()
      : null;
  const linkedIssueIds = Array.isArray(context.issueIds)
    ? context.issueIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const wakePayloadJson = stringifyPaperclipWakePayload(context.paperclipWake);
  const issueWorkMode = readPaperclipIssueWorkModeFromContext(context);
  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;
  if (issueWorkMode) env.PAPERCLIP_ISSUE_WORK_MODE = issueWorkMode;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (linkedIssueIds.length > 0) env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds.join(",");
  if (wakePayloadJson) env.PAPERCLIP_WAKE_PAYLOAD_JSON = wakePayloadJson;
  refreshPaperclipWorkspaceEnvForExecution({
    env,
    envConfig,
    workspaceCwd: effectiveWorkspaceCwd,
    workspaceSource,
    workspaceId,
    workspaceRepoUrl,
    workspaceRepoRef,
    workspaceHints,
    agentHome,
    executionTargetIsRemote,
    executionCwd: effectiveExecutionCwd,
  });
  if (!hasExplicitApiKey && authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  const effectiveEnv = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  // Check for API key
  const apiKey = getApiKey(effectiveEnv);
  if (!apiKey) {
    await onLog("stderr", "[qwen] Error: No API key found. Set DASHSCOPE_API_KEY or QWEN_API_KEY environment variable.\n");
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "No API key found. Set DASHSCOPE_API_KEY or QWEN_API_KEY in environment variables.",
      errorCode: "qwen_auth_required",
    };
  }

  const timeoutSec = asNumber(config.timeoutSec, 0);
  const loggedEnv = buildInvocationEnvForLogs(env, {
    runtimeEnv: effectiveEnv,
    includeRuntimeKeys: ["HOME"],
  });

  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const runtimeSessionId = asString(runtimeSessionParams.sessionId, runtime.sessionId ?? "");
  const runtimeSessionCwd = asString(runtimeSessionParams.cwd, "");
  const runtimeRemoteExecution = parseObject(runtimeSessionParams.remoteExecution);
  const canResumeSession =
    runtimeSessionId.length > 0 &&
    (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === path.resolve(effectiveExecutionCwd)) &&
    adapterExecutionTargetSessionMatches(runtimeRemoteExecution, executionTarget);
  const sessionId = canResumeSession ? runtimeSessionId : null;

  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  const instructionsDir = instructionsFilePath ? `${path.dirname(instructionsFilePath)}/` : "";
  let instructionsPrefix = "";
  if (instructionsFilePath) {
    try {
      const instructionsContents = await fs.readFile(instructionsFilePath, "utf8");
      instructionsPrefix =
        `${instructionsContents}\n\n` +
        `The above agent instructions were loaded from ${instructionsFilePath}. ` +
        `Resolve any relative file references from ${instructionsDir}.\n\n`;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await onLog(
        "stdout",
        `[paperclip] Warning: could not read agent instructions file "${instructionsFilePath}": ${reason}\n`,
      );
    }
  }

  const bootstrapPromptTemplate = asString(config.bootstrapPromptTemplate, "");
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const renderedBootstrapPrompt =
    !sessionId && bootstrapPromptTemplate.trim().length > 0
      ? renderTemplate(bootstrapPromptTemplate, templateData).trim()
      : "";
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: Boolean(sessionId) });
  const shouldUseResumeDeltaPrompt = Boolean(sessionId) && wakePrompt.length > 0;
  const renderedPrompt = shouldUseResumeDeltaPrompt ? "" : renderTemplate(promptTemplate, templateData);
  const sessionHandoffNote = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const paperclipEnvNote = renderPaperclipEnvNote(env);
  const apiAccessNote = renderApiAccessNote(env);
  const prompt = joinPromptSections([
    instructionsPrefix,
    renderedBootstrapPrompt,
    wakePrompt,
    sessionHandoffNote,
    paperclipEnvNote,
    apiAccessNote,
    renderedPrompt,
  ]);
  const promptMetrics = {
    promptChars: prompt.length,
    instructionsChars: instructionsPrefix.length,
    bootstrapPromptChars: renderedBootstrapPrompt.length,
    wakePromptChars: wakePrompt.length,
    sessionHandoffChars: sessionHandoffNote.length,
    runtimeNoteChars: paperclipEnvNote.length + apiAccessNote.length,
    heartbeatPromptChars: renderedPrompt.length,
  };

  const commandNotes = ["Using DashScope API for Qwen model execution."];
  if (instructionsFilePath && instructionsPrefix.length > 0) {
    commandNotes.push(
      `Loaded agent instructions from ${instructionsFilePath}`,
      `Prepended instructions + path directive to prompt (relative references from ${instructionsDir}).`,
    );
  }

  if (onMeta) {
    await onMeta({
      adapterType: "qwen_local",
      command: "DashScope API",
      cwd: effectiveExecutionCwd,
      commandNotes,
      commandArgs: [`model=${model}`, `<prompt ${prompt.length} chars>`],
      env: loggedEnv,
      prompt,
      promptMetrics,
      context,
    });
  }

  await onLog("stdout", `[qwen] Starting Qwen API call with model: ${model}\n`);

  // Build messages for the API
  const messages: QwenMessage[] = [
    {
      role: "user",
      content: prompt,
    },
  ];

  // Set up timeout if configured
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeoutSec > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);
  }

  try {
    await onLog("stdout", `[qwen] Calling DashScope API: ${DASHSCOPE_API_BASE}/chat/completions\n`);

    const result = await callQwenApi({
      apiKey,
      model,
      messages,
      onLog,
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (result.error) {
      const isAuthError = result.error.toLowerCase().includes("auth") ||
                          result.error.toLowerCase().includes("api key") ||
                          result.error.toLowerCase().includes("unauthorized") ||
                          result.error.includes("401");

      await onLog("stderr", `[qwen] API error: ${result.error}\n`);

      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: result.error,
        errorCode: isAuthError ? "qwen_auth_required" : null,
      };
    }

    // Generate a session ID for tracking
    const newSessionId = sessionId || `qwen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sessionParams = {
      sessionId: newSessionId,
      cwd: effectiveExecutionCwd,
      ...(workspaceId ? { workspaceId } : {}),
      ...(workspaceRepoUrl ? { repoUrl: workspaceRepoUrl } : {}),
      ...(workspaceRepoRef ? { repoRef: workspaceRepoRef } : {}),
      ...(executionTargetIsRemote
        ? { remoteExecution: adapterExecutionTargetSessionIdentity(executionTarget) }
        : {}),
    };

    // Log the end event
    await onLog("stdout", JSON.stringify({
      type: "end",
      sessionId: newSessionId,
      summary: result.content.slice(0, 200),
    }) + "\n");

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      errorMessage: null,
      usage: result.usage ? {
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
      } : undefined,
      sessionId: newSessionId,
      sessionParams,
      sessionDisplayId: newSessionId,
      provider: "alibaba",
      biller: "alibaba",
      model,
      billingType: "api",
      summary: result.content.slice(0, 500),
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
    await onLog("stderr", `[qwen] Error: ${errorMessage}\n`);

    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
      errorCode: errorMessage.toLowerCase().includes("network") ? "qwen_network_unavailable" : null,
    };
  }
}
