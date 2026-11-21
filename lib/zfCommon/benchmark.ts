import { BenchmarkMetricSummary } from './resultTypes';

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};

export const summarizeTimings = (durationsMs: number[], successes: boolean[]): BenchmarkMetricSummary => {
  if (durationsMs.length === 0) {
    return { runs: 0, median_ms: 0, iqr_ms: 0, q1_ms: 0, q3_ms: 0, min_ms: 0, max_ms: 0, success_rate: 0 };
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const passed = successes.filter(Boolean).length;
  return {
    runs: sorted.length,
    median_ms: Number(median.toFixed(3)),
    iqr_ms: Number((q3 - q1).toFixed(3)),
    q1_ms: Number(q1.toFixed(3)),
    q3_ms: Number(q3.toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
    success_rate: Number(((passed / sorted.length) * 100).toFixed(1))
  };
};

export const runRepeatedBenchmark = <T extends { status: string }>(
  trials: number,
  fn: () => T
): { lastResult: T; summary: BenchmarkMetricSummary } => {
  const times: number[] = [];
  const oks: boolean[] = [];
  let lastResult!: T;

  for (let i = 0; i < Math.max(1, trials); i++) {
    const t0 = performance.now();
    lastResult = fn();
    const dt = performance.now() - t0;
    times.push(dt);
    oks.push(lastResult.status === 'FACTORS_VERIFIED' || lastResult.status === 'PERFECT_SQUARE');
  }

  return {
    lastResult,
    summary: summarizeTimings(times, oks)
  };
};
