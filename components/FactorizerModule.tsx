import React, { useState } from 'react';
import MathFormula from './MathFormula';
import { classifyFactorsForMatrix, factorizeQuickWithTrace, QuickFactorResult } from '../lib/mathEngine';
import { computeUniversalExponentReport } from '../lib/universalExponentEngine';
import { V4_BENCHMARK_PRESETS } from '../v4FallbackOptimizer';

export type PrimaryFactorAlgorithm = 'chronos-196' | 'cfrac' | 'zeta' | 'coppersmith' | 'rsa-500plus' | 'zf18-19-lab' | 'psi-factor';

interface FactorizerModuleProps {
  nValue: string;
  onChangeN: (newN: string) => void;
  onGenerateRsaKey: (bits: number) => void;
  onLaunchChronos: (targetN?: string, algOverride?: 'chronos-196' | 'cfrac' | 'zeta') => void;
  onStopChronos: () => void;
  isChronosRunning: boolean;
  activeAlgorithm: PrimaryFactorAlgorithm;
  onSelectAlgorithm: (alg: PrimaryFactorAlgorithm) => void;
  chronosSolution: { allFactors?: string[]; factor1: string; factor2: string; method?: string; duration?: number } | null;
  onJumpToBlock: (p: number, q: number) => void;
}

const PAPER_SAMPLES = [
  { label: '371 = 7 × 53 (فرق المصفوفتين)', n: '371' },
  { label: '21919 = 23 × 953 (مجموع M)', n: '21919' },
  { label: '6236 = 2² × 1559 (مركب عام)', n: '6236' },
  { label: '7919 (أولي في العمود c=1)', n: '7919' },
  { label: '90601 = 301² (مربع قطري مثالي؟ لا 301=7×43)', n: '11449' },
  { label: '116 بت (مقارنة Vanilla مقابل v4)', n: V4_BENCHMARK_PRESETS[0].n }
];

