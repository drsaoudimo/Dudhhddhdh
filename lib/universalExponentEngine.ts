import { gcd, modPow, isProbablePrime, bigIntSqrt } from '../mathUtils';
import { analyzeSnfsAndCadoParams } from '../snfsDetector';

export interface PrimeFactorPower {
  prime: string;
  power: number;
}

export interface UniversalExponentReport {
  n: string;
  nBits: number;
  status:
    | 'prime'
    | 'prime-power'
    | 'even-split'
    | 'exact-factored'
    | 'cached-factors'
    | 'order-stage1'
    | 'standard-guaranteed';
  lambdaN: string; // الأس العام (دالة كارمايكل λ(N))
  lambdaBits: number;
  phiN: string; // مؤشر أويلر φ(N)
  publicExponentE: string | null; // الأس العام القياسي للتشفير e (null قبل حسم λ(N))
  privateExponentD: string | null; // الأس الخاص d = e⁻¹ mod λ(N)
  minimalPublicExponentE?: string | null; // أصغر أس عام أولي نسبي مكتشف ديناميكياً من λ(N)
  minimalPrivateExponentD?: string | null; // الأس الخاص المقابل لأصغر أس مكتشف
  eMode: 'standard' | 'wiener' | 'boneh-durfee';
  dBits: number | null;
  gcdEWithLambda: string;
  gcdEWithPhi: string;
  isCoprimeWithLambda: boolean;
  isCoprimeWithPhi: boolean;
  lambdaVerified: boolean;
  verifiedBasesCount: number;
  stage1StoppedBeforeFactors: boolean;
  needsAsyncWorker: boolean;
  computationPath:
    | 'order-finding-stage1'
    | 'prime-direct'
    | 'power-of-two'
    | 'prime-power'
    | 'cache'
    | 'recursive-factor-engine'
    | 'worker-pending';
  reductionRatio: string; // φ(N) / λ(N)
  factors: PrimeFactorPower[];
  isComplete: boolean;
  provenance:
    | 'cache-seeded'
    | 'external-hint'
    | 'independent-from-N'
    | 'direct-primality'
    | 'direct-order'
    | 'worker-pending';
  cacheSource?: string;
  cacheBypassed: boolean;
  crt?: {
    dp: string;
    dq: string;
    qInv: string;
  };
  explanationAr: string;
  explanationEn: string;
}

export interface UniversalExponentOptions {
  stopStage1BeforeFactors?: boolean;
  ignoreCache?: boolean;
}

// Global persistent factor cache to retain known factors across the entire application lifecycle
export const GLOBAL_FACTOR_CACHE = new Map<
  string,
  { p: bigint; q: bigint; allFactors?: bigint[]; source: string }
>();

// Pre-seed known constants from benchmarks and presets
export const seedGlobalFactorCache = () => {
  // Default 196-bit benchmark
  const defN = '25345924542096859410889582407385856782286168978105125446929';
  const defP = '159278732114318224236124748923';
  const defQ = '159129371546638582179743517923';
  GLOBAL_FACTOR_CACHE.set(defN, {
    p: BigInt(defP),
    q: BigInt(defQ),
    allFactors: [BigInt(defP), BigInt(defQ)],
    source: '196-bit Balanced Standard'
  });

  // Paper samples
  GLOBAL_FACTOR_CACHE.set('371', { p: 7n, q: 53n, allFactors: [7n, 53n], source: 'Paper Sample 371' });
  GLOBAL_FACTOR_CACHE.set('21919', { p: 23n, q: 953n, allFactors: [23n, 953n], source: 'Paper Sample 21919' });
  GLOBAL_FACTOR_CACHE.set('6236', { p: 2n, q: 3118n, allFactors: [2n, 2n, 1559n], source: 'Paper Sample 6236' });
  GLOBAL_FACTOR_CACHE.set('11449', { p: 107n, q: 107n, allFactors: [107n, 107n], source: 'Prime Square 107²' });
  GLOBAL_FACTOR_CACHE.set('90601', { p: 7n, q: 12943n, allFactors: [7n, 7n, 43n, 43n], source: 'Square 301²' });
};

seedGlobalFactorCache();

export const cacheFactorization = (
  n: bigint | string,
  p: bigint | string,
  q: bigint | string,
  allFactors?: Array<bigint | string>,
  source = 'Auto-detected / Solved'
) => {
  try {
    const nStr = typeof n === 'string' ? n.trim() : n.toString();
    const nBig = BigInt(nStr);
    const pBig = typeof p === 'string' ? BigInt(p.trim()) : p;
    const qBig = typeof q === 'string' ? BigInt(q.trim()) : q;

    const normalizedAll = allFactors
      ? allFactors.map(f => (typeof f === 'string' ? BigInt(f.trim()) : f)).filter(f => f > 1n)
      : [pBig, qBig].filter(f => f > 1n);

    const prodAll = normalizedAll.reduce((acc, v) => acc * v, 1n);
    if (prodAll === nBig && normalizedAll.length >= 1) {
      GLOBAL_FACTOR_CACHE.set(nStr, {
        p: pBig > 1n ? (pBig < qBig ? pBig : qBig) : normalizedAll[0],
        q: qBig > 1n ? (pBig < qBig ? qBig : pBig) : normalizedAll[normalizedAll.length - 1],
        allFactors: normalizedAll,
        source
      });
    } else if (pBig > 1n && qBig > 1n && pBig * qBig === nBig) {
      GLOBAL_FACTOR_CACHE.set(nStr, {
        p: pBig < qBig ? pBig : qBig,
        q: pBig < qBig ? qBig : pBig,
        allFactors: [pBig, qBig],
        source
      });
    }
  } catch {
    // Ignore invalid inputs
  }
};

