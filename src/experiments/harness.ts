/**
 * src/experiments/harness.ts — timing harness + output helpers (spec §7).
 *
 * Fair timing: warm-up runs (excluded), then >= 5 timed runs; report mean, median
 * and standard deviation plus the raw measurements. Only the algorithm call is
 * timed — rendering, file I/O and data-structure construction are set up outside
 * the timed region by the caller. Correctness checks live in the unit tests and
 * in each experiment's verify step, kept SEPARATE from timed runs.
 */

export interface BenchStats {
  runs: number;
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  raw: number[]; // milliseconds
}

export function benchmark(fn: () => void, opts: { runs?: number; warmup?: number } = {}): BenchStats {
  const runs = opts.runs ?? 7;
  const warmup = opts.warmup ?? 2;

  for (let i = 0; i < warmup; i++) fn();

  const raw: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    raw.push(performance.now() - t0);
  }
  return stats(raw);
}

export function stats(raw: number[]): BenchStats {
  const n = raw.length;
  const mean = raw.reduce((a, b) => a + b, 0) / n;
  const variance = raw.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sorted = [...raw].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  return { runs: n, mean, median, stddev: Math.sqrt(variance), min: sorted[0] ?? 0, max: sorted[n - 1] ?? 0, raw };
}

export interface ExperimentResult {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  notes: string[];
}

export function toCSV(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** Round a millisecond measurement to microsecond precision for stable tables. */
export function ms(x: number): number {
  return Math.round(x * 1000) / 1000;
}
