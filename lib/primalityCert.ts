import { bigIntSqrt, gcd, modPow } from '../mathUtils';

export type PrimalityCertificateStrength =
  | 'small-trial-exact'
  | 'deterministic-64b'
  | 'pocklington-proven'
  | 'bpsw-probabilistic'
  | 'composite'
  | 'invalid';

export interface MrWitnessCheck {
  base: string;
  passed: boolean;
}

export interface LucasSelfridgeTrace {
  D: number;
  P: number;
  Q: number;
  jacobiDN: number;
  uLucasZero: boolean;
  vLucasZeroOrStrong: boolean;
  passed: boolean;
}

export interface PocklingtonWitnessEntry {
  primeQ: string;
  powerInNMinus1: number;
  primeCertStrength: PrimalityCertificateStrength;
  baseA: string;
  fermatCheckPassed: boolean;
  gcdCheckPassed: boolean;
  subCert?: PrimalityCertificate;
}

export interface PocklingtonProofData {
  nMinus1: string;
  factoredPartF: string;
  cofactorR: string;
  thresholdSqrtN: string;
  fExceedsSqrtN: boolean;
  witnesses: PocklingtonWitnessEntry[];
}

export interface PrimalityCertificate {
  n: string;
  nBits: number;
  isPrime: boolean;
  isProvenDeterministic: boolean;
  strength: PrimalityCertificateStrength;
  theoremCitation: string;
  summaryAr: string;
  summaryEn: string;
  mrWitnesses: MrWitnessCheck[];
  lucasTrace?: LucasSelfridgeTrace;
  pocklingtonProof?: PocklingtonProofData;
  compositeWitness?: string;
  generatedAt: string;
}

// Proven deterministic bases for all n < 3,317,044,064,679,887,385,961,981 (> 2^64)
// Sorenson & Webster (2017), Math. Comp.
const DETERMINISTIC_64B_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

const SMALL_PRIMES_FOR_CERT = (() => {
  const limit = 100000;
  const sieve = new Uint8Array(limit + 1);
  const out: number[] = [2];
  for (let i = 3; i <= limit; i += 2) {
    if (!sieve[i]) {
      out.push(i);
      if (i * i <= limit) {
        for (let j = i * i; j <= limit; j += 2 * i) sieve[j] = 1;
      }
    }
  }
  return out;
})();

const mrSingleBase = (n: bigint, a: bigint): boolean => {
  if (a >= n) return true;
  if (n % a === 0n) return n === a;
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  let x = modPow(a, d, n);
  if (x === 1n || x === n - 1n) return true;
  for (let r = 1; r < s; r++) {
    x = (x * x) % n;
    if (x === n - 1n) return true;
  }
  return false;
};

export const jacobiBigInt = (aIn: bigint, nIn: bigint): number => {
  if (nIn <= 0n || (nIn & 1n) === 0n) return 0;
  let a = ((aIn % nIn) + nIn) % nIn;
  let n = nIn;
  let t = 1;
  while (a !== 0n) {
    while ((a & 1n) === 0n) {
      a >>= 1n;
      const r = n & 7n;
      if (r === 3n || r === 5n) t = -t;
    }
    const tmp = a;
    a = n;
    n = tmp;
    if ((a & 3n) === 3n && (n & 3n) === 3n) t = -t;
    a %= n;
  }
  return n === 1n ? t : 0;
};

const modNorm = (x: bigint, m: bigint): bigint => {
  const r = x % m;
  return r < 0n ? r + m : r;
};

/**
 * Baillie-PSW Strong Lucas Test using Selfridge's Method A for D.
 */
