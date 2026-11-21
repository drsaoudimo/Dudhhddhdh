import { bigIntSqrt, gcdBig, isProbablePrimeBig, modPowBig } from './mathEngine';
import { runZf19Cfrac } from './zf19/cfracEngine';

export interface PsiOperationCounters {
  modularMultiplies: number;
  modularReductions: number;
  gcdCalls: number;
  integerDivisions: number;
  otherSteps: number;
  wheelCandidates: number;
  fermatSteps: number;
  rhoIterations: number;
  ecmSteps: number;
  cfracIterations: number;
}

export interface PsiEnergyParams {
  eModMul: number; // Joules per modular multiply
  eGcd: number;    // Joules per gcd call
  eMod: number;    // Joules per modular reduction
  eDiv: number;    // Joules per integer division
  eOther: number;  // Joules per loop / trial step
  e0: number;      // Static baseline Joules
  idlePowerWatts: number;
  temperatureK: number;
}

export const DEFAULT_PSI_ENERGY_PARAMS: PsiEnergyParams = {
  eModMul: 2.0e-9,
  eGcd: 8.0e-9,
  eMod: 1.0e-9,
  eDiv: 3.0e-9,
  eOther: 0.2e-9,
  e0: 0.0,
  idlePowerWatts: 0.0,
  temperatureK: 300
};

export const BOLTZMANN_K = 1.380649e-23;

export interface WheelStats {
  primes: number[];
  modulusW: number;
  phiW: number;
  survivalRatio: number;
  eliminatedPct: number;
  residuesSample: number[];
}

export interface PsiStageLog {
  stage: string;
  titleAr: string;
  extractedFactor: string | null;
  stepsUsed: number;
  elapsedMs: number;
  status: 'FACTOR_FOUND' | 'NO_HIT_IN_BUDGET' | 'SKIPPED' | 'COMPLETED';
  noteAr: string;
}

export type PsiStatus = 'FACTORS_VERIFIED' | 'PRIME_RESIDUAL' | 'INCONCLUSIVE_BUDGET';

export interface PsiFactorResult {
  n: string;
  bits: number;
  mode: 'psi-hybrid' | 'psi2-adaptive';
  status: PsiStatus;
  factors: string[];
  exponents: Array<{ prime: string; power: number }>;
  unresolvedResidual: string | null;
  verifiedProduct: boolean;
  allFactorsProbablePrime: boolean;
  winningStage: string;
  counters: PsiOperationCounters;
  totalOperations: number;
  estimatedEnergyJ: number;
  landauerMinBitJ: number;
  equivalentLandauerBits: number;
  elapsedMs: number;
  stages: PsiStageLog[];
  wheelStats: WheelStats;
}

export interface AlgorithmBenchmarkSnapshot {
  algorithmId: 'naive-trial' | 'wheel-trial' | 'psi-hybrid' | 'pollard-brent' | 'psi2-adaptive';
  labelAr: string;
  status: 'FACTORS_VERIFIED' | 'INCONCLUSIVE_BUDGET';
  factorsSummary: string;
  elapsedMs: number;
  totalOperations: number;
  estimatedEnergyJ: number;
  detailNote: string;
}

export interface Psi31Preset {
  id: string;
  bits: number;
  balanced: boolean;
  labelAr: string;
  n: string;
  verifyP?: string;
  verifyQ?: string;
  notesAr: string;
}

