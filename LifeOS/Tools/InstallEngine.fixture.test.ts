// Fixture test binding the SHIPPED hooks.json command spellings to normalizeCommand:
// if the payload ever ships a spelling the dedup regex misses, this fails.
import { describe, expect, test } from "bun:test";
import { normalizeCommand } from "./InstallEngine";
import payload from "../install/hooks/hooks.json";

const commands: string[] = [];
for (const buckets of Object.values((payload as any).hooks ?? payload)) {
  for (const b of buckets as any[]) {
    for (const h of b.hooks ?? []) if (h.command) commands.push(h.command);
  }
}

describe("shipped hooks.json spellings", () => {
  test("payload has commands to check", () => {
    expect(commands.length).toBeGreaterThan(0);
  });

  test("every config-root command normalizes to the canonical root token", () => {
    for (const cmd of commands) {
      if (!/CLAUDE_CONFIG_DIR|\.claude/.test(cmd)) continue;
      const norm = normalizeCommand(cmd);
      expect(norm.includes("CLAUDE_CONFIG_DIR")).toBe(false);
    }
  });

  test("a home-spelled twin of each shipped command dedups against it", () => {
    for (const cmd of commands.slice(0, 10)) {
      const twin = cmd.replace(/"?\$\{CLAUDE_CONFIG_DIR:-\$HOME\/\.claude\}"?/g, "$HOME/.claude");
      if (twin === cmd) continue;
      expect(normalizeCommand(twin)).toBe(normalizeCommand(cmd));
    }
  });
});
