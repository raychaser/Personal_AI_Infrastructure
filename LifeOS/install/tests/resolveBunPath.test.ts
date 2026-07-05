/**
 * Pins the load-bearing ordering invariant of resolveBunPath: canonical install
 * locations are tried BEFORE PATH resolution, so an ephemeral `bun install` shim
 * (under a temporary /private/tmp/bun-node dir) is never baked into a RunAtLoad plist.
 *
 * A future "simplification" to `Bun.which("bun") ?? candidates.find(...)` would
 * silently reintroduce a Pulse service that dies at next login — these tests fail
 * if that reordering happens. resolveBunPath is the single source of truth for the
 * two DeployComponents materializers; setup.ts and manage.sh mirror the same order.
 *
 * Also pins the `source` tier the caller uses to decide when to warn: canonical
 * resolution is silent, PATH/execPath fallbacks MUST be surfaced at install time
 * (a non-canonical bun likely does not survive next login).
 */
import { describe, expect, test } from "bun:test";
import { resolveBunPath } from "../../Tools/InstallEngine";

const HOME = "/Users/fixture";
const CANON_BUN = `${HOME}/.bun/bin/bun`;
const SHIM = "/private/tmp/bun-node-abc123/bun";

describe("resolveBunPath ordering invariant", () => {
  test("prefers ~/.bun/bin/bun over an ephemeral bun-install PATH shim", () => {
    const { bunPath, source } = resolveBunPath({
      home: HOME,
      exists: (p) => p === CANON_BUN,
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe(CANON_BUN);
    expect(bunPath).not.toContain("/private/tmp/");
    expect(source).toBe("canonical");
  });

  test("falls back to /opt/homebrew/bin/bun when only that canonical location exists", () => {
    const { bunPath, source } = resolveBunPath({
      home: HOME,
      exists: (p) => p === "/opt/homebrew/bin/bun",
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe("/opt/homebrew/bin/bun");
    expect(source).toBe("canonical");
  });

  test("falls back to /usr/local/bin/bun when only that canonical location exists", () => {
    const { bunPath, source } = resolveBunPath({
      home: HOME,
      exists: (p) => p === "/usr/local/bin/bun",
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe("/usr/local/bin/bun");
    expect(source).toBe("canonical");
  });

  test("~/.bun wins when several canonical locations exist (precedence order)", () => {
    const { bunPath, source } = resolveBunPath({
      home: HOME,
      exists: (p) => p === CANON_BUN || p === "/opt/homebrew/bin/bun" || p === "/usr/local/bin/bun",
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe(CANON_BUN);
    expect(source).toBe("canonical");
  });

  test("uses Bun.which (source=path) only when NO canonical location exists", () => {
    const { bunPath, source } = resolveBunPath({
      home: HOME,
      exists: () => false,
      which: () => "/some/real/path/bun",
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe("/some/real/path/bun");
    // Non-canonical → the installer must warn (this bun may not survive next login).
    expect(source).toBe("path");
  });

  test("uses process.execPath (source=execPath) when nothing on disk and which returns null", () => {
    const { bunPath, source } = resolveBunPath({
      home: HOME,
      exists: () => false,
      which: () => null,
      execPath: "/guaranteed/valid/bun",
    });
    expect(bunPath).toBe("/guaranteed/valid/bun");
    // Non-canonical → the installer must warn.
    expect(source).toBe("execPath");
  });
});
