import React, { useState, useMemo } from 'react';
import MathFormula from './MathFormula';
import {
  PSI_31_PRESETS,
  DEFAULT_PSI_ENERGY_PARAMS,
  PsiEnergyParams,
  PsiFactorResult,
  AlgorithmBenchmarkSnapshot,
  PSI_31_PYTHON_SUITE_CODE,
  computeWheelStats,
  runPsiFactor,
  runPsi31ComparisonForTarget,
  BOLTZMANN_K
} from '../lib/psiFactorEngine';
import {
  computePsiPhaseCancellation,
  preparePsiPhaseContext,
  PsiPhaseCancellationMetrics
} from '../lib/psiPhaseDiagnostics';

interface PsiFactorLabPanelProps {
  onFactorsRecovered?: (n: string, p: string, q: string, methodLabel: string, durationMs: number) => void;
  onEscalateToChronos?: (n: string) => void;
}

interface Psi31Row {
  presetId: string;
  labelAr: string;
  bits: number;
  balanced: boolean;
  n: string;
  sqrtApproxSci: string;
  entries: AlgorithmBenchmarkSnapshot[];
}

const WHEEL_OPTIONS: Array<{ id: string; label: string; primes: number[] }> = [
  { id: 'w30', label: 'W = 30 (2×3×5)', primes: [2, 3, 5] },
  { id: 'w210', label: 'W = 210 (2×3×5×7)', primes: [2, 3, 5, 7] },
  { id: 'w30030', label: 'W = 30030 (2×3×5×7×11×13)', primes: [2, 3, 5, 7, 11, 13] }
];

const formatSciJ = (joules: number): string => {
  if (!Number.isFinite(joules) || joules === 0) return '0.000e+0 J';
  return `${joules.toExponential(3)} J`;
};

const approxSqrtLabel = (bits: number): string => {
  const half = bits / 2;
  const exp10 = (half * Math.log10(2)).toFixed(1);
  return `2^${half} ≈ 10^${exp10}`;
};

