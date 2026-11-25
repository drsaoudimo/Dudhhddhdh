import { generateRiemannZeros500 } from './mathEngine';
import {
  BD500,
  bdFromNumber,
  bdLnBigInt,
  bdMul,
  bdSub,
  bdToNumber,
  bdTwoPi,
  bigIntSqrtFloor,
} from './highPrecisionEngine';

export interface ZeroPhaseContribution {
  index: number;
  gammaBase: number;
  gammaScaled: number;
  weight: number;
  thetaRad: number;
  cosTheta: number;
  sinTheta: number;
  contribution: number;
  polarity: 'constructive' | 'destructive';
}

export interface PsiProfilePoint {
  delta: number;
  psiValue: number;
  cancellationPct: number;
}

export interface PsiPhaseCancellationMetrics {
  nStr: string;
  nBits: number;
  zeroCount: number;
  zetaScale: number;
  deltaProbe: number;
  psiValue: number;
  absPsiValue: number;
  constructiveEnvelope: number;
  cancellationRatio: number; // 0..1
  cancellationPct: number; // 0..100
  phasorCoherenceR: number; // |sum w*e^{i*theta}| / sum |w|
  constructiveEnergy: number;
  destructiveEnergy: number;
  constructiveCount: number;
  destructiveCount: number;
  netBalancePct: number;
  peakDelta: number;
  peakPsiValue: number;
  peakCancellationPct: number;
  candidatePSeed: string;
  profile: PsiProfilePoint[];
  perZero: ZeroPhaseContribution[];
}

export interface PreparedPsiContext {
  nBig: bigint;
  nStr: string;
  nBits: number;
  halfLnN: BD500;
  twoPi: BD500;
  sqrtFloor: bigint;
  zeros: ReturnType<typeof generateRiemannZeros500>;
}

const modTwoPi = (x: BD500, twoPi: BD500): BD500 => {
  let r = x % twoPi;
  if (r < 0n) r += twoPi;
  return r;
};

export const preparePsiPhaseContext = (
  nBig: bigint,
  zeroCount: number = 48
): PreparedPsiContext => {
  const safeN = nBig < 2n ? 2n : nBig;
  const clampedZeros = Math.max(8, Math.min(256, zeroCount));
  return {
    nBig: safeN,
    nStr: safeN.toString(10),
    nBits: safeN.toString(2).length,
    halfLnN: bdLnBigInt(safeN) >> 1n,
    twoPi: bdTwoPi(),
    sqrtFloor: bigIntSqrtFloor(safeN),
    zeros: generateRiemannZeros500(clampedZeros),
  };
};