// Verified prime products across 32b, 64b, 128b, 192b (unbalanced ref + balanced), 256b balanced
export const PSI_31_PRESETS: Psi31Preset[] = [
  {
    id: 'psi-32-bal',
    bits: 32,
    balanced: true,
    labelAr: '32 بت (متوازن 16×16 بت)',
    n: '2408052841', // 46051 * 52291
    verifyP: '46051',
    verifyQ: '52291',
    notesAr: 'شبه أولي متوازن صغير للتحقق من اكتمال القسمة والغربلة المعيارية.'
  },
  {
    id: 'psi-64-bal',
    bits: 64,
    balanced: true,
    labelAr: '64 بت (متوازن 32×32 بت)',
    n: '10220795931607687649', // 2852409611 * 3583214659
    verifyP: '2852409611',
    verifyQ: '3583214659',
    notesAr: 'متوازن 64 بت: القوة الغاشمة تفشل ضمن الميزانية بينما يحله Pollard-Brent و Ψ بسرعة.'
  },
  {
    id: 'psi-192-unbal',
    bits: 192,
    balanced: false,
    labelAr: '192 بت (غير متوازن 33×160 بت · تجربة Python)',
    n: '3139453041692802468307529959765864347704198855528198401897',
    verifyP: '4296201881',
    verifyQ: '730750818665451459101842416368018053038089728337',
    notesAr: 'العدد المرجعي من تجربة psi_factor_192_experiment.py (p من 33 بت و q من 160 بت).'
  },
  {
    id: 'psi-128-bal',
    bits: 128,
    balanced: true,
    labelAr: '128 بت (متوازن 64×64 بت)',
    n: '171804228311708440512560111339741718787', // 11970603839773335941 * 14352177267856319207
    verifyP: '11970603839773335941',
    verifyQ: '14352177267856319207',
    notesAr: 'مقياس صعوبة حقيقية: عاملان من 64 بت (تُبرز فجوة التعقيد بين O(2^(b/4)) و SIQS).'
  },
  {
    id: 'psi-192-bal',
    bits: 192,
    balanced: true,
    labelAr: '192 بت (متوازن 96×96 بت)',
    n: '4047823463984259798981055982092177368679333685671333971439', // 57747661831590221715253556141 * 70095019185174049796531434379
    verifyP: '57747661831590221715253556141',
    verifyQ: '70095019185174049796531434379',
    notesAr: 'الاختبار الحاسم Ψ-3.1: عاملان متوازنان 96 بت يتجاوزان القوة الغاشمة وRho المحدود.'
  },
  {
    id: 'psi-256-bal',
    bits: 256,
    balanced: true,
    labelAr: '256 بت (متوازن 128×128 بت)',
    n: '71940521162557446832265862856010781464590197267692380968795143469883200937537', // 263842133177923034044090775590207241221 * 272665022436140094284060892262472477197
    verifyP: '263842133177923034044090775590207241221',
    verifyQ: '272665022436140094284060892262472477197',
    notesAr: 'سقف الاختبار المتوازن 256 بت لإظهار ضرورة SIQS/GNFS وتوثيق حدود INCONCLUSIVE بأمان.'
  }
];

const emptyCounters = (): PsiOperationCounters => ({
  modularMultiplies: 0,
  modularReductions: 0,
  gcdCalls: 0,
  integerDivisions: 0,
  otherSteps: 0,
  wheelCandidates: 0,
  fermatSteps: 0,
  rhoIterations: 0,
  ecmSteps: 0,
  cfracIterations: 0
});

const sumOps = (c: PsiOperationCounters): number =>
  c.modularMultiplies +
  c.gcdCalls +
  c.modularReductions +
  c.integerDivisions +
  c.otherSteps +
  c.ecmSteps +
  c.cfracIterations;

export const computeEstimatedEnergy = (
  c: PsiOperationCounters,
  elapsedMs: number,
  params: PsiEnergyParams = DEFAULT_PSI_ENERGY_PARAMS
): { estimatedEnergyJ: number; landauerMinBitJ: number; equivalentLandauerBits: number } => {
  const opEnergy =
    c.modularMultiplies * params.eModMul +
    c.gcdCalls * params.eGcd +
    c.modularReductions * params.eMod +
    c.integerDivisions * params.eDiv +
    (c.otherSteps + c.ecmSteps + c.cfracIterations) * params.eOther;

  const estimatedEnergyJ = params.e0 + opEnergy + params.idlePowerWatts * (elapsedMs / 1000);
  const landauerMinBitJ = BOLTZMANN_K * params.temperatureK * Math.LN2;
  const equivalentLandauerBits = landauerMinBitJ > 0 ? estimatedEnergyJ / landauerMinBitJ : 0;

  return { estimatedEnergyJ, landauerMinBitJ, equivalentLandauerBits };
};

const gcdNum = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
};

export const computeWheelStats = (basisPrimes: number[]): WheelStats => {
  let W = 1;
  let phiW = 1;
  for (const p of basisPrimes) {
    W *= p;
    phiW *= p - 1;
  }
  const survivalRatio = phiW / W;
  const eliminatedPct = (1 - survivalRatio) * 100;

  const residuesSample: number[] = [];
  for (let r = 1; r < W && residuesSample.length < 24; r++) {
    if (gcdNum(r, W) === 1) residuesSample.push(r);
  }

  return {
    primes: [...basisPrimes],
    modulusW: W,
    phiW,
    survivalRatio,
    eliminatedPct,
    residuesSample
  };
};

const buildWheelOffsets = (basisPrimes: number[]): { W: number; residues: Uint8Array } => {
  let W = 1;
  for (const p of basisPrimes) W *= p;
  const residues = new Uint8Array(W);
  for (let r = 1; r < W; r++) {
    let coprime = true;
    for (const p of basisPrimes) {
      if (r % p === 0) {
        coprime = false;
        break;
      }
    }
    if (coprime) residues[r] = 1;
  }
  return { W, residues };
};

/**
 * Pollard-Brent Rho with exact operation counting matching psi_factor_192_experiment.py
 */
