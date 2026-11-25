import React, { useMemo, useState } from 'react';
import { Language } from '../translations';
import { Gf2PoolStats, WorkerThreadStat } from './Chronos196Dashboard';

export type Gf2SolverStage =
  | 'idle'
  | 'materializing_bfs'
  | 'markowitz_sge'
  | 'linear_algebra'
  | 'sqrt_congruence'
  | 'solved';

export interface Gf2StageTimingsState {
  bfsBuildMs: number;
  markowitzMs: number;
  linearSolveMs: number;
  sqrtMs: number;
  builtCycles: number;
}

export interface Gf2MonitorState {
  solverStage: Gf2SolverStage;
  offThreadActive: boolean;
  sieversPausedForGf2: boolean;
  manualPaused: boolean;
  directFullCount: number;
  partialCount: number;
  pendingCyclesCount: number;
  materializedCyclesCount: number;
  totalRows: number;
  totalCols: number;
  lastTimings: Gf2StageTimingsState | null;
  solveCount: number;
  lastSolveError: string | null;
}

interface WorkerMatrixMonitorProps {
  lang: Language;
  isRunning: boolean;
  effectiveWorkerCount: number;
  workerThreadsStats: WorkerThreadStat[];
  gf2Stats: Gf2PoolStats;
  gf2Monitor: Gf2MonitorState;
  onTogglePauseSievers: () => void;
}

type MonitorFilterTab = 'all' | 'workers' | 'gf2';

const STAGE_STEPS: Array<{ key: Gf2SolverStage; labelAr: string; labelFr: string }> = [
  { key: 'idle', labelAr: 'جمع العلاقات', labelFr: 'Collecte' },
  { key: 'materializing_bfs', labelAr: 'غابة BFS للدورات', labelFr: 'Forêt BFS 2LP' },
  { key: 'markowitz_sge', labelAr: 'اختزال Markowitz', labelFr: 'SGE Markowitz' },
  { key: 'linear_algebra', labelAr: 'الحذف المنقول / Krylov', labelFr: 'GF(2) Transposé / Krylov' },
  { key: 'sqrt_congruence', labelAr: 'اختبار الجذر √', labelFr: 'Congruence √' },
  { key: 'solved', labelAr: 'حُسمت المصفوفة', labelFr: 'Résolue' }
];

const getStageOrder = (stage: Gf2SolverStage): number => {
  const idx = STAGE_STEPS.findIndex(s => s.key === stage);
  return idx >= 0 ? idx : 0;
};

const formatRoleLabel = (role?: WorkerThreadStat['role']): string => {
  if (role === 'hgs') return 'HGS 128-Bias + SQUFOF';
  if (role === 'siqs') return 'SIQS v4 Fast-2LP';
  if (role === 'cfrac') return 'CFRAC √(kN)';
  if (role === 'ecm') return 'REDC ECM / p±1';
  return 'Worker';
};

const formatEngineKind = (kind?: string): string | null => {
  if (kind === 'wasm-simd') return 'WASM-SIMD';
  if (kind === 'wasm-i64') return 'WASM-i64';
  if (kind === 'js-fallback') return 'JS';
  return null;
};

