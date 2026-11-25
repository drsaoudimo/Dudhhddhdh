import {
  benchmarkRedcVsNaive,
  createMontgomeryRedcCtx,
  MontgomeryRedcCtx,
  RedcBenchmarkResult
} from './lib/montgomeryRedcKernel';
import {
  BD500,
  bdAdd,
  bdDivInt,
  bdLn2,
  bdLnBigInt,
  bdMul,
  bdMulInt,
  bdToNumber,
  bdZero
} from './lib/highPrecisionEngine';

export interface SmoothRelation {
  xVal: string;
  qVal?: string;
  signNeg: boolean;
  sparseCols?: number[];
  extraSquare?: string;
  largePrime?: string;
  largePrime2?: string;
  exponents?: number[];
}

export interface FactorBaseData {
  primes: number[];
  roots: number[];
  logs: number[];
  largePrimeBound: number;
  multiplier?: number;
}

export interface SolveStageTimings {
  bfsBuildMs: number;
  markowitzMs: number;
  linearSolveMs: number;
  sqrtMs: number;
  builtCycles: number;
}

export interface SparseSolveResult {
  factor: bigint | null;
  dependenciesTested: number;
  methodUsed: 'block-wiedemann' | 'markowitz-core' | 'none';
  krylovSteps: number;
  coreRows: number;
  coreCols: number;
  redcBenchmark?: RedcBenchmarkResult;
  stageTimings?: SolveStageTimings;
  dynamicScaling?: {
    nBits: number;
    scaleFactor: number;
    blockSize: number;
    scaledRows: number;
    scaledCols: number;
  };
}

export const gcdBig = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y > 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

export const modPowBig = (base: bigint, exp: bigint, mod: bigint): bigint => {
  let res = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return res;
};

