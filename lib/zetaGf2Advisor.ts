import { gcd, bigIntSqrt } from '../mathUtils';
import { generateUltraPreciseZetaSeeds, UltraPreciseZetaSeed } from './zfSmartIntegrator';

export interface ZetaGf2GuidanceResult {
  zetaBeneficial: boolean;
  mode:
    | 'direct-hit'
    | 'guided-ks-sieve'
    | 'guided-ecm-only'
    | 'bypassed-small'
    | 'bypassed-low-coherence';
  directFactor?: bigint;
  selectedK: number;
  cfracMultipliers: number[];
  sieveHalfWidthScale: number;
  zetaSeeds: UltraPreciseZetaSeed[];
  coherenceContrast: number;
  summaryAr: string;
}

/**
 * Evaluates whether Riemann Zeta spectral zeros are mathematically beneficial for
 * steering the shared GF(2) (SIQS + CFRAC -> Block Wiedemann) pipeline on modulus N.
 * - For < 88 bits: bypassed (zero overhead; direct GF(2)/scouts finish faster).
 * - For >= 88 bits:
 *   1) Tests a micro-neighborhood around Zeta p_seed & fermatTSeed (~1ms direct hit).
 *   2) Evaluates spectral coherence contrast and intersects Zeta k suggestions with
 *      top-tier Knuth-Schroeppel QR multipliers so sieve smoothness is never degraded.
 *   3) Adjusts SIQS sieveHalfWidthScale based on estimated factor balance δ*.
 */
