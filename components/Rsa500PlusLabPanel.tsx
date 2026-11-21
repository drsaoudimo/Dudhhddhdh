import React, { useState } from 'react';
import MathFormula from './MathFormula';
import {
  AutoExponentResult,
  BatchGcdResult,
  Benchmark500Row,
  BonehDurfeeResult,
  PYTHON_500PLUS_REFERENCE_SCRIPT,
  WienerAttackResult,
  autoComputePublicExponentForN,
  generateBatchGcdTestSet,
  generateBonehDurfeeRsa,
  generateSmoothFactorRsa,
  generateWeakWienerRsa,
  run500PlusSingleBenchmark,
  runBatchGcdAttack,
  runBonehDurfeeAttack,
  runWienerAttack
} from '../lib/rsa500PlusAttacks';
import { analyzeSnfsAndCadoParams } from '../snfsDetector';

interface Rsa500PlusLabPanelProps {
  currentN?: string;
  currentP?: string;
  currentQ?: string;
  onLaunchChronos?: (targetN: string) => void;
  onFactorsRecovered?: (n: string, p: string, q: string, method: string, durationMs: number) => void;
}

type LabSubTab = 'wiener-bd' | 'batch-gcd' | 'snfs-cado' | 'benchmarks-512-1024';

const parseBig = (raw: string): bigint => {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) throw new Error('حقل فارغ');
  if (s.startsWith('0x') || s.startsWith('0X')) return BigInt(s);
  return BigInt(s.replace(/[^0-9]/g, ''));
};

