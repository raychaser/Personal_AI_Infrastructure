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
import { classifyLaunchctlLoad } from "../LIFEOS/PULSE/setup";

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
