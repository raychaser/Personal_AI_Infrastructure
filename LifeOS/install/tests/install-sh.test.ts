/**
 * Smoke-guards the dry-run install path. The bug: every `DRY_RUN=1` run aborted at
 * the `[ -d "$SRC_SKILL" ]` tarball-content check because the extraction above was
 * only echoed, not executed. The fix wraps that check in `if [ "$DRY_RUN" != "1" ]`
 * so it is SKIPPED in dry-run but PRESERVED for real installs. The dry-run test
 * asserts the skip side (reaches step 5, exit 0); the two negative tests assert the
 * other side — a real (non-dry-run) install whose source lacks the release subpath
 * must still abort with exit 1, so broadening/inverting the guard can't ship green.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

  test("real (non-dry-run) network install still aborts when the tarball lacks the release subpath", () => {
    const work = mkdtempSync(join(tmpdir(), "lifeos-install-neg-net-"));
    const home = mkdtempSync(join(tmpdir(), "lifeos-install-home-"));
    // Build a .tar.gz whose single top-level dir does NOT contain the LifeOS/ subpath.
    const pkg = join(work, "not-lifeos-6.0.5");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "README.md"), "no skill here\n");
    const tarball = join(work, "release.tar.gz");
    const tar = Bun.spawnSync(["tar", "-czf", tarball, "-C", work, "not-lifeos-6.0.5"]);
    expect(tar.exitCode, `tar failed: ${tar.stderr?.toString()}`).toBe(0);

    const proc = Bun.spawnSync(["bash", SCRIPT], {
      env: {
        ...process.env,
        DRY_RUN: "0", // REAL install — the tarball-content check must still fire
        LIFEOS_REPO: "owner/name",
        LIFEOS_TARBALL_URL: `file://${tarball}`, // hermetic: curl reads the local tarball
        LIFEOS_SRC: "", // force the network branch, not local-source
        HOME: home,
        CI: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();
    expect(proc.exitCode, `expected exit 1\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`).toBe(1);
    expect(stderr).toContain("not in tarball");
    // Must abort at the content check, before placing the skill (step 4).
    expect(stdout).not.toContain("LifeOS skill placed");
  });

  test("real (non-dry-run) local-source install still aborts when the source dir lacks the release subpath", () => {
    const src = mkdtempSync(join(tmpdir(), "lifeos-install-neg-src-"));
    const home = mkdtempSync(join(tmpdir(), "lifeos-install-home-"));
    // LIFEOS_SRC dir with NO LifeOS/ subpath.
    writeFileSync(join(src, "README.md"), "no skill here\n");

    const proc = Bun.spawnSync(["bash", SCRIPT], {
      env: {
        ...process.env,
        DRY_RUN: "0",
        LIFEOS_SRC: src, // local-source branch
        HOME: home,
        CI: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();
    expect(proc.exitCode, `expected exit 1\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`).toBe(1);
    expect(stderr).toContain("not found at");
    expect(stdout).not.toContain("LifeOS skill placed");
  });
});
