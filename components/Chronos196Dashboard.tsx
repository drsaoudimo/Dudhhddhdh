import React, { useMemo, useState } from 'react';
import { Translations, Language } from '../translations';
import { bigIntSqrt } from '../mathUtils';
import { analyzeSnfsAndCadoParams } from '../snfsDetector';
import {
  computeV4SieveDiagnostics,
  EmpiricalBenchmarkRun,
  SieveAllocationMode,
  V4_BENCHMARK_PRESETS
} from '../v4FallbackOptimizer';
import type { UnifiedRaceHints, UnifiedRaceSummary } from '../lib/chronosUnifiedRace';
import ZfSmartIntegrationDashboard from './ZfSmartIntegrationDashboard';

interface Solution {
  factor1: string;
  factor2: string;
  allFactors?: string[];
  method?: string;
  duration?: number;
}

export interface ChronosSuyamaInfo {
  curveIndex: number;
  sigma: string;
  b1Bound: number;
  b2Bound: number;
  torsionCertified: boolean;
}

export interface ChronosCfracInfo {
  kMultiplier: number;
  steps: number;
  fbSize: number;
  targetRelations: number;
  convergentsSample: Array<{ step: number; a_val: string; q_val: string; a_cap?: string; status?: string }>;
  smoothRelations: number;
  partialRelations: number;
  lpCollisions: number;
  statusLabel?: string;
}

export const CHRONOS_BENCHMARKS = [
  {
    nameAr: "196 بت متوازن (RSA-196 Balanced)",
    nameFr: "196-bit Équilibré (RSA-196 Balanced)",
    bits: 196,
    n: "25345924542096859410889582407385856782286168978105125446929",
    descAr: "عدد شبه أولي متوازن (~59 رقماً عشرياً) من عاملين ~98 بت",
    descFr: "Semi-premier équilibré (~59 chiffres) de facteurs ~98 bits"
  },
  {
    nameAr: "196 بت غير متوازن (RSA-196 Unbalanced)",
    nameFr: "196-bit Non-Équilibré (RSA-196 Unbalanced)",
    bits: 196,
    n: "50216813883095230170302197835512654186280668231744194871751",
    descAr: "عامل أولي 48 بت وعامل رئيسي 149 بت",
    descFr: "Facteur premier 48 bits et facteur principal 149 bits"
  },
  {
    nameAr: "256 بت قياسي (256-bit Challenge)",
    nameFr: "256-bit Standard (256-bit Challenge)",
    bits: 256,
    n: "115792089237316195423570985008687907853269984665640564039457584007913129639937",
    descAr: "معيار تشفير المنحنيات والأعداد شبه الأولية (~77 رقماً)",
    descFr: "Standard cryptographique (~77 chiffres décimaux)"
  },
  {
    nameAr: "384 بت متوسط (384-bit RSA Challenge)",
    nameFr: "384-bit Intermédiaire (384-bit RSA Challenge)",
    bits: 384,
    n: "394020061963944792122790401001436138050797188147599799518042511470487057039708709562719086198604720812671899092481",
    descAr: "تحدي RSA المتوسط (~116 رقماً عشرياً)",
    descFr: "Défi RSA intermédiaire (~116 chiffres décimaux)"
  },
  {
    nameAr: "512 بت كامل (512-bit RSA Half-Kilobit)",
    nameFr: "512-bit Complet (512-bit RSA Half-Kilobit)",
    bits: 512,
    n: "13407807929942597099574024998205846127479365820592393377723561443721764030073546976801874298166903427690031858186486050853753882811946569946433649006084097",
    descAr: "محطة تحديات RSA لنصف كيلوبت (~154 رقماً)",
    descFr: "Jalon RSA d'un demi-kilobit (~154 chiffres)"
  },
  {
    nameAr: "770 بت Aurifeuillean SNFS (2^770 + 1)",
    nameFr: "770-bit Aurifeuillean SNFS (2^770 + 1)",
    bits: 771,
    n: ((1n << 770n) + 1n).toString(),
    descAr: "صيغة Aurifeuillean قابلة للتفكيك الجبري الفوري فوق 768 بت",
    descFr: "Forme Aurifeuillean factorisable algébriquement > 768 bits"
  },
  {
    nameAr: "1026 بت Aurifeuillean SNFS (2^1026 + 1)",
    nameFr: "1026-bit Aurifeuillean SNFS (2^1026 + 1)",
    bits: 1027,
    n: ((1n << 1026n) + 1n).toString(),
    descAr: "تحدي >1024 بت يُفكك جبرياً أو عبر CADO-NFS",
    descFr: "Défi >1024 bits résolu par split algébrique / CADO-NFS"
  }
];

export interface WorkerThreadStat {
  id: number;
  role?: 'ecm' | 'siqs';
  curves: number;
  polys?: number;
  relations?: number;
  stage: string;
  active: boolean;
}

export interface Gf2PoolStats {
  collected: number;
  target: number;
  factorBaseSize: number;
  matrixSolves: number;
  lastSource: string;
  partialCount?: number;
  lpCollisions?: number;
  krylovSteps?: number;
  coreShape?: string;
  solverMethod?: string;
  relationsPerSec?: number;
  polysProcessed?: number;
}

