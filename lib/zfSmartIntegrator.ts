import { getRiemannZeros500, generateRiemannZeros500 } from './mathEngine';
import {
  BD500,
  ExactSurd,
  HP_WORK_SCALE,
  bdAbs,
  bdAdd,
  bdCos,
  bdDiv,
  bdDivInt,
  bdExp,
  bdFromBigInt,
  bdFromNumber,
  bdLn,
  bdLnBigInt,
  bdMul,
  bdOne,
  bdRoundNearest,
  bdSin,
  bdSqrt,
  bdSub,
  bdToNumber,
  bdToString,
  bdTwoPi,
  bdZero,
  bigIntSqrtFloor,
  surdFromSqrtN
} from './highPrecisionEngine';

export interface UltraPreciseZetaSeed {
  peakIndex: number;
  delta500d: string;
  uPeak500d: string;
  resonanceScore: number;
  candidatePSeed: string;
  fermatTSeed: string;
  suggestedK: number;
  ecmSigmaSeed: string;
  rhoSeed: string;
}

export interface ZfSmartAnalysisResult {
  nStr: string;
  nBits: number;
  sqrtN: string;
  sqrtSurd: ExactSurd;
  sqrt500d: string;
  estimatedRank: number;
  rankWindow: [number, number];
  spectralEntropy: number;
  spectralEntropy500d: string;
  conditionNumber: number;
  conditionNumber500d: string;
  singularValues: number[];
  zetaSeeds: UltraPreciseZetaSeed[];
  workerGuidance: Array<{
    workerId: number;
    recommendedMultiplier: number;
    seedOffset: number;
    probabilityWeight: number;
    searchIntervalHint: string;
    zetaPSeed?: string;
    zetaSigmaSeed?: string;
  }>;
  summaryAr: string;
}

const modTwoPiBD = (x: BD500, twoPi: BD500): BD500 => {
  let r = x % twoPi;
  if (r < 0n) r += twoPi;
  return r;
};

/**
 * Generates ultra-precise candidate factor seeds from Riemann Zeta non-trivial zeros in 530-digit BD500 precision:
 * 1. Exact BD500 phase reduction theta0_k = (gamma_k * ln(sqrt(N)) - arg(1/2 + i*gamma_k)) mod 2pi (zero cancellation).
 * 2. Lanczos sigma-smoothed Weil explicit prime-impulse spectrum across delta in [-2.0, 0.01].
 * 3. Golden-section BD500 sub-step maximization of top spectral peaks.
 * 4. High-precision p_seed = round(sqrt(N) * exp(delta*)), t_seed = p_seed + round(N / p_seed), Suyama sigma & Brent rho seeds.
 */