export const FactorizerModule: React.FC<FactorizerModuleProps> = ({
  nValue,
  onChangeN,
  onGenerateRsaKey,
  onLaunchChronos,
  onStopChronos,
  isChronosRunning,
  activeAlgorithm,
  onSelectAlgorithm,
  chronosSolution,
  onJumpToBlock
}) => {
  const [inputDraft, setInputDraft] = useState<string>(nValue);
  const [quickResult, setQuickResult] = useState<QuickFactorResult | null>(() => {
    try {
      return nValue.trim() ? factorizeQuickWithTrace(BigInt(nValue.trim())) : null;
    } catch {
      return null;
    }
  });
  const [keyBits, setKeyBits] = useState<number>(116);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    setInputDraft(nValue);
  }, [nValue]);

  const handleAnalyze = (customTarget?: string) => {
    const raw = (customTarget ?? inputDraft).replace(/[^0-9]/g, '');
    if (!raw) {
      setErrorMsg('يرجى إدخال عدد صحيح موجب صالح.');
      return;
    }
    setErrorMsg(null);
    onChangeN(raw);

    if (activeAlgorithm === 'chronos-196' || activeAlgorithm === 'zeta') {
      setQuickResult(null);
      onLaunchChronos(raw, activeAlgorithm);
      return;
    }

    const nBig = BigInt(raw);
    const res = factorizeQuickWithTrace(nBig);
    setQuickResult(res);

    // Automatically escalate to selected Web Worker engine if synchronous budget did not finish
    if (!res.complete) {
      onLaunchChronos(raw, activeAlgorithm === 'cfrac' ? 'cfrac' : 'chronos-196');
    }
  };

  // Merge synchronous quick result with async Chronos v4 solution if solved via Web Workers
  const chronosFactors = chronosSolution?.allFactors || (chronosSolution ? [chronosSolution.factor1, chronosSolution.factor2] : []);
  const activeFactors = chronosFactors.length > 0 ? chronosFactors : (quickResult?.complete ? quickResult.factors : []);
  const finalClassification = React.useMemo(() => {
    if (!nValue.trim()) return null;
    try {
      const nBig = BigInt(nValue.trim());
      if (chronosFactors.length > 0) {
        const sorted = chronosFactors.map(f => BigInt(f)).sort((a, b) => (a < b ? -1 : 1));
        return classifyFactorsForMatrix(nBig, sorted, true);
      }
      if (quickResult) {
        return {
          classification: quickResult.classification,
          exponents: quickResult.exponents,
          labelAr: quickResult.matrixCoordinateLabelAr,
          blockPair: quickResult.blockPair
        };
      }
    } catch {}
    return null;
  }, [nValue, chronosFactors.join(','), quickResult]);

  const universalExpReport = React.useMemo(() => {
    if (!nValue.trim()) return null;
    try {
      let pHint: string | undefined;
      let qHint: string | undefined;
      if (chronosFactors.length >= 2) {
        pHint = chronosFactors[0];
        qHint = chronosFactors[1];
      } else if (finalClassification?.blockPair) {
        pHint = finalClassification.blockPair.p;
        qHint = finalClassification.blockPair.q;
      }
      return computeUniversalExponentReport(nValue.trim(), 'standard', 0.258, pHint, qHint);
    } catch {
      return null;
    }
  }, [nValue, chronosFactors.join(','), finalClassification?.blockPair?.p, finalClassification?.blockPair?.q]);

  const canJumpToBlock =
    finalClassification?.blockPair &&
    BigInt(finalClassification.blockPair.p) <= 100000n &&
    BigInt(finalClassification.blockPair.q) <= 100000n;

  return (
    <div className="space-y-6">
      {/* Input & Unified Solver Launcher */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
        <div className="space-y-3 border-b border-[#E2DDD2] pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-mono text-[#1E3A8A]">
                الفصل الأول · التصنيف الأولي والسباق الموحد (Chronos v4 · Ψ-Factor · &gt;500 بت · ZF-18/19 · CFRAC)
              </div>
              <h2 className="text-xl md:text-2xl font-bold font-serif-academic text-[#1C1917]">
                محلل الأعداد الأولية وشبه الأولية والتفكيك الدقيق
              </h2>
            </div>

            {/* Standard Factorization Algorithm Selector */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F0E8] rounded-xl border border-[#E2DDD2] shrink-0">
              {([
                { id: 'chronos-196', label: 'Chronos v4 (السباق الموحد)' },
                { id: 'rsa-500plus', label: 'منظومة &gt;500 بت (Wiener/BD/CADO)' },
                { id: 'cfrac', label: 'الكسور المستمرة (CFRAC)' },
                { id: 'zeta', label: 'أصفار زيتا والبذور الدقيقة (500d)' },
                { id: 'coppersmith', label: 'كوبرسميث (MSB/LSB LLL)' },
                { id: 'zf18-19-lab', label: 'مختبر ZF-18/19 والقبول' },
                { id: 'psi-factor', label: 'Ψ-Factor وتجارب Ψ-3.1' }
              ] as const).map((alg) => (
                <button
                  key={alg.id}
                  disabled={isChronosRunning}
                  onClick={() => onSelectAlgorithm(alg.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-50 ${
                    activeAlgorithm === alg.id
                      ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] shadow-sm'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  {alg.id === 'rsa-500plus' ? 'منظومة >500 بت (Wiener/BD/CADO)' : alg.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-[#57534E] leading-relaxed max-w-4xl">
            يجمع <span className="font-mono text-xs">Chronos v4</span> المحركات الخمسة في سباق متوازٍ واحد (<span className="font-mono text-xs">Ψ-Factor</span> + <span className="font-mono text-xs">&gt;500b SNFS/Wiener/BD</span> + <span className="font-mono text-xs">ZF-18/19 LLL</span> + <span className="font-mono text-xs">CFRAC</span> + <span className="font-mono text-xs">SIQS/REDC ECM</span>) مع توحيد مصفوفة <span className="font-mono text-xs">GF(2)</span> وإيقاف بقية الخيوط فور التحقق من أول عامل، مع إبقاء لوحات الاختبار المستقلة متاحة لكل محرك.
          </p>
        </div>

        {/* Presets Row */}
        <div className="flex flex-wrap gap-2">
          {PAPER_SAMPLES.map((sample, idx) => (
            <button
              key={idx}
              disabled={isChronosRunning}
              onClick={() => {
                setInputDraft(sample.n);
                handleAnalyze(sample.n);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] transition-colors disabled:opacity-50"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* Numeric Input + Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          <div className="lg:col-span-7">
            <textarea
              dir="ltr"
              rows={2}
              value={inputDraft}
              onChange={(e) => setInputDraft(e.target.value)}
              disabled={isChronosRunning}
              placeholder="أدخل أي عدد N بأي طول (مثال: 371 أو 21919 أو عدد RSA من 196 بت)"
              className="w-full h-full p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-sm text-[#1C1917] focus:outline-none focus:border-[#1E3A8A] resize-none"
            />
          </div>
          <div className="lg:col-span-5 flex flex-col justify-between gap-2">
            <div className="flex gap-2">
              {!isChronosRunning ? (
                <button
                  onClick={() => handleAnalyze()}
                  className="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors"
                >
                  {activeAlgorithm === 'cfrac'
                    ? 'فحص وتفكيك عبر CFRAC'
                    : (activeAlgorithm === 'zeta'
                      ? 'تفكيك بأصفار زيتا والبذور الدقيقة'
                      : 'تشغيل السباق الموحد (Chronos v4)')}
                </button>
              ) : (
                <button
                  onClick={onStopChronos}
                  className="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold bg-[#9A3412] hover:bg-[#7C2D12] text-white transition-colors"
                >
                  إيقاف السباق الموحد
                </button>
              )}
              <button
                onClick={() =>
                  onLaunchChronos(
                    inputDraft.replace(/[^0-9]/g, '') || nValue,
                    activeAlgorithm === 'cfrac' ? 'cfrac' : (activeAlgorithm === 'zeta' ? 'zeta' : 'chronos-196')
                  )
                }
                disabled={isChronosRunning}
                className="py-2.5 px-3 rounded-lg text-xs font-semibold bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] disabled:opacity-50 whitespace-nowrap"
              >
                {activeAlgorithm === 'cfrac'
                  ? 'تشغيل CFRAC فقط'
                  : (activeAlgorithm === 'zeta' ? 'تشغيل محرك زيتا' : 'بدء السباق الآن')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={keyBits}
                onChange={(e) => setKeyBits(Number(e.target.value))}
                disabled={isChronosRunning}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] text-xs font-mono text-[#1C1917]"
              >
                <option value={64}>64-bit RSA</option>
                <option value={96}>96-bit RSA</option>
                <option value={116}>116-bit RSA</option>
                <option value={140}>140-bit RSA</option>
                <option value={196}>196-bit RSA</option>
                <option value={256}>256-bit RSA</option>
                <option value={512}>512-bit RSA</option>
                <option value={768}>768-bit RSA</option>
                <option value={1024}>1024-bit RSA</option>
              </select>
              <button
                onClick={() => onGenerateRsaKey(keyBits)}
                disabled={isChronosRunning}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A] disabled:opacity-50 whitespace-nowrap"
              >
                توليد شبه أولي عشوائي
              </button>
            </div>
          </div>
        </div>

        {errorMsg && <div className="text-xs text-[#9A3412] font-medium">✖ {errorMsg}</div>}
      </div>

      {/* Classification & Result Card */}
      {finalClassification && (
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2DDD2] pb-3">
            <div>
              <div className="text-xs font-mono text-[#14532D]">التصنيف المصفوفي الهيكلي</div>
              <h3 className="text-lg font-bold font-serif-academic text-[#1C1917]">
                {finalClassification.labelAr}
              </h3>
            </div>
            {canJumpToBlock && finalClassification.blockPair && (
              <button
                onClick={() =>
                  onJumpToBlock(
                    Number(finalClassification.blockPair!.p),
                    Number(finalClassification.blockPair!.q)
                  )
                }
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#14532D] hover:bg-[#052E16] text-white transition-colors whitespace-nowrap shrink-0"
              >
                توليد الكتلة <MathFormula tex={`\\mathcal{M}_{${finalClassification.blockPair.p},${finalClassification.blockPair.q}}`} className="text-white mx-1" /> ↗
              </button>
            )}
          </div>

          {activeFactors.length > 0 && (
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
              <div className="text-xs font-semibold text-[#14532D]">
                التفكيك الأولي المعتمد (حاصل الضرب يطابق N تماماً):
              </div>
              <div dir="ltr" className="font-mono-tabular text-sm font-bold text-[#1C1917] break-all">
                {nValue} = {finalClassification.exponents.map(e => (e.power > 1 ? `${e.prime}^${e.power}` : e.prime)).join(' × ')}
              </div>
              {chronosSolution?.method && (
                <div className="text-xs text-[#57534E] font-mono">
                  {chronosSolution.method} {chronosSolution.duration ? `(${chronosSolution.duration} ms)` : ''}
                </div>
              )}
            </div>
          )}

          {/* Universal Exponent (الأس العام) & Number-Theoretic Invariants */}
          {universalExpReport && (
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#1E3A8A]">الأس العام وثوابت التشفير</span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#E2DDD2] text-[#14532D] font-bold">
                    {universalExpReport.isComplete ? '✓ محسوب بدقة تامة' : 'ℹ مضمون قياسياً (PKCS#1)'}
                  </span>
                </div>
                <div className="text-[11px] font-mono-tabular text-[#57534E]" dir="ltr">
                  N: {universalExpReport.nBits} bits · gcd(e, λ) = {universalExpReport.gcdEWithLambda}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono-tabular" dir="ltr">
                <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                  <span className="text-[10px] text-[#57534E] block">الأس العام الأصغر λ(N) Carmichael</span>
                  <span className="font-bold text-[#1E3A8A] text-sm break-all block mt-0.5">
                    {universalExpReport.lambdaN.length > 28 ? `${universalExpReport.lambdaN.slice(0, 24)}...` : universalExpReport.lambdaN}
                  </span>
                  <span className="text-[9px] text-[#57534E] block mt-1">a^λ(N) ≡ 1 (mod N)</span>
                </div>

                <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                  <span className="text-[10px] text-[#57534E] block">مؤشر أويلر φ(N) Euler Totient</span>
                  <span className="font-bold text-[#1C1917] text-sm break-all block mt-0.5">
                    {universalExpReport.phiN.length > 28 ? `${universalExpReport.phiN.slice(0, 24)}...` : universalExpReport.phiN}
                  </span>
                  <span className="text-[9px] text-[#57534E] block mt-1">نسبة الاختصار φ/λ: {universalExpReport.reductionRatio}</span>
                </div>

                <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                  <span className="text-[10px] text-[#57534E] block">الأس العام للتشفير e (Public Exp)</span>
                  <span className="font-bold text-[#14532D] text-sm break-all block mt-0.5">
                    {universalExpReport.publicExponentE}
                  </span>
                  <span className="text-[9px] text-[#14532D] block mt-1">gcd(e, λ(N)) = 1 (أولي نسبياً)</span>
                </div>

                <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                  <span className="text-[10px] text-[#57534E] block">الأس الخاص d ≡ e⁻¹ (mod λ(N))</span>
                  <span className="font-bold text-[#9A3412] text-sm break-all block mt-0.5">
                    {universalExpReport.privateExponentD
                      ? (universalExpReport.privateExponentD.length > 28 ? `${universalExpReport.privateExponentD.slice(0, 24)}...` : universalExpReport.privateExponentD)
                      : 'قيد الاستخراج عبر Chronos'}
                  </span>
                  <span className="text-[9px] text-[#57534E] block mt-1">
                    {universalExpReport.dBits ? `|d| = ${universalExpReport.dBits} bits` : 'يتطلب فك N لمودول مجهول'}
                  </span>
                </div>
              </div>

              {universalExpReport.crt && (
                <div className="bg-white p-2.5 rounded border border-[#E2DDD2] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular" dir="ltr">
                  <div className="text-[#57534E]">معاملات البواقي الصينية (CRT Exponents):</div>
                  <div className="text-[#1C1917]">
                    <span className="text-[#57534E]">d_p =</span> {universalExpReport.crt.dp.slice(0, 16)}... |{' '}
                    <span className="text-[#57534E]">d_q =</span> {universalExpReport.crt.dq.slice(0, 16)}... |{' '}
                    <span className="text-[#57534E]">q_inv =</span> {universalExpReport.crt.qInv.slice(0, 16)}...
                  </div>
                </div>
              )}

              <p className="text-xs text-[#57534E] leading-relaxed">
                {universalExpReport.explanationAr}
              </p>
            </div>
          )}

          {/* Step-by-step Quick Trace */}
          {quickResult && quickResult.steps.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#1C1917]">سجل خطوات الخوارزمية الأولية:</div>
              <div className="divide-y divide-[#EAE5DA] border border-[#E2DDD2] rounded-lg bg-[#FBF9F5]">
                {quickResult.steps.map((st, idx) => (
                  <div key={idx} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#1E3A8A] shrink-0" dir="ltr">[{st.stage}]</span>
                      <span className="text-[#1C1917]">{st.detailAr}</span>
                    </div>
                    <span className="font-mono-tabular text-[#57534E] shrink-0" dir="ltr">{st.elapsedMs} ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FactorizerModule;