export const getCachedFactorization = (n: bigint | string) => {
  const nStr = typeof n === 'string' ? n.trim() : n.toString();
  return GLOBAL_FACTOR_CACHE.get(nStr);
};

// Safe modular inverse avoiding divide-by-zero and handling m === 1n cleanly
export const safeModInverse = (a: bigint, m: bigint): bigint => {
  if (m <= 1n) return 1n;
  let a0 = ((a % m) + m) % m;
  if (a0 === 0n) return 0n;
  let m0 = m;
  let x0 = 0n;
  let x1 = 1n;
  let b = m;

  while (a0 > 1n) {
    if (b === 0n) return 0n;
    const q = a0 / b;
    const t = b;
    b = a0 % b;
    a0 = t;
    const tmp = x0;
    x0 = x1 - q * x0;
    x1 = tmp;
  }

  if (a0 !== 1n) return 0n;
  return ((x1 % m0) + m0) % m0;
};

// Mathematical LCM using BigInt
export const lcmBig = (a: bigint, b: bigint): bigint => {
  if (a === 0n || b === 0n) return 0n;
  const aa = a < 0n ? -a : a;
  const bb = b < 0n ? -b : b;
  return (aa / gcd(aa, bb)) * bb;
};

// Scaled BigInt ratio φ(N) / λ(N) without Number precision overflow for >1024-bit moduli
export const computeReductionRatio = (phi: bigint, lambda: bigint): string => {
  if (phi <= 0n || lambda <= 0n) return '1.000';
  const scaled = (phi * 1000n) / lambda;
  const whole = scaled / 1000n;
  const frac = (scaled % 1000n).toString().padStart(3, '0');
  return `${whole.toString()}.${frac}`;
};

// Verify a^λ(N) ≡ 1 (mod N) across multiple coprime bases
export const verifyCarmichaelLambda = (
  N: bigint,
  lambda: bigint
): { verified: boolean; checkedBases: number } => {
  if (N <= 1n || lambda < 1n) return { verified: false, checkedBases: 0 };
  if (N === 2n) return { verified: lambda >= 1n, checkedBases: 1 };
  const candidateBases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  let checked = 0;
  for (const a of candidateBases) {
    if (a >= N) continue;
    if (gcd(a, N) !== 1n) continue;
    checked++;
    if (modPow(a, lambda, N) !== 1n) {
      return { verified: false, checkedBases: checked };
    }
    if (checked >= 8) break;
  }
  if (checked === 0) {
    // Every small candidate shared a factor with N (e.g. N = 2*3*5*7...); check 1n
    return { verified: modPow(1n, lambda, N) === 1n, checkedBases: 1 };
  }
  return { verified: true, checkedBases: checked };
};

// Stage 1 Order-Finding via Baby-Step Giant-Step (strictly modular arithmetic, NO factorization)
export const computeOrderModN = (
  a: bigint,
  N: bigint,
  maxBabySteps = 32768
): bigint | null => {
  if (N <= 1n) return 1n;
  const base = ((a % N) + N) % N;
  if (base === 0n) return null;
  if (base === 1n) return 1n;
  if (gcd(base, N) !== 1n) return null;

  const sqrtN = bigIntSqrt(N) + 1n;
  const m = sqrtN < BigInt(maxBabySteps) ? Number(sqrtN) : maxBabySteps;
  const maxGiants = m + 2;

  const babyTable = new Map<bigint, number>();
  let cur = 1n;
  for (let j = 0; j < m; j++) {
    if (j > 0 && cur === 1n) {
      return BigInt(j);
    }
    if (!babyTable.has(cur)) {
      babyTable.set(cur, j);
    }
    cur = (cur * base) % N;
  }
  if (cur === 1n) return BigInt(m);

  // cur = base^m mod N -> invM = base^(-m) mod N
  const invM = safeModInverse(cur, N);
  if (invM === 0n) return null;

  let gamma = 1n;
  for (let i = 1; i <= maxGiants; i++) {
    gamma = (gamma * invM) % N;
    const hit = babyTable.get(gamma);
    if (hit !== undefined) {
      return BigInt(i) * BigInt(m) + BigInt(hit);
    }
  }

  return null;
};

// Attempt pure Stage 1 order-finding lcm(ord_N(a)) for small/medium N without splitting N into factors
export const findCarmichaelLambdaStage1OrderOnly = (
  N: bigint
): { lambda: bigint; verified: boolean; checkedBases: number } | null => {
  if (N <= 1n) return { lambda: 1n, verified: true, checkedBases: 1 };
  if (N === 2n) return { lambda: 1n, verified: true, checkedBases: 1 };

  // Guaranteed full coverage when N <= 2^30 (m <= 32768 covers every possible group order < N)
  if (N.toString(2).length > 30) return null;

  const probeBases = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n
  ];
  let lambdaAcc = 1n;
  let coprimeTested = 0;

  for (const a of probeBases) {
    const aMod = a % N;
    if (aMod <= 1n) continue;
    if (gcd(aMod, N) !== 1n) continue;
    const ord = computeOrderModN(aMod, N, 32768);
    if (ord === null) return null;
    lambdaAcc = lcmBig(lambdaAcc, ord);
    coprimeTested++;
  }

  // If N is very small or only shared factors with small primes, probe a few higher coprime bases
  if (coprimeTested < 6) {
    for (let x = 73n; x < N && coprimeTested < 10; x += 2n) {
      if (gcd(x, N) !== 1n) continue;
      const ord = computeOrderModN(x, N, 32768);
      if (ord === null) return null;
      lambdaAcc = lcmBig(lambdaAcc, ord);
      coprimeTested++;
    }
  }

  const ver = verifyCarmichaelLambda(N, lambdaAcc);
  if (!ver.verified) return null;
  return { lambda: lambdaAcc, verified: true, checkedBases: ver.checkedBases };
};