export const pollardBrentCounted = (
  n: bigint,
  ctr: PsiOperationCounters,
  seed: bigint = 2n,
  c: bigint = 1n,
  batch: number = 64,
  iterationLimit: number = 350000
): bigint | null => {
  if ((n & 1n) === 0n) return 2n;
  let y = seed % n;
  let r = 1;
  let q = 1n;
  let g = 1n;
  let x = 0n;
  let ys = 0n;
  let localIters = 0;

  while (g === 1n) {
    x = y;
    for (let i = 0; i < r; i++) {
      y = (y * y + c) % n;
      ctr.modularMultiplies++;
      ctr.modularReductions++;
      ctr.rhoIterations++;
      localIters++;
      if (localIters > iterationLimit) return null;
    }

    let k = 0;
    while (k < r && g === 1n) {
      ys = y;
      const lim = Math.min(batch, r - k);
      for (let i = 0; i < lim; i++) {
        y = (y * y + c) % n;
        const diff = x > y ? x - y : y - x;
        q = (q * diff) % n;
        ctr.modularMultiplies += 2;
        ctr.modularReductions += 2;
        ctr.rhoIterations++;
        localIters++;
        if (localIters > iterationLimit) return null;
      }
      g = gcdBig(q, n);
      ctr.gcdCalls++;
      k += lim;
    }
    r *= 2;
  }

  if (g === n) {
    while (true) {
      ys = (ys * ys + c) % n;
      ctr.modularMultiplies++;
      ctr.modularReductions++;
      const diff = x > ys ? x - ys : ys - x;
      g = gcdBig(diff, n);
      ctr.gcdCalls++;
      ctr.rhoIterations++;
      localIters++;
      if (g > 1n || localIters > iterationLimit) break;
    }
  }

  return g > 1n && g < n ? g : null;
};

/**
 * Bounded Naive Trial Division baseline (for fair Psi-3.1 comparison)
 */
export const runNaiveTrialBaseline = (
  nInput: bigint,
  candidateLimit: number = 250000,
  energyParams: PsiEnergyParams = DEFAULT_PSI_ENERGY_PARAMS
): AlgorithmBenchmarkSnapshot => {
  const t0 = performance.now();
  const ctr = emptyCounters();
  let n = nInput;
  const factors: bigint[] = [];

  if (n < 2n) {
    return {
      algorithmId: 'naive-trial',
      labelAr: 'القوة الغاشمة التقليدية',
      status: 'INCONCLUSIVE_BUDGET',
      factorsSummary: n.toString(),
      elapsedMs: 0,
      totalOperations: 0,
      estimatedEnergyJ: 0,
      detailNote: 'N < 2'
    };
  }

  let limit = bigIntSqrt(n);
  let checked = 0;
  for (let d = 2n; d <= limit && checked < candidateLimit; d++) {
    checked++;
    ctr.otherSteps++;
    if (n % d === 0n) {
      while (n % d === 0n) {
        factors.push(d);
        n /= d;
        ctr.integerDivisions++;
      }
      limit = bigIntSqrt(n);
      if (n === 1n) break;
    }
  }

  if (n > 1n && (isProbablePrimeBig(n, 16) || checked < candidateLimit)) {
    factors.push(n);
  }

  let prod = 1n;
  for (const f of factors) prod *= f;
  const complete = prod === nInput && factors.every(f => isProbablePrimeBig(f, 16));
  const elapsedMs = Number((performance.now() - t0).toFixed(3));
  const totalOperations = sumOps(ctr);
  const { estimatedEnergyJ } = computeEstimatedEnergy(ctr, elapsedMs, energyParams);

  return {
    algorithmId: 'naive-trial',
    labelAr: 'القوة الغاشمة التقليدية',
    status: complete ? 'FACTORS_VERIFIED' : 'INCONCLUSIVE_BUDGET',
    factorsSummary: complete ? factors.sort((a, b) => (a < b ? -1 : 1)).map(String).join(' × ') : `توقف عند d=${checked}`,
    elapsedMs,
    totalOperations,
    estimatedEnergyJ,
    detailNote: complete
      ? `تم التفكيك الكامل خلال ${checked.toLocaleString()} مرشح`
      : `استُنفدت ميزانية الفحص (${candidateLimit.toLocaleString()} مرشح < √N)`
  };
};

/**
 * Bounded Wheel Trial Division baseline (W=30 or W=30030)
 */
