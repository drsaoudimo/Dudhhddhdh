import React, { useMemo, useState } from 'react';
import { Translations, Language } from '../translations';
import { bigIntSqrt } from '../mathUtils';
import { surdFromSqrtN } from '../lib/highPrecisionEngine';
import { computeUniversalExponentReport } from '../lib/universalExponentEngine';

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
  const [copiedLambda, setCopiedLambda] = useState(false);
  const [copiedPhi, setCopiedPhi] = useState(false);
  const [copiedSqrt500, setCopiedSqrt500] = useState(false);
  const [showFull500, setShowFull500] = useState(false);
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

  const sqrtSurd = useMemo(() => (nBig > 0n ? surdFromSqrtN(nBig) : null), [nValue]);

  const expReport = useMemo(() => {
    if (!nValue.trim()) return null;
    try {
      const pHint = solution ? solution.factor1 : undefined;
      const qHint = solution ? solution.factor2 : undefined;
      return computeUniversalExponentReport(nValue.trim(), 'standard', 0.258, pHint, qHint);
    } catch {
      return null;
    }
  }, [nValue, solution?.factor1, solution?.factor2]);

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
    <div className={`space-y-6 text-[#1C1917] ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#1E3A8A] mb-1">
              <span>{isRTL ? "التحليل الجبري المتقدم" : "Analyse Algébrique Avancée"}</span>
              <span aria-hidden="true" className="text-[#A89F8D]">·</span>
              <span>{bitLength} {t.bitsLabel}</span>
              <span aria-hidden="true" className="text-[#A89F8D]">·</span>
              <span className="text-[#14532D] font-semibold">MMFR-Spectral Sieve · 500d Surd</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-serif-academic tracking-tight text-[#1C1917]">
              {t.analyzerTitle}
            </h2>
            <p className="text-sm text-[#57534E] mt-1 max-w-2xl">
              {t.analyzerSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#FBF9F5] px-4 py-3 rounded-lg border border-[#E2DDD2]">
            <div className="text-xs">
              <div className="text-[#57534E]">{isRTL ? "حالة المحلل" : "État de l'analyseur"}</div>
              <div className={`font-semibold ${isRunning ? 'text-[#9A3412]' : solution ? 'text-[#14532D]' : 'text-[#1C1917]'}`}>
                {isRunning ? t.statusRunning : solution ? t.statusSuccess : t.statusIdle}
              </div>
            </div>
          </div>
        </div>

        {/* Current Modulus Breakdown */}
        {nBig > 0n && (
          <div className="mt-6 pt-4 border-t border-[#E2DDD2] grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2]">
              <span className="text-xs text-[#57534E] block mb-1">{t.targetModulus} (N):</span>
              <span dir="ltr" className="font-mono-tabular text-xs text-[#1E3A8A] break-all select-all block">
                {nBig.toString()}
              </span>
            </div>
            <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#57534E]">{t.squareRootApprox} (√N Exact Surd / 500d):</span>
                {sqrtSurd && (
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <button
                      onClick={() => setShowFull500(prev => !prev)}
                      className="text-[11px] px-2 py-0.5 rounded-sm bg-white border border-[#E2DDD2] text-[#1E3A8A]"
                    >
                      {showFull500 ? '⌊√N⌋' : '500d'}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(sqrtSurd.decimal500);
                        setCopiedSqrt500(true);
                        setTimeout(() => setCopiedSqrt500(false), 1800);
                      }}
                      className="text-[11px] px-2 py-0.5 rounded-sm bg-white border border-[#E2DDD2] text-[#14532D]"
                    >
                      {copiedSqrt500 ? t.copiedNotice : t.copyBtn}
                    </button>
                  </div>
                )}
              </div>
              {sqrtSurd && (
                <div dir="ltr" className="font-mono-tabular text-xs text-[#14532D] font-bold break-all">
                  {sqrtSurd.canonicalText}
                </div>
              )}
              <span dir="ltr" className="font-mono-tabular text-xs text-[#1C1917] break-all select-all block">
                {showFull500 && sqrtSurd ? sqrtSurd.decimal500 : (sqrtSurd ? `${sqrtN.toString()} · ${sqrtSurd.decimalPreview}` : sqrtN.toString())}
              </span>
            </div>

            {/* Universal Exponent & Totient Invariants (Displayed Completely) */}
            {expReport && (
              <>
                <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#57534E]">
                    <span>الأس العام الأصغر الكامل (λ(N) Carmichael):</span>
                    <div className="flex items-center gap-1.5" dir="ltr">
                      <span className="text-[10px] text-[#14532D] font-mono font-bold">
                        {expReport.isComplete ? `✓ ${expReport.lambdaBits}b` : 'ℹ مضمون'}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(expReport.lambdaN);
                          setCopiedLambda(true);
                          setTimeout(() => setCopiedLambda(false), 1800);
                        }}
                        className="text-[11px] px-2 py-0.5 rounded-sm bg-white border border-[#E2DDD2] text-[#1E3A8A]"
                      >
                        {copiedLambda ? t.copiedNotice : t.copyBtn}
                      </button>
                    </div>
                  </div>
                  <div dir="ltr" className="font-mono-tabular text-xs text-[#1E3A8A] font-bold break-all select-all max-h-40 overflow-y-auto bg-white p-2 rounded border border-[#E2DDD2]/70">
                    {expReport.lambdaN}
                  </div>
                  <div className="text-[10px] text-[#57534E]">
                    أصغر أس m يحقق aᵐ ≡ 1 (mod N) لكل a أولي نسبياً مع N.
                  </div>
                </div>

                <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#57534E]">
                    <span>مؤشر أويلر الكامل φ(N) والأس e:</span>
                    <div className="flex items-center gap-1.5" dir="ltr">
                      <span className="text-[10px] text-[#1E3A8A] font-mono font-bold">
                        {expReport.isComplete && expReport.publicExponentE
                          ? `e_min = ${expReport.minimalPublicExponentE || expReport.publicExponentE} · e = ${expReport.publicExponentE}`
                          : 'e = بانتظار λ(N)'}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(expReport.phiN);
                          setCopiedPhi(true);
                          setTimeout(() => setCopiedPhi(false), 1800);
                        }}
                        className="text-[11px] px-2 py-0.5 rounded-sm bg-white border border-[#E2DDD2] text-[#14532D]"
                      >
                        {copiedPhi ? t.copiedNotice : t.copyBtn}
                      </button>
                    </div>
                  </div>
                  <div dir="ltr" className="font-mono-tabular text-xs text-[#1C1917] font-bold break-all select-all max-h-40 overflow-y-auto bg-white p-2 rounded border border-[#E2DDD2]/70">
                    {expReport.phiN}
                  </div>
                  <div className="text-[10px] text-[#57534E]">
                    نسبة الاختصار φ/λ: {expReport.reductionRatio} · gcd(e, λ(N)) = {expReport.gcdEWithLambda}.
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mathematical Foundation & Formula Card */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6">
        <h3 className="text-lg font-bold font-serif-academic text-[#1C1917] mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-xs bg-[#1E3A8A] inline-block"></span>
          {t.mathFormulaTitle}
        </h3>
        <p className="text-sm text-[#57534E] leading-relaxed mb-4">
          {t.mathFormulaDesc}
        </p>

        {/* Formula Display Box */}
        <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] font-mono text-sm space-y-2 text-center overflow-x-auto" dir="ltr">
          <div className="text-[#9A3412] font-semibold">
            t² - 4·k·N = r² &nbsp;⟺&nbsp; (t - r)(t + r) = 4·k·N
          </div>
          <div className="text-[#1E3A8A] text-xs">
            p = gcd(t - r, N) &nbsp;&nbsp;|&nbsp;&nbsp; q = gcd(t + r, N) &nbsp;&nbsp;⟹&nbsp;&nbsp; p · q = N
          </div>
        </div>

        {/* Three Step Explanations */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
            <div className="text-xs font-bold text-[#1E3A8A] mb-1">{t.step1Title}</div>
            <p className="text-xs text-[#57534E] leading-relaxed">{t.step1Desc}</p>
          </div>
          <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
            <div className="text-xs font-bold text-[#9A3412] mb-1">{t.step2Title}</div>
            <p className="text-xs text-[#57534E] leading-relaxed">{t.step2Desc}</p>
          </div>
          <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
            <div className="text-xs font-bold text-[#14532D] mb-1">{t.step3Title}</div>
            <p className="text-xs text-[#57534E] leading-relaxed">{t.step3Desc}</p>
          </div>
        </div>
      </div>

      {/* Live Spectral Trace & Multiplier Resonance */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6">
        <h3 className="text-lg font-bold font-serif-academic text-[#1C1917] mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-xs bg-[#9A3412] inline-block"></span>
          {t.spectralScanTitle}
        </h3>

        {trace ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
              <span className="text-xs text-[#57534E] block">{t.activeMultiplier}</span>
              <span className="text-2xl font-bold font-mono-tabular text-[#1E3A8A] mt-1 block">
                k = {trace.multiplier}
              </span>
            </div>
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
              <span className="text-xs text-[#57534E] block">{t.stepsCount}</span>
              <span className="text-2xl font-bold font-mono-tabular text-[#1C1917] mt-1 block">
                {trace.steps.toLocaleString()}
              </span>
            </div>
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
              <span className="text-xs text-[#57534E] block">{isRTL ? "الباقي المعياري (mod 64)" : "Résidu modulaire (mod 64)"}</span>
              <span className="text-xl font-bold font-mono-tabular text-[#9A3412] mt-1 block">
                {trace.modResidue}
              </span>
            </div>
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
              <span className="text-xs text-[#57534E] block">{isRTL ? "مرشح مربع كامل" : "Candidat carré"}</span>
              <span className={`text-xl font-bold font-mono mt-1 block ${trace.isCandidateSquare ? 'text-[#14532D]' : 'text-[#57534E]'}`}>
                {trace.isCandidateSquare ? (isRTL ? "نعم ✓" : "Oui ✓") : (isRTL ? "لا ✗" : "Non ✗")}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-[#57534E] py-4 text-center font-mono">
            {isRunning ? (isRTL ? "جاري تهيئة مصفوفة المضاعفات الطيفية..." : "Initialisation du spectre de résonance...") : (isRTL ? "اضغط على 'بدء التحليل الرياضي' لمشاهدة مسار الحل المباشر" : "Cliquez sur 'Lancer la Factorisation' pour voir le traçage en direct")}
          </div>
        )}
      </div>

      {/* Final Verification & Certified Proof */}
      {solution && solution.factor1 && (
        <div className="bg-[#FBF9F5] border border-[#14532D]/40 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold font-serif-academic text-[#14532D] flex items-center gap-2">
              <span className="text-[#14532D]">✓</span> {t.verificationHeader}
            </h3>
            {solution.duration && (
              <span className="text-xs font-mono-tabular text-[#14532D] bg-white px-3 py-1 rounded border border-[#E2DDD2]">
                {solution.duration} ms
              </span>
            )}
          </div>

          <div className="p-4 bg-white rounded-lg border border-[#E2DDD2] mb-6 text-sm text-[#1C1917]">
            <div className="font-semibold text-[#14532D] mb-1">{t.proofTitle}:</div>
            <div dir="ltr" className="font-mono-tabular text-xs text-[#1C1917] break-all mb-2">
              p · q = {solution.factor1} × {solution.factor2}
            </div>
            <div className="text-xs text-[#14532D] font-bold">
              ✓ {t.proofValid}
            </div>
            {solution.method && (
              <div className="text-xs text-[#57534E] mt-2">
                <span>{t.methodUsed}:</span> <span className="text-[#1E3A8A] font-mono">{solution.method}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Factor P */}
            <div className="bg-white p-4 rounded-lg border border-[#E2DDD2]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#14532D]">{t.factorP}:</span>
                <button
                  onClick={() => copyToClipboard(solution.factor1, 'p')}
                  className="text-xs px-2.5 py-1 rounded bg-[#F4F0E8] hover:border-[#1E3A8A] border border-[#E2DDD2] text-[#1E3A8A] transition-colors"
                >
                  {copiedP ? t.copiedNotice : t.copyBtn}
                </button>
              </div>
              <div dir="ltr" className="font-mono-tabular text-xs text-[#1C1917] break-all select-all bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
                {solution.factor1}
              </div>
              <div className="text-[11px] text-[#57534E] mt-2 font-mono">
                {isRTL ? "الطول:" : "Taille :"} {BigInt(solution.factor1).toString(2).length} {t.bitsLabel}
              </div>
            </div>

            {/* Factor Q */}
            <div className="bg-white p-4 rounded-lg border border-[#E2DDD2]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#1E3A8A]">{t.factorQ}:</span>
                <button
                  onClick={() => copyToClipboard(solution.factor2, 'q')}
                  className="text-xs px-2.5 py-1 rounded bg-[#F4F0E8] hover:border-[#1E3A8A] border border-[#E2DDD2] text-[#1E3A8A] transition-colors"
                >
                  {copiedQ ? t.copiedNotice : t.copyBtn}
                </button>
              </div>
              <div dir="ltr" className="font-mono-tabular text-xs text-[#1C1917] break-all select-all bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
                {solution.factor2}
              </div>
              <div className="text-[11px] text-[#57534E] mt-2 font-mono">
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
