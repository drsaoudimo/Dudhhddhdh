import React, { useMemo, useState } from 'react';
import MathFormula from './MathFormula';
import {
  analyzeMatrixStructure,
  parseMatrixText,
  REFERENCE_MATRIX_PRESETS
} from '../lib/matrixEngine';
import { computeV4SieveDiagnostics } from '../v4FallbackOptimizer';
import { MatrixHeatmapD3 } from './MatrixHeatmapD3';

interface MatrixInspectorModuleProps {
  onSendBlockPair?: (p: number, q: number) => void;
}

export const MatrixInspectorModule: React.FC<MatrixInspectorModuleProps> = ({ onSendBlockPair }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<'M' | 'diff' | 'ANT' | 'A1' | 'M_corrected' | 'custom'>('M');
  const [customInput, setCustomInput] = useState<string>(
    '[[12, 24, 36],\n [18, 36, 54]]'
  );
  const [customMatrix, setCustomMatrix] = useState<number[][] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number; val: number } | null>(null);

  const activePreset = REFERENCE_MATRIX_PRESETS.find(p => p.id === selectedPresetId) || REFERENCE_MATRIX_PRESETS[0];
  const activeMatrix = selectedPresetId === 'custom' && customMatrix ? customMatrix : activePreset.matrix;

  const report = useMemo(() => analyzeMatrixStructure(activeMatrix), [activeMatrix]);
  const v4Audit = useMemo(() => computeV4SieveDiagnostics(), []);

  const handleApplyCustom = () => {
    const res = parseMatrixText(customInput);
    if (res.error || !res.matrix) {
      setParseError(res.error);
      return;
    }
    setParseError(null);
    setCustomMatrix(res.matrix);
    setSelectedPresetId('custom');
  };

  const maxAbsVal = Math.max(1e-9, Math.abs(report.maxVal), Math.abs(report.minVal));

  // Detect known exact semiprimes 21919 = 23*953 and 371 = 7*53 for 1-click block jump
  const blockJumpCandidate =
    report.totalSum === 21919
      ? { p: 23, q: 953 }
      : report.totalSum === 371
      ? { p: 7, q: 53 }
      : null;

  return (
    <div className="space-y-6">
      {/* Preset Selector & Custom Paste */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#E2DDD2] pb-4">
          <div className="space-y-1">
            <div className="text-xs font-mono text-[#1E3A8A]">
              الفصل الثاني · فحص المصفوفات المرجعية والملصقة
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-serif-academic text-[#1C1917]">
              فاحص المصفوفات والتحقق من النظريات الثلاث
            </h2>
            <p className="text-sm text-[#57534E] leading-relaxed max-w-3xl">
              تحليل فوري لمجاميع الصفوف والأعمدة، القاسم المشترك الأعظم <MathFormula tex="\gcd" />، الرتبة عبر الحذف الغاوسي، وتدقيق الحارس الإحصائي لرفض <MathFormula tex="T" /> (<code className="font-mono text-xs">FALLBACK_MEDIAN_PRIOR</code>).
            </p>
          </div>
          {blockJumpCandidate && onSendBlockPair && (
            <button
              onClick={() => onSendBlockPair(blockJumpCandidate.p, blockJumpCandidate.q)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1E3A8A] text-white hover:bg-[#172554] transition-colors whitespace-nowrap shrink-0"
            >
              توليد الكتلة <MathFormula tex={`\\mathcal{M}_{${blockJumpCandidate.p},${blockJumpCandidate.q}}`} className="text-white mx-1" />
            </button>
          )}
        </div>

        {/* Presets Bar */}
        <div className="flex flex-wrap gap-2">
          {REFERENCE_MATRIX_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => setSelectedPresetId(preset.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                selectedPresetId === preset.id
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : 'bg-[#F4F0E8] text-[#1C1917] border-[#E2DDD2] hover:border-[#C8C0B0]'
              }`}
            >
              {preset.titleAr}
            </button>
          ))}
          <button
            onClick={() => setSelectedPresetId('custom')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
              selectedPresetId === 'custom'
                ? 'bg-[#9A3412] text-white border-[#9A3412]'
                : 'bg-[#F4F0E8] text-[#1C1917] border-[#E2DDD2] hover:border-[#C8C0B0]'
            }`}
          >
            لصق مصفوفة مخصصة (Custom)
          </button>
        </div>

        {/* Active Preset Description & Formula */}
        {selectedPresetId !== 'custom' && (
          <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <p className="text-xs md:text-sm text-[#57534E] leading-relaxed">
              {activePreset.descriptionAr}
            </p>
            <MathFormula tex={activePreset.formulaLatex} className="text-sm shrink-0" />
          </div>
        )}

        {/* Custom Matrix Paste Panel */}
        {selectedPresetId === 'custom' && (
          <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#1C1917]">
                الصق المصفوفة بصيغة <span className="font-mono">np.array([[...]])</span> أو JSON أو CSV أو مسافات:
              </label>
              <button
                onClick={handleApplyCustom}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#9A3412] text-white hover:bg-[#7C2D12] transition-colors"
              >
                تحليل المصفوفة
              </button>
            </div>
            <textarea
              dir="ltr"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              rows={4}
              className="w-full p-3 bg-white border border-[#E2DDD2] rounded-lg font-mono text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
              placeholder="np.array([[7, 14], [21, 42]])"
            />
            {parseError && (
              <div className="text-xs text-[#9A3412] font-medium">
                ✖ {parseError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Structural KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4">
          <div className="text-[11px] text-[#57534E]">الأبعاد <MathFormula tex="m \times n" /></div>
          <div className="text-xl font-bold font-mono-tabular text-[#1C1917] mt-1" dir="ltr">
            {report.rows} × {report.cols}
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4">
          <div className="text-[11px] text-[#57534E]">المجموع الكلي <MathFormula tex="\sum \mathcal{M}_{ij}" /></div>
          <div className={`text-xl font-bold font-mono-tabular mt-1 ${report.theorem1Passed ? 'text-[#14532D]' : 'text-[#1E3A8A]'}`} dir="ltr">
            {report.totalSum.toLocaleString('en-US')}
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4">
          <div className="text-[11px] text-[#57534E]">الرتبة التقديرية (Rank)</div>
          <div className="text-xl font-bold font-mono-tabular text-[#1C1917] mt-1" dir="ltr">
            rank = {report.estimatedRank}
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4">
          <div className="text-[11px] text-[#57534E]"><MathFormula tex="\gcd(\text{rowSums})" /></div>
          <div className="text-xl font-bold font-mono-tabular text-[#9A3412] mt-1" dir="ltr">
            {report.gcdRowSums}
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4">
          <div className="text-[11px] text-[#57534E]"><MathFormula tex="\gcd(\text{colSums})" /></div>
          <div className="text-xl font-bold font-mono-tabular text-[#14532D] mt-1" dir="ltr">
            {report.gcdColSums}
          </div>
        </div>
      </div>

      {/* Heatmap Matrix + Row/Col Sums */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
          <h3 className="text-base font-bold font-serif-academic text-[#1C1917]">
            التمثيل الحراري والمجاميع الحدية للمصفوفة
          </h3>
          <div className="text-xs font-mono-tabular text-[#1E3A8A]" dir="ltr">
            {hoveredCell
              ? `Entry[${hoveredCell.i}, ${hoveredCell.j}] = ${hoveredCell.val}`
              : `Range: [${report.minVal}, ${report.maxVal}]`}
          </div>
        </div>

        <div className="overflow-x-auto pb-2" dir="ltr">
          <table className="border-collapse font-mono-tabular text-xs mx-auto">
            <thead>
              <tr>
                <th className="p-1.5 text-[10px] text-[#57534E] border-b border-[#E2DDD2]">i \ j</th>
                {activeMatrix[0].map((_, j) => (
                  <th key={j} className="p-1.5 text-[10px] text-[#57534E] border-b border-[#E2DDD2] text-center">
                    c{j}
                  </th>
                ))}
                <th className="p-1.5 text-[10px] font-bold text-[#9A3412] border-b border-l border-[#E2DDD2] text-center">
                  ∑ Row
                </th>
              </tr>
            </thead>
            <tbody>
              {activeMatrix.map((row, i) => (
                <tr key={i}>
                  <td className="p-1.5 text-[10px] text-[#57534E] border-r border-[#E2DDD2] font-semibold">
                    r{i}
                  </td>
                  {row.map((val, j) => {
                    const norm = Math.min(1, Math.abs(val) / maxAbsVal);
                    const bg = val < 0
                      ? `rgba(154, 52, 18, ${0.08 + norm * 0.25})`
                      : `rgba(30, 58, 138, ${0.04 + norm * 0.24})`;
                    return (
                      <td
                        key={j}
                        onMouseEnter={() => setHoveredCell({ i, j, val })}
                        onMouseLeave={() => setHoveredCell(null)}
                        className="px-2 py-1.5 text-center border border-[#EAE5DA] cursor-crosshair transition-colors hover:ring-1 hover:ring-[#1E3A8A]"
                        style={{ backgroundColor: bg }}
                      >
                        {Number.isInteger(val) ? val : val.toFixed(2)}
                      </td>
                    );
                  })}
                  <td className="px-2.5 py-1.5 text-center font-semibold text-[#9A3412] bg-[#FBF9F5] border-l border-b border-[#E2DDD2]">
                    {report.rowSums[i]}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="p-1.5 text-[10px] font-bold text-[#14532D] border-t border-r border-[#E2DDD2]">
                  ∑ Col
                </td>
                {report.colSums.map((cs, j) => (
                  <td key={j} className="px-2 py-1.5 text-center font-semibold text-[#14532D] bg-[#FBF9F5] border-t border-[#E2DDD2]">
                    {cs}
                  </td>
                ))}
                <td className="px-2.5 py-1.5 text-center font-bold text-[#1E3A8A] bg-[#F4F0E8] border-t border-l border-[#E2DDD2]">
                  {report.totalSum}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* D3.js Heatmap Visualization for Sparsity and Pattern Distribution */}
        <div className="pt-2">
          <MatrixHeatmapD3 matrix={activeMatrix} title={selectedPresetId === 'custom' ? 'مصفوفة مخصصة' : activePreset.titleAr} />
        </div>
      </div>

      {/* Three Theorems Verification + v4 Safe FALLBACK_MEDIAN_PRIOR Guard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Three Theorems Box */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
            التحقق الآلي من النظريات الثلاث للكتلة <MathFormula tex="\mathcal{M}_{p,q}" />
          </h3>
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="p-3.5 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] space-y-1">
              <div className="font-bold text-[#1E3A8A] flex items-center justify-between">
                <span>النظرية 1 (المجموع = شبه أولي)</span>
                <span className={report.theorem1Passed ? 'text-[#14532D]' : 'text-[#9A3412]'}>
                  {report.theorem1Passed ? '● محققة' : '▲ حالة مزيج / عام'}
                </span>
              </div>
              <div className="text-[#57534E]">{report.theorem1TotalClassAr}</div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] space-y-1">
              <div className="font-bold text-[#1E3A8A] flex items-center justify-between">
                <span>النظرية 2 (استخراج العوامل من المجاميع)</span>
                <span className="font-mono-tabular text-[#1C1917]" dir="ltr">
                  gcd_row={report.gcdRowSums} · gcd_col={report.gcdColSums}
                </span>
              </div>
              <div className="text-[#57534E]">
                في الكتلة النقية <MathFormula tex="\mathcal{M}_{p,q}" /> يكون <MathFormula tex="\gcd(\text{rowSums}) = q\cdot\gcd(\mathbf{a})" /> و <MathFormula tex="\gcd(\text{colSums}) = p\cdot\gcd(\mathbf{b})" />.
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] space-y-1">
              <div className="font-bold text-[#1E3A8A] flex items-center justify-between">
                <span>النظرية 3 (رتبة المصفوفة وتعميمها r)</span>
                <span className="font-mono-tabular text-[#1C1917]" dir="ltr">
                  rank = {report.estimatedRank}
                </span>
              </div>
              <div className="text-[#57534E]">
                {report.theorem3Rank1Exact
                  ? 'رتبة 1 تامة (جداء خارجي نقي ab^T).'
                  : `رتبة عامة r = ${report.estimatedRank} تندرج تحت التعميم U^{(p)}(V^{(q)})^T من الرتبة <= ${report.estimatedRank}.`}
              </div>
            </div>
          </div>
        </div>

        {/* v4 Safe Fallback Guard on A1, A_NT, M_corrected */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
            <h3 className="text-base font-bold font-serif-academic text-[#1C1917]">
              التدقيق الإحصائي لمصفوفات الغربال (v4 Fallback)
            </h3>
            <span className="text-xs font-mono-tabular font-bold text-[#9A3412]" dir="ltr">
              {v4Audit.tValidation.decision}
            </span>
          </div>

          <p className="text-xs text-[#57534E] leading-relaxed">
            {v4Audit.tValidation.reasonAr}
          </p>

          <div className="grid grid-cols-3 gap-2.5 text-xs font-mono-tabular" dir="ltr">
            <div className="bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">Split-Half T</div>
              <div className="font-bold text-[#9A3412]">{v4Audit.tValidation.splitHalfStability.toFixed(3)}</div>
            </div>
            <div className="bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">LOO Error</div>
              <div className="font-bold text-[#9A3412]">{v4Audit.tValidation.looRelativeError.toFixed(3)}</div>
            </div>
            <div className="bg-[#FBF9F5] p-2.5 rounded border border-[#E2DDD2]">
              <div className="text-[10px] text-[#57534E]">M_corr[2] r</div>
              <div className="font-bold text-[#14532D]">{v4Audit.mCorrelations[2].pearsonCorr.toFixed(3)}</div>
            </div>
          </div>

          <div className="bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2] text-xs font-mono-tabular space-y-1.5" dir="ltr">
            <div className="text-[#57534E]">Prior p_j (M_corrected[2]): [{v4Audit.colPriors6.map(v => v.toFixed(3)).join(', ')}]</div>
            <div className="text-[#1C1917]">
              Row 7 median s_7 = <strong className="text-[#1E3A8A]">{v4Audit.rowScalings[7]?.medianRatio.toFixed(2)}×</strong> (raw {v4Audit.rowScalings[7]?.rawRatioSum.toFixed(2)}×)
              {' · '}
              Row 8 median s_8 = <strong className="text-[#14532D]">{v4Audit.rowScalings[8]?.medianRatio.toFixed(2)}×</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatrixInspectorModule;