export const runWheelTrialBaseline = (
  nInput: bigint,
  wheelPrimes: number[] = [2, 3, 5, 7, 11, 13],
  candidateLimit: number = 250000,
  energyParams: PsiEnergyParams = DEFAULT_PSI_ENERGY_PARAMS
): AlgorithmBenchmarkSnapshot => {
  const t0 = performance.now();
  const ctr = emptyCounters();
  let n = nInput;
  const factors: bigint[] = [];

  const smallPrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  for (const p of smallPrimes) {
    const pBig = BigInt(p);
    while (n % pBig === 0n) {
      factors.push(pBig);
      n /= pBig;
      ctr.integerDivisions++;
    }
    ctr.otherSteps++;
  }

  if (n > 1n) {
    const { W, residues } = buildWheelOffsets(wheelPrimes);
    let limit = bigIntSqrt(n);
    let d = 7n;
    let rem = Number(d % BigInt(W));
    let tested = 0;

    while (d <= limit && tested < candidateLimit) {
      if (residues[rem] === 1) {
        tested++;
        ctr.wheelCandidates++;
        ctr.otherSteps++;
        if (n % d === 0n) {
          while (n % d === 0n) {
            factors.push(d);
            n /= d;
            ctr.integerDivisions++;
          }
          limit = bigIntSqrt(n);
          if (n === 1n) break;
        }
      }
      d += 2n;
      rem = (rem + 2) % W;
    }

    if (n > 1n && isProbablePrimeBig(n, 16)) {
      factors.push(n);
    }
  }

  let prod = 1n;
  for (const f of factors) prod *= f;
  const complete = prod === nInput && factors.every(f => isProbablePrimeBig(f, 16));
  const elapsedMs = Number((performance.now() - t0).toFixed(3));
  const totalOperations = sumOps(ctr);
  const { estimatedEnergyJ } = computeEstimatedEnergy(ctr, elapsedMs, energyParams);

  return {
    algorithmId: 'wheel-trial',
    labelAr: `الغربلة المعيارية (W=${buildWheelOffsets(wheelPrimes).W})`,
    status: complete ? 'FACTORS_VERIFIED' : 'INCONCLUSIVE_BUDGET',
    factorsSummary: complete ? factors.sort((a, b) => (a < b ? -1 : 1)).map(String).join(' × ') : `استُنفد بعد ${ctr.wheelCandidates.toLocaleString()} مرشح`,
    elapsedMs,
    totalOperations,
    estimatedEnergyJ,
    detailNote: complete
      ? `مرشحو Wheel الفعليون: ${ctr.wheelCandidates.toLocaleString()}`
      : `تجاوز √N سقف الميزانية (${candidateLimit.toLocaleString()} مرشح Wheel)`
  };
};

export interface PsiRunOptions {
  mode?: 'psi-hybrid' | 'psi2-adaptive';
  wheelPrimes?: number[];
  wheelLimit?: number;
  fermatLimit?: number;
  rhoIterLimit?: number;
  allowCfracFallback?: boolean;
  energyParams?: PsiEnergyParams;
}

const collapseExponents = (factors: bigint[]): Array<{ prime: string; power: number }> => {
  const sorted = [...factors].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out: Array<{ prime: string; power: number }> = [];
  for (const f of sorted) {
    const s = f.toString();
    const last = out[out.length - 1];
    if (last && last.prime === s) last.power++;
    else out.push({ prime: s, power: 1 });
  }
  return out;
};

/**
 * Main Ψ-Factor & Ψ-2 Adaptive Hybrid Factorization Engine
 * Stages:
 *   1. Small-prime extraction
 *   2. Modular Wheel candidate scan (configurable W=30, 210, 30030)
 *   3. Perfect square + bounded Fermat symmetry scan
 *   4. Reproducible Pollard-Brent Rho with seed retries
 *   5. (Ψ-2 Adaptive mode only) Escalate medium balanced composites to ZF-19 CFRAC or ECM Stage 1
 */
