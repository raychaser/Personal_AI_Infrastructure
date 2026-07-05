/**
 * Pins the load-bearing ordering invariant of resolveBunPath: canonical install
 * locations are tried BEFORE PATH resolution, so an ephemeral `bun install` shim
 * (under a temporary /private/tmp/bun-node dir) is never baked into a RunAtLoad plist.
 *
 * A future "simplification" to `Bun.which("bun") ?? candidates.find(...)` would
 * silently reintroduce a Pulse service that dies at next login — these tests fail
 * if that reordering happens. resolveBunPath is the single source of truth for the
 * two DeployComponents materializers; setup.ts and manage.sh mirror the same order.
 */
import { describe, expect, test } from "bun:test";
import { resolveBunPath } from "../../Tools/InstallEngine";

const HOME = "/Users/fixture";
const CANON_BUN = `${HOME}/.bun/bin/bun`;
const SHIM = "/private/tmp/bun-node-abc123/bun";

describe("resolveBunPath ordering invariant", () => {
  test("prefers ~/.bun/bin/bun over an ephemeral bun-install PATH shim", () => {
    const got = resolveBunPath({
      home: HOME,
      exists: (p) => p === CANON_BUN,
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(got).toBe(CANON_BUN);
    expect(got).not.toContain("/private/tmp/");
  });

  test("falls back to /opt/homebrew/bin/bun when only that canonical location exists", () => {
    const got = resolveBunPath({
      home: HOME,
      exists: (p) => p === "/opt/homebrew/bin/bun",
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(got).toBe("/opt/homebrew/bin/bun");
  });

  test("falls back to /usr/local/bin/bun when only that canonical location exists", () => {
    const got = resolveBunPath({
      home: HOME,
      exists: (p) => p === "/usr/local/bin/bun",
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(got).toBe("/usr/local/bin/bun");
  });

  test("~/.bun wins when several canonical locations exist (precedence order)", () => {
    const got = resolveBunPath({
      home: HOME,
      exists: (p) => p === CANON_BUN || p === "/opt/homebrew/bin/bun" || p === "/usr/local/bin/bun",
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(got).toBe(CANON_BUN);
  });

  test("uses Bun.which only when NO canonical location exists", () => {
    const got = resolveBunPath({
      home: HOME,
      exists: () => false,
      which: () => "/some/real/path/bun",
      execPath: "/unused/execPath",
    });
    expect(got).toBe("/some/real/path/bun");
  });

  test("uses process.execPath when nothing is on disk and which returns null", () => {
    const got = resolveBunPath({
      home: HOME,
      exists: () => false,
      which: () => null,
      execPath: "/guaranteed/valid/bun",
    });
    expect(got).toBe("/guaranteed/valid/bun");
  });
});
