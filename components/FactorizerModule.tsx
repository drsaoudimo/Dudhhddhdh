import React, { useState } from 'react';
import MathFormula from './MathFormula';
import { classifyFactorsForMatrix, factorizeQuickWithTrace, QuickFactorResult } from '../lib/mathEngine';
import { computeUniversalExponentReport } from '../lib/universalExponentEngine';
import { V4_BENCHMARK_PRESETS } from '../v4FallbackOptimizer';

export type PrimaryFactorAlgorithm =
  | 'chronos-196'
  | 'hgs'
  | 'cfrac'
  | 'zeta'
  | 'coppersmith'
  | 'rsa-500plus'
  | 'zf18-19-lab'
  | 'psi-factor'
  | 'ppfo-2000'
  | 'python-console';

interface FactorizerModuleProps {
  nValue: string;
  onChangeN: (newN: string) => void;
  onGenerateRsaKey: (bits: number) => void;
  onLaunchChronos: (targetN?: string, algOverride?: 'chronos-196' | 'cfrac' | 'zeta' | 'hgs') => void;
  onStopChronos: () => void;
  isChronosRunning: boolean;
  activeAlgorithm: PrimaryFactorAlgorithm;
  onSelectAlgorithm: (alg: PrimaryFactorAlgorithm) => void;
  chronosSolution: {
    allFactors?: string[];
    factor1: string;
    factor2: string;
    method?: string;
    duration?: number;
  } | null;
  onJumpToBlock: (p: number, q: number) => void;
  stopStage1OnUniversalExp: boolean;
  onToggleStopStage1OnUniversalExp: (v: boolean) => void;
  onComputeUniversalExponent: (targetN?: string) => void;
  isUniversalExpPending?: boolean;
  universalExpStage1Halted?: boolean;
  onRevealFactorsAfterStage1?: () => void;
}

