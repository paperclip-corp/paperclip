import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  parseObject,
  ensurePathInEnv,
} from "@paperclipai/adapter-utils/server-utils";
import {
  ensureAdapterExecutionTargetCommandResolvable,
  ensureAdapterExecutionTargetDirectory,
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget,
  resolveAdapterExecutionTargetCwd,
} from "@paperclipai/adapter-utils/execution-target";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "qwen");
  const target = ctx.executionTarget ?? null;
  const targetIsRemote = target?.kind === "remote";
  const cwd = resolveAdapterExecutionTargetCwd(target, asString(config.cwd, ""), process.cwd());
  const targetLabel = targetIsRemote
    ? ctx.environmentName ?? describeAdapterExecutionTarget(target)
    : null;
  const runId = `qwen-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (targetLabel) {
    checks.push({
      code: "qwen_environment_target",
      level: "info",
      message: `Probing inside environment: ${targetLabel}`,
    });
  }

  try {
    await ensureAdapterExecutionTargetDirectory(runId, target, cwd, {
      cwd,
      env: {},
      createIfMissing: true,
    });
    checks.push({
      code: "qwen_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "qwen_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  try {
    await ensureAdapterExecutionTargetCommandResolvable(command, target, cwd, runtimeEnv);
    checks.push({
      code: "qwen_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "qwen_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
    });
  }

  // Check for API key
  const configDashscopeApiKey = env.DASHSCOPE_API_KEY;
  const hostDashscopeApiKey = targetIsRemote ? undefined : process.env.DASHSCOPE_API_KEY;
  const configQwenApiKey = env.QWEN_API_KEY;
  const hostQwenApiKey = targetIsRemote ? undefined : process.env.QWEN_API_KEY;

  if (
    isNonEmpty(configDashscopeApiKey) ||
    isNonEmpty(hostDashscopeApiKey) ||
    isNonEmpty(configQwenApiKey) ||
    isNonEmpty(hostQwenApiKey)
  ) {
    const source = isNonEmpty(configDashscopeApiKey) || isNonEmpty(configQwenApiKey)
      ? "adapter config env"
      : "server environment";
    checks.push({
      code: "qwen_api_key_present",
      level: "info",
      message: "Qwen API credentials are set for authentication.",
      detail: `Detected in ${source}.`,
    });
  } else {
    checks.push({
      code: "qwen_api_key_missing",
      level: "warn",
      message: "No Qwen API key detected.",
      hint: "Set DASHSCOPE_API_KEY or QWEN_API_KEY in adapter env or server environment.",
    });
  }

  const canRunProbe =
    checks.every((check) => check.code !== "qwen_cwd_invalid" && check.code !== "qwen_command_unresolvable");

  if (canRunProbe && command === "qwen") {
    const helloProbeTimeoutSec = 60;
    const args = ["--help"];

    try {
      const probe = await runAdapterExecutionTargetProcess(
        runId,
        target,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: helloProbeTimeoutSec,
          graceSec: 5,
          onLog: async () => { },
        },
      );

      if (probe.timedOut) {
        checks.push({
          code: "qwen_probe_timed_out",
          level: "warn",
          message: "Qwen CLI probe timed out.",
          hint: "Retry the probe. If this persists, verify Qwen CLI can run from this directory manually.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        checks.push({
          code: "qwen_probe_passed",
          level: "info",
          message: "Qwen CLI probe succeeded.",
        });
      } else {
        checks.push({
          code: "qwen_probe_failed",
          level: "error",
          message: "Qwen CLI probe failed.",
          detail: probe.stderr?.trim().slice(0, 240) || undefined,
          hint: "Run `qwen --help` manually in this working directory to debug.",
        });
      }
    } catch (err) {
      checks.push({
        code: "qwen_probe_error",
        level: "error",
        message: err instanceof Error ? err.message : "Probe execution failed",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
