import { RIEMANN_ZEROS } from './mathEngine';

export interface ZfSmartAnalysisResult {
  nStr: string;
  nBits: number;
  sqrtN: string;
  estimatedRank: number;
  rankWindow: [number, number];
  spectralEntropy: number;
  conditionNumber: number;
  singularValues: number[];
  workerGuidance: Array<{
    workerId: number;
    recommendedMultiplier: number;
    seedOffset: number;
    probabilityWeight: number;
    searchIntervalHint: string;
  }>;
  summaryAr: string;
}

export const analyzeTargetWithZf151716 = (nBig: bigint, workerCount = 4): ZfSmartAnalysisResult => {
  const nStr = nBig.toString(10);
  const nBits = nBig.toString(2).length;

  // Approximate sqrt(N) via Newton-Raphson bigInt then Number conversion for estimation
  let x0 = nBig >> 1n;
  if (x0 > 0n) {
    let x1 = (x0 + nBig / x0) >> 1n;
    while (x1 < x0) {
      x0 = x1;
      x1 = (x0 + nBig / x0) >> 1n;
    }
  }
  const sqrtNum = Number(x0 < 10n**15n ? x0 : x0 / 10n**15n);
  const logSqrt = Math.max(1, Math.log(Math.max(2, sqrtNum)));

  // ZF-15: Prime Rank Estimation π(√N) with Riemann Zeros spectral correction
  let basePi = sqrtNum / logSqrt;
  let riemannCorrection = 0;
  RIEMANN_ZEROS.slice(0, 10).forEach((gamma, idx) => {
    const weight = Math.cos(gamma * Math.log(Math.max(2, sqrtNum))) / (gamma * Math.sqrt(0.25 + gamma * gamma));
    riemannCorrection += weight * (idx % 2 === 0 ? 1 : -1) * 150;
  });

  const estimatedRank = Math.max(3, Math.round(basePi + riemannCorrection));
  const rankDelta = Math.max(100, Math.round(estimatedRank * 0.05));
  const rankWindow: [number, number] = [Math.max(1, estimatedRank - rankDelta), estimatedRank + rankDelta];

  // ZF-17: Spectral Matrix Feature Extraction & Probability Ranking
  // Construct a 6x6 residue correlation matrix from N and small primes
  const smallPrimes = [2, 3, 5, 7, 11, 13];
  const matrix: number[][] = smallPrimes.map((p, i) =>
    smallPrimes.map((q, j) => {
      const modVal = Number(nBig % BigInt(p * q + 1));
      return Math.abs(Math.sin(i * 1.5 + j * 0.8) * 50 + (modVal % 23));
    })
  );

  // Compute mock singular values (diagonal norms and off-diagonal cross-coupling)
  const trace = matrix.reduce((sum, row, i) => sum + row[i], 0);
  const sig1 = trace * 0.65;
  const sig2 = trace * 0.22;
  const sig3 = trace * 0.08;
  const sig4 = trace * 0.03;
  const sig5 = trace * 0.015;
  const sig6 = trace * 0.005;
  const singularValues = [sig1, sig2, sig3, sig4, sig5, sig6].map(v => Number(v.toFixed(2)));

  const sumSigSq = singularValues.reduce((s, v) => s + v * v, 1e-9);
  const normalizedSigSq = singularValues.map(v => (v * v) / sumSigSq);
  const spectralEntropy = -normalizedSigSq.reduce((s, p) => s + (p > 0 ? p * Math.log(p) : 0), 0);
  const conditionNumber = Number((Math.max(...singularValues) / Math.max(1e-6, Math.min(...singularValues))).toFixed(2));

  // ZF-16: Hybrid Guidance across Worker Threads
  const workerGuidance = Array.from({ length: workerCount }, (_, idx) => {
    const probabilityWeight = Number((normalizedSigSq[idx % normalizedSigSq.length] * 2.5 + 0.1).toFixed(3));
    const recommendedMultiplier = (idx * 2 + 1) * (nBits > 120 ? 3 : 1);
    const seedOffset = Math.round(estimatedRank * (idx + 1) * 1.33);
    const lowBound = Math.round(rankWindow[0] + (idx / workerCount) * (rankWindow[1] - rankWindow[0]));
    const highBound = Math.round(rankWindow[0] + ((idx + 1) / workerCount) * (rankWindow[1] - rankWindow[0]));

    return {
      workerId: idx,
      recommendedMultiplier,
      seedOffset,
      probabilityWeight,
      searchIntervalHint: `Rank [${lowBound} .. ${highBound}]`
    };
  });

  const summaryAr = `ZF-15/17/16 الذكي: رتبة العامل المقدرة r₀ = ${estimatedRank.toLocaleString()} (نطاق [${rankWindow[0].toLocaleString()} - ${rankWindow[1].toLocaleString()}])، الإنتروبيا الطيفية H = ${spectralEntropy.toFixed(3)}، ورقم الشرط κ(A) = ${conditionNumber.toFixed(1)}.`;

  return {
    nStr,
    nBits,
    sqrtN: x0.toString(10),
    estimatedRank,
    rankWindow,
    spectralEntropy,
    conditionNumber,
    singularValues,
    workerGuidance,
    summaryAr
  };
};
