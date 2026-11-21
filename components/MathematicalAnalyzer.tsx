import React, { useState } from 'react';
import { Translations, Language } from '../translations';
import { bigIntSqrt } from '../mathUtils';

interface SpectralTrace {
  multiplier: number;
  steps: number;
  currentT: string;
  modResidue: string;
  isCandidateSquare: boolean;
}

interface Solution {
  factor1: string;
  factor2: string;
  method?: string;
  duration?: number;
}

interface MathematicalAnalyzerProps {
  nValue: string;
  lang: Language;
  t: Translations;
  trace: SpectralTrace | null;
  solution: Solution | null;
  isRunning: boolean;
}

export const MathematicalAnalyzer: React.FC<MathematicalAnalyzerProps> = ({
  nValue,
  lang,
  t,
  trace,
  solution,
  isRunning
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

  return (
    <div className={`space-y-6 text-slate-100 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
              <span>{isRTL ? "التحليل الجبري المتقدم" : "Analyse Algébrique Avancée"}</span>
              <span aria-hidden="true">·</span>
              <span>{bitLength} {t.bitsLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">MMFR-Spectral Sieve</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {t.analyzerTitle}
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              {t.analyzerSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-3 rounded-lg border border-slate-800">
            <div className="text-xs">
              <div className="text-slate-400">{isRTL ? "حالة المحلل" : "État de l'analyseur"}</div>
              <div className={`font-semibold ${isRunning ? 'text-amber-400 animate-pulse' : solution ? 'text-emerald-400' : 'text-slate-300'}`}>
                {isRunning ? t.statusRunning : solution ? t.statusSuccess : t.statusIdle}
              </div>
            </div>
          </div>
        </div>

        {/* Current Modulus Breakdown */}
        {nBig > 0n && (
          <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">{t.targetModulus} (N):</span>
              <span className="font-mono text-xs text-cyan-300 break-all select-all block">
                {nBig.toString()}
              </span>
            </div>
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">{t.squareRootApprox}:</span>
              <span className="font-mono text-xs text-slate-300 break-all select-all block">
                {sqrtN.toString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mathematical Foundation & Formula Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></span>
          {t.mathFormulaTitle}
        </h3>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          {t.mathFormulaDesc}
        </p>

        {/* Formula Display Box */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 font-mono text-sm space-y-2 text-center overflow-x-auto">
          <div className="text-amber-300 font-semibold">
            t² - 4·k·N = r² &nbsp;⟺&nbsp; (t - r)(t + r) = 4·k·N
          </div>
          <div className="text-cyan-400 text-xs">
            p = pgcd(t - r, N) &nbsp;&nbsp;|&nbsp;&nbsp; q = pgcd(t + r, N) &nbsp;&nbsp;⟹&nbsp;&nbsp; p · q = N
          </div>
        </div>

        {/* Three Step Explanations */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/60">
            <div className="text-xs font-bold text-cyan-400 mb-1">{t.step1Title}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{t.step1Desc}</p>
          </div>
          <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/60">
            <div className="text-xs font-bold text-amber-400 mb-1">{t.step2Title}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{t.step2Desc}</p>
          </div>
          <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/60">
            <div className="text-xs font-bold text-emerald-400 mb-1">{t.step3Title}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{t.step3Desc}</p>
          </div>
        </div>
      </div>

      {/* Live Spectral Trace & Multiplier Resonance */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
          {t.spectralScanTitle}
        </h3>

        {trace ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">{t.activeMultiplier}</span>
              <span className="text-2xl font-bold font-mono text-cyan-400 mt-1 block">
                k = {trace.multiplier}
              </span>
            </div>
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">{t.stepsCount}</span>
              <span className="text-2xl font-bold font-mono text-white mt-1 block">
                {trace.steps.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">{isRTL ? "الباقي المعياري (mod 64)" : "Résidu modulaire (mod 64)"}</span>
              <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
                {trace.modResidue}
              </span>
            </div>
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">{isRTL ? "مرشح مربع كامل" : "Candidat carré"}</span>
              <span className={`text-xl font-bold font-mono mt-1 block ${trace.isCandidateSquare ? 'text-emerald-400' : 'text-slate-500'}`}>
                {trace.isCandidateSquare ? (isRTL ? "نعم ✓" : "Oui ✓") : (isRTL ? "لا ✗" : "Non ✗")}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500 py-4 text-center font-mono">
            {isRunning ? (isRTL ? "جاري تهيئة مصفوفة المضاعفات الطيفية..." : "Initialisation du spectre de résonance...") : (isRTL ? "اضغط على 'بدء التحليل الرياضي' لمشاهدة مسار الحل المباشر" : "Cliquez sur 'Lancer la Factorisation' pour voir le traçage en direct")}
          </div>
        )}
      </div>

      {/* Final Verification & Certified Proof */}
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
            {/* Factor P */}
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

            {/* Factor Q */}
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

export default MathematicalAnalyzer;
