/**
 * Ties the shipped com.lifeos.pulse.plist template to the substitution code that
 * materializes it (DeployComponents.ts, setup.ts, manage.sh all apply the same two
 * replaceAll calls). If a template token drifts (renamed/removed) or a new one is
 * added, the substitution silently no-ops and launchd tries to exec a literal
 * `__BUN_PATH__` — a start failure with no other coverage. These tests fail on drift.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBunPath } from "../../Tools/InstallEngine";

const PLIST = join(import.meta.dir, "..", "LIFEOS", "PULSE", "com.lifeos.pulse.plist");
const HOME = "/Users/fixture";

// Deterministic absolute bun path (canonical location "present") — no real FS lookup.
const BUN = resolveBunPath({ home: HOME, exists: () => true, execPath: "/unused" });

function materialize(): string {
  return readFileSync(PLIST, "utf-8").replaceAll("__BUN_PATH__", BUN).replaceAll("__HOME__", HOME);
}

describe("com.lifeos.pulse.plist substitution", () => {
  test("template still declares both placeholders (guards token drift)", () => {
    const template = readFileSync(PLIST, "utf-8");
    expect(template).toContain("__BUN_PATH__");
    expect(template).toContain("__HOME__");
  });

  test("materialized plist has zero unsubstituted __PLACEHOLDER__ tokens", () => {
    const leftover = materialize().match(/__[A-Z_]+__/g);
    expect(leftover).toBeNull();
  });

  test("ProgramArguments bun entry is an absolute path", () => {
    const m = materialize().match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
    expect(m).not.toBeNull();
    expect(m![1].startsWith("/")).toBe(true);
  });
});