export const WorkerMatrixMonitor: React.FC<WorkerMatrixMonitorProps> = ({
  lang,
  isRunning,
  effectiveWorkerCount,
  workerThreadsStats,
  gf2Stats,
  gf2Monitor,
  onTogglePauseSievers
}) => {
  const [filterTab, setFilterTab] = useState<MonitorFilterTab>('all');
  const isAr = lang === 'ar';

  const aggregateStats = useMemo(() => {
    let totalPolysPerSec = 0;
    let totalCands = 0;
    let totalSqufof = 0;
    let pausedCount = 0;
    let sievingCount = 0;
    let totalWorkerRels = 0;
    let batchLatencySum = 0;
    let batchLatencySamples = 0;

    for (let i = 0; i < workerThreadsStats.length; i++) {
      const w = workerThreadsStats[i];
      totalPolysPerSec += w.polysPerSec || 0;
      totalCands += w.candsTested || 0;
      totalSqufof += w.squfofSplits || 0;
      totalWorkerRels += w.relations || 0;
      if (w.paused) pausedCount++;
      else if (w.active) sievingCount++;
      if (typeof w.lastBatchMs === 'number' && w.lastBatchMs > 0) {
        batchLatencySum += w.lastBatchMs;
        batchLatencySamples++;
      }
    }

    const avgBatchMs = batchLatencySamples > 0 ? Math.round(batchLatencySum / batchLatencySamples) : 0;
    return {
      totalPolysPerSec,
      totalCands,
      totalSqufof,
      pausedCount,
      sievingCount,
      totalWorkerRels,
      avgBatchMs
    };
  }, [workerThreadsStats]);

  const activeStageOrder = getStageOrder(gf2Monitor.solverStage);
  const timings = gf2Monitor.lastTimings;
  const totalSolveMs = timings
    ? timings.bfsBuildMs + timings.markowitzMs + timings.linearSolveMs + timings.sqrtMs
    : 0;

  const isAnyPaused = gf2Monitor.manualPaused || gf2Monitor.sieversPausedForGf2;

  const globalStatusText = useMemo(() => {
    if (gf2Monitor.solverStage === 'solved') {
      return { glyph: '✓', text: isAr ? 'مكتمل · حُسمت المصفوفة' : 'Résolu · Matrice résolue', tone: 'text-[#14532D]' };
    }
    if (gf2Monitor.offThreadActive) {
      return { glyph: '⏸', text: isAr ? 'الخيوط متوقفة لحل GF(2) في Worker مستقل' : 'Cribles en pause · Solveur GF(2) actif', tone: 'text-[#9A3412]' };
    }
    if (gf2Monitor.manualPaused && isRunning) {
      return { glyph: '⏸', text: isAr ? 'إيقاف مؤقت يدوي للخيوط' : 'Pause manuelle des threads', tone: 'text-[#9A3412]' };
    }
    if (isRunning) {
      return { glyph: '●', text: isAr ? `غربلة نشطة (${effectiveWorkerCount} أنوية)` : `Criblage actif (${effectiveWorkerCount} cœurs)`, tone: 'text-[#14532D]' };
    }
    return { glyph: '○', text: isAr ? 'جاهز للمراقبة' : 'En attente', tone: 'text-[#57534E]' };
  }, [gf2Monitor, isRunning, effectiveWorkerCount, isAr]);

  const ratioPct = Math.min(
    100,
    Math.round((gf2Stats.collected / Math.max(1, gf2Stats.target)) * 100)
  );

  return (
    <section
      aria-label={isAr ? 'مراقب أداء الخيوط وحل مصفوفة GF(2)' : 'Moniteur Threads et Solveur GF(2)'}
      className="bg-white border border-[#E2DDD2] rounded-xl p-5 sm:p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
            <span className={`font-semibold ${globalStatusText.tone}`}>
              {globalStatusText.glyph} {globalStatusText.text}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {isAr ? `الأنوية: ${effectiveWorkerCount}` : `Threads: ${effectiveWorkerCount}`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {isAr ? `محاولات الحل: ${gf2Monitor.solveCount}` : `Résolutions: ${gf2Monitor.solveCount}`}
            </span>
          </div>
          <h2 className="text-lg font-bold font-serif-academic text-[#1C1917] tracking-tight">
            {isAr
              ? 'مراقب أداء الخيوط وحل مصفوفة GF(2) المستقل'
              : 'Moniteur de performance des threads et solveur GF(2) dédié'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented View Filter */}
          <div
            role="tablist"
            aria-label={isAr ? 'تصفية لوحة المراقبة' : 'Filtrer le moniteur'}
            className="flex items-center gap-1 p-1 bg-[#F4F0E8] border border-[#E2DDD2] rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === 'all'}
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filterTab === 'all'
                  ? 'bg-white text-[#1E3A8A] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              {isAr ? 'الكل' : 'Tout'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === 'workers'}
              onClick={() => setFilterTab('workers')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filterTab === 'workers'
                  ? 'bg-white text-[#1E3A8A] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              {isAr ? 'أداء الخيوط' : 'Threads'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === 'gf2'}
              onClick={() => setFilterTab('gf2')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filterTab === 'gf2'
                  ? 'bg-white text-[#1E3A8A] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              {isAr ? 'حلّال GF(2)' : 'Solveur GF(2)'}
            </button>
          </div>

          <button
            type="button"
            onClick={onTogglePauseSievers}
            disabled={!isRunning || gf2Monitor.offThreadActive}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
              gf2Monitor.manualPaused
                ? 'bg-[#14532D] border-[#14532D] text-white hover:bg-[#166534]'
                : 'bg-[#FBF9F5] border-[#E2DDD2] text-[#1C1917] hover:border-[#1E3A8A] hover:text-[#1E3A8A]'
            }`}
          >
            {gf2Monitor.manualPaused
              ? (isAr ? 'استئناف الغربلة' : 'Reprendre le criblage')
              : (isAr ? 'إيقاف الغربلة مؤقتاً' : 'Mettre en pause')}
          </button>
        </div>
      </div>

      {/* Top KPI Strip (Hairline grid, no cards inside cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#EAE5DA]">
        <div className="space-y-1">
          <div className="text-xs text-[#57534E]">
            {isAr ? 'معدل العلاقات المكتملة والدورات' : 'Débit relations complètes'}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-mono font-bold tabular-nums text-[#14532D]">
              {(gf2Stats.relationsPerSec ?? 0).toFixed(2)}
            </span>
            <span className="text-xs font-mono text-[#57534E]">
              rel/s
            </span>
            <span aria-hidden="true" className="text-xs text-[#A89F8D]">·</span>
            <span className="text-sm font-mono font-semibold tabular-nums text-[#1C1917]">
              {aggregateStats.totalPolysPerSec > 0
                ? `${aggregateStats.totalPolysPerSec.toFixed(1)} poly/s`
                : `${(gf2Stats.polysProcessed ? gf2Stats.polysProcessed.toLocaleString() : '0')} poly`}
            </span>
          </div>
          <div className="text-xs font-mono tabular-nums text-[#57534E]">
            {isAr ? 'مكتملة + مدمجة فقط' : 'Complètes + cycles'}
            {aggregateStats.avgBatchMs > 0
              ? ` · ${aggregateStats.avgBatchMs} ms`
              : (isAr ? ` · نشط ${aggregateStats.sievingCount}` : ` · Actifs ${aggregateStats.sievingCount}`)}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-[#57534E]">
            {isAr ? 'مرشحو 128-bias وانقسام SQUFOF' : 'Candidats 128-bias & SQUFOF 2LP'}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-mono font-bold tabular-nums text-[#1C1917]">
              {aggregateStats.totalSqufof.toLocaleString()}
            </span>
            <span className="text-xs font-mono text-[#57534E]">2LP splits</span>
          </div>
          <div className="text-xs font-mono tabular-nums text-[#57534E]">
            {isAr
              ? `مرشحون فُحصوا: ${aggregateStats.totalCands.toLocaleString()}`
              : `Candidats testés: ${aggregateStats.totalCands.toLocaleString()}`}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-[#57534E]">
            {isAr ? 'حوض العلاقات والدورات الكسولة' : 'Pool & Cycles Union-Find'}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-mono font-bold tabular-nums text-[#1E3A8A]">
              {gf2Stats.collected.toLocaleString()}
            </span>
            <span className="text-xs font-mono tabular-nums text-[#57534E]">
              / {gf2Stats.target.toLocaleString()} ({ratioPct}%)
            </span>
          </div>
          <div className="text-xs font-mono tabular-nums text-[#57534E]">
            {isAr
              ? `مباشرة ${gf2Monitor.directFullCount} · دورات معلّقة ${gf2Monitor.pendingCyclesCount}`
              : `Directes ${gf2Monitor.directFullCount} · Cycles en attente ${gf2Monitor.pendingCyclesCount}`}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-[#57534E]">
            {isAr ? 'أداء حلّال GF(2) المستقل' : 'Solveur GF(2) hors-thread'}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-mono font-bold tabular-nums text-[#14532D]">
              {timings ? totalSolveMs.toFixed(1) : '0.0'}
            </span>
            <span className="text-xs font-mono text-[#57534E]">ms</span>
          </div>
          <div className="text-xs font-mono tabular-nums text-[#57534E]">
            {gf2Stats.coreShape
              ? `${gf2Stats.coreShape} · ${gf2Stats.solverMethod || 'markowitz-core'}`
              : (isAr ? 'بانتظار اكتمال الحصة' : 'En attente du quota')}
          </div>
        </div>
      </div>

      {/* Section 1: Per-Worker Siever Telemetry Table */}
      {(filterTab === 'all' || filterTab === 'workers') && (
        <div className="pt-4 border-t border-[#EAE5DA] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#1C1917]">
              {isAr ? 'حالة خيوط الغربلة المتوازية' : 'État des threads de criblage parallèles'}
            </h3>
            <span className="text-xs font-mono tabular-nums text-[#57534E]">
              {isAr
                ? `إجمالي علاقات الخيوط: ${aggregateStats.totalWorkerRels.toLocaleString()}`
                : `Total relations threads: ${aggregateStats.totalWorkerRels.toLocaleString()}`}
            </span>
          </div>

          {workerThreadsStats.length === 0 ? (
            <div className="bg-[#FBF9F5] border border-[#EAE5DA] rounded-lg px-4 py-5 text-xs text-[#57534E]">
              {isAr
                ? 'لا توجد خيوط نشطة حالياً. أطلق تفكيك HGS أو السباق الموحد لبدء قياس أداء كل نواة.'
                : 'Aucun worker actif. Lancez HGS ou Chronos pour mesurer la télémétrie par cœur.'}
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#EAE5DA] rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F4F0E8] text-[#57534E] border-b border-[#EAE5DA]">
                    <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                      {isAr ? 'الخيط' : 'Thread'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                      {isAr ? 'الدور' : 'Rôle'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                      {isAr ? 'الحالة' : 'Statut'}
                    </th>
                    <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                      {isAr ? 'كثيرات الحدود / المنحنيات' : 'Polys / Courbes'}
                    </th>
                    <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                      {isAr ? 'السرعة' : 'Vitesse'}
                    </th>
                    <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                      {isAr ? 'مرشحون · 2LP' : 'Cand. · 2LP'}
                    </th>
                    <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                      {isAr ? 'علاقات' : 'Relations'}
                    </th>
                    <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                      {isAr ? 'آخر دفعة' : 'Lot'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE5DA]">
                  {workerThreadsStats.map(w => {
                    const statusBadge = w.paused
                      ? {
                          glyph: '⏸',
                          label: w.pauseReason === 'gf2'
                            ? (isAr ? 'متوقف · حل GF(2)' : 'Pause · GF(2)')
                            : (isAr ? 'متوقف مؤقتاً' : 'En pause'),
                          cls: 'text-[#9A3412]'
                        }
                      : w.active
                        ? {
                            glyph: '●',
                            label: isAr ? 'يعمل' : 'Actif',
                            cls: 'text-[#14532D]'
                          }
                        : {
                            glyph: '○',
                            label: w.stage || (isAr ? 'متوقف' : 'Arrêté'),
                            cls: 'text-[#57534E]'
                          };

                    const engineLabel = formatEngineKind(w.engineKind);

                    return (
                      <tr key={w.id} className="hover:bg-[#FBF9F5] transition-colors">
                        <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#1C1917] whitespace-nowrap">
                          W#{w.id + 1}
                        </td>
                        <td className="py-2.5 px-3 text-[#1C1917] whitespace-nowrap">
                          <span>{formatRoleLabel(w.role)}</span>
                          {engineLabel && (
                            <>
                              <span aria-hidden="true" className="mx-1.5 text-[#A89F8D]">·</span>
                              <span className="font-mono text-[11px] font-semibold text-[#1E3A8A]">
                                {engineLabel}
                              </span>
                            </>
                          )}
                        </td>
                        <td className={`py-2.5 px-3 font-semibold whitespace-nowrap ${statusBadge.cls}`}>
                          {statusBadge.glyph} {statusBadge.label}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-[#1C1917] whitespace-nowrap">
                          {w.role === 'ecm'
                            ? `${w.curves.toLocaleString()} curves`
                            : (w.polys || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-[#1E3A8A] whitespace-nowrap">
                          {typeof w.polysPerSec === 'number' && w.polysPerSec > 0
                            ? `${w.polysPerSec.toFixed(1)} /s`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-[#57534E] whitespace-nowrap">
                          {(w.candsTested || 0).toLocaleString()} · {(w.squfofSplits || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums font-semibold text-[#14532D] whitespace-nowrap">
                          {(w.relations || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-[#57534E] whitespace-nowrap">
                          {typeof w.lastBatchMs === 'number' && w.lastBatchMs > 0
                            ? `${w.lastBatchMs} ms`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section 2: Dedicated Off-Thread GF(2) Matrix Pipeline & Timing Breakdown */}
      {(filterTab === 'all' || filterTab === 'gf2') && (
        <div className="pt-4 border-t border-[#EAE5DA] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#1C1917]">
              {isAr
                ? 'خط أنابيب حلّال GF(2) المستقل وتوقيت المراحل'
                : 'Pipeline du solveur GF(2) hors-thread et chronométrage'}
            </h3>
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#57534E]">
              <span>
                {isAr
                  ? `الجزئية (1LP/2LP): ${gf2Stats.partialCount ?? 0}`
                  : `Partielles: ${gf2Stats.partialCount ?? 0}`}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {isAr
                  ? `دورات مبنية BFS: ${gf2Monitor.materializedCyclesCount}`
                  : `Cycles BFS: ${gf2Monitor.materializedCyclesCount}`}
              </span>
              {isAnyPaused && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#9A3412] font-semibold">
                    {isAr ? 'الغربلة متوقفة' : 'Cribles en pause'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Stage Progress Track */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {STAGE_STEPS.map((st, idx) => {
              const isCurrent = gf2Monitor.solverStage === st.key;
              const isDone = activeStageOrder > idx || gf2Monitor.solverStage === 'solved';
              return (
                <div
                  key={st.key}
                  className={`px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                    isCurrent
                      ? 'bg-[#F4F0E8] border-[#1E3A8A] text-[#1E3A8A] font-bold'
                      : isDone
                        ? 'bg-[#FBF9F5] border-[#BBF7D0] text-[#14532D]'
                        : 'bg-[#FBF9F5] border-[#EAE5DA] text-[#57534E]'
                  }`}
                >
                  <div className="font-mono tabular-nums text-[11px] mb-0.5">
                    {isDone && !isCurrent ? '✓' : isCurrent ? '▶' : '○'} 0{idx + 1}
                  </div>
                  <div className="truncate">{isAr ? st.labelAr : st.labelFr}</div>
                </div>
              );
            })}
          </div>

          {/* Stage Timings Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#FBF9F5] border border-[#EAE5DA] rounded-lg p-3.5 text-xs">
            <div className="space-y-0.5">
              <div className="text-[#57534E]">
                {isAr ? 'بناء دورات BFS' : 'Forêt BFS 2LP'}
              </div>
              <div className="font-mono tabular-nums font-bold text-[#1C1917]">
                {timings ? `${timings.bfsBuildMs.toFixed(2)} ms` : '—'}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-[#57534E]">
                {timings ? `${timings.builtCycles} cycles` : (isAr ? 'في وقت الحل فقط' : 'À la résolution')}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[#57534E]">
                {isAr ? 'اختزال Markowitz' : 'SGE Markowitz'}
              </div>
              <div className="font-mono tabular-nums font-bold text-[#1C1917]">
                {timings ? `${timings.markowitzMs.toFixed(2)} ms` : '—'}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-[#57534E]">
                {gf2Stats.coreShape || '—'}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[#57534E]">
                {isAr ? 'الجبر الخطي GF(2)' : 'Algèbre linéaire'}
              </div>
              <div className="font-mono tabular-nums font-bold text-[#1E3A8A]">
                {timings ? `${timings.linearSolveMs.toFixed(2)} ms` : '—'}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-[#57534E]">
                {gf2Stats.krylovSteps ? `${gf2Stats.krylovSteps} deps/steps` : '—'}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[#57534E]">
                {isAr ? 'الجذر التربيعي √' : 'Congruence √'}
              </div>
              <div className="font-mono tabular-nums font-bold text-[#14532D]">
                {timings ? `${timings.sqrtMs.toFixed(2)} ms` : '—'}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-[#57534E]">
                {gf2Monitor.totalRows > 0
                  ? `${gf2Monitor.totalRows}×${gf2Monitor.totalCols}`
                  : '—'}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[#57534E]">
                {isAr ? 'إجمالي زمن الحل' : 'Total solveur'}
              </div>
              <div className="font-mono tabular-nums font-bold text-[#1C1917]">
                {timings ? `${totalSolveMs.toFixed(2)} ms` : '—'}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-[#57534E]">
                {gf2Stats.solverMethod || (isAr ? 'مستقل عن الواجهة' : 'Hors-thread')}
              </div>
            </div>
          </div>

          {gf2Monitor.lastSolveError && (
            <div className="text-xs font-mono text-[#9A3412] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3.5 py-2.5">
              {gf2Monitor.lastSolveError}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default WorkerMatrixMonitor;
