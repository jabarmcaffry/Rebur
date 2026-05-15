/**
 * Translate ECS / system errors into OOP-style messages so creators never see
 * "entity 42 missing Transform component" — they see
 * "[MyScript:14] Object.position.set: object was destroyed".
 */
import type { CommandOrigin } from "../commands/command";

const ECS_VOCAB = [
  [/\bentity (\d+)\b/g, "object"],
  [/\bcomponent\b/g, "property"],
  [/\barchetype\b/g, "object kind"],
  [/\bworld\b/g, "scene"],
  [/\bsystem\b/g, "engine step"],
] as const;

export function translateError(err: unknown, origin: CommandOrigin | undefined): Error {
  const original = err instanceof Error ? err : new Error(String(err));
  let msg = original.message;
  for (const [re, replacement] of ECS_VOCAB) {
    msg = msg.replace(re, replacement);
  }
  const prefix = origin?.script
    ? `[${origin.script}${origin.line ? `:${origin.line}` : ""}] ${origin.apiPath ?? ""}`.trimEnd() + ": "
    : "";
  const out = new Error(prefix + msg);
  out.stack = original.stack; // preserve for our debug overlay
  return out;
}