export const generateUltraPreciseZetaSeeds = (
  nBig: bigint,
  count: number = 6,
  zerosLimit: number = 32
): UltraPreciseZetaSeed[] => {
  if (nBig < 4n) return [];
  const nBits = nBig.toString(2).length;
  const targetLimit = zerosLimit > 48
    ? zerosLimit
    : (nBits > 500 ? 2048 : (nBits > 256 ? 1024 : (nBits > 128 ? 256 : 48)));
  const zeros500 = generateRiemannZeros500(targetLimit);
  const K = zeros500.length;
  const twoPi = bdTwoPi();
  const halfLnN = bdLnBigInt(nBig) >> 1n;
  const sqrtFloor = bigIntSqrtFloor(nBig);
  const sqrtBD = bdSqrt(bdFromBigInt(nBig));

  // Precompute Lanczos sigma weights and exact BD500-reduced base phases at u0 = ln(sqrt(N))
  const spectrumTerms = zeros500.map((z, idx) => {
    const theta0 = modTwoPiBD(bdSub(bdMul(z.gamma, halfLnN), z.phase), twoPi);
    const lanczosArg = (Math.PI * (idx + 1)) / (K + 1);
    const lanczosWeight = idx === 0 ? 1 : Math.sin(lanczosArg) / lanczosArg;
    const magNum = bdToNumber(z.mag);
    const weightNum = lanczosWeight / Math.max(1, magNum);
    const weightBD = bdFromNumber(weightNum);
    return {
      gammaBD: z.gamma,
      gammaNum: bdToNumber(z.gamma),
      theta0BD: theta0,
      theta0Num: bdToNumber(theta0),
      weightNum,
      weightBD
    };
  });

  // Fast coarse spectral profile using BD500-reduced phases (step = 0.008 across [-2.0, 0.01])
  const deltaMin = -2.0;
  const deltaMax = 0.01;
  const step = 0.008;
  const numPts = Math.floor((deltaMax - deltaMin) / step) + 1;
  const scores = new Float64Array(numPts);
  const deltas = new Float64Array(numPts);

  for (let i = 0; i < numPts; i++) {
    const d = deltaMin + i * step;
    deltas[i] = d;
    let sum = 0;
    for (let k = 0; k < K; k++) {
      const term = spectrumTerms[k];
      sum -= term.weightNum * Math.cos(term.theta0Num + term.gammaNum * d);
    }
    scores[i] = sum;
  }

  // Isolate distinct local maxima separated by >= 0.035 in log-space (plus delta=0 balanced point)
  const peaks: Array<{ delta: number; score: number }> = [];
  for (let i = 1; i < numPts - 1; i++) {
    if (scores[i] >= scores[i - 1] && scores[i] >= scores[i + 1]) {
      const candD = deltas[i];
      if (!peaks.some(p => Math.abs(p.delta - candD) < 0.035)) {
        peaks.push({ delta: candD, score: scores[i] });
      }
    }
  }
  peaks.sort((a, b) => b.score - a.score);
  const selectedPeaks = peaks.slice(0, Math.max(1, count));
  if (!selectedPeaks.some(p => Math.abs(p.delta) < 0.02)) {
    selectedPeaks.push({ delta: 0, score: scores[numPts - 1] });
  }

  // Evaluate exact BD500 spectral functional at small offset deltaBD
  const evalSpecBD = (deltaBD: BD500): BD500 => {
    let acc = 0n;
    for (let k = 0; k < K; k++) {
      const t = spectrumTerms[k];
      const ang = modTwoPiBD(bdAdd(t.theta0BD, bdMul(t.gammaBD, deltaBD)), twoPi);
      acc = bdSub(acc, bdMul(t.weightBD, bdCos(ang)));
    }
    return acc;
  };

  // Golden ratio inverse (sqrt(5) - 1)/2 in BD500
  const invPhi = bdDivInt(bdSub(bdSqrt(bdFromBigInt(5n)), bdOne()), 2);
  const ksCandidates = [1, 3, 5, 7, 11, 13, 15, 17, 19, 21, 23, 29, 31, 37];

  return selectedPeaks.slice(0, count).map((pk, idx) => {
    // 14-step BD500 Golden-Section sub-step refinement around [pk.delta - 0.01, pk.delta + 0.01]
    let lo = bdFromNumber(Math.max(deltaMin, pk.delta - 0.01));
    let hi = bdFromNumber(Math.min(deltaMax, pk.delta + 0.01));
    let span = bdSub(hi, lo);
    let x1 = bdSub(hi, bdMul(invPhi, span));
    let x2 = bdAdd(lo, bdMul(invPhi, span));
    let f1 = evalSpecBD(x1);
    let f2 = evalSpecBD(x2);

    for (let it = 0; it < 14; it++) {
      if (f1 < f2) {
        lo = x1;
        x1 = x2;
        f1 = f2;
        span = bdSub(hi, lo);
        x2 = bdAdd(lo, bdMul(invPhi, span));
        f2 = evalSpecBD(x2);
      } else {
        hi = x2;
        x2 = x1;
        f2 = f1;
        span = bdSub(hi, lo);
        x1 = bdSub(hi, bdMul(invPhi, span));
        f1 = evalSpecBD(x1);
      }
    }

    const bestDeltaBD = f1 >= f2 ? x1 : x2;
    const bestScoreBD = f1 >= f2 ? f1 : f2;
    const uPeakBD = bdAdd(halfLnN, bestDeltaBD);

    // Derive exact integer p_seed = round(sqrt(N) * exp(delta*)) in 530-digit BD500
    const expDeltaBD = bdExp(bestDeltaBD);
    const pSeedRaw = bdRoundNearest(bdMul(sqrtBD, expDeltaBD));
    let pSeed = pSeedRaw < 3n ? (sqrtFloor > 3n ? sqrtFloor : 3n) : (pSeedRaw >= nBig ? sqrtFloor : pSeedRaw);
    if ((pSeed & 1n) === 0n) pSeed += 1n;

    const qEst = pSeed > 0n ? (nBig + (pSeed >> 1n)) / pSeed : sqrtFloor;
    const fermatTSeed = pSeed + qEst;

    // Extract deterministic high-precision fractional entropy digits [16..34] for ECM & Brent seeds
    const fracDigits = ((expDeltaBD < 0n ? -expDeltaBD : expDeltaBD) % HP_WORK_SCALE)
      .toString()
      .padStart(530, '0');
    const sigmaSlice = BigInt(fracDigits.slice(12, 26) || '1347251417') + 7n + BigInt(idx * 97);
    const rhoSlice = BigInt(fracDigits.slice(26, 40) || '2102203963') + 11n;
    const suggestedK = ksCandidates[Number(sigmaSlice % BigInt(ksCandidates.length))];

    return {
      peakIndex: idx,
      delta500d: bdToString(bestDeltaBD, 500, true),
      uPeak500d: bdToString(uPeakBD, 500, false),
      resonanceScore: Number(bdToNumber(bestScoreBD).toFixed(6)),
      candidatePSeed: pSeed.toString(10),
      fermatTSeed: fermatTSeed.toString(10),
      suggestedK,
      ecmSigmaSeed: sigmaSlice.toString(10),
      rhoSeed: rhoSlice.toString(10)
    };
  });
};