export const evaluateZetaGuidanceForGf2 = (
  N: bigint,
  rankedKs: number[],
  existingSeeds?: UltraPreciseZetaSeed[]
): ZetaGf2GuidanceResult => {
  const safeKs = rankedKs.length > 0 ? rankedKs : [1, 3, 5, 7, 11];
  const nBits = N.toString(2).length;

  if (nBits < 88 || (N & 1n) === 0n) {
    return {
      zetaBeneficial: false,
      mode: 'bypassed-small',
      selectedK: safeKs[0],
      cfracMultipliers: safeKs,
      sieveHalfWidthScale: 1.0,
      zetaSeeds: existingSeeds || [],
      coherenceContrast: 0,
      summaryAr: 'تخطي توجيه زيتا (< 88 بت): مصفوفة GF(2) المباشرة أسرع بدون وزن طيفي إضافي.'
    };
  }

  let seeds: UltraPreciseZetaSeed[] = [];
  try {
    seeds = existingSeeds && existingSeeds.length >= 2
      ? existingSeeds
      : generateUltraPreciseZetaSeeds(N, 6, 32);
  } catch {
    seeds = [];
  }

  if (seeds.length === 0) {
    return {
      zetaBeneficial: false,
      mode: 'bypassed-low-coherence',
      selectedK: safeKs[0],
      cfracMultipliers: safeKs,
      sieveHalfWidthScale: 1.0,
      zetaSeeds: [],
      coherenceContrast: 0,
      summaryAr: 'استخدام ترتيب Knuth–Schroeppel القياسي لعدم توفر قمم زيتا كافية.'
    };
  }

  // 1. Ultra-fast (~1ms) micro-sweep around Zeta pSeed & fermatTSeed before launching full GF(2)
  const fourN = 4n * N;
  for (let i = 0; i < Math.min(4, seeds.length); i++) {
    const sd = seeds[i];
    try {
      const p0 = BigInt(sd.candidatePSeed);
      if (p0 > 3n && p0 < N) {
        let start = p0 > 64n ? p0 - 64n : 3n;
        if ((start & 1n) === 0n) start += 1n;
        let prod = 1n;
        for (let step = 0; step < 64; step++) {
          const cand = start + BigInt(step << 1);
          if (cand >= N) break;
          prod = (prod * cand) % N;
        }
        const g = gcd(prod, N);
        if (g > 1n && g < N) {
          return {
            zetaBeneficial: true,
            mode: 'direct-hit',
            directFactor: g,
            selectedK: safeKs[0],
            cfracMultipliers: safeKs,
            sieveHalfWidthScale: 1.0,
            zetaSeeds: seeds,
            coherenceContrast: sd.resonanceScore,
            summaryAr: `إصابة مباشرة عبر بذرة زيتا الطيفية Peak#${i + 1} (p_seed ± 64).`
          };
        }
      }

      const t0 = BigInt(sd.fermatTSeed);
      const tStart = t0 > 32n ? t0 - 32n : 2n;
      for (let dt = 0n; dt <= 64n; dt++) {
        const tVal = tStart + dt;
        const R = tVal * tVal - fourN;
        if (R > 0n) {
          const mod64 = Number(R & 63n);
          if (
            mod64 === 0 || mod64 === 1 || mod64 === 4 || mod64 === 9 ||
            mod64 === 16 || mod64 === 17 || mod64 === 25 || mod64 === 33 ||
            mod64 === 36 || mod64 === 41 || mod64 === 49 || mod64 === 57
          ) {
            const sq = bigIntSqrt(R);
            if (sq * sq === R) {
              const f = gcd(tVal - sq, N);
              if (f > 1n && f < N) {
                return {
                  zetaBeneficial: true,
                  mode: 'direct-hit',
                  directFactor: f,
                  selectedK: safeKs[0],
                  cfracMultipliers: safeKs,
                  sieveHalfWidthScale: 1.0,
                  zetaSeeds: seeds,
                  coherenceContrast: sd.resonanceScore,
                  summaryAr: `إصابة مباشرة عبر تقارب فيرما الموجه ببذرة زيتا Peak#${i + 1} (t_seed).`
                };
              }
            }
          }
        }
      }
    } catch {
      // ignore malformed seed
    }
  }

  // 2. Spectral Coherence Assessment ("when beneficial")
  const topScore = seeds[0].resonanceScore;
  const medianScore = seeds[Math.floor(seeds.length / 2)].resonanceScore;
  const coherenceContrast = Math.max(0, Number((topScore - medianScore).toFixed(5)));

  // Intersect Zeta suggested multipliers with TOP-6 Knuth-Schroeppel multipliers so smoothness is never harmed
  const topKsTier = safeKs.slice(0, Math.min(6, safeKs.length));
  const zetaKs = seeds.map(s => s.suggestedK).filter((k, idx, arr) => arr.indexOf(k) === idx);
  const alignedTopKs = topKsTier.filter(k => zetaKs.includes(k));

  const isCoherent = topScore >= 0.08 && coherenceContrast >= 0.015;
  if (!isCoherent && alignedTopKs.length === 0) {
    return {
      zetaBeneficial: false,
      mode: 'bypassed-low-coherence',
      selectedK: safeKs[0],
      cfracMultipliers: safeKs,
      sieveHalfWidthScale: 1.0,
      zetaSeeds: seeds,
      coherenceContrast,
      summaryAr: `رنين زيتا منخفض التباين (Δ=${coherenceContrast.toFixed(3)}) — إبقاء Knuth–Schroeppel القياسي (k=${safeKs[0]}) دون تغيير.`
    };
  }

  // Prioritize KS multipliers that align with Zeta resonance while keeping top-2 KS at front
  const top2Ks = safeKs.slice(0, 2);
  const selectedK =
    alignedTopKs.find(k => top2Ks.includes(k)) ??
    (isCoherent && alignedTopKs.length > 0 ? alignedTopKs[0] : safeKs[0]);

  const prioritizedCfracKs = [
    selectedK,
    ...alignedTopKs.filter(k => k !== selectedK),
    ...safeKs.filter(k => k !== selectedK && !alignedTopKs.includes(k))
  ];

  const absDelta0 = Math.abs(parseFloat(seeds[0].delta500d || '0')) || 0;
  let sieveHalfWidthScale = 1.0;
  if (isCoherent) {
    if (absDelta0 <= 0.12) sieveHalfWidthScale = 0.9; // balanced primes -> slightly tighter, denser Q(x)
    else if (absDelta0 >= 0.65) sieveHalfWidthScale = 1.12; // skewed primes -> slightly wider poly interval
  }

  return {
    zetaBeneficial: true,
    mode: alignedTopKs.length > 0 || isCoherent ? 'guided-ks-sieve' : 'guided-ecm-only',
    selectedK,
    cfracMultipliers: prioritizedCfracKs,
    sieveHalfWidthScale,
    zetaSeeds: seeds,
    coherenceContrast,
    summaryAr: `توجيه زيتا مفعّل (Δ=${coherenceContrast.toFixed(3)} · δ*=${seeds[0].delta500d.slice(0, 8)}): k=${selectedK} (KS∩Zeta) + نطاق غربلة ×${sieveHalfWidthScale.toFixed(2)}.`
  };
};
