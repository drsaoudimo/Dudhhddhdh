import React, { useMemo, useState } from 'react';
import MathFormula from './MathFormula';
import {
  buildBlockMpq,
  buildInfiniteDirectSumSlice,
  buildMotherMatrixSlice,
  generatePythonBlockCode
} from '../lib/matrixEngine';
import { isProbablePrimeBig } from '../lib/mathEngine';

interface InfiniteMatrixModuleProps {
  initialP?: number;
  initialQ?: number;
}

export const InfiniteMatrixModule: React.FC<InfiniteMatrixModuleProps> = ({
  initialP = 7,
  initialQ = 53
}) => {
  const [motherMode, setMotherMode] = useState<'triangular' | 'dual'>('triangular');
  const [motherSize, setMotherSize] = useState<number>(9);
  const [pInput, setPInput] = useState<number>(initialP);
  const [qInput, setQInput] = useState<number>(initialQ);
  const [rankInput, setRankInput] = useState<number>(1);
  const [seedInput, setSeedInput] = useState<number>(42);
  const [copiedPy, setCopiedPy] = useState(false);

  // Keep synced when caller jumps from Factorizer or Matrix Inspector
  React.useEffect(() => {
    setPInput(initialP);
    setQInput(initialQ);
  }, [initialP, initialQ]);

  const motherSlice = useMemo(
    () => buildMotherMatrixSlice(motherSize, motherMode),
    [motherSize, motherMode]
  );

  const safeP = Math.min(pInput, qInput);
  const safeQ = Math.max(pInput, qInput);
  const isPPrime = isProbablePrimeBig(BigInt(Math.max(2, safeP)), 10);
  const isQPrime = isProbablePrimeBig(BigInt(Math.max(2, safeQ)), 10);

  const generatedBlock = useMemo(
    () => buildBlockMpq(safeP, safeQ, rankInput, undefined, undefined, seedInput),
    [safeP, safeQ, rankInput, seedInput]
  );

  const directSumSlice = useMemo(
    () => buildInfiniteDirectSumSlice([[2, 3], [3, 5], [safeP, safeQ]], rankInput, seedInput),
    [safeP, safeQ, rankInput, seedInput]
  );

  const pythonSnippet = useMemo(
    () => generatePythonBlockCode(safeP, safeQ, rankInput, seedInput),
    [safeP, safeQ, rankInput, seedInput]
  );

  const copyPython = () => {
    navigator.clipboard.writeText(pythonSnippet);
    setCopiedPy(true);
    setTimeout(() => setCopiedPy(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* 1. Mother Matrix U_infinity Explorer */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
          <div className="space-y-1">
            <div className="text-xs font-mono text-[#1E3A8A]">
              الفصل الثالث · مصفوفة ازدواج الأعداد الأولية
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-serif-academic text-[#1C1917]">
              مستكشف المصفوفة الأم <MathFormula tex="\mathcal{U}_\infty = (\mathcal{U}^P \mid \mathcal{U}^\uparrow)" />
            </h2>
            <p className="text-sm text-[#57534E]">
              العمود الأول <MathFormula tex="c=1" /> يضم كل الأعداد الأولية، وبقية الأعمدة <MathFormula tex="c=q" /> تضم كل الأعداد الشبه أولية <MathFormula tex="pq" />. انقر على أي مدخل شبه أولي لتوليد كتلته أدناه.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center p-1 bg-[#F4F0E8] rounded-lg border border-[#E2DDD2]">
              <button
                onClick={() => setMotherMode('triangular')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  motherMode === 'triangular' ? 'bg-white text-[#1E3A8A] font-semibold border border-[#E2DDD2]' : 'text-[#57534E]'
                }`}
              >
                مثلثي فريد (<MathFormula tex="p \le q" />)
              </button>
              <button
                onClick={() => setMotherMode('dual')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  motherMode === 'dual' ? 'bg-white text-[#1E3A8A] font-semibold border border-[#E2DDD2]' : 'text-[#57534E]'
                }`}
              >
                مزدوج متماثل
              </button>
            </div>

            <select
              value={motherSize}
              onChange={(e) => setMotherSize(Number(e.target.value))}
              className="px-3 py-2 text-xs font-mono bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg text-[#1C1917]"
            >
              <option value={7}>7 أعداد أولية</option>
              <option value={9}>9 أعداد أولية</option>
              <option value={12}>12 عدداً أولياً</option>
            </select>
          </div>
        </div>

        {/* Interactive Matrix U table */}
        <div className="overflow-x-auto pb-1" dir="ltr">
          <table className="border-collapse font-mono-tabular text-xs mx-auto">
            <thead>
              <tr>
                <th className="px-2.5 py-2 text-[#57534E] border-b border-r border-[#E2DDD2] bg-[#FBF9F5]">
                  r \ c
                </th>
                {motherSlice.headers.map((colVal, idx) => (
                  <th
                    key={idx}
                    className={`px-3 py-2 border-b border-[#E2DDD2] font-bold ${
                      colVal === 1 ? 'bg-[#EEF2FF] text-[#1E3A8A]' : 'bg-[#FBF9F5] text-[#1C1917]'
                    }`}
                  >
                    c={colVal}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {motherSlice.cells.map((rowCells, i) => (
                <tr key={i}>
                  <td className="px-2.5 py-2 font-bold text-[#1C1917] bg-[#FBF9F5] border-r border-b border-[#E2DDD2]">
                    p={motherSlice.primes[i]}
                  </td>
                  {rowCells.map((cell, j) => {
                    if (cell.kind === 'MIRROR_ZERO') {
                      return (
                        <td key={j} className="px-3 py-2 text-center text-[#C8C0B0] border-b border-r border-[#F0ECE2]">
                          0
                        </td>
                      );
                    }
                    if (cell.kind === 'PRIME') {
                      return (
                        <td key={j} className="px-3 py-2 text-center font-bold text-[#1E3A8A] bg-[#EEF2FF]/60 border-b border-r border-[#E2DDD2]">
                          {cell.value}
                        </td>
                      );
                    }
                    const isSelected = cell.r === safeP && cell.c === safeQ;
                    return (
                      <td key={j} className="p-0.5 border-b border-r border-[#EAE5DA]">
                        <button
                          onClick={() => {
                            setPInput(cell.r);
                            setQInput(cell.c);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded text-center transition-colors ${
                            isSelected
                              ? 'bg-[#1E3A8A] text-white font-bold'
                              : cell.kind === 'SQUARE'
                              ? 'bg-[#FDE68A]/35 text-[#9A3412] font-semibold hover:bg-[#FDE68A]/60'
                              : 'hover:bg-[#E2DDD2]/60 text-[#1C1917]'
                          }`}
                          title={`M_{${cell.r},${cell.c}} = ${cell.value}`}
                        >
                          {cell.value}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Infinite Block Builder M_{p,q} + Direct Sum M_infinity + Python Export */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold font-serif-academic text-[#1C1917]">
              باني الكتلة اللانهائية <MathFormula tex={`\\mathcal{M}_{${safeP},${safeQ}} = U^{(${safeP})} (V^{(${safeQ})})^T`} />
            </h3>
            <p className="text-xs text-[#57534E]">
              تعميم الرتبة <MathFormula tex="r" /> يحقق <MathFormula tex="\sum_{i,j} (\mathcal{M}_{p,q})_{ij} = p \cdot q" /> بصورة صارمة عند كل رتبة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => { setPInput(7); setQInput(53); setRankInput(1); }}
              className="px-3 py-1.5 rounded-lg bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] font-mono-tabular"
            >
              M_7,53 (= 371)
            </button>
            <button
              onClick={() => { setPInput(23); setQInput(953); setRankInput(3); }}
              className="px-3 py-1.5 rounded-lg bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] font-mono-tabular"
            >
              M_23,953 (= 21919)
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#1C1917] flex justify-between">
              <span>العامل <MathFormula tex="p" /></span>
              <span className={isPPrime ? 'text-[#14532D]' : 'text-[#9A3412]'}>
                {isPPrime ? 'أولي ✓' : 'غير أولي'}
              </span>
            </label>
            <input
              type="number"
              min={2}
              max={100000}
              value={pInput}
              onChange={(e) => setPInput(Math.max(2, Number(e.target.value) || 2))}
              dir="ltr"
              className="w-full px-3 py-2 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-sm text-[#1C1917]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#1C1917] flex justify-between">
              <span>العامل <MathFormula tex="q" /></span>
              <span className={isQPrime ? 'text-[#14532D]' : 'text-[#9A3412]'}>
                {isQPrime ? 'أولي ✓' : 'غير أولي'}
              </span>
            </label>
            <input
              type="number"
              min={2}
              max={100000}
              value={qInput}
              onChange={(e) => setQInput(Math.max(2, Number(e.target.value) || 2))}
              dir="ltr"
              className="w-full px-3 py-2 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-sm text-[#1C1917]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#1C1917]">
              الرتبة <MathFormula tex="r \in [1, 6]" />
            </label>
            <input
              type="range"
              min={1}
              max={6}
              value={rankInput}
              onChange={(e) => setRankInput(Number(e.target.value))}
              className="w-full accent-[#1E3A8A] mt-2"
            />
            <div className="text-xs font-mono-tabular text-[#57534E]" dir="ltr">
              target r = {rankInput} · actual rank = {generatedBlock.actualRank}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#1C1917]">بذرة التقسيم (Seed)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={seedInput}
                onChange={(e) => setSeedInput(Number(e.target.value) || 0)}
                dir="ltr"
                className="w-full px-3 py-2 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-sm text-[#1C1917]"
              />
              <button
                onClick={() => setSeedInput(s => s + 1)}
                className="px-3 py-2 rounded-lg bg-[#F4F0E8] border border-[#E2DDD2] text-xs font-medium hover:border-[#1E3A8A]"
              >
                تجديد
              </button>
            </div>
          </div>
        </div>

        {/* Strict Verification Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] text-xs font-mono-tabular" dir="ltr">
          <div>
            <span className="text-[#57534E] block">Sum(M_{safeP},{safeQ})</span>
            <strong className="text-[#14532D] text-sm">
              {generatedBlock.totalSum} == {generatedBlock.expectedProduct} {generatedBlock.sumVerified ? '✓' : '✖'}
            </strong>
          </div>
          <div>
            <span className="text-[#57534E] block">Shape (m_p × n_q)</span>
            <strong className="text-[#1C1917] text-sm">{generatedBlock.rows} × {generatedBlock.cols}</strong>
          </div>
          <div>
            <span className="text-[#57534E] block">gcd(rowSums)</span>
            <strong className="text-[#9A3412] text-sm">{generatedBlock.gcdRowSums} (mult of q={safeQ})</strong>
          </div>
          <div>
            <span className="text-[#57534E] block">gcd(colSums)</span>
            <strong className="text-[#1E3A8A] text-sm">{generatedBlock.gcdColSums} (mult of p={safeP})</strong>
          </div>
        </div>

        {/* Generated Matrix Display + Direct Sum Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#1C1917]">
              الكتلة المُنشأة <MathFormula tex={`\\mathcal{M}_{${safeP},${safeQ}}`} /> (معزولة LTR):
            </div>
            <div className="overflow-x-auto bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2]" dir="ltr">
              <table className="border-collapse font-mono-tabular text-xs mx-auto">
                <tbody>
                  {generatedBlock.block.map((row, i) => (
                    <tr key={i}>
                      {row.map((val, j) => (
                        <td key={j} className="px-2.5 py-1.5 border border-[#E2DDD2] bg-white text-center text-[#1C1917]">
                          {val}
                        </td>
                      ))}
                      <td className="px-2.5 py-1.5 border border-[#E2DDD2] bg-[#F4F0E8] font-bold text-[#9A3412] text-center">
                        {generatedBlock.rowSums[i]}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    {generatedBlock.colSums.map((cs, j) => (
                      <td key={j} className="px-2.5 py-1.5 border border-[#E2DDD2] bg-[#F4F0E8] font-bold text-[#14532D] text-center">
                        {cs}
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 border border-[#E2DDD2] bg-[#1E3A8A] text-white font-bold text-center">
                      {generatedBlock.totalSum}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#1C1917]">
              معاينة الجمع المباشر <MathFormula tex="\mathcal{M}_\infty = \mathcal{M}_{2,3} \oplus \mathcal{M}_{3,5} \oplus \mathcal{M}_{p,q}" />:
            </div>
            <div className="overflow-x-auto bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2]" dir="ltr">
              <table className="border-collapse font-mono-tabular text-[11px] mx-auto">
                <tbody>
                  {directSumSlice.matrix.map((row, i) => (
                    <tr key={i}>
                      {row.map((val, j) => (
                        <td
                          key={j}
                          className={`px-2 py-1 border border-[#EAE5DA] text-center ${
                            val === 0 ? 'text-[#C8C0B0] bg-[#FBF9F5]' : 'bg-white text-[#1E3A8A] font-semibold'
                          }`}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Python / NumPy Export */}
        <div className="space-y-2 pt-2 border-t border-[#E2DDD2]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1C1917]">
              تصدير كود Python / NumPy لإعادة إنتاج الكتلة <MathFormula tex={`\\mathcal{M}_{${safeP},${safeQ}}`} />:
            </span>
            <button
              onClick={copyPython}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1E3A8A] text-white hover:bg-[#172554] transition-colors"
            >
              {copiedPy ? 'تم النسخ ✓' : 'نسخ كود Python'}
            </button>
          </div>
          <pre
            dir="ltr"
            className="bg-[#F4F0E8] border border-[#E2DDD2] rounded-lg p-4 text-xs font-mono text-[#1C1917] overflow-x-auto select-all"
          >
            {pythonSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default InfiniteMatrixModule;