interface Chronos196DashboardProps {
  nValue: string;
  lang: Language;
  t: Translations;
  cycle: number;
  suyamaInfo: ChronosSuyamaInfo | null;
  cfracInfo?: ChronosCfracInfo | null;
  mDualMatrix?: number[][] | null;
  totalCurves: number;
  smoothRelations: number;
  steps: number;
  solution: Solution | null;
  isRunning: boolean;
  cpuUsage: number;
  onSelectBenchmark?: (n: string) => void;
  workerCountMode?: number | 'auto';
  onWorkerCountModeChange?: (mode: number | 'auto') => void;
  effectiveWorkerCount?: number;
  workerThreadsStats?: WorkerThreadStat[];
  gf2Stats?: Gf2PoolStats;
  sieveMode?: SieveAllocationMode;
  onSieveModeChange?: (mode: SieveAllocationMode) => void;
  benchmarkHistory?: EmpiricalBenchmarkRun[];
  onClearBenchmarks?: () => void;
  unifiedRace?: UnifiedRaceSummary;
  unifiedHints?: UnifiedRaceHints;
  onUpdateUnifiedHints?: (hints: UnifiedRaceHints) => void;
  onLaunchUnifiedRace?: (hints?: UnifiedRaceHints) => void;
  onStopUnifiedRace?: () => void;
}

