import React, { useEffect, useState } from 'react';
import MathFormula from './MathFormula';
import {
  CoppersmithLllResult,
  GeneratedHintKey,
  NarrowSieveResult,
  generateRsaWithHint,
  solveCoppersmithLll,
  solveNarrowHighBitSieve
} from '../lib/coppersmithLllEngine';
import {
  solveCoppersmithLsbLll,
  solveNarrowLowBitSieve
} from '../lib/rsa500PlusAttacks';

interface CoppersmithLabPanelProps {
  onFactorsRecovered?: (n: string, p: string, q: string, method: string, durationMs: number) => void;
}

type AttackPathMode = 'auto' | 'dual-compare' | 'lll-only' | 'narrow-only';
type LeakDirection = 'msb' | 'lsb';

const parseBigIntInput = (raw: string): bigint => {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) throw new Error('حقل فارغ');
  if (cleaned.startsWith('0x') || cleaned.startsWith('0X')) {
    return BigInt(cleaned);
  }
  return BigInt(cleaned.replace(/[^0-9]/g, ''));
};

export const CoppersmithLabPanel: React.FC<CoppersmithLabPanelProps> = ({ onFactorsRecovered }) => {
  const [rsaBits, setRsaBits] = useState<number>(500);
  const [knownRatioPct, setKnownRatioPct] = useState<number>(95);
  const [leakDirection, setLeakDirection] = useState<LeakDirection>('msb');
  const [pathMode, setPathMode] = useState<AttackPathMode>('dual-compare');

  const [generatedKey, setGeneratedKey] = useState<GeneratedHintKey | null>(null);
  const [nInput, setNInput] = useState<string>('');
  const [p0Input, setP0Input] = useState<string>('');
  const [unknownBitsInput, setUnknownBitsInput] = useState<number>(13);

  const [lllResult, setLllResult] = useState<CoppersmithLllResult | null>(null);
  const [narrowResult, setNarrowResult] = useState<NarrowSieveResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const deriveHintFromKey = (keyObj: GeneratedHintKey, pct: number, dir: LeakDirection) => {
    const pBig = BigInt(keyObj.p);
    const pBits = keyObj.pBits;
    const knownBits = Math.max(1, Math.min(pBits - 1, Math.round((pBits * pct) / 100)));
    const unknownBits = pBits - knownBits;
    const shift = BigInt(unknownBits);
    let hintVal: bigint;
    let x0Val: bigint;
    if (dir === 'msb') {
      hintVal = (pBig >> shift) << shift;
      x0Val = pBig - hintVal;
    } else {
      const kShift = BigInt(knownBits);
      hintVal = pBig & ((1n << kShift) - 1n);
      x0Val = pBig >> kShift;
    }
    setGeneratedKey({
      ...keyObj,
      knownRatioPct: pct,
      knownBits,
      unknownBits,
      hintP0Dec: hintVal.toString(10),
      hintP0Hex: '0x' + hintVal.toString(16),
      trueOffsetX0: x0Val.toString(10),
      boundX: (1n << shift).toString(10)
    });
    setNInput(keyObj.n);
    setP0Input(hintVal.toString(10));
    setUnknownBitsInput(unknownBits);
    setLllResult(null);
    setNarrowResult(null);
  };

  const handleGenerateKey = (targetBits = rsaBits, targetPct = knownRatioPct, dir = leakDirection) => {
    setIsGenerating(true);
    setErrorMsg(null);
    // Yield frame briefly so UI reflects generation cleanly on 1024-bit keys
    setTimeout(() => {
      try {
        const key = generateRsaWithHint(targetBits, targetPct);
        deriveHintFromKey(key, targetPct, dir);
      } catch (err: any) {
        setErrorMsg(err?.message || 'تعذر توليد المفتاح.');
      } finally {
        setIsGenerating(false);
      }
    }, 10);
  };

  useEffect(() => {
    handleGenerateKey(500, 95, 'msb');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-derive hint prefix p0 or LSB mask immediately if slider moves on an already-generated key
  const handleRatioChange = (nextPct: number) => {
    setKnownRatioPct(nextPct);
    if (generatedKey) {
      try {
        deriveHintFromKey(generatedKey, nextPct, leakDirection);
      } catch {}
    } else if (nInput.trim()) {
      try {
        const nLen = parseBigIntInput(nInput).toString(2).length;
        const estPBits = Math.max(2, Math.round(nLen / 2));
        setUnknownBitsInput(Math.max(1, estPBits - Math.round((estPBits * nextPct) / 100)));
      } catch {}
    }
  };

  const handleLeakDirChange = (nextDir: LeakDirection) => {
    setLeakDirection(nextDir);
    if (generatedKey) {
      try {
        deriveHintFromKey(generatedKey, knownRatioPct, nextDir);
      } catch {}
    }
  };

  const handleRunAttack = () => {
    setErrorMsg(null);
    let nBig: bigint;
    let p0Big: bigint;
    try {
      nBig = parseBigIntInput(nInput);
      p0Big = parseBigIntInput(p0Input);
      if (nBig < 4n) throw new Error('قيمة N يجب أن تكون عدداً مركباً موجباً.');
      if (p0Big <= 0n || p0Big >= nBig) throw new Error('قيمة التلميح p₀ يجب أن تكون موجبة وأصغر من N.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'صيغة الإدخال غير صالحة للأعداد الصحيحة الكبيرة.');
      return;
    }

    const uBits = Math.max(1, Number(unknownBitsInput) || 12);
    const shouldRunNarrow =
      pathMode === 'narrow-only' ||
      pathMode === 'dual-compare' ||
      (pathMode === 'auto' && knownRatioPct >= 90 && uBits <= 20);
    const shouldRunLll =
      pathMode === 'lll-only' ||
      pathMode === 'dual-compare' ||
      (pathMode === 'auto' && (!shouldRunNarrow || knownRatioPct <= 95));

    let nextLll: CoppersmithLllResult | null = null;
    let nextNarrow: NarrowSieveResult | null = null;
    const estPBits = generatedKey?.pBits ?? Math.max(2, Math.round(nBig.toString(2).length / 2));
    const knownLsbBits = Math.max(1, estPBits - uBits);

    if (shouldRunNarrow) {
      nextNarrow = leakDirection === 'msb'
        ? solveNarrowHighBitSieve(nBig, p0Big, uBits)
        : solveNarrowLowBitSieve(nBig, p0Big, knownLsbBits, uBits);
    }
    if (shouldRunLll) {
      nextLll = leakDirection === 'msb'
        ? solveCoppersmithLll(nBig, p0Big, uBits)
        : solveCoppersmithLsbLll(nBig, p0Big, knownLsbBits, estPBits);
    }

    setLllResult(nextLll);
    setNarrowResult(nextNarrow);

    // Notify parent analyzer if either path recovered factors
    const winnerP = nextLll?.factorP || nextNarrow?.factorP;
    const winnerQ = nextLll?.factorQ || nextNarrow?.factorQ;
    const winnerMs = nextLll?.success ? nextLll.durationMs : (nextNarrow?.durationMs ?? 1);
    const winnerLabel =
      nextLll?.success && nextNarrow?.success
        ? `Coppersmith LLL (${nextLll.dimension}×${nextLll.dimension}) + Narrow Sieve`
        : nextLll?.success
        ? `Coppersmith LLL (${nextLll.dimension}×${nextLll.dimension})`
        : nextNarrow?.success
        ? 'Narrow High-Bit Sieve'
        : '';

    if (winnerP && winnerQ && winnerLabel && onFactorsRecovered) {
      onFactorsRecovered(nBig.toString(10), winnerP, winnerQ, winnerLabel, winnerMs);
    }
  };

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-6">
      {/* Header & Mathematical Premise */}
      <div className="border-b border-[#E2DDD2] pb-4 space-y-2">
        <div className="text-xs font-mono text-[#1E3A8A]">
          هجوم كوبرسميث عبر شبيكات LLL الدقيقة (BigInt) · ومسار الغربلة الضيقة (90%–99%)
        </div>
        <h3 className="text-xl font-bold font-serif-academic text-[#1C1917]">
          كسر مفاتيح 500–1024 بت بمعرفة البتات العليا للعامل الأولي <MathFormula tex="p = p_0 + x_0" />
        </h3>
        <div className="text-xs sm:text-sm text-[#57534E] leading-relaxed space-y-1.5 max-w-4xl">
          <p>
            عند معرفة البتات العليا للعامل <MathFormula tex="p" /> بنسبة <MathFormula tex="\ge 53\%" />، نصوغ كثيرة الحدود <MathFormula tex="f(x) = x + p_0 \equiv 0 \pmod p" /> مع القيد <MathFormula tex="|x_0| < X" />، ونبني شبيكة <MathFormula tex="\text{Howgrave-Graham}" /> ثم نقلصها بـ <MathFormula tex="\text{LLL}" /> بحسابات صحيحة كاملة لاستخراج <MathFormula tex="g(x_0)=0 \in \mathbb{Z}" />.
          </p>
          <p className="text-[#9A3412] font-medium">
            قيد رياضي حاسم: توليد أو معرفة 95% من بتات <strong>العامل <MathFormula tex="p" /></strong> يضمن إيجاده فوراً عبر الغربلة الضيقة أو LLL، أما معرفة 95% من بتات <strong>العدد <MathFormula tex="N" /></strong> وحده فلا تحصر موقع <MathFormula tex="p" />.
          </p>
        </div>
      </div>

      {/* Controls: Key Size + Hint Ratio + Dual Path Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Key Generator & Slider */}
        <div className="lg:col-span-5 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#1C1917]">1. توليد مفتاح RSA مع تلميح البتات</span>
            <div className="flex items-center gap-1 bg-[#F4F0E8] p-1 rounded-lg border border-[#E2DDD2]">
              {[500, 768, 1024].map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setRsaBits(b);
                    handleGenerateKey(b, knownRatioPct);
                  }}
                  disabled={isGenerating}
                  className={`px-2.5 py-1 rounded text-xs font-mono-tabular whitespace-nowrap transition-colors ${
                    rsaBits === b
                      ? 'bg-white text-[#1E3A8A] font-bold border border-[#E2DDD2]'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  {b}b
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F4F0E8] rounded-lg border border-[#E2DDD2]">
            <button
              onClick={() => handleLeakDirChange('msb')}
              className={`flex-1 py-1 px-2 rounded text-[11px] font-bold transition-colors ${
                leakDirection === 'msb' ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2]' : 'text-[#57534E]'
              }`}
            >
              تسريب علوي MSB (p₀)
            </button>
            <button
              onClick={() => handleLeakDirChange('lsb')}
              className={`flex-1 py-1 px-2 rounded text-[11px] font-bold transition-colors ${
                leakDirection === 'lsb' ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2]' : 'text-[#57534E]'
              }`}
            >
              تسريب سفلي LSB (p_low)
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#57534E]">نسبة البتات {leakDirection === 'msb' ? 'العليا (MSB)' : 'السفلى (LSB)'} المعروفة من <MathFormula tex="p" />:</span>
              <span dir="ltr" className="font-mono-tabular font-bold text-[#1E3A8A]">{knownRatioPct}%</span>
            </div>
            <input
              type="range"
              min={53}
              max={99}
              step={1}
              value={knownRatioPct}
              onChange={(e) => handleRatioChange(Number(e.target.value))}
              className="w-full accent-[#1E3A8A]"
            />
            <div className="flex flex-wrap gap-1.5">
              {[56, 60, 70, 85, 95, 98].map((pct) => (
                <button
                  key={pct}
                  onClick={() => handleRatioChange(pct)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono-tabular border transition-colors ${
                    knownRatioPct === pct
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-white text-[#57534E] border-[#E2DDD2] hover:border-[#1E3A8A]'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E2DDD2] text-xs">
            <div>
              <div className="text-[11px] text-[#57534E]">طول p</div>
              <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">
                {generatedKey ? `${generatedKey.pBits} bits` : `~${Math.round(rsaBits / 2)} bits`}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#57534E]">البتات المجهولة</div>
              <div dir="ltr" className="font-mono-tabular font-bold text-[#9A3412]">
                {unknownBitsInput} bits
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#57534E]">سقف النطاق X</div>
              <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">
                2^{unknownBitsInput}
              </div>
            </div>
          </div>

          <button
            onClick={() => handleGenerateKey(rsaBits, knownRatioPct)}
            disabled={isGenerating}
            className="w-full py-2 px-4 rounded-lg text-xs font-bold bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] transition-colors disabled:opacity-50"
          >
            {isGenerating ? `جاري توليد مفتاح ${rsaBits} بت...` : `توليد مفتاح ${rsaBits} بت جديد وتلميح ${knownRatioPct}%`}
          </button>
        </div>

        {/* Right: Manual N, Hint p0 & Path Selector */}
        <div className="lg:col-span-7 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#1C1917]">2. إدخال <MathFormula tex="N" /> والتلميح <MathFormula tex="p_0" /> (عشري أو سداسي عشري <span dir="ltr" className="font-mono">0x</span>)</span>
            <div className="flex flex-wrap gap-1 bg-[#F4F0E8] p-1 rounded-lg border border-[#E2DDD2]">
              {([
                { id: 'dual-compare', label: 'المساران للمقارنة' },
                { id: 'auto', label: 'تلقائي ذكي' },
                { id: 'lll-only', label: 'شبيكات LLL' },
                { id: 'narrow-only', label: 'غربلة ضيقة' }
              ] as const).map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setPathMode(mode.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                    pathMode === mode.id
                      ? 'bg-white text-[#1E3A8A] font-bold border border-[#E2DDD2]'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-[#57534E]">العدد شبه الأولي المستهدف <MathFormula tex="N = p \times q" />:</label>
            <textarea
              dir="ltr"
              rows={2}
              value={nInput}
              onChange={(e) => {
                setNInput(e.target.value);
                setGeneratedKey(null);
              }}
              className="w-full p-2.5 bg-white border border-[#E2DDD2] rounded-lg font-mono-tabular text-[11px] text-[#1C1917] focus:outline-none focus:border-[#1E3A8A] resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-9 space-y-1">
              <label className="block text-[11px] font-semibold text-[#57534E]">
                التلميح الجزئي {leakDirection === 'msb' ? 'للبتات العليا' : 'للبتات السفلى'} <MathFormula tex={leakDirection === 'msb' ? 'p_0' : 'p_{\\text{low}}'} /> (يقبل Decimal أو 0xHex):
              </label>
              <textarea
                dir="ltr"
                rows={2}
                value={p0Input}
                onChange={(e) => setP0Input(e.target.value)}
                className="w-full p-2.5 bg-white border border-[#E2DDD2] rounded-lg font-mono-tabular text-[11px] text-[#1C1917] focus:outline-none focus:border-[#1E3A8A] resize-none"
              />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <label className="block text-[11px] font-semibold text-[#57534E]">بتات الخطأ <MathFormula tex="\log_2 X" />:</label>
              <input
                dir="ltr"
                type="number"
                min={1}
                max={480}
                value={unknownBitsInput}
                onChange={(e) => setUnknownBitsInput(Math.max(1, Number(e.target.value)))}
                className="w-full p-2.5 bg-white border border-[#E2DDD2] rounded-lg font-mono-tabular text-xs font-bold text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>
          </div>

          <button
            onClick={handleRunAttack}
            disabled={isGenerating || !nInput.trim() || !p0Input.trim()}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors disabled:opacity-50"
          >
            تنفيذ هجوم كوبرسميث LLL / الغربلة الضيقة واستخراج العوامل
          </button>

          {errorMsg && <div className="text-xs text-[#9A3412] font-medium">✖ {errorMsg}</div>}
        </div>
      </div>

      {/* Results & Lattice Proof Section */}
      {(lllResult || narrowResult) && (
        <div className="space-y-5 pt-2 border-t border-[#E2DDD2]">
          {/* Dual Path Comparison Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lllResult && (
              <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#1E3A8A]">مسار شبيكات كوبرسميث (Exact BigInt LLL)</span>
                  <span className={`font-bold ${lllResult.success ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                    {lllResult.success ? '● نجح الاستخراج' : '✖ لم يحل في هذا الحد'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <div>
                    <div className="text-[11px] text-[#57534E]">زمن التنفيذ</div>
                    <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">{lllResult.durationMs} ms</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#57534E]">أبعاد الشبيكة</div>
                    <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">
                      {lllResult.dimension}×{lllResult.dimension} (m={lllResult.m}, t={lllResult.t})
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#57534E]">تبديلات LLL</div>
                    <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">{lllResult.lllSwaps} swaps</div>
                  </div>
                </div>
                <p className="text-[11px] text-[#57534E] leading-relaxed">{lllResult.notesAr}</p>
              </div>
            )}

            {narrowResult && (
              <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#1C1917]">مسار الغربلة الضيقة (Wheel Mod 19)</span>
                  <span className={`font-bold ${narrowResult.success ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                    {narrowResult.success ? '● نجح الاستخراج' : '▲ تجاوز السقف / فشل'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <div>
                    <div className="text-[11px] text-[#57534E]">زمن الفحص</div>
                    <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">{narrowResult.durationMs} ms</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#57534E]">المرشحات المفحوصة</div>
                    <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">
                      {narrowResult.candidatesChecked.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#57534E]">عرض النافذة</div>
                    <div dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">
                      2^{narrowResult.unknownBits}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-[#57534E] leading-relaxed">{narrowResult.notesAr}</p>
              </div>
            )}
          </div>

          {/* Extracted Root & Recovered Factors Verification */}
          {(lllResult?.verifiedProduct || narrowResult?.verifiedProduct) && (
            <div className="bg-[#FBF9F5] border border-[#14532D]/40 rounded-lg p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#14532D]">
                  ● التحقق الجبري التام: حاصل الضرب p × q يطابق N ({(lllResult?.nBits ?? bitLenDisplay(nInput))} بت)
                </span>
                <span dir="ltr" className="font-mono-tabular text-[#1C1917]">
                  x₀ = {lllResult?.foundRootX0 ?? narrowResult?.foundOffsetX0}
                </span>
              </div>
              <div dir="ltr" className="space-y-1 text-[11px] font-mono-tabular text-[#1C1917] break-all">
                <div><span className="text-[#14532D] font-bold">p = </span>{lllResult?.factorP || narrowResult?.factorP}</div>
                <div><span className="text-[#1E3A8A] font-bold">q = </span>{lllResult?.factorQ || narrowResult?.factorQ}</div>
              </div>
            </div>
          )}

          {/* Detailed Lattice Reduction Table & Extracted Polynomial g(x) */}
          {lllResult && (
            <div className="space-y-4">
              <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1C1917]">
                    كثيرة الحدود الصغيرة المستخرجة على <MathFormula tex="\mathbb{Z}[x]" /> (أقصر متجه بعد التقليص):
                  </span>
                  <span dir="ltr" className="text-[11px] font-mono-tabular text-[#57534E]">
                    ||v₀|| ≈ 2^{lllResult.reducedNormsBits[0]} bits vs Bound p^m ≈ 2^{lllResult.theoreticalTargetBits} bits (margin {lllResult.howgraveLogMarginBits > 0 ? '+' : ''}{lllResult.howgraveLogMarginBits}b)
                  </span>
                </div>
                <MathFormula tex={lllResult.polynomialLatex} display className="text-sm" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-[#E2DDD2] rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-[#57534E]">
                    قاعدة الشبيكة الأولية Howgrave-Graham ({lllResult.dimension}×{lllResult.dimension})
                  </div>
                  <div className="overflow-x-auto" dir="ltr">
                    <table className="w-full text-left text-[11px] font-mono-tabular">
                      <thead>
                        <tr className="text-[#57534E] border-b border-[#E2DDD2]">
                          <th className="py-1 pr-2">Row</th>
                          <th className="py-1 pr-2">||b|| bits</th>
                          <th className="py-1">Entries [c₀, c₁X, …]</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAE5DA]">
                        {lllResult.initialMatrixPreview.slice(0, 7).map((r) => (
                          <tr key={r.rowIndex}>
                            <td className="py-1 pr-2 text-[#57534E]">b_{r.rowIndex}</td>
                            <td className="py-1 pr-2 font-bold text-[#9A3412]">{r.normBits}b</td>
                            <td className="py-1 text-[#1C1917] whitespace-nowrap">
                              [{r.entriesPreview.slice(0, 4).join(', ')}{r.entriesPreview.length > 4 ? ', …' : ''}]
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border border-[#E2DDD2] rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-[#1E3A8A]">
                    القاعدة المقلَّصة بعد تقليص LLL الدقيق
                  </div>
                  <div className="overflow-x-auto" dir="ltr">
                    <table className="w-full text-left text-[11px] font-mono-tabular">
                      <thead>
                        <tr className="text-[#57534E] border-b border-[#E2DDD2]">
                          <th className="py-1 pr-2">Vec</th>
                          <th className="py-1 pr-2">||v|| bits</th>
                          <th className="py-1">Reduced Entries</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAE5DA]">
                        {lllResult.reducedMatrixPreview.slice(0, 7).map((r) => (
                          <tr key={r.rowIndex}>
                            <td className="py-1 pr-2 text-[#1E3A8A] font-bold">v_{r.rowIndex}</td>
                            <td className={`py-1 pr-2 font-bold ${r.rowIndex === 0 ? 'text-[#14532D]' : 'text-[#1C1917]'}`}>
                              {r.normBits}b
                            </td>
                            <td className="py-1 text-[#1C1917] whitespace-nowrap">
                              [{r.entriesPreview.slice(0, 4).join(', ')}{r.entriesPreview.length > 4 ? ', …' : ''}]
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const bitLenDisplay = (raw: string): number => {
  try {
    const clean = raw.trim();
    if (!clean) return 0;
    return BigInt(clean).toString(2).length;
  } catch {
    return 0;
  }
};

export default CoppersmithLabPanel;
