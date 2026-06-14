import type { AdapterSkillContext, AdapterSkillSnapshot } from "@paperclipai/adapter-utils";

export async function listQwenSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
  // Qwen doesn't have a native skills system like Claude or Gemini
  // Return empty snapshot for now - skills can be injected via instructions
  return {
    adapterType: ctx.adapterType,
    supported: false,
    mode: "unsupported",
    desiredSkills: [],
    entries: [],
    warnings: [],
  };
}

export async function syncQwenSkills(ctx: AdapterSkillContext, desiredSkills: string[]): Promise<AdapterSkillSnapshot> {
  // No-op for Qwen adapter
  // Skills are handled via instructions file injection
  return {
    adapterType: ctx.adapterType,
    supported: false,
    mode: "unsupported",
    desiredSkills,
    entries: [],
    warnings: [],
  };
}