export const Rsa500PlusLabPanel: React.FC<Rsa500PlusLabPanelProps> = ({
  currentN = '',
  currentP = '',
  currentQ = '',
  onLaunchChronos,
  onFactorsRecovered
}) => {
  const [subTab, setSubTab] = useState<LabSubTab>('wiener-bd');

  // 1. Wiener & Boneh-Durfee state
  const [expBits, setExpBits] = useState<512 | 768 | 1024>(512);
  const [expMode, setExpMode] = useState<'wiener' | 'boneh-durfee'>('wiener');
  const [bdDelta, setBdDelta] = useState<number>(0.258);
  const [rsaNInput, setRsaNInput] = useState<string>('');
  const [rsaEInput, setRsaEInput] = useState<string>('');
  const [autoComputeE, setAutoComputeE] = useState<boolean>(true);
  const [hintPFactorInput, setHintPFactorInput] = useState<string>('');
  const [autoExpNotice, setAutoExpNotice] = useState<AutoExponentResult | null>(null);
  const lastGeneratedNRef = React.useRef<string>('');
  const autoTimerRef = React.useRef<number | null>(null);
  const [generatedDBits, setGeneratedDBits] = useState<number | null>(null);
  const [wienerRes, setWienerRes] = useState<WienerAttackResult | null>(null);
  const [bdRes, setBdRes] = useState<BonehDurfeeResult | null>(null);
  const [expRunning, setExpRunning] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  // 2. Batch GCD state
  const [batchBits, setBatchBits] = useState<512 | 768 | 1024>(1024);
  const [batchText, setBatchText] = useState<string>('');
  const [batchRes, setBatchRes] = useState<BatchGcdResult | null>(null);

  // 3. SNFS + CADO-NFS & Smoothness Export state
  const [snfsTargetInput, setSnfsTargetInput] = useState<string>(() => ((1n << 770n) + 1n).toString());
  const [snfsPresetLabel, setSnfsPresetLabel] = useState<string>('2^770 + 1 (Aurifeuillean 771-bit)');
  const [copiedCode, setCopiedCode] = useState<'cado' | 'poly' | 'py' | null>(null);

  // 4. 512-1024b Benchmarks state
  const [benchRounds, setBenchRounds] = useState<3 | 5>(3);
  const [benchRows, setBenchRows] = useState<Benchmark500Row[]>([]);
  const [benchRunningId, setBenchRunningId] = useState<string | null>(null);

  // Ensure initial key is ready when panel mounts
  React.useEffect(() => {
    if (!rsaNInput) {
      const k = generateWeakWienerRsa(512);
      lastGeneratedNRef.current = k.n;
      setRsaNInput(k.n);
      setRsaEInput(k.e);
      setGeneratedDBits(k.dBits);
    }
    if (!batchText) {
      const batch = generateBatchGcdTestSet(1024, 12);
      setBatchText(batch.map(x => x.n).join('\n'));
    }
    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computeAutoEForInputs = (
    rawN: string,
    mode: 'wiener' | 'boneh-durfee' | 'standard' = expMode,
    rawHintP: string = hintPFactorInput
  ): AutoExponentResult | null => {
    try {
      const N = parseBig(rawN);
      if (N < 15n) return null;
      let hintP: bigint | undefined;
      let hintQ: bigint | undefined;
      if (rawHintP.trim()) {
        try {
          const parsedP = parseBig(rawHintP);
          if (parsedP > 1n && parsedP < N && N % parsedP === 0n) {
            hintP = parsedP;
            hintQ = N / parsedP;
          }
        } catch {}
      } else if (currentN && rawN.replace(/[^0-9]/g, '') === currentN.replace(/[^0-9]/g, '') && currentP && currentQ) {
        try {
          hintP = BigInt(currentP);
          hintQ = BigInt(currentQ);
        } catch {}
      }
      const res = autoComputePublicExponentForN(N, mode, bdDelta, hintP, hintQ);
      setRsaEInput(res.e);
      setGeneratedDBits(res.dBits);
      setAutoExpNotice(res);
      setExpError(null);
      return res;
    } catch {
      return null;
    }
  };

  const handleManualRsaNChange = (nextN: string) => {
    setRsaNInput(nextN);
    setWienerRes(null);
    setBdRes(null);
    setExpError(null);
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    const cleaned = nextN.trim().replace(/\s+/g, '');
    if (!autoComputeE || !cleaned || cleaned === lastGeneratedNRef.current) return;
    autoTimerRef.current = window.setTimeout(() => {
      computeAutoEForInputs(nextN, expMode, hintPFactorInput);
    }, 240);
  };

  const handleGenExpKey = (bits = expBits, mode = expMode) => {
    setExpError(null);
    setWienerRes(null);
    setBdRes(null);
    setAutoExpNotice(null);
    setHintPFactorInput('');
    const k = mode === 'wiener'
      ? generateWeakWienerRsa(bits)
      : generateBonehDurfeeRsa(bits, bdDelta);
    lastGeneratedNRef.current = k.n;
    setRsaNInput(k.n);
    setRsaEInput(k.e);
    setGeneratedDBits(k.dBits);
  };

  const handleRunExpAttack = () => {
    setExpError(null);
    setExpRunning(true);
    setTimeout(() => {
      try {
        const N = parseBig(rsaNInput);
        let eStr = rsaEInput.trim();
        if (!eStr && autoComputeE) {
          const computed = computeAutoEForInputs(rsaNInput, expMode, hintPFactorInput);
          if (computed) eStr = computed.e;
        }
        const e = parseBig(eStr);
        if (N < 15n || e < 3n) throw new Error('يرجى إدخال قيم صالحة للمودول N والأس العام e.');
        if (expMode === 'wiener') {
          const r = runWienerAttack(N, e);
          setWienerRes(r);
          setBdRes(null);
          if (r.success && r.factorP && r.factorQ && onFactorsRecovered) {
            onFactorsRecovered(N.toString(), r.factorP, r.factorQ, `Wiener CF (${r.nBits}-bit)`, Math.round(r.durationMs));
          }
        } else {
          const r = runBonehDurfeeAttack(N, e, bdDelta, 3, 1);
          setBdRes(r);
          setWienerRes(null);
          if (r.success && r.factorP && r.factorQ && onFactorsRecovered) {
            onFactorsRecovered(N.toString(), r.factorP, r.factorQ, `Boneh–Durfee LLL (${r.nBits}-bit)`, Math.round(r.durationMs));
          }
        }
      } catch (err: any) {
        setExpError(err?.message || 'خطأ في معطيات الإدخال.');
      } finally {
        setExpRunning(false);
      }
    }, 15);
  };

  const handleGenBatch = (bits = batchBits) => {
    const batch = generateBatchGcdTestSet(bits, 12);
    setBatchText(batch.map(x => x.n).join('\n'));
    setBatchRes(null);
  };

  const handleRunBatch = () => {
    const lines = batchText
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    const moduli: bigint[] = [];
    for (const line of lines) {
      try {
        moduli.push(parseBig(line));
      } catch {}
    }
    const r = runBatchGcdAttack(moduli);
    setBatchRes(r);
    if (r.hits.length > 0 && onFactorsRecovered) {
      const first = r.hits[0];
      const orig = moduli[first.index];
      if (orig) {
        onFactorsRecovered(orig.toString(), first.factorP, first.factorQ, `Batch GCD (${first.modulusBits}-bit)`, Math.round(r.durationMs));
      }
    }
  };

  const snfsAnalysis = React.useMemo(() => {
    try {
      const n = parseBig(snfsTargetInput);
      return n > 3n ? analyzeSnfsAndCadoParams(n) : null;
    } catch {
      return null;
    }
  }, [snfsTargetInput]);

  const handleCopy = (kind: 'cado' | 'poly' | 'py', content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedCode(kind);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const BENCH_SPECS: Array<{ bits: 512 | 768 | 1024; attackType: Benchmark500Row['attackType']; label: string }> = [
    { bits: 512, attackType: 'wiener', label: 'Wiener CF · 512b' },
    { bits: 1024, attackType: 'wiener', label: 'Wiener CF · 1024b' },
    { bits: 512, attackType: 'boneh-durfee', label: 'Boneh–Durfee LLL · 512b' },
    { bits: 512, attackType: 'coppersmith-msb', label: 'Coppersmith MSB 65% · 512b' },
    { bits: 768, attackType: 'coppersmith-lsb', label: 'Coppersmith LSB 65% · 768b' },
    { bits: 1024, attackType: 'coppersmith-msb', label: 'Coppersmith MSB 65% · 1024b' },
    { bits: 1024, attackType: 'batch-gcd', label: 'Batch GCD (12×1024b)' },
    { bits: 1024, attackType: 'snfs-aurifeuillean', label: 'SNFS Aurifeuillean · 1026b' }
  ];

  const handleRunBenchmark = (bits: 512 | 768 | 1024, attackType: Benchmark500Row['attackType']) => {
    const id = `${attackType}-${bits}`;
    setBenchRunningId(id);
    setTimeout(() => {
      try {
        const row = run500PlusSingleBenchmark(bits, attackType, benchRounds);
        setBenchRows(prev => [row, ...prev.filter(x => x.id !== row.id)]);
      } finally {
        setBenchRunningId(null);
      }
    }, 20);
  };

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="border-b border-[#E2DDD2] pb-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono text-[#1E3A8A]">
              منظومة &gt; 500 بت المتكاملة · Montgomery REDC · RSA Cryptanalysis · CADO-NFS
            </div>
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917]">
              مختبر التحليل وهجمات RSA للمفاتيح الكبيرة (512–1024+ بت)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F0E8] rounded-lg border border-[#E2DDD2] shrink-0">
            {([
              { id: 'wiener-bd', label: 'Wiener و Boneh–Durfee' },
              { id: 'batch-gcd', label: 'Batch GCD الجماعي' },
              { id: 'snfs-cado', label: 'SNFS · مونتغمري · CADO/Python' },
              { id: 'benchmarks-512-1024', label: 'تجارب 512–1024 بت (Median/IQR)' }
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap transition-colors ${
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

        <p className="text-xs sm:text-sm text-[#57534E] leading-relaxed max-w-4xl">
          يعرض المختبر هجمات حقيقية قابلة للتنفيذ الفوري في المتصفح للأطوال <span className="font-mono" dir="ltr">512–1024+ bits</span> دون أي تسريب للعوامل الحقيقية للمُحلل: كسر الأس السري الصغير (<MathFormula tex="d < N^{0.25}" /> عبر فينر أو <MathFormula tex="d < N^{0.28}" /> عبر شبيكات Boneh–Durfee)، وشجرة <span className="font-mono">Batch GCD</span> لكشف العوامل المشتركة، وتحليل صيغ <span className="font-mono">SNFS Aurifeuillean</span> واختبارات <span className="font-mono">p-1 / REDC ECM</span> وتصدير ملفات <span className="font-mono">CADO-NFS</span> و<span className="font-mono">Python</span>.
        </p>
      </div>

      {/* SUBTAB 1: WIENER & BONEH-DURFEE */}
      {subTab === 'wiener-bd' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-5 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#1C1917]">1. إعداد مفتاح RSA بأس سري ضعيف</span>
                <div className="flex items-center gap-1 p-1 bg-[#F4F0E8] rounded border border-[#E2DDD2]">
                  {([512, 768, 1024] as const).map(b => (
                    <button
                      key={b}
                      onClick={() => {
                        setExpBits(b);
                        handleGenExpKey(b, expMode);
                      }}
                      className={`px-2 py-1 rounded text-xs font-mono-tabular ${
                        expBits === b ? 'bg-white text-[#1E3A8A] font-bold border border-[#E2DDD2]' : 'text-[#57534E]'
                      }`}
                    >
                      {b}b
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#F4F0E8] rounded-lg border border-[#E2DDD2]">
                <button
                  onClick={() => {
                    setExpMode('wiener');
                    handleGenExpKey(expBits, 'wiener');
                  }}
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-bold transition-colors ${
                    expMode === 'wiener' ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2]' : 'text-[#57534E]'
                  }`}
                >
                  Wiener (<MathFormula tex="d < \frac{1}{3}N^{0.25}" />)
                </button>
                <button
                  onClick={() => {
                    setExpMode('boneh-durfee');
                    handleGenExpKey(expBits, 'boneh-durfee');
                  }}
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-bold transition-colors ${
                    expMode === 'boneh-durfee' ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2]' : 'text-[#57534E]'
                  }`}
                >
                  Boneh–Durfee LLL (<MathFormula tex="d > N^{0.25}" />)
                </button>
              </div>

              {expMode === 'boneh-durfee' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#57534E]">نسبة الأس السري <MathFormula tex="\delta = \log_N(d)" />:</span>
                    <span dir="ltr" className="font-mono-tabular font-bold text-[#9A3412]">{bdDelta.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.252}
                    max={0.264}
                    step={0.002}
                    value={bdDelta}
                    onChange={e => setBdDelta(Number(e.target.value))}
                    className="w-full accent-[#1E3A8A]"
                  />
                  <div className="text-[11px] text-[#57534E]">
                    يستخدم مصفوفة شبيكة Boneh–Durfee (<span className="font-mono" dir="ltr">14×14, m=3, t=1</span>) مع ناتج سلفستر ثنائي المتغير (<span className="font-mono" dir="ltr">BigInt Exact</span>).
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E2DDD2]">
                <span className="text-[#57534E]">طول الأس السرّي المُولَّد (للمعايرة فقط):</span>
                <span dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">
                  {generatedDBits ? `${generatedDBits} bits` : '—'}
                </span>
              </div>

              <button
                onClick={() => handleGenExpKey(expBits, expMode)}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917]"
              >
                توليد زوج (N, e) جديد بحجم {expBits} بت
              </button>
            </div>

            <div className="lg:col-span-7 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#1C1917]">2. المعطيات العامة (لا يمرَّر p أو q أو d للمُحلل)</div>
                <label className="flex items-center gap-1.5 text-[11px] text-[#57534E] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoComputeE}
                    onChange={ev => {
                      const next = ev.target.checked;
                      setAutoComputeE(next);
                      if (next && rsaNInput.trim() && rsaNInput.trim() !== lastGeneratedNRef.current) {
                        computeAutoEForInputs(rsaNInput, expMode, hintPFactorInput);
                      }
                    }}
                    className="accent-[#1E3A8A]"
                  />
                  <span>حساب تلقائي للأس العام e عند إدخال N</span>
                </label>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-[#57534E] block">المودول العام N:</label>
                  {currentN && currentN !== rsaNInput && (
                    <button
                      type="button"
                      onClick={() => {
                        lastGeneratedNRef.current = '';
                        setHintPFactorInput(currentP || '');
                        setRsaNInput(currentN);
                        computeAutoEForInputs(currentN, expMode, currentP || '');
                      }}
                      className="text-[11px] font-semibold text-[#1E3A8A] hover:underline"
                    >
                      استيراد N الحالي وحساب e
                    </button>
                  )}
                </div>
                <textarea
                  dir="ltr"
                  rows={2}
                  value={rsaNInput}
                  onChange={ev => handleManualRsaNChange(ev.target.value)}
                  placeholder="أدخل المودول العام N (عشري أو 0x...) ليتم حساب الأس العام e تلقائياً..."
                  className="w-full p-2.5 bg-white border border-[#E2DDD2] rounded font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-[#57534E] block">الأس العام e:</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => computeAutoEForInputs(rsaNInput, expMode, hintPFactorInput)}
                      className="text-[11px] font-semibold text-[#1E3A8A] hover:underline"
                    >
                      احسب e ضعيف لـ N تلقائياً
                    </button>
                    <span className="text-[#E2DDD2]">|</span>
                    <button
                      type="button"
                      onClick={() => computeAutoEForInputs(rsaNInput, 'standard', hintPFactorInput)}
                      className="text-[11px] text-[#57534E] hover:text-[#1C1917] hover:underline"
                    >
                      تعيين قياسي (65537)
                    </button>
                  </div>
                </div>
                <textarea
                  dir="ltr"
                  rows={2}
                  value={rsaEInput}
                  onChange={ev => setRsaEInput(ev.target.value)}
                  className="w-full p-2.5 bg-white border border-[#E2DDD2] rounded font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
                />

                {/* Optional factor hint ONLY for crafting e when user supplies custom large N */}
                <details className="text-[11px] text-[#57534E]">
                  <summary className="cursor-pointer hover:text-[#1C1917] select-none">
                    خيار متقدم: إدخال عامل p (لحساب φ(N) وإنتاج e ضعيف لمودول كبير مخصص)
                  </summary>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={hintPFactorInput}
                      onChange={ev => setHintPFactorInput(ev.target.value)}
                      placeholder="عامل p الاختياري (لحساب e = d⁻¹ mod φ(N) فقط، لا يمرَّر للمُحلل)"
                      className="flex-1 px-2.5 py-1.5 bg-white border border-[#E2DDD2] rounded font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
                    />
                    <button
                      type="button"
                      onClick={() => computeAutoEForInputs(rsaNInput, expMode, hintPFactorInput)}
                      className="px-3 py-1.5 rounded bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-xs font-semibold text-[#1C1917] shrink-0"
                    >
                      احسب e من φ(N)
                    </button>
                  </div>
                </details>

                {autoExpNotice && (
                  <div
                    className={`p-2.5 rounded border text-[11px] leading-relaxed ${
                      autoExpNotice.phiComputed && autoExpNotice.source !== 'prime-n'
                        ? 'bg-[#14532D]/5 border-[#14532D]/25 text-[#14532D]'
                        : 'bg-[#F4F0E8] border-[#E2DDD2] text-[#57534E]'
                    }`}
                  >
                    {autoExpNotice.notesAr}
                  </div>
                )}
              </div>

              <button
                onClick={handleRunExpAttack}
                disabled={expRunning}
                className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors disabled:opacity-50"
              >
                {expRunning
                  ? 'جارٍ تقليص الشبيكة واستخراج الجذور...'
                  : expMode === 'wiener'
                  ? 'تشغيل هجوم Wiener (الكسور المستمرة)'
                  : 'تشغيل هجوم Boneh–Durfee LLL'}
              </button>

              {expError && <div className="text-xs text-[#9A3412] font-medium">✖ {expError}</div>}
            </div>
          </div>

          {/* Results: Wiener */}
          {wienerRes && (
            <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2.5">
                <div className={`text-sm font-bold ${wienerRes.success ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                  {wienerRes.success ? '✓ نجاح كسر المفتاح عبر متقاربات الكسور المستمرة (Wiener)' : '▲ لم ينطبق حد فينر'}
                </div>
                <div dir="ltr" className="text-xs font-mono-tabular text-[#57534E]">
                  {wienerRes.nBits}b · {wienerRes.convergentsTested} convergents · {wienerRes.durationMs} ms
                </div>
              </div>
              <p className="text-xs text-[#1C1917]">{wienerRes.notesAr}</p>
              {wienerRes.success && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono-tabular" dir="ltr">
                  <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                    <div className="text-[10px] text-[#57534E]">Recovered d (verified)</div>
                    <div className="font-bold text-[#14532D] break-all">{wienerRes.recoveredD}</div>
                  </div>
                  <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                    <div className="text-[10px] text-[#57534E]">Factor p</div>
                    <div className="text-[#1C1917] break-all">{wienerRes.factorP?.slice(0, 32)}… ({wienerRes.factorP?.length}d)</div>
                  </div>
                  <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                    <div className="text-[10px] text-[#57534E]">Product & Primality</div>
                    <div className="font-bold text-[#14532D]">p×q==N: {String(wienerRes.verifiedProduct)} · Prime: {String(wienerRes.verifiedPrimes)}</div>
                  </div>
                </div>
              )}
              {wienerRes.traceSample.length > 0 && (
                <div className="overflow-x-auto" dir="ltr">
                  <table className="w-full text-left text-xs font-mono-tabular">
                    <thead>
                      <tr className="border-b border-[#E2DDD2] text-[#57534E]">
                        <th className="py-1.5 pr-3">Step</th>
                        <th className="py-1.5 pr-3">a_i</th>
                        <th className="py-1.5 pr-3">k_i</th>
                        <th className="py-1.5 pr-3">d_i (bits)</th>
                        <th className="py-1.5">φ(N) Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE5DA]">
                      {wienerRes.traceSample.map(row => (
                        <tr key={row.index} className={row.phiCandidateValid ? 'bg-[#14532D]/10 font-bold' : ''}>
                          <td className="py-1 pr-3">{row.index}</td>
                          <td className="py-1 pr-3">{row.quotient}</td>
                          <td className="py-1 pr-3">{row.k}</td>
                          <td className="py-1 pr-3">{row.d} ({row.dBits}b)</td>
                          <td className={`py-1 ${row.phiCandidateValid ? 'text-[#14532D]' : 'text-[#57534E]'}`}>
                            {row.phiCandidateValid ? '✓ EXACT FACTOR' : 'skip'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Results: Boneh-Durfee */}
          {bdRes && (
            <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2.5">
                <div className={`text-sm font-bold ${bdRes.success ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                  {bdRes.success ? '✓ نجاح هجوم Boneh–Durfee LLL (تجاوز حد فينر N^0.25)' : '▲ لم يلتقط الجذر عند هذه الأبعاد'}
                </div>
                <div dir="ltr" className="text-xs font-mono-tabular text-[#57534E]">
                  dim={bdRes.latticeDim} (m={bdRes.m}, t={bdRes.t}) · swaps={bdRes.lllSwaps} · {bdRes.durationMs} ms
                </div>
              </div>
              <p className="text-xs text-[#1C1917]">{bdRes.notesAr}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono-tabular" dir="ltr">
                <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                  <div className="text-[10px] text-[#57534E]">Shortest Vector Norms (bits)</div>
                  <div className="font-bold text-[#1E3A8A]">[{bdRes.reducedNormBits.join(', ')}]</div>
                </div>
                <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                  <div className="text-[10px] text-[#57534E]">Recovered d / k</div>
                  <div className="text-[#1C1917] break-all">{bdRes.recoveredD ? `${bdRes.recoveredD.slice(0, 26)}…` : '—'}</div>
                </div>
                <div className="bg-white p-3 rounded border border-[#E2DDD2]">
                  <div className="text-[10px] text-[#57534E]">Verification</div>
                  <div className={bdRes.verifiedProduct ? 'text-[#14532D] font-bold' : 'text-[#9A3412]'}>
                    p×q==N: {String(bdRes.verifiedProduct)} · Prime: {String(bdRes.verifiedPrimes)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: BATCH GCD TREE */}
      {subTab === 'batch-gcd' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#1C1917]">شجرة الجداء والباقي (Product & Remainder Tree) حتى 1024+ بت</div>
              <p className="text-xs text-[#57534E]">
                تكتشف أي عامل أولي مشترك <MathFormula tex="\gcd(N_i, N_j) > 1" /> بين مجموعة مفاتيح عامة دفعةً واحدة بتعقيد شبه خطي.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {([512, 768, 1024] as const).map(b => (
                <button
                  key={b}
                  onClick={() => {
                    setBatchBits(b);
                    handleGenBatch(b);
                  }}
                  className={`px-2.5 py-1.5 rounded text-xs font-mono-tabular border ${
                    batchBits === b ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]' : 'bg-white text-[#1C1917] border-[#E2DDD2]'
                  }`}
                >
                  توليد 12×{b}b
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#1C1917] block">قائمة المودولات (مودول واحد في كل سطر):</label>
            <textarea
              dir="ltr"
              rows={5}
              value={batchText}
              onChange={e => setBatchText(e.target.value)}
              className="w-full p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          <button
            onClick={handleRunBatch}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors"
          >
            فحص الحزمة عبر شجرة Batch GCD
          </button>

          {batchRes && (
            <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2">
                <span className={`text-sm font-bold ${batchRes.compromisedCount > 0 ? 'text-[#14532D]' : 'text-[#57534E]'}`}>
                  {batchRes.notesAr}
                </span>
                <span dir="ltr" className="text-xs font-mono-tabular text-[#57534E]">
                  Depth={batchRes.treeDepth} · Root={batchRes.productBits.toLocaleString()} bits · {batchRes.durationMs} ms
                </span>
              </div>
              {batchRes.hits.length > 0 && (
                <div className="overflow-x-auto" dir="ltr">
                  <table className="w-full text-left text-xs font-mono-tabular">
                    <thead>
                      <tr className="border-b border-[#E2DDD2] text-[#57534E]">
                        <th className="py-1.5 pr-3">Key #</th>
                        <th className="py-1.5 pr-3">Size</th>
                        <th className="py-1.5 pr-3">Modulus Preview</th>
                        <th className="py-1.5 pr-3">Shared Prime p</th>
                        <th className="py-1.5">Verified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE5DA]">
                      {batchRes.hits.map(hit => (
                        <tr key={hit.index}>
                          <td className="py-1.5 pr-3 font-bold">#{hit.index + 1}</td>
                          <td className="py-1.5 pr-3">{hit.modulusBits}b</td>
                          <td className="py-1.5 pr-3">{hit.modulusPreview}</td>
                          <td className="py-1.5 pr-3 text-[#1E3A8A]">{hit.factorP.slice(0, 28)}…</td>
                          <td className="py-1.5 font-bold text-[#14532D]">p×q==N: {String(hit.verifiedProduct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: SNFS AURIFEUILLEAN + MONTGOMERY p-1/ECM + CADO/PYTHON EXPORT */}
      {subTab === 'snfs-cado' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Aurifeuillean 2^514 + 1 (515b)', val: ((1n << 514n) + 1n).toString() },
              { label: 'Aurifeuillean 2^770 + 1 (771b)', val: ((1n << 770n) + 1n).toString() },
              { label: 'Aurifeuillean 2^1026 + 1 (1027b)', val: ((1n << 1026n) + 1n).toString() }
            ].map(p => (
              <button
                key={p.label}
                onClick={() => {
                  setSnfsTargetInput(p.val);
                  setSnfsPresetLabel(p.label);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917]"
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => {
                const sm = generateSmoothFactorRsa(512, 'p-1-smooth');
                setSnfsTargetInput(sm.n);
                setSnfsPresetLabel(sm.labelAr);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A]"
            >
              توليد 512b أملس (p−1 REDC)
            </button>
            <button
              onClick={() => {
                const unb = generateSmoothFactorRsa(768, 'unbalanced-ecm');
                setSnfsTargetInput(unb.n);
                setSnfsPresetLabel(unb.labelAr);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A]"
            >
              توليد 768b غير متوازن (REDC ECM)
            </button>
            {currentN && (
              <button
                onClick={() => {
                  setSnfsTargetInput(currentN);
                  setSnfsPresetLabel('العدد النشط في المحلل');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#14532D]"
              >
                استخدام العدد الحالي N
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-8">
              <textarea
                dir="ltr"
                rows={3}
                value={snfsTargetInput}
                onChange={e => {
                  setSnfsTargetInput(e.target.value);
                  setSnfsPresetLabel('إدخال مخصص');
                }}
                className="w-full h-full p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
            <div className="lg:col-span-4 flex flex-col justify-between gap-2 bg-[#FBF9F5] p-3.5 rounded-lg border border-[#E2DDD2]">
              <div className="text-xs text-[#57534E]">{snfsPresetLabel}</div>
              {onLaunchChronos && snfsTargetInput.trim() && (
                <button
                  onClick={() => onLaunchChronos(snfsTargetInput.replace(/[^0-9]/g, ''))}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors"
                >
                  إطلاق العمال المتوازية (REDC ECM + p±1 + SNFS)
                </button>
              )}
            </div>
          </div>

          {snfsAnalysis && (
            <div className="space-y-4 bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2">
                <div>
                  <div className="text-xs font-mono text-[#1E3A8A]">{snfsAnalysis.formLabelAr}</div>
                  <div className="text-sm font-bold text-[#1C1917]">{snfsAnalysis.recommendedEngineAr}</div>
                </div>
                <div dir="ltr" className="text-xs font-mono-tabular text-[#57534E]">
                  deg={snfsAnalysis.polySelection.degree} · skew={snfsAnalysis.polySelection.skew} · α≈{snfsAnalysis.polySelection.alphaScoreEst}
                </div>
              </div>

              {snfsAnalysis.algebraicFactor && (
                <div className="bg-white p-3 rounded border border-[#14532D]/40 text-xs font-mono-tabular" dir="ltr">
                  <span className="text-[#14532D] font-bold">Instant Algebraic / Aurifeuillean Split Found: </span>
                  <span className="break-all text-[#1C1917]">{snfsAnalysis.algebraicFactor}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white p-3 rounded border border-[#E2DDD2] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C1917]">ملف متعدد الحدود CADO-NFS (.poly)</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleCopy('poly', snfsAnalysis.cadoPolyFile)}
                        className="px-2 py-1 text-[11px] rounded border border-[#E2DDD2] bg-[#F4F0E8] text-[#1E3A8A]"
                      >
                        {copiedCode === 'poly' ? 'تم النسخ' : 'نسخ'}
                      </button>
                      <button
                        onClick={() => handleDownloadFile('target_gnfs.poly', snfsAnalysis.cadoPolyFile)}
                        className="px-2 py-1 text-[11px] rounded border border-[#E2DDD2] bg-white text-[#1C1917]"
                      >
                        تنزيل .poly
                      </button>
                    </div>
                  </div>
                  <pre dir="ltr" className="text-[11px] font-mono text-[#1C1917] overflow-x-auto max-h-44 p-2 bg-[#FBF9F5] rounded border border-[#EAE5DA]">
                    {snfsAnalysis.cadoPolyFile}
                  </pre>
                </div>

                <div className="bg-white p-3 rounded border border-[#E2DDD2] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C1917]">معاملات CADO-NFS وسكربت Python المستقل</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleCopy('cado', snfsAnalysis.cadoNfsConfig)}
                        className="px-2 py-1 text-[11px] rounded border border-[#E2DDD2] bg-[#F4F0E8] text-[#1E3A8A]"
                      >
                        {copiedCode === 'cado' ? 'تم النسخ' : 'نسخ Params'}
                      </button>
                      <button
                        onClick={() => handleDownloadFile('zf_500plus_suite.py', PYTHON_500PLUS_REFERENCE_SCRIPT)}
                        className="px-2 py-1 text-[11px] rounded border border-[#E2DDD2] bg-[#14532D] text-white"
                      >
                        تنزيل Python (.py)
                      </button>
                    </div>
                  </div>
                  <pre dir="ltr" className="text-[11px] font-mono text-[#1C1917] overflow-x-auto max-h-44 p-2 bg-[#FBF9F5] rounded border border-[#EAE5DA]">
                    {snfsAnalysis.cadoNfsConfig}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 4: 512-1024b MEDIAN/IQR BENCHMARKS */}
      {subTab === 'benchmarks-512-1024' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
            <div>
              <div className="text-xs font-bold text-[#1C1917]">معايرة 512 / 768 / 1024 بت الإحصائية (Median & IQR · دون تسريب العوامل)</div>
              <p className="text-xs text-[#57534E]">
                تولّد كل جولة مفاتيح مستقلة وتقيس الزمن الفعلي للخوارزمية ثم تتحقق من <MathFormula tex="p \times q = N" />.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#F4F0E8] rounded border border-[#E2DDD2] shrink-0">
              {([3, 5] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setBenchRounds(n)}
                  className={`px-2.5 py-1 rounded text-xs font-mono-tabular ${
                    benchRounds === n ? 'bg-white text-[#1E3A8A] font-bold border border-[#E2DDD2]' : 'text-[#57534E]'
                  }`}
                >
                  n={n} جولات
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {BENCH_SPECS.map(spec => {
              const id = `${spec.attackType}-${spec.bits}`;
              const isBusy = benchRunningId === id;
              return (
                <button
                  key={id}
                  disabled={benchRunningId !== null}
                  onClick={() => handleRunBenchmark(spec.bits, spec.attackType)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] disabled:opacity-50"
                >
                  {isBusy ? 'جارٍ القياس...' : `تشغيل ${spec.label}`}
                </button>
              );
            })}
          </div>

          {benchRows.length > 0 ? (
            <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg bg-[#FBF9F5]" dir="ltr">
              <table className="w-full text-left text-xs font-mono-tabular">
                <thead>
                  <tr className="border-b border-[#E2DDD2] text-[#57534E] bg-[#F4F0E8]">
                    <th className="py-2 px-3">Experiment (512–1024b)</th>
                    <th className="py-2 px-3">n</th>
                    <th className="py-2 px-3">Success</th>
                    <th className="py-2 px-3">Median (ms)</th>
                    <th className="py-2 px-3">IQR [Q1–Q3]</th>
                    <th className="py-2 px-3">Min–Max</th>
                    <th className="py-2 px-3">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE5DA]">
                  {benchRows.map(row => (
                    <tr key={row.id} className="text-[#1C1917]">
                      <td className="py-2 px-3 font-bold">{row.titleAr}</td>
                      <td className="py-2 px-3">{row.rounds}</td>
                      <td className="py-2 px-3">{row.successCount}/{row.rounds}</td>
                      <td className="py-2 px-3 text-[#1E3A8A] font-bold">{row.medianMs.toFixed(2)} ms</td>
                      <td className="py-2 px-3">{row.iqrMs.toFixed(2)} [{row.q1Ms.toFixed(1)}–{row.q3Ms.toFixed(1)}]</td>
                      <td className="py-2 px-3 text-[#57534E]">{row.minMs.toFixed(1)}–{row.maxMs.toFixed(1)}</td>
                      <td className={`py-2 px-3 font-bold ${row.verifiedAll ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                        {row.verifiedAll ? '✓ PASS' : '▲ PARTIAL'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-xs text-[#57534E] bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
              اختر أي تجربة أعلاه لتنفيذ جولات قياس حقيقية لأعداد 512–1024 بت وحساب الوسيط والمدى الربيعي.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Rsa500PlusLabPanel;
