/**
 * Pins the load-bearing bun-path ordering of setup.ts's OWN resolver
 * (resolveBunForPlist). setup.ts deliberately re-implements InstallEngine's
 * canonical-first / PATH-last ordering inline because it ships standalone into
 * PULSE/ without the Tools/ sibling — so the invariant guarded by
 * resolveBunPath.test.ts must ALSO be guarded for this second live copy. Without
 * this test, a "simplification" to `Bun.which("bun") ?? candidates.find(...)`
 * would bake an ephemeral /private/tmp bun-install shim into the persistent plist
 * for the setup.ts install path — a Pulse service that dies at next login — with a
 * fully green suite. It also pins the `source` tier the caller uses to decide when
 * to warn (non-canonical resolution must be surfaced at install time).
 */
import { describe, expect, test } from "bun:test";
import { resolveBunForPlist } from "../LIFEOS/PULSE/setup";

const HOME = "/Users/fixture";
const CANON_BUN = `${HOME}/.bun/bin/bun`;
const SHIM = "/private/tmp/bun-node-abc123/bun";

describe("setup.ts resolveBunForPlist ordering invariant", () => {
  test("prefers ~/.bun/bin/bun over an ephemeral bun-install PATH shim", () => {
    const { bunPath, source } = resolveBunForPlist({
      home: HOME,
      exists: (p) => p === CANON_BUN,
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe(CANON_BUN);
    expect(bunPath).not.toContain("/private/tmp/");
    expect(source).toBe("canonical");
  });

  test("/opt/homebrew and /usr/local canonical locations beat the PATH shim", () => {
    for (const canon of ["/opt/homebrew/bin/bun", "/usr/local/bin/bun"]) {
      const { bunPath, source } = resolveBunForPlist({
        home: HOME,
        exists: (p) => p === canon,
        which: () => SHIM,
        execPath: "/unused/execPath",
      });
      expect(bunPath).toBe(canon);
      expect(source).toBe("canonical");
    }
  });

  test("~/.bun wins when several canonical locations exist (precedence order)", () => {
    const { bunPath, source } = resolveBunForPlist({
      home: HOME,
      exists: (p) => p === CANON_BUN || p === "/opt/homebrew/bin/bun" || p === "/usr/local/bin/bun",
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe(CANON_BUN);
    expect(source).toBe("canonical");
  });

  test("falls back to Bun.which (source=path) only when no canonical location exists", () => {
    const { bunPath, source } = resolveBunForPlist({
      home: HOME,
      exists: () => false,
      which: () => SHIM,
      execPath: "/unused/execPath",
    });
    expect(bunPath).toBe(SHIM);
    // Non-canonical → the installer must warn (a shim like this dies at next login).
    expect(source).toBe("path");
  });

  test("falls back to process.execPath (source=execPath) when nothing on disk and which returns null", () => {
    const { bunPath, source } = resolveBunForPlist({
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