// Compute Carmichael Lambda λ(n) from factor powers:
// λ(p^k) = p^(k-1) * (p-1) for odd primes p
// λ(2) = 1, λ(4) = 2, λ(2^k) = 2^(k-2) for k >= 3
// λ(n) = lcm(λ(p_1^k_1), ..., λ(p_m^k_m))
export const computeCarmichaelLambda = (factors: Array<{ prime: bigint; power: number }>): bigint => {
  if (factors.length === 0) return 1n;
  let res = 1n;

  for (const { prime, power } of factors) {
    let termLambda = 1n;
    if (prime === 2n) {
      if (power === 1) termLambda = 1n;
      else if (power === 2) termLambda = 2n;
      else termLambda = 1n << BigInt(power - 2);
    } else {
      let pPow = 1n;
      for (let i = 1; i < power; i++) pPow *= prime;
      termLambda = pPow * (prime - 1n);
    }
    res = lcmBig(res, termLambda);
  }

  return res;
};

// Compute Euler Totient φ(n) = ∏ p^(k-1) * (p-1)
export const computeEulerPhi = (factors: Array<{ prime: bigint; power: number }>): bigint => {
  if (factors.length === 0) return 1n;
  let phi = 1n;
  for (const { prime, power } of factors) {
    let pPow = 1n;
    for (let i = 1; i < power; i++) pPow *= prime;
    phi *= pPow * (prime - 1n);
  }
  return phi;
};

// Integer k-th root
const integerNthRoot = (n: bigint, k: number): bigint => {
  if (n < 0n) return 0n;
  if (n <= 1n) return n;
  const kBig = BigInt(k);
  const kMinusOne = BigInt(k - 1);
  let x0 = 1n << BigInt(Math.ceil(n.toString(2).length / k));
  while (true) {
    let x0Pow = 1n;
    for (let i = 0; i < k - 1; i++) x0Pow *= x0;
    if (x0Pow === 0n) return 0n;
    const x1 = (kMinusOne * x0 + n / x0Pow) / kBig;
    if (x1 >= x0) return x0;
    x0 = x1;
  }
};

// Check if N is a perfect power N = a^k for k >= 2
export const checkPerfectPower = (n: bigint): { base: bigint; exp: number } | null => {
  if (n <= 3n) return null;
  const maxK = Math.min(64, n.toString(2).length);
  for (let k = 2; k <= maxK; k++) {
    const root = integerNthRoot(n, k);
    let powVal = 1n;
    for (let i = 0; i < k; i++) powVal *= root;
    if (powVal === n) {
      return { base: root, exp: k };
    }
  }
  return null;
};

// Quadratic residue filtering masks for Fermat
const QR64 = new Uint8Array(64);
[0, 1, 4, 9, 16, 17, 25, 33, 36, 41, 49, 57].forEach(v => {
  QR64[v] = 1;
});

