// The LifeOS skill ships a copy of its own Tools in the install payload
// (install/skills/LifeOS/Tools/). Review rounds found those copies silently
// drifting from the dev copies — shipping installers WITHOUT fixes the dev
// copies had (unsubstituted __CONFIG_ROOT__, quote-blind dedup). This test
// makes payload drift a CI failure instead of a field bug.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEV = join(import.meta.dir);
const PAYLOAD = join(import.meta.dir, "..", "install", "skills", "LifeOS", "Tools");

describe("install payload Tools stay in sync with dev Tools", () => {
  const payloadFiles = readdirSync(PAYLOAD).filter((f) => f.endsWith(".ts"));

  test("payload has tools to compare", () => {
    expect(payloadFiles.length).toBeGreaterThan(0);
  });

  for (const f of payloadFiles) {
    const devPath = join(DEV, f);
    if (!existsSync(devPath)) continue; // payload-only tools have no dev twin
    test(`${f} is byte-identical to the dev copy`, () => {
      expect(readFileSync(join(PAYLOAD, f), "utf-8")).toBe(readFileSync(devPath, "utf-8"));
    });
  }
});
