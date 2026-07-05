// Tests for the hook-dedup gate (normalizeCommand / mergeHooks) — the
// upgrade-idempotency chokepoint. Every spelling of the config root that
// resolves to the same file must dedup to one entry; distinct commands must not.
import { describe, expect, test } from "bun:test";
import { normalizeCommand, mergeHooks } from "./InstallEngine";

const SPELLINGS = [
  "bun ~/.claude/hooks/X.hook.ts",
  "bun $HOME/.claude/hooks/X.hook.ts",
  "bun ${HOME}/.claude/hooks/X.hook.ts",
  "bun $CLAUDE_CONFIG_DIR/hooks/X.hook.ts",
  "bun ${CLAUDE_CONFIG_DIR}/hooks/X.hook.ts",
  "bun ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/X.hook.ts",
  "bun ${CLAUDE_CONFIG_DIR:-${HOME}/.claude}/hooks/X.hook.ts", // nested-brace default
];

describe("normalizeCommand", () => {
  test("all config-root spellings normalize identically", () => {
    const norms = new Set(SPELLINGS.map(normalizeCommand));
    expect(norms.size).toBe(1);
  });

  test("distinct hook files stay distinct", () => {
    expect(normalizeCommand("bun $HOME/.claude/hooks/A.hook.ts")).not.toBe(
      normalizeCommand("bun $HOME/.claude/hooks/B.hook.ts"),
    );
  });

  test("unrelated commands are untouched", () => {
    expect(normalizeCommand("echo hello")).toBe("echo hello");
  });
});

describe("mergeHooks idempotency", () => {
  const bucket = (cmd: string) => [{ matcher: "*", hooks: [{ type: "command", command: cmd }] }];

  test("re-merging the same hook under a different spelling adds nothing", () => {
    const existing = { SessionStart: bucket("bun $CLAUDE_CONFIG_DIR/hooks/X.hook.ts") };
    const incoming = { SessionStart: bucket("bun ${CLAUDE_CONFIG_DIR:-${HOME}/.claude}/hooks/X.hook.ts") };
    const { merged, added } = mergeHooks(existing, incoming);
    expect(added).toBe(0);
    expect(merged.SessionStart?.[0]?.hooks.length).toBe(1);
  });

  test("a genuinely new hook is added exactly once", () => {
    const existing = { SessionStart: bucket("bun $HOME/.claude/hooks/X.hook.ts") };
    const incoming = { SessionStart: bucket("bun $HOME/.claude/hooks/Y.hook.ts") };
    const { added } = mergeHooks(existing, incoming);
    expect(added).toBe(1);
  });

  test("merge is idempotent under repetition", () => {
    const existing = { SessionStart: bucket("bun $HOME/.claude/hooks/X.hook.ts") };
    const incoming = { SessionStart: bucket("bun $CLAUDE_CONFIG_DIR/hooks/X.hook.ts") };
    const once = mergeHooks(existing, incoming);
    const twice = mergeHooks(once.merged, incoming);
    expect(twice.added).toBe(0);
  });
});
