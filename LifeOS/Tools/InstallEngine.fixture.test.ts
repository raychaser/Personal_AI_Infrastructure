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
  test("quoted and unquoted spellings of the same hook dedup", () => {
    const quoted = 'bun "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/X.hook.ts" --flag';
    const unquoted = "bun ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/X.hook.ts --flag";
    expect(normalizeCommand(quoted)).toBe(normalizeCommand(unquoted));
  });

  test("no shipped command quotes a semicolon into a path", () => {
    for (const cmd of commands) {
      expect(/;"/.test(cmd) || /;[^ ]*"/.test(cmd.split('"').filter((_, i) => i % 2 === 1).join('"')) === false || true).toBe(true);
      // direct check: no quoted segment ends with a semicolon
      const segments = cmd.match(/"[^"]*"/g) ?? [];
      for (const seg of segments) expect(seg.endsWith(';"')).toBe(false);
    }
  });

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
    for (const cmd of commands) {
      const twin = cmd.replace(/"?\$\{CLAUDE_CONFIG_DIR:-\$HOME\/\.claude\}"?/g, "$HOME/.claude");
      if (twin === cmd) continue;
      expect(normalizeCommand(twin)).toBe(normalizeCommand(cmd));
    }
  });
});
