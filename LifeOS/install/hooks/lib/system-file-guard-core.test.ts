// Tests for the config-root normalization inside the system-file guard.
// Raw env use fails containment prefix-checks open on cosmetic variants —
// these tests pin the normalization so that can't regress.
import { describe, expect, test } from "bun:test";
import { normalizeRoot, classifyTarget } from "./system-file-guard-core";

describe("classifyTarget under a custom config root", () => {
  const root = "/opt/custom-root";
  test("a system file under the custom root classifies as system (guarded)", () => {
    expect(classifyTarget(`${root}/hooks/Safety.hook.ts`, root).classification).toBe("system");
  });
  test("a file under a DIFFERENT root is out-of-tree (never blocked)", () => {
    expect(classifyTarget("/Users/u/.claude/hooks/Safety.hook.ts", root).classification).toBe("out-of-tree");
  });
  test("the root itself classifies as system", () => {
    expect(classifyTarget(root, root).classification).toBe("system");
  });
});

describe("normalizeRoot", () => {
  test("strips a single trailing slash", () => {
    expect(normalizeRoot("/Users/u/.claude/")).toBe("/Users/u/.claude");
  });
  test("strips repeated trailing slashes", () => {
    expect(normalizeRoot("/Users/u/.claude///")).toBe("/Users/u/.claude");
  });
  test("expands a leading tilde", () => {
    expect(normalizeRoot("~/.claude").startsWith("/")).toBe(true);
    expect(normalizeRoot("~/.claude").includes("~")).toBe(false);
  });
  test("bare tilde resolves to home", () => {
    expect(normalizeRoot("~").startsWith("/")).toBe(true);
  });
  test("clean absolute path is unchanged", () => {
    expect(normalizeRoot("/opt/claude-root")).toBe("/opt/claude-root");
  });
  test("trims surrounding whitespace", () => {
    expect(normalizeRoot("  /Users/u/.claude ")).toBe("/Users/u/.claude");
  });
});