// Split a single composite integer using algebraic/fast strategies (returns a non-trivial divisor if found)
const splitSingleComposite = (
  cur: bigint,
  maxSteps: number,
  ignoreCache = false
): { factor: bigint; method: string } | null => {
  if (cur <= 3n) return null;

  // 1. Check cache for sub-component unless cache bypass is active
  if (!ignoreCache) {
    const cachedSub = getCachedFactorization(cur);
    if (cachedSub && cachedSub.p > 1n && cachedSub.p < cur && cur % cachedSub.p === 0n) {
      return { factor: cachedSub.p, method: `ذاكرة التخزين المؤقت (${cachedSub.source})` };
    }
  }

  // 2. Perfect power (composite base^k)
  const pp = checkPerfectPower(cur);
  if (pp && pp.base > 1n && pp.base < cur) {
    return { factor: pp.base, method: `قوة تامة (${pp.base}^${pp.exp})` };
  }

  // 3. SNFS / Aurifeuillean / Cunningham / Repunit algebraic split
  if (cur.toString(2).length >= 24) {
    try {
      const snfs = analyzeSnfsAndCadoParams(cur);
      if (snfs.algebraicFactor) {
        const algF = BigInt(snfs.algebraicFactor);
        if (algF > 1n && algF < cur && cur % algF === 0n) {
          return { factor: algF, method: snfs.formLabelAr || 'تحليل SNFS جبري فوري' };
        }
      }
    } catch {
      // Ignore detector error
    }
  }

  // 4. Fermat close-primes check
  const root = bigIntSqrt(cur);
  if (root * root === cur) {
    return { factor: root, method: 'مربع كامل متطابق √N' };
  }
  let a = root + 1n;
  const nMod64 = Number(cur & 63n);
  let a64 = Number(a & 63n);
  const fermatBudget = Math.min(maxSteps, 60000);
  for (let i = 0; i < fermatBudget; i++) {
    if (QR64[(a64 * a64 - nMod64) & 63]) {
      const diff = a * a - cur;
      const b = bigIntSqrt(diff);
      if (b * b === diff) {
        const p1 = a - b;
        if (p1 > 1n && p1 < cur && cur % p1 === 0n) {
          return { factor: p1, method: `فرق مربعات فيرما (${i + 1} خطوة)` };
        }
      }
    }
    a += 1n;
    a64 = (a64 + 1) & 63;
  }

  // 5. Hart's 4kN resonance check
  const hartMultipliers = [1n, 3n, 5n, 7n, 11n, 13n, 15n, 17n, 19n, 21n, 23n, 29n, 31n, 35n, 37n];
  for (const k of hartMultipliers) {
    const fourKN = 4n * k * cur;
    const s = bigIntSqrt(fourKN) + 1n;
    for (let j = 0n; j < 2500n; j++) {
      const t = s + j;
      const R = t * t - fourKN;
      if (R > 0n) {
        const sq = bigIntSqrt(R);
        if (sq * sq === R) {
          const f = gcd(t - sq, cur);
          if (f > 1n && f < cur) {
            return { factor: f, method: `رنين هارت 4kN الموجه (k=${k})` };
          }
        }
      }
    }
  }

  // 6. Pollard's p - 1 scan (B1 = 12000)
  let p1Base = 2n;
  for (let p = 2; p <= 12000; p++) {
    let isP = true;
    for (let d = 2; d * d <= p; d++) {
      if (p % d === 0) {
        isP = false;
        break;
      }
    }
    if (!isP) continue;
    let pwr = p;
    while (pwr * p <= 12000) pwr *= p;
    p1Base = modPow(p1Base, BigInt(pwr), cur);
  }
  const gp1 = gcd(p1Base - 1n, cur);
  if (gp1 > 1n && gp1 < cur) {
    return { factor: gp1, method: 'بولارد p - 1 الأسي (B1=12000)' };
  }

  // 7. Pollard-Brent Rho with cyclic batching (safe synchronous cap <= 88 bits)
  const curBits = cur.toString(2).length;
  if (curBits <= 88) {
    const maxSeeds = curBits <= 80 ? 8n : 4n;
    const maxRhoSteps = curBits <= 76 ? 320000 : curBits <= 80 ? 220000 : 90000;
    for (let seed = 1n; seed <= maxSeeds; seed++) {
      let y = seed * 5n + 2n;
      const c = seed * 3n + 1n;
      let x = y;
      let ys = y;
      let g = 1n;
      let r = 1;
      let steps = 0;
      const m = 128;

      while (g === 1n && steps < maxRhoSteps) {
        x = y;
        for (let i = 0; i < r; i++) y = (y * y + c) % cur;
        let k = 0;
        while (k < r && g === 1n && steps < maxRhoSteps) {
          ys = y;
          const lim = Math.min(m, r - k);
          let qProd = 1n;
          for (let i = 0; i < lim; i++) {
            y = (y * y + c) % cur;
            const diff = x > y ? x - y : y - x;
            qProd = (qProd * diff) % cur;
            steps++;
          }
          g = gcd(qProd, cur);
          k += m;
        }
        r <<= 1;
      }
      if (g === cur) {
        do {
          ys = (ys * ys + c) % cur;
          const diff = x > ys ? x - ys : ys - x;
          g = gcd(diff, cur);
        } while (g === 1n);
      }
      if (g > 1n && g < cur) {
        return { factor: g, method: 'بولارد-برنت رو الحلقي' };
      }
    }
  }

  return null;
};

// Fast recursive multi-tiered prime factor extractor for ANY number N
export const extractFactorsAnyN = (
  N: bigint,
  maxSteps = 60000,
  ignoreCache = false
): {
  factors: Array<{ prime: bigint; power: number }>;
  isComplete: boolean;
  method: string;
} => {
  if (N <= 1n) return { factors: [], isComplete: true, method: 'Unit' };

  const factorsMap = new Map<bigint, number>();
  const methodsUsed: string[] = [];
  const addPrimeFactor = (p: bigint, mult = 1) => {
    factorsMap.set(p, (factorsMap.get(p) || 0) + mult);
  };

  // Seed work stack cleanly (handles cache hints unless bypassed, multi-factor composites, and recursive cofactors)
  const stack: Array<{ val: bigint; mult: number }> = [];
  const cached = ignoreCache ? undefined : getCachedFactorization(N);
  if (cached) {
    const list = cached.allFactors && cached.allFactors.length > 0 ? cached.allFactors : [cached.p, cached.q];
    for (const f of list) {
      if (f > 1n) stack.push({ val: f, mult: 1 });
    }
    methodsUsed.push(`ذاكرة التخزين المؤقت (${cached.source})`);
  } else {
    stack.push({ val: N, mult: 1 });
  }

  const unfactoredComposites: bigint[] = [];

  while (stack.length > 0) {
    const item = stack.pop()!;
    let cur = item.val;
    const mult = item.mult;
    if (cur <= 1n) continue;

    // Power-of-two peel
    let p2Count = 0;
    while ((cur & 1n) === 0n) {
      cur >>= 1n;
      p2Count++;
    }
    if (p2Count > 0) {
      addPrimeFactor(2n, p2Count * mult);
      if (!methodsUsed.length && cur === 1n) methodsUsed.push('تفكيك قوى 2 الصرفة');
    }
    if (cur === 1n) continue;

    // Primality check
    if (isProbablePrime(cur, 16)) {
      addPrimeFactor(cur, mult);
      if (cur === N) methodsUsed.push('فحص الأولية (Miller-Rabin 16 قاعدة)');
      continue;
    }

    // Small prime trial division up to 100,000
    let trialHit = false;
    for (let d = 3; d <= 100000; d += 2) {
      const bd = BigInt(d);
      if (bd * bd > cur) break;
      if (cur % bd === 0n) {
        let count = 0;
        while (cur % bd === 0n) {
          cur /= bd;
          count++;
        }
        addPrimeFactor(bd, count * mult);
        trialHit = true;
        if (cur === 1n) break;
        if (isProbablePrime(cur, 12)) {
          addPrimeFactor(cur, mult);
          cur = 1n;
          break;
        }
      }
    }
    if (trialHit) {
      if (!methodsUsed.includes('قسمة أولية سريعة (≤ 100,000)')) {
        methodsUsed.push('قسمة أولية سريعة (≤ 100,000)');
      }
      if (cur === 1n) continue;
    }

    // Split composite component recursively
    const split = splitSingleComposite(cur, maxSteps, ignoreCache);
    if (split && split.factor > 1n && split.factor < cur && cur % split.factor === 0n) {
      const other = cur / split.factor;
      methodsUsed.push(split.method);
      stack.push({ val: split.factor, mult });
      stack.push({ val: other, mult });
    } else {
      unfactoredComposites.push(cur);
      addPrimeFactor(cur, mult);
    }
  }

  const isComplete = unfactoredComposites.length === 0;
  const factors = Array.from(factorsMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([prime, power]) => ({ prime, power }));

  if (isComplete && factors.length > 0 && !cached && !ignoreCache) {
    const allExpanded: bigint[] = [];
    for (const f of factors) {
      for (let i = 0; i < f.power; i++) allExpanded.push(f.prime);
    }
    if (allExpanded.length >= 2) {
      cacheFactorization(
        N,
        allExpanded[0],
        N / allExpanded[0],
        allExpanded,
        methodsUsed[0] || 'تفكيك متعدد المراحل'
      );
    }
  }

  return {
    factors,
    isComplete,
    method:
      methodsUsed[0] ||
      (isComplete ? 'تفكيك أولي كامل' : 'عوامل أولية جزئية مكتشفة (المتبقي جاهز للتشغيل المتوازي)')
  };
};

