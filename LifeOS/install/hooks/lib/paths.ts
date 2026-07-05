/**
 * Centralized Path Resolution
 *
 * Two root directories:
 * - LIFEOS_DIR (~/.claude/LIFEOS) — LifeOS data: MEMORY, Algorithm, Tools, USER
 * - Claude home (~/.claude) — Claude Code: settings, skills, hooks, commands, agents
 *
 * Usage:
 *   import { getLifeosDir, getClaudeDir, paiPath } from '';
 */

import { homedir } from 'os';
import { join, resolve } from 'path';

/**
 * THE canonical config-root normalizer: trim, expand ~/$HOME/${HOME}, resolve()
 * (collapses '..' and doubled separators, absolutizes), strip trailing slashes.
 * Guard, tools, and daemons must all derive a byte-identical root — divergent
 * normalizers were a recurring fail-open class (see system-file-guard-core).
 */
export function normalizeConfigRoot(p: string): string {
  let out = p.trim()
    .replace(/^~(?=\/|$)/, homedir())
    .replace(/^\$\{HOME\}(?=\/|$)/, homedir())
    .replace(/^\$HOME(?=\/|$)/, homedir());
  out = resolve(out);
  while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

// NOTE: this normalizer is a shared helper — every consumer that resolves the
// config root (guard, tools, daemons) should call normalizeConfigRoot() rather
// than reading process.env.CLAUDE_CONFIG_DIR raw. It is NOT applied by a global
// env mutation (that is process-local and would not reach separately-spawned
// tool processes); each consumer imports and calls it.

/**
 * Expand shell variables in a path string
 * Supports: $HOME, ${HOME}, ~
 */
export function expandPath(path: string): string {
  const home = homedir();

  return path
    .replace(/^\$HOME(?=\/|$)/, home)
    .replace(/^\$\{HOME\}(?=\/|$)/, home)
    .replace(/^~(?=\/|$)/, home);
}

/**
 * Get the LifeOS data directory (expanded).
 *
 * Priority:
 *   1. CLAUDE_PLUGIN_ROOT (plugin install) → <root>/PAI
 *   2. LIFEOS_DIR env var (expanded)
 *   3. CLAUDE_CONFIG_DIR env (normalized) + /LIFEOS
 *   4. ~/.claude/LIFEOS  (live default — byte-identical to pre-plugin behavior)
 *
 * The CLAUDE_PLUGIN_ROOT guard MUST precede the LIFEOS_DIR check: in a packed
 * plugin, bin/pai exports LIFEOS_DIR equal to CLAUDE_PLUGIN_ROOT (the flattened
 * claude-home root), so trusting LIFEOS_DIR first would drop the trailing /PAI
 * segment and mis-resolve paiPath() to ROOT/MEMORY instead of ROOT/LIFEOS/MEMORY.
 * Resolving via getClaudeDir() + 'LifeOS' keeps the live ~/.claude/LIFEOS →
 * plugin ${ROOT}/PAI mapping that the packer's ~/.claude/ → ${LIFEOS_DIR} rewrite assumes.
 */
export function getLifeosDir(): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return join(getClaudeDir(), 'LIFEOS');
  }

  const envLifeosDir = process.env.LIFEOS_DIR;

  if (envLifeosDir) {
    return expandPath(envLifeosDir);
  }

  return join(getClaudeDir(), 'LIFEOS');
}

/**
 * THE single config-root accessor. Every hook, tool, and daemon should call this
 * instead of inlining `process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')`
 * — that pattern (previously duplicated at ~110 sites) let a non-canonical env
 * value resolve to a different root in different places, a silent fail-open class.
 *
 * Precedence: CLAUDE_PLUGIN_ROOT (flattened plugin root) > CLAUDE_CONFIG_DIR
 * (normalized) > ~/.claude. Byte-identical to pre-CLAUDE_CONFIG_DIR behavior when
 * neither env var is set.
 */
export function getConfigRoot(): string {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

  if (pluginRoot) {
    return expandPath(pluginRoot);
  }

  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir) {
    return normalizeConfigRoot(configDir);
  }
  return join(homedir(), '.claude');
}

/**
 * Back-compat alias for {@link getConfigRoot}. The config root IS the Claude
 * home directory; existing callers use this name.
 */
export function getClaudeDir(): string {
  return getConfigRoot();
}

/**
 * Get the settings.json path (lives in Claude home)
 */
export function getSettingsPath(): string {
  return join(getClaudeDir(), 'settings.json');
}

/**
 * Get the authoritative .env path (~/.claude/.env).
 * All credentials live here; PAI/.env is deprecated.
 */
export function getEnvPath(): string {
  return join(getClaudeDir(), '.env');
}

/**
 * Get a path relative to LIFEOS_DIR
 */
export function paiPath(...segments: string[]): string {
  return join(getLifeosDir(), ...segments);
}

/**
 * Get the hooks directory (lives in Claude home)
 */
export function getHooksDir(): string {
  return join(getClaudeDir(), 'hooks');
}

/**
 * Get the skills directory (lives in Claude home)
 */
export function getSkillsDir(): string {
  return join(getClaudeDir(), 'skills');
}

/**
 * Get the MEMORY directory
 */
export function getMemoryDir(): string {
  return paiPath('MEMORY');
}
