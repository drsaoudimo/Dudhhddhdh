import React from 'react';
import MathFormula from './MathFormula';
import { ChronosCfracInfo } from './Chronos196Dashboard';
import { EmpiricalBenchmarkRun } from '../v4FallbackOptimizer';

interface CfracTelemetryPanelProps {
  nValue: string;
  cfracInfo: ChronosCfracInfo | null;
  isRunning: boolean;
  benchmarkHistory: EmpiricalBenchmarkRun[];
  onLaunchCfrac: () => void;
  onStop: () => void;
}

export const CfracTelemetryPanel: React.FC<CfracTelemetryPanelProps> = ({
  nValue,
  cfracInfo,
  isRunning,
  benchmarkHistory,
  onLaunchCfrac,
  onStop
}) => {
  const cfracRun = benchmarkHistory.find(r => r.n === nValue.trim() && r.mode === 'cfrac');
  const siqsV4Run = benchmarkHistory.find(r => r.n === nValue.trim() && r.mode === 'v4-fallback');
  const siqsVanillaRun = benchmarkHistory.find(r => r.n === nValue.trim() && r.mode === 'vanilla');
  const siqsRef = siqsV4Run || siqsVanillaRun;

  const progressPct =
    cfracInfo && cfracInfo.targetRelations > 0
      ? Math.min(100, Math.round((cfracInfo.smoothRelations / cfracInfo.targetRelations) * 100))
      : 0;

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-[#14532D]">
            خوارزمية الكسور المستمرة · CFRAC + GF(2) Block Wiedemann
          </div>
          <h3 className="text-lg font-bold font-serif-academic text-[#1C1917]">
            نشر الكسر المستمر للعدد <MathFormula tex="\sqrt{kN}" /> واستخراج المتقاربات الملساء
          </h3>
          <div className="text-xs text-[#57534E]">
            <MathFormula tex="P_{k+1}=a_k Q_k - P_k,\; Q_{k+1}=\frac{kN - P_{k+1}^2}{Q_k},\; A_k^2 \equiv (-1)^{k+1} Q_{k+1} \pmod N" />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isRunning ? (
            <button
              onClick={onLaunchCfrac}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#14532D] hover:bg-[#052E16] text-white transition-colors whitespace-nowrap"
            >
              تشغيل التفكيك بـ CFRAC الآن
            </button>
          ) : (
            <button
              onClick={onStop}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#9A3412] hover:bg-[#7C2D12] text-white transition-colors whitespace-nowrap"
            >
              إيقاف CFRAC
            </button>
          )}
        </div>
      </div>

      {/* Live Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">المضاعف k</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#1C1917]">
            {cfracInfo?.kMultiplier ?? 1}
          </div>
        </div>
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">خطوات المتقاربات</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#1E3A8A]">
            {(cfracInfo?.steps ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">قاعدة العوامل FB</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#1C1917]">
            {cfracInfo?.fbSize ?? '—'}
          </div>
        </div>
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">العلاقات الملساء / المطلوب</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#14532D]">
            {cfracInfo ? `${cfracInfo.smoothRelations} / ${cfracInfo.targetRelations}` : '0 / —'}
          </div>
        </div>
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">جزئيات / تصادمات 1LP</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#9A3412]">
            {cfracInfo ? `${cfracInfo.partialRelations} (${cfracInfo.lpCollisions})` : '0 (0)'}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {cfracInfo && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-[#57534E]">
            <span>{cfracInfo.statusLabel || 'تجميع العلاقات الملساء لإدخالها في مصفوفة GF(2)'}</span>
            <span dir="ltr" className="font-mono-tabular font-bold text-[#1C1917]">{progressPct}%</span>
          </div>
          <div className="w-full h-2 bg-[#EAE5DA] rounded-full overflow-hidden">
            <div
              style={{ width: `${progressPct}%` }}
              className="h-full bg-[#14532D] transition-all duration-200"
            />
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison vs SIQS */}
      {(cfracRun || siqsRef) && (
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 space-y-2">
          <div className="text-xs font-bold text-[#1C1917]">مقارنة معيارية على نفس العدد N: CFRAC مقابل SIQS</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono-tabular" dir="ltr">
            <div className="bg-white border border-[#E2DDD2] rounded p-3 space-y-1">
              <div className="font-bold text-[#14532D]">CFRAC (Continued Fractions)</div>
              {cfracRun ? (
                <div className="text-[#1C1917]">
                  Time: <strong>{cfracRun.durationMs} ms</strong> · Relations: <strong>{cfracRun.relationsCollected}</strong> ({cfracRun.lpCollisions} 1LP) · Speed: {cfracRun.relationsPerSec.toFixed(1)} rel/s
                </div>
              ) : (
                <div className="text-[#57534E]">Not yet recorded for current N — click Launch CFRAC above.</div>
              )}
            </div>
            <div className="bg-white border border-[#E2DDD2] rounded p-3 space-y-1">
              <div className="font-bold text-[#1E3A8A]">Chronos SIQS ({siqsRef ? siqsRef.mode : 'Standby'})</div>
              {siqsRef ? (
                <div className="text-[#1C1917]">
                  Time: <strong>{siqsRef.durationMs} ms</strong> · Relations: <strong>{siqsRef.relationsCollected}</strong> ({siqsRef.lpCollisions} 1LP) · Speed: {siqsRef.relationsPerSec.toFixed(1)} rel/s
                </div>
              ) : (
                <div className="text-[#57534E]">Switch strategy to Chronos v4 SIQS on same N to compare.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Convergents Live Sample Table */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-[#1C1917]">
          عينة حية من المتقاربات المولدة (<MathFormula tex="a_k, Q_{k+1}, A_k \bmod N" />):
        </div>
        {cfracInfo && cfracInfo.convergentsSample.length > 0 ? (
          <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg" dir="ltr">
            <table className="w-full text-left text-xs font-mono-tabular">
              <thead>
                <tr className="bg-[#F4F0E8] text-[#57534E] border-b border-[#E2DDD2]">
                  <th className="py-2 px-3">Step k</th>
                  <th className="py-2 px-3">a_k</th>
                  <th className="py-2 px-3">(-1)^(k+1) Q_(k+1)</th>
                  <th className="py-2 px-3">A_k mod N</th>
                  <th className="py-2 px-3">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE5DA] bg-white">
                {cfracInfo.convergentsSample.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-1.5 px-3 text-[#57534E]">{row.step}</td>
                    <td className="py-1.5 px-3 text-[#1C1917] font-bold">{row.a_val}</td>
                    <td className="py-1.5 px-3 text-[#1E3A8A]">{row.q_val}</td>
                    <td className="py-1.5 px-3 text-[#1C1917]">{row.a_cap || '—'}</td>
                    <td className={`py-1.5 px-3 font-bold ${
                      row.status === 'smooth'
                        ? 'text-[#14532D]'
                        : row.status === '1lp'
                        ? 'text-[#1E3A8A]'
                        : 'text-[#57534E]'
                    }`}>
                      {row.status === 'smooth' ? '● Smooth' : row.status === '1lp' ? '◐ 1-Large Prime' : 'Composite'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-[#57534E] bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4">
            اختر عدداً مركباً أو شبه أولي (مثال: 64 بت أو 96 بت أو 116 بت) ثم شغّل خوارزمية CFRAC لمشاهدة نشر الكسور المستمرة وتجميع العلاقات الملساء نحو مصفوفة GF(2).
          </div>
        )}
      </div>
    </div>
  );
};

export default CfracTelemetryPanel;