// Find the smallest odd integer e >= 3 strictly coprime to λ(N)
export const selectMinimalCoprimeExponent = (lambda: bigint): bigint => {
  if (lambda <= 1n) return 3n;
  for (let e = 3n; e < lambda; e += 2n) {
    if (gcd(e, lambda) === 1n) return e;
  }
  let eFallback = 3n;
  while (gcd(eFallback, lambda) !== 1n) eFallback += 2n;
  return eFallback;
};

// Choose valid standard public exponent e coprime to λ(N)
const selectCoprimePublicExponent = (lambda: bigint): bigint => {
  if (lambda <= 1n) return 3n;
  const candidates = [65537n, 257n, 17n, 5n, 3n];
  const preferred = candidates.find(c => c < lambda && gcd(c, lambda) === 1n);
  if (preferred) return preferred;

  for (let e = 3n; e < lambda; e += 2n) {
    if (gcd(e, lambda) === 1n) return e;
  }

  let eFallback = 3n;
  while (gcd(eFallback, lambda) !== 1n) eFallback += 2n;
  return eFallback;
};

// Guaranteed Universal Exponent λ(N), Totient φ(N), and Public Exponent e for ANY number N
export const computeUniversalExponentReport = (
  rawN: bigint | string,
  mode: 'standard' | 'wiener' | 'boneh-durfee' = 'standard',
  deltaTarget = 0.258,
  hintP?: bigint | string,
  hintQ?: bigint | string,
  options?: UniversalExponentOptions
): UniversalExponentReport => {
  const N = typeof rawN === 'string' ? BigInt(rawN.trim().replace(/[^0-9]/g, '') || '0') : rawN;
  const nBits = N > 0n ? N.toString(2).length : 0;
  const stopStage1BeforeFactors = Boolean(options?.stopStage1BeforeFactors);
  const ignoreCache = Boolean(options?.ignoreCache);

  if (N < 2n) {
    return {
      n: N.toString(),
      nBits,
      status: 'standard-guaranteed',
      lambdaN: '1',
      lambdaBits: 1,
      phiN: '1',
      publicExponentE: '3',
      privateExponentD: '1',
      minimalPublicExponentE: '3',
      minimalPrivateExponentD: '1',
      eMode: mode,
      dBits: 1,
      gcdEWithLambda: '1',
      gcdEWithPhi: '1',
      isCoprimeWithLambda: true,
      isCoprimeWithPhi: true,
      lambdaVerified: true,
      verifiedBasesCount: 1,
      stage1StoppedBeforeFactors: false,
      needsAsyncWorker: false,
      computationPath: 'prime-direct',
      reductionRatio: '1.000',
      factors: [],
      isComplete: true,
      provenance: 'direct-primality',
      cacheBypassed: ignoreCache,
      explanationAr: 'العدد أصغر من 2، لا يخضع للمجموعات التضاعفية.',
      explanationEn: 'Number is less than 2, trivial unit.'
    };
  }

  const preExistingCache = ignoreCache ? undefined : getCachedFactorization(N);
  let usedExternalHint = false;

  // Register explicit external hints in cache if valid and cache is not bypassed
  if (hintP && !ignoreCache) {
    try {
      const pBig = typeof hintP === 'string' ? BigInt(hintP.trim()) : hintP;
      if (pBig > 1n && pBig < N && N % pBig === 0n) {
        const qBig = hintQ ? (typeof hintQ === 'string' ? BigInt(hintQ.trim()) : hintQ) : N / pBig;
        usedExternalHint = true;
        if (!preExistingCache) {
          cacheFactorization(N, pBig, qBig, undefined, 'تلميح خارجي معطى');
        }
      }
    } catch {
      // ignore invalid hint
    }
  }

  // Stage 1 Stop-Before-Factors Fast Path A:
  // If N is prime (verified directly in Stage 1 without factoring), λ(N) = φ(N) = N - 1 immediately!
  const isPrimeN = isProbablePrime(N, 16);
  if (isPrimeN) {
    const lambda = N - 1n;
    const phi = N - 1n;
    const eMin = selectMinimalCoprimeExponent(lambda);
    const dMin = safeModInverse(eMin, lambda);
    const e = selectCoprimePublicExponent(lambda);
    const d = safeModInverse(e, lambda);
    const gcdLambda = gcd(e, lambda);
    const gcdPhi = gcd(e, phi);
    const ver = verifyCarmichaelLambda(N, lambda);

    return {
      n: N.toString(),
      nBits,
      status: 'prime',
      lambdaN: lambda.toString(),
      lambdaBits: lambda.toString(2).length,
      phiN: phi.toString(),
      publicExponentE: e.toString(),
      privateExponentD: d.toString(),
      minimalPublicExponentE: eMin.toString(),
      minimalPrivateExponentD: dMin.toString(),
      eMode: mode,
      dBits: d.toString(2).length,
      gcdEWithLambda: gcdLambda.toString(),
      gcdEWithPhi: gcdPhi.toString(),
      isCoprimeWithLambda: gcdLambda === 1n,
      isCoprimeWithPhi: gcdPhi === 1n,
      lambdaVerified: ver.verified,
      verifiedBasesCount: ver.checkedBases,
      stage1StoppedBeforeFactors: stopStage1BeforeFactors,
      needsAsyncWorker: false,
      computationPath: 'prime-direct',
      reductionRatio: '1.000',
      factors: stopStage1BeforeFactors ? [] : [{ prime: N.toString(), power: 1 }],
      isComplete: true,
      provenance: 'direct-primality',
      cacheBypassed: ignoreCache,
      explanationAr: stopStage1BeforeFactors
        ? `تم إيقاف المرحلة 1 قبل استخلاص العوامل: العدد أولي مؤكد، والأس العام الأصغر يساوي λ(N) = N − 1 بالكامل (${lambda.toString().length} خانة)؛ أصغر أس أولي نسبي e_min = ${eMin.toString()} والقياسي e = ${e.toString()}.`
        : `العدد أولي مؤكد: λ(N) = φ(N) = N − 1 بالكامل. أصغر أس عام أولي نسبي مكتشف e_min = ${eMin.toString()} والأس القياسي المعتمد e = ${e.toString()}.`,
      explanationEn: `Confirmed prime modulus: exact λ(N) = N − 1 verified; minimal e = ${eMin.toString()}, standard e = ${e.toString()}.`
    };
  }

  // Stage 1 Stop-Before-Factors Fast Path B:
  // Direct modular order-finding (BSGS) for N <= 2^30 when stopping Stage 1 before factor extraction!
  if (stopStage1BeforeFactors && mode === 'standard' && N.toString(2).length <= 30) {
    const stage1Order = findCarmichaelLambdaStage1OrderOnly(N);
    if (stage1Order) {
      const lambda = stage1Order.lambda;
      const eMin = selectMinimalCoprimeExponent(lambda);
      const dMin = safeModInverse(eMin, lambda);
      const e = selectCoprimePublicExponent(lambda);
      const d = safeModInverse(e, lambda);
      const gcdLambda = gcd(e, lambda);

      return {
        n: N.toString(),
        nBits,
        status: 'order-stage1',
        lambdaN: lambda.toString(),
        lambdaBits: lambda.toString(2).length,
        phiN: 'موقوف لحين طلب استكمال العوامل (λ(N) محسوب مباشرة عبر الرتب الدورية)',
        publicExponentE: e.toString(),
        privateExponentD: d.toString(),
        minimalPublicExponentE: eMin.toString(),
        minimalPrivateExponentD: dMin.toString(),
        eMode: 'standard',
        dBits: d.toString(2).length,
        gcdEWithLambda: gcdLambda.toString(),
        gcdEWithPhi: '1 (مؤكد عبر λ(N))',
        isCoprimeWithLambda: gcdLambda === 1n,
        isCoprimeWithPhi: gcdLambda === 1n,
        lambdaVerified: stage1Order.verified,
        verifiedBasesCount: stage1Order.checkedBases,
        stage1StoppedBeforeFactors: true,
        needsAsyncWorker: false,
        computationPath: 'order-finding-stage1',
        reductionRatio: 'محسوب عبر الرتب',
        factors: [],
        isComplete: true,
        provenance: 'direct-order',
        cacheBypassed: ignoreCache,
        explanationAr: `تم حساب الأس العام λ(N) = ${lambda.toString()} مباشرة عبر الرتب التضاعفية lcm(ord_N(a)) وإيقاف المرحلة 1 قبل العوامل؛ أصغر أس أولي نسبي e_min = ${eMin.toString()} والقياسي e = ${e.toString()}.`,
        explanationEn: `Computed exact λ(N) directly via Stage 1 multiplicative order-finding; minimal e = ${eMin.toString()}.`
      };
    }
  }

  // Multi-tiered recursive factor extractor (handles cache unless bypassed, powers of 2, p^k, ≤100k primes, SNFS algebraic splits, Fermat, Hart 4kN, p-1, Pollard-Brent)
  const cacheRecord = ignoreCache ? undefined : (preExistingCache || getCachedFactorization(N));
  const hadCacheBefore = Boolean(cacheRecord);
  const factorRes = extractFactorsAnyN(N, 60000, ignoreCache);
  const resolvedProvenance: UniversalExponentReport['provenance'] = preExistingCache
    ? 'cache-seeded'
    : usedExternalHint
    ? 'external-hint'
    : 'independent-from-N';
  const factorPowers: PrimeFactorPower[] = stopStage1BeforeFactors
    ? []
    : factorRes.factors.map(f => ({
        prime: f.prime.toString(),
        power: f.power
      }));

  // If fully resolved to exact prime-power decomposition
  if (factorRes.isComplete && factorRes.factors.length > 0) {
    const isSinglePrime = factorRes.factors.length === 1 && factorRes.factors[0].power === 1;
    const isPrimePower = factorRes.factors.length === 1 && factorRes.factors[0].power > 1;
    const lambda = computeCarmichaelLambda(factorRes.factors);
    const phi = computeEulerPhi(factorRes.factors);
    const ratio = computeReductionRatio(phi, lambda);
    const ver = verifyCarmichaelLambda(N, lambda);

    const compPath: UniversalExponentReport['computationPath'] = hadCacheBefore
      ? 'cache'
      : isSinglePrime
      ? 'prime-direct'
      : isPrimePower && factorRes.factors[0].prime === 2n
      ? 'power-of-two'
      : isPrimePower
      ? 'prime-power'
      : 'recursive-factor-engine';

    const eMin = selectMinimalCoprimeExponent(lambda);
    const dMin = safeModInverse(eMin, lambda);

    // Standard mode: compute both minimal dynamically discovered coprime e_min and verified standard prime e
    if (mode === 'standard') {
      const e = selectCoprimePublicExponent(lambda);
      const d = safeModInverse(e, lambda);
      const gcdLambda = gcd(e, lambda);
      const gcdPhi = gcd(e, phi);

      // CRT parameters only if two distinct primes AND Stage 1 wasn't stopped before revealing factors
      let crt: UniversalExponentReport['crt'];
      if (
        !stopStage1BeforeFactors &&
        factorRes.factors.length === 2 &&
        factorRes.factors[0].power === 1 &&
        factorRes.factors[1].power === 1
      ) {
        const p = factorRes.factors[0].prime;
        const q = factorRes.factors[1].prime;
        crt = {
          dp: (d % (p - 1n)).toString(),
          dq: (d % (q - 1n)).toString(),
          qInv: safeModInverse(q, p).toString()
        };
      }

      const status: UniversalExponentReport['status'] = hadCacheBefore
        ? 'cached-factors'
        : isSinglePrime
        ? 'prime'
        : isPrimePower
        ? 'prime-power'
        : 'exact-factored';

      const explAr = stopStage1BeforeFactors
        ? `تم حساب الأس العام الأصغر λ(N) بالكامل (${lambda.toString(2).length} بت) وإيقاف المرحلة 1 قبل إظهار العوامل؛ أصغر أس أولي نسبي مكتشف e_min = ${eMin.toString()} والقياسي e = ${e.toString()}، ومُتحقق على ${ver.checkedBases} قواعد.`
        : `تم حساب λ(N) وφ(N) بالكامل عبر (${factorRes.method}) بنسبة اختصار φ/λ = ${ratio}. أصغر أس أولي نسبي مكتشف من λ(N) هو e_min = ${eMin.toString()} والأس القياسي المعتمد e = ${e.toString()}.`;

      return {
        n: N.toString(),
        nBits,
        status,
        lambdaN: lambda.toString(),
        lambdaBits: lambda.toString(2).length,
        phiN: phi.toString(),
        publicExponentE: e.toString(),
        privateExponentD: d.toString(),
        minimalPublicExponentE: eMin.toString(),
        minimalPrivateExponentD: dMin.toString(),
        eMode: 'standard',
        dBits: d.toString(2).length,
        gcdEWithLambda: gcdLambda.toString(),
        gcdEWithPhi: gcdPhi.toString(),
        isCoprimeWithLambda: gcdLambda === 1n,
        isCoprimeWithPhi: gcdPhi === 1n,
        lambdaVerified: ver.verified,
        verifiedBasesCount: ver.checkedBases,
        stage1StoppedBeforeFactors: stopStage1BeforeFactors,
        needsAsyncWorker: false,
        computationPath: compPath,
        reductionRatio: ratio,
        factors: factorPowers,
        isComplete: true,
        provenance: resolvedProvenance,
        cacheSource: cacheRecord?.source,
        cacheBypassed: ignoreCache,
        crt,
        explanationAr: explAr,
        explanationEn: `Exact λ(N) computed (${lambda.toString().length} digits); provenance=${resolvedProvenance}; minimal e = ${eMin.toString()}, standard e = ${e.toString()}.`
      };
    }

    // Wiener or Boneh-Durfee weak-key mode: compute e ≡ d⁻¹ (mod φ(N)), which also guarantees e*d ≡ 1 (mod λ(N))
    let targetDBits =
      mode === 'wiener'
        ? Math.max(3, Math.floor(nBits / 4) - 6)
        : Math.max(4, Math.min(Math.floor(nBits * 0.282), Math.round(nBits * deltaTarget)));

    const lambdaBits = lambda.toString(2).length;
    const phiBits = phi.toString(2).length;
    if (targetDBits >= phiBits - 1) targetDBits = Math.max(2, Math.floor(phiBits / 4));

    let d = (1n << BigInt(Math.max(1, targetDBits - 1))) + 1n;
    if (mode === 'boneh-durfee' && targetDBits > 8) {
      for (let b = 4; b < targetDBits - 2; b += 7) {
        if (b % 14 === 4) d |= 1n << BigInt(b);
      }
    }
    if (mode === 'wiener') {
      const nFourth = bigIntSqrt(bigIntSqrt(N));
      const maxWienerD = nFourth > 12n ? nFourth / 3n - 1n : 3n;
      if (d > maxWienerD) d = maxWienerD % 2n === 0n ? maxWienerD - 1n : maxWienerD;
      if (d < 3n) d = 3n;
    }

    let guard = 0;
    while ((d >= phi || gcd(d, phi) !== 1n) && guard < 4000) {
      d = d <= 5n ? d + 2n : d - 2n;
      if (d < 3n) d = 3n;
      guard++;
    }
    if (gcd(d, phi) !== 1n || d >= phi) {
      d = 3n;
      while (d < phi && gcd(d, phi) !== 1n) d += 2n;
      if (d >= phi) d = 1n;
    }

    const e = safeModInverse(d, phi);
    const gcdLambda = gcd(e, lambda);
    const gcdPhi = gcd(e, phi);

    let crt: UniversalExponentReport['crt'];
    if (
      !stopStage1BeforeFactors &&
      factorRes.factors.length === 2 &&
      factorRes.factors[0].power === 1 &&
      factorRes.factors[1].power === 1
    ) {
      const p = factorRes.factors[0].prime;
      const q = factorRes.factors[1].prime;
      crt = {
        dp: (d % (p - 1n)).toString(),
        dq: (d % (q - 1n)).toString(),
        qInv: safeModInverse(q, p).toString()
      };
    }

    const modeName = mode === 'wiener' ? 'Wiener (d < N^0.25)' : 'Boneh–Durfee (d < N^0.28)';
    const explAr = `تم حساب الأس العام الضعيف e المطابق لـ ${modeName} بناءً على φ(N) وλ(N) (|d| = ${d.toString(2).length} بت). يحقق e·d ≡ 1 (mod φ(N)) و(mod λ(N)) بنسبة 100%.`;

    return {
      n: N.toString(),
      nBits,
      status: 'exact-factored',
      lambdaN: lambda.toString(),
      lambdaBits,
      phiN: phi.toString(),
      publicExponentE: e.toString(),
      privateExponentD: d.toString(),
      minimalPublicExponentE: eMin.toString(),
      minimalPrivateExponentD: dMin.toString(),
      eMode: mode,
      dBits: d.toString(2).length,
      gcdEWithLambda: gcdLambda.toString(),
      gcdEWithPhi: gcdPhi.toString(),
      isCoprimeWithLambda: gcdLambda === 1n,
      isCoprimeWithPhi: gcdPhi === 1n,
      lambdaVerified: ver.verified,
      verifiedBasesCount: ver.checkedBases,
      stage1StoppedBeforeFactors: stopStage1BeforeFactors,
      needsAsyncWorker: false,
      computationPath: compPath,
      reductionRatio: ratio,
      factors: factorPowers,
      isComplete: true,
      provenance: resolvedProvenance,
      cacheSource: cacheRecord?.source,
      cacheBypassed: ignoreCache,
      crt,
      explanationAr: explAr,
      explanationEn: `Constructed valid weak exponent e via exact λ(N) (${modeName}, provenance=${resolvedProvenance}).`
    };
  }

  // Composite requires async background solver BEFORE assigning or claiming any public exponent e!
  const explAr =
    mode === 'standard'
      ? `العدد مركب (${nBits} بت) ولم يُحسم تفكيكه بعد${ignoreCache ? ' (تم تجاوز الذاكرة المخبأة للتحقق المستقل)' : ''}: لم يتم فرض 65537 تلقائياً. اضغط «إيجاد λ(N) والأس العام بأي طريقة» لحسم العوامل وحساب λ(N) والأس العام الفعلي أولاً.`
      : `لم تُكتشف العوامل بعد (${nBits} بت): جارٍ البحث عبر المحركات المتوازية لحسم العوامل وλ(N) أولاً ثم توليد الأس الضعيف (${mode === 'wiener' ? 'Wiener' : 'Boneh–Durfee'}) بدقة.`;

  return {
    n: N.toString(),
    nBits,
    status: 'standard-guaranteed',
    lambdaN: 'بانتظار إيجاد العوامل أو λ(N) أولاً',
    lambdaBits: 0,
    phiN: 'بانتظار إيجاد العوامل أولاً',
    publicExponentE: null,
    privateExponentD: null,
    minimalPublicExponentE: null,
    minimalPrivateExponentD: null,
    eMode: mode,
    dBits: null,
    gcdEWithLambda: 'بانتظار حسم λ(N)',
    gcdEWithPhi: 'بانتظار حسم φ(N)',
    isCoprimeWithLambda: false,
    isCoprimeWithPhi: false,
    lambdaVerified: false,
    verifiedBasesCount: 0,
    stage1StoppedBeforeFactors: stopStage1BeforeFactors,
    needsAsyncWorker: true,
    computationPath: 'worker-pending',
    reductionRatio: 'بانتظار حسم الخيوط',
    factors: factorPowers,
    isComplete: false,
    provenance: 'worker-pending',
    cacheBypassed: ignoreCache,
    explanationAr: explAr,
    explanationEn: `Factorization / λ(N) pending (${nBits}-bit${ignoreCache ? ', cache bypassed' : ''}): public exponent will be resolved directly once λ(N) is determined.`
  };
};
