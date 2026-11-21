import React, { useMemo, useState } from 'react';
import MathFormula from './MathFormula';
import {
  computeDirichletSpectrum,
  computePrimeCountingComparison,
  RIEMANN_ZEROS,
  sievePrimesAndMobius
} from '../lib/mathEngine';
import { ZetaZerosScatterD3 } from './ZetaZerosScatterD3';

export const ZetaSpectrumModule: React.FC = () => {
  const [maxX, setMaxX] = useState<number>(250);
  const [zeroCount, setZeroCount] = useState<number>(10);
  const [mobiusDepth, setMobiusDepth] = useState<number>(5);
  const [hoverDirIdx, setHoverDirIdx] = useState<number | null>(null);
  const [hoverCountIdx, setHoverCountIdx] = useState<number | null>(null);

  const dirichletData = useMemo(() => computeDirichletSpectrum(300), []);
  const countingData = useMemo(
    () => computePrimeCountingComparison(maxX, zeroCount, mobiusDepth),
    [maxX, zeroCount, mobiusDepth]
  );
  const mobiusSample = useMemo(() => sievePrimesAndMobius(12).mu, []);

  // SVG layout bounds
  const W = 560;
  const H = 220;
  const PAD = 36;

  const maxD = Math.max(...dirichletData.map(d => d.totalD), 1);
  const dirPtsTotal = dirichletData
    .map((d, idx) => {
      const x = PAD + (idx / Math.max(1, dirichletData.length - 1)) * (W - 2 * PAD);
      const y = H - PAD - (d.totalD / maxD) * (H - 2 * PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const dirPtsPrime = dirichletData
    .map((d, idx) => {
      const x = PAD + (idx / Math.max(1, dirichletData.length - 1)) * (W - 2 * PAD);
      const y = H - PAD - (d.primeTerm / maxD) * (H - 2 * PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const dirPtsSemi = dirichletData
    .map((d, idx) => {
      const x = PAD + (idx / Math.max(1, dirichletData.length - 1)) * (W - 2 * PAD);
      const y = H - PAD - (d.semiprimeTerm / maxD) * (H - 2 * PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const maxPi = Math.max(
    ...countingData.map(p => Math.max(p.piActual, p.pi2Actual, p.riemannApprox, p.semiprimeApprox)),
    1
  );
  const makeCountLine = (selector: (pt: typeof countingData[number]) => number) =>
    countingData
      .map((pt, idx) => {
        const x = PAD + (idx / Math.max(1, countingData.length - 1)) * (W - 2 * PAD);
        const y = H - PAD - (selector(pt) / maxPi) * (H - 2 * PAD);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const activeDir = hoverDirIdx !== null ? dirichletData[hoverDirIdx] : dirichletData[0];
  const activeCount = hoverCountIdx !== null ? countingData[hoverCountIdx] : countingData[countingData.length - 1];

  return (
    <div className="space-y-6">
      {/* Header & Equations Card */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
        <div className="space-y-1 border-b border-[#E2DDD2] pb-4">
          <div className="text-xs font-mono text-[#1E3A8A]">
            الفصل الرابع · متسلسلة دركليه وأصفار ريمان والطيف الإحصائي
          </div>
          <h2 className="text-xl md:text-2xl font-bold font-serif-academic text-[#1C1917]">
            محاكاة دالة زيتا الأولية <MathFormula tex="P(s)" /> ومتسلسلة <MathFormula tex="\mathcal{D}(s)" />
          </h2>
          <p className="text-sm text-[#57534E] leading-relaxed max-w-3xl">
            تتحكم أصفار ريمان غير التافهة <MathFormula tex="\rho_k = \tfrac{1}{2} + i\gamma_k" /> في التوزيع الطيفي للأعداد الأولية والشبه أولية عبر <MathFormula tex="P(s) = \sum_{k\ge 1} \frac{\mu(k)}{k}\log\zeta(ks)" />؛ فهي ترشد البحث الإحصائي، بينما القسمة والغربلة تحسمان تفكيك العدد بعينه.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2]">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#1E3A8A] text-center">دالة التوليد الكلية للمصفوفة الأم</div>
            <MathFormula
              display
              tex="\mathcal{D}(s) = P(s-1) + \frac{P(s-1)^2 + P(2s-2)}{2}, \quad P(s)=\sum_{p\in\mathcal{P}} p^{-s}"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#9A3412] text-center">دالة ريمان الصريحة ومعاملات موبيوس</div>
            <MathFormula
              display
              tex="R(x)=\sum_{k=1}^{K_\mu}\frac{\mu(k)}{k}\operatorname{li}(x^{1/k}) - \sum_{k=1}^{K_\gamma}\frac{2\sqrt{x}\cos(\gamma_k\ln x-\theta_k)}{\ln x\sqrt{\tfrac{1}{4}+\gamma_k^2}}"
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold text-[#1C1917]">
            <span>الحد الأعلى للعد <MathFormula tex="x_{\max}" /></span>
            <span className="font-mono-tabular text-[#1E3A8A]" dir="ltr">{maxX}</span>
          </div>
          <input
            type="range"
            min={60}
            max={500}
            step={10}
            value={maxX}
            onChange={(e) => setMaxX(Number(e.target.value))}
            className="w-full accent-[#1E3A8A]"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold text-[#1C1917]">
            <span>أصفار ريمان النشطة <MathFormula tex="K_\gamma" /></span>
            <span className="font-mono-tabular text-[#9A3412]" dir="ltr">{zeroCount} / {RIEMANN_ZEROS.length}</span>
          </div>
          <input
            type="range"
            min={0}
            max={RIEMANN_ZEROS.length}
            step={1}
            value={zeroCount}
            onChange={(e) => setZeroCount(Number(e.target.value))}
            className="w-full accent-[#9A3412]"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold text-[#1C1917]">
            <span>عمق متسلسلة موبيوس <MathFormula tex="\mu(k)" /></span>
            <span className="font-mono-tabular text-[#14532D]" dir="ltr">k ≤ {mobiusDepth}</span>
          </div>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={mobiusDepth}
            onChange={(e) => setMobiusDepth(Number(e.target.value))}
            className="w-full accent-[#14532D]"
          />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Dirichlet Generating Function D(s) */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2.5">
            <h3 className="text-sm font-bold font-serif-academic text-[#1C1917]">
              تحلل متسلسلة دركليه <MathFormula tex="\mathcal{D}(s)" /> (الأوليات مقابل شبه الأوليات)
            </h3>
            {activeDir && (
              <span className="text-[11px] font-mono-tabular text-[#1E3A8A]" dir="ltr">
                s={activeDir.s} · D={activeDir.totalD} · P={activeDir.primeTerm}
              </span>
            )}
          </div>

          <div dir="ltr" className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-2">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto cursor-crosshair"
              onMouseLeave={() => setHoverDirIdx(null)}
            >
              {/* Grid hairlines */}
              {[0.25, 0.5, 0.75, 1].map((t, idx) => (
                <line
                  key={idx}
                  x1={PAD}
                  x2={W - PAD}
                  y1={H - PAD - t * (H - 2 * PAD)}
                  y2={H - PAD - t * (H - 2 * PAD)}
                  stroke="#E2DDD2"
                  strokeDasharray="3 3"
                />
              ))}
              <line x1={PAD} x2={PAD} y1={PAD} y2={H - PAD} stroke="#A89F8D" />
              <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#A89F8D" />

              <polyline fill="none" stroke="#1E3A8A" strokeWidth="2.5" points={dirPtsTotal} />
              <polyline fill="none" stroke="#9A3412" strokeWidth="2" strokeDasharray="5 3" points={dirPtsSemi} />
              <polyline fill="none" stroke="#14532D" strokeWidth="2" points={dirPtsPrime} />

              {dirichletData.map((d, idx) => {
                const x = PAD + (idx / Math.max(1, dirichletData.length - 1)) * (W - 2 * PAD);
                const y = H - PAD - (d.totalD / maxD) * (H - 2 * PAD);
                return (
                  <g key={idx}>
                    <rect
                      x={x - 8}
                      y={PAD}
                      width={16}
                      height={H - 2 * PAD}
                      fill="transparent"
                      onMouseEnter={() => setHoverDirIdx(idx)}
                    />
                    {hoverDirIdx === idx && (
                      <circle cx={x} cy={y} r={4} fill="#1E3A8A" stroke="#FFFFFF" strokeWidth={1.5} />
                    )}
                  </g>
                );
              })}

              <text x={PAD} y={H - 12} fontSize="10" fill="#57534E" fontFamily="IBM Plex Mono">s=2.08</text>
              <text x={W - PAD - 36} y={H - 12} fontSize="10" fill="#57534E" fontFamily="IBM Plex Mono">s=3.84</text>
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-[#57534E]">
            <span className="text-[#1E3A8A] font-semibold">━━ D(s) الكلية</span>
            <span className="text-[#9A3412] font-semibold">╌╌ مساهمة شبه الأوليات</span>
            <span className="text-[#14532D] font-semibold">━━ P(s-1) الأوليات</span>
          </div>
        </div>

        {/* Chart 2: pi(x) & pi_2(x) vs Riemann Explicit Formula */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-2.5">
            <h3 className="text-sm font-bold font-serif-academic text-[#1C1917]">
              دوال العد <MathFormula tex="\pi(x)" /> و <MathFormula tex="\pi_2(x)" /> مع تقريب أصفار ريمان
            </h3>
            {activeCount && (
              <span className="text-[11px] font-mono-tabular text-[#14532D]" dir="ltr">
                x={activeCount.x} · π={activeCount.piActual} (R≈{activeCount.riemannApprox}) · π₂={activeCount.pi2Actual}
              </span>
            )}
          </div>

          <div dir="ltr" className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-2">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto cursor-crosshair"
              onMouseLeave={() => setHoverCountIdx(null)}
            >
              {[0.25, 0.5, 0.75, 1].map((t, idx) => (
                <line
                  key={idx}
                  x1={PAD}
                  x2={W - PAD}
                  y1={H - PAD - t * (H - 2 * PAD)}
                  y2={H - PAD - t * (H - 2 * PAD)}
                  stroke="#E2DDD2"
                  strokeDasharray="3 3"
                />
              ))}
              <line x1={PAD} x2={PAD} y1={PAD} y2={H - PAD} stroke="#A89F8D" />
              <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#A89F8D" />

              <polyline fill="none" stroke="#1E3A8A" strokeWidth="2.2" points={makeCountLine(p => p.piActual)} />
              <polyline fill="none" stroke="#9A3412" strokeWidth="2" strokeDasharray="4 3" points={makeCountLine(p => p.riemannApprox)} />
              <polyline fill="none" stroke="#14532D" strokeWidth="2.2" points={makeCountLine(p => p.pi2Actual)} />
              <polyline fill="none" stroke="#57534E" strokeWidth="1.4" strokeDasharray="2 3" points={makeCountLine(p => p.semiprimeApprox)} />

              {countingData.map((pt, idx) => {
                const x = PAD + (idx / Math.max(1, countingData.length - 1)) * (W - 2 * PAD);
                const y = H - PAD - (pt.piActual / maxPi) * (H - 2 * PAD);
                return (
                  <g key={idx}>
                    <rect
                      x={x - 6}
                      y={PAD}
                      width={12}
                      height={H - 2 * PAD}
                      fill="transparent"
                      onMouseEnter={() => setHoverCountIdx(idx)}
                    />
                    {hoverCountIdx === idx && (
                      <circle cx={x} cy={y} r={4} fill="#1E3A8A" stroke="#FFFFFF" strokeWidth={1.5} />
                    )}
                  </g>
                );
              })}

              <text x={PAD} y={H - 12} fontSize="10" fill="#57534E" fontFamily="IBM Plex Mono">x=10</text>
              <text x={W - PAD - 36} y={H - 12} fontSize="10" fill="#57534E" fontFamily="IBM Plex Mono">x={maxX}</text>
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-[#57534E]">
            <span className="text-[#1E3A8A] font-semibold">━━ π(x) الفعلية</span>
            <span className="text-[#9A3412] font-semibold">╌╌ R(x) بأصفار ريمان</span>
            <span className="text-[#14532D] font-semibold">━━ π₂(x) شبه الأولية</span>
            <span className="text-[#57534E]">┈┈ التقريب المقارب لشبه الأولية</span>
          </div>
        </div>
      </div>

      {/* D3.js Critical Line Re(s) = 0.5 Scatter Plot for Riemann Zeros */}
      <div>
        <ZetaZerosScatterD3 activeZeroCount={zeroCount} />
      </div>

      {/* Active Zeros & Mobius Table */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="text-xs font-bold text-[#1C1917]">معاملات موبيوس <MathFormula tex="\mu(k)" /> (<MathFormula tex="1 \le k \le 12" />)</div>
          <div className="grid grid-cols-6 gap-1.5 font-mono-tabular text-xs" dir="ltr">
            {Array.from({ length: 12 }, (_, idx) => idx + 1).map(k => (
              <div
                key={k}
                className={`p-2 rounded border text-center ${
                  k <= mobiusDepth ? 'bg-[#FBF9F5] border-[#1E3A8A]/40' : 'bg-[#F4F0E8] border-[#E2DDD2] opacity-55'
                }`}
              >
                <div className="text-[10px] text-[#57534E]">μ({k})</div>
                <div className={`font-bold ${mobiusSample[k] > 0 ? 'text-[#14532D]' : mobiusSample[k] < 0 ? 'text-[#9A3412]' : 'text-[#57534E]'}`}>
                  {mobiusSample[k]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-[#1C1917]">الأجزاء التخيلية لأصفار ريمان النشطة <MathFormula tex="\gamma_k" /></div>
          <div className="flex flex-wrap gap-2 font-mono-tabular text-xs" dir="ltr">
            {RIEMANN_ZEROS.slice(0, zeroCount).map((g, idx) => (
              <span key={idx} className="px-2 py-1 rounded bg-[#FBF9F5] border border-[#E2DDD2] text-[#1C1917]">
                γ_{idx + 1}={g.toFixed(3)}
              </span>
            ))}
            {zeroCount === 0 && (
              <span className="text-[#57534E] text-xs">لم يتم تفعيل أي صفر طيفي (خط أساس ناعم فقط).</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZetaSpectrumModule;