const PAPER_SAMPLES = [
  { label: '371 = 7 × 53 (فرق المصفوفتين)', n: '371' },
  { label: '21919 = 23 × 953 (مجموع M)', n: '21919' },
  { label: '6236 = 2² × 1559 (مركب عام)', n: '6236' },
  { label: '7919 (أولي في العمود c=1)', n: '7919' },
  { label: '11449 = 107² (مربع قطري)', n: '11449' },
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
  onJumpToBlock,
  stopStage1OnUniversalExp,
  onToggleStopStage1OnUniversalExp,
  onComputeUniversalExponent,
  isUniversalExpPending = false,
  universalExpStage1Halted = false,
  onRevealFactorsAfterStage1
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bypassCacheExp, setBypassCacheExp] = useState<boolean>(false);

  React.useEffect(() => {
    setInputDraft(nValue);
  }, [nValue]);

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1800);
  };

  const handleAnalyze = (customTarget?: string) => {
    const raw = (customTarget ?? inputDraft).replace(/[^0-9]/g, '');
    if (!raw) {
      setErrorMsg('يرجى إدخال عدد صحيح موجب صالح.');
      return;
    }
    setErrorMsg(null);
    onChangeN(raw);

    if (activeAlgorithm === 'chronos-196' || activeAlgorithm === 'zeta' || activeAlgorithm === 'hgs') {
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

  const handleUniversalExpClick = () => {
    const raw = inputDraft.replace(/[^0-9]/g, '');
    if (!raw) {
      setErrorMsg('يرجى إدخال عدد صحيح موجب صالح لحساب الأس العام.');
      return;
    }
    setErrorMsg(null);
    if (stopStage1OnUniversalExp) {
      setQuickResult(null);
    }
    onComputeUniversalExponent(raw);
  };

  // Merge synchronous quick result with async Chronos v4 solution if solved via Web Workers
  const chronosFactors =
    chronosSolution?.allFactors || (chronosSolution ? [chronosSolution.factor1, chronosSolution.factor2] : []);
  const activeFactors = universalExpStage1Halted
    ? []
    : chronosFactors.length > 0
    ? chronosFactors
    : quickResult?.complete
    ? quickResult.factors
    : [];

  const finalClassification = React.useMemo(() => {
    if (universalExpStage1Halted) return null;
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
    } catch {
      // ignore invalid
    }
    return null;
  }, [nValue, chronosFactors.join(','), quickResult, universalExpStage1Halted]);

  const universalExpReport = React.useMemo(() => {
    if (!nValue.trim()) return null;
    try {
      let pHint: string | undefined;
      let qHint: string | undefined;
      if (!universalExpStage1Halted) {
        if (chronosFactors.length >= 2) {
          pHint = chronosFactors[0];
          qHint = chronosFactors[1];
        } else if (finalClassification?.blockPair) {
          pHint = finalClassification.blockPair.p;
          qHint = finalClassification.blockPair.q;
        }
      }
      return computeUniversalExponentReport(nValue.trim(), 'standard', 0.258, pHint, qHint, {
        stopStage1BeforeFactors: universalExpStage1Halted && stopStage1OnUniversalExp,
        ignoreCache: bypassCacheExp
      });
    } catch {
      return null;
    }
  }, [
    nValue,
    chronosFactors.join(','),
    finalClassification?.blockPair?.p,
    finalClassification?.blockPair?.q,
    universalExpStage1Halted,
    stopStage1OnUniversalExp,
    bypassCacheExp
  ]);

  const canJumpToBlock =
    !universalExpStage1Halted &&
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
                { id: 'hgs', label: 'الغربال الهجين HGS (SIQS + 1LP)' },
                { id: 'rsa-500plus', label: 'منظومة >500 بت (Wiener/BD/CADO)' },
                { id: 'cfrac', label: 'الكسور المستمرة (CFRAC)' },
                { id: 'zeta', label: 'أصفار زيتا والبذور الدقيقة (500d)' },
                { id: 'coppersmith', label: 'كوبرسميث (MSB/LSB LLL)' },
                { id: 'zf18-19-lab', label: 'مختبر ZF-18/19 والقبول' },
                { id: 'psi-factor', label: 'Ψ-Factor وتجارب Ψ-3.1' },
                { id: 'ppfo-2000', label: '🔬 PPFO v16 (دقة 2000 خانة)' },
                { id: 'python-console', label: '🐍 مختبر بايثون التفاعلي' }
              ] as const).map(alg => (
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
                  {alg.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-[#57534E] leading-relaxed max-w-4xl">
            يجمع <span className="font-mono text-xs">Chronos v4</span> المحركات الستة في سباق متوازٍ واحد (<span className="font-mono text-xs">Ψ-Factor</span> + <span className="font-mono text-xs">&gt;500b SNFS/Wiener/BD</span> + <span className="font-mono text-xs">ZF-18/19 LLL</span> + <span className="font-mono text-xs">HGS</span> + <span className="font-mono text-xs">CFRAC</span> + <span className="font-mono text-xs">SIQS/REDC ECM</span>) عبر مصفوفة <span className="font-mono text-xs">GF(2) الموحد (markowitz-core)</span> مع ضمان حساب الأس العام <span className="font-mono text-xs">λ(N)</span> وعرضه كاملاً.
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
          <div className="lg:col-span-6">
            <textarea
              dir="ltr"
              rows={3}
              value={inputDraft}
              onChange={e => setInputDraft(e.target.value)}
              disabled={isChronosRunning}
              placeholder="أدخل أي عدد N بأي طول (مثال: 371 أو 21919 أو عدد RSA من 196 بت)"
              className="w-full h-full p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-sm text-[#1C1917] focus:outline-none focus:border-[#1E3A8A] resize-none"
            />
          </div>
          <div className="lg:col-span-6 flex flex-col justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {!isChronosRunning ? (
                <button
                  onClick={() => handleAnalyze()}
                  className="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors whitespace-nowrap"
                >
                  {activeAlgorithm === 'cfrac'
                    ? 'فحص وتفكيك عبر CFRAC'
                    : activeAlgorithm === 'hgs'
                    ? 'تشغيل غربال HGS (SIQS + 1LP/2LP)'
                    : activeAlgorithm === 'zeta'
                    ? 'تفكيك بأصفار زيتا والبذور الدقيقة'
                    : 'تشغيل السباق الموحد (Chronos v4)'}
                </button>
              ) : (
                <button
                  onClick={onStopChronos}
                  className="flex-1 py-2.5 px-4 rounded-lg text-xs font-bold bg-[#9A3412] hover:bg-[#7C2D12] text-white transition-colors whitespace-nowrap"
                >
                  إيقاف المرحلة 1 / السباق
                </button>
              )}

              <button
                onClick={handleUniversalExpClick}
                disabled={isUniversalExpPending && !isChronosRunning}
                className="py-2.5 px-4 rounded-lg text-xs font-bold bg-[#14532D] hover:bg-[#052E16] text-white transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {isUniversalExpPending
                  ? 'جارٍ حسم الأس العام λ(N)...'
                  : 'حساب الأس العام λ(N) كاملاً'}
              </button>
            </div>

            {/* Stage 1 Stop Toggle for Universal Exponent */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FBF9F5] px-3 py-2 rounded-lg border border-[#E2DDD2]">
              <label className="flex items-center gap-2 text-xs text-[#1C1917] font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stopStage1OnUniversalExp}
                  onChange={e => onToggleStopStage1OnUniversalExp(e.target.checked)}
                  className="accent-[#14532D] w-3.5 h-3.5"
                />
                <span>إيقاف المرحلة 1 قبل إيجاد العوامل عند إيجاد الأس العام λ(N)</span>
              </label>

              <div className="flex items-center gap-2">
                <select
                  value={keyBits}
                  onChange={e => setKeyBits(Number(e.target.value))}
                  disabled={isChronosRunning}
                  className="px-2 py-1 rounded bg-white border border-[#E2DDD2] text-xs font-mono text-[#1C1917]"
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
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A] disabled:opacity-50 whitespace-nowrap"
                >
                  توليد شبه أولي
                </button>
              </div>
            </div>
          </div>
        </div>

        {errorMsg && <div className="text-xs text-[#9A3412] font-medium">✖ {errorMsg}</div>}
      </div>

      {/* Stage 1 Stopped Before Factors Notice */}
      {universalExpStage1Halted && (
        <div className="bg-[#14532D]/5 border border-[#14532D]/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-bold text-[#14532D]">
              ⏹ تم إيقاف المرحلة 1 قبل إيجاد/عرض العوامل عند إيجاد الأس العام λ(N)
            </div>
            <p className="text-xs text-[#57534E]">
              تم استخلاص الأس العام الكامل والتحقق من تطابق <span dir="ltr" className="font-mono">a^λ(N) ≡ 1 (mod N)</span> مع إيقاف المرحلة 1 تماماً قبل مرحلة تفكيك العوامل.
            </p>
          </div>
          {onRevealFactorsAfterStage1 && (
            <button
              onClick={onRevealFactorsAfterStage1}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white border border-[#14532D]/40 text-[#14532D] hover:bg-[#14532D] hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              استكمال المرحلة وعرض العوامل ↗
            </button>
          )}
        </div>
      )}

      {/* Standalone Universal Exponent Card (Always visible & Complete without truncation) */}
      {universalExpReport && (
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-mono font-bold text-[#1E3A8A]">
                الأس العام الكامل وثوابت التشفير (عرض كامل بدون اختصار)
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded bg-[#F4F0E8] border border-[#E2DDD2] text-[#14532D] font-bold">
                {universalExpReport.isComplete
                  ? universalExpReport.lambdaVerified
                    ? `✓ محسوب بدقة تامة ومُتحقق على ${universalExpReport.verifiedBasesCount} قواعد`
                    : '✓ محسوب بدقة تامة'
                  : '⏳ قيد الحساب القياسي / جاهز لخيوط الخلفية'}
              </span>
              {universalExpReport.stage1StoppedBeforeFactors && (
                <span className="text-[11px] px-2.5 py-0.5 rounded bg-[#9A3412]/10 border border-[#9A3412]/30 text-[#9A3412] font-bold">
                  ⏹ أُوقفت المرحلة 1 قبل العوامل
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular text-[#57534E]" dir="ltr">
              <span>
                |N| = {universalExpReport.nBits} bits · |λ| = {universalExpReport.isComplete ? `${universalExpReport.lambdaBits} bits` : 'قيد التحديد'} · gcd(e, λ) ={' '}
                {universalExpReport.gcdEWithLambda}
              </span>
              <button
                type="button"
                onClick={() => setBypassCacheExp(prev => !prev)}
                className={`px-2 py-0.5 rounded border text-[10px] font-bold transition-colors ${
                  bypassCacheExp
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-[#F4F0E8] text-[#1C1917] border-[#E2DDD2] hover:border-[#1E3A8A]'
                }`}
              >
                {bypassCacheExp ? '✓ Cache Bypassed (Independent)' : 'Bypass Cache Audit'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono-tabular" dir="ltr">
            {/* Full lambda(N) */}
            <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#57534E] font-sans font-bold">
                  الأس العام الأصغر الكامل λ(N) Carmichael ({universalExpReport.lambdaN.length} chars)
                </span>
                <button
                  onClick={() => copyText('lambda', universalExpReport.lambdaN)}
                  className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#E2DDD2] text-[#1E3A8A] hover:border-[#1E3A8A]"
                >
                  {copiedKey === 'lambda' ? '✓ تم النسخ' : 'نسخ λ(N)'}
                </button>
              </div>
              <div className="font-bold text-[#1E3A8A] text-xs break-all select-all bg-white p-2.5 rounded border border-[#E2DDD2]/80 max-h-48 overflow-y-auto">
                {universalExpReport.lambdaN}
              </div>
              <span className="text-[10px] text-[#57534E] block">
                a^λ(N) ≡ 1 (mod N) · Provenance:{' '}
                <strong className={universalExpReport.provenance === 'cache-seeded' ? 'text-[#9A3412]' : 'text-[#14532D]'}>
                  {universalExpReport.provenance}
                </strong>
                {universalExpReport.cacheSource ? ` (${universalExpReport.cacheSource})` : ''} · Path: {universalExpReport.computationPath}
              </span>
            </div>

            {/* Full phi(N) */}
            <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#57534E] font-sans font-bold">
                  مؤشر أويلر الكامل φ(N) Euler Totient
                </span>
                <button
                  onClick={() => copyText('phi', universalExpReport.phiN)}
                  className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#E2DDD2] text-[#1C1917] hover:border-[#1E3A8A]"
                >
                  {copiedKey === 'phi' ? '✓ تم النسخ' : 'نسخ φ(N)'}
                </button>
              </div>
              <div className="font-bold text-[#1C1917] text-xs break-all select-all bg-white p-2.5 rounded border border-[#E2DDD2]/80 max-h-48 overflow-y-auto">
                {universalExpReport.phiN}
              </div>
              <span className="text-[10px] text-[#57534E] block">
                نسبة الاختصار φ/λ: {universalExpReport.reductionRatio}
              </span>
            </div>

            {/* Public Exponent e (Never blindly fixed to 65537 before λ(N) is solved) */}
            <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#57534E] font-sans font-bold">
                  الأس العام للتشفير e (مُشتق من λ(N))
                </span>
                <div className="flex items-center gap-1.5">
                  {universalExpReport.isComplete && universalExpReport.minimalPublicExponentE && (
                    <button
                      onClick={() => copyText('emin', universalExpReport.minimalPublicExponentE!)}
                      className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#E2DDD2] text-[#1E3A8A] hover:border-[#1E3A8A]"
                    >
                      {copiedKey === 'emin' ? '✓ تم النسخ' : `نسخ e_min`}
                    </button>
                  )}
                  {universalExpReport.isComplete && universalExpReport.publicExponentE && (
                    <button
                      onClick={() => copyText('e', universalExpReport.publicExponentE!)}
                      className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#E2DDD2] text-[#14532D] hover:border-[#14532D]"
                    >
                      {copiedKey === 'e' ? '✓ تم النسخ' : 'نسخ e'}
                    </button>
                  )}
                </div>
              </div>
              {universalExpReport.isComplete && universalExpReport.publicExponentE ? (
                <div className="space-y-1.5">
                  <div className="bg-white p-2.5 rounded border border-[#E2DDD2]/80 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-sans text-[#57534E]">أصغر أس أولي نسبي مكتشف مع λ(N):</span>
                    <span className="font-bold text-[#1E3A8A] text-sm break-all select-all">
                      e_min = {universalExpReport.minimalPublicExponentE || universalExpReport.publicExponentE}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-[#E2DDD2]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-sans text-[#57534E]">القياسي المعتمد:</span>
                    <span className="font-bold text-[#14532D] break-all select-all">
                      e = {universalExpReport.publicExponentE}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#14532D] block">
                    gcd(e, λ(N)) = {universalExpReport.gcdEWithLambda} · أولي نسبياً مُتحقق بعد حسم λ(N)
                  </span>
                </div>
              ) : (
                <div className="bg-white p-2.5 rounded border border-[#9A3412]/30 space-y-2">
                  <div className="font-bold text-[#9A3412] text-xs font-sans">
                    قيد التحديد — يجب إيجاد λ(N) أو العوامل أولاً بأي طريقة (لا يُفرض 65537 تلقائياً)
                  </div>
                  <button
                    type="button"
                    onClick={handleUniversalExpClick}
                    disabled={isChronosRunning}
                    className="px-2.5 py-1 rounded text-[11px] font-sans font-bold bg-[#14532D] hover:bg-[#052E16] text-white disabled:opacity-50"
                  >
                    إيجاد λ(N) والأس العام الآن
                  </button>
                </div>
              )}
            </div>

            {/* Full Private Exponent d */}
            <div className="bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#57534E] font-sans font-bold">
                  الأس الخاص الكامل d ≡ e⁻¹ (mod λ(N))
                </span>
                {universalExpReport.privateExponentD && (
                  <button
                    onClick={() => copyText('d', universalExpReport.privateExponentD!)}
                    className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#E2DDD2] text-[#9A3412] hover:border-[#9A3412]"
                  >
                    {copiedKey === 'd' ? '✓ تم النسخ' : 'نسخ d'}
                  </button>
                )}
              </div>
              <div className="font-bold text-[#9A3412] text-xs break-all select-all bg-white p-2.5 rounded border border-[#E2DDD2]/80 max-h-48 overflow-y-auto">
                {universalExpReport.privateExponentD
                  ? universalExpReport.privateExponentD
                  : 'اضغط «حساب الأس العام λ(N) كاملاً» لاستخراج d بدقة تامة'}
              </div>
              <span className="text-[10px] text-[#57534E] block">
                {universalExpReport.dBits ? `|d| = ${universalExpReport.dBits} bits` : 'جاهز للحسم غير المحجوب'}
              </span>
            </div>
          </div>

          {/* Complete CRT Parameters (untruncated) */}
          {universalExpReport.crt && (
            <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2] space-y-2 text-[11px] font-mono-tabular" dir="ltr">
              <div className="text-[#57534E] font-sans font-bold">معاملات البواقي الصينية الكاملة (CRT Exponents):</div>
              <div className="grid grid-cols-1 gap-1.5 text-[#1C1917]">
                <div className="bg-white p-2 rounded border border-[#E2DDD2]/80 break-all select-all">
                  <span className="text-[#57534E] font-bold">d_p = </span>
                  {universalExpReport.crt.dp}
                </div>
                <div className="bg-white p-2 rounded border border-[#E2DDD2]/80 break-all select-all">
                  <span className="text-[#57534E] font-bold">d_q = </span>
                  {universalExpReport.crt.dq}
                </div>
                <div className="bg-white p-2 rounded border border-[#E2DDD2]/80 break-all select-all">
                  <span className="text-[#57534E] font-bold">q_inv = </span>
                  {universalExpReport.crt.qInv}
                </div>
              </div>
            </div>
          )}

          {universalExpReport.needsAsyncWorker && !isChronosRunning && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1E3A8A]/5 border border-[#1E3A8A]/20 rounded-lg p-3">
              <span className="text-xs text-[#1E3A8A]">
                يتطلب هذا العدد ({universalExpReport.nBits} بت) تشغيل خيوط الخلفية لحسم الأس العام الكامل λ(N)
                {stopStage1OnUniversalExp ? ' مع إيقاف المرحلة 1 قبل العوامل.' : '.'}
              </span>
              <button
                onClick={handleUniversalExpClick}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#14532D] hover:bg-[#052E16] text-white whitespace-nowrap"
              >
                تشغيل وحسم λ(N) الآن
              </button>
            </div>
          )}

          <p className="text-xs text-[#57534E] leading-relaxed">{universalExpReport.explanationAr}</p>
        </div>
      )}

      {/* Classification & Result Card (Shown when factors are revealed / not halted at Stage 1) */}
      {finalClassification && !universalExpStage1Halted && (
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
                توليد الكتلة{' '}
                <MathFormula
                  tex={`\\mathcal{M}_{${finalClassification.blockPair.p},${finalClassification.blockPair.q}}`}
                  className="text-white mx-1"
                />{' '}
                ↗
              </button>
            )}
          </div>

          {activeFactors.length > 0 && (
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
              <div className="text-xs font-semibold text-[#14532D]">
                التفكيك الأولي المعتمد (حاصل الضرب يطابق N تماماً):
              </div>
              <div dir="ltr" className="font-mono-tabular text-sm font-bold text-[#1C1917] break-all">
                {nValue} ={' '}
                {finalClassification.exponents.map(e => (e.power > 1 ? `${e.prime}^${e.power}` : e.prime)).join(' × ')}
              </div>
              {chronosSolution?.method && (
                <div className="text-xs text-[#57534E] font-mono">
                  {chronosSolution.method} {chronosSolution.duration ? `(${chronosSolution.duration} ms)` : ''}
                </div>
              )}
            </div>
          )}

          {/* Step-by-step Quick Trace */}
          {quickResult && quickResult.steps.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#1C1917]">سجل خطوات الخوارزمية الأولية:</div>
              <div className="divide-y divide-[#EAE5DA] border border-[#E2DDD2] rounded-lg bg-[#FBF9F5]">
                {quickResult.steps.map((st, idx) => (
                  <div
                    key={idx}
                    className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#1E3A8A] shrink-0" dir="ltr">
                        [{st.stage}]
                      </span>
                      <span className="text-[#1C1917]">{st.detailAr}</span>
                    </div>
                    <span className="font-mono-tabular text-[#57534E] shrink-0" dir="ltr">
                      {st.elapsedMs} ms
                    </span>
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
