// Tests for the central config-root resolvers — the runtime functions every
// hook and tool calls to locate the tree. The PR's core behavioral change; the
// review flagged them as having zero coverage.
import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { getClaudeDir, getLifeosDir } from "./paths";

const HOME = homedir();
const saved = { ...process.env };
afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  delete process.env.LIFEOS_DIR;
  if (saved.CLAUDE_CONFIG_DIR) process.env.CLAUDE_CONFIG_DIR = saved.CLAUDE_CONFIG_DIR;
  if (saved.CLAUDE_PLUGIN_ROOT) process.env.CLAUDE_PLUGIN_ROOT = saved.CLAUDE_PLUGIN_ROOT;
  if (saved.LIFEOS_DIR) process.env.LIFEOS_DIR = saved.LIFEOS_DIR;
});

describe("getClaudeDir precedence + normalization", () => {
  test("defaults to ~/.claude when nothing set", () => {
    delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CLAUDE_PLUGIN_ROOT;
    expect(getClaudeDir()).toBe(join(HOME, ".claude"));
  });
  test("honors CLAUDE_CONFIG_DIR", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_CONFIG_DIR = "/opt/root";
    expect(getClaudeDir()).toBe("/opt/root");
  });
  test("normalizes a trailing slash", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_CONFIG_DIR = "/opt/root/";
    expect(getClaudeDir()).toBe("/opt/root");
  });
  test("expands a leading tilde", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_CONFIG_DIR = "~/cfg";
    expect(getClaudeDir()).toBe(join(HOME, "cfg"));
  });
  test("CLAUDE_PLUGIN_ROOT wins over CLAUDE_CONFIG_DIR", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/plugin/root";
    process.env.CLAUDE_CONFIG_DIR = "/opt/root";
    expect(getClaudeDir()).toBe("/plugin/root");
  });
});

describe("getLifeosDir flows through the config root", () => {
  test("CLAUDE_CONFIG_DIR → <root>/LIFEOS (normalized)", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT; delete process.env.LIFEOS_DIR;
    process.env.CLAUDE_CONFIG_DIR = "/opt/root/";
    expect(getLifeosDir()).toBe("/opt/root/LIFEOS");
  });
  test("explicit LIFEOS_DIR wins over CLAUDE_CONFIG_DIR", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.LIFEOS_DIR = "/custom/lifeos";
    process.env.CLAUDE_CONFIG_DIR = "/opt/root";
    expect(getLifeosDir()).toBe("/custom/lifeos");
  });
});
