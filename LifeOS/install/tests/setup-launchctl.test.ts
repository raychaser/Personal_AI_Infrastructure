/**
 * Guards the central behavioral fix of this PR: Bun.spawn does not throw on a
 * non-zero exit, so a failed `launchctl load` was silently reported as success.
 * classifyLaunchctlLoad restores loud failure on a real error while keeping the
 * benign already-loaded re-run (which `launchctl load` also exits non-zero for)
 * classified as ok — so an idempotent re-run of setup.ts is not reported as a
 * scary false negative. Without this test, a future refactor that drops the
 * exit-code check (reintroducing the swallowed-failure bug) or that treats
 * already-loaded as a failure (a false negative) would leave the suite green.
 */
import { describe, expect, test } from "bun:test";
import { classifyLaunchctlLoad, shouldUnloadBeforeReload } from "../LIFEOS/PULSE/setup";

const HINT = "~/.claude/LIFEOS/PULSE/manage.sh status";

describe("setup.ts classifyLaunchctlLoad", () => {
  test("exit 0 → ok success (the success path is guarded too)", () => {
    const r = classifyLaunchctlLoad(0, "", HINT);
    expect(r.level).toBe("ok");
    expect(r.message).toContain("installed");
  });

  test("non-zero exit with a real error → warn (restores loud failure)", () => {
    const r = classifyLaunchctlLoad(1, "Load failed: 5: Input/output error", HINT);
    expect(r.level).toBe("warn");
    expect(r.message).toContain("exited 1");
    expect(r.message).toContain("Input/output error");
    expect(r.message).toContain(HINT);
  });

  test("non-zero exit with empty stderr still warns (no false success)", () => {
    const r = classifyLaunchctlLoad(1, "", HINT);
    expect(r.level).toBe("warn");
    expect(r.message).toContain("exited 1");
  });

  test("already-loaded service on an idempotent re-run → ok, not a false failure", () => {
    for (const stderr of [
      "/Users/x/Library/LaunchAgents/com.lifeos.pulse.plist: service already loaded",
      "Load failed: 37: Operation already in progress",
      "com.lifeos.pulse: already loaded",
    ]) {
      const r = classifyLaunchctlLoad(1, stderr, HINT);
      expect(r.level, `stderr=${stderr}`).toBe("ok");
      expect(r.message).toContain("already loaded");
    }
  });
});

/**
 * Guards the other half of the re-run fix: installService force-unloads a prior
 * launchd definition before `launchctl load` so a re-run that fixes a bad baked bun
 * path actually re-loads (legacy `load` is a NO-OP on an already-loaded label). This
 * decision used to be an inline `plistChanged && priorPlist !== null` with zero
 * coverage — a refactor that dropped the unload (swallowed-no-op-on-re-run bug
 * returns) or that re-added the `priorPlist !== null` guard (stale in-memory
 * definition with a removed plist file never gets unloaded) would ship green.
 */
describe("setup.ts shouldUnloadBeforeReload", () => {
  const PRIOR = "<plist>OLD __BUN_PATH__=/private/tmp/bun-node-abc/bun</plist>";
  const MATERIALIZED = "<plist>NEW __BUN_PATH__=/Users/x/.bun/bin/bun</plist>";

  test("changed plist with a prior copy on disk → unload (the corrected plist must take effect)", () => {
    expect(shouldUnloadBeforeReload(PRIOR, MATERIALIZED)).toBe(true);
  });

  test("unchanged re-run (prior === materialized) → no unload (benign idempotent load)", () => {
    expect(shouldUnloadBeforeReload(MATERIALIZED, MATERIALIZED)).toBe(false);
  });

  test("plist file absent (priorPlist null) → unload (drop any stale in-memory definition)", () => {
    // priorPlist is read from disk, not launchd load state: a removed plist file
    // can still leave the label bootstrapped in memory. Unloading a not-loaded
    // service is harmless and its exit is ignored, so we still unload here.
    expect(shouldUnloadBeforeReload(null, MATERIALIZED)).toBe(true);
  });
});