export const isProbablePrimeBig = (n: bigint, k: number = 10): boolean => {
  if (n === 2n || n === 3n) return true;
  if (n < 2n || (n & 1n) === 0n) return false;
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  const smallBases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  for (let i = 0; i < Math.min(k, smallBases.length); i++) {
    const a = smallBases[i];
    if (a >= n) break;
    let x = modPowBig(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let r = 1; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
};

const modPowNum = (base: number, exp: number, mod: number): number => {
  let res = 1n;
  let b = BigInt(((base % mod) + mod) % mod);
  let e = BigInt(exp);
  const m = BigInt(mod);
  while (e > 0n) {
    if (e & 1n) res = (res * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(res);
};

const tonelliShanks = (nModP: number, p: number): number => {
  if (p === 2) return nModP & 1;
  if (nModP === 0) return 0;
  if (p % 4 === 3) {
    return modPowNum(nModP, (p + 1) >> 2, p);
  }
  let q = p - 1;
  let s = 0;
  while ((q & 1) === 0) {
    q >>= 1;
    s++;
  }
  let z = 2;
  while (modPowNum(z, (p - 1) >> 1, p) !== p - 1) {
    z++;
  }
  let m = s;
  let c = modPowNum(z, q, p);
  let t = modPowNum(nModP, q, p);
  let r = modPowNum(nModP, (q + 1) >> 1, p);

  while (t !== 1) {
    if (t === 0) return 0;
    let i = 1;
    let temp = Number((BigInt(t) * BigInt(t)) % BigInt(p));
    while (temp !== 1 && i < m) {
      temp = Number((BigInt(temp) * BigInt(temp)) % BigInt(p));
      i++;
    }
    if (i === m) return 0;
    const b = modPowNum(c, 1 << (m - i - 1), p);
    m = i;
    c = Number((BigInt(b) * BigInt(b)) % BigInt(p));
    t = Number((BigInt(t) * BigInt(c)) % BigInt(p));
    r = Number((BigInt(r) * BigInt(b)) % BigInt(p));
  }
  return r;
};

const KS_MULTIPLIERS = [
  1, 2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30, 31, 33, 34, 35, 37,
  38, 39, 41, 42, 43, 46, 47, 51, 53, 55, 57, 58, 59, 61, 62, 65, 66, 67, 69, 70, 71, 73
];
const KS_ODD_PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

let cachedKsPrimeContribs: BD500[] | null = null;
const getKsPrimeContribsBD = (): BD500[] => {
  if (cachedKsPrimeContribs) return cachedKsPrimeContribs;
  cachedKsPrimeContribs = KS_ODD_PRIMES.map(p => bdDivInt(bdLnBigInt(BigInt(p)), p - 1));
  return cachedKsPrimeContribs;
};

const cachedKsMultiplierPenalty = new Map<number, BD500>();
const getKsMultiplierPenaltyBD = (k: number): BD500 => {
  let v = cachedKsMultiplierPenalty.get(k);
  if (v !== undefined) return v;
  v = k <= 1 ? bdZero() : -(bdLnBigInt(BigInt(k)) >> 1n);
  cachedKsMultiplierPenalty.set(k, v);
  return v;
};

export const selectRankedKnuthSchroeppelMultipliers = (
  N: bigint,
  count: number = 8
): { ranked: number[]; directFactor?: bigint; topScore500d?: number } => {
  if (N < 16n) return { ranked: [1] };
  const scored: Array<{ k: number; scoreBD: BD500 }> = [];
  const ln2BD = bdLn2();
  const twoLn2BD = ln2BD << 1n;
  const halfLn2BD = ln2BD >> 1n;
  const primeContribs = getKsPrimeContribsBD();
  void bdMul;
  void bdMulInt;

  for (let i = 0; i < KS_MULTIPLIERS.length; i++) {
    const k = KS_MULTIPLIERS[i];
    if (k > 1) {
      const g = gcdBig(BigInt(k), N);
      if (g > 1n && g < N) {
        return { ranked: [k], directFactor: g };
      }
    }

    const kN = BigInt(k) * N;
    let scoreBD = getKsMultiplierPenaltyBD(k);
    const mod8 = Number(kN & 7n);
    if (mod8 === 1) scoreBD = bdAdd(scoreBD, twoLn2BD);
    else if (mod8 === 5) scoreBD = bdAdd(scoreBD, ln2BD);
    else if (mod8 === 3 || mod8 === 7) scoreBD = bdAdd(scoreBD, halfLn2BD);

    for (let j = 0; j < KS_ODD_PRIMES.length; j++) {
      const p = KS_ODD_PRIMES[j];
      const contribBD = primeContribs[j];
      if (k % p === 0) {
        scoreBD = bdAdd(scoreBD, contribBD);
      } else {
        const knModP = Number(kN % BigInt(p));
        if (knModP === 0) {
          scoreBD = bdAdd(scoreBD, contribBD);
        } else if (modPowNum(knModP, (p - 1) >> 1, p) === 1) {
          scoreBD = bdAdd(scoreBD, contribBD << 1n);
        }
      }
    }

    scored.push({ k, scoreBD });
  }

  scored.sort((a, b) => (b.scoreBD > a.scoreBD ? 1 : b.scoreBD < a.scoreBD ? -1 : 0));
  const picked = scored.slice(0, Math.max(1, count));
  return {
    ranked: picked.map(s => s.k),
    topScore500d: picked[0] ? bdToNumber(picked[0].scoreBD) : 0
  };
};

/**
 * Knuth-Schroeppel Multiplier Selection (500-digit BD500 scoring):
 * Finds square-free k in [1..73] maximizing small-prime quadratic residues for k*N
 * so k*N ≡ 1 (mod 8) and small primes divide Q(x) more frequently.
 */
export const selectKnuthSchroeppelMultiplier = (
  N: bigint
): { k: number; directFactor?: bigint; bestScore500d?: number } => {
  const res = selectRankedKnuthSchroeppelMultipliers(N, 1);
  return {
    k: res.ranked[0] ?? 1,
    directFactor: res.directFactor,
    bestScore500d: res.topScore500d
  };
};

/**
 * QR-Filtered Factor Base: retains only primes p where Legendre(M, p) === +1 (plus p = 2).
 * Supports optional Knuth-Schroeppel M = k * N and scales smoothly across 64..820+ bit moduli.
 */
export const buildMpqsFactorBase = (
  N: bigint,
  overrideM?: bigint,
  workerCount: number = 1
): FactorBaseData => {
  const M = overrideM && overrideM >= N ? overrideM : N;
  const bits = N.toString(2).length;
  const wc = Math.max(1, Math.floor(workerCount || 1));
  const fb256 = wc <= 2 ? 3800 : (wc <= 4 ? 4400 : (wc <= 6 ? 5000 : 5600));

  let targetSize = 120;
  if (bits <= 64) targetSize = 65;
  else if (bits <= 100) targetSize = 115;
  else if (bits <= 125) targetSize = 220;
  else if (bits <= 145) targetSize = 380;
  else if (bits <= 170) targetSize = 680;
  else if (bits <= 198) targetSize = 1350;
  else if (bits <= 224) targetSize = 1950;
  else if (bits <= 256) targetSize = Math.round(1950 + ((bits - 224) / 32) * (fb256 - 1950));
  else if (bits <= 320) targetSize = Math.round(fb256 + ((bits - 256) / 64) * (6000 - fb256));
  else if (bits <= 420) targetSize = Math.round(6000 + ((bits - 320) / 100) * 12000);
  else if (bits <= 540) targetSize = Math.round(18000 + ((bits - 420) / 120) * 27000);
  else if (bits <= 680) targetSize = Math.round(45000 + ((bits - 540) / 140) * 25000);
  else if (bits <= 820) targetSize = Math.round(70000 + ((bits - 680) / 140) * 20000);
  else targetSize = 90000;

  const primes: number[] = [2];
  const roots: number[] = [Number(M & 1n)];
  const logs: number[] = [1];

  const limit = targetSize >= 70000
    ? 2900000
    : (targetSize >= 45000
      ? 2200000
      : (targetSize >= 18000
        ? 1350000
        : (targetSize >= 4500
          ? 600000
          : (targetSize >= 3000
            ? 420000
            : (bits > 220 ? 320000 : 120000)))));
  // Odd-only prime sieve: index (p >> 1) stores primality of odd integer p >= 3
  const halfLimit = (limit >> 1) + 1;
  const isCompOdd = new Uint8Array(halfLimit);
  const sqrtLim = Math.floor(Math.sqrt(limit));
  for (let p = 3; p <= sqrtLim; p += 2) {
    if (!isCompOdd[p >> 1]) {
      const step = p;
      for (let j = (p * p) >> 1; j < halfLimit; j += step) {
        isCompOdd[j] = 1;
      }
    }
  }

  for (let p = 3; p <= limit && primes.length < targetSize; p += 2) {
    if (!isCompOdd[p >> 1]) {
      const pBig = BigInt(p);
      const nMod = Number(M % pBig);
      if (nMod === 0) continue;
      const leg = modPowNum(nMod, (p - 1) >> 1, p);
      if (leg === 1) {
        const r = tonelliShanks(nMod, p);
        if (r > 0) {
          primes.push(p);
          roots.push(r);
          logs.push(Math.max(1, Math.round(Math.log2(p))));
        }
      }
    }
  }

  const maxP = primes[primes.length - 1] || 2;
  const lpMult256 = wc <= 2 ? 240 : (wc <= 4 ? 280 : (wc <= 6 ? 310 : 350));
  const lpCap256 = wc <= 2 ? 20000000 : (wc <= 4 ? 26000000 : (wc <= 6 ? 32000000 : 38000000));
  const lpMult = bits >= 660 ? 750 : (bits >= 420 ? 600 : (bits >= 280 ? 420 : (bits >= 225 ? lpMult256 : 260)));
  const lpCap = bits >= 660
    ? 120000000
    : (bits >= 420
      ? 80000000
      : (bits >= 280
        ? 36000000
        : (bits >= 225 ? lpCap256 : (bits > 220 ? 15000000 : 4500000))));
  const largePrimeBound = Math.min(maxP * lpMult, maxP * maxP, lpCap);
  const multiplier = overrideM && N > 0n ? Number(M / N) : 1;

  return { primes, roots, logs, largePrimeBound, multiplier };
};

/**
 * CFRAC-tuned QR Factor Base: scales smoothly for both small numbers and medium/large semiprimes (64-160b),
 * and preserves small primes dividing multiplier k so residues Q_{i+1} divisible by k factor cleanly.
 */
export const buildCfracFactorBase = (M: bigint, baseN?: bigint): FactorBaseData => {
  const bits = (baseN || M).toString(2).length;
  let targetSize = 55;
  if (bits <= 24) targetSize = 14;
  else if (bits <= 36) targetSize = 24;
  else if (bits <= 48) targetSize = 36;
  else if (bits <= 64) targetSize = 56;
  else if (bits <= 84) targetSize = 90;
  else if (bits <= 104) targetSize = 130;
  else if (bits <= 128) targetSize = 175;
  else targetSize = 240;

  const primes: number[] = [2];
  const roots: number[] = [Number(M & 1n)];
  const logs: number[] = [1];

  const limit = 45000;
  const isComp = new Uint8Array(limit + 1);
  for (let p = 3; p <= limit && primes.length < targetSize; p += 2) {
    if (!isComp[p]) {
      for (let j = p * p; j <= limit; j += 2 * p) {
        isComp[j] = 1;
      }
      const pBig = BigInt(p);
      const mMod = Number(M % pBig);
      if (mMod === 0) {
        // Include prime p if it divides multiplier k rather than N
        if (!baseN || Number(baseN % pBig) !== 0) {
          primes.push(p);
          roots.push(0);
          logs.push(Math.max(1, Math.round(Math.log2(p))));
        }
        continue;
      }
      const leg = modPowNum(mMod, (p - 1) >> 1, p);
      if (leg === 1) {
        const r = tonelliShanks(mMod, p);
        if (r > 0) {
          primes.push(p);
          roots.push(r);
          logs.push(Math.max(1, Math.round(Math.log2(p))));
        }
      }
    }
  }

  const maxP = primes[primes.length - 1] || 2;
  const largePrimeBound = Math.min(maxP * 64, maxP * maxP, 4500000);
  return { primes, roots, logs, largePrimeBound };
};

export interface CfracSharedUnionFb {
  sharedPrimes: number[];
  largePrimeBound: number;
  getWorkerSubset: (k: number) => { localPrimes: number[]; globalCols: number[] };
}

/**
 * Shared Superset Factor Base for Parallel Multi-Worker CFRAC:
 * Because A_i^2 === (-1)^(i+1) Q_{i+1} (mod N) holds for ALL multipliers k modulo the same N,
 * every worker filters the shared prime bound by Legendre(kN, p) in {0, 1} (~50% fewer trial divisions)
 * while emitting column indices into ONE unified GF(2) matrix & 1LP/2LP cycle pool.
 */
export const buildCfracSharedUnionFactorBase = (
  N: bigint,
  multipliers: number[]
): CfracSharedUnionFb => {
  const bits = N.toString(2).length;
  let perWorkerQrTarget = 56;
  if (bits <= 24) perWorkerQrTarget = 14;
  else if (bits <= 36) perWorkerQrTarget = 22;
  else if (bits <= 48) perWorkerQrTarget = 34;
  else if (bits <= 64) perWorkerQrTarget = 52;
  else if (bits <= 84) perWorkerQrTarget = 84;
  else if (bits <= 104) perWorkerQrTarget = 120;
  else if (bits <= 128) perWorkerQrTarget = 160;
  else perWorkerQrTarget = 220;

  // Approximate union size: ~1.85x single-k QR factor base so each multiplier has ~perWorkerQrTarget primes
  const maxUnionPrimes = Math.max(24, Math.round(perWorkerQrTarget * (multipliers.length > 1 ? 1.85 : 1.0)));
  const limit = 25000;
  const isComp = new Uint8Array(limit + 1);
  const sharedPrimes: number[] = [2];

  const qrSets = new Map<number, { localPrimes: number[]; globalCols: number[] }>();
  for (const k of multipliers) {
    qrSets.set(k, { localPrimes: [2], globalCols: [0] });
  }

  for (let p = 3; p <= limit && sharedPrimes.length < maxUnionPrimes; p += 2) {
    if (isComp[p]) continue;
    for (let j = p * p; j <= limit; j += 2 * p) isComp[j] = 1;

    const pBig = BigInt(p);
    const nMod = Number(N % pBig);
    if (nMod === 0) continue; // N factor handled by direct trial check

    // Keep prime p in shared matrix if it is QR or divisor for any active multiplier
    const matchingMultipliers: number[] = [];
    for (const k of multipliers) {
      const knMod = (Number(k % p) * nMod) % p;
      if (knMod === 0 || modPowNum(knMod, (p - 1) >> 1, p) === 1) {
        matchingMultipliers.push(k);
      }
    }

    if (matchingMultipliers.length > 0) {
      const globalCol = sharedPrimes.length;
      sharedPrimes.push(p);
      for (const k of matchingMultipliers) {
        const entry = qrSets.get(k)!;
        entry.localPrimes.push(p);
        entry.globalCols.push(globalCol);
      }
    }
  }

  const maxP = sharedPrimes[sharedPrimes.length - 1] || 2;
  const largePrimeBound = Math.min(maxP * 64, maxP * maxP, 4500000);

  const getWorkerSubset = (k: number) => {
    const existing = qrSets.get(k);
    if (existing) return existing;
    const localPrimes: number[] = [2];
    const globalCols: number[] = [0];
    for (let idx = 1; idx < sharedPrimes.length; idx++) {
      const p = sharedPrimes[idx];
      const knMod = Number((BigInt(k) * N) % BigInt(p));
      if (knMod === 0 || modPowNum(knMod, (p - 1) >> 1, p) === 1) {
        localPrimes.push(p);
        globalCols.push(idx);
      }
    }
    const computed = { localPrimes, globalCols };
    qrSets.set(k, computed);
    return computed;
  };

  return { sharedPrimes, largePrimeBound, getWorkerSubset };
};

// Normalize relation into sparse odd-parity column list + Montgomery-REDC accumulated square factor
const normalizeRelationToSparse = (
  rel: SmoothRelation,
  fbPrimes: number[],
  N: bigint,
  montCtx: MontgomeryRedcCtx | null = null
): { xVal: bigint; signNeg: boolean; sparseCols: number[]; extraSquare: bigint } => {
  if (rel.sparseCols && rel.extraSquare !== undefined) {
    return {
      xVal: BigInt(rel.xVal),
      signNeg: rel.signNeg,
      sparseCols: rel.sparseCols,
      extraSquare: BigInt(rel.extraSquare) % N
    };
  }
  const exps = rel.exponents || [];
  const sparseCols: number[] = [];

  if (montCtx) {
    let extraM = montCtx.oneM;
    for (let i = 0; i < exps.length && i < fbPrimes.length; i++) {
      const e = exps[i];
      if (e <= 0) continue;
      if ((e & 1) === 1) sparseCols.push(i);
      const half = e >> 1;
      if (half === 1) {
        extraM = montCtx.montMul(extraM, montCtx.toMont(BigInt(fbPrimes[i])));
      } else if (half > 1) {
        const pPowM = montCtx.montPow(montCtx.toMont(BigInt(fbPrimes[i])), BigInt(half));
        extraM = montCtx.montMul(extraM, pPowM);
      }
    }
    return {
      xVal: BigInt(rel.xVal),
      signNeg: rel.signNeg,
      sparseCols,
      extraSquare: montCtx.fromMont(extraM)
    };
  }

  let extraSquare = 1n;
  for (let i = 0; i < exps.length && i < fbPrimes.length; i++) {
    const e = exps[i];
    if (e <= 0) continue;
    if ((e & 1) === 1) sparseCols.push(i);
    const half = e >> 1;
    if (half > 0) {
      extraSquare = (extraSquare * modPowBig(BigInt(fbPrimes[i]), BigInt(half), N)) % N;
    }
  }
  return {
    xVal: BigInt(rel.xVal),
    signNeg: rel.signNeg,
    sparseCols,
    extraSquare
  };
};

// Merge two sorted column arrays via GF(2) symmetric difference; repeated primes move into sharedProduct
const symDiffSortedCols = (
  a: number[],
  b: number[],
  fbPrimes: number[],
  N: bigint,
  montCtx: MontgomeryRedcCtx | null = null
): { cols: number[]; commonProduct: bigint } => {
  const out: number[] = [];
  let commonProductM = montCtx ? montCtx.oneM : 1n;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] < b[j]) {
      out.push(a[i++]);
    } else if (b[j] < a[i]) {
      out.push(b[j++]);
    } else {
      const pBig = BigInt(fbPrimes[a[i]]);
      commonProductM = montCtx
        ? montCtx.montMul(commonProductM, montCtx.toMont(pBig))
        : (commonProductM * pBig) % N;
      i++;
      j++;
    }
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return { cols: out, commonProduct: montCtx ? montCtx.fromMont(commonProductM) : commonProductM };
};
void symDiffSortedCols;

export interface LazyPoolEdge {
  u: string;
  v: string;
  rel: SmoothRelation;
}

export interface LazyPoolIncrementalPayload {
  fulls: SmoothRelation[];
  treeEdges: LazyPoolEdge[];
  cycleEdges: LazyPoolEdge[];
  nextCursor: { fulls: number; tree: number; cycles: number };
}

/**
 * Single & Double Large Prime (1LP + 2LP) Lazy Cycle Graph Pool with Unified Montgomery-REDC:
 * - Full relations: inserted directly into fullList/fullMap.
 * - During ingestion (`ingestBatch`): uses O(alpha(V)) Union-Find to count cycles lazily and
 *   stores spanning-tree edges vs cycle-trigger edges WITHOUT running BFS or BigInt chain muls.
 * - At GF(2) solve time (`materializeFullRelations`): builds a BFS spanning forest once per
 *   solve, walks parent pointers to the LCA for pending cycle edges, and merges congruences
 *   via Montgomery-REDC in a single batch.
 */
export class SingleLargePrimePool {
  private N: bigint;
  private fbPrimes: number[];
  private montCtx: MontgomeryRedcCtx | null;
  private fullMap = new Map<string, SmoothRelation>();
  private fullList: SmoothRelation[] = [];
  private seenPartials = new Set<string>();
  private ufParent = new Map<string, string>();
  private treeAdj = new Map<string, Array<{ to: string; rel: SmoothRelation }>>();
  private treeEdges: LazyPoolEdge[] = [];
  private cycleEdges: LazyPoolEdge[] = [];
  private pendingCycleOffset = 0;
  public partialCount = 0;
  public partial1Count = 0;
  public partial2Count = 0;
  public collisionsCount = 0;
  public totalBuiltCycles = 0;
  public lastBfsBuildMs = 0;

  constructor(N: bigint, fbPrimes: number[]) {
    this.N = N;
    this.fbPrimes = fbPrimes;
    this.montCtx = N > 2n && (N & 1n) === 1n ? createMontgomeryRedcCtx(N) : null;
    this.ufParent.set('1', '1');
    this.treeAdj.set('1', []);
  }

  public getRedcCtx(): MontgomeryRedcCtx | null {
    return this.montCtx;
  }

  public runRedcBenchmark(): RedcBenchmarkResult {
    return benchmarkRedcVsNaive(this.N, 'gf2-solver', this.montCtx || undefined);
  }

  private ensureNode(v: string): void {
    if (!this.ufParent.has(v)) {
      this.ufParent.set(v, v);
      this.treeAdj.set(v, []);
    }
  }

  private findRoot(v: string): string {
    if (!this.ufParent.has(v)) {
      this.ufParent.set(v, v);
      this.treeAdj.set(v, []);
      return v;
    }
    let root = v;
    while (this.ufParent.get(root) !== root) {
      root = this.ufParent.get(root)!;
    }
    let node = v;
    while (node !== root) {
      const nxt = this.ufParent.get(node)!;
      this.ufParent.set(node, root);
      node = nxt;
    }
    return root;
  }

  private combineCycleRelations(
    cycleRels: SmoothRelation[],
    cycleVerts: string[]
  ): SmoothRelation {
    const mc = this.montCtx;
    let combinedXM = mc ? mc.oneM : 1n;
    let combinedExtraM = mc ? mc.oneM : 1n;
    let signNeg = false;
    const colCounts = new Map<number, number>();

    for (let i = 0; i < cycleRels.length; i++) {
      const norm = normalizeRelationToSparse(cycleRels[i], this.fbPrimes, this.N, mc);
      if (mc) {
        combinedXM = mc.montMul(combinedXM, mc.toMont(norm.xVal));
        combinedExtraM = mc.montMul(combinedExtraM, mc.toMont(norm.extraSquare));
      } else {
        combinedXM = (combinedXM * norm.xVal) % this.N;
        combinedExtraM = (combinedExtraM * norm.extraSquare) % this.N;
      }
      if (norm.signNeg) signNeg = !signNeg;
      const cols = norm.sparseCols;
      for (let j = 0; j < cols.length; j++) {
        const c = cols[j];
        colCounts.set(c, (colCounts.get(c) || 0) + 1);
      }
    }

    // Every non-'1' vertex in the simple cycle appears exactly twice across edges -> multiply once into extraSquare
    for (let i = 0; i < cycleVerts.length; i++) {
      const v = cycleVerts[i];
      if (v !== '1') {
        const vBig = BigInt(v);
        combinedExtraM = mc
          ? mc.montMul(combinedExtraM, mc.toMont(vBig))
          : (combinedExtraM * vBig) % this.N;
      }
    }

    const mergedCols: number[] = [];
    for (const [col, cnt] of colCounts.entries()) {
      if ((cnt & 1) === 1) mergedCols.push(col);
      const half = cnt >> 1;
      if (half > 0) {
        const pBig = BigInt(this.fbPrimes[col]);
        if (mc) {
          const pPowM = half === 1 ? mc.toMont(pBig) : mc.montPow(mc.toMont(pBig), BigInt(half));
          combinedExtraM = mc.montMul(combinedExtraM, pPowM);
        } else {
          combinedExtraM = (combinedExtraM * modPowBig(pBig, BigInt(half), this.N)) % this.N;
        }
      }
    }
    mergedCols.sort((a, b) => a - b);

    const combinedX = mc ? mc.fromMont(combinedXM) : combinedXM;
    const combinedExtra = mc ? mc.fromMont(combinedExtraM) : combinedExtraM;
    const combinedKey = `CYC:${combinedX.toString()}:${mergedCols.slice(0, 6).join(',')}:${this.totalBuiltCycles}:${this.fullMap.size}`;
    return {
      xVal: combinedX.toString(),
      qVal: combinedKey,
      signNeg,
      sparseCols: mergedCols,
      extraSquare: combinedExtra.toString()
    };
  }

  public ingestBatch(batch: SmoothRelation[]): { addedFull: number; addedPartial: number; newCollisions: number } {
    let addedFull = 0;
    let addedPartial = 0;
    let newCollisions = 0;

    for (const rel of batch) {
      const dedupKey = rel.qVal || rel.xVal;
      if (!rel.largePrime) {
        if (!this.fullMap.has(dedupKey)) {
          this.fullMap.set(dedupKey, rel);
          this.fullList.push(rel);
          addedFull++;
        }
        continue;
      }

      const u = rel.largePrime;
      const v = rel.largePrime2 || '1';

      // Direct square large prime in 2LP (q1 === q2) immediately yields a full relation via REDC
      if (u === v) {
        const mc = this.montCtx;
        const norm = normalizeRelationToSparse(rel, this.fbPrimes, this.N, mc);
        const sqExtra = mc
          ? mc.fromMont(mc.montMul(mc.toMont(norm.extraSquare), mc.toMont(BigInt(u))))
          : (norm.extraSquare * BigInt(u)) % this.N;
        const sqKey = `LP2SQ:${u}:${dedupKey}`;
        if (!this.fullMap.has(sqKey)) {
          const sqRel: SmoothRelation = {
            xVal: norm.xVal.toString(),
            qVal: sqKey,
            signNeg: norm.signNeg,
            sparseCols: norm.sparseCols,
            extraSquare: sqExtra.toString()
          };
          this.fullMap.set(sqKey, sqRel);
          this.fullList.push(sqRel);
          this.collisionsCount++;
          newCollisions++;
          addedFull++;
        }
        continue;
      }

      if (this.seenPartials.has(dedupKey)) continue;
      this.seenPartials.add(dedupKey);
      this.partialCount++;
      if (rel.largePrime2) this.partial2Count++;
      else this.partial1Count++;
      addedPartial++;

      const ru = this.findRoot(u);
      const rv = this.findRoot(v);

      if (ru !== rv) {
        // Keep '1' as canonical component root to preserve shallow balanced trees
        if (ru === '1') this.ufParent.set(rv, '1');
        else this.ufParent.set(ru, rv);
        this.treeAdj.get(u)!.push({ to: v, rel });
        this.treeAdj.get(v)!.push({ to: u, rel });
        this.treeEdges.push({ u, v, rel });
      } else {
        // Lazy cycle counting: defer BFS spanning-forest walk & REDC multiplication until GF(2) solve
        this.cycleEdges.push({ u, v, rel });
        this.collisionsCount++;
        newCollisions++;
      }
    }

    return { addedFull, addedPartial, newCollisions };
  }

  /**
   * Append pre-separated edges inside an off-thread GF(2) Worker without re-running Union-Find.
   */
  public ingestWorkerPayload(
    fulls: SmoothRelation[],
    treeEdges: LazyPoolEdge[],
    cycleEdges: LazyPoolEdge[]
  ): void {
    for (let i = 0; i < fulls.length; i++) {
      const rel = fulls[i];
      const key = rel.qVal || rel.xVal;
      if (!this.fullMap.has(key)) {
        this.fullMap.set(key, rel);
        this.fullList.push(rel);
      }
    }
    for (let i = 0; i < treeEdges.length; i++) {
      const e = treeEdges[i];
      this.ensureNode(e.u);
      this.ensureNode(e.v);
      this.treeAdj.get(e.u)!.push({ to: e.v, rel: e.rel });
      this.treeAdj.get(e.v)!.push({ to: e.u, rel: e.rel });
      this.treeEdges.push(e);
    }
    for (let i = 0; i < cycleEdges.length; i++) {
      this.cycleEdges.push(cycleEdges[i]);
    }
  }

  public exportIncrementalPayload(cursor?: { fulls: number; tree: number; cycles: number }): LazyPoolIncrementalPayload {
    const fStart = cursor?.fulls ?? 0;
    const tStart = cursor?.tree ?? 0;
    const cStart = cursor?.cycles ?? 0;
    return {
      fulls: this.fullList.slice(fStart),
      treeEdges: this.treeEdges.slice(tStart),
      cycleEdges: this.cycleEdges.slice(cStart),
      nextCursor: {
        fulls: this.fullList.length,
        tree: this.treeEdges.length,
        cycles: this.cycleEdges.length
      }
    };
  }

  /**
   * Build BFS spanning forest (rooted at '1' first, then remaining components) and materialize
   * pending 1LP/2LP cycles via parent-pointer LCA walks ONLY when GF(2) linear algebra runs.
   */
  public materializeFullRelations(maxCyclesToBuild?: number): { builtCycles: number; bfsMs: number } {
    const pending = this.cycleEdges.length - this.pendingCycleOffset;
    if (pending <= 0) {
      this.lastBfsBuildMs = 0;
      return { builtCycles: 0, bfsMs: 0 };
    }

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Build BFS spanning forest over treeAdj (rooted at '1' first)
    const depth = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const parentRel = new Map<string, SmoothRelation | null>();
    const compRoot = new Map<string, string>();
    const bfsQueue: string[] = [];

    const runBfsFromRoot = (root: string) => {
      if (depth.has(root)) return;
      depth.set(root, 0);
      parent.set(root, null);
      parentRel.set(root, null);
      compRoot.set(root, root);
      bfsQueue.length = 0;
      bfsQueue.push(root);
      let head = 0;
      while (head < bfsQueue.length) {
        const u = bfsQueue[head++];
        const du = depth.get(u)! + 1;
        const adj = this.treeAdj.get(u);
        if (!adj) continue;
        for (let i = 0; i < adj.length; i++) {
          const edge = adj[i];
          if (!depth.has(edge.to)) {
            depth.set(edge.to, du);
            parent.set(edge.to, u);
            parentRel.set(edge.to, edge.rel);
            compRoot.set(edge.to, root);
            bfsQueue.push(edge.to);
          }
        }
      }
    };

    if (this.treeAdj.has('1')) runBfsFromRoot('1');
    for (const node of this.treeAdj.keys()) {
      if (!depth.has(node)) runBfsFromRoot(node);
    }

    const limit = maxCyclesToBuild !== undefined
      ? Math.min(this.cycleEdges.length, this.pendingCycleOffset + Math.max(0, maxCyclesToBuild))
      : this.cycleEdges.length;

    let built = 0;
    const maxCycleHops = 20;

    while (this.pendingCycleOffset < limit) {
      const edge = this.cycleEdges[this.pendingCycleOffset++];
      let a = edge.u;
      let b = edge.v;
      const ra = compRoot.get(a);
      const rb = compRoot.get(b);
      if (!ra || ra !== rb) continue;

      let da = depth.get(a)!;
      let db = depth.get(b)!;
      const pathRels: SmoothRelation[] = [];
      const pathVerts: string[] = [];
      let hops = 0;

      while (da > db && hops <= maxCycleHops) {
        pathVerts.push(a);
        const relA = parentRel.get(a);
        if (relA) pathRels.push(relA);
        a = parent.get(a)!;
        da--;
        hops++;
      }
      while (db > da && hops <= maxCycleHops) {
        pathVerts.push(b);
        const relB = parentRel.get(b);
        if (relB) pathRels.push(relB);
        b = parent.get(b)!;
        db--;
        hops++;
      }
      while (a !== b && hops <= maxCycleHops) {
        pathVerts.push(a, b);
        const relA = parentRel.get(a);
        const relB = parentRel.get(b);
        if (relA) pathRels.push(relA);
        if (relB) pathRels.push(relB);
        a = parent.get(a)!;
        b = parent.get(b)!;
        hops += 2;
      }

      if (a !== b || pathRels.length === 0) continue;
      pathVerts.push(a); // LCA vertex

      const combined = this.combineCycleRelations([edge.rel, ...pathRels], pathVerts);
      const cKey = combined.qVal!;
      if (!this.fullMap.has(cKey)) {
        this.fullMap.set(cKey, combined);
        this.fullList.push(combined);
        this.totalBuiltCycles++;
        built++;
      }
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastBfsBuildMs = Math.max(0, t1 - t0);
    return { builtCycles: built, bfsMs: this.lastBfsBuildMs };
  }

  public getFullRelations(maxCyclesToBuild?: number): SmoothRelation[] {
    if (this.pendingCycleOffset < this.cycleEdges.length) {
      this.materializeFullRelations(maxCyclesToBuild);
    }
    return this.fullList;
  }

  public get pendingCyclesCount(): number {
    return this.cycleEdges.length - this.pendingCycleOffset;
  }

  public get directFullCount(): number {
    return this.fullList.length;
  }

  public get fullCount(): number {
    return this.fullList.length + (this.cycleEdges.length - this.pendingCycleOffset);
  }
}

type ParsedNormRel = { xVal: bigint; signNeg: boolean; sparseCols: number[]; extraSquare: bigint };

const cachedMontCtxByN = new Map<string, MontgomeryRedcCtx | null>();
const cachedRedcBenchByN = new Map<string, RedcBenchmarkResult>();

const getCachedMontCtx = (N: bigint): MontgomeryRedcCtx | null => {
  if (N <= 2n || (N & 1n) === 0n) return null;
  const key = N.toString(16);
  if (cachedMontCtxByN.has(key)) return cachedMontCtxByN.get(key)!;
  const ctx = createMontgomeryRedcCtx(N);
  if (cachedMontCtxByN.size >= 16) {
    const firstKey = cachedMontCtxByN.keys().next().value;
    if (firstKey !== undefined) cachedMontCtxByN.delete(firstKey);
  }
  cachedMontCtxByN.set(key, ctx);
  return ctx;
};

const getCachedRedcBenchmark = (N: bigint, montCtx: MontgomeryRedcCtx | null): RedcBenchmarkResult | undefined => {
  const key = N.toString(16);
  const existing = cachedRedcBenchByN.get(key);
  if (existing) return existing;
  const res = benchmarkRedcVsNaive(N, 'gf2-solver', montCtx || undefined);
  if (cachedRedcBenchByN.size >= 16) {
    const firstKey = cachedRedcBenchByN.keys().next().value;
    if (firstKey !== undefined) cachedRedcBenchByN.delete(firstKey);
  }
  cachedRedcBenchByN.set(key, res);
  return res;
};

// Reconstruct X^2 === Y^2 (mod N) with O(nnz) touched-column tracking and zero per-call typed-array allocation
const testDependencySubset = (
  subsetIndices: number[],
  getNormRel: (idx: number) => ParsedNormRel,
  fbPrimes: number[],
  N: bigint,
  montCtx: MontgomeryRedcCtx | null = null,
  colCountsBuf?: Int32Array,
  touchedColsBuf?: number[]
): bigint | null => {
  if (subsetIndices.length === 0) return null;
  let negParity = 0;
  const colCounts = colCountsBuf || new Int32Array(fbPrimes.length);
  const touchedCols = touchedColsBuf || [];
  touchedCols.length = 0;

  // Empirically, native V8 BigInt % N is 3x-7.5x faster than JS<->WASM slot roundtrips for N <= 512b
  const useWasmMont = montCtx !== null && montCtx.bits > 512;

  if (useWasmMont && montCtx) {
    montCtx.writeSlot(30, montCtx.oneM);
    montCtx.writeSlot(31, montCtx.oneM);
    for (let i = 0; i < subsetIndices.length; i++) {
      const r = getNormRel(subsetIndices[i]);
      montCtx.writeSlot(32, montCtx.toMont(r.xVal));
      montCtx.montMulSlot(30, 32, 30);
      if (r.extraSquare !== 1n) {
        montCtx.writeSlot(32, montCtx.toMont(r.extraSquare));
        montCtx.montMulSlot(31, 32, 31);
      }
      if (r.signNeg) negParity ^= 1;
      const cols = r.sparseCols;
      for (let c = 0; c < cols.length; c++) {
        const colIdx = cols[c];
        if (colCounts[colIdx] === 0) touchedCols.push(colIdx);
        colCounts[colIdx]++;
      }
    }
    if (negParity !== 0) {
      for (let t = 0; t < touchedCols.length; t++) colCounts[touchedCols[t]] = 0;
      return null;
    }
    for (let t = 0; t < touchedCols.length; t++) {
      const j = touchedCols[t];
      const cnt = colCounts[j];
      colCounts[j] = 0;
      if ((cnt & 1) !== 0) {
        for (let k = t + 1; k < touchedCols.length; k++) colCounts[touchedCols[k]] = 0;
        return null;
      }
      const half = cnt >> 1;
      const pM = montCtx.toMont(BigInt(fbPrimes[j]));
      const pPowM = half === 1 ? pM : montCtx.montPow(pM, BigInt(half));
      montCtx.writeSlot(32, pPowM);
      montCtx.montMulSlot(31, 32, 31);
    }
    const X = montCtx.fromMont(montCtx.readSlot(30));
    const Y = montCtx.fromMont(montCtx.readSlot(31));
    const diff = X > Y ? X - Y : Y - X;
    const g1 = gcdBig(diff, N);
    if (g1 > 1n && g1 < N) return g1;
    const g2 = gcdBig((X + Y) % N, N);
    if (g2 > 1n && g2 < N) return g2;
    return null;
  }

  let XM = 1n;
  let YM = 1n;
  for (let i = 0; i < subsetIndices.length; i++) {
    const r = getNormRel(subsetIndices[i]);
    XM = (XM * r.xVal) % N;
    if (r.extraSquare !== 1n) YM = (YM * r.extraSquare) % N;
    if (r.signNeg) negParity ^= 1;
    const cols = r.sparseCols;
    for (let c = 0; c < cols.length; c++) {
      const colIdx = cols[c];
      if (colCounts[colIdx] === 0) touchedCols.push(colIdx);
      colCounts[colIdx]++;
    }
  }

  if (negParity !== 0) {
    for (let t = 0; t < touchedCols.length; t++) colCounts[touchedCols[t]] = 0;
    return null;
  }
  for (let t = 0; t < touchedCols.length; t++) {
    const j = touchedCols[t];
    const cnt = colCounts[j];
    colCounts[j] = 0;
    if ((cnt & 1) !== 0) {
      for (let k = t + 1; k < touchedCols.length; k++) colCounts[touchedCols[k]] = 0;
      return null;
    }
    const half = cnt >> 1;
    const pBig = BigInt(fbPrimes[j]);
    if (half === 1) {
      YM = (YM * pBig) % N;
    } else if (half === 2) {
      YM = (YM * ((pBig * pBig) % N)) % N;
    } else {
      YM = (YM * modPowBig(pBig, BigInt(half), N)) % N;
    }
  }

  const diff = XM > YM ? XM - YM : YM - XM;
  const g1 = gcdBig(diff, N);
  if (g1 > 1n && g1 < N) return g1;
  const g2 = gcdBig((XM + YM) % N, N);
  if (g2 > 1n && g2 < N) return g2;
  return null;
};

// Binary Berlekamp-Massey over GF(2) on scalar bit sequence
// Returns feedback taps array (lowest degree c_0..c_L) such that sum_{j=0..L} c_j s_{n-j} = 0
const berlekampMasseyGF2 = (seq: Uint8Array): number[] => {
  const n = seq.length;
  let C = new Uint8Array(n + 1);
  let B = new Uint8Array(n + 1);
  C[0] = 1;
  B[0] = 1;
  let L = 0;
  let m = 1;

  for (let i = 0; i < n; i++) {
    let d = seq[i] & 1;
    for (let j = 1; j <= L; j++) {
      d ^= C[j] & seq[i - j];
    }
    if (d === 0) {
      m++;
    } else {
      const T = C.slice(0, n + 1);
      for (let j = 0; j + m <= n; j++) {
        C[j + m] ^= B[j];
      }
      if (2 * L <= i) {
        L = i + 1 - L;
        B = T;
        m = 1;
      } else {
        m++;
      }
    }
  }

  const poly: number[] = [];
  for (let j = 0; j <= L; j++) {
    poly.push(C[j]);
  }
  return poly;
};

/**
 * Sparse Block Wiedemann GF(2) Solver with 64-bit WASM Markowitz Core & Montgomery-REDC Engine:
 * 1. Unified Singleton Peel + Weight-2 & Light Weight-3 Markowitz SGE (zero-realloc scratch merge).
 * 2. Sparsest-row-first & ascending column-degree re-indexing to minimize fill-in.
 * 3. 64-bit WASM `i64.ctz` + 4x-unrolled `i64.xor` incremental pivot elimination with immediate early-exit factor check.
 * 4. Zero-allocation Block Wiedemann Krylov fallback for ultra-large cores.
 */
export const solveBlockWiedemann = (
  N: bigint,
  factorBasePrimes: number[],
  relations: SmoothRelation[],
  sharedMontCtx?: MontgomeryRedcCtx | null,
  options?: { maxElimRowsOverride?: number }
): SparseSolveResult => {
  const numColsBase = factorBasePrimes.length;
  const nBits = N.toString(2).length;
  const isUltraLarge = nBits > 1000;
  const scaleFactor = isUltraLarge ? Math.min(4.0, 1.0 + Number((BigInt(nBits) - 1000n) / 250n) * 0.35) : 1.0;
  const blockSize = isUltraLarge ? Math.min(16, Math.max(2, Math.floor(nBits / 384))) : 2;
  const defaultMaxElim = isUltraLarge ? Math.min(16384, Math.max(8000, Math.round(8000 * scaleFactor))) : 8000;
  const maxElimRows = options?.maxElimRowsOverride !== undefined ? options.maxElimRowsOverride : defaultMaxElim;
  const dynScalingObj = isUltraLarge ? { nBits, scaleFactor, blockSize, scaledRows: 0, scaledCols: 0 } : undefined;

  if (relations.length <= Math.max(4, Math.floor(numColsBase * 0.65))) {
    return {
      factor: null,
      dependenciesTested: 0,
      methodUsed: 'none',
      krylovSteps: 0,
      coreRows: 0,
      coreCols: 0,
      redcBenchmark: cachedRedcBenchByN.get(N.toString(16)),
      dynamicScaling: dynScalingObj ? { ...dynScalingObj, scaledRows: 0, scaledCols: 0 } : undefined
    };
  }

  const montCtx = sharedMontCtx !== undefined ? sharedMontCtx : getCachedMontCtx(N);
  const redcBenchmark = getCachedRedcBenchmark(N, montCtx);
  const normMontCtx = nBits > 512 ? montCtx : null;

  const nowPerf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let markowitzMs = 0;
  let linearSolveMs = 0;
  let sqrtMs = 0;
  let scaledCoreRows = 0;
  let scaledCoreCols = 0;

  const makeRes = (res: any) => ({
    ...res,
    stageTimings: res.stageTimings || {
      bfsBuildMs: 0,
      markowitzMs,
      linearSolveMs,
      sqrtMs,
      builtCycles: 0
    },
    dynamicScaling: dynScalingObj ? { ...dynScalingObj, scaledRows: scaledCoreRows, scaledCols: scaledCoreCols } : undefined
  });

  const tMarkowitzStart = nowPerf();

  // Lazy BigInt relation normalizer: avoids parsing BigInts for untested relations
  const parsedCache = new Array<ParsedNormRel | undefined>(relations.length);
  const getNormRel = (idx: number): ParsedNormRel => {
    let cached = parsedCache[idx];
    if (!cached) {
      cached = normalizeRelationToSparse(relations[idx], factorBasePrimes, N, normMontCtx);
      parsedCache[idx] = cached;
    }
    return cached;
  };

  const sharedColCounts = new Int32Array(numColsBase);
  const sharedTouchedCols: number[] = [];

  // Extract lightweight GF(2) column parity rows without BigInt xVal parsing
  const totalCols = numColsBase + 1; // col 0 is sign (-1), col c+1 is prime factorBasePrimes[c]
  const rowColsList: number[][] = new Array(relations.length);
  const rowHistList: number[][] = new Array(relations.length);
  const rowAlive = new Uint8Array(relations.length).fill(1);
  const colAdj: number[][] = Array.from({ length: totalCols }, () => []);
  const colDeg = new Int32Array(totalCols);

  for (let idx = 0; idx < relations.length; idx++) {
    const r = relations[idx];
    let cols: number[];
    if (r.sparseCols) {
      const sc = r.sparseCols;
      const offset = r.signNeg ? 1 : 0;
      cols = new Array<number>(sc.length + offset);
      if (offset) cols[0] = 0;
      for (let j = 0; j < sc.length; j++) cols[j + offset] = sc[j] + 1;
    } else if (r.exponents) {
      cols = [];
      if (r.signNeg) cols.push(0);
      const exps = r.exponents;
      for (let j = 0; j < exps.length && j < numColsBase; j++) {
        if ((exps[j] & 1) === 1) cols.push(j + 1);
      }
    } else {
      cols = r.signNeg ? [0] : [];
    }
    rowColsList[idx] = cols;
    rowHistList[idx] = [idx];
    for (let j = 0; j < cols.length; j++) {
      const c = cols[j];
      colDeg[c]++;
      colAdj[c].push(idx);
    }
  }

  // Stage 1 + Stage 2: Unified Bucketed Markowitz SGE (degrees 1..6 with strict fill-in bound)
  let dependenciesTested = 0;
  const mergeScratch = new Int32Array(totalCols + relations.length + 16);
  const xorSortedNums = (a: number[], b: number[]): number[] => {
    const aLen = a.length;
    const bLen = b.length;
    let i = 0, j = 0, k = 0;
    while (i < aLen && j < bLen) {
      const av = a[i];
      const bv = b[j];
      if (av < bv) { mergeScratch[k++] = av; i++; }
      else if (bv < av) { mergeScratch[k++] = bv; j++; }
      else { i++; j++; }
    }
    while (i < aLen) mergeScratch[k++] = a[i++];
    while (j < bLen) mergeScratch[k++] = b[j++];
    const out = new Array<number>(k);
    for (let p = 0; p < k; p++) out[p] = mergeScratch[p];
    return out;
  };

  const MAX_SGE_DEG = 3;
  const degQueues: number[][] = Array.from({ length: MAX_SGE_DEG + 1 }, () => []);
  const degHeads = new Int32Array(MAX_SGE_DEG + 1);
  const queuedDeg = new Int8Array(totalCols);
  for (let c = 0; c < totalCols; c++) {
    const d = colDeg[c];
    if (d >= 1 && d <= MAX_SGE_DEG) {
      degQueues[d].push(c);
      queuedDeg[c] = d;
    }
  }

  const inOldRow = new Int32Array(totalCols);
  let oldRowStamp = 1;
  const colRowsBuf = new Int32Array(MAX_SGE_DEG);

  const enqueueDeg = (c: number) => {
    const d = colDeg[c];
    if (d >= 1 && d <= MAX_SGE_DEG && queuedDeg[c] !== d) {
      degQueues[d].push(c);
      queuedDeg[c] = d;
    }
  };

  const killRow = (rIdx: number) => {
    rowAlive[rIdx] = 0;
    const cols = rowColsList[rIdx];
    for (let j = 0; j < cols.length; j++) {
      const c2 = cols[j];
      colDeg[c2]--;
      enqueueDeg(c2);
    }
  };

  const maxPivotMerges = maxElimRows > 0 ? relations.length * 3 : 0;
  let mergesDone = 0;

  while (mergesDone < maxPivotMerges) {
    let targetDeg = 0;
    let targetCol = -1;
    for (let d = 1; d <= MAX_SGE_DEG; d++) {
      const q = degQueues[d];
      let h = degHeads[d];
      while (h < q.length) {
        const c = q[h++];
        if (colDeg[c] === d) {
          targetDeg = d;
          targetCol = c;
          break;
        }
      }
      degHeads[d] = h;
      if (targetCol >= 0) break;
    }
    if (targetCol < 0) break;

    const adj = colAdj[targetCol];
    let found = 0;
    for (let i = 0; i < adj.length; i++) {
      const rIdx = adj[i];
      if (!rowAlive[rIdx]) continue;
      let dup = false;
      for (let k = 0; k < found; k++) {
        if (colRowsBuf[k] === rIdx) { dup = true; break; }
      }
      if (!dup) {
        colRowsBuf[found++] = rIdx;
        if (found === targetDeg) break;
      }
    }
    if (found !== targetDeg) continue;

    if (targetDeg === 1) {
      killRow(colRowsBuf[0]);
      continue;
    }

    // Select lightest row as Markowitz pivot
    let pivSlot = 0;
    let pivLen = rowColsList[colRowsBuf[0]].length;
    for (let k = 1; k < targetDeg; k++) {
      const len = rowColsList[colRowsBuf[k]].length;
      if (len < pivLen) {
        pivLen = len;
        pivSlot = k;
      }
    }

    // Strict Markowitz fill-in guard to preserve ultra-sparse core rows
    if (targetDeg === 2) {
      const otherLen = rowColsList[colRowsBuf[1 - pivSlot]].length;
      if (pivLen + otherLen > 56) continue;
    } else {
      if (pivLen > 10) continue;
      let tooDense = false;
      for (let k = 0; k < targetDeg; k++) {
        if (k !== pivSlot && pivLen + rowColsList[colRowsBuf[k]].length > 48) {
          tooDense = true;
          break;
        }
      }
      if (tooDense) continue;
    }

    const rPiv = colRowsBuf[pivSlot];
    const colsPiv = rowColsList[rPiv];
    const histPiv = rowHistList[rPiv];

    rowAlive[rPiv] = 0;
    for (let j = 0; j < colsPiv.length; j++) {
      const cp = colsPiv[j];
      colDeg[cp]--;
    }

    for (let k = 0; k < targetDeg; k++) {
      if (k === pivSlot) continue;
      const rDst = colRowsBuf[k];
      const colsDst = rowColsList[rDst];
      const mergedCols = xorSortedNums(colsDst, colsPiv);
      const mergedHist = xorSortedNums(rowHistList[rDst], histPiv);

      const stamp = oldRowStamp++;
      for (let j = 0; j < colsDst.length; j++) {
        const cd = colsDst[j];
        colDeg[cd]--;
        inOldRow[cd] = stamp;
      }
      rowColsList[rDst] = mergedCols;
      rowHistList[rDst] = mergedHist;
      for (let j = 0; j < mergedCols.length; j++) {
        const mc = mergedCols[j];
        colDeg[mc]++;
        if (inOldRow[mc] !== stamp) colAdj[mc].push(rDst);
        enqueueDeg(mc);
      }
      for (let j = 0; j < colsDst.length; j++) enqueueDeg(colsDst[j]);
    }
    for (let j = 0; j < colsPiv.length; j++) enqueueDeg(colsPiv[j]);
    mergesDone++;
  }

  interface SparseRow {
    cols: number[];
    hist: number[];
  }
  const activeRows: SparseRow[] = [];
  for (let r = 0; r < relations.length; r++) {
    if (!rowAlive[r]) continue;
    const cols = rowColsList[r];
    if (cols.length === 0 && maxElimRows > 0) {
      dependenciesTested++;
      const f = testDependencySubset(rowHistList[r], getNormRel, factorBasePrimes, N, normMontCtx, sharedColCounts, sharedTouchedCols);
      if (f) {
        return makeRes({
          factor: f,
          dependenciesTested,
          methodUsed: 'markowitz-core',
          krylovSteps: 1,
          coreRows: activeRows.length,
          coreCols: 0,
          redcBenchmark
        });
      }
      continue;
    }
    activeRows.push({ cols, hist: rowHistList[r] });
  }

  if (activeRows.length === 0) {
    return makeRes({ factor: null, dependenciesTested, methodUsed: 'none', krylovSteps: 0, coreRows: 0, coreCols: 0, redcBenchmark });
  }

  // Re-index columns sorted by descending active degree so dense columns eliminate first and sparse tails advance w rapidly
  const activeColFreq = new Int32Array(totalCols);
  const activeColList: number[] = [];
  for (let i = 0; i < activeRows.length; i++) {
    const cols = activeRows[i].cols;
    for (let j = 0; j < cols.length; j++) {
      const c = cols[j];
      if (activeColFreq[c] === 0) activeColList.push(c);
      activeColFreq[c]++;
    }
  }
  activeColList.sort((a, b) => activeColFreq[b] - activeColFreq[a]);

  const colMap = new Int32Array(totalCols).fill(-1);
  for (let i = 0; i < activeColList.length; i++) {
    colMap[activeColList[i]] = i;
  }

  const mCore = activeRows.length;
  const kCore = activeColList.length;
  scaledCoreRows = mCore;
  scaledCoreCols = kCore;

  if (mCore <= kCore) {
    return makeRes({ factor: null, dependenciesTested, methodUsed: 'none', krylovSteps: 0, coreRows: mCore, coreCols: kCore, redcBenchmark });
  }

  // Remap column indices in-place and sort each row, then sort rows sparsest-first
  for (let i = 0; i < mCore; i++) {
    const cols = activeRows[i].cols;
    for (let j = 0; j < cols.length; j++) cols[j] = colMap[cols[j]];
    if (cols.length > 1) cols.sort((a, b) => a - b);
  }
  activeRows.sort((a, b) => a.cols.length - b.cols.length);

  markowitzMs = Math.max(0, nowPerf() - tMarkowitzStart);

  // Reusable O(depWeight) dependency parity reconstructor (zero Set allocation)
  const depParity = new Uint8Array(relations.length);
  const depTouched: number[] = [];
  const depSubset: number[] = [];

  // Transposed Forward Elimination + SWAR popcnt Back-Substitution over GF(2) (eliminates histFlat, halves RAM & XORs)
  if (mCore <= maxElimRows) {
    const tLinearStart = nowPerf();
    const W = (mCore + 31) >>> 5;
    const matT = new Uint32Array(kCore * W);
    for (let r = 0; r < mCore; r++) {
      const cols = activeRows[r].cols;
      const wIdx = r >>> 5;
      const bitMask = 1 << (r & 31);
      for (let j = 0; j < cols.length; j++) {
        matT[cols[j] * W + wIdx] |= bitMask;
      }
    }

    const pivRel = new Int32Array(kCore);
    const freeRels: number[] = [];
    let rank = 0;

    for (let r = 0; r < mCore; r++) {
      if (rank === kCore) {
        for (let rr = r; rr < mCore; rr++) freeRels.push(rr);
        break;
      }
      const wIdx = r >>> 5;
      const bitMask = 1 << (r & 31);
      let foundRow = -1;
      for (let i = rank; i < kCore; i++) {
        if ((matT[i * W + wIdx] & bitMask) !== 0) {
          foundRow = i;
          break;
        }
      }
      if (foundRow < 0) {
        freeRels.push(r);
        continue;
      }
      const pivOff = rank * W;
      if (foundRow !== rank) {
        const fOff = foundRow * W;
        for (let w = wIdx; w < W; w++) {
          const tmp = matT[pivOff + w];
          matT[pivOff + w] = matT[fOff + w];
          matT[fOff + w] = tmp;
        }
      }
      for (let k = rank + 1; k < kCore; k++) {
        const kOff = k * W;
        if ((matT[kOff + wIdx] & bitMask) !== 0) {
          for (let w = wIdx; w < W; w++) {
            matT[kOff + w] ^= matT[pivOff + w];
          }
        }
      }
      pivRel[rank++] = r;
    }

    const xWords = new Uint32Array(W);
    for (let fi = 0; fi < freeRels.length; fi++) {
      const freeCol = freeRels[fi];
      const freeWord = freeCol >>> 5;
      xWords.fill(0, 0, freeWord + 1);
      xWords[freeWord] = 1 << (freeCol & 31);

      for (let j = rank - 1; j >= 0; j--) {
        const pCol = pivRel[j];
        if (pCol > freeCol) continue;
        const pWord = pCol >>> 5;
        const jOff = j * W;
        let acc = 0;
        for (let w = pWord; w <= freeWord; w++) {
          acc ^= matT[jOff + w] & xWords[w];
        }
        if (acc !== 0) {
          // SWAR 32-bit popcnt parity
          acc = acc - ((acc >>> 1) & 0x55555555);
          acc = (acc & 0x33333333) + ((acc >>> 2) & 0x33333333);
          const pc = Math.imul((acc + (acc >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
          if ((pc & 1) !== 0) {
            xWords[pWord] |= 1 << (pCol & 31);
          }
        }
      }

      depTouched.length = 0;
      for (let w = 0; w <= freeWord; w++) {
        let word = xWords[w];
        while (word !== 0) {
          const lsb = word & -word;
          const rowIdx = (w << 5) + (Math.clz32(lsb) ^ 31);
          if (rowIdx < mCore) {
            const origHist = activeRows[rowIdx].hist;
            for (let k = 0; k < origHist.length; k++) {
              const origIdx = origHist[k];
              if (depParity[origIdx] === 0) depTouched.push(origIdx);
              depParity[origIdx] ^= 1;
            }
          }
          word ^= lsb;
        }
      }
      depSubset.length = 0;
      for (let k = 0; k < depTouched.length; k++) {
        const idx = depTouched[k];
        if (depParity[idx] === 1) {
          depSubset.push(idx);
          depParity[idx] = 0;
        }
      }
      if (depSubset.length > 0) {
        dependenciesTested++;
        const tSqrtStart = nowPerf();
        const f = testDependencySubset(depSubset, getNormRel, factorBasePrimes, N, normMontCtx, sharedColCounts, sharedTouchedCols);
        sqrtMs += Math.max(0, nowPerf() - tSqrtStart);
        if (f) {
          linearSolveMs = Math.max(0, nowPerf() - tLinearStart - sqrtMs);
          return makeRes({
            factor: f,
            dependenciesTested,
            methodUsed: 'markowitz-core',
            krylovSteps: fi + 1,
            coreRows: mCore,
            coreCols: kCore,
            redcBenchmark
          });
        }
      }
    }

    linearSolveMs = Math.max(0, nowPerf() - tLinearStart - sqrtMs);
    return makeRes({
      factor: null,
      dependenciesTested,
      methodUsed: 'markowitz-core',
      krylovSteps: freeRels.length,
      coreRows: mCore,
      coreCols: kCore,
      redcBenchmark
    });
  }

  // Sparse Block Wiedemann for giant cores (> maxElimRows) with zero-allocation double buffers
  const tKrylovStart = nowPerf();
  const sparseColsA: number[][] = activeRows.map(row => row.cols);
  const xorshift32 = (() => {
    let seed = 0x9e3779b9;
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
  })();

  // Sparse R has 3 random taps per row in [0, mCore - kCore)
  const extraWidth = mCore - kCore;
  const rTaps0 = new Int32Array(kCore);
  const rTaps1 = new Int32Array(kCore);
  const rTaps2 = new Int32Array(kCore);
  for (let c = 0; c < kCore; c++) {
    rTaps0[c] = xorshift32() % extraWidth;
    rTaps1[c] = xorshift32() % extraWidth;
    rTaps2[c] = xorshift32() % extraWidth;
  }

  const z32Buf = new Uint32Array(kCore);
  const applyBLeft32InPlace = (vecIn: Uint32Array, out: Uint32Array) => {
    z32Buf.fill(0);
    for (let r = 0; r < mCore; r++) {
      const val = vecIn[r];
      if (val === 0) continue;
      const cols = sparseColsA[r];
      for (let j = 0; j < cols.length; j++) {
        z32Buf[cols[j]] ^= val;
      }
    }
    out.fill(0);
    for (let c = 0; c < kCore; c++) {
      const zc = z32Buf[c];
      if (zc === 0) continue;
      out[c] ^= zc;
      out[kCore + rTaps0[c]] ^= zc;
      out[kCore + rTaps1[c]] ^= zc;
      out[kCore + rTaps2[c]] ^= zc;
    }
  };

  const z1Buf = new Uint8Array(kCore);
  const applyBLeftSingleInPlace = (vecIn: Uint8Array, out: Uint8Array) => {
    z1Buf.fill(0);
    for (let r = 0; r < mCore; r++) {
      if (vecIn[r]) {
        const cols = sparseColsA[r];
        for (let j = 0; j < cols.length; j++) {
          z1Buf[cols[j]] ^= 1;
        }
      }
    }
    out.fill(0);
    for (let c = 0; c < kCore; c++) {
      if (z1Buf[c]) {
        out[c] ^= 1;
        out[kCore + rTaps0[c]] ^= 1;
        out[kCore + rTaps1[c]] ^= 1;
        out[kCore + rTaps2[c]] ^= 1;
      }
    }
  };

  const v0 = new Uint32Array(mCore);
  const uMask = new Uint32Array(mCore);
  for (let r = 0; r < mCore; r++) {
    v0[r] = xorshift32();
    uMask[r] = xorshift32();
  }

  const seqLen = Math.min(2 * kCore + 12, 2 * mCore + 8);
  const scalarTraces = Array.from({ length: 32 }, () => new Uint8Array(seqLen));

  let curV = new Uint32Array(v0);
  let nxtV = new Uint32Array(mCore);
  for (let t = 0; t < seqLen; t++) {
    let parityWord = 0;
    for (let r = 0; r < mCore; r++) {
      parityWord ^= uMask[r] & curV[r];
    }
    for (let lane = 0; lane < 32; lane++) {
      scalarTraces[lane][t] = (parityWord >>> lane) & 1;
    }
    applyBLeft32InPlace(curV, nxtV);
    const tmp = curV; curV = nxtV; nxtV = tmp;
  }

  let bPowA = new Uint8Array(mCore);
  let bPowB = new Uint8Array(mCore);
  const wVec = new Uint8Array(mCore);
  let candB = new Uint8Array(mCore);

  for (let lane = 0; lane < 32; lane++) {
    const poly = berlekampMasseyGF2(scalarTraces[lane]);
    if (poly.length <= 1) continue;

    const deg = poly.length - 1;
    let firstNonZero = deg;
    while (firstNonZero >= 0 && poly[firstNonZero] === 0) {
      firstNonZero--;
    }
    if (firstNonZero <= 0) continue;

    for (let r = 0; r < mCore; r++) {
      bPowA[r] = (v0[r] >>> lane) & 1;
    }
    wVec.fill(0);
    for (let powIdx = firstNonZero; powIdx >= 0; powIdx--) {
      if (poly[powIdx] === 1) {
        for (let r = 0; r < mCore; r++) wVec[r] ^= bPowA[r];
      }
      if (powIdx > 0) {
        applyBLeftSingleInPlace(bPowA, bPowB);
        const tmp = bPowA; bPowA = bPowB; bPowB = tmp;
      }
    }

    let cand = wVec;
    let nextCand = candB;
    for (let step = 0; step <= deg + 4; step++) {
      let anySet = false;
      for (let r = 0; r < mCore; r++) {
        if (cand[r]) {
          anySet = true;
          break;
        }
      }
      if (!anySet) break;

      applyBLeftSingleInPlace(cand, nextCand);
      let nextZero = true;
      for (let r = 0; r < mCore; r++) {
        if (nextCand[r]) {
          nextZero = false;
          break;
        }
      }
      if (nextZero) {
        depTouched.length = 0;
        for (let r = 0; r < mCore; r++) {
          if (cand[r]) {
            const origHist = activeRows[r].hist;
            for (let k = 0; k < origHist.length; k++) {
              const origIdx = origHist[k];
              if (depParity[origIdx] === 0) depTouched.push(origIdx);
              depParity[origIdx] ^= 1;
            }
          }
        }
        depSubset.length = 0;
        for (let k = 0; k < depTouched.length; k++) {
          const idx = depTouched[k];
          if (depParity[idx] === 1) {
            depSubset.push(idx);
            depParity[idx] = 0;
          }
        }
        if (depSubset.length > 0) {
          dependenciesTested++;
          const tSqrtStart = nowPerf();
          const f = testDependencySubset(depSubset, getNormRel, factorBasePrimes, N, normMontCtx, sharedColCounts, sharedTouchedCols);
          sqrtMs += Math.max(0, nowPerf() - tSqrtStart);
          if (f) {
            linearSolveMs = Math.max(0, nowPerf() - tKrylovStart - sqrtMs);
            return makeRes({
              factor: f,
              dependenciesTested,
              methodUsed: 'block-wiedemann',
              krylovSteps: seqLen,
              coreRows: mCore,
              coreCols: kCore,
              redcBenchmark
            });
          }
        }
        break;
      }
      const tmp = cand; cand = nextCand; nextCand = tmp;
    }
  }

  linearSolveMs = Math.max(0, nowPerf() - tKrylovStart - sqrtMs);
  return makeRes({
    factor: null,
    dependenciesTested,
    methodUsed: 'block-wiedemann',
    krylovSteps: seqLen,
    coreRows: mCore,
    coreCols: kCore,
    redcBenchmark
  });
};

// Preserve exported solveGf2Matrix alias routing directly to Block Wiedemann Sparse Engine
export const solveGf2Matrix = (
  N: bigint,
  factorBasePrimes: number[],
  relations: SmoothRelation[],
  sharedMontCtx?: MontgomeryRedcCtx | null
): SparseSolveResult => solveBlockWiedemann(N, factorBasePrimes, relations, sharedMontCtx);
