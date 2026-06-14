import {
  buildSandboxNpmInstallCommand,
  type AdapterModelProfileDefinition,
} from "@paperclipai/adapter-utils";

export const type = "qwen_local";
export const label = "Qwen (local)";

export const SANDBOX_INSTALL_COMMAND = buildSandboxNpmInstallCommand("qwen-cli");

export const DEFAULT_QWEN_LOCAL_MODEL = "qwen-max";

export const models = [
  { id: "qwen-max", label: "Qwen Max" },
  { id: "qwen-plus", label: "Qwen Plus" },
  { id: "qwen-turbo", label: "Qwen Turbo" },
  { id: "qwen2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B" },
  { id: "qwen2.5-72b-instruct", label: "Qwen 2.5 72B" },
  { id: "qwen2.5-32b-instruct", label: "Qwen 2.5 32B" },
  { id: "qwen2.5-14b-instruct", label: "Qwen 2.5 14B" },
  { id: "qwen2.5-7b-instruct", label: "Qwen 2.5 7B" },
];

export const modelProfiles: AdapterModelProfileDefinition[] = [
  {
    key: "cheap",
    label: "Cheap",
    description: "Use Qwen Turbo as the budget Qwen lane while preserving the primary model.",
    adapterConfig: {
      model: "qwen-turbo",
    },
    source: "adapter_default",
  },
];

export const agentConfigurationDoc = `# qwen_local agent configuration

Adapter: qwen_local

Use when:
- You want Paperclip to run a Qwen-based agent locally
- You want to use Alibaba's Qwen models for coding tasks
- You have DASHSCOPE_API_KEY or QWEN_API_KEY configured

Don't use when:
- You need webhook-style external invocation (use http or openclaw_gateway)
- You only need a one-shot script without an AI coding agent loop (use process)
- Qwen API credentials are not available

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- promptTemplate (string, optional): run prompt template
- model (string, optional): Qwen model id. Defaults to qwen-max.
- command (string, optional): defaults to "qwen"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Runs use positional prompt arguments, not stdin.
- Authentication requires DASHSCOPE_API_KEY or QWEN_API_KEY environment variable.
- Compatible with Qwen models from Alibaba Cloud's DashScope service.
`;
