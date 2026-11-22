import React from 'react';
import MathFormula from './MathFormula';
import { UltraPreciseZetaSeed } from '../lib/zfSmartIntegrator';

export interface ZetaLiveTrace {
  activeZeros: number;
  coherencePeak: number;
  resonanceScore: number;
  steps: number;
  precisionDigits?: number;
  seeds?: Array<{
    peakIndex: number;
    delta: number;
    resonance: number;
    pSeed: string;
    tSeed: string;
    sigmaSeed: string;
    kMult: number;
  }>;
}

interface ZetaFactorPanelProps {
  nValue: string;
  zetaTrace: ZetaLiveTrace | null;
  bd500Seeds: UltraPreciseZetaSeed[];
  isRunning: boolean;
  onGenerateSeeds500d: () => void;
  onLaunchZeta: () => void;
  onStop: () => void;
}

export const ZetaFactorPanel: React.FC<ZetaFactorPanelProps> = ({
  nValue,
  zetaTrace,
  bd500Seeds,
  isRunning,
  onGenerateSeeds500d,
  onLaunchZeta,
  onStop
}) => {
  const hasTraceSeeds = zetaTrace?.seeds && zetaTrace.seeds.length > 0;

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-[#1E3A8A]">
            أصفار ريمان زيتا الدقيقة · 48 صفراً (50 خانة محققة |ζ| &lt; 10⁻⁴⁰) + بذور 500d / 160d
          </div>
          <h3 className="text-lg font-bold font-serif-academic text-[#1C1917]">
            استخلاص البذور الفائقة الدقة وإيجاد العوامل بطيف أصفار زيتا
          </h3>
          <div className="text-xs text-[#57534E]">
            <MathFormula tex="\Psi(\delta) = -\sum_{n=1}^{48} \frac{w_n}{\sqrt{\frac{1}{4}+\gamma_n^2}} \cos\!\big((\gamma_n \ln\sqrt{N}-\phi_n)\bmod 2\pi + \gamma_n\delta\big), \quad p_{\text{seed}} = \lfloor \sqrt{N}\,e^{\delta^*} \rceil" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={onGenerateSeeds500d}
            disabled={isRunning || !nValue.trim()}
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#F4F0E8] hover:bg-[#EAE5DA] border border-[#E2DDD2] text-[#1C1917] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            توليد بذور 500 خانة الآن
          </button>
          {!isRunning ? (
            <button
              onClick={onLaunchZeta}
              disabled={!nValue.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              تشغيل التفكيك بأصفار زيتا
            </button>
          ) : (
            <button
              onClick={onStop}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#9A3412] hover:bg-[#7C2D12] text-white transition-colors whitespace-nowrap"
            >
              إيقاف محرك زيتا
            </button>
          )}
        </div>
      </div>

      {/* Live Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">الأصفار النشطة (تلقائي حسب حجم N)</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#1E3A8A]">
            {zetaTrace?.activeZeros ?? (nValue.trim() ? (BigInt(nValue.replace(/[^0-9]/g, '') || '2').toString(2).length > 500 ? 2048 : (BigInt(nValue.replace(/[^0-9]/g, '') || '2').toString(2).length > 256 ? 1024 : 256)) : 2048)} / 2048
          </div>
        </div>
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">دقة الحساب العشري</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#14532D]">
            {zetaTrace?.precisionDigits ? `${zetaTrace.precisionDigits}d (Worker) / 500d` : '500d (BD500)'}
          </div>
        </div>
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">ذروة التماسك الطيفي δ*</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#1C1917]">
            {zetaTrace ? zetaTrace.coherencePeak.toFixed(6) : (bd500Seeds[0] ? Number(bd500Seeds[0].delta500d).toFixed(6) : '—')}
          </div>
        </div>
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3">
          <div className="text-[11px] text-[#57534E]">شدة الرنين / الخطوات</div>
          <div dir="ltr" className="text-base font-mono-tabular font-bold text-[#9A3412]">
            {zetaTrace ? `${zetaTrace.resonanceScore.toFixed(5)} · ${zetaTrace.steps.toLocaleString()}` : (bd500Seeds[0] ? bd500Seeds[0].resonanceScore.toFixed(5) : '—')}
          </div>
        </div>
      </div>

      {/* Ultra-Precise Generated Seeds Table */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-[#1C1917]">
          البذور المولدة فائقة الدقة (النسبة الذهبية + اختزال الطور 500 خانة):
        </div>

        {(bd500Seeds.length > 0 || hasTraceSeeds) ? (
          <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg" dir="ltr">
            <table className="w-full text-left text-xs font-mono-tabular">
              <thead>
                <tr className="bg-[#F4F0E8] text-[#57534E] border-b border-[#E2DDD2]">
                  <th className="py-2 px-3">Peak</th>
                  <th className="py-2 px-3">δ* (Golden Refined)</th>
                  <th className="py-2 px-3">Resonance</th>
                  <th className="py-2 px-3">Candidate p_seed</th>
                  <th className="py-2 px-3">Fermat t_seed</th>
                  <th className="py-2 px-3">ECM σ_seed</th>
                  <th className="py-2 px-3">k</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE5DA] bg-white">
                {bd500Seeds.length > 0
                  ? bd500Seeds.map((sd, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 font-bold text-[#1E3A8A]">#{sd.peakIndex + 1}</td>
                        <td className="py-1.5 px-3 text-[#1C1917]">{sd.delta500d.slice(0, 18)}</td>
                        <td className="py-1.5 px-3 font-bold text-[#14532D]">{sd.resonanceScore.toFixed(6)}</td>
                        <td className="py-1.5 px-3 text-[#1C1917]">
                          {sd.candidatePSeed.length > 22 ? `${sd.candidatePSeed.slice(0, 12)}...${sd.candidatePSeed.slice(-8)}` : sd.candidatePSeed}
                        </td>
                        <td className="py-1.5 px-3 text-[#57534E]">
                          {sd.fermatTSeed.length > 22 ? `${sd.fermatTSeed.slice(0, 12)}...${sd.fermatTSeed.slice(-8)}` : sd.fermatTSeed}
                        </td>
                        <td className="py-1.5 px-3 text-[#9A3412]">{sd.ecmSigmaSeed}</td>
                        <td className="py-1.5 px-3 font-bold text-[#1C1917]">{sd.suggestedK}</td>
                      </tr>
                    ))
                  : zetaTrace?.seeds?.map((sd, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 font-bold text-[#1E3A8A]">#{sd.peakIndex + 1}</td>
                        <td className="py-1.5 px-3 text-[#1C1917]">{sd.delta.toFixed(8)}</td>
                        <td className="py-1.5 px-3 font-bold text-[#14532D]">{sd.resonance.toFixed(6)}</td>
                        <td className="py-1.5 px-3 text-[#1C1917]">
                          {sd.pSeed.length > 22 ? `${sd.pSeed.slice(0, 12)}...${sd.pSeed.slice(-8)}` : sd.pSeed}
                        </td>
                        <td className="py-1.5 px-3 text-[#57534E]">
                          {sd.tSeed.length > 22 ? `${sd.tSeed.slice(0, 12)}...${sd.tSeed.slice(-8)}` : sd.tSeed}
                        </td>
                        <td className="py-1.5 px-3 text-[#9A3412]">{sd.sigmaSeed}</td>
                        <td className="py-1.5 px-3 font-bold text-[#1C1917]">{sd.kMult}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-[#57534E] bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4">
            اضغط «توليد بذور 500 خانة الآن» أو «تشغيل التفكيك بأصفار زيتا» لحساب القمم الطيفية عبر 48 صفراً غير تافه بدقة 500/160 خانة عشرية وتوجيه مسح GCD، تطابق فيرما/هارت التربيعي، منحنيات ECM REDC، وخوارزمية Brent.
          </div>
        )}
      </div>
    </div>
  );
};

export default ZetaFactorPanel;
