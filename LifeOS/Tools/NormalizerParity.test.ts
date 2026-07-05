// Pins every config-root normalizer to byte-identical output. The recurring
// fail-open class in this PR was "divergent normalizers" — the guard resolving
// a different root than tools/daemons. This test makes divergence a CI failure.
//
// The canonical is paths.normalizeConfigRoot(p) (1-arg, uses homedir()). The
// DeployComponents/InstallEngine copies are 2-arg (raw, home) because they run
// in standalone-build contexts that cannot import paths.ts at a byte-identical
// relative path across their dev/payload depths. This test asserts the 2-arg
// copies produce the SAME result as the canonical for home === homedir().
import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { normalizeConfigRoot as canonical } from "../install/hooks/lib/paths";
// Import the REAL 2-arg copies the twins actually run — not a re-implementation —
// so a drift in either copy's regex/ordering fails this test (that's the point).
import { normalizeConfigRoot as deployCopy } from "./DeployComponents";
import { normalizeConfigRoot as installCopy } from "./InstallEngine";

const HOME = homedir();
const CASES = [
  "~/cfg",
  "$HOME/cfg",
  "${HOME}/cfg",
  "/a/b/../cfg",
  "/clean/root",
  "/trailing/slash///",
  "~",
];

describe("all config-root normalizers agree", () => {
  for (const c of CASES) {
    test(`DeployComponents + InstallEngine copies === canonical for ${JSON.stringify(c)}`, () => {
      expect(deployCopy(c, HOME)).toBe(canonical(c));
      expect(installCopy(c, HOME)).toBe(canonical(c));
    });
    test(`${JSON.stringify(c)} normalizes to a clean absolute path`, () => {
      const out = canonical(c);
      expect(out.startsWith("/")).toBe(true);
      expect(out.includes("~")).toBe(false);
      expect(out.includes("$")).toBe(false);
      expect(out.includes("/../")).toBe(false);
      if (out.length > 1) expect(out.endsWith("/")).toBe(false);
    });
  }
});
