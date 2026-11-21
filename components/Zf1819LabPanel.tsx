import React, { useState } from 'react';
import MathFormula from './MathFormula';
import {
  CfracResult,
  CoppersmithResult,
  RouterResult,
  BenchmarkMetricSummary
} from '../lib/zfCommon/resultTypes';
import {
  ZF18_ACCEPTANCE_VECTORS,
  ZF19_ACCEPTANCE_VECTORS,
  STAGED_BENCHMARK_LEVELS,
  Zf18AcceptanceVector,
  Zf19AcceptanceVector,
  StagedLevelVector
} from '../lib/zfCommon/testVectors';
import { runRepeatedBenchmark } from '../lib/zfCommon/benchmark';
import { runZf18Coppersmith } from '../lib/zf18/coppersmithEngine';
import { runZf19Cfrac } from '../lib/zf19/cfracEngine';
import { zfRouter } from '../lib/zfRouter';
import { generateRsaWithHint } from '../lib/coppersmithLllEngine';
import { ZF_PYTHON_REFERENCE_FILES } from '../lib/zfPythonReference';
import { factorizeQuickWithTrace } from '../lib/mathEngine';

interface Zf1819LabPanelProps {
  onFactorsRecovered?: (n: string, p: string, q: string, methodLabel: string, durationMs: number) => void;
}

interface AcceptanceRunItem {
  id: string;
  suite: 'ZF-18' | 'ZF-19';
  titleAr: string;
  descriptionAr: string;
  N: string;
  expectedStatus: string[];
  actualStatus: string;
  passed: boolean;
  elapsedMs: number;
  zf18Result?: CoppersmithResult;
  zf19Result?: CfracResult;
}

interface StagedBenchmarkRow {
  stage: string;
  labelAr: string;
  bits: number;
  targetNPreview: string;
  zf19Summary?: BenchmarkMetricSummary;
  zf18Summary?: BenchmarkMetricSummary;
  quickSummary?: BenchmarkMetricSummary;
  zf19Last?: CfracResult;
  zf18Last?: CoppersmithResult;
  notesAr: string;
}

const ZF18_CHECKLIST_LABELS: Array<{ key: keyof CoppersmithResult['verification_status']; label: string }> = [
  { key: 'is_integer_root', label: 'جذر صحيح x ∈ Z' },
  { key: 'within_bound_X', label: 'تحقق القيد |x| < X' },
  { key: 'p_within_range', label: '1 < p = p0 + x < N' },
  { key: 'exact_division_N_mod_p', label: 'قسمة تامة N mod p = 0' },
  { key: 'q_computed_exact', label: 'تطابق p × q = N' },
  { key: 'p_prime_independent', label: 'أولية p مستقلة' },
  { key: 'q_prime_independent', label: 'أولية q مستقلة' }
];

const ZF19_CHECKLIST_LABELS: Array<{ key: keyof CfracResult['verification_status']; label: string }> = [
  { key: 'relations_modular_valid', label: 'A_k² ≡ (-1)^(k+1) Q_{k+1} (mod N)' },
  { key: 'q_factorizations_exact', label: 'تحليل Q_{k+1} التام' },
  { key: 'gf2_parity_consistent', label: 'اتساق تكافؤ GF(2)' },
  { key: 'final_exponents_even', label: 'زوجية جميع الأسس' },
  { key: 'congruence_x2_eq_y2_mod_n', label: 'تطابق المربعات X² ≡ Y² (mod N)' },
  { key: 'exact_divisor_verified', label: 'قاسم تام وأولية مستقلة' }
];

