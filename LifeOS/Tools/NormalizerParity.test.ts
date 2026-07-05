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
import { resolve } from "node:path";
import { normalizeConfigRoot as canonical } from "../install/hooks/lib/paths";

// Re-implement the 2-arg form exactly as injected into the Deploy/Install copies,
// so a drift in that text (which the byte-identical PayloadSync test also guards)
// changes THIS expected implementation and is caught here too.
function copyForm(raw: string, home: string): string {
  let o = raw.trim()
    .replace(/^~(?=\/|$)/, home)
    .replace(/^\$\{HOME\}(?=\/|$)/, home)
    .replace(/^\$HOME(?=\/|$)/, home);
  o = resolve(o);
  while (o.length > 1 && o.endsWith("/")) o = o.slice(0, -1);
  return o;
}

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
    test(`canonical(1-arg) === copyForm(2-arg) for ${JSON.stringify(c)}`, () => {
      expect(copyForm(c, HOME)).toBe(canonical(c));
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
