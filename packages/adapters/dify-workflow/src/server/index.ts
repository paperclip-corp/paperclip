export { execute } from "./execute.js";
import type {
  AdapterSessionCodec,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentCheck,
} from "@paperclipai/adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const envConfig = parseObject(config.env);

  // Check for API key
  const configApiKey = readNonEmptyString(config.workflowApiKey);
  const envApiKey = readNonEmptyString(envConfig.DIFY_API_KEY);
  const hostApiKey = readNonEmptyString(process.env.DIFY_API_KEY);

  if (configApiKey || envApiKey || hostApiKey) {
    const source = configApiKey
      ? "adapter config"
      : envApiKey
        ? "adapter env"
        : "server environment";
    checks.push({
      code: "dify_api_key_present",
      level: "info",
      message: "Dify API key is configured.",
      detail: `Detected in ${source}.`,
    });
  } else {
    checks.push({
      code: "dify_api_key_missing",
      level: "error",
      message: "No Dify API key detected.",
      hint: "Set workflowApiKey in adapter config or DIFY_API_KEY in environment.",
    });
  }

  // Check base URL
  const baseUrl =
    readNonEmptyString(config.workflowBaseUrl) ||
    readNonEmptyString(envConfig.DIFY_BASE_URL) ||
    readNonEmptyString(process.env.DIFY_BASE_URL) ||
    "https://api.dify.ai";

  checks.push({
    code: "dify_base_url",
    level: "info",
    message: `Dify API endpoint: ${baseUrl}`,
  });

  // Test connectivity if we have an API key
  const apiKey = configApiKey || envApiKey || hostApiKey;
  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/v1/parameters`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 401 || response.status === 403) {
        checks.push({
          code: "dify_auth_failed",
          level: "error",
          message: "Dify API authentication failed.",
          hint: "Check that the API key is valid and has appropriate permissions.",
        });
      } else if (response.ok || response.status === 404) {
        // 404 is acceptable - endpoint may not exist but auth worked
        checks.push({
          code: "dify_connectivity_ok",
          level: "info",
          message: "Dify API is reachable.",
        });
      } else {
        checks.push({
          code: "dify_connectivity_warning",
          level: "warn",
          message: `Dify API returned status ${response.status}`,
          hint: "The API may be temporarily unavailable.",
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      checks.push({
        code: "dify_connectivity_failed",
        level: "error",
        message: `Cannot reach Dify API: ${errMsg}`,
        hint: "Check network connectivity and the base URL configuration.",
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

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const sessionId =
      readNonEmptyString(record.sessionId) ??
      readNonEmptyString(record.session_id);
    if (!sessionId) return null;
    return { sessionId };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const sessionId =
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id);
    if (!sessionId) return null;
    return { sessionId };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return (
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id)
    );
  },
};
