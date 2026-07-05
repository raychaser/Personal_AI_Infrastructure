/**
 * Smoke-guards the dry-run install path. The bug: every `DRY_RUN=1` run aborted at
 * the `[ -d "$SRC_SKILL" ]` tarball-content check because the extraction above was
 * only echoed, not executed. This test asserts a dry-run reaches step 5 and exits 0
 * instead of erroring out at the tarball check.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "install.sh");

describe("install.sh dry-run", () => {
  test("DRY_RUN=1 network install reaches step 5 and exits 0", () => {
    const home = mkdtempSync(join(tmpdir(), "lifeos-install-test-"));
    const proc = Bun.spawnSync(["bash", SCRIPT], {
      env: {
        ...process.env,
        DRY_RUN: "1",
        LIFEOS_REPO: "owner/name",
        LIFEOS_SRC: "", // force the network (tarball) branch, not local-source
        HOME: home,
        CI: "1", // never auto-install bun in the test subprocess
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();
    expect(proc.exitCode, `exit ${proc.exitCode}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`).toBe(0);
    // Reached the final onboarding step rather than aborting at the tarball check.
    expect(stdout).toContain("[DRY-RUN] Would launch /lifeos-setup");
  });
});