export const strongLucasSelfridgeTest = (n: bigint): LucasSelfridgeTrace => {
  if (n < 2n || (n & 1n) === 0n) {
    return { D: 0, P: 1, Q: 0, jacobiDN: 0, uLucasZero: false, vLucasZeroOrStrong: false, passed: n === 2n };
  }
  const sq = bigIntSqrt(n);
  if (sq * sq === n) {
    return { D: 0, P: 1, Q: 0, jacobiDN: 0, uLucasZero: false, vLucasZeroOrStrong: false, passed: false };
  }

  let D = 5;
  let step = 0;
  let jac = 0;
  while (step < 500) {
    jac = jacobiBigInt(BigInt(D), n);
    if (jac === -1) break;
    if (jac === 0 && BigInt(Math.abs(D)) < n) {
      return { D, P: 1, Q: (1 - D) / 4, jacobiDN: 0, uLucasZero: false, vLucasZeroOrStrong: false, passed: false };
    }
    D = D > 0 ? -(D + 2) : -D + 2;
    step++;
  }
  if (jac !== -1) {
    return { D, P: 1, Q: (1 - D) / 4, jacobiDN: jac, uLucasZero: false, vLucasZeroOrStrong: false, passed: false };
  }

  const P = 1n;
  const Q = BigInt((1 - D) / 4);
  const Dbig = BigInt(D);

  let d = n + 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }

  // Binary Lucas chain for (U_d, V_d) mod n
  let U = 1n;
  let V = P;
  let Qk = modNorm(Q, n);
  const dBits = d.toString(2);
  const halfInv = (n + 1n) >> 1n;

  for (let i = 1; i < dBits.length; i++) {
    U = (U * V) % n;
    V = modNorm(V * V - 2n * Qk, n);
    Qk = (Qk * Qk) % n;
    if (dBits[i] === '1') {
      const nextU = modNorm((P * U + V) * halfInv, n);
      const nextV = modNorm((Dbig * U + P * V) * halfInv, n);
      U = nextU;
      V = nextV;
      Qk = modNorm(Qk * Q, n);
    }
  }

  const uZero = U === 0n;
  let vStrongZero = V === 0n;
  if (!uZero && !vStrongZero) {
    let curV = V;
    let curQk = Qk;
    for (let r = 1; r < s; r++) {
      curV = modNorm(curV * curV - 2n * curQk, n);
      curQk = (curQk * curQk) % n;
      if (curV === 0n) {
        vStrongZero = true;
        break;
      }
    }
  }

  return {
    D,
    P: 1,
    Q: Number(Q),
    jacobiDN: jac,
    uLucasZero: uZero,
    vLucasZeroOrStrong: vStrongZero,
    passed: uZero || vStrongZero
  };
};

