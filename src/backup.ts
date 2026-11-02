import { z } from "zod";
import { stateSchema, type State } from "./domain";
const digest = async (state: State) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(state)),
      ),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
export async function createBackup(
  state: State,
  createdAt = new Date().toISOString(),
) {
  const validated = stateSchema.parse(state);
  return {
    format: "reflection-compass-backup" as const,
    version: 2 as const,
    createdAt,
    state: validated,
    checksum: await digest(validated),
  };
}
export async function parseBackup(input: unknown) {
  const envelope = z
    .object({
      format: z.string(),
      version: z.number().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      state: stateSchema,
      checksum: z.string().optional(),
    })
    .parse(input);
  if (envelope.format === "reflection-compass-v1")
    return {
      state: envelope.state,
      createdAt: envelope.updatedAt ?? "",
      legacy: true,
    };
  if (envelope.format !== "reflection-compass-backup" || envelope.version !== 2)
    throw new Error("不支持的备份格式或版本。");
  if (envelope.checksum !== (await digest(envelope.state)))
    throw new Error("备份校验失败，文件可能损坏或被修改。");
  if (!envelope.createdAt || Number.isNaN(Date.parse(envelope.createdAt)))
    throw new Error("备份时间无效。");
  return {
    state: envelope.state,
    createdAt: envelope.createdAt,
    legacy: false,
  };
}
export function backupSummary(state: State) {
  return {
    days: Object.keys(state.days).length,
    actions: Object.values(state.days).reduce(
      (n, day) => n + day.actions.length,
      0,
    ),
    reflections: Object.values(state.days).reduce(
      (n, day) => n + day.reflections.length,
      0,
    ),
  };
}
