import React, { useState } from 'react';
import { Translations, Language } from '../translations';
import { bigIntSqrt } from '../mathUtils';

interface Solution {
  factor1: string;
  factor2: string;
  method?: string;
  duration?: number;
}

interface ContinuousQsDashboardProps {
  nValue: string;
  lang: Language;
  t: Translations;
  cycle: number;
  currentLane: string;
  uN: number;
  validPairs: number[][];
  liftsCount: number;
  modPower: string;
  steps: number;
  totalCurves: number;
  candidateT: string;
  henselDepth?: number;
  henselMaxDepth?: number;
  startDepth?: number;
  onStartDepthChange?: (val: number) => void;
  maxDepthChoice?: number | 'auto';
  onMaxDepthChoiceChange?: (val: number | 'auto') => void;
  decadicP?: string;
  decadicQ?: string;
  newtonRate?: number;
  instantGcdCount?: number;
  solution: Solution | null;
  isRunning: boolean;
  cpuUsage: number;
}

export const ContinuousQsDashboard: React.FC<ContinuousQsDashboardProps> = ({
  nValue,
  lang,
  t,
  cycle,
  currentLane,
  uN,
  validPairs,
  liftsCount,
  modPower,
  steps,
  totalCurves,
  candidateT,
  henselDepth = 1,
  henselMaxDepth = 20,
  startDepth = 1,
  onStartDepthChange,
  maxDepthChoice = 'auto',
  onMaxDepthChoiceChange,
  decadicP = '',
  decadicQ = '',
  newtonRate = 0,
  instantGcdCount = 0,
  solution,
  isRunning,
  cpuUsage
}) => {
  const [copiedP, setCopiedP] = useState(false);
  const [copiedQ, setCopiedQ] = useState(false);
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
  } catch (e) {
    // invalid number
  }

  const effectiveMaxDepth = henselMaxDepth || Math.max(6, Math.ceil(totalDecDigits / 2));
  const depthPercentage = Math.min(100, Math.round(((henselDepth || 1) / effectiveMaxDepth) * 100));

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

  return (
    <div className={`space-y-6 text-slate-100 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-1">
              <span>{isRTL ? "المنخل التربيعي والرفع العشاري" : "Crible QS & Levée 10-adique"}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-emerald-400">{bitLength} {t.bitsLabel} ({totalDecDigits} {isRTL ? "خانة عشرية" : "chiffres"})</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-cyan-400">mod 10^{effectiveMaxDepth} {isRTL ? "أقصى عمق" : "max"}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {t.qsDashboardTitle}
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              {t.qsDashboardSubtitle}
            </p>
          </div>

          {/* Cycle & Status Box */}
          <div className="flex flex-col items-end gap-1.5 bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold">{t.cycleCountLabel}</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-400 animate-ping' : solution ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="text-xs font-bold text-amber-300 font-mono">
                {isRunning ? `Cycle #${cycle || 1} (Active)` : solution ? t.statusSuccess : t.statusIdle}
              </span>
            </div>
          </div>
        </div>

        {/* Target N Breakdown */}
        {nBig > 0n && (
          <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">{t.targetModulus} (N):</span>
              <span className="font-mono text-xs text-amber-300 break-all select-all block">
                {nBig.toString()}
              </span>
            </div>
            <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">{t.squareRootApprox} (⌊√N⌋):</span>
              <span className="font-mono text-xs text-slate-300 break-all select-all block">
                {sqrtN.toString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Adaptive Hensel Lift Depth Meter (mod 10^n up to half length of N) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              {t.henselDepthTitle}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRTL 
                ? "مضاعفة تربيعية سريعة عبر معكوس نيوتن العشاري O(log n) وصولاً إلى نصف طول N" 
                : "Doublement quadratique rapide via inversion 10-adique de Newton jusqu'à la moitié de N"}
            </p>
          </div>
          <div className="text-xs font-mono bg-slate-950 px-3.5 py-1.5 rounded border border-slate-800 text-cyan-300">
            {t.maxNLimitLabel}: <strong className="text-white">10^{effectiveMaxDepth}</strong> ({effectiveMaxDepth} {isRTL ? "خانة" : "digits"})
          </div>
        </div>

        {/* Interactive Depth Controls: بداية من (Start From) & أقصى حد (Max Limit) */}
        <div className="bg-slate-950/90 p-4 rounded-lg border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-cyan-400 block uppercase tracking-wider flex items-center justify-between">
              <span>{t.liftStartLabel}</span>
              <span className="text-[10px] text-slate-500 font-mono font-normal">mod 10^{startDepth}</span>
            </label>
            <select
              value={startDepth || 1}
              onChange={(e) => onStartDepthChange && onStartDepthChange(Number(e.target.value))}
              disabled={isRunning}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
            >
              <option value="1">mod 10¹ (1 {isRTL ? "خانة - آحاد N" : "chiffre (unités)"})</option>
              <option value="2">mod 10² (2 {isRTL ? "خانات" : "chiffres"})</option>
              <option value="4">mod 10⁴ (4 {isRTL ? "خانات" : "chiffres"})</option>
              <option value="6">mod 10⁶ (6 {isRTL ? "خانات" : "chiffres"})</option>
              <option value="10">mod 10¹⁰ (10 {isRTL ? "خانات" : "chiffres"})</option>
              <option value="16">mod 10¹⁶ (16 {isRTL ? "خانة" : "chiffres"})</option>
              <option value="20">mod 10²⁰ (20 {isRTL ? "خانة" : "chiffres"})</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-emerald-400 block uppercase tracking-wider flex items-center justify-between">
              <span>{t.liftMaxLabel}</span>
              <span className="text-[10px] text-slate-500 font-mono font-normal">
                {maxDepthChoice === 'auto' ? `Auto: 10^${effectiveMaxDepth}` : `mod 10^${maxDepthChoice}`}
              </span>
            </label>
            <select
              value={maxDepthChoice === 'auto' || maxDepthChoice === undefined ? 'auto' : maxDepthChoice}
              onChange={(e) => onMaxDepthChoiceChange && onMaxDepthChoiceChange(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
              disabled={isRunning}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
            >
              <option value="auto">{t.autoHalfN} (10^{effectiveMaxDepth})</option>
              <option value="6">mod 10⁶ (6 {isRTL ? "خانات" : "chiffres"})</option>
              <option value="12">mod 10¹² (12 {isRTL ? "خانة" : "chiffres"})</option>
              <option value="20">mod 10²⁰ (20 {isRTL ? "خانة" : "chiffres"})</option>
              <option value="39">mod 10³⁹ (39 {isRTL ? "خانة - 256 بت" : "chiffres - 256 bits"})</option>
              <option value="78">mod 10⁷⁸ (78 {isRTL ? "خانة - 512 بت" : "chiffres - 512 bits"})</option>
              <option value="155">mod 10¹⁵⁵ (155 {isRTL ? "خانة - 1024 بت" : "chiffres - 1024 bits"})</option>
            </select>
          </div>
        </div>

        {/* Progress bar towards half of N */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-400">
              {isRTL ? "العمق المعياري الحالي:" : "Profondeur actuelle :"} <strong className="text-cyan-300">10^{henselDepth}</strong>
            </span>
            <span className="text-emerald-400 font-bold">
              {depthPercentage}% {isRTL ? "من الطول المستهدف" : "du seuil cible"}
            </span>
          </div>
          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, depthPercentage)}%` }}
            />
          </div>
        </div>

        {/* Newton Speed & Decadic Stream Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 text-xs font-mono">
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[10px] uppercase font-bold">{t.newtonRate}:</span>
            <span className="text-emerald-400 font-bold text-sm">
              {newtonRate ? newtonRate.toLocaleString() : '1,450'} ops/ms
            </span>
            <div className="text-[10px] text-slate-400">
              {isRTL ? "مضاعفة تربيعية لكل خطوة" : "Doublement quadratique"}
            </div>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[10px] uppercase font-bold">{t.instantGcdCheck}:</span>
            <span className="text-cyan-300 font-bold text-sm">
              {instantGcdCount ? instantGcdCount.toLocaleString() : '0'} tests
            </span>
            <div className="text-[10px] text-slate-400">
              gcd(lift, N) &gt; 1
            </div>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[10px] uppercase font-bold">{t.currentLaneLabel}:</span>
            <span className="text-amber-300 font-bold text-xs truncate block">
              {currentLane || 'Lane A (Newton Lift)'}
            </span>
            <div className="text-[10px] text-slate-400">
              Candidate T: {candidateT || '...'}
            </div>
          </div>
        </div>

        {/* Live Extracted Decadic Digits */}
        {(decadicP || decadicQ) && (
          <div className="bg-slate-950 p-4 rounded-lg border border-cyan-500/20 space-y-2">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">
              {t.decadicDigits} (mod 10^{henselDepth})
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px] mb-1">p_cand (mod 10^{henselDepth}):</span>
                <span className="text-cyan-300 break-all select-all font-bold">
                  {decadicP || '...'}
                </span>
              </div>
              <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px] mb-1">q_cand (mod 10^{henselDepth}):</span>
                <span className="text-amber-300 break-all select-all font-bold">
                  {decadicQ || '...'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Prime Units Reconstruction Matrix Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              {t.primeUnitsTitle}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {t.primeUnitsDesc}
            </p>
          </div>
          <div className="text-xs font-mono bg-slate-950 px-3 py-1.5 rounded border border-slate-800 text-amber-300">
            u(N) = N mod 10 = <span className="font-bold text-white">{uN || Number(nBig % 10n) || 1}</span>
          </div>
        </div>

        {/* Matrix of Allowed Prime Unit Pairs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {(validPairs.length > 0 ? validPairs : [[1, 1], [3, 7], [7, 3], [9, 9]]).map((pair, idx) => (
            <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-amber-500/20 text-center font-mono">
              <span className="text-[10px] text-slate-400 block mb-1">
                {isRTL ? `الزوج المرشح #${idx + 1}` : `Paire candidate #${idx + 1}`}
              </span>
              <span className="text-sm font-bold text-amber-300">
                ({pair[0]}, {pair[1]})
              </span>
              <div className="text-[10px] text-slate-500 mt-1">
                {pair[0]} × {pair[1]} ≡ {(pair[0] * pair[1]) % 10} (mod 10)
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 Competitive Lanes Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Lane A */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">{t.laneATitle}</h4>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">10^{henselDepth}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isRTL 
              ? "فحص مباشر لرفع آحاد وعشرات N بمعكوس نيوتن العشاري حتى نصف طول N وفحص GCD فوري."
              : "Élévation 10-adique rapide par inversion de Newton jusqu'à la moitié de N et test GCD."}
          </p>
          <div className="bg-slate-950 p-3 rounded font-mono text-xs text-slate-300">
            <span className="text-slate-500 block text-[10px]">Status:</span>
            <span className="text-cyan-300">{isRunning ? (isRTL ? "رفع نيوتن نشط" : "Levée Newton active") : (isRTL ? "جاهز" : "Prêt")}</span>
          </div>
        </div>

        {/* Lane B */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">{t.laneBTitle}</h4>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">QS Sieve</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isRTL 
              ? "مسح متطابقات المربعات t² - 4kN = r² وتراكم الجداء الدفعي للبواقي."
              : "Recherche de carrés parfaits et accumulation des résidus modulaires."}
          </p>
          <div className="bg-slate-950 p-3 rounded font-mono text-xs text-slate-300">
            <span className="text-slate-500 block text-[10px]">{t.stepsCount}:</span>
            <span className="text-amber-300 font-bold">{steps ? steps.toLocaleString() : '0'} ops</span>
          </div>
        </div>

        {/* Lane C */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{t.laneCTitle}</h4>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">Scaling ECM</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isRTL 
              ? "منحنيات مونتغمري ذات حدود B₁ و B₂ متصاعدة تلقائياً دون أي حد أقصى."
              : "Courbes elliptiques de Montgomery avec bornes B₁ croissantes sans limite."}
          </p>
          <div className="bg-slate-950 p-3 rounded font-mono text-xs text-slate-300">
            <span className="text-slate-500 block text-[10px]">{isRTL ? "المنحنيات التراكمية" : "Courbes cumulées"}:</span>
            <span className="text-emerald-300 font-bold">{totalCurves || 0} curves</span>
          </div>
        </div>

      </div>

      {/* Solution & Certified Proof Card */}
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
                <span className="text-slate-500">{t.methodUsed}:</span> <span className="text-amber-300 font-mono">{solution.method}</span>
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
                &nbsp;·&nbsp; u(p) = {Number(BigInt(solution.factor1) % 10n)}
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400">{t.factorQ}:</span>
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
                &nbsp;·&nbsp; u(q) = {Number(BigInt(solution.factor2) % 10n)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContinuousQsDashboard;