const isQuickProbablePrime = (n: bigint): boolean => {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if ((n & 1n) === 0n) return false;
  for (let i = 0; i < 64 && SMALL_PRIMES_FOR_CERT[i] < 320; i++) {
    const p = BigInt(SMALL_PRIMES_FOR_CERT[i]);
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  for (const b of DETERMINISTIC_64B_BASES) {
    if (!mrSingleBase(n, b)) return false;
  }
  return n < (1n << 64n) ? true : strongLucasSelfridgeTest(n).passed;
};

// Bounded Pollard-Brent Rho helper for factoring (n - 1) during Pocklington certificate construction
const boundedRhoFactor = (m: bigint, maxSteps: number): bigint | null => {
  if ((m & 1n) === 0n) return 2n;
  if (isQuickProbablePrime(m)) return m;
  for (let c = 1n; c <= 5n; c++) {
    let y = 2n + c;
    let r = 1;
    let q = 1n;
    let g = 1n;
    let x = 2n;
    let ys = y;
    let steps = 0;
    while (g === 1n && steps < maxSteps) {
      x = y;
      for (let i = 0; i < r; i++) y = (y * y + c) % m;
      let k = 0;
      while (k < r && g === 1n && steps < maxSteps) {
        ys = y;
        const lim = Math.min(64, r - k);
        for (let i = 0; i < lim; i++) {
          y = (y * y + c) % m;
          const diff = x > y ? x - y : y - x;
          q = (q * diff) % m;
        }
        g = gcd(q, m);
        k += lim;
        steps += lim;
      }
      r <<= 1;
    }
    if (g === m) {
      let cur = ys;
      for (let j = 0; j < 128; j++) {
        cur = (cur * cur + c) % m;
        g = gcd(x > cur ? x - cur : cur - x, m);
        if (g > 1n) break;
      }
    }
    if (g > 1n && g < m) return g;
  }
  return null;
};

// Bounded Pollard p-1 for smooth factors of (n - 1)
const boundedPMinus1 = (m: bigint, b1 = 5000): bigint | null => {
  let a = 2n;
  for (let i = 0; i < SMALL_PRIMES_FOR_CERT.length; i++) {
    const p = SMALL_PRIMES_FOR_CERT[i];
    if (p > b1) break;
    let pe = BigInt(p);
    while (pe * BigInt(p) <= BigInt(b1)) pe *= BigInt(p);
    a = modPow(a, pe, m);
    if (i % 64 === 63) {
      const g = gcd(a - 1n, m);
      if (g > 1n && g < m) return g;
    }
  }
  const g = gcd(a - 1n, m);
  return g > 1n && g < m ? g : null;
};

const extractPrimePowersForPocklington = (
  nMinus1: bigint,
  targetBound: bigint,
  budgetMs = 90
): Map<bigint, number> => {
  const t0 = Date.now();
  const map = new Map<bigint, number>();
  let rem = nMinus1;
  let fAcc = 1n;

  const addPrime = (p: bigint, count = 1) => {
    map.set(p, (map.get(p) || 0) + count);
    for (let i = 0; i < count; i++) fAcc *= p;
  };

  // 1. Exact small trial primes up to 100,000
  for (let i = 0; i < SMALL_PRIMES_FOR_CERT.length; i++) {
    const p = BigInt(SMALL_PRIMES_FOR_CERT[i]);
    if (p * p > rem) break;
    if (rem % p === 0n) {
      let c = 0;
      while (rem % p === 0n) {
        rem /= p;
        c++;
      }
      addPrime(p, c);
      if (fAcc > targetBound) break;
    }
  }

  // 2. If cofactor is small or already >= 2^64 prime/composite, try recursive split until F > sqrt(N) or budget expires
  const stack: bigint[] = rem > 1n ? [rem] : [];
  while (stack.length > 0 && fAcc <= targetBound && Date.now() - t0 < budgetMs) {
    const cur = stack.pop()!;
    if (cur <= 1n) continue;
    if (isQuickProbablePrime(cur)) {
      addPrime(cur, 1);
      continue;
    }
    const p1 = boundedPMinus1(cur, 4000) || boundedRhoFactor(cur, 3200);
    if (p1 && p1 > 1n && p1 < cur) {
      stack.push(p1);
      stack.push(cur / p1);
    }
  }

  return map;
};

/**
 * Generates an independently verifiable Primality Certificate for any integer n.
 * - n <= 10^6: exact trial division certificate (`small-trial-exact`)
 * - n < 2^64: deterministic 12-base Miller-Rabin certificate (`deterministic-64b`)
 * - n >= 2^64: attempts recursive Pocklington (1914) certificate where F > sqrt(n) and every prime factor q|F is certified;
 *              otherwise honestly reports `bpsw-probabilistic` (MR + Strong Lucas Selfridge trace) without overclaiming.
 */
export const generatePrimalityCertificate = (n: bigint, depth = 0): PrimalityCertificate => {
  const generatedAt = new Date().toISOString();
  if (n < 2n) {
    return {
      n: n.toString(),
      nBits: Math.max(0, n.toString(2).length),
      isPrime: false,
      isProvenDeterministic: true,
      strength: 'invalid',
      theoremCitation: 'Definition of Prime Integers (p >= 2)',
      summaryAr: 'القيمة أقل من 2 وليست عدداً أولياً.',
      summaryEn: 'Value is less than 2 and cannot be prime.',
      mrWitnesses: [],
      generatedAt
    };
  }

  const nBits = n.toString(2).length;

  // Small primes exact trial check
  if (n <= 1000000n) {
    const rt = bigIntSqrt(n);
    if (n === 2n) {
      return {
        n: '2',
        nBits: 2,
        isPrime: true,
        isProvenDeterministic: true,
        strength: 'small-trial-exact',
        theoremCitation: 'Exact Trial Division up to floor(sqrt(N))',
        summaryAr: 'أولي مؤكد حتمياً (2 أصغر عدد أولي زوجي).',
        summaryEn: 'Deterministically prime by exact definition.',
        mrWitnesses: [{ base: '2', passed: true }],
        generatedAt
      };
    }
    if ((n & 1n) === 0n) {
      return {
        n: n.toString(),
        nBits,
        isPrime: false,
        isProvenDeterministic: true,
        strength: 'composite',
        theoremCitation: 'Exact Trial Division',
        summaryAr: `عدد مركب يقبل القسمة على 2.`,
        summaryEn: 'Composite: divisible by 2.',
        mrWitnesses: [],
        compositeWitness: '2',
        generatedAt
      };
    }
    for (let i = 1; i < SMALL_PRIMES_FOR_CERT.length; i++) {
      const p = BigInt(SMALL_PRIMES_FOR_CERT[i]);
      if (p > rt) break;
      if (n % p === 0n) {
        return {
          n: n.toString(),
          nBits,
          isPrime: false,
          isProvenDeterministic: true,
          strength: 'composite',
          theoremCitation: 'Exact Trial Division',
          summaryAr: `عدد مركب: القاسم الأولي ${p.toString()} يقسم N.`,
          summaryEn: `Composite: divisible by ${p.toString()}.`,
          mrWitnesses: [],
          compositeWitness: p.toString(),
          generatedAt
        };
      }
    }
    return {
      n: n.toString(),
      nBits,
      isPrime: true,
      isProvenDeterministic: true,
      strength: 'small-trial-exact',
      theoremCitation: 'Exact Trial Division up to floor(sqrt(N))',
      summaryAr: `شهادة أولية حتمية 100% بالقسمة التامة حتى √N = ${rt.toString()}.`,
      summaryEn: `100% deterministic primality proved by exact trial division up to sqrt(N) = ${rt.toString()}.`,
      mrWitnesses: DETERMINISTIC_64B_BASES.filter(b => b < n).map(b => ({ base: b.toString(), passed: mrSingleBase(n, b) })),
      generatedAt
    };
  }

  // Even or small prime factor quick rejection
  if ((n & 1n) === 0n) {
    return {
      n: n.toString(),
      nBits,
      isPrime: false,
      isProvenDeterministic: true,
      strength: 'composite',
      theoremCitation: 'Parity Divisibility',
      summaryAr: 'عدد مركب زوجي يقبل القسمة على 2.',
      summaryEn: 'Composite even integer divisible by 2.',
      mrWitnesses: [],
      compositeWitness: '2',
      generatedAt
    };
  }
  for (let i = 1; i < 64; i++) {
    const p = BigInt(SMALL_PRIMES_FOR_CERT[i]);
    if (n % p === 0n) {
      return {
        n: n.toString(),
        nBits,
        isPrime: false,
        isProvenDeterministic: true,
        strength: 'composite',
        theoremCitation: 'Trial Division',
        summaryAr: `عدد مركب يقبل القسمة على ${p.toString()}.`,
        summaryEn: `Composite: divisible by ${p.toString()}.`,
        mrWitnesses: [],
        compositeWitness: p.toString(),
        generatedAt
      };
    }
  }

  // Run all 12 Sorenson-Webster bases
  const mrWitnesses: MrWitnessCheck[] = [];
  for (const base of DETERMINISTIC_64B_BASES) {
    const ok = mrSingleBase(n, base);
    mrWitnesses.push({ base: base.toString(), passed: ok });
    if (!ok) {
      return {
        n: n.toString(),
        nBits,
        isPrime: false,
        isProvenDeterministic: true,
        strength: 'composite',
        theoremCitation: `Miller-Rabin Compositeness Witness (base a = ${base.toString()})`,
        summaryAr: `شاهد مركبية قاطع (Composite Witness) عند القاعدة a = ${base.toString()}.`,
        summaryEn: `Proven composite by Miller-Rabin witness a = ${base.toString()}.`,
        mrWitnesses,
        compositeWitness: base.toString(),
        generatedAt
      };
    }
  }

  // Deterministic 64-bit exact range (n < 2^64)
  if (n < (1n << 64n)) {
    return {
      n: n.toString(),
      nBits,
      isPrime: true,
      isProvenDeterministic: true,
      strength: 'deterministic-64b',
      theoremCitation: 'Sorenson & Webster (2017): 12 bases {2..37} are 100% deterministic for all N < 3.317×10^24 (> 2^64)',
      summaryAr: `شهادة أولية حتمية 100% لنطاق ≤64 بت (${nBits} بت) عبر قواعد Sorenson-Webster الـ12 بدون أي احتمال خطأ.`,
      summaryEn: `100% deterministic primality certificate for <=64-bit range (${nBits}-bit) via 12 Sorenson-Webster bases.`,
      mrWitnesses,
      generatedAt
    };
  }

  // >= 64-bit: Run Selfridge Strong Lucas (completing Baillie-PSW)
  const lucasTrace = strongLucasSelfridgeTest(n);
  if (!lucasTrace.passed) {
    return {
      n: n.toString(),
      nBits,
      isPrime: false,
      isProvenDeterministic: true,
      strength: 'composite',
      theoremCitation: `Selfridge Strong Lucas Compositeness Witness (D=${lucasTrace.D})`,
      summaryAr: `عدد مركب: فشل اختبار لوكاس القوي (Baillie-PSW D=${lucasTrace.D}).`,
      summaryEn: `Proven composite by Strong Lucas test (D=${lucasTrace.D}).`,
      mrWitnesses,
      lucasTrace,
      compositeWitness: `Lucas(D=${lucasTrace.D})`,
      generatedAt
    };
  }

  // Attempt recursive Pocklington (1914) Certificate (F > sqrt(N))
  if (depth < 4) {
    const nMinus1 = n - 1n;
    const sqrtN = bigIntSqrt(n);
    const factorPowers = extractPrimePowersForPocklington(nMinus1, sqrtN, depth === 0 ? 85 : 35);
    const entries: Array<{ q: bigint; pow: number; subCert: PrimalityCertificate }> = [];
    let F = 1n;

    for (const [q, pow] of factorPowers.entries()) {
      const subCert = generatePrimalityCertificate(q, depth + 1);
      if (subCert.isPrime && subCert.isProvenDeterministic) {
        entries.push({ q, pow, subCert });
        for (let i = 0; i < pow; i++) F *= q;
      }
    }

    if (F > sqrtN && entries.length > 0) {
      const witnesses: PocklingtonWitnessEntry[] = [];
      let allWitnessesFound = true;
      for (const { q, pow, subCert } of entries) {
        let foundA: bigint | null = null;
        for (let aCandidate = 2n; aCandidate <= 97n; aCandidate++) {
          if (modPow(aCandidate, nMinus1, n) !== 1n) {
            allWitnessesFound = false;
            break;
          }
          const g = gcd(modPow(aCandidate, nMinus1 / q, n) - 1n, n);
          if (g === 1n) {
            foundA = aCandidate;
            break;
          }
        }
        if (!foundA) {
          allWitnessesFound = false;
          break;
        }
        witnesses.push({
          primeQ: q.toString(),
          powerInNMinus1: pow,
          primeCertStrength: subCert.strength,
          baseA: foundA.toString(),
          fermatCheckPassed: true,
          gcdCheckPassed: true,
          subCert
        });
      }

      if (allWitnessesFound) {
        const cofactorR = nMinus1 / F;
        return {
          n: n.toString(),
          nBits,
          isPrime: true,
          isProvenDeterministic: true,
          strength: 'pocklington-proven',
          theoremCitation: 'Pocklington (1914) Theorem: N-1 = F·R with F > sqrt(N) and verified prime witnesses a_i',
          summaryAr: `شهادة بوكلينغتون حتمية 100% (${nBits} بت): الجزء المفكك من N−1 هو F (${F.toString(2).length} بت) > √N مع شهود أولية موثقين لكل عامل أولي لـ F.`,
          summaryEn: `100% deterministic Pocklington (1914) primality proof (${nBits}-bit): factored part F > sqrt(N) with certified witnesses.`,
          mrWitnesses,
          lucasTrace,
          pocklingtonProof: {
            nMinus1: nMinus1.toString(),
            factoredPartF: F.toString(),
            cofactorR: cofactorR.toString(),
            thresholdSqrtN: sqrtN.toString(),
            fExceedsSqrtN: F > sqrtN,
            witnesses
          },
          generatedAt
        };
      }
    }
  }

  // Honest fallback for large primes where N-1 lacks smooth factored part > sqrt(N)
  return {
    n: n.toString(),
    nBits,
    isPrime: true,
    isProvenDeterministic: false,
    strength: 'bpsw-probabilistic',
    theoremCitation: 'Baillie-PSW (12-base Miller-Rabin + Selfridge Strong Lucas); no known counterexamples, not a deterministic proof above 2^64 without ECPP/Pocklington.',
    summaryAr: `أولي محتمل قوي جداً (Baillie-PSW + 12 قاعدة MR، ${nBits} بت) — ملاحظة أمانة علمية: هذا الاختبار احتمالي وليس برهاناً حتمياً لأن N−1 لم يتوفر له جزء مفكك F > √N ضمن الميزانية السريعة.`,
    summaryEn: `Strong probable prime (Baillie-PSW + 12 MR bases, ${nBits}-bit) — scientific honesty notice: probabilistic above 2^64 without full Pocklington F > sqrt(N) or ECPP.`,
    mrWitnesses,
    lucasTrace,
    generatedAt
  };
};

/**
 * Independently re-verifies any PrimalityCertificate by re-checking every modular arithmetic witness.
 */
export const verifyPrimalityCertificate = (
  cert: PrimalityCertificate
): { valid: boolean; reason: string; checksPerformed: number } => {
  let checksPerformed = 0;
  try {
    const n = BigInt(cert.n);
    if (!cert.isPrime) {
      if (cert.strength === 'composite' && cert.compositeWitness) {
        if (!cert.compositeWitness.startsWith('Lucas')) {
          const w = BigInt(cert.compositeWitness);
          checksPerformed++;
          if (w > 1n && w < n && n % w === 0n) {
            return { valid: true, reason: `Verified divisor witness ${w.toString()} | N`, checksPerformed };
          }
          if (!mrSingleBase(n, w)) {
            return { valid: true, reason: `Verified Miller-Rabin compositeness witness a=${w.toString()}`, checksPerformed };
          }
        } else {
          const luc = strongLucasSelfridgeTest(n);
          checksPerformed++;
          if (!luc.passed) {
            return { valid: true, reason: `Verified Strong Lucas compositeness witness`, checksPerformed };
          }
        }
      }
      return { valid: n < 2n, reason: n < 2n ? 'Verified n < 2' : 'Unverified composite claim', checksPerformed };
    }

    // Re-check all recorded MR witnesses
    for (const w of cert.mrWitnesses) {
      checksPerformed++;
      const ok = mrSingleBase(n, BigInt(w.base));
      if (ok !== w.passed || !ok) {
        return { valid: false, reason: `MR witness check failed at base ${w.base}`, checksPerformed };
      }
    }

    if (cert.strength === 'small-trial-exact') {
      const rt = bigIntSqrt(n);
      if (n > 1000000n) return { valid: false, reason: 'small-trial-exact out of range', checksPerformed };
      for (let d = 2n; d <= rt; d++) {
        checksPerformed++;
        if (n % d === 0n) return { valid: false, reason: `Divisor ${d} found`, checksPerformed };
      }
      return { valid: true, reason: 'Exact trial division certificate re-verified', checksPerformed };
    }

    if (cert.strength === 'deterministic-64b') {
      if (n >= (1n << 64n)) {
        return { valid: false, reason: 'deterministic-64b claim invalid for N >= 2^64', checksPerformed };
      }
      for (const b of DETERMINISTIC_64B_BASES) {
        checksPerformed++;
        if (!mrSingleBase(n, b)) {
          return { valid: false, reason: `Missing or failed base ${b.toString()}`, checksPerformed };
        }
      }
      return { valid: true, reason: 'All 12 Sorenson-Webster 64-bit bases verified', checksPerformed };
    }

    if (cert.strength === 'pocklington-proven') {
      const proof = cert.pocklingtonProof;
      if (!proof) return { valid: false, reason: 'Missing Pocklington proof payload', checksPerformed };
      const nMinus1 = n - 1n;
      const F = BigInt(proof.factoredPartF);
      const R = BigInt(proof.cofactorR);
      const sqrtN = bigIntSqrt(n);
      checksPerformed += 2;
      if (F * R !== nMinus1 || F <= sqrtN) {
        return { valid: false, reason: 'Pocklington identity F*R = N-1 or F > sqrt(N) failed', checksPerformed };
      }
      let prodF = 1n;
      for (const w of proof.witnesses) {
        const q = BigInt(w.primeQ);
        const a = BigInt(w.baseA);
        if (w.subCert) {
          const subRes = verifyPrimalityCertificate(w.subCert);
          checksPerformed += subRes.checksPerformed;
          if (!subRes.valid || !w.subCert.isPrime || !w.subCert.isProvenDeterministic) {
            return { valid: false, reason: `Sub-certificate failed for prime factor q=${q.toString()}`, checksPerformed };
          }
        } else if (q >= (1n << 64n)) {
          return { valid: false, reason: `Missing recursive certificate for large q=${q.toString()}`, checksPerformed };
        }
        checksPerformed += 2;
        if (modPow(a, nMinus1, n) !== 1n) {
          return { valid: false, reason: `Fermat check failed for witness a=${a.toString()}`, checksPerformed };
        }
        if (gcd(modPow(a, nMinus1 / q, n) - 1n, n) !== 1n) {
          return { valid: false, reason: `Pocklington gcd check failed for q=${q.toString()}, a=${a.toString()}`, checksPerformed };
        }
        for (let k = 0; k < w.powerInNMinus1; k++) prodF *= q;
      }
      if (prodF !== F) {
        return { valid: false, reason: 'Witness primes product does not equal F', checksPerformed };
      }
      return { valid: true, reason: `Pocklington proof re-verified (${proof.witnesses.length} certified prime factors of N-1)`, checksPerformed };
    }

    if (cert.strength === 'bpsw-probabilistic') {
      const luc = strongLucasSelfridgeTest(n);
      checksPerformed++;
      if (!luc.passed) {
        return { valid: false, reason: 'Strong Lucas Selfridge check failed', checksPerformed };
      }
      return { valid: true, reason: 'Baillie-PSW (12 MR bases + Strong Lucas) trace re-verified (probabilistic)', checksPerformed };
    }

    return { valid: false, reason: 'Unsupported certificate strength', checksPerformed };
  } catch (err: any) {
    return { valid: false, reason: err?.message || 'Certificate verification error', checksPerformed };
  }
};
