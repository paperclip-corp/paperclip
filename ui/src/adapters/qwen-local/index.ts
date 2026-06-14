import type { UIAdapterModule } from "../types";
import { createQwenStdoutParser, parseQwenStdoutLine } from "@paperclipai/adapter-qwen-local/ui";
import { buildQwenLocalConfig } from "@paperclipai/adapter-qwen-local/ui";
import { QwenLocalConfigFields } from "./config-fields";

export const qwenLocalUIAdapter: UIAdapterModule = {
  type: "qwen_local",
  label: "Qwen (local)",
  parseStdoutLine: parseQwenStdoutLine,
  createStdoutParser: createQwenStdoutParser,
  ConfigFields: QwenLocalConfigFields,
  buildAdapterConfig: buildQwenLocalConfig,
};