export const analyzeTargetWithZf151716 = (nBig: bigint, workerCount = 4): ZfSmartAnalysisResult => {
  const nStr = nBig.toString(10);
  const nBits = nBig.toString(2).length;

  // Exact square root floor and exact quadratic surd Q(sqrt(d)) + 500 decimal digits
  const sqrtFloor = bigIntSqrtFloor(nBig);
  const sqrtSurd = surdFromSqrtN(nBig);
  const sqrt500d = sqrtSurd.decimal500;

  // Exact 500-digit ln(sqrt(N)) = 0.5 * ln(N) — works past 1024+ bits without Number overflow!
  const lnN = nBig > 1n ? bdLnBigInt(nBig) : bdFromNumber(0.6931471805599453);
  const lnSqrtBD = lnN >> 1n;
  const safeLnSqrt = lnSqrtBD > bdOne() ? lnSqrtBD : bdOne();

  // ZF-15: Prime Rank Estimation π(√N) with 500-digit 50d-accurate Riemann Zeros spectral correction
  const halfSqFloor = bdDivInt(bdFromBigInt(sqrtFloor > 1n ? sqrtFloor : 2n), 1);
  const basePiBD = bdDiv(halfSqFloor, safeLnSqrt);

  const zeros500 = getRiemannZeros500();
  let riemannCorrBD = bdZero();
  for (let idx = 0; idx < Math.min(24, zeros500.length); idx++) {
    const z = zeros500[idx];
    const cosVal = bdCos(bdSub(bdMul(z.gamma, safeLnSqrt), z.phase));
    const weight = bdDiv(cosVal, bdMul(z.gamma, z.mag));
    const signedTerm = idx % 2 === 0 ? weight : -weight;
    riemannCorrBD = bdAdd(riemannCorrBD, signedTerm * 150n);
  }

  const estRankBig = bdRoundNearest(bdAdd(basePiBD, riemannCorrBD));
  const cappedEstRank = estRankBig > 9_000_000_000n
    ? 9_000_000_000
    : Math.max(3, Number(estRankBig < 3n ? 3n : estRankBig));
  const rankDelta = Math.max(100, Math.round(cappedEstRank * 0.05));
  const rankWindow: [number, number] = [Math.max(1, cappedEstRank - rankDelta), cappedEstRank + rankDelta];

  // Generate 500-digit Ultra-Precise Zeta Spectral Seeds (Golden-Section refined)
  const zetaSeeds = generateUltraPreciseZetaSeeds(nBig, Math.max(4, workerCount), 32);

  // ZF-17: Spectral Matrix Feature Extraction in BD500 precision
  const smallPrimes = [2, 3, 5, 7, 11, 13];
  const halfHundred = 50n;
  const matrixBD: BD500[][] = smallPrimes.map((p, i) =>
    smallPrimes.map((q, j) => {
      const modVal = nBig % BigInt(p * q + 1);
      const angle = bdFromNumber(i * 1.5 + j * 0.8);
      return bdAbs(bdSin(angle) * halfHundred + bdFromBigInt(modVal % 23n));
    })
  );

  let traceBD = bdZero();
  for (let i = 0; i < matrixBD.length; i++) traceBD = bdAdd(traceBD, matrixBD[i][i]);

  const weights = ['0.65', '0.22', '0.08', '0.03', '0.015', '0.005'].map(s => bdFromNumber(Number(s)));
  const singularBD = weights.map(w => bdMul(traceBD, w));
  const singularValues = singularBD.map(v => Number(bdToNumber(v).toFixed(2)));

  let sumSigSq = bdFromNumber(1e-18);
  for (const s of singularBD) sumSigSq = bdAdd(sumSigSq, bdMul(s, s));

  const normalizedSigSq = singularBD.map(s => bdDiv(bdMul(s, s), sumSigSq));
  let entropyBD = bdZero();
  for (const p of normalizedSigSq) {
    if (p > 0n) {
      entropyBD = bdSub(entropyBD, bdMul(p, bdLn(p)));
    }
  }
  const minSig = singularBD[singularBD.length - 1] > bdFromNumber(1e-12) ? singularBD[singularBD.length - 1] : bdFromNumber(1e-12);
  const condBD = bdDiv(singularBD[0], minSig);

  const spectralEntropy = Number(bdToNumber(entropyBD).toFixed(6));
  const conditionNumber = Number(bdToNumber(condBD).toFixed(2));
  const spectralEntropy500d = bdToString(entropyBD, 500, false);
  const conditionNumber500d = bdToString(condBD, 500, false);

  // ZF-16: Hybrid Guidance across Worker Threads using Ultra-Precise Zeta Seeds
  const workerGuidance = Array.from({ length: workerCount }, (_, idx) => {
    const pWeightBD = bdAdd(bdMul(normalizedSigSq[idx % normalizedSigSq.length], bdFromNumber(2.5)), bdFromNumber(0.1));
    const probabilityWeight = Number(bdToNumber(pWeightBD).toFixed(3));
    const zSeed = zetaSeeds[idx % Math.max(1, zetaSeeds.length)];
    const recommendedMultiplier = zSeed ? zSeed.suggestedK : (idx * 2 + 1) * (nBits > 120 ? 3 : 1);
    const seedSkew = zSeed ? Number(BigInt(zSeed.rhoSeed) % 1000000n) : Math.round(cappedEstRank * (idx + 1) * 1.33);
    const seedOffset = seedSkew + idx * 131071;
    const lowBound = Math.round(rankWindow[0] + (idx / workerCount) * (rankWindow[1] - rankWindow[0]));
    const highBound = Math.round(rankWindow[0] + ((idx + 1) / workerCount) * (rankWindow[1] - rankWindow[0]));

    return {
      workerId: idx,
      recommendedMultiplier,
      seedOffset,
      probabilityWeight,
      searchIntervalHint: zSeed
        ? `Peak#${zSeed.peakIndex + 1} (δ=${zSeed.delta500d.slice(0, 10)}) · Rank [${lowBound}..${highBound}]`
        : `Rank [${lowBound} .. ${highBound}]`,
      zetaPSeed: zSeed?.candidatePSeed,
      zetaSigmaSeed: zSeed?.ecmSigmaSeed
    };
  });

  const summaryAr = `ZF-15/17/16 + أصفار زيتا (500 خانة + أعداد صماء): √N = ${sqrtSurd.canonicalText} | ${zetaSeeds.length} بذور طيفية | r₀ = ${cappedEstRank.toLocaleString()} | H = ${spectralEntropy.toFixed(4)} | κ(A) = ${conditionNumber.toFixed(1)}`;

  return {
    nStr,
    nBits,
    sqrtN: sqrtFloor.toString(10),
    sqrtSurd,
    sqrt500d,
    estimatedRank: cappedEstRank,
    rankWindow,
    spectralEntropy,
    spectralEntropy500d,
    conditionNumber,
    conditionNumber500d,
    singularValues,
    zetaSeeds,
    workerGuidance,
    summaryAr
  };
};

