/**
 * Ties the shipped com.lifeos.pulse.plist template to the REAL substitution code
 * that materializes it — materializePulsePlist() in BOTH DeployComponents copies
 * (the live Tools/ copy and the shipped install/skills/ mirror). It USED to
 * reimplement the two replaceAll calls in a local helper (importing only
 * resolveBunPath), so a regression in the production materializer — a dropped
 * __BUN_PATH__ replace, a dropped resolveBunPath call, or reordered subs, in
 * either copy — left the suite green while shipping a plist whose ProgramArguments
 * launchd cannot exec (a dead Pulse service). Now it imports and calls the
 * production helper directly, in both copies. setup.ts and manage.sh mirror the
 * same two substitutions.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { materializePulsePlist as materializeTools } from "../../Tools/DeployComponents";
import { materializePulsePlist as materializeSkills } from "../skills/LifeOS/Tools/DeployComponents";

const PLIST = join(import.meta.dir, "..", "LIFEOS", "PULSE", "com.lifeos.pulse.plist");
const HOME = "/Users/fixture";
const template = readFileSync(PLIST, "utf-8");

// Deterministic bun resolution — canonical location "present", no real FS lookup.
const CANON_OPTS = { exists: () => true, execPath: "/unused" } as const;
// Deterministic non-canonical resolution — nothing on disk, PATH returns a shim.
const SHIM = "/private/tmp/bun-node-abc123/bun";
const SHIM_OPTS = { exists: () => false, which: () => SHIM, execPath: "/unused" } as const;

const copies = [
  { name: "Tools/ copy", materialize: materializeTools },
  { name: "install/skills/ mirror", materialize: materializeSkills },
] as const;

describe("com.lifeos.pulse.plist substitution", () => {
  test("template still declares both placeholders (guards token drift)", () => {
    expect(template).toContain("__BUN_PATH__");
    expect(template).toContain("__HOME__");
  });

  for (const { name, materialize } of copies) {
    describe(name, () => {
      test("materialized plist has zero unsubstituted __PLACEHOLDER__ tokens", () => {
        const { materialized } = materialize(template, HOME, CANON_OPTS);
        expect(materialized.match(/__[A-Z_]+__/g)).toBeNull();
      });

      test("ProgramArguments bun entry is an absolute path", () => {
        const { materialized } = materialize(template, HOME, CANON_OPTS);
        const m = materialized.match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
        expect(m).not.toBeNull();
        expect(m![1].startsWith("/")).toBe(true);
      });

      test("__HOME__ is substituted with the provided home", () => {
        const { materialized } = materialize(template, HOME, CANON_OPTS);
        expect(materialized).toContain(`${HOME}/.claude/LIFEOS/PULSE`);
        expect(materialized).not.toContain("__HOME__");
      });

      test("canonical bun resolves to an absolute path with source=canonical", () => {
        const { bunPath, source } = materialize(template, HOME, CANON_OPTS);
        expect(bunPath).toBe(`${HOME}/.bun/bin/bun`);
        expect(source).toBe("canonical");
      });

      test("non-canonical bun is surfaced via source (drives the install-time warn)", () => {
        const { bunPath, source, materialized } = materialize(template, HOME, SHIM_OPTS);
        expect(bunPath).toBe(SHIM);
        expect(source).toBe("path");
        // The shim is still baked in — the warning, not a substitution failure, is
        // the safety net (deployPulse pushes it to ComponentResult.warnings).
        expect(materialized).toContain(SHIM);
      });
    });
  }
});