export const Zf1819LabPanel: React.FC<Zf1819LabPanelProps> = ({ onFactorsRecovered }) => {
  const [subTab, setSubTab] = useState<'acceptance' | 'router' | 'benchmarks' | 'python'>('acceptance');

  // Section 1: Acceptance Tests
  const [acceptanceRuns, setAcceptanceRuns] = useState<AcceptanceRunItem[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [zf19Solver, setZf19Solver] = useState<'gaussian' | 'block-wiedemann'>('gaussian');
  const [isRunningTests, setIsRunningTests] = useState(false);

  // Section 2: ZF_Router(N, H)
  const [routerN, setRouterN] = useState('100160063');
  const [useHint, setUseHint] = useState(true);
  const [routerP0, setRouterP0] = useState('9984');
  const [routerX, setRouterX] = useState('64');
  const [routerBeta, setRouterBeta] = useState(0.5);
  const [routerFallback, setRouterFallback] = useState(true);
  const [routerResult, setRouterResult] = useState<RouterResult | null>(null);

  // Section 3: Staged Benchmarks
  const [trialsPerStage, setTrialsPerStage] = useState<number>(3);
  const [stagedRows, setStagedRows] = useState<StagedBenchmarkRow[]>([]);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkProgressText, setBenchmarkProgressText] = useState<string | null>(null);

  // Section 4: Python Reference
  const [selectedPyPath, setSelectedPyPath] = useState<string>(ZF_PYTHON_REFERENCE_FILES[0].path);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const runSingleZf19Test = (vec: Zf19AcceptanceVector): AcceptanceRunItem => {
    const res = runZf19Cfrac({
      N: BigInt(vec.N),
      factor_base_bound: vec.factorBaseBound,
      max_relations: vec.factorBaseBound + 60,
      max_iterations: 80000,
      matrix_solver: zf19Solver,
      timeout_seconds: 10,
      enable_partial_relations: true
    });
    const statusOk = vec.expectedStatus.includes(res.status);
    let factorsMatch = true;
    if (vec.verifyExpectedP && vec.verifyExpectedQ && res.factor_p && res.factor_q) {
      const sorted = [BigInt(res.factor_p), BigInt(res.factor_q)].sort((a, b) => (a < b ? -1 : 1));
      factorsMatch = sorted[0].toString() === vec.verifyExpectedP && sorted[1].toString() === vec.verifyExpectedQ;
    }
    return {
      id: vec.id,
      suite: 'ZF-19',
      titleAr: vec.titleAr,
      descriptionAr: vec.descriptionAr,
      N: vec.N,
      expectedStatus: vec.expectedStatus,
      actualStatus: res.status,
      passed: statusOk && factorsMatch,
      elapsedMs: res.execution_time,
      zf19Result: res
    };
  };

  const runSingleZf18Test = (vec: Zf18AcceptanceVector): AcceptanceRunItem => {
    const res = runZf18Coppersmith({
      N: BigInt(vec.N),
      p0: BigInt(vec.p0),
      X: BigInt(vec.X),
      beta: vec.beta,
      epsilon: vec.epsilon,
      lattice_m: vec.lattice_m,
      lattice_t: vec.lattice_t,
      timeout_seconds: 10
    });
    const statusOk = vec.expectedStatus.includes(res.status);
    let factorsMatch = true;
    if (vec.verifyExpectedP && vec.verifyExpectedQ && res.status === 'FACTORS_VERIFIED' && res.factor_p && res.factor_q) {
      const sorted = [BigInt(res.factor_p), BigInt(res.factor_q)].sort((a, b) => (a < b ? -1 : 1));
      factorsMatch = sorted[0].toString() === vec.verifyExpectedP && sorted[1].toString() === vec.verifyExpectedQ;
    }
    return {
      id: vec.id,
      suite: 'ZF-18',
      titleAr: vec.titleAr,
      descriptionAr: vec.descriptionAr,
      N: vec.N,
      expectedStatus: vec.expectedStatus,
      actualStatus: res.status,
      passed: statusOk && factorsMatch,
      elapsedMs: res.total_time,
      zf18Result: res
    };
  };

  const handleRunAllAcceptance = () => {
    setIsRunningTests(true);
    setTimeout(() => {
      const results19 = ZF19_ACCEPTANCE_VECTORS.map(runSingleZf19Test);
      const results18 = ZF18_ACCEPTANCE_VECTORS.map(runSingleZf18Test);
      const combined = [...results19, ...results18];
      setAcceptanceRuns(combined);
      setSelectedTestId(combined[0]?.id ?? null);
      setIsRunningTests(false);
    }, 20);
  };

  const handleRunRouter = () => {
    try {
      const nClean = routerN.replace(/[^0-9]/g, '');
      if (!nClean) return;
      const nBig = BigInt(nClean);
      const hint = useHint && routerP0.trim() && routerX.trim()
        ? {
            p0: BigInt(routerP0.replace(/[^0-9]/g, '')),
            X: BigInt(routerX.replace(/[^0-9]/g, '')),
            beta: routerBeta,
            epsilon: 0.02
          }
        : undefined;
      const res = zfRouter(nBig, hint, {
        allowFallbackToCfrac: routerFallback,
        cfracMatrixSolver: zf19Solver,
        timeoutSeconds: 12
      });
      setRouterResult(res);
      if (res.status === 'FACTORS_VERIFIED' && res.factor_p && res.factor_q && onFactorsRecovered) {
        onFactorsRecovered(
          nClean,
          res.factor_p,
          res.factor_q,
          `ZF_Router (${res.engine_used})`,
          Math.round(res.execution_time_ms)
        );
      }
    } catch {}
  };

  const handleRunStagedBenchmarks = async (stagesSubset?: Array<StagedLevelVector['stage']>) => {
    setIsBenchmarking(true);
    const levels = stagesSubset
      ? STAGED_BENCHMARK_LEVELS.filter(l => stagesSubset.includes(l.stage))
      : STAGED_BENCHMARK_LEVELS;

    const output: StagedBenchmarkRow[] = [];

    for (const lvl of levels) {
      setBenchmarkProgressText(`جارٍ قياس ${lvl.labelAr} (${trialsPerStage} جولات)...`);
      await new Promise(r => setTimeout(r, 20));

      let targetN = lvl.N;
      let targetP0 = lvl.p0;
      let targetX = lvl.X;

      if (lvl.dynamicHintPct) {
        const gen = generateRsaWithHint(lvl.bits, lvl.dynamicHintPct);
        targetN = gen.n;
        targetP0 = gen.hintP0Dec;
        targetX = gen.boundX;
      }

      const nBig = BigInt(targetN);
      let zf19Bench: { lastResult: CfracResult; summary: BenchmarkMetricSummary } | undefined;
      let zf18Bench: { lastResult: CoppersmithResult; summary: BenchmarkMetricSummary } | undefined;
      let quickBench: { lastResult: { status: string }; summary: BenchmarkMetricSummary } | undefined;

      if (lvl.supportsCfrac) {
        zf19Bench = runRepeatedBenchmark(trialsPerStage, () =>
          runZf19Cfrac({
            N: nBig,
            factor_base_bound: lvl.cfracBound ?? 400,
            max_relations: (lvl.cfracBound ?? 400) + 60,
            max_iterations: 160000,
            matrix_solver: zf19Solver,
            timeout_seconds: 12,
            enable_partial_relations: true
          })
        );

        quickBench = runRepeatedBenchmark(trialsPerStage, () => {
          const q = factorizeQuickWithTrace(nBig);
          return { status: q.complete ? 'FACTORS_VERIFIED' : 'INCOMPLETE' };
        });
      }

      if (lvl.supportsCoppersmith && targetP0 && targetX) {
        const p0Big = BigInt(targetP0);
        const xBig = BigInt(targetX);
        zf18Bench = runRepeatedBenchmark(trialsPerStage, () =>
          runZf18Coppersmith({
            N: nBig,
            p0: p0Big,
            X: xBig,
            beta: lvl.beta ?? 0.5,
            epsilon: 0.02,
            lattice_m: lvl.latticeM ?? 3,
            lattice_t: lvl.latticeT ?? 3,
            timeout_seconds: 12
          })
        );
      }

      const preview = targetN.length > 26
        ? `${targetN.slice(0, 10)}…${targetN.slice(-8)} (${nBig.toString(2).length}b)`
        : `${targetN} (${nBig.toString(2).length}b)`;

      output.push({
        stage: lvl.stage,
        labelAr: lvl.labelAr,
        bits: nBig.toString(2).length,
        targetNPreview: preview,
        zf19Summary: zf19Bench?.summary,
        zf18Summary: zf18Bench?.summary,
        quickSummary: quickBench?.summary,
        zf19Last: zf19Bench?.lastResult,
        zf18Last: zf18Bench?.lastResult,
        notesAr: lvl.notesAr
      });

      setStagedRows([...output]);
    }

    setBenchmarkProgressText(null);
    setIsBenchmarking(false);
  };

  const selectedRun = acceptanceRuns.find(r => r.id === selectedTestId) ?? acceptanceRuns[0] ?? null;
  const selectedPyFile = ZF_PYTHON_REFERENCE_FILES.find(f => f.path === selectedPyPath) ?? ZF_PYTHON_REFERENCE_FILES[0];

  const handleCopyPython = (path: string, code: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1600);
  };

  const passedCount = acceptanceRuns.filter(r => r.passed).length;

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-[#1E3A8A]">
            ZF-18 & ZF-19 · Coppersmith-LLL & CFRAC Verification Laboratory
          </div>
          <h3 className="text-lg md:text-xl font-bold font-serif-academic text-[#1C1917]">
            المختبر الموحّد للتحقق الرياضي والاختبارات القياسية (ZF-18 / ZF-19)
          </h3>
          <p className="text-xs text-[#57534E] leading-relaxed max-w-4xl">
            محركان مستقلان مع فصلٍ صارم بين البرهان الرياضي والتنفيذ والقياس:
            هوية <MathFormula tex="A_k^2 - N B_k^2 = (-1)^{k+1} Q_{k+1} \implies A_k^2 \equiv (-1)^{k+1} Q_{k+1} \pmod{N}" className="mx-1" /> لـ CFRAC،
            وشبيكات Howgrave-Graham + LLL لـ Coppersmith مع فحص كل الصفوف المختزلة والتحقق السداسي والسباعي دون تسريب العوامل.
          </p>
        </div>

        {/* Sub-navigation */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F0E8] rounded-xl border border-[#E2DDD2] shrink-0">
          {([
            { id: 'acceptance', label: 'اختبارات القبول (T1–T5)' },
            { id: 'router', label: 'الموجّه ZF_Router(N, H)' },
            { id: 'benchmarks', label: 'القياس المتدرج (A–F · IQR)' },
            { id: 'python', label: 'مرجع Python المعماري' }
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                subTab === tab.id
                  ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] shadow-sm'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: ACCEPTANCE SUITES */}
      {subTab === 'acceptance' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRunAllAcceptance}
                disabled={isRunningTests}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors disabled:opacity-50"
              >
                {isRunningTests ? 'جارٍ تشغيل الاختبارات العشرة...' : 'تشغيل جميع اختبارات القبول (ZF19-T1..T5 + ZF18-T1..T5)'}
              </button>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#57534E] font-medium">حلّال مصفوفة GF(2):</span>
                <select
                  value={zf19Solver}
                  onChange={e => setZf19Solver(e.target.value as 'gaussian' | 'block-wiedemann')}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2DDD2] font-mono text-xs text-[#1C1917]"
                >
                  <option value="gaussian">Gaussian Elimination (دقيق)</option>
                  <option value="block-wiedemann">Block Wiedemann (متناثر)</option>
                </select>
              </div>
            </div>

            {acceptanceRuns.length > 0 && (
              <div className="text-xs font-mono-tabular font-bold text-[#14532D]" dir="ltr">
                PASSED: {passedCount} / {acceptanceRuns.length}
              </div>
            )}
          </div>

          {/* Vector Cards before or after running */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ZF-19 Suite Table */}
            <div className="border border-[#E2DDD2] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#F4F0E8] border-b border-[#E2DDD2] flex items-center justify-between">
                <span className="text-xs font-bold text-[#1C1917]">مجموعة اختبارات ZF-19 (CFRAC)</span>
                <span className="text-[11px] font-mono text-[#57534E]">A_k² ≡ (-1)^(k+1) Q_(k+1)</span>
              </div>
              <div className="divide-y divide-[#EAE5DA]">
                {ZF19_ACCEPTANCE_VECTORS.map(vec => {
                  const run = acceptanceRuns.find(r => r.id === vec.id);
                  const isSel = selectedRun?.id === vec.id;
                  return (
                    <div
                      key={vec.id}
                      onClick={() => {
                        if (run) {
                          setSelectedTestId(run.id);
                        } else {
                          const single = runSingleZf19Test(vec);
                          setAcceptanceRuns(prev => [...prev.filter(x => x.id !== vec.id), single]);
                          setSelectedTestId(vec.id);
                        }
                      }}
                      className={`p-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                        isSel ? 'bg-[#F4F0E8]/70' : 'hover:bg-[#FBF9F5]'
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#1E3A8A]" dir="ltr">{vec.id}</span>
                          <span className="font-bold text-[#1C1917] truncate">{vec.titleAr}</span>
                        </div>
                        <div className="text-[11px] text-[#57534E] truncate">{vec.descriptionAr}</div>
                      </div>
                      <div className="text-left shrink-0 font-mono-tabular text-xs" dir="ltr">
                        {run ? (
                          <div className="text-right space-y-0.5">
                            <span className={`font-bold ${run.passed ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                              {run.passed ? 'PASS' : 'FAIL'} · {run.actualStatus}
                            </span>
                            <div className="text-[10px] text-[#57534E]">{run.elapsedMs} ms</div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#1E3A8A] underline">تشغيل</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ZF-18 Suite Table */}
            <div className="border border-[#E2DDD2] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#F4F0E8] border-b border-[#E2DDD2] flex items-center justify-between">
                <span className="text-xs font-bold text-[#1C1917]">مجموعة اختبارات ZF-18 (Coppersmith LLL)</span>
                <span className="text-[11px] font-mono text-[#57534E]">f(x) = x + p0 ≡ 0 (mod p)</span>
              </div>
              <div className="divide-y divide-[#EAE5DA]">
                {ZF18_ACCEPTANCE_VECTORS.map(vec => {
                  const run = acceptanceRuns.find(r => r.id === vec.id);
                  const isSel = selectedRun?.id === vec.id;
                  return (
                    <div
                      key={vec.id}
                      onClick={() => {
                        if (run) {
                          setSelectedTestId(run.id);
                        } else {
                          const single = runSingleZf18Test(vec);
                          setAcceptanceRuns(prev => [...prev.filter(x => x.id !== vec.id), single]);
                          setSelectedTestId(vec.id);
                        }
                      }}
                      className={`p-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                        isSel ? 'bg-[#F4F0E8]/70' : 'hover:bg-[#FBF9F5]'
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#1E3A8A]" dir="ltr">{vec.id}</span>
                          <span className="font-bold text-[#1C1917] truncate">{vec.titleAr}</span>
                        </div>
                        <div className="text-[11px] text-[#57534E] truncate">{vec.descriptionAr}</div>
                      </div>
                      <div className="text-left shrink-0 font-mono-tabular text-xs" dir="ltr">
                        {run ? (
                          <div className="text-right space-y-0.5">
                            <span className={`font-bold ${run.passed ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                              {run.passed ? 'PASS' : 'FAIL'} · {run.actualStatus}
                            </span>
                            <div className="text-[10px] text-[#57534E]">{run.elapsedMs} ms</div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#1E3A8A] underline">تشغيل</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Drilldown Audit Panel for Selected Test */}
          {selectedRun && (
            <div className="border border-[#E2DDD2] rounded-xl p-5 bg-[#FBF9F5] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
                <div>
                  <div className="text-xs font-mono text-[#1E3A8A]" dir="ltr">
                    {selectedRun.id} · {selectedRun.suite} · N = {selectedRun.N}
                  </div>
                  <h4 className="text-sm font-bold text-[#1C1917]">{selectedRun.titleAr}</h4>
                </div>
                <div className="text-xs font-mono-tabular font-bold" dir="ltr">
                  Status: <span className={selectedRun.passed ? 'text-[#14532D]' : 'text-[#9A3412]'}>{selectedRun.actualStatus}</span> ({selectedRun.elapsedMs} ms)
                </div>
              </div>

              {selectedRun.zf19Result && (
                <div className="space-y-4">
                  <p className="text-xs text-[#57534E]">{selectedRun.zf19Result.diagnostic_message}</p>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular" dir="ltr">
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">FB Primes / Iterations</div>
                      <div className="font-bold text-[#1C1917]">{selectedRun.zf19Result.factor_base_size} / {selectedRun.zf19Result.iterations_run}</div>
                    </div>
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">Matrix (Rows × Cols)</div>
                      <div className="font-bold text-[#1C1917]">{selectedRun.zf19Result.matrix_rows} × {selectedRun.zf19Result.matrix_columns}</div>
                    </div>
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">GF(2) Dependencies</div>
                      <div className="font-bold text-[#1C1917]">{selectedRun.zf19Result.dependencies_found} (GCD: {selectedRun.zf19Result.gcd_attempts})</div>
                    </div>
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">Verified Factors</div>
                      <div className="font-bold text-[#14532D]">
                        {selectedRun.zf19Result.factor_p ? `${selectedRun.zf19Result.factor_p} × ${selectedRun.zf19Result.factor_q}` : 'None'}
                      </div>
                    </div>
                  </div>

                  {/* 6-Point Checklist */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {ZF19_CHECKLIST_LABELS.map(item => {
                      const ok = selectedRun.zf19Result!.verification_status[item.key];
                      return (
                        <div key={item.key} className="bg-white border border-[#E2DDD2] rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                          <span className="text-[#1C1917]">{item.label}</span>
                          <span className={`font-mono font-bold ${ok ? 'text-[#14532D]' : 'text-[#78716C]'}`} dir="ltr">
                            {ok ? 'TRUE' : 'FALSE'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Sample Relation Audit Table */}
                  {selectedRun.zf19Result.sample_relations.length > 0 && (
                    <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg bg-white">
                      <table className="w-full text-xs font-mono-tabular" dir="ltr">
                        <thead className="bg-[#F4F0E8] text-[#57534E] border-b border-[#E2DDD2]">
                          <tr>
                            <th className="py-2 px-3 text-left">k</th>
                            <th className="py-2 px-3 text-left">a_k</th>
                            <th className="py-2 px-3 text-left">P_(k+1)</th>
                            <th className="py-2 px-3 text-left">Q_(k+1)</th>
                            <th className="py-2 px-3 text-left">(-1)^(k+1)</th>
                            <th className="py-2 px-3 text-left">A_k mod N</th>
                            <th className="py-2 px-3 text-left">Identity Check</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EAE5DA]">
                          {selectedRun.zf19Result.sample_relations.map(rel => (
                            <tr key={rel.step_k}>
                              <td className="py-1.5 px-3">{rel.step_k}</td>
                              <td className="py-1.5 px-3">{rel.a_k}</td>
                              <td className="py-1.5 px-3">{rel.P_next}</td>
                              <td className="py-1.5 px-3">{rel.Q_next}</td>
                              <td className="py-1.5 px-3">{rel.sign_neg ? '-1' : '+1'}</td>
                              <td className="py-1.5 px-3">{rel.A_k_mod_N}</td>
                              <td className={`py-1.5 px-3 font-bold ${rel.identity_holds && rel.modular_congruence_holds ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                                {rel.identity_holds && rel.modular_congruence_holds ? 'VALID' : 'FAIL'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {selectedRun.zf18Result && (
                <div className="space-y-4">
                  <p className="text-xs text-[#57534E]">{selectedRun.zf18Result.diagnostic_message}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular" dir="ltr">
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">Lattice Dim (m, t)</div>
                      <div className="font-bold text-[#1C1917]">
                        {selectedRun.zf18Result.lattice_dimension}×{selectedRun.zf18Result.lattice_dimension} (m={selectedRun.zf18Result.lattice_m}, t={selectedRun.zf18Result.lattice_t})
                      </div>
                    </div>
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">Bound log2(X) vs Theory</div>
                      <div className="font-bold text-[#1C1917]">
                        {selectedRun.zf18Result.x_bits}b ≤ {selectedRun.zf18Result.theoretical_bound_bits}b ({selectedRun.zf18Result.howgrave_bound_satisfied ? 'OK' : 'EXCEEDED'})
                      </div>
                    </div>
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">LLL Swaps / Root x0</div>
                      <div className="font-bold text-[#1C1917]">
                        {selectedRun.zf18Result.lll_swaps} swaps / x0={selectedRun.zf18Result.candidate_root ?? 'none'}
                      </div>
                    </div>
                    <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                      <div className="text-[10px] text-[#57534E]">Verified Factors</div>
                      <div className="font-bold text-[#14532D]">
                        {selectedRun.zf18Result.factor_p ? `${selectedRun.zf18Result.factor_p} × ${selectedRun.zf18Result.factor_q}` : 'None'}
                      </div>
                    </div>
                  </div>

                  {/* 7-Point Checklist */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {ZF18_CHECKLIST_LABELS.map(item => {
                      const ok = selectedRun.zf18Result!.verification_status[item.key];
                      return (
                        <div key={item.key} className="bg-white border border-[#E2DDD2] rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                          <span className="text-[#1C1917]">{item.label}</span>
                          <span className={`font-mono font-bold ${ok ? 'text-[#14532D]' : 'text-[#78716C]'}`} dir="ltr">
                            {ok ? 'TRUE' : 'FALSE'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: ZF_ROUTER(N, H) */}
      {subTab === 'router' && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'تلميح صحيح → ZF-18 (100160063)', n: '100160063', hint: true, p0: '9984', x: '64' },
              { label: 'بدون تلميح → ZF-19 (100160063)', n: '100160063', hint: false, p0: '', x: '' },
              { label: 'تلميح خاطئ + تحويل ZF-18→ZF-19 (8051)', n: '8051', hint: true, p0: '20', x: '4' },
              { label: 'مربع كامل → PRECHECK (10201)', n: '10201', hint: false, p0: '', x: '' },
              { label: 'أولي مستقل → PRIME_MODULUS (7919)', n: '7919', hint: false, p0: '', x: '' }
            ].map((ex, i) => (
              <button
                key={i}
                onClick={() => {
                  setRouterN(ex.n);
                  setUseHint(ex.hint);
                  setRouterP0(ex.p0);
                  setRouterX(ex.x);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917]"
              >
                {ex.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-4">
            <div className="lg:col-span-5 space-y-2">
              <label className="text-xs font-bold text-[#1C1917] block">العدد المستهدف N</label>
              <input
                dir="ltr"
                value={routerN}
                onChange={e => setRouterN(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2DDD2] font-mono-tabular text-xs text-[#1C1917]"
              />
            </div>

            <div className="lg:col-span-7 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-[#1C1917] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useHint}
                    onChange={e => setUseHint(e.target.checked)}
                    className="rounded border-[#E2DDD2]"
                  />
                  توفير تلميح جزئي H = (p0, X) لتوجيه ZF-18
                </label>

                <label className="flex items-center gap-2 text-xs text-[#57534E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={routerFallback}
                    onChange={e => setRouterFallback(e.target.checked)}
                    className="rounded border-[#E2DDD2]"
                  />
                  السماح بالتحويل التلقائي ZF-18 → ZF-19
                </label>
              </div>

              {useHint && (
                <div className="grid grid-cols-3 gap-2">
                  <input
                    dir="ltr"
                    placeholder="p0"
                    value={routerP0}
                    onChange={e => setRouterP0(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2DDD2] font-mono text-xs"
                  />
                  <input
                    dir="ltr"
                    placeholder="X"
                    value={routerX}
                    onChange={e => setRouterX(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2DDD2] font-mono text-xs"
                  />
                  <input
                    dir="ltr"
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="0.9"
                    value={routerBeta}
                    onChange={e => setRouterBeta(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2DDD2] font-mono text-xs"
                  />
                </div>
              )}
            </div>

            <div className="lg:col-span-12 flex justify-end">
              <button
                onClick={handleRunRouter}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors"
              >
                تشغيل الموجّه المستقل ZF_Router(N, H)
              </button>
            </div>
          </div>

          {routerResult && (
            <div className="border border-[#E2DDD2] rounded-xl p-5 bg-white space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
                <div className="flex items-center gap-3 font-mono-tabular text-xs" dir="ltr">
                  <span className="font-bold text-[#1E3A8A]">ENGINE: {routerResult.engine_used}</span>
                  <span className={`font-bold ${
                    routerResult.status === 'FACTORS_VERIFIED' || routerResult.status === 'PERFECT_SQUARE'
                      ? 'text-[#14532D]'
                      : routerResult.status === 'PRIME_MODULUS'
                      ? 'text-[#1E3A8A]'
                      : 'text-[#9A3412]'
                  }`}>
                    STATUS: {routerResult.status}
                  </span>
                </div>
                <span className="text-xs font-mono-tabular text-[#57534E]" dir="ltr">
                  {routerResult.execution_time_ms} ms
                </span>
              </div>

              <p className="text-xs text-[#1C1917]">{routerResult.diagnostic_message}</p>

              {routerResult.factor_p && routerResult.factor_q && (
                <div dir="ltr" className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3 font-mono-tabular text-xs font-bold text-[#14532D] break-all">
                  p = {routerResult.factor_p} <br />
                  q = {routerResult.factor_q}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: STAGED BENCHMARKS A-F */}
      {subTab === 'benchmarks' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRunStagedBenchmarks(['A', 'B', 'C'])}
                disabled={isBenchmarking}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white disabled:opacity-50"
              >
                تشغيل المراحل A–C (27–79 بت · CFRAC مقابل LLL و QS)
              </button>
              <button
                onClick={() => handleRunStagedBenchmarks(['D', 'E', 'F'])}
                disabled={isBenchmarking}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#14532D] hover:bg-[#052E16] text-white disabled:opacity-50"
              >
                تشغيل المراحل D–F (256 / 500 / 1024 بت · Coppersmith-LLL)
              </button>
              <button
                onClick={() => handleRunStagedBenchmarks()}
                disabled={isBenchmarking}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] disabled:opacity-50"
              >
                تشغيل جميع المراحل A–F
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#57534E]">عدد التكرارات لحساب Median و IQR:</span>
              <select
                value={trialsPerStage}
                onChange={e => setTrialsPerStage(Number(e.target.value))}
                disabled={isBenchmarking}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2DDD2] font-mono text-xs"
              >
                <option value={3}>3 جولات</option>
                <option value={5}>5 جولات</option>
                <option value={7}>7 جولات</option>
              </select>
            </div>
          </div>

          {benchmarkProgressText && (
            <div className="text-xs font-medium text-[#1E3A8A] bg-[#F4F0E8] border border-[#E2DDD2] rounded-lg px-4 py-2">
              {benchmarkProgressText}
            </div>
          )}

          <div className="overflow-x-auto border border-[#E2DDD2] rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-[#F4F0E8] text-[#1C1917] border-b border-[#E2DDD2]">
                <tr>
                  <th className="py-2.5 px-3 text-right">المرحلة</th>
                  <th className="py-2.5 px-3 text-left" dir="ltr">N (Bits)</th>
                  <th className="py-2.5 px-3 text-left" dir="ltr">ZF-19 CFRAC (Median / IQR)</th>
                  <th className="py-2.5 px-3 text-left" dir="ltr">Quick Rho/Fermat (Median)</th>
                  <th className="py-2.5 px-3 text-left" dir="ltr">ZF-18 LLL (Median / IQR)</th>
                  <th className="py-2.5 px-3 text-right">ملاحظة علمية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE5DA]">
                {STAGED_BENCHMARK_LEVELS.map(lvl => {
                  const row = stagedRows.find(r => r.stage === lvl.stage);
                  return (
                    <tr key={lvl.stage} className="hover:bg-[#FBF9F5]">
                      <td className="py-2.5 px-3 font-bold text-[#1C1917] whitespace-nowrap">{lvl.labelAr}</td>
                      <td className="py-2.5 px-3 font-mono-tabular text-[#57534E]" dir="ltr">
                        {row ? row.targetNPreview : `${lvl.bits}b`}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular" dir="ltr">
                        {row?.zf19Summary ? (
                          <div>
                            <span className="font-bold text-[#14532D]">{row.zf19Summary.median_ms} ms</span>
                            <span className="text-[#57534E]"> · IQR {row.zf19Summary.iqr_ms}</span>
                            <div className="text-[10px] text-[#57534E]">
                              rels={row.zf19Last?.relations_collected}, iter={row.zf19Last?.iterations_run}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[#78716C]">{lvl.supportsCfrac ? '—' : 'غير عملي دون تلميح'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular" dir="ltr">
                        {row?.quickSummary ? (
                          <span className="text-[#1C1917]">{row.quickSummary.median_ms} ms (IQR {row.quickSummary.iqr_ms})</span>
                        ) : (
                          <span className="text-[#78716C]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular" dir="ltr">
                        {row?.zf18Summary ? (
                          <div>
                            <span className="font-bold text-[#1E3A8A]">{row.zf18Summary.median_ms} ms</span>
                            <span className="text-[#57534E]"> · IQR {row.zf18Summary.iqr_ms}</span>
                            <div className="text-[10px] text-[#57534E]">
                              dim={row.zf18Last?.lattice_dimension}×{row.zf18Last?.lattice_dimension}, {row.zf18Last?.status}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[#78716C]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#57534E] text-[11px]">{lvl.notesAr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4: PYTHON REFERENCE ARCHITECTURE */}
      {subTab === 'python' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 border border-[#E2DDD2] rounded-xl overflow-hidden bg-[#FBF9F5]">
            <div className="px-4 py-3 bg-[#F4F0E8] border-b border-[#E2DDD2] text-xs font-bold text-[#1C1917]">
              ملفات معمارية Python المرجعية
            </div>
            <div className="divide-y divide-[#EAE5DA]">
              {ZF_PYTHON_REFERENCE_FILES.map(f => (
                <button
                  key={f.path}
                  onClick={() => setSelectedPyPath(f.path)}
                  className={`w-full text-right px-4 py-2.5 transition-colors flex flex-col gap-0.5 ${
                    selectedPyFile.path === f.path ? 'bg-white border-r-2 border-[#1E3A8A]' : 'hover:bg-white/60'
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-[#1E3A8A]" dir="ltr">{f.path}</span>
                  <span className="text-[11px] text-[#57534E]">{f.titleAr}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 border border-[#E2DDD2] rounded-xl overflow-hidden bg-white flex flex-col">
            <div className="px-4 py-3 bg-[#F4F0E8] border-b border-[#E2DDD2] flex items-center justify-between gap-2">
              <div className="font-mono text-xs font-bold text-[#1C1917]" dir="ltr">
                {selectedPyFile.path}
              </div>
              <button
                onClick={() => handleCopyPython(selectedPyFile.path, selectedPyFile.code)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A]"
              >
                {copiedPath === selectedPyFile.path ? 'تم النسخ ✓' : 'نسخ الكود'}
              </button>
            </div>
            <pre
              dir="ltr"
              className="p-4 text-[11px] leading-relaxed font-mono text-[#1C1917] bg-[#FBF9F5] overflow-x-auto max-h-[460px]"
            >
              {selectedPyFile.code}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default Zf1819LabPanel;
