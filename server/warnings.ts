import type { UsageWarning } from "./types.js";

/**
 * Collapse warnings that repeat per-file (e.g. one BAD_SESSION_JSON per session
 * log) into a single summary entry, so snapshot warnings stay readable. Distinct
 * codes are preserved; warnings sharing a code are merged with a count.
 *
 * Shared by MultiClientUsageService and the per-client sources so both the
 * aggregate and each client's own warning list stay free of noise.
 */
export function coalesceWarnings(warnings: UsageWarning[]): UsageWarning[] {
  const buckets = new Map<string, UsageWarning[]>();
  for (const w of warnings) {
    const key = w.code;
    const list = buckets.get(key);
    if (list) list.push(w);
    else buckets.set(key, [w]);
  }
  const result: UsageWarning[] = [];
  for (const list of buckets.values()) {
    if (list.length === 1) {
      result.push(list[0]!);
    } else {
      const first = list[0]!;
      result.push({ code: first.code, message: `${first.message}（共 ${list.length} 次）` });
    }
  }
  return result;
}
