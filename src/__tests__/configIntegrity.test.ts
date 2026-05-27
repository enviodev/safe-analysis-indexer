import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static scans over config.yaml that catch the class of typo where an event
// alias (`name:`) accidentally gets embedded in the event signature itself,
// e.g. `event: AddedOwnerV4(address indexed owner)` with `name: AddedOwnerV4`.
// That hashes to a wrong topic0 (`keccak256("AddedOwnerV4(address)")`) and
// silently never fires.
//
// Reading config.yaml as text avoids adding a YAML dep just for one test.

const CONFIG = readFileSync(
  resolve(__dirname, "..", "..", "config.yaml"),
  "utf8",
);

interface EventDecl {
  signature: string; // exact `event:` body, e.g. "AddedOwner(address indexed owner)"
  fnName: string; // the part before "(", e.g. "AddedOwner"
  alias: string | null; // `name:` field or null
  line: number;
}

function parseEventDeclarations(yaml: string): EventDecl[] {
  const lines = yaml.split("\n");
  const out: EventDecl[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^\s*-\s*event:\s*(.+?)\s*$/);
    if (!m) continue;
    const signature = m[1]!;
    const fnMatch = signature.match(/^(\w+)\(/);
    if (!fnMatch) continue;
    const fnName = fnMatch[1]!;
    // Look at the immediately following indented lines for a `name:` field
    // (before the next `- event:` or de-indented line).
    let alias: string | null = null;
    const baseIndent = lines[i]!.search(/\S/);
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (next.trim() === "") continue;
      const indent = next.search(/\S/);
      if (indent <= baseIndent) break;
      const aliasMatch = next.match(/^\s*name:\s*(\S+)\s*$/);
      if (aliasMatch) {
        alias = aliasMatch[1]!;
        break;
      }
    }
    out.push({ signature, fnName, alias, line: i + 1 });
  }
  return out;
}

describe("config.yaml event declarations", () => {
  const events = parseEventDeclarations(CONFIG);

  it("parsed at least one event declaration (sanity)", () => {
    expect(events.length).toBeGreaterThan(0);
  });

  it("alias names never appear in the event signature itself (would mis-hash topic0)", () => {
    // If `name: FooV4` is set, the signature's function name MUST differ —
    // otherwise topic0 = keccak256("FooV4(...)") which won't match any real
    // on-chain event (chains emit the base name like Foo). This is the exact
    // bug AddedOwnerV4 had before this PR.
    const offenders = events.filter(
      (e) => e.alias !== null && e.fnName === e.alias,
    );
    expect(
      offenders,
      `Event alias must not equal the function name embedded in the signature.\n` +
        offenders
          .map(
            (e) =>
              `  config.yaml:${e.line} event: ${e.signature} (alias name: ${e.alias})`,
          )
          .join("\n"),
    ).toEqual([]);
  });

  it("every V4 alias has a non-V4 counterpart on the same contract (sanity)", () => {
    // If a `*V4` alias exists, the non-V4 sibling should also exist so we
    // catch both indexed and non-indexed on-chain emissions.
    const v4Aliases = events.filter((e) => e.alias?.endsWith("V4"));
    const fnNames = new Set(events.map((e) => e.fnName));
    const orphans = v4Aliases.filter((e) => !fnNames.has(e.fnName));
    expect(
      orphans,
      `Each *V4 alias should have a non-V4 sibling declaration on the same contract: ${orphans
        .map((e) => `${e.signature} (line ${e.line})`)
        .join(", ")}`,
    ).toEqual([]);
  });
});
