// Output helpers for the cross-reference runner.
//
// Goals:
//   - Render mismatches as a scannable block, not a wall of JSON.
//   - Group per-tx diffs (`field[txhash]`) under one header so a multisig
//     failure reads like "tx X failed these N fields" instead of N flat lines.
//   - Truncate long hex/array values without losing identifying prefix/suffix.
//   - Keep the summary table dense but informative — endpoint URL, sample
//     breakdown by source, per-comparator outcome counts, mismatched-field
//     frequency, skip-reason breakdown.

import type { ChainId, DiffResult, FieldDiff, SampleEntry } from "./types";

const VALUE_MAX = 120;
const ARRAY_HEAD = 3;
const ARRAY_ELEMENT_MAX = 50; // generous so 42-char addresses render whole

// Truncate with a tolerance: a hex address (42 chars) sitting just over a
// 40-char limit gives no real information by truncating. Only collapse when
// the string is genuinely longer than the budget.
function truncString(s: string, maxLen: number): string {
  if (s.length <= maxLen + 8) return s;
  const head = Math.max(maxLen - 12, 8);
  return `${s.slice(0, head)}…${s.slice(-8)} (len=${s.length})`;
}

export function formatValue(v: unknown, maxLen = VALUE_MAX): string {
  if (v === null) return "<null>";
  if (v === undefined) return "<undefined>";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "string") {
    return `"${truncString(v, maxLen - 2)}"`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.length > ARRAY_HEAD * 2) {
      const head = v
        .slice(0, ARRAY_HEAD)
        .map((x) => formatValue(x, ARRAY_ELEMENT_MAX))
        .join(", ");
      return `[${head}, … +${v.length - ARRAY_HEAD} more, len=${v.length}]`;
    }
    return `[${v.map((x) => formatValue(x, ARRAY_ELEMENT_MAX)).join(", ")}]`;
  }
  return JSON.stringify(v);
}

