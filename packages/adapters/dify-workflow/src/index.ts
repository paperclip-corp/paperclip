export const type = "dify_workflow";
export const label = "Dify Workflow";

export const models = [
  { id: "workflow", label: "Dify Workflow" },
];

export const agentConfigurationDoc = `# dify_workflow agent configuration

Adapter: dify_workflow

Use when:
- You want to run a Dify workflow as a Paperclip agent
- You have a pre-configured Dify workflow that generates reports/content
- You want to integrate AI workflows from Dify into Paperclip

Don't use when:
- You need interactive AI coding (use claude_local, qwen_local, etc.)
- You need real-time conversation (use chat adapters)

Core fields:
- workflowApiKey (string, required): Dify app API key (starts with app-)
- workflowBaseUrl (string, optional): Dify API base URL. Defaults to https://api.dify.ai
- inputs (object, optional): Input parameters to pass to the workflow
- responseMode (string, optional): "blocking" or "streaming". Defaults to "blocking"
- timeoutSec (number, optional): Timeout in seconds. Defaults to 120

Environment variables:
- DIFY_API_KEY: Alternative way to set the API key
- DIFY_BASE_URL: Alternative way to set the base URL

Notes:
- The workflow output is returned as the agent's response
- Supports both blocking and streaming response modes
- Results include token usage for cost tracking
`;