export const PsiFactorLabPanel: React.FC<PsiFactorLabPanelProps> = ({
  onFactorsRecovered,
  onEscalateToChronos
}) => {
  const [subTab, setSubTab] = useState<'live' | 'psi31' | 'math' | 'python'>('live');
  const [nInput, setNInput] = useState<string>(PSI_31_PRESETS[2].n); // Default: 192b unbalanced Python ref
  const [psiMode, setPsiMode] = useState<'psi2-adaptive' | 'psi-hybrid'>('psi2-adaptive');
  const [wheelId, setWheelId] = useState<string>('w30030');
  const [energyParams, setEnergyParams] = useState<PsiEnergyParams>(DEFAULT_PSI_ENERGY_PARAMS);

  const [liveResult, setLiveResult] = useState<PsiFactorResult | null>(() =>
    runPsiFactor(BigInt(PSI_31_PRESETS[2].n), {
      mode: 'psi2-adaptive',
      wheelPrimes: [2, 3, 5, 7, 11, 13]
    })
  );
  const [inputError, setInputError] = useState<string | null>(null);

  // Ψ-3.1 Multi-size benchmark table state
  const [psi31Rows, setPsi31Rows] = useState<Psi31Row[]>([]);
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteProgress, setSuiteProgress] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Real-Time Ψ(δ) Phase Cancellation Diagnostics + Zeta Zero Scaling Factor Slider
  const [zetaZeroScale, setZetaZeroScale] = useState<number>(1.0);
  const [deltaProbe, setDeltaProbe] = useState<number>(0.0);
  const [diagZeroCount, setDiagZeroCount] = useState<number>(48);

  const activeWheel = useMemo(
    () => WHEEL_OPTIONS.find(w => w.id === wheelId) ?? WHEEL_OPTIONS[2],
    [wheelId]
  );

  const wheelStats = useMemo(() => computeWheelStats(activeWheel.primes), [activeWheel]);

  const preparedPhaseCtx = useMemo(() => {
    const clean = nInput.replace(/[^0-9]/g, '');
    try {
      const nBig = clean ? BigInt(clean) : BigInt(PSI_31_PRESETS[2].n);
      return preparePsiPhaseContext(nBig < 2n ? 2n : nBig, diagZeroCount);
    } catch {
      return preparePsiPhaseContext(BigInt(PSI_31_PRESETS[2].n), diagZeroCount);
    }
  }, [nInput, diagZeroCount]);

  const phaseDiagnostics: PsiPhaseCancellationMetrics = useMemo(
    () => computePsiPhaseCancellation(preparedPhaseCtx, zetaZeroScale, deltaProbe),
    [preparedPhaseCtx, zetaZeroScale, deltaProbe]
  );

  const handleRunLive = (overrideN?: string) => {
    const clean = (overrideN ?? nInput).replace(/[^0-9]/g, '');
    if (!clean) {
      setInputError('يرجى إدخال عدد صحيح موجب N ≥ 2.');
      return;
    }
    try {
      const nBig = BigInt(clean);
      if (nBig < 2n) {
        setInputError('يجب أن يكون العدد N ≥ 2.');
        return;
      }
      setInputError(null);
      if (overrideN !== undefined) setNInput(clean);

      const res = runPsiFactor(nBig, {
        mode: psiMode,
        wheelPrimes: activeWheel.primes,
        wheelLimit: 100000,
        fermatLimit: 2500,
        rhoIterLimit: 320000,
        allowCfracFallback: psiMode === 'psi2-adaptive',
        energyParams
      });
      setLiveResult(res);

      if (res.status === 'FACTORS_VERIFIED' && res.factors.length >= 2 && onFactorsRecovered) {
        const f0 = res.factors[0];
        const other = (nBig / BigInt(f0)).toString();
        onFactorsRecovered(clean, f0, other, `Ψ-Factor (${res.winningStage})`, Math.round(res.elapsedMs));
      }
    } catch (e: any) {
      setInputError(e?.message || 'تعذر قراءة العدد المدخل.');
    }
  };

  const handleRunPsi31Suite = async () => {
    setIsRunningSuite(true);
    const out: Psi31Row[] = [];

    for (const preset of PSI_31_PRESETS) {
      setSuiteProgress(`جارٍ تنفيذ مقارنة Ψ-3.1 على ${preset.labelAr}...`);
      await new Promise(r => setTimeout(r, 20));
      const nBig = BigInt(preset.n);
      const entries = runPsi31ComparisonForTarget(nBig, activeWheel.primes, energyParams);
      out.push({
        presetId: preset.id,
        labelAr: preset.labelAr,
        bits: preset.bits,
        balanced: preset.balanced,
        n: preset.n,
        sqrtApproxSci: approxSqrtLabel(preset.bits),
        entries
      });
      setPsi31Rows([...out]);
    }

    setSuiteProgress(null);
    setIsRunningSuite(false);
  };

  const handleCopySuiteCode = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(PSI_31_PYTHON_SUITE_CODE).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1600);
  };

  const landauerPerBit = BOLTZMANN_K * energyParams.temperatureK * Math.LN2;

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-[#1E3A8A]">
            Ψ-Factor & Ψ-2 Adaptive · Multi-Size Hybrid Factorization & Energy Model (Ψ-3.1)
          </div>
          <h3 className="text-lg md:text-xl font-bold font-serif-academic text-[#1C1917]">
            مختبر خوارزمية Ψ-Factor وتجارب الأعداد المتوازنة (32–256 بت)
          </h3>
          <p className="text-xs text-[#57534E] leading-relaxed max-w-4xl">
            يجمع بين استخلاص الأوليات الصغيرة، الغربلة المعيارية{' '}
            <MathFormula tex="W = \prod p,\ \rho(W) = \varphi(W)/W" className="mx-1" />، تناظر فيرما المحدود، و{' '}
            <span className="font-mono text-[11px]">Pollard-Brent Rho</span>، مع عدادات عمليات دقيقة ونموذج استهلاك الطاقة المقارن بحد لانداور{' '}
            <MathFormula tex="E_{\min} = k_B T \ln 2" className="mx-1" />.
          </p>
        </div>

        {/* Sub-navigation */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F0E8] rounded-xl border border-[#E2DDD2] shrink-0">
          {([
            { id: 'live', label: 'التحليل الحي Ψ-Factor' },
            { id: 'psi31', label: 'برنامج تجارب Ψ-3.1 (كل الأحجام)' },
            { id: 'math', label: 'معادلات الغربلة والطاقة' },
            { id: 'python', label: 'تصدير Python المرجعي' }
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

      {/* SECTION 1: LIVE Ψ-FACTOR ANALYZER */}
      {subTab === 'live' && (
        <div className="space-y-5">
          {/* Presets across all bit sizes */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-[#1C1917]">
              حالات الاختبار المرجعية (غير متوازن 192 بت + متوازن 32 / 64 / 128 / 192 / 256 بت):
            </div>
            <div className="flex flex-wrap gap-2">
              {PSI_31_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleRunLive(p.n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    nInput === p.n
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-[#F4F0E8] border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917]'
                  }`}
                >
                  {p.labelAr}
                </button>
              ))}
            </div>
          </div>

          {/* Input + Config Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-4">
            <div className="lg:col-span-6 space-y-1.5">
              <label className="text-xs font-bold text-[#1C1917] block">العدد الصحيح N للتحليل عبر Ψ-Factor</label>
              <textarea
                dir="ltr"
                rows={2}
                value={nInput}
                onChange={e => setNInput(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-white border border-[#E2DDD2] font-mono-tabular text-xs text-[#1C1917] resize-none focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="lg:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-[#1C1917] block">وضع الخوارزمية</label>
              <select
                value={psiMode}
                onChange={e => setPsiMode(e.target.value as 'psi2-adaptive' | 'psi-hybrid')}
                className="w-full px-2.5 py-2 rounded-lg bg-white border border-[#E2DDD2] text-xs text-[#1C1917]"
              >
                <option value="psi2-adaptive">Ψ-2 التكيفية (+ تصعيد CFRAC/p-1)</option>
                <option value="psi-hybrid">Ψ-Factor القياسية (المراحل 1–4 فقط)</option>
              </select>

              <label className="text-xs font-bold text-[#1C1917] block pt-1">عجلة الغربلة Wheel</label>
              <select
                value={wheelId}
                onChange={e => setWheelId(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-white border border-[#E2DDD2] font-mono text-xs text-[#1C1917]"
              >
                {WHEEL_OPTIONS.map(w => (
                  <option key={w.id} value={w.id}>{w.label}</option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-[#57534E] leading-relaxed bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                إزالة فورية لنسبة{' '}
                <span className="font-mono font-bold text-[#14532D]" dir="ltr">
                  {wheelStats.eliminatedPct.toFixed(2)}%
                </span>{' '}
                من المرشحين عبر <span className="font-mono" dir="ltr">W = {wheelStats.modulusW}</span>.
              </div>
              <button
                onClick={() => handleRunLive()}
                className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors"
              >
                تنفيذ التحليل وحساب الطاقة
              </button>
            </div>
          </div>

          {inputError && <div className="text-xs text-[#9A3412] font-medium">✖ {inputError}</div>}

          {/* Results Summary */}
          {liveResult && (
            <div className="border border-[#E2DDD2] rounded-xl p-5 bg-[#FBF9F5] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2DDD2] pb-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-mono text-[#1E3A8A]" dir="ltr">
                    {liveResult.bits}-bit · {liveResult.mode} · {liveResult.winningStage}
                  </div>
                  <div className={`text-sm font-bold ${
                    liveResult.status === 'FACTORS_VERIFIED'
                      ? 'text-[#14532D]'
                      : liveResult.status === 'PRIME_RESIDUAL'
                      ? 'text-[#1E3A8A]'
                      : 'text-[#9A3412]'
                  }`}>
                    {liveResult.status === 'FACTORS_VERIFIED'
                      ? 'تم استخراج العوامل والتحقق التام من جدائها (PASS)'
                      : liveResult.status === 'PRIME_RESIDUAL'
                      ? 'اجتاز العدد اختبار Miller-Rabin (أولي محتمل)'
                      : 'غير حاسم ضمن الميزانية المحلية (INCONCLUSIVE — لا يُعلن أولياً)'}
                  </div>
                </div>

                {liveResult.status === 'INCONCLUSIVE_BUDGET' && onEscalateToChronos && (
                  <button
                    onClick={() => onEscalateToChronos(liveResult.n)}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-[#14532D] hover:bg-[#052E16] text-white transition-colors shrink-0"
                  >
                    تصعيد إلى Chronos v4 (SIQS / ECM المتوازي) ↗
                  </button>
                )}
              </div>

              {/* Factored Output */}
              {liveResult.status === 'FACTORS_VERIFIED' && (
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-3.5 space-y-1.5">
                  <div className="text-xs font-semibold text-[#14532D]">
                    التحليل الأولي المعتمد (حاصل الضرب يطابق N تماماً):
                  </div>
                  <div dir="ltr" className="font-mono-tabular text-xs sm:text-sm font-bold text-[#1C1917] break-all">
                    N = {liveResult.exponents.map(e => (e.power > 1 ? `${e.prime}^${e.power}` : e.prime)).join(' × ')}
                  </div>
                  <div className="flex flex-wrap gap-4 text-[11px] font-mono text-[#57534E]" dir="ltr">
                    <span>Product == N: {liveResult.verifiedProduct ? 'PASS' : 'FAIL'}</span>
                    <span>Miller-Rabin (16 rounds): {liveResult.allFactorsProbablePrime ? 'PASS (probable prime)' : 'FAIL'}</span>
                  </div>
                </div>
              )}

              {/* Operation Counters & Energy Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 font-mono-tabular text-xs" dir="ltr">
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">Elapsed Time</div>
                  <div className="font-bold text-[#1C1917]">{liveResult.elapsedMs} ms</div>
                </div>
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">Total Ops</div>
                  <div className="font-bold text-[#1C1917]">{liveResult.totalOperations.toLocaleString()}</div>
                </div>
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">Modeled Energy E(N)</div>
                  <div className="font-bold text-[#1E3A8A]">{formatSciJ(liveResult.estimatedEnergyJ)}</div>
                </div>
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">ModMul / ModRed</div>
                  <div className="font-bold text-[#1C1917]">
                    {liveResult.counters.modularMultiplies.toLocaleString()} / {liveResult.counters.modularReductions.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">GCD / Wheel</div>
                  <div className="font-bold text-[#1C1917]">
                    {liveResult.counters.gcdCalls.toLocaleString()} / {liveResult.counters.wheelCandidates.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">Fermat / Rho</div>
                  <div className="font-bold text-[#1C1917]">
                    {liveResult.counters.fermatSteps.toLocaleString()} / {liveResult.counters.rhoIterations.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stage Breakdown Table */}
              <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-[#F4F0E8] text-[#1C1917] border-b border-[#E2DDD2]">
                    <tr>
                      <th className="py-2 px-3 text-right">المرحلة</th>
                      <th className="py-2 px-3 text-right">الوصف</th>
                      <th className="py-2 px-3 text-left" dir="ltr">Steps</th>
                      <th className="py-2 px-3 text-left" dir="ltr">Time (ms)</th>
                      <th className="py-2 px-3 text-left" dir="ltr">Outcome</th>
                      <th className="py-2 px-3 text-right">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAE5DA]">
                    {liveResult.stages.map((st, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono font-bold text-[#1E3A8A] whitespace-nowrap" dir="ltr">{st.stage}</td>
                        <td className="py-2 px-3 font-medium text-[#1C1917]">{st.titleAr}</td>
                        <td className="py-2 px-3 font-mono-tabular" dir="ltr">{st.stepsUsed.toLocaleString()}</td>
                        <td className="py-2 px-3 font-mono-tabular" dir="ltr">{st.elapsedMs}</td>
                        <td className={`py-2 px-3 font-mono font-bold whitespace-nowrap ${
                          st.status === 'FACTOR_FOUND' ? 'text-[#14532D]' : 'text-[#57534E]'
                        }`} dir="ltr">
                          {st.status}
                        </td>
                        <td className="py-2 px-3 text-[#57534E]">{st.noteAr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-[11px] text-[#57534E] leading-relaxed">
                <strong>تنبيه علمي:</strong> استهلاك الطاقة المعروض هو تقدير حسابي مبني على أوزان العمليات (<span className="font-mono" dir="ltr">{formatSciJ(energyParams.eModMul)}/modmul, {formatSciJ(energyParams.eGcd)}/gcd</span>) وليس قراءة كهربائية مباشرة من المعالج. كما أن نجاح تجربة <span className="font-mono" dir="ltr">192-bit</span> غير المتوازنة (<span className="font-mono" dir="ltr">33b × 160b</span>) يعتمد على وجود عامل صغير نسبياً ولا يعني سهولة تفكيك <span className="font-mono" dir="ltr">192-bit</span> متوازن (<span className="font-mono" dir="ltr">96b × 96b</span>).
              </div>
            </div>
          )}

          {/* Real-Time Ψ(δ) Phase Cancellation Diagnostic Panel */}
          <div className="border border-[#E2DDD2] rounded-xl p-5 bg-[#FBF9F5] space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E2DDD2] pb-3.5">
              <div className="space-y-1">
                <div className="text-xs font-mono text-[#1E3A8A]">
                  لوحة تشخيص الإلغاء الطوري الفوري · Real-Time Ψ(δ) Phase Cancellation Diagnostics
                </div>
                <h4 className="text-base font-bold font-serif-academic text-[#1C1917]">
                  مقاييس التداخل والإلغاء الطوري لدالة <span dir="ltr" className="font-mono">Ψ(δ)</span> وتدريج أصفار زيتا
                </h4>
                <p className="text-[11px] text-[#57534E]">
                  اختزال الطور بدقة 530 خانة{' '}
                  <MathFormula
                    tex="\theta_k(\delta) = \big((s \cdot \gamma_k \ln\sqrt{N} - \phi_k)\bmod 2\pi\big) + (s \cdot \gamma_k)\delta"
                    className="mx-1"
                  />{' '}
                  مع قياس نسبة الإلغاء الهدام والتماسك الطوري لحظياً عند تحريك معامل التدريج <span dir="ltr" className="font-mono">s</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold text-[#57534E]">عدد الأصفار K:</span>
                {[16, 32, 48, 96].map(kVal => (
                  <button
                    key={kVal}
                    type="button"
                    onClick={() => setDiagZeroCount(kVal)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border transition-colors ${
                      diagZeroCount === kVal
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-white border-[#E2DDD2] text-[#1C1917] hover:border-[#1E3A8A]'
                    }`}
                  >
                    {kVal}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders Row: Zeta Zeros Scaling Factor + Delta Probe */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="zeta-scale-slider" className="text-xs font-bold text-[#1C1917]">
                    معامل تدريج أصفار زيتا (<span dir="ltr" className="font-mono">s · γₙ</span>)
                  </label>
                  <div className="flex items-center gap-2" dir="ltr">
                    <span className="px-2 py-0.5 rounded bg-[#1E3A8A]/10 text-[#1E3A8A] font-mono font-bold text-xs">
                      s = {zetaZeroScale.toFixed(2)}×
                    </span>
                    <button
                      type="button"
                      onClick={() => setZetaZeroScale(1.0)}
                      className="px-2 py-0.5 rounded border border-[#E2DDD2] text-[11px] font-mono text-[#57534E] hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
                    >
                      1.00× (إعادة ضبط)
                    </button>
                  </div>
                </div>
                <input
                  id="zeta-scale-slider"
                  type="range"
                  min={0.25}
                  max={2.5}
                  step={0.01}
                  value={zetaZeroScale}
                  onChange={e => setZetaZeroScale(Number(e.target.value))}
                  className="w-full accent-[#1E3A8A] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#57534E]" dir="ltr">
                  <span>0.25× (compressed)</span>
                  <span>1.00× (canonical γₙ)</span>
                  <span>2.50× (stretched)</span>
                </div>
              </div>

              <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="delta-probe-slider" className="text-xs font-bold text-[#1C1917]">
                    موضع الفحص اللوغاريتمي (<span dir="ltr" className="font-mono">δ</span>)
                  </label>
                  <div className="flex items-center gap-2" dir="ltr">
                    <span className="px-2 py-0.5 rounded bg-[#14532D]/10 text-[#14532D] font-mono font-bold text-xs">
                      δ = {deltaProbe.toFixed(3)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeltaProbe(phaseDiagnostics.peakDelta)}
                      className="px-2 py-0.5 rounded bg-[#14532D] text-white text-[11px] font-mono hover:bg-[#166534]"
                    >
                      قفز للذروة δ* ({phaseDiagnostics.peakDelta.toFixed(3)})
                    </button>
                  </div>
                </div>
                <input
                  id="delta-probe-slider"
                  type="range"
                  min={-1.0}
                  max={0.05}
                  step={0.005}
                  value={deltaProbe}
                  onChange={e => setDeltaProbe(Number(e.target.value))}
                  className="w-full accent-[#14532D] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#57534E]" dir="ltr">
                  <span>δ = -1.000 (skewed p &lt;&lt; √N)</span>
                  <span>δ = 0.000 (balanced √N)</span>
                  <span>+0.050</span>
                </div>
              </div>
            </div>

            {/* Real-Time Phase Cancellation Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono-tabular text-xs" dir="ltr">
              <div className="bg-white border border-[#E2DDD2] rounded-lg p-3">
                <div className="text-[10px] text-[#57534E]">Phase Cancellation κ</div>
                <div className={`text-sm font-bold ${phaseDiagnostics.cancellationPct >= 70 ? 'text-[#9A3412]' : 'text-[#14532D]'}`}>
                  {phaseDiagnostics.cancellationPct.toFixed(2)}%
                </div>
                <div className="text-[10px] text-[#57534E]">1 − |Ψ(δ)| / E_max</div>
              </div>

              <div className="bg-white border border-[#E2DDD2] rounded-lg p-3">
                <div className="text-[10px] text-[#57534E]">Ψ(δ) Coherent Sum</div>
                <div className="text-sm font-bold text-[#1E3A8A]">
                  {phaseDiagnostics.psiValue >= 0 ? '+' : ''}
                  {phaseDiagnostics.psiValue.toFixed(5)}
                </div>
                <div className="text-[10px] text-[#57534E]">Envelope E_max: {phaseDiagnostics.constructiveEnvelope.toFixed(4)}</div>
              </div>

              <div className="bg-white border border-[#E2DDD2] rounded-lg p-3">
                <div className="text-[10px] text-[#57534E]">Phasor Coherence R(δ)</div>
                <div className="text-sm font-bold text-[#1C1917]">
                  {(phaseDiagnostics.phasorCoherenceR * 100).toFixed(2)}%
                </div>
                <div className="text-[10px] text-[#57534E]">|∑ wₖ e^(iθₖ)| / ∑ wₖ</div>
              </div>

              <div className="bg-white border border-[#E2DDD2] rounded-lg p-3">
                <div className="text-[10px] text-[#57534E]">Constructive vs Destructive</div>
                <div className="text-sm font-bold text-[#1C1917]">
                  <span className="text-[#14532D]">+{phaseDiagnostics.constructiveCount}</span>
                  {' / '}
                  <span className="text-[#9A3412]">−{phaseDiagnostics.destructiveCount}</span>
                </div>
                <div className="text-[10px] text-[#57534E]">Net imbalance: {phaseDiagnostics.netBalancePct.toFixed(1)}%</div>
              </div>

              <div className="bg-white border border-[#E2DDD2] rounded-lg p-3">
                <div className="text-[10px] text-[#57534E]">Peak δ* (Min Cancel)</div>
                <div className="text-sm font-bold text-[#14532D]">
                  {phaseDiagnostics.peakDelta.toFixed(4)}
                </div>
                <div className="text-[10px] text-[#57534E]">Cancel@δ*: {phaseDiagnostics.peakCancellationPct.toFixed(1)}%</div>
              </div>

              <div className="bg-white border border-[#E2DDD2] rounded-lg p-3">
                <div className="text-[10px] text-[#57534E]">Candidate p_seed(δ*)</div>
                <div className="text-xs font-bold text-[#1E3A8A] truncate" title={phaseDiagnostics.candidatePSeed}>
                  {phaseDiagnostics.candidatePSeed.length > 16
                    ? `${phaseDiagnostics.candidatePSeed.slice(0, 8)}...${phaseDiagnostics.candidatePSeed.slice(-6)}`
                    : phaseDiagnostics.candidatePSeed}
                </div>
                <div className="text-[10px] text-[#57534E]">{phaseDiagnostics.nBits}-bit N · K={phaseDiagnostics.zeroCount}</div>
              </div>
            </div>

            {/* Waveform & Phasor Cancellation Visualizers */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Ψ(δ) Sweep Waveform */}
              <div className="lg:col-span-8 bg-white border border-[#E2DDD2] rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#1C1917]">
                    منحنى <span dir="ltr" className="font-mono">Ψ(δ)</span> عبر <span dir="ltr" className="font-mono">δ ∈ [-1.00, +0.05]</span>
                  </span>
                  <span className="text-[11px] font-mono text-[#57534E]" dir="ltr">
                    Peak |Ψ| = {Math.abs(phaseDiagnostics.peakPsiValue).toFixed(5)} @ δ*={phaseDiagnostics.peakDelta.toFixed(3)}
                  </span>
                </div>
                {(() => {
                  const W = 560;
                  const H = 148;
                  const padX = 24;
                  const padY = 14;
                  const pts = phaseDiagnostics.profile;
                  const maxAmp = Math.max(
                    0.01,
                    ...pts.map(p => Math.abs(p.psiValue))
                  );
                  const mapX = (d: number) =>
                    padX + ((d - -1.0) / 1.05) * (W - 2 * padX);
                  const mapY = (v: number) =>
                    H / 2 - (v / maxAmp) * (H / 2 - padY);
                  const polyPts = pts
                    .map(p => `${mapX(p.delta).toFixed(1)},${mapY(p.psiValue).toFixed(1)}`)
                    .join(' ');
                  const probeX = mapX(deltaProbe);
                  const probeY = mapY(phaseDiagnostics.psiValue);
                  const peakX = mapX(phaseDiagnostics.peakDelta);

                  return (
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36 bg-[#FBF9F5] rounded-lg border border-[#EAE5DA]">
                      <line x1={padX} y1={H / 2} x2={W - padX} y2={H / 2} stroke="#D6D1C7" strokeDasharray="3 3" strokeWidth="1" />
                      <line x1={peakX} y1={padY} x2={peakX} y2={H - padY} stroke="#14532D" strokeDasharray="4 3" strokeWidth="1.2" />
                      <line x1={probeX} y1={padY} x2={probeX} y2={H - padY} stroke="#1E3A8A" strokeWidth="1.2" />
                      <polyline fill="none" stroke="#1E3A8A" strokeWidth="2" points={polyPts} />
                      <circle cx={probeX} cy={probeY} r="4.5" fill="#1E3A8A" stroke="#FFFFFF" strokeWidth="1.5" />
                      <text x={peakX + 4} y={padY + 9} fontSize="9" fill="#14532D" fontFamily="monospace">
                        δ*
                      </text>
                      <text x={probeX + 4} y={H - 6} fontSize="9" fill="#1E3A8A" fontFamily="monospace">
                        δ={deltaProbe.toFixed(2)}
                      </text>
                    </svg>
                  );
                })()}
              </div>

              {/* Unit-Circle Phasor Interference Plot */}
              <div className="lg:col-span-4 bg-white border border-[#E2DDD2] rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#1C1917]">مخطط المتجهات الطورية</span>
                  <span className="text-[11px] font-mono text-[#57534E]" dir="ltr">
                    R = {(phaseDiagnostics.phasorCoherenceR * 100).toFixed(1)}%
                  </span>
                </div>
                {(() => {
                  const S = 156;
                  const C = S / 2;
                  const R = 58;
                  const maxW = Math.max(1e-6, phaseDiagnostics.perZero[0]?.weight || 0.08);
                  let rx = 0;
                  let ry = 0;
                  phaseDiagnostics.perZero.forEach(z => {
                    rx += z.weight * z.cosTheta;
                    ry += z.weight * z.sinTheta;
                  });
                  const env = phaseDiagnostics.constructiveEnvelope || 1;
                  const netX = C + (rx / env) * R;
                  const netY = C - (ry / env) * R;

                  return (
                    <svg viewBox={`0 0 ${S} ${S}`} className="w-full h-36 bg-[#FBF9F5] rounded-lg border border-[#EAE5DA]">
                      <circle cx={C} cy={C} r={R} fill="none" stroke="#D6D1C7" strokeWidth="1" />
                      <line x1={C - R - 6} y1={C} x2={C + R + 6} y2={C} stroke="#EAE5DA" strokeWidth="1" />
                      <line x1={C} y1={C - R - 6} x2={C} y2={C + R + 6} stroke="#EAE5DA" strokeWidth="1" />
                      {phaseDiagnostics.perZero.slice(0, 24).map(z => {
                        const len = (z.weight / maxW) * (R * 0.85);
                        const px = C + len * z.cosTheta;
                        const py = C - len * z.sinTheta;
                        return (
                          <line
                            key={z.index}
                            x1={C}
                            y1={C}
                            x2={px}
                            y2={py}
                            stroke={z.polarity === 'constructive' ? '#14532D' : '#9A3412'}
                            strokeOpacity={0.45}
                            strokeWidth="1.2"
                          />
                        );
                      })}
                      <line x1={C} y1={C} x2={netX} y2={netY} stroke="#1E3A8A" strokeWidth="2.5" />
                      <circle cx={netX} cy={netY} r="3.5" fill="#1E3A8A" />
                    </svg>
                  );
                })()}
              </div>
            </div>

            {/* Per-Zero Phase Contributions (Top 12 Zeros) */}
            <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg bg-white" dir="ltr">
              <table className="w-full text-left text-[11px] font-mono-tabular">
                <thead className="bg-[#F4F0E8] text-[#57534E] border-b border-[#E2DDD2]">
                  <tr>
                    <th className="py-1.5 px-3">Zero #</th>
                    <th className="py-1.5 px-3">Base γₙ</th>
                    <th className="py-1.5 px-3">Scaled (s·γₙ)</th>
                    <th className="py-1.5 px-3">θₙ(δ) mod 2π</th>
                    <th className="py-1.5 px-3">cos θₙ</th>
                    <th className="py-1.5 px-3">Term (−wₙ cos θₙ)</th>
                    <th className="py-1.5 px-3">Interference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE5DA]">
                  {phaseDiagnostics.perZero.slice(0, 12).map(z => (
                    <tr key={z.index}>
                      <td className="py-1.5 px-3 font-bold text-[#1E3A8A]">γ_{z.index}</td>
                      <td className="py-1.5 px-3 text-[#57534E]">{z.gammaBase.toFixed(6)}</td>
                      <td className="py-1.5 px-3 font-bold text-[#1C1917]">{z.gammaScaled.toFixed(6)}</td>
                      <td className="py-1.5 px-3 text-[#1C1917]">{z.thetaRad.toFixed(5)} rad</td>
                      <td className="py-1.5 px-3 text-[#1C1917]">{z.cosTheta.toFixed(5)}</td>
                      <td className={`py-1.5 px-3 font-bold ${z.contribution >= 0 ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                        {z.contribution >= 0 ? '+' : ''}
                        {z.contribution.toFixed(6)}
                      </td>
                      <td className={`py-1.5 px-3 font-bold ${z.polarity === 'constructive' ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                        {z.polarity === 'constructive' ? 'Constructive' : 'Destructive'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Ψ-3.1 MULTI-SIZE BENCHMARK SUITE */}
      {subTab === 'psi31' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-[#1C1917]">
                مقارنة الخوارزميات عبر كل الأحجام (32 / 64 / 128 / 192 / 256 بت + المرجع 192 بت غير المتوازن)
              </div>
              <div className="text-[11px] text-[#57534E]">
                تقارن بين القوة الغاشمة التقليدية، والغربلة المعيارية <span className="font-mono" dir="ltr">W={wheelStats.modulusW}</span>، و <span className="font-mono" dir="ltr">Ψ-Factor</span>، و <span className="font-mono" dir="ltr">Pollard-Brent Rho</span>، و <span className="font-mono" dir="ltr">Ψ-2</span> التكيفية.
              </div>
            </div>
            <button
              onClick={handleRunPsi31Suite}
              disabled={isRunningSuite}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors disabled:opacity-50"
            >
              {isRunningSuite ? 'جارٍ تشغيل اختبارات Ψ-3.1...' : 'تشغيل برنامج تجارب Ψ-3.1 (كل الأحجام)'}
            </button>
          </div>

          {suiteProgress && (
            <div className="text-xs font-medium text-[#1E3A8A] bg-[#F4F0E8] border border-[#E2DDD2] rounded-lg px-4 py-2">
              {suiteProgress}
            </div>
          )}

          {/* Presets Matrix Table */}
          <div className="space-y-4">
            {(psi31Rows.length > 0 ? psi31Rows : PSI_31_PRESETS.map(p => ({
              presetId: p.id,
              labelAr: p.labelAr,
              bits: p.bits,
              balanced: p.balanced,
              n: p.n,
              sqrtApproxSci: approxSqrtLabel(p.bits),
              entries: [] as AlgorithmBenchmarkSnapshot[]
            }))).map(row => (
              <div key={row.presetId} className="border border-[#E2DDD2] rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-3 bg-[#F4F0E8] border-b border-[#E2DDD2] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#1C1917]">{row.labelAr}</span>
                    <span className="text-[11px] font-mono text-[#57534E]" dir="ltr">
                      √N ≈ {row.sqrtApproxSci}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono-tabular text-[#57534E]" dir="ltr">
                      N = {row.n.length > 28 ? `${row.n.slice(0, 12)}…${row.n.slice(-8)}` : row.n}
                    </span>
                    {onEscalateToChronos && row.bits >= 128 && row.balanced && (
                      <button
                        onClick={() => onEscalateToChronos(row.n)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A]"
                      >
                        اختبار في Chronos SIQS/ECM ↗
                      </button>
                    )}
                  </div>
                </div>

                {row.entries.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#FBF9F5] text-[#57534E] border-b border-[#E2DDD2]">
                        <tr>
                          <th className="py-2 px-3 text-right">الخوارزمية</th>
                          <th className="py-2 px-3 text-left" dir="ltr">Status</th>
                          <th className="py-2 px-3 text-left" dir="ltr">Operations</th>
                          <th className="py-2 px-3 text-left" dir="ltr">Est. Energy</th>
                          <th className="py-2 px-3 text-left" dir="ltr">Time (ms)</th>
                          <th className="py-2 px-3 text-left" dir="ltr">Factors / Budget Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAE5DA]">
                        {row.entries.map(e => (
                          <tr key={e.algorithmId}>
                            <td className="py-2 px-3 font-medium text-[#1C1917]">{e.labelAr}</td>
                            <td className={`py-2 px-3 font-mono font-bold whitespace-nowrap ${
                              e.status === 'FACTORS_VERIFIED' ? 'text-[#14532D]' : 'text-[#9A3412]'
                            }`} dir="ltr">
                              {e.status === 'FACTORS_VERIFIED' ? 'PASS' : 'BUDGET_CAP'}
                            </td>
                            <td className="py-2 px-3 font-mono-tabular" dir="ltr">{e.totalOperations.toLocaleString()}</td>
                            <td className="py-2 px-3 font-mono-tabular" dir="ltr">{formatSciJ(e.estimatedEnergyJ)}</td>
                            <td className="py-2 px-3 font-mono-tabular" dir="ltr">{e.elapsedMs} ms</td>
                            <td className="py-2 px-3 font-mono-tabular text-[11px] text-[#57534E]" dir="ltr">
                              {e.factorsSummary}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-4 py-3 text-xs text-[#57534E]">
                    اضغط «تشغيل برنامج تجارب Ψ-3.1» لتنفيذ المقارنة الفعلية لهذا الحجم.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: MATHEMATICAL MODEL, WHEEL & ENERGY */}
      {subTab === 'math' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-[#E2DDD2] rounded-xl p-4 bg-[#FBF9F5] space-y-3">
              <div className="text-xs font-bold text-[#1E3A8A]">1. الغربلة المعيارية متعددة الطبقات (Wheel Modulus)</div>
              <MathFormula
                display
                tex="W = \prod_{p \in P_B} p,\qquad R_W = \{r \in [1, W] : \gcd(r, W) = 1\},\qquad \rho(W) = \frac{\varphi(W)}{W} = \prod_{p \mid W}\left(1 - \frac{1}{p}\right)"
              />
              <div className="flex flex-wrap gap-2">
                {WHEEL_OPTIONS.map(w => (
                  <button
                    key={w.id}
                    onClick={() => setWheelId(w.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${
                      wheelId === w.id
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-white border-[#E2DDD2] text-[#1C1917]'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono-tabular text-xs" dir="ltr">
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">φ(W) / W</div>
                  <div className="font-bold text-[#1C1917]">{wheelStats.phiW} / {wheelStats.modulusW}</div>
                </div>
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">Survival ρ(W)</div>
                  <div className="font-bold text-[#1E3A8A]">{wheelStats.survivalRatio.toFixed(4)}</div>
                </div>
                <div className="bg-white border border-[#E2DDD2] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#57534E]">Reduction</div>
                  <div className="font-bold text-[#14532D]">{wheelStats.eliminatedPct.toFixed(2)}%</div>
                </div>
              </div>
              <div className="text-[11px] font-mono text-[#57534E] bg-white border border-[#E2DDD2] rounded-lg p-2.5" dir="ltr">
                R_W sample (first 24): [{wheelStats.residuesSample.join(', ')}]
              </div>
            </div>

            <div className="border border-[#E2DDD2] rounded-xl p-4 bg-[#FBF9F5] space-y-3">
              <div className="text-xs font-bold text-[#1E3A8A]">2. نموذج الطاقة الهندسي وحدّ لانداور</div>
              <MathFormula
                display
                tex="E(N) = E_0 + C(N)e_c + M(N)e_m, \qquad E_{\min} = k_B T \ln 2"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono" dir="ltr">
                <label className="bg-white border border-[#E2DDD2] rounded-lg p-2 space-y-1">
                  <span className="text-[10px] text-[#57534E] block">E_modmul (J)</span>
                  <input
                    type="number"
                    step="1e-10"
                    value={energyParams.eModMul}
                    onChange={e => setEnergyParams(p => ({ ...p, eModMul: Number(e.target.value) || 0 }))}
                    className="w-full text-xs text-[#1C1917] outline-none"
                  />
                </label>
                <label className="bg-white border border-[#E2DDD2] rounded-lg p-2 space-y-1">
                  <span className="text-[10px] text-[#57534E] block">E_gcd (J)</span>
                  <input
                    type="number"
                    step="1e-10"
                    value={energyParams.eGcd}
                    onChange={e => setEnergyParams(p => ({ ...p, eGcd: Number(e.target.value) || 0 }))}
                    className="w-full text-xs text-[#1C1917] outline-none"
                  />
                </label>
                <label className="bg-white border border-[#E2DDD2] rounded-lg p-2 space-y-1">
                  <span className="text-[10px] text-[#57534E] block">Temp T (K)</span>
                  <input
                    type="number"
                    step="10"
                    min="1"
                    value={energyParams.temperatureK}
                    onChange={e => setEnergyParams(p => ({ ...p, temperatureK: Math.max(1, Number(e.target.value) || 300) }))}
                    className="w-full text-xs text-[#1C1917] outline-none"
                  />
                </label>
              </div>
              <div className="bg-white border border-[#E2DDD2] rounded-lg p-3 text-xs font-mono-tabular" dir="ltr">
                Landauer Limit at T={energyParams.temperatureK}K: <strong className="text-[#1E3A8A]">{landauerPerBit.toExponential(3)} J/bit</strong>
              </div>
              <p className="text-[11px] text-[#57534E] leading-relaxed">
                عند مضاعفة طول العدد من <span className="font-mono" dir="ltr">b</span> إلى <span className="font-mono" dir="ltr">2b</span> بت، فإن تكلفة البحث التقليدي تتضاعف بنسبة <MathFormula tex="C(2b)/C(b) \approx 2^{b/2}" className="mx-1" />، مما يجعل الخوارزميات دون الأسية (SIQS/GNFS) ضرورية للأعداد المتوازنة الكبيرة.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: PYTHON REFERENCE EXPORT */}
      {subTab === 'python' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-4">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-[#1C1917]">
                البرنامج التنفيذي المرفق: تجربة 192 بت القابلة لإعادة التنفيذ (<span className="font-mono" dir="ltr">psi_factor_192_experiment.py</span>)
              </div>
              <div className="text-[11px] text-[#57534E]">
                تم التحقق من عمله (`PASS`: 671,128 عملية · 0.000948 J تقديرية · 33b × 160b).
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/assets/aistudio/psi_factor_192_experiment_bcb3240e.py"
                download="psi_factor_192_experiment.py"
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors"
              >
                تحميل psi_factor_192_experiment.py ⬇
              </a>
              <button
                onClick={handleCopySuiteCode}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A]"
              >
                {copiedCode ? 'تم نسخ متجهات Ψ-3.1 ✓' : 'نسخ مصفوفة اختبارات Ψ-3.1'}
              </button>
            </div>
          </div>

          <pre
            dir="ltr"
            className="p-4 rounded-xl border border-[#E2DDD2] bg-[#FBF9F5] font-mono text-xs text-[#1C1917] overflow-x-auto leading-relaxed"
          >
            {PSI_31_PYTHON_SUITE_CODE}
          </pre>
        </div>
      )}
    </div>
  );
};

export default PsiFactorLabPanel;