export const runPsiFactor = (nInput: bigint, options: PsiRunOptions = {}): PsiFactorResult => {
  const tStart = performance.now();
  const mode = options.mode ?? 'psi2-adaptive';
  const wheelPrimes = options.wheelPrimes ?? [2, 3, 5];
  const wheelLimit = options.wheelLimit ?? 100000;
  const fermatLimit = options.fermatLimit ?? 2500;
  const rhoIterLimit = options.rhoIterLimit ?? 320000;
  const energyParams = options.energyParams ?? DEFAULT_PSI_ENERGY_PARAMS;

  const wheelStats = computeWheelStats(wheelPrimes);
  const ctr = emptyCounters();
  const stages: PsiStageLog[] = [];
  const rawFactors: bigint[] = [];
  let winningStage = 'Stage 1';
  let n = nInput;

  const finalize = (): PsiFactorResult => {
    const elapsedMs = Number((performance.now() - tStart).toFixed(3));
    let prod = 1n;
    for (const f of rawFactors) prod *= f;
    const verifiedProduct = prod === nInput && rawFactors.length > 0;
    const allFactorsProbablePrime = rawFactors.length > 0 && rawFactors.every(f => isProbablePrimeBig(f, 16));
    const unresolvedResidual = !verifiedProduct || !allFactorsProbablePrime ? n.toString() : null;

    let status: PsiStatus = 'INCONCLUSIVE_BUDGET';
    if (verifiedProduct && allFactorsProbablePrime) {
      status = rawFactors.length === 1 ? 'PRIME_RESIDUAL' : 'FACTORS_VERIFIED';
    }

    const energy = computeEstimatedEnergy(ctr, elapsedMs, energyParams);
    return {
      n: nInput.toString(),
      bits: nInput > 0n ? nInput.toString(2).length : 0,
      mode,
      status,
      factors: [...rawFactors].sort((a, b) => (a < b ? -1 : 1)).map(String),
      exponents: collapseExponents(rawFactors),
      unresolvedResidual,
      verifiedProduct,
      allFactorsProbablePrime,
      winningStage,
      counters: ctr,
      totalOperations: sumOps(ctr),
      estimatedEnergyJ: energy.estimatedEnergyJ,
      landauerMinBitJ: energy.landauerMinBitJ,
      equivalentLandauerBits: energy.equivalentLandauerBits,
      elapsedMs,
      stages,
      wheelStats
    };
  };

  if (n < 2n) return finalize();

  // Check if N itself is already probable prime
  if (isProbablePrimeBig(n, 16)) {
    rawFactors.push(n);
    winningStage = 'Probable-Prime Precheck';
    stages.push({
      stage: 'Precheck',
      titleAr: 'فحص الأولية الأولي (Miller-Rabin)',
      extractedFactor: n.toString(),
      stepsUsed: 1,
      elapsedMs: Number((performance.now() - tStart).toFixed(3)),
      status: 'COMPLETED',
      noteAr: 'العدد اجتاز 16 جولة Miller-Rabin كأولي محتمل.'
    });
    return finalize();
  }

  // Stage 1: Small-prime extraction
  const s1Start = performance.now();
  const smallPrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  const s1Found: string[] = [];
  for (const p of smallPrimes) {
    const pBig = BigInt(p);
    while (n % pBig === 0n) {
      rawFactors.push(pBig);
      s1Found.push(p.toString());
      n /= pBig;
      ctr.integerDivisions++;
    }
    ctr.otherSteps++;
  }
  stages.push({
    stage: 'Stage 1',
    titleAr: 'استخلاص الأوليات الصغيرة (2..47)',
    extractedFactor: s1Found.length ? s1Found.join(' × ') : null,
    stepsUsed: smallPrimes.length,
    elapsedMs: Number((performance.now() - s1Start).toFixed(3)),
    status: s1Found.length ? 'FACTOR_FOUND' : 'COMPLETED',
    noteAr: s1Found.length ? `استُخرجت العوامل: ${s1Found.join(', ')}` : 'لا توجد عوامل أولية ≤ 47.'
  });

  if (n === 1n) {
    winningStage = 'Stage 1 (Small Primes)';
    return finalize();
  }
  if (isProbablePrimeBig(n, 16)) {
    rawFactors.push(n);
    winningStage = 'Stage 1 (Small Primes)';
    return finalize();
  }

  // Stage 2: Wheel Trial Division
  const s2Start = performance.now();
  const { W, residues } = buildWheelOffsets(wheelPrimes);
  let limit = bigIntSqrt(n);
  let d = 7n;
  let rem = Number(d % BigInt(W));
  const wLimitBig = BigInt(wheelLimit);
  const s2Found: string[] = [];
  const beforeWheelCands = ctr.wheelCandidates;

  while (d <= wLimitBig && d <= limit && n > 1n) {
    if (residues[rem] === 1) {
      ctr.wheelCandidates++;
      if (n % d === 0n) {
        while (n % d === 0n) {
          rawFactors.push(d);
          s2Found.push(d.toString());
          n /= d;
          ctr.integerDivisions++;
        }
        limit = bigIntSqrt(n);
        if (n === 1n || isProbablePrimeBig(n, 16)) break;
      }
    }
    d += 2n;
    rem = (rem + 2) % W;
    ctr.otherSteps++;
  }
  const wheelUsed = ctr.wheelCandidates - beforeWheelCands;
  stages.push({
    stage: 'Stage 2',
    titleAr: `غربلة العجلة المعيارية Wheel (W=${W})`,
    extractedFactor: s2Found.length ? s2Found.join(' × ') : null,
    stepsUsed: wheelUsed,
    elapsedMs: Number((performance.now() - s2Start).toFixed(3)),
    status: s2Found.length ? 'FACTOR_FOUND' : 'NO_HIT_IN_BUDGET',
    noteAr: s2Found.length
      ? `استخراج مباشر عبر Wheel بعد ${wheelUsed.toLocaleString()} مرشحاً`
      : `فُحص ${wheelUsed.toLocaleString()} مرشحاً حتى الحد ${wheelLimit.toLocaleString()}.`
  });

  if (n === 1n) {
    winningStage = `Stage 2 (Wheel W=${W})`;
    return finalize();
  }
  if (isProbablePrimeBig(n, 16)) {
    rawFactors.push(n);
    winningStage = s2Found.length ? `Stage 2 (Wheel W=${W})` : winningStage;
    return finalize();
  }

  // Stage 3: Bounded Fermat symmetry search
  const s3Start = performance.now();
  let a = bigIntSqrt(n);
  if (a * a < n) a += 1n;
  let fermatHit: [bigint, bigint] | null = null;
  for (let i = 0; i < fermatLimit; i++) {
    const b2 = a * a - n;
    const b = bigIntSqrt(b2);
    ctr.fermatSteps++;
    ctr.otherSteps++;
    if (b * b === b2) {
      const f1 = a - b;
      const f2 = a + b;
      if (f1 > 1n && f2 > 1n && f1 * f2 === n) {
        fermatHit = [f1, f2];
        break;
      }
    }
    a += 1n;
  }
  stages.push({
    stage: 'Stage 3',
    titleAr: 'التناظر حول الجذر (Fermat المحدود)',
    extractedFactor: fermatHit ? `${fermatHit[0]} × ${fermatHit[1]}` : null,
    stepsUsed: ctr.fermatSteps,
    elapsedMs: Number((performance.now() - s3Start).toFixed(3)),
    status: fermatHit ? 'FACTOR_FOUND' : 'NO_HIT_IN_BUDGET',
    noteAr: fermatHit
      ? `تم العثور على مربع كامل الفرق خلال ${ctr.fermatSteps} خطوة فيرما.`
      : `لم يتطابق Δ خلال ${fermatLimit.toLocaleString()} خطوة (العوامل غير متقاربة جداً).`
  });

  if (fermatHit) {
    for (const f of fermatHit) {
      if (isProbablePrimeBig(f, 16)) rawFactors.push(f);
      else rawFactors.push(f);
    }
    winningStage = 'Stage 3 (Fermat Symmetry)';
    return finalize();
  }

  // Stage 4: Pollard-Brent Rho with reproducible (seed, c) schedule
  const s4Start = performance.now();
  const rhoRetries: Array<[bigint, bigint]> = [
    [2n, 1n],
    [3n, 1n],
    [2n, 3n],
    [5n, 7n],
    [11n, 13n]
  ];
  let rhoFactor: bigint | null = null;
  const perTryLimit = n.toString(2).length <= 64
    ? Math.max(140000, Math.floor(rhoIterLimit / 2))
    : Math.max(40000, Math.floor(rhoIterLimit / rhoRetries.length));
  for (const [seed, c] of rhoRetries) {
    const g = pollardBrentCounted(n, ctr, seed, c, 64, perTryLimit);
    if (g !== null && g > 1n && g < n && n % g === 0n) {
      rhoFactor = g;
      break;
    }
  }
  stages.push({
    stage: 'Stage 4',
    titleAr: 'Pollard-Brent Rho (بذور حتمية متتابعة)',
    extractedFactor: rhoFactor ? `${rhoFactor} × ${n / rhoFactor}` : null,
    stepsUsed: ctr.rhoIterations,
    elapsedMs: Number((performance.now() - s4Start).toFixed(3)),
    status: rhoFactor ? 'FACTOR_FOUND' : 'NO_HIT_IN_BUDGET',
    noteAr: rhoFactor
      ? `استخراج العامل خلال ${ctr.rhoIterations.toLocaleString()} تكرار Pollard-Brent.`
      : `استُنفدت ميزانية التكرار (${ctr.rhoIterations.toLocaleString()} خطوة) — غالباً شبه أولي متوازن كبير.`
  });

  if (rhoFactor) {
    const other = n / rhoFactor;
    for (const part of [rhoFactor, other]) {
      if (isProbablePrimeBig(part, 16)) rawFactors.push(part);
      else {
        const sub = runPsiFactor(part, {
          ...options,
          rhoIterLimit: Math.min(80000, rhoIterLimit)
        });
        rawFactors.push(...sub.factors.map(BigInt));
      }
    }
    winningStage = 'Stage 4 (Pollard-Brent Rho)';
    return finalize();
  }

  // Stage 5: Ψ-2 Adaptive Escalation (CFRAC for balanced <= 84 bits, bounded ECM scout above)
  if (mode === 'psi2-adaptive' && (options.allowCfracFallback ?? true)) {
    const nBits = n.toString(2).length;
    if (nBits <= 84) {
      const s5Start = performance.now();
      const bound = nBits <= 40 ? 250 : nBits <= 64 ? 950 : 4200;
      const cfracRes = runZf19Cfrac({
        N: n,
        factor_base_bound: bound,
        max_relations: bound + 60,
        max_iterations: 160000,
        matrix_solver: 'gaussian',
        timeout_seconds: 5,
        enable_partial_relations: true
      });
      ctr.cfracIterations += cfracRes.iterations_run;
      const ok = cfracRes.status === 'FACTORS_VERIFIED' && cfracRes.factor_p && cfracRes.factor_q;
      stages.push({
        stage: 'Stage 5 (Ψ-2)',
        titleAr: 'تصعيد Ψ-2 التكيفي إلى CFRAC (الكسور المستمرة)',
        extractedFactor: ok ? `${cfracRes.factor_p} × ${cfracRes.factor_q}` : null,
        stepsUsed: cfracRes.iterations_run,
        elapsedMs: Number((performance.now() - s5Start).toFixed(3)),
        status: ok ? 'FACTOR_FOUND' : 'NO_HIT_IN_BUDGET',
        noteAr: ok
          ? `نجح Ψ-2 التكيفي عبر CFRAC (${cfracRes.relations_collected} علاقة ملساء).`
          : `توقف CFRAC بحالة ${cfracRes.status}.`
      });
      if (ok && cfracRes.factor_p && cfracRes.factor_q) {
        rawFactors.push(BigInt(cfracRes.factor_p), BigInt(cfracRes.factor_q));
        winningStage = 'Stage 5 (Ψ-2 → CFRAC)';
        return finalize();
      }
    } else {
      // Bounded Montgomery-like / p-1 + small ECM style fast scout (honest budget report for 128-256b balanced)
      const s5Start = performance.now();
      let p1Found: bigint | null = null;
      let aPow = 2n;
      let b1Limit = 1200;
      for (let m = 2; m <= b1Limit; m++) {
        aPow = modPowBig(aPow, BigInt(m), n);
        ctr.ecmSteps++;
        if (m % 50 === 0) {
          const g = gcdBig(aPow - 1n, n);
          ctr.gcdCalls++;
          if (g > 1n && g < n) {
            p1Found = g;
            break;
          }
        }
      }
      stages.push({
        stage: 'Stage 5 (Ψ-2)',
        titleAr: `استكشاف Ψ-2 التكيفي (Pollard p-1 · B1=${b1Limit})`,
        extractedFactor: p1Found ? `${p1Found} × ${n / p1Found}` : null,
        stepsUsed: b1Limit,
        elapsedMs: Number((performance.now() - s5Start).toFixed(3)),
        status: p1Found ? 'FACTOR_FOUND' : 'NO_HIT_IN_BUDGET',
        noteAr: p1Found
          ? 'تم استخراج عامل عبر نعومة p-1.'
          : `شبه أولي متوازن (${nBits} بت): يتطلب SIQS متوازياً أو GNFS (لا يُعلن أولياً عند نفاد الميزانية).`
      });
      if (p1Found) {
        rawFactors.push(p1Found, n / p1Found);
        winningStage = 'Stage 5 (Ψ-2 Pollard p-1)';
        return finalize();
      }
    }
  }

  return finalize();
};