// Detect a `fieldName[suffix]` shape used by tx-keyed diffs and split it into
// `{ base: "fieldName", group: "suffix" }`. Returns `null` if the field has no
// bracketed group.
function splitGroupedField(field: string): { base: string; group: string } | null {
  const m = field.match(/^([^\[]+)\[(.+)\]$/);
  if (!m) return null;
  return { base: m[1]!, group: m[2]! };
}

interface GroupedDiffs {
  // The bracketed group key (e.g. a safeTxHash). `null` for ungrouped diffs.
  group: string | null;
  diffs: Array<{ field: string; canonical: unknown; indexer: unknown }>;
}

function groupDiffs(diffs: FieldDiff[]): GroupedDiffs[] {
  const groups = new Map<string, GroupedDiffs["diffs"]>();
  const ungrouped: GroupedDiffs["diffs"] = [];
  for (const d of diffs) {
    const parts = splitGroupedField(d.field);
    if (parts) {
      const arr = groups.get(parts.group) ?? [];
      arr.push({ field: parts.base, canonical: d.canonical, indexer: d.indexer });
      groups.set(parts.group, arr);
    } else {
      ungrouped.push({ field: d.field, canonical: d.canonical, indexer: d.indexer });
    }
  }
  const out: GroupedDiffs[] = [];
  if (ungrouped.length > 0) out.push({ group: null, diffs: ungrouped });
  for (const [group, arr] of groups) out.push({ group, diffs: arr });
  return out;
}

export function formatMismatchBlock(
  comparator: string,
  chainId: ChainId,
  safeAddress: string,
  diffs: FieldDiff[],
): string {
  const lines: string[] = [];
  lines.push(`╭─ MISMATCH ${comparator} chain=${chainId} safe=${safeAddress}`);
  lines.push(`│  (${diffs.length} field${diffs.length === 1 ? "" : "s"} diverged)`);
  for (const group of groupDiffs(diffs)) {
    if (group.group != null) {
      lines.push(`│`);
      lines.push(`│  ── ${truncString(group.group, 80)}`);
    }
    const fieldWidth = Math.max(...group.diffs.map((d) => d.field.length), 8);
    for (const d of group.diffs) {
      const field = d.field.padEnd(fieldWidth);
      lines.push(`│    ${field}  canonical: ${formatValue(d.canonical)}`);
      lines.push(`│    ${" ".repeat(fieldWidth)}  indexer:   ${formatValue(d.indexer)}`);
    }
  }
  lines.push(`╰─`);
  return lines.join("\n");
}

// Short error message for the test failure itself — the detailed block is
// already on stderr, so the thrown error just needs to point at it.
export function formatMismatchShort(
  comparator: string,
  diffs: FieldDiff[],
): string {
  const fieldNames = Array.from(
    new Set(
      diffs.map((d) => {
        const parts = splitGroupedField(d.field);
        return parts ? parts.base : d.field;
      }),
    ),
  );
  const head = fieldNames.slice(0, 3).join(", ");
  const tail = fieldNames.length > 3 ? ` (+${fieldNames.length - 3} more)` : "";
  return `${comparator} mismatched (${diffs.length} diff${diffs.length === 1 ? "" : "s"}): ${head}${tail} — see [cross-ref] MISMATCH block above`;
}

export interface SampleBreakdown {
  chainId: ChainId;
  total: number;
  bySource: Record<SampleEntry["source"], number>;
}

export function summariseSamples(samples: SampleEntry[]): SampleBreakdown[] {
  const byChain = new Map<ChainId, SampleBreakdown>();
  for (const s of samples) {
    const entry =
      byChain.get(s.chainId) ??
      ({
        chainId: s.chainId,
        total: 0,
        bySource: { "owner-anchored": 0, "recent-activity": 0, "indexer-direct": 0 },
      } satisfies SampleBreakdown);
    entry.total++;
    entry.bySource[s.source]++;
    byChain.set(s.chainId, entry);
  }
  return [...byChain.values()].sort((a, b) => a.chainId - b.chainId);
}

export interface RunRow {
  chainId: ChainId;
  safeAddress: string;
  comparator: string;
  result: DiffResult;
}

export interface Counts {
  passed: number;
  mismatched: number;
  skipped: number;
  total: number;
}

export function summariseRun(results: RunRow[]): {
  perChainComparator: Array<{ key: string; counts: Counts }>;
  mismatchedFieldFrequency: Array<{ field: string; count: number; samples: string[] }>;
  skipReasons: Array<{ key: string; count: number }>;
} {
  const counts = new Map<string, Counts>();
  for (const r of results) {
    const k = `chain=${r.chainId} comparator=${r.comparator}`;
    const c = counts.get(k) ?? { passed: 0, mismatched: 0, skipped: 0, total: 0 };
    c.total++;
    c[r.result.kind]++;
    counts.set(k, c);
  }

  // Mismatched field frequency — count each base field name (strip bracketed
  // group suffix) once per row, then aggregate. `samples` retains up to 3
  // example safe addresses for triage.
  const fieldHits = new Map<string, { count: number; samples: string[] }>();
  for (const r of results) {
    if (r.result.kind !== "mismatched") continue;
    const seen = new Set<string>();
    for (const d of r.result.diffs) {
      const parts = splitGroupedField(d.field);
      const base = parts ? parts.base : d.field;
      if (seen.has(base)) continue;
      seen.add(base);
      const entry = fieldHits.get(base) ?? { count: 0, samples: [] };
      entry.count++;
      if (entry.samples.length < 3) entry.samples.push(r.safeAddress);
      fieldHits.set(base, entry);
    }
  }
  const mismatchedFieldFrequency = [...fieldHits.entries()]
    .map(([field, { count, samples }]) => ({ field, count, samples }))
    .sort((a, b) => b.count - a.count);

  const skipReasonCounts = new Map<string, number>();
  for (const r of results) {
    if (r.result.kind !== "skipped") continue;
    const k = `chain=${r.chainId} reason=${r.result.reason}`;
    skipReasonCounts.set(k, (skipReasonCounts.get(k) ?? 0) + 1);
  }
  const skipReasons = [...skipReasonCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  return {
    perChainComparator: [...counts.entries()]
      .map(([key, counts]) => ({ key, counts }))
      .sort((a, b) => (a.key < b.key ? -1 : 1)),
    mismatchedFieldFrequency,
    skipReasons,
  };
}

export function formatSummary(
  endpointUrl: string,
  samples: SampleEntry[],
  results: RunRow[],
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("[cross-ref] indexer endpoint:");
  lines.push(`  ${endpointUrl}`);
  lines.push("");

  lines.push("[cross-ref] sample build:");
  const breakdown = summariseSamples(samples);
  if (breakdown.length === 0) {
    lines.push("  (no samples built)");
  } else {
    for (const b of breakdown) {
      lines.push(
        `  chain=${String(b.chainId).padEnd(4)} total=${b.total}` +
          `  owner-anchored=${b.bySource["owner-anchored"]}` +
          `  recent-activity=${b.bySource["recent-activity"]}` +
          `  indexer-direct=${b.bySource["indexer-direct"]}`,
      );
    }
  }
  lines.push("");

  const summary = summariseRun(results);
  lines.push("[cross-ref] outcomes by (chain, comparator):");
  if (summary.perChainComparator.length === 0) {
    lines.push("  (no comparator rows recorded)");
  } else {
    for (const row of summary.perChainComparator) {
      const c = row.counts;
      lines.push(
        `  ${row.key.padEnd(38)} total=${c.total} passed=${c.passed} mismatched=${c.mismatched} skipped=${c.skipped}`,
      );
    }
  }

  if (summary.mismatchedFieldFrequency.length > 0) {
    lines.push("");
    lines.push("[cross-ref] mismatched fields (by safe count, top of list = most common):");
    for (const row of summary.mismatchedFieldFrequency) {
      const exemplar = row.samples.map((s) => truncString(s, 16)).join(", ");
      lines.push(`  ${row.field.padEnd(28)} x${row.count}  e.g. ${exemplar}`);
    }
  }

  if (summary.skipReasons.length > 0) {
    lines.push("");
    lines.push("[cross-ref] skip reasons:");
    for (const row of summary.skipReasons) {
      lines.push(`  ${row.key.padEnd(38)} count=${row.count}`);
    }
  }
  return lines.join("\n");
}
