import React, { useMemo } from 'react';
import MathFormula from './MathFormula';
import { analyzeTargetWithZf151716 } from '../lib/zfSmartIntegrator';

interface ZfSmartIntegrationDashboardProps {
  nValue: string;
  effectiveWorkerCount: number;
}

export const ZfSmartIntegrationDashboard: React.FC<ZfSmartIntegrationDashboardProps> = ({
  nValue,
  effectiveWorkerCount
}) => {
  const analysis = useMemo(() => {
    try {
      if (!nValue.trim()) return null;
      const bigN = BigInt(nValue.replace(/[^0-9]/g, ''));
      return analyzeTargetWithZf151716(bigN, effectiveWorkerCount);
    } catch {
      return null;
    }
  }, [nValue, effectiveWorkerCount]);

  if (!analysis) return null;

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E2DDD2] pb-4">
        <div>
          <div className="text-xs font-mono text-[#1E3A8A]">
            التكامل الذكي ZF-15 · ZF-17 · ZF-16 مع خوارزميات التحليل
          </div>
          <h3 className="text-lg md:text-xl font-bold font-serif-academic text-[#1C1917]">
            لوحة التوجيه الطيفي والتقدير العددي لرتبة العامل
          </h3>
        </div>
        <div className="bg-[#F4F0E8] px-3.5 py-2 rounded-lg border border-[#E2DDD2] text-xs font-mono text-[#14532D]">
          {analysis.summaryAr}
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-[#57534E]">رتبة العامل المقدرة <MathFormula tex="r_0" /></div>
          <div className="text-lg font-bold font-mono-tabular text-[#1E3A8A]" dir="ltr">
            {analysis.estimatedRank.toLocaleString()}
          </div>
          <div className="text-[10px] text-[#57534E]" dir="ltr">
            نطاق: [{analysis.rankWindow[0].toLocaleString()} .. {analysis.rankWindow[1].toLocaleString()}]
          </div>
        </div>

        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-[#57534E]">الإنتروبيا الطيفية <MathFormula tex="H(A)" /></div>
          <div className="text-lg font-bold font-mono-tabular text-[#14532D]" dir="ltr">
            {analysis.spectralEntropy.toFixed(3)}
          </div>
          <div className="text-[10px] text-[#57534E]">توزيع البصمة الطيفية ZF-17</div>
        </div>

        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-[#57534E]">رقم الشرط <MathFormula tex="\kappa(A)" /></div>
          <div className="text-lg font-bold font-mono-tabular text-[#9A3412]" dir="ltr">
            {analysis.conditionNumber}
          </div>
          <div className="text-[10px] text-[#57534E]">نسبة القيمة الكبرى للصلبة الصغرى</div>
        </div>

        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] text-[#57534E]">جذر العدد <MathFormula tex="\sqrt{N}" /></div>
          <div className="text-xs font-bold font-mono-tabular text-[#1C1917] truncate mt-1" dir="ltr">
            {analysis.sqrtN}
          </div>
          <div className="text-[10px] text-[#57534E]">{analysis.nBits} بت إجمالي</div>
        </div>
      </div>

      {/* Worker Guidance & Probability Ranking Table */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-[#1C1917] flex items-center justify-between">
          <span>توجيه خيوط المعالجة عبر ZF-16 (Hybrid Rank-Rho Probability Guidance):</span>
          <span className="text-[11px] font-mono text-[#1E3A8A]">{analysis.workerGuidance.length} خيوط نشطة</span>
        </div>

        <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#F4F0E8] text-[#1C1917] font-mono border-b border-[#E2DDD2]">
              <tr>
                <th className="p-2.5">الخيط (Worker #)</th>
                <th className="p-2.5">المضاعف المقترح (k)</th>
                <th className="p-2.5">إزاحة البذرة (Seed Offset)</th>
                <th className="p-2.5">وزن الاحتمالية (Probability Weight)</th>
                <th className="p-2.5">نطاق البحث الموجه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DDD2]">
              {analysis.workerGuidance.map((w) => (
                <tr key={w.workerId} className="hover:bg-[#FBF9F5] font-mono-tabular">
                  <td className="p-2.5 font-bold text-[#1E3A8A]">Worker #{w.workerId + 1}</td>
                  <td className="p-2.5 text-[#1C1917]">{w.recommendedMultiplier}</td>
                  <td className="p-2.5 text-[#57534E]">{w.seedOffset.toLocaleString()}</td>
                  <td className="p-2.5 text-[#14532D] font-bold">{(w.probabilityWeight * 100).toFixed(1)}%</td>
                  <td className="p-2.5 text-[#9A3412] font-semibold">{w.searchIntervalHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-[#57534E] leading-relaxed italic bg-[#FBF9F5] p-3 rounded-lg border border-[#E2DDD2]">
        * ملاحظة التكامل: تستغل هذه اللوحة مخرجات ZF-15 في تقدير نطاق رتبة العامل، ومعاملات ZF-17 الطيفية لتوليد أوزان احتمالية دقيقة تغذي خوارزميات Pollard-Brent و SIQS في ZF-16.
      </div>
    </div>
  );
};

export default ZfSmartIntegrationDashboard;