export const computePsiPhaseCancellation = (
  ctx: PreparedPsiContext,
  zetaScale: number,
  deltaProbe: number
): PsiPhaseCancellationMetrics => {
  const K = ctx.zeros.length;
  const scaleClamped = Math.max(0.1, Math.min(3.0, Number.isFinite(zetaScale) ? zetaScale : 1.0));
  const scaleBD = bdFromNumber(scaleClamped);

  const terms = ctx.zeros.map((z, idx) => {
    const scaledGammaBD = bdMul(z.gamma, scaleBD);
    // Exact 530-digit BD500 phase reduction eliminates catastrophic cancellation at large N
    const theta0BD = modTwoPi(bdSub(bdMul(scaledGammaBD, ctx.halfLnN), z.phase), ctx.twoPi);
    const theta0Num = bdToNumber(theta0BD);
    const gammaBase = bdToNumber(z.gamma);
    const gammaScaled = gammaBase * scaleClamped;
    const lanczosArg = (Math.PI * (idx + 1)) / (K + 1);
    const lanczosW = idx === 0 ? 1 : Math.sin(lanczosArg) / lanczosArg;
    const denom = Math.sqrt(0.25 + gammaScaled * gammaScaled);
    const weight = lanczosW / Math.max(1e-9, denom);
    return { index: idx + 1, gammaBase, gammaScaled, theta0Num, weight };
  });

  // Sweep delta across [-1.0, 0.05] to capture waveform & resonant minimum-cancellation peak
  const dMin = -1.0;
  const dMax = 0.05;
  const steps = 105;
  const profile: PsiProfilePoint[] = [];
  let maxEnv = 0;
  for (let i = 0; i < K; i++) maxEnv += terms[i].weight;
  const safeEnv = maxEnv > 0 ? maxEnv : 1;

  let peakDelta = 0;
  let bestAbsPsi = -1;
  let peakPsiValue = 0;

  for (let sIdx = 0; sIdx <= steps; sIdx++) {
    const d = dMin + ((dMax - dMin) * sIdx) / steps;
    let psi = 0;
    for (let k = 0; k < K; k++) {
      const t = terms[k];
      psi -= t.weight * Math.cos(t.theta0Num + t.gammaScaled * d);
    }
    const absPsi = Math.abs(psi);
    const cancelPct = Math.max(0, Math.min(100, (1 - absPsi / safeEnv) * 100));
    profile.push({ delta: Number(d.toFixed(4)), psiValue: psi, cancellationPct: cancelPct });
    if (absPsi > bestAbsPsi) {
      bestAbsPsi = absPsi;
      peakDelta = d;
      peakPsiValue = psi;
    }
  }

  // Evaluate exact per-zero phase cancellation metrics at deltaProbe
  let psiAtProbe = 0;
  let phasorX = 0;
  let phasorY = 0;
  let constructiveEnergy = 0;
  let destructiveEnergy = 0;
  let constructiveCount = 0;
  let destructiveCount = 0;
  const twoPiNum = Math.PI * 2;

  const perZero: ZeroPhaseContribution[] = terms.map((t) => {
    const rawTheta = t.theta0Num + t.gammaScaled * deltaProbe;
    const thetaRad = ((rawTheta % twoPiNum) + twoPiNum) % twoPiNum;
    const cosTheta = Math.cos(thetaRad);
    const sinTheta = Math.sin(thetaRad);
    const contribution = -t.weight * cosTheta;

    psiAtProbe += contribution;
    phasorX += t.weight * cosTheta;
    phasorY += t.weight * sinTheta;

    const isConstructive = contribution >= 0;
    if (isConstructive) {
      constructiveEnergy += Math.abs(contribution);
      constructiveCount++;
    } else {
      destructiveEnergy += Math.abs(contribution);
      destructiveCount++;
    }

    return {
      index: t.index,
      gammaBase: t.gammaBase,
      gammaScaled: t.gammaScaled,
      weight: t.weight,
      thetaRad,
      cosTheta,
      sinTheta,
      contribution,
      polarity: isConstructive ? 'constructive' : 'destructive',
    };
  });

  const absPsiAtProbe = Math.abs(psiAtProbe);
  const cancellationRatio = Math.max(0, Math.min(1, 1 - absPsiAtProbe / safeEnv));
  const cancellationPct = cancellationRatio * 100;
  const phasorCoherenceR = Math.hypot(phasorX, phasorY) / safeEnv;
  const totalSignedEnergy = constructiveEnergy + destructiveEnergy;
  const netBalancePct =
    totalSignedEnergy > 0 ? (Math.abs(constructiveEnergy - destructiveEnergy) / totalSignedEnergy) * 100 : 0;

  // Approximate p_seed from peakDelta: round(sqrt(N) * exp(peakDelta))
  const scaleFactorFixed = BigInt(Math.max(1, Math.round(Math.exp(peakDelta) * 1_000_000_000)));
  let pSeed = (ctx.sqrtFloor * scaleFactorFixed) / 1_000_000_000n;
  if (pSeed < 3n) pSeed = ctx.sqrtFloor > 3n ? ctx.sqrtFloor : 3n;
  if ((pSeed & 1n) === 0n) pSeed += 1n;

  return {
    nStr: ctx.nStr,
    nBits: ctx.nBits,
    zeroCount: K,
    zetaScale: scaleClamped,
    deltaProbe,
    psiValue: psiAtProbe,
    absPsiValue: absPsiAtProbe,
    constructiveEnvelope: safeEnv,
    cancellationRatio,
    cancellationPct,
    phasorCoherenceR,
    constructiveEnergy,
    destructiveEnergy,
    constructiveCount,
    destructiveCount,
    netBalancePct,
    peakDelta: Number(peakDelta.toFixed(4)),
    peakPsiValue,
    peakCancellationPct: Math.max(0, Math.min(100, (1 - Math.abs(peakPsiValue) / safeEnv) * 100)),
    candidatePSeed: pSeed.toString(10),
    profile,
    perZero,
  };
};