export const runPsi31ComparisonForTarget = (
  n: bigint,
  wheelPrimes: number[] = [2, 3, 5, 7, 11, 13],
  energyParams: PsiEnergyParams = DEFAULT_PSI_ENERGY_PARAMS
): AlgorithmBenchmarkSnapshot[] => {
  const nBits = n.toString(2).length;
  const trialBudget = nBits <= 36 ? 120000 : 40000;

  // 1. Naive trial
  const naive = runNaiveTrialBaseline(n, trialBudget, energyParams);

  // 2. Wheel trial
  const wheel = runWheelTrialBaseline(n, wheelPrimes, trialBudget, energyParams);

  // 3. Pure Ψ-Factor (Stages 1-4 matching psi_factor_192_experiment.py)
  const psiPureRes = runPsiFactor(n, {
    mode: 'psi-hybrid',
    wheelPrimes,
    wheelLimit: nBits <= 40 ? 100000 : 50000,
    fermatLimit: 2000,
    rhoIterLimit: nBits <= 64 ? 300000 : nBits <= 192 ? 280000 : 180000,
    allowCfracFallback: false,
    energyParams
  });
  const psiPure: AlgorithmBenchmarkSnapshot = {
    algorithmId: 'psi-hybrid',
    labelAr: 'Ψ-Factor الهجينة (المراحل 1–4)',
    status: psiPureRes.status === 'FACTORS_VERIFIED' ? 'FACTORS_VERIFIED' : 'INCONCLUSIVE_BUDGET',
    factorsSummary:
      psiPureRes.status === 'FACTORS_VERIFIED'
        ? psiPureRes.factors.join(' × ')
        : `غير حاسم ضمن ${psiPureRes.counters.rhoIterations.toLocaleString()} خطوة Rho`,
    elapsedMs: psiPureRes.elapsedMs,
    totalOperations: psiPureRes.totalOperations,
    estimatedEnergyJ: psiPureRes.estimatedEnergyJ,
    detailNote:
      psiPureRes.status === 'FACTORS_VERIFIED'
        ? `${psiPureRes.winningStage} · Wheel=${psiPureRes.counters.wheelCandidates.toLocaleString()}`
        : `توقف عند ميزانية ${psiPureRes.totalOperations.toLocaleString()} عملية`
  };

  // 4. Standalone Pollard-Brent Rho
  const rhoStart = performance.now();
  const rhoCtr = emptyCounters();
  const rhoLimit = nBits <= 64 ? 420000 : 260000;
  const rhoPerTry = nBits <= 64 ? 180000 : Math.floor(rhoLimit / 3);
  let rhoFac: bigint | null = null;
  for (const [seed, c] of [
    [2n, 1n],
    [3n, 1n],
    [2n, 3n]
  ] as Array<[bigint, bigint]>) {
    const g = pollardBrentCounted(n, rhoCtr, seed, c, 64, rhoPerTry);
    if (g && g > 1n && g < n) {
      rhoFac = g;
      break;
    }
  }
  const rhoMs = Number((performance.now() - rhoStart).toFixed(3));
  const rhoOps = sumOps(rhoCtr);
  const rhoEnergy = computeEstimatedEnergy(rhoCtr, rhoMs, energyParams).estimatedEnergyJ;
  const pollard: AlgorithmBenchmarkSnapshot = {
    algorithmId: 'pollard-brent',
    labelAr: 'Pollard-Brent Rho منفرد',
    status: rhoFac ? 'FACTORS_VERIFIED' : 'INCONCLUSIVE_BUDGET',
    factorsSummary: rhoFac
      ? [rhoFac, n / rhoFac].sort((a, b) => (a < b ? -1 : 1)).map(String).join(' × ')
      : `استُنفدت ${rhoCtr.rhoIterations.toLocaleString()} خطوة`,
    elapsedMs: rhoMs,
    totalOperations: rhoOps,
    estimatedEnergyJ: rhoEnergy,
    detailNote: `GCD=${rhoCtr.gcdCalls} · Rho=${rhoCtr.rhoIterations.toLocaleString()}`
  };

  // 5. Ψ-2 Adaptive
  const psi2Res = runPsiFactor(n, {
    mode: 'psi2-adaptive',
    wheelPrimes,
    wheelLimit: nBits <= 40 ? 100000 : 50000,
    fermatLimit: 2000,
    rhoIterLimit: nBits <= 64 ? 300000 : 180000,
    allowCfracFallback: true,
    energyParams
  });
  const psi2: AlgorithmBenchmarkSnapshot = {
    algorithmId: 'psi2-adaptive',
    labelAr: 'Ψ-2 التكيفية (+ CFRAC/p-1)',
    status: psi2Res.status === 'FACTORS_VERIFIED' ? 'FACTORS_VERIFIED' : 'INCONCLUSIVE_BUDGET',
    factorsSummary:
      psi2Res.status === 'FACTORS_VERIFIED'
        ? psi2Res.factors.join(' × ')
        : `يتطلب SIQS/GNFS المتوازي (${nBits} بت متوازن)`,
    elapsedMs: psi2Res.elapsedMs,
    totalOperations: psi2Res.totalOperations,
    estimatedEnergyJ: psi2Res.estimatedEnergyJ,
    detailNote: psi2Res.winningStage
  };

  return [naive, wheel, psiPure, pollard, psi2];
};

export const PSI_31_PYTHON_SUITE_CODE = `#!/usr/bin/env python3
"""
Ψ-3.1 Multi-Size Benchmark Suite (32b, 64b, 128b, 192b unbalanced & balanced, 256b)
Exact integer arithmetic with explicit operation counters and configurable energy model.
"""
from math import gcd, isqrt
from time import perf_counter

CASES = [
    ("32b balanced", 46051 * 52291),
    ("64b balanced", 2852409611 * 3583214659),
    ("192b unbalanced (33b x 160b)", 4296201881 * 730750818665451459101842416368018053038089728337),
    ("128b balanced (64b x 64b)", 11970603839773335941 * 14352177267856319207),
    ("192b balanced (96b x 96b)", 57747661831590221715253556141 * 70095019185174049796531434379),
    ("256b balanced (128b x 128b)", 263842133177923034044090775590207241221 * 272665022436140094284060892262472477197),
]

# Configurable energy weights (Joules/op)
E_MODMUL, E_GCD, E_MOD, E_DIV, E_OTHER = 2.0e-9, 8.0e-9, 1.0e-9, 3.0e-9, 0.2e-9
`;
