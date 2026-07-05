/**
 * Parity guard for the two DELIBERATELY-MIRRORED bun resolvers:
 *   - InstallEngine.resolveBunPath   (the single source of truth, imported by the
 *     DeployComponents materializers)
 *   - setup.ts resolveBunForPlist    (a hand-copy inlined into PULSE/, which ships
 *     standalone without the Tools/ sibling and so cannot import the canonical one)
 *
 * resolveBunPath.test.ts and setup-bun-path.test.ts each pin one copy's ordering in
 * ISOLATION, but nothing asserted the two produce IDENTICAL {bunPath, source} for
 * the same injected inputs. That is the mirror-drift class the PR already guards for
 * materializePulsePlist (plist-substitution.test.ts iterates BOTH copies) — the bun
 * resolvers were left unguarded. If someone adds "/usr/bin/bun" to one candidate
 * list, reorders a tier, or changes the execPath fallback in only one copy, both
 * isolated suites stay green while the shipped setup.ts install path bakes a
 * different bun into the persistent plist than the DeployComponents path does. This
 * table-driven test drives both resolvers over the same matrix and fails the moment
 * they diverge.
 */
import { describe, expect, test } from "bun:test";
import { resolveBunPath } from "../../Tools/InstallEngine";
import { resolveBunForPlist } from "../LIFEOS/PULSE/setup";

const HOME = "/Users/fixture";
const CANON_BUN = `${HOME}/.bun/bin/bun`;
const HOMEBREW = "/opt/homebrew/bin/bun";
const USRLOCAL = "/usr/local/bin/bun";
const SHIM = "/private/tmp/bun-node-abc123/bun";

type Opts = Parameters<typeof resolveBunPath>[0];

// Each row is ONE injected environment fed identically to both resolvers.
const matrix: { name: string; opts: Opts }[] = [
  {
    name: "canonical present (~/.bun/bin/bun) — PATH shim ignored",
    opts: { home: HOME, exists: (p) => p === CANON_BUN, which: () => SHIM, execPath: "/unused/execPath" },
  },
  {
    name: "only /opt/homebrew/bin/bun on disk",
    opts: { home: HOME, exists: (p) => p === HOMEBREW, which: () => SHIM, execPath: "/unused/execPath" },
  },
  {
    name: "only /usr/local/bin/bun on disk",
    opts: { home: HOME, exists: (p) => p === USRLOCAL, which: () => SHIM, execPath: "/unused/execPath" },
  },
  {
    name: "all three canonical locations on disk (precedence order)",
    opts: {
      home: HOME,
      exists: (p) => p === CANON_BUN || p === HOMEBREW || p === USRLOCAL,
      which: () => SHIM,
      execPath: "/unused/execPath",
    },
  },
  {
    name: "none on disk + PATH returns a shim → source=path",
    opts: { home: HOME, exists: () => false, which: () => SHIM, execPath: "/unused/execPath" },
  },
  {
    name: "none on disk + which returns null → source=execPath",
    opts: { home: HOME, exists: () => false, which: () => null, execPath: "/guaranteed/valid/bun" },
  },
];

describe("resolveBunPath vs setup.ts resolveBunForPlist parity", () => {
  for (const { name, opts } of matrix) {
    test(name, () => {
      const canonical = resolveBunPath(opts);
      const mirror = resolveBunForPlist(opts);
      // The mirrors MUST agree on both fields — a drift in either bakes a different
      // bun into the persistent plist depending on which install path ran.
      expect(mirror).toEqual(canonical);
    });
  }
});
