/**
 * Pins the two behavioral contracts around ComponentResult.warnings — the whole
 * user-facing safety net for a non-canonical bun (a Pulse launchd service that dies
 * at next login, a failure the healthz probe explicitly cannot catch):
 *
 *  (a) NON-FATAL: a populated `warnings` must NOT flip the run's ok to false. The
 *      run predicate (componentResultOk) deliberately factors in blockers/error/probe
 *      but OMITS warnings. Without this test a refactor that adds `r.warnings?.length`
 *      to the fail predicate (turning every non-canonical-bun install into exit 1),
 *      or one that stops populating warnings, ships green.
 *
 *  (b) SURFACING: a source of "path"/"execPath" actually produces a warning entry
 *      (bunResolutionWarning), while "canonical" produces none. plist-substitution
 *      .test.ts asserts materializePulsePlist RETURNS the source but stops short of
 *      the surfacing its own comment claims ("deployPulse pushes it to
 *      ComponentResult.warnings"). This closes that gap.
 *
 * Runs against BOTH DeployComponents copies (Tools/ + install/skills/ mirror) so the
 * contract can't drift between them.
 */
import { describe, expect, test } from "bun:test";
import {
  bunResolutionWarning as bunWarnTools,
  componentResultOk as okTools,
} from "../../Tools/DeployComponents";
import {
  bunResolutionWarning as bunWarnSkills,
  componentResultOk as okSkills,
} from "../skills/LifeOS/Tools/DeployComponents";

const SHIM = "/private/tmp/bun-node-abc123/bun";
const CANON = "/Users/fixture/.bun/bin/bun";

// Minimal valid ComponentResult; spread + override per case.
const base = { component: "pulse" as const, ready: true, actions: [] as string[], blockers: [] as string[] };

const copies = [
  { name: "Tools/ copy", ok: okTools, warn: bunWarnTools },
  { name: "install/skills/ mirror", ok: okSkills, warn: bunWarnSkills },
] as const;

for (const { name, ok, warn } of copies) {
  describe(`${name}: componentResultOk contract`, () => {
    test("clean result → ok:true", () => {
      expect(ok({ ...base })).toBe(true);
    });

    test("(a) populated warnings does NOT flip ok to false", () => {
      expect(ok({ ...base, warnings: ["bun resolved via PATH …"] })).toBe(true);
      // Even alongside a passing probe.
      expect(
        ok({ ...base, warnings: ["x"], probe: { name: "pulse-healthz", passed: true, detail: "200" } }),
      ).toBe(true);
    });

    test("blockers still yield ok:false", () => {
      expect(ok({ ...base, blockers: ["PULSE not in live tree"] })).toBe(false);
    });

    test("error still yields ok:false", () => {
      expect(ok({ ...base, error: "plist template missing" })).toBe(false);
    });

    test("a failing probe still yields ok:false (even with warnings present)", () => {
      expect(
        ok({ ...base, warnings: ["x"], probe: { name: "pulse-healthz", passed: false, detail: "000" } }),
      ).toBe(false);
    });
  });

  describe(`${name}: bunResolutionWarning surfacing`, () => {
    test("canonical → no warning (null)", () => {
      expect(warn("canonical", CANON)).toBeNull();
    });

    test("source=path → non-empty warning naming PATH and the ephemeral risk", () => {
      const w = warn("path", SHIM);
      expect(w).not.toBeNull();
      expect(w).toContain(SHIM);
      expect(w).toContain("PATH");
      expect(w).toContain("next login");
    });

    test("source=execPath → non-empty warning naming process.execPath", () => {
      const w = warn("execPath", "/some/exec/bun");
      expect(w).not.toBeNull();
      expect(w).toContain("process.execPath");
      expect(w).toContain("/some/exec/bun");
    });
  });
}
