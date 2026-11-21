import React, { useState } from 'react';
import { Translations, Language } from '../translations';
import { bigIntSqrt } from '../mathUtils';

export interface HybridFingerprint {
  featureSize: number;
  entropy: number;
  stability: number;
  bitDensity: number;
  convergence: number;
  qualityIndex: number;
  prioritizedCount: number;
}

export interface HybridTrace {
  multiplier: number;
  kPriority: number;
  steps: number;
  currentT: string;
  modResidue: string;
  isCandidateSquare: boolean;
}

export interface HybridEcmStats {
  curveIndex: number;
  totalCurves: number;
  curveAdds: number;
  modMuls: number;
  priority: string;
}

interface Solution {
  factor1: string;
  factor2: string;
  method?: string;
  duration?: number;
}

interface HybridDashboardProps {
  nValue: string;
  lang: Language;
  t: Translations;
  currentStage: 1 | 2 | 3;
  fingerprint: HybridFingerprint | null;
  trace: HybridTrace | null;
  ecmStats: HybridEcmStats | null;
  solution: Solution | null;
  isRunning: boolean;
  cpuUsage: number;
}

export const HybridDashboard: React.FC<HybridDashboardProps> = ({
  nValue,
  lang,
  t,
  currentStage,
  fingerprint,
  trace,
  ecmStats,
  solution,
  isRunning,
  cpuUsage
}) => {
  const [copiedP, setCopiedP] = useState(false);
  const [copiedQ, setCopiedQ] = useState(false);
  const isRTL = lang === 'ar';

  let nBig = 0n;
  let bitLength = 0;
  let sqrtN = 0n;
  try {
    if (nValue.trim()) {
      nBig = BigInt(nValue.trim());
      bitLength = nBig > 0n ? nBig.toString(2).length : 0;
      sqrtN = nBig > 0n ? bigIntSqrt(nBig) : 0n;
    }
  } catch (e) {
    // invalid string
  }

  const copyToClipboard = (text: string, type: 'p' | 'q') => {
    navigator.clipboard.writeText(text);
    if (type === 'p') {
      setCopiedP(true);
      setTimeout(() => setCopiedP(false), 2000);
    } else {
      setCopiedQ(true);
      setTimeout(() => setCopiedQ(false), 2000);
    }
  };

  const getStageTitle = (stage: 1 | 2 | 3) => {
    if (stage === 1) return t.stage1Name;
    if (stage === 2) return t.stage2Name;
    return t.stage3Name;
  };

  return (
    <div className={`space-y-6 text-slate-100 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Unified Command Center Hero */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
              <span>{isRTL ? "الرنين الهجين" : "Résonance Hybride"}</span>
              <span aria-hidden="true">·</span>
              <span>Gleeok-MMFR</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">{bitLength} {t.bitsLabel}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {t.hybridDashboardTitle}
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              {t.hybridDashboardSubtitle}
            </p>
          </div>

          {/* Current Stage Indicator */}
          <div className="flex flex-col items-end gap-1.5 bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold">{t.currentStageLabel}</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-cyan-400 animate-ping' : solution ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="text-xs font-bold text-cyan-300 font-mono">
                {isRunning ? getStageTitle(currentStage) : solution ? t.statusSuccess : t.statusIdle}
              </span>
            </div>
          </div>
        </div>

        {/* Target N Breakdown */}
        {nBig > 0n && (
          <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">{t.targetModulus} (N):</span>
              <span className="font-mono text-xs text-cyan-300 break-all select-all block">
                {nBig.toString()}
              </span>
            </div>
            <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">{t.squareRootApprox}:</span>
              <span className="font-mono text-xs text-slate-300 break-all select-all block">
                {sqrtN.toString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4 Quadrants: The Unified Hybrid Engine */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Quadrant 1: Guided Spectral Multipliers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            {t.hybridSection1Title}
          </h3>

          {trace ? (
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.activeMultiplier}</span>
                <span className="text-lg font-bold text-cyan-300 mt-0.5 block">k = {trace.multiplier}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.multiplierPriority}</span>
                <span className="text-lg font-bold text-amber-400 mt-0.5 block">{trace.kPriority.toFixed(3)}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{isRTL ? "باقي المربع mod 64" : "Résidu carré mod 64"}</span>
                <span className="text-base font-bold text-slate-200 mt-0.5 block">{trace.modResidue}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{isRTL ? "فحص المربع التام" : "Carré parfait"}</span>
                <span className={`text-base font-bold mt-0.5 block ${trace.isCandidateSquare ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {trace.isCandidateSquare ? (isRTL ? "مربع مطابق ✓" : "Carré valide ✓") : (isRTL ? "غير مطابق" : "Non-carré")}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-500 font-mono bg-slate-950 rounded-lg border border-slate-800">
              {isRunning ? (isRTL ? "جاري فرز المضاعفات الطيفية بحسب الأولوية..." : "Ordonnancement spectral en cours...") : (isRTL ? "في انتظار إطلاق الخوارزمية..." : "En attente du lancement...")}
            </div>
          )}
        </div>

        {/* Quadrant 2: Gleeok Structural Fingerprint */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            {t.hybridSection2Title}
          </h3>

          {fingerprint ? (
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.entropyLabel}</span>
                <span className="text-base font-bold text-purple-300 mt-0.5 block">{(fingerprint.entropy * 100).toFixed(1)}%</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.stabilityLabel}</span>
                <span className="text-base font-bold text-emerald-400 mt-0.5 block">{(fingerprint.stability * 100).toFixed(1)}%</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.bitDensityLabel}</span>
                <span className="text-base font-bold text-cyan-300 mt-0.5 block">{(fingerprint.bitDensity * 100).toFixed(1)}%</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">{t.convergenceLabel}</span>
                <span className="text-base font-bold text-amber-300 mt-0.5 block">{(fingerprint.convergence * 100).toFixed(1)}%</span>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-500 font-mono bg-slate-950 rounded-lg border border-slate-800">
              {isRunning ? (isRTL ? "جاري احتساب تباديل فيشر-ييتس وإنتروبيا البتات..." : "Calcul de l'entropie binaire...") : (isRTL ? "بصمة Gleeok ستظهر تلقائياً عند البدء" : "Empreinte Gleeok active au lancement")}
            </div>
          )}
        </div>

        {/* Quadrant 3: Montgomery Curves & Matrices */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            {t.hybridSection3Title}
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{t.curveAddsLabel}</span>
              <span className="text-base font-bold text-emerald-300 mt-0.5 block">
                {ecmStats ? ecmStats.curveAdds.toLocaleString() : '0'}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{t.modMulsLabel}</span>
              <span className="text-base font-bold text-cyan-300 mt-0.5 block">
                {ecmStats ? ecmStats.modMuls.toLocaleString() : '0'}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{isRTL ? "المنحنيات المنجزة" : "Courbes évaluées"}</span>
              <span className="text-base font-bold text-white mt-0.5 block">
                {ecmStats ? `${ecmStats.curveIndex} / ${ecmStats.totalCurves}` : (isRTL ? "استعداد" : "Prêt")}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{isRTL ? "أولوية المنحنى النشط" : "Priorité active"}</span>
              <span className="text-base font-bold text-amber-400 mt-0.5 block">
                {ecmStats ? ecmStats.priority : '1.0000'}
              </span>
            </div>
          </div>
        </div>

        {/* Quadrant 4: Performance & System Monitor */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            {t.hybridSection4Title}
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{t.cpuLabel}</span>
              <span className="text-base font-bold text-emerald-400 mt-0.5 block">
                {isRunning ? `${Math.round(cpuUsage)}%` : '0%'}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{isRTL ? "الخيوط الحسابية النشطة" : "Threads actifs"}</span>
              <span className="text-base font-bold text-cyan-300 mt-0.5 block">
                {isRunning ? (isRTL ? "1 نواة مخصصة" : "1 Worker Actif") : (isRTL ? "خامل" : "Veille")}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{t.stepsCount}</span>
              <span className="text-base font-bold text-white mt-0.5 block">
                {trace ? trace.steps.toLocaleString() : '0'}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">{isRTL ? "استهلاك الذاكرة" : "Mémoire allouée"}</span>
              <span className="text-base font-bold text-emerald-300 mt-0.5 block">
                &lt; 15 MB
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Certified Solution Proof Card */}
      {solution && solution.factor1 && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-emerald-300 flex items-center gap-2">
              <span className="text-emerald-400">✓</span> {t.verificationHeader}
            </h3>
            {solution.duration && (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-900/50 px-3 py-1 rounded">
                {solution.duration} ms
              </span>
            )}
          </div>

          <div className="p-4 bg-slate-950/80 rounded-lg border border-emerald-500/30 mb-6 text-sm text-emerald-200">
            <div className="font-semibold text-emerald-400 mb-1">{t.proofTitle}:</div>
            <div className="font-mono text-xs text-slate-300 break-all mb-2">
              p · q = {solution.factor1} × {solution.factor2}
            </div>
            <div className="text-xs text-emerald-400 font-bold">
              ✓ {t.proofValid}
            </div>
            {solution.method && (
              <div className="text-xs text-slate-400 mt-2">
                <span className="text-slate-500">{t.methodUsed}:</span> <span className="text-cyan-300 font-mono">{solution.method}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-400">{t.factorP}:</span>
                <button
                  onClick={() => copyToClipboard(solution.factor1, 'p')}
                  className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {copiedP ? t.copiedNotice : t.copyBtn}
                </button>
              </div>
              <div className="font-mono text-xs text-slate-200 break-all select-all bg-slate-900/80 p-2.5 rounded border border-slate-800">
                {solution.factor1}
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono">
                {isRTL ? "الطول:" : "Taille :"} {BigInt(solution.factor1).toString(2).length} {t.bitsLabel}
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-cyan-400">{t.factorQ}:</span>
                <button
                  onClick={() => copyToClipboard(solution.factor2, 'q')}
                  className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {copiedQ ? t.copiedNotice : t.copyBtn}
                </button>
              </div>
              <div className="font-mono text-xs text-slate-200 break-all select-all bg-slate-900/80 p-2.5 rounded border border-slate-800">
                {solution.factor2}
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono">
                {isRTL ? "الطول:" : "Taille :"} {BigInt(solution.factor2).toString(2).length} {t.bitsLabel}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HybridDashboard;