export const Chronos196Dashboard: React.FC<Chronos196DashboardProps> = ({
  nValue,
  lang,
  t,
  cycle,
  suyamaInfo,
  mDualMatrix,
  totalCurves,
  steps,
  solution,
  isRunning,
  onSelectBenchmark,
  workerCountMode = 'auto',
  onWorkerCountModeChange,
  effectiveWorkerCount = 4,
  workerThreadsStats = [],
  gf2Stats,
  sieveMode = 'v4-fallback',
  onSieveModeChange,
  benchmarkHistory = [],
  onClearBenchmarks,
  unifiedRace,
  unifiedHints,
  onUpdateUnifiedHints,
  onLaunchUnifiedRace,
  onStopUnifiedRace
}) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedCado, setCopiedCado] = useState(false);
  const [showCadoConfig, setShowCadoConfig] = useState(false);
  const [showHintsDrawer, setShowHintsDrawer] = useState(false);
  const [showDeepTelemetry, setShowDeepTelemetry] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number; val: number } | null>(null);
  const [hoveredAllocCell, setHoveredAllocCell] = useState<{ i: number; j: number; val: number; s: number; p: number } | null>(null);
  const isRTL = lang === 'ar';

  let nBig = 0n;
  let bitLength = 0;
  let totalDecDigits = 0;
  let sqrtN = 0n;

  try {
    if (nValue.trim()) {
      nBig = BigInt(nValue.trim());
      bitLength = nBig > 0n ? nBig.toString(2).length : 0;
      totalDecDigits = nBig > 0n ? nBig.toString(10).length : 0;
      sqrtN = nBig > 0n ? bigIntSqrt(nBig) : 0n;
    }
  } catch {}

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const factorsList = useMemo(() => {
    if (unifiedRace?.status === 'success' && unifiedRace.factors.length > 0) {
      return unifiedRace.factors;
    }
    if (solution?.allFactors && solution.allFactors.length > 0) {
      return solution.allFactors;
    }
    if (solution) {
      return [solution.factor1, solution.factor2].filter(Boolean);
    }
    return [];
  }, [unifiedRace, solution]);

  const displayElapsedMs =
    unifiedRace && (unifiedRace.elapsedMs > 0 || unifiedRace.status !== 'idle')
      ? unifiedRace.elapsedMs
      : (solution?.duration ?? 0);

  const displayOps =
    unifiedRace && unifiedRace.totalOperations > 0
      ? unifiedRace.totalOperations
      : steps;

  const displayWinningEngine =
    unifiedRace?.winningEngine || solution?.method || null;

  const snfsInfo = useMemo(() => {
    if (nBig <= 0n) return null;
    try {
      return analyzeSnfsAndCadoParams(nBig);
    } catch {
      return null;
    }
  }, [nValue]);

  const v4Diagnostics = useMemo(() => computeV4SieveDiagnostics(), []);

  const currentVanillaRun = benchmarkHistory.find(r => r.n === nValue.trim() && r.mode === 'vanilla');
  const currentV4Run = benchmarkHistory.find(r => r.n === nValue.trim() && r.mode === 'v4-fallback');
  const measuredSpeedup = (currentVanillaRun && currentV4Run && currentV4Run.durationMs > 0)
    ? (currentVanillaRun.durationMs / currentV4Run.durationMs)
    : null;
  const measuredRelSpeedup = (currentVanillaRun && currentV4Run && currentVanillaRun.relationsPerSec > 0)
    ? (currentV4Run.relationsPerSec / currentVanillaRun.relationsPerSec)
    : null;

  const copyCadoConfig = () => {
    if (!snfsInfo) return;
    navigator.clipboard.writeText(snfsInfo.cadoNfsConfig);
    setCopiedCado(true);
    setTimeout(() => setCopiedCado(false), 1800);
  };

  const compactPresets = [
    { label: isRTL ? '64 بت (Ψ-Factor)' : '64b (Ψ-Factor)', n: '14933414702175031797' },
    { label: isRTL ? '116 بت A/B' : '116b A/B', n: V4_BENCHMARK_PRESETS[0].n },
    { label: isRTL ? '196 بت متوازن' : '196b Balanced', n: CHRONOS_BENCHMARKS[0].n },
    { label: isRTL ? '770 بت Aurifeuillean' : '770b Aurifeuillean', n: CHRONOS_BENCHMARKS[5].n }
  ];

  const hasSolvedFactors = factorsList.length > 0 && (Boolean(solution) || unifiedRace?.status === 'success');
  const sharedGf2 = unifiedRace?.sharedGf2Stats;

  return (
    <div className={`space-y-6 text-[#1C1917] ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Compact Unified Parallel Race Console & Result Card */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#1E3A8A]">
              <span>{isRTL ? 'Chronos v4 — السباق الموحد' : 'Chronos v4 — Course Unifiée'}</span>
              <span aria-hidden="true" className="text-[#A89F8D]">·</span>
              <span className="text-[#14532D] font-bold tabular-nums">{bitLength} {t.bitsLabel} ({totalDecDigits} {isRTL ? 'خانة' : 'chiffres'})</span>
              <span aria-hidden="true" className="text-[#A89F8D]">·</span>
              <span className="text-[#57534E]">Ψ-Factor · &gt;500b SNFS/Wiener/BD · ZF-18/19 · CFRAC · SIQS/ECM</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-serif-academic text-[#1C1917]">
              {t.chronosDashboardTitle}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowHintsDrawer(prev => !prev)}
              disabled={isRunning}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-[#E2DDD2] bg-[#F4F0E8] text-[#1C1917] hover:border-[#1E3A8A] disabled:opacity-50"
            >
              {isRTL
                ? (showHintsDrawer ? 'إخفاء معطيات >500 بت' : 'معطيات اختيارية (e / p₀)')
                : (showHintsDrawer ? 'Masquer indices' : 'Indices optionnels (e / p₀)')}
            </button>
            {onLaunchUnifiedRace && (
              !isRunning ? (
                <button
                  onClick={() => onLaunchUnifiedRace(unifiedHints)}
                  disabled={nBig < 2n}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors disabled:opacity-50"
                >
                  {isRTL ? 'تشغيل السباق الموحد' : 'Lancer la Course Unifiée'}
                </button>
              ) : (
                <button
                  onClick={onStopUnifiedRace}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-[#9A3412] hover:bg-[#7C2D12] text-white transition-colors"
                >
                  {isRTL ? 'إيقاف السباق' : 'Arrêter'}
                </button>
              )
            )}
          </div>
        </div>

        {/* Quick Benchmark Selector */}
        {onSelectBenchmark && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-[#57534E]">
              {isRTL ? 'نماذج اختبار سريعة:' : 'Jeux de test :' }
            </span>
            {compactPresets.map((bm, i) => (
              <button
                key={i}
                disabled={isRunning}
                onClick={() => onSelectBenchmark(bm.n)}
                className="px-2.5 py-1 text-xs font-mono-tabular rounded-lg border border-[#E2DDD2] bg-[#FBF9F5] hover:border-[#1E3A8A] text-[#1C1917] disabled:opacity-50 transition-colors"
              >
                {bm.label}
              </button>
            ))}
          </div>
        )}

        {/* Optional Hints Drawer for >500b Weak-Key / Coppersmith Scouts */}
        {showHintsDrawer && onUpdateUnifiedHints && (
          <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-[#57534E] mb-1">
                {isRTL ? 'الأس العام e (لهجمات Wiener / Boneh-Durfee)' : 'Exposant public e (Wiener / BD)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={unifiedHints?.publicExponentE || ''}
                onChange={(e) => onUpdateUnifiedHints({ ...unifiedHints, publicExponentE: e.target.value })}
                placeholder="مثال: عدد ضخم يطابق d صغير"
                className="w-full px-3 py-1.5 rounded bg-white border border-[#E2DDD2] font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#57534E] mb-1">
                {isRTL ? 'تقريب العامل p₀ (لهجوم كوبرسميث ZF-18)' : 'Approximation p₀ (Coppersmith ZF-18)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={unifiedHints?.partialPrimeP0 || ''}
                onChange={(e) => onUpdateUnifiedHints({ ...unifiedHints, partialPrimeP0: e.target.value })}
                placeholder="البتات العليا المعروفة p₀"
                className="w-full px-3 py-1.5 rounded bg-white border border-[#E2DDD2] font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#57534E] mb-1">
                {isRTL ? 'عدد البتات المجهولة (k)' : 'Bits inconnus (k)'}
              </label>
              <input
                type="number"
                dir="ltr"
                min={2}
                max={256}
                value={unifiedHints?.unknownBits ?? ''}
                onChange={(e) =>
                  onUpdateUnifiedHints({
                    ...unifiedHints,
                    unknownBits: e.target.value ? Number(e.target.value) : undefined
                  })
                }
                placeholder="تلقائي"
                className="w-full px-3 py-1.5 rounded bg-white border border-[#E2DDD2] font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
          </div>
        )}

        {/* Strict Compact 3-Metric Summary: Elapsed Time · Operations · Engine / Shared GF(2) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[11px] font-mono text-[#57534E] block">
              {isRTL ? 'الزمن المستغرق' : 'Temps écoulé'}
            </span>
            <span dir="ltr" className="text-lg font-bold font-mono-tabular text-[#1C1917] block">
              {displayElapsedMs > 0
                ? (displayElapsedMs >= 1000
                    ? `${(displayElapsedMs / 1000).toFixed(2)} s (${displayElapsedMs} ms)`
                    : `${displayElapsedMs} ms`)
                : '—'}
            </span>
          </div>

          <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[11px] font-mono text-[#57534E] block">
              {isRTL ? 'إجمالي العمليات الحسابية' : 'Opérations totales'}
            </span>
            <span dir="ltr" className="text-lg font-bold font-mono-tabular text-[#1E3A8A] block">
              {displayOps > 0 ? displayOps.toLocaleString() : '—'}
            </span>
          </div>

          <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[11px] font-mono text-[#57534E] block">
              {isRunning
                ? (isRTL ? `السباق نشط · حلقة #${cycle || 1}` : `En cours · Cycle #${cycle || 1}`)
                : (isRTL ? 'المحرك الفائز / الحالة' : 'Moteur / Statut')}
            </span>
            <span className={`text-sm font-bold font-mono-tabular block truncate ${
              hasSolvedFactors ? 'text-[#14532D]' : isRunning ? 'text-[#1E3A8A]' : 'text-[#57534E]'
            }`}>
              {isRunning
                ? (sharedGf2
                    ? `GF(2): ${sharedGf2.siqsRelations} SIQS + ${sharedGf2.cfracRelations} CFRAC / ${sharedGf2.targetRelations}`
                    : (isRTL ? 'سباق متوازٍ قيد التنفيذ…' : 'Course en cours…'))
                : (displayWinningEngine || (isRTL ? 'جاهز للتشغيل الموحد' : 'Prêt'))}
            </span>
          </div>
        </div>

        {/* Live Shared GF(2) Matrix Progress Bar (SIQS + CFRAC) */}
        {(isRunning || (sharedGf2 && sharedGf2.totalFullRelations > 0)) && sharedGf2 && (
          <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
              <span className="font-bold text-[#1C1917]">
                {isRTL ? 'مصفوفة GF(2) المشتركة (SIQS + CFRAC → Block Wiedemann)' : 'Matrice GF(2) Unifiée (SIQS + CFRAC)'}
              </span>
              <span className="text-[#1E3A8A]" dir="ltr">
                SIQS: {sharedGf2.siqsRelations} · CFRAC: {sharedGf2.cfracRelations} · Total: {sharedGf2.totalFullRelations}/{sharedGf2.targetRelations} · 1LP: {sharedGf2.lpCollisions}
              </span>
            </div>
            <div className="h-1.5 bg-[#E2DDD2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1E3A8A] transition-all duration-200"
                style={{
                  width: `${Math.min(100, Math.round((sharedGf2.totalFullRelations / Math.max(1, sharedGf2.targetRelations)) * 100))}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Compact Verified Factor Result Box */}
        {hasSolvedFactors && (
          <div className="bg-[#FBF9F5] border border-[#14532D]/40 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="font-bold text-[#14532D]">✓ {t.proofTitle}</span>
                {displayWinningEngine && (
                  <>
                    <span aria-hidden="true" className="text-[#A89F8D]">·</span>
                    <span className="text-[#1C1917] font-semibold">{displayWinningEngine}</span>
                  </>
                )}
              </div>
              <div className="text-xs font-mono-tabular text-[#14532D] font-bold" dir="ltr">
                {displayElapsedMs} ms · {displayOps.toLocaleString()} ops
              </div>
            </div>

            {unifiedRace?.noteAr && (
              <div className="text-xs text-[#57534E]">{unifiedRace.noteAr}</div>
            )}

            <div dir="ltr" className="font-mono-tabular text-xs bg-white p-3 rounded border border-[#E2DDD2] break-all text-[#1C1917]">
              N = {factorsList.join(' × ')}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" dir="ltr">
              {factorsList.map((f, idx) => (
                <div key={idx} className="bg-white p-3 rounded border border-[#E2DDD2] flex items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs break-all text-[#1C1917]">
                    p_{idx + 1} = {f}
                  </span>
                  <button
                    onClick={() => copyToClipboard(f, idx)}
                    className="px-2.5 py-1 text-[11px] rounded bg-[#F4F0E8] border border-[#E2DDD2] text-[#1E3A8A] shrink-0"
                  >
                    {copiedIdx === idx ? t.copiedNotice : t.copyBtn}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Secondary Engineering & Spectral Telemetry Toggle */}
        <div className="pt-2 border-t border-[#E2DDD2] flex items-center justify-between">
          <button
            onClick={() => setShowDeepTelemetry(prev => !prev)}
            className="text-xs font-mono font-semibold text-[#1E3A8A] hover:underline"
          >
            {showDeepTelemetry
              ? (isRTL ? '▲ إخفاء التفاصيل الهندسية والرسوم الطيفية' : '▲ Masquer les détails d’ingénierie')
              : (isRTL ? '▼ معاينة التفاصيل الهندسية والرسوم الطيفية (للباحثين)' : '▼ Afficher les détails d’ingénierie et télémétrie')}
          </button>
          {nBig > 0n && (
            <span className="text-[11px] font-mono-tabular text-[#57534E]" dir="ltr">
              ⌊√N⌋ ≈ {sqrtN.toString().slice(0, 18)}{sqrtN.toString().length > 18 ? '…' : ''}
            </span>
          )}
        </div>
      </div>

      {showDeepTelemetry && (
        <div className="space-y-6">
          {nBig > 0n && (
            <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2]">
                <span className="text-[11px] text-[#57534E] block mb-1">{t.targetModulus} (N):</span>
                <span dir="ltr" className="font-mono-tabular text-xs text-[#1E3A8A] break-all select-all block">
                  {nBig.toString()}
                </span>
              </div>
              <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2]">
                <span className="text-[11px] text-[#57534E] block mb-1">{t.squareRootApprox} (⌊√N⌋):</span>
                <span dir="ltr" className="font-mono-tabular text-xs text-[#1C1917] break-all select-all block">
                  {sqrtN.toString()}
                </span>
              </div>
            </div>
          )}

          {/* ZF-15 / ZF-17 / ZF-16 Smart Integration & Spectral Ranking Dashboard */}
          <div>
            <ZfSmartIntegrationDashboard nValue={nValue} effectiveWorkerCount={effectiveWorkerCount} />
          </div>

      {/* SNFS Detector & Cado-NFS Config Exporter */}
      {snfsInfo && (
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2DDD2] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#1C1917]">{t.snfsDetectorTitle}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono mt-1">
                <span className={snfsInfo.isSpecialForm ? 'text-[#9A3412] font-bold' : 'text-[#57534E]'}>
                  {isRTL ? snfsInfo.formLabelAr : snfsInfo.formLabelFr}
                </span>
                <span aria-hidden="true" className="text-[#A89F8D]">·</span>
                <span className="text-[#1E3A8A]">
                  {isRTL ? snfsInfo.recommendedEngineAr : snfsInfo.recommendedEngineFr}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowCadoConfig(prev => !prev)}
                className="px-3 py-1.5 text-xs font-mono font-medium rounded-lg border border-[#E2DDD2] bg-[#F4F0E8] text-[#1C1917] hover:border-[#1E3A8A]"
              >
                {showCadoConfig ? (isRTL ? 'إخفاء Config' : 'Masquer Config') : t.cadoExporterTitle}
              </button>
              <button
                onClick={copyCadoConfig}
                className="px-3.5 py-1.5 text-xs font-mono font-medium rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white"
              >
                {copiedCado ? t.copiedNotice : t.copyCadoConfigBtn}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular" dir="ltr">
            <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2]">
              <span className="text-[#57534E] block text-[11px]">GNFS Degree</span>
              <span className="text-[#1C1917] font-bold text-sm">d = {snfsInfo.estimatedDegree}</span>
            </div>
            <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2]">
              <span className="text-[#57534E] block text-[11px]">lim0 / lim1</span>
              <span className="text-[#1E3A8A] font-bold text-sm">{(snfsInfo.lim0 / 1000).toFixed(0)}k / {(snfsInfo.lim1 / 1000).toFixed(0)}k</span>
            </div>
            <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2]">
              <span className="text-[#57534E] block text-[11px]">Large Prime (lpb0/1)</span>
              <span className="text-[#9A3412] font-bold text-sm">2^{snfsInfo.lpb0} / 2^{snfsInfo.lpb1}</span>
            </div>
            <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2]">
              <span className="text-[#57534E] block text-[11px]">Browser Engine</span>
              <span className="text-[#14532D] font-bold text-sm">
                {bitLength > 500
                  ? 'Montgomery REDC ECM + p±1'
                  : bitLength > 220
                  ? 'Montgomery ECM + p±1'
                  : 'SIQS + 1LP + ECM'}
              </span>
            </div>
          </div>

          {showCadoConfig && (
            <div className="space-y-3">
              <pre className="bg-[#F4F0E8] p-4 rounded-lg border border-[#E2DDD2] text-xs font-mono text-[#1C1917] overflow-x-auto select-all" dir="ltr">
                {snfsInfo.cadoNfsConfig}
              </pre>
              <pre className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] text-xs font-mono text-[#1E3A8A] overflow-x-auto select-all" dir="ltr">
                {snfsInfo.cadoPolyFile}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Benchmark Catalog Strip */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2.5">
          <h3 className="text-xs font-bold text-[#1C1917]">
            {isRTL ? "كتالوج الاختبارات التجريبية وتحديات RSA (116 بت إلى 512 بت)" : "Catalogue de Références Empiriques & Défis RSA (116 à 512 bits)"}
          </h3>
          <span className="text-[11px] text-[#57534E] font-mono">
            {isRTL ? "نقر مباشر للتحميل والتحليل" : "Cliquer pour charger"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {V4_BENCHMARK_PRESETS.map((bm) => (
            <button
              key={bm.id}
              onClick={() => onSelectBenchmark && onSelectBenchmark(bm.n)}
              disabled={isRunning}
              className="text-right bg-[#FBF9F5] hover:bg-[#F4F0E8] p-3 rounded-lg border border-[#1E3A8A]/30 hover:border-[#1E3A8A] transition-colors flex flex-col justify-between disabled:opacity-50"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold font-mono-tabular text-[#1E3A8A] mb-1">
                  <span>{bm.bits} {t.bitsLabel} · A/B</span>
                  <span>↗</span>
                </div>
                <div className="text-xs font-semibold text-[#1C1917] line-clamp-1">
                  {isRTL ? bm.nameAr : bm.nameFr}
                </div>
                <div className="text-[11px] text-[#57534E] mt-1 line-clamp-2">
                  {isRTL ? bm.descAr : bm.descFr}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-1">
          {CHRONOS_BENCHMARKS.map((bm, idx) => (
            <button
              key={idx}
              onClick={() => onSelectBenchmark && onSelectBenchmark(bm.n)}
              disabled={isRunning}
              className="text-right bg-[#FBF9F5] hover:bg-[#F4F0E8] p-3 rounded-lg border border-[#E2DDD2] hover:border-[#9A3412] transition-colors flex flex-col justify-between disabled:opacity-50"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold font-mono-tabular text-[#57534E] mb-1">
                  <span>{bm.bits} {t.bitsLabel}</span>
                  <span>↗</span>
                </div>
                <div className="text-xs font-semibold text-[#1C1917] line-clamp-1">
                  {isRTL ? bm.nameAr : bm.nameFr}
                </div>
                <div className="text-[10px] text-[#57534E] mt-1 line-clamp-2">
                  {isRTL ? bm.descAr : bm.descFr}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* v4 FALLBACK_MEDIAN_PRIOR & Empirical A/B Comparator */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="text-[#9A3412] font-bold">
                ▲ {v4Diagnostics.tValidation.decision} → {v4Diagnostics.tValidation.activeMode}
              </span>
              <span aria-hidden="true" className="text-[#A89F8D]">·</span>
              <span className="text-[#1E3A8A] tabular-nums">
                {isRTL ? "التسريع المتوقع:" : "Gain attendu :"} {v4Diagnostics.effectiveSpeedupEstimate}
              </span>
            </div>
            <h3 className="text-sm md:text-base font-bold font-serif-academic text-[#1C1917]">
              {t.v4FallbackTitle}
            </h3>
            <p className="text-xs text-[#57534E] max-w-3xl">
              {t.v4FallbackSubtitle}
            </p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-1.5 shrink-0">
            <span className="text-[11px] font-mono text-[#57534E]">{t.sieveModeLabel}</span>
            <div className="flex items-center gap-1 p-1 bg-[#F4F0E8] rounded-lg border border-[#E2DDD2]">
              <button
                onClick={() => onSieveModeChange && onSieveModeChange('v4-fallback')}
                disabled={isRunning}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  sieveMode === 'v4-fallback'
                    ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] font-bold'
                    : 'text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                {t.sieveModeV4Btn}
              </button>
              <button
                onClick={() => onSieveModeChange && onSieveModeChange('vanilla')}
                disabled={isRunning}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  sieveMode === 'vanilla'
                    ? 'bg-white text-[#9A3412] border border-[#E2DDD2] font-bold'
                    : 'text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                {t.sieveModeVanillaBtn}
              </button>
            </div>
          </div>
        </div>

        {/* T-Rejection Quantitative Audit Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono-tabular" dir="ltr">
          <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[#57534E] block text-[11px]">Split-Half ||T1−T2||/||T1||</span>
            <span className="text-[#9A3412] font-bold text-sm">
              {v4Diagnostics.tValidation.splitHalfStability.toFixed(2)} &gt; 0.80
            </span>
          </div>
          <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[#57534E] block text-[11px]">LOO Relative Error</span>
            <span className="text-[#9A3412] font-bold text-sm">
              {v4Diagnostics.tValidation.looRelativeError.toFixed(2)} &gt; 0.40
            </span>
          </div>
          <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[#57534E] block text-[11px]">Cross Err (T1→2 / T2→1)</span>
            <span className="text-[#1C1917] font-bold text-sm">
              {v4Diagnostics.tValidation.crossError12.toFixed(2)} / {v4Diagnostics.tValidation.crossError21.toFixed(2)}
            </span>
          </div>
          <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[#57534E] block text-[11px]">Rank-1 SVD Energy (A1)</span>
            <span className="text-[#1E3A8A] font-bold text-sm">
              {(v4Diagnostics.tValidation.rank1EnergyRatio * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2] space-y-1">
            <span className="text-[#57534E] block text-[11px]">M_corrected[2] Corr</span>
            <span className="text-[#14532D] font-bold text-sm">
              r = {v4Diagnostics.mCorrelations[2]?.pearsonCorr.toFixed(3)}
            </span>
          </div>
        </div>

        {/* 19x6 Allocation Weight Heatmap & Empirical Benchmark Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-2 bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
            <div className="flex items-center justify-between text-xs font-mono border-b border-[#E2DDD2] pb-2">
              <span className="font-bold text-[#1C1917]">
                {isRTL ? "أوزان s_i × p_j (19×6)" : "Allocation s_i × p_j"}
              </span>
              <span className="text-[#1E3A8A] text-[11px] tabular-nums" dir="ltr">
                {hoveredAllocCell
                  ? `[${hoveredAllocCell.i},${hoveredAllocCell.j}]=${hoveredAllocCell.val.toFixed(3)}`
                  : '19 rows × 6 bands'}
              </span>
            </div>
            <div className="space-y-0.5" dir="ltr">
              {v4Diagnostics.allocationMatrix.map((rowVals, rIdx) => {
                const sVal = v4Diagnostics.rowMedians[rIdx];
                return (
                  <div key={rIdx} className="flex items-center gap-1.5 text-[10px] font-mono-tabular">
                    <span className={`w-7 text-right shrink-0 ${rIdx === 7 || rIdx === 8 ? 'text-[#9A3412] font-bold' : 'text-[#57534E]'}`}>
                      R{rIdx}
                    </span>
                    <div className="grid grid-cols-6 gap-0.5 flex-1">
                      {rowVals.map((val, cIdx) => {
                        const intensity = Math.min(1, val / 0.68);
                        const isHot = rIdx === 7 || rIdx === 8;
                        const bg = isHot
                          ? `rgba(154, 52, 18, ${0.14 + intensity * 0.65})`
                          : `rgba(30, 58, 138, ${0.08 + intensity * 0.62})`;
                        return (
                          <div
                            key={cIdx}
                            onMouseEnter={() => setHoveredAllocCell({
                              i: rIdx,
                              j: cIdx,
                              val,
                              s: sVal,
                              p: v4Diagnostics.colPriors6[cIdx]
                            })}
                            onMouseLeave={() => setHoveredAllocCell(null)}
                            className="h-3 rounded-[2px] cursor-crosshair hover:ring-1 hover:ring-[#1C1917]"
                            style={{ backgroundColor: bg }}
                          />
                        );
                      })}
                    </div>
                    <span className={`w-10 text-left shrink-0 ${sVal >= 1.3 ? 'text-[#14532D] font-bold' : 'text-[#57534E]'}`}>
                      {sVal.toFixed(2)}×
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2">
              <h4 className="text-xs font-bold text-[#1C1917]">{t.empiricalBenchTitle}</h4>
              <div className="flex items-center gap-3 text-xs font-mono-tabular">
                {measuredSpeedup !== null && (
                  <span className="text-[#14532D] font-bold">
                    {t.empiricalSpeedupLabel}: {measuredSpeedup.toFixed(2)}×
                    {measuredRelSpeedup !== null ? ` (${measuredRelSpeedup.toFixed(2)}× rel/s)` : ''}
                  </span>
                )}
                {benchmarkHistory.length > 0 && onClearBenchmarks && (
                  <button
                    onClick={onClearBenchmarks}
                    className="px-2.5 py-1 text-[11px] rounded border border-[#E2DDD2] bg-white text-[#57534E] hover:text-[#1C1917]"
                  >
                    {t.resetBtn}
                  </button>
                )}
              </div>
            </div>

            {benchmarkHistory.length > 0 ? (
              <div className="overflow-x-auto" dir="ltr">
                <table className="w-full text-left text-xs font-mono-tabular">
                  <thead>
                    <tr className="text-[#57534E] border-b border-[#E2DDD2]">
                      <th className="py-1.5 pr-3">Mode</th>
                      <th className="py-1.5 pr-3">Bits</th>
                      <th className="py-1.5 pr-3">Time</th>
                      <th className="py-1.5 pr-3">rel/s</th>
                      <th className="py-1.5 pr-3">Rel / 1LP</th>
                      <th className="py-1.5">Solver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAE5DA]">
                    {benchmarkHistory.slice(0, 6).map((run, idx) => (
                      <tr key={idx} className="text-[#1C1917]">
                        <td className={`py-1.5 pr-3 font-bold ${
                          run.mode === 'v4-fallback' ? 'text-[#1E3A8A]' : run.mode === 'cfrac' ? 'text-[#14532D]' : 'text-[#9A3412]'
                        }`}>
                          {run.mode === 'cfrac' ? 'CFRAC' : run.mode}
                        </td>
                        <td className="py-1.5 pr-3">{run.bits}b</td>
                        <td className="py-1.5 pr-3 font-bold">{run.durationMs} ms</td>
                        <td className="py-1.5 pr-3 text-[#14532D]">{run.relationsPerSec.toFixed(1)}</td>
                        <td className="py-1.5 pr-3">{run.relationsCollected} ({run.lpCollisions} 1LP)</td>
                        <td className="py-1.5 text-[#57534E]">{run.solveMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-[#57534E] leading-relaxed">
                {isRTL
                  ? "لا توجد قياسات مسجلة بعد — اختر تحدي 116 بت أو 140 بت أعلاه وابدأ التشغيل في وضع Vanilla ثم v4."
                  : "Aucune mesure enregistrée — comparez Vanilla vs v4 sur 116 ou 140 bits."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Parallel Web Workers Pool & GF(2) Matrix Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workers Pool */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#1C1917]">{t.workerPoolTitle}</h3>
              <p className="text-xs text-[#57534E]">{effectiveWorkerCount} {t.activeWorkersCount}</p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#F4F0E8] rounded-lg border border-[#E2DDD2]">
              <button
                onClick={() => onWorkerCountModeChange && onWorkerCountModeChange('auto')}
                className={`px-2 py-1 text-xs font-mono rounded ${
                  workerCountMode === 'auto' ? 'bg-white text-[#1E3A8A] font-bold border border-[#E2DDD2]' : 'text-[#57534E]'
                }`}
              >
                Auto ({effectiveWorkerCount})
              </button>
              {[1, 2, 4, 8].map((num) => (
                <button
                  key={num}
                  onClick={() => onWorkerCountModeChange && onWorkerCountModeChange(num)}
                  className={`px-2 py-1 text-xs font-mono rounded ${
                    Number(workerCountMode) === num ? 'bg-white text-[#1E3A8A] font-bold border border-[#E2DDD2]' : 'text-[#57534E]'
                  }`}
                >
                  {num}W
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" dir="ltr">
            {Array.from({ length: effectiveWorkerCount }).map((_, idx) => {
              const stat = workerThreadsStats?.find(s => s.id === idx);
              const ecmWorkersCount = bitLength > 220
                ? effectiveWorkerCount
                : (effectiveWorkerCount === 1 ? 0 : Math.max(1, Math.round(effectiveWorkerCount * 0.1)));
              const assignedRole = stat?.role || (idx < ecmWorkersCount ? 'ecm' : 'siqs');
              return (
                <div key={idx} className="bg-[#FBF9F5] p-2.5 rounded-lg border border-[#E2DDD2] space-y-1 font-mono-tabular">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#1C1917]">W#{idx + 1}</span>
                    <span className={assignedRole === 'ecm' ? 'text-[#14532D] font-bold' : 'text-[#1E3A8A] font-bold'}>
                      {assignedRole.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#57534E] truncate">{stat?.stage || 'Ready'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GF(2) Block Wiedemann Progress */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#1C1917]">{t.gf2MatrixTitle}</h3>
              <p className="text-xs text-[#57534E]">{t.gf2BatchRate}</p>
            </div>
            <div className="text-xs font-mono-tabular text-[#1E3A8A] font-bold" dir="ltr">
              {gf2Stats?.collected ?? 0} / {gf2Stats?.target ?? 123}
            </div>
          </div>

          <div className="h-2 bg-[#F4F0E8] rounded-full overflow-hidden border border-[#E2DDD2]">
            <div
              className="h-full bg-[#1E3A8A] transition-all duration-200"
              style={{
                width: `${Math.min(100, Math.round(((gf2Stats?.collected ?? 0) / Math.max(1, gf2Stats?.target ?? 123)) * 100))}%`
              }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-tabular" dir="ltr">
            <div className="bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">QR Base</div>
              <div className="font-bold text-[#1C1917]">{gf2Stats?.factorBaseSize ?? 0}</div>
            </div>
            <div className="bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">1LP Collisions</div>
              <div className="font-bold text-[#9A3412]">{gf2Stats?.lpCollisions ?? 0}</div>
            </div>
            <div className="bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">BW Passes</div>
              <div className="font-bold text-[#1E3A8A]">{gf2Stats?.matrixSolves ?? 0}</div>
            </div>
            <div className="bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">Krylov</div>
              <div className="font-bold text-[#14532D]">{gf2Stats?.krylovSteps || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Suyama Curves & M_dual Gram Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-2.5">
            <h3 className="text-sm font-bold text-[#1C1917]">{t.suyamaSectionTitle}</h3>
            <span className="text-xs font-mono-tabular text-[#14532D] font-bold">{totalCurves} curves</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular" dir="ltr">
            <div className="bg-[#FBF9F5] p-3 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">Active Curve</div>
              <div className="font-bold text-[#1E3A8A]">#{suyamaInfo?.curveIndex || totalCurves || 1}</div>
            </div>
            <div className="bg-[#FBF9F5] p-3 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">B1 Bound</div>
              <div className="font-bold text-[#14532D]">{(suyamaInfo?.b1Bound || 25000).toLocaleString()}</div>
            </div>
            <div className="bg-[#FBF9F5] p-3 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">B2 Bound</div>
              <div className="font-bold text-[#9A3412]">{(suyamaInfo?.b2Bound || 300000).toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-2.5">
            <h3 className="text-sm font-bold text-[#1C1917]">
              {isRTL ? "مصفوفة غرام الطيفية M_dual" : "Matrice de Gram M_dual"}
            </h3>
            {hoveredCell && (
              <span className="text-xs font-mono-tabular text-[#1E3A8A]" dir="ltr">
                M[{hoveredCell.i},{hoveredCell.j}]={hoveredCell.val.toFixed(3)}
              </span>
            )}
          </div>
          {mDualMatrix && mDualMatrix.length > 0 ? (
            <div className="overflow-x-auto" dir="ltr">
              <div
                className="grid gap-0.5 bg-[#FBF9F5] p-2 rounded border border-[#E2DDD2] w-fit mx-auto"
                style={{ gridTemplateColumns: `repeat(${mDualMatrix[0].length}, minmax(26px, 1fr))` }}
              >
                {mDualMatrix.map((row, i) =>
                  row.map((val, j) => {
                    const norm = Math.min(1, Math.max(0, Math.abs(val) / 5));
                    return (
                      <div
                        key={`${i}-${j}`}
                        onMouseEnter={() => setHoveredCell({ i, j, val })}
                        onMouseLeave={() => setHoveredCell(null)}
                        className="w-7 h-7 rounded-[2px] text-[9px] font-mono-tabular flex items-center justify-center border border-[#E2DDD2]/60 text-[#1C1917]"
                        style={{ backgroundColor: `rgba(30, 58, 138, ${0.06 + norm * 0.28})` }}
                      >
                        {val.toFixed(1)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#FBF9F5] p-3 rounded border border-[#E2DDD2] text-xs font-mono text-[#57534E] text-center">
              {isRunning ? "Computing M_dual..." : (isRTL ? "ستظهر مصفوفة M_dual فور تشغيل خيوط Chronos" : "Disponible au démarrage")}
            </div>
          )}
        </div>
      </div>
        </div>
      )}
    </div>
  );
};

export default Chronos196Dashboard;
