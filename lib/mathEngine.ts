export const RIEMANN_ZEROS = [
  14.13472514, 21.02203964, 25.01085758, 30.42487613, 32.93506159,
  37.58617816, 40.91871901, 43.32707328, 48.00515088, 49.77383248,
  52.97032148, 56.44624770, 59.34704400, 60.83177852, 65.11254405,
  67.07981053, 69.54640171, 72.06715767, 75.70469070, 77.14484007
];

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
  if (mod === 1n) return 0n;
  let res = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if ((exp & 1n) === 1n) res = (res * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return res;
};

export const bigIntSqrt = (n: bigint): bigint => {
  if (n < 0n) return 0n;
  if (n < 2n) return n;
  let x0 = n >> 1n;
  let x1 = (x0 + n / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) >> 1n;
  }
  return x0;
};

export const isProbablePrimeBig = (n: bigint, rounds = 16): boolean => {
  if (n < 2n) return false;
  if (n === 2n || n === 3n || n === 5n || n === 7n) return true;
  if ((n & 1n) === 0n) return false;

  const small = [3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
  for (const p of small) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }

  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }

  const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n];
  for (let i = 0; i < Math.min(rounds, bases.length); i++) {
    const a = bases[i];
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

export type MatrixClassification =
  | 'UNIT'
  | 'PRIME'
  | 'DISTINCT_SEMIPRIME'
  | 'PRIME_SQUARE'
  | 'GENERAL_COMPOSITE'
  | 'ESCALATE_CHRONOS_V4';

export interface FactorizationTraceStep {
  stage: string;
  detailAr: string;
  detailFr: string;
  elapsedMs: number;
}

export interface PrimeExponent {
  prime: string;
  power: number;
}

export interface QuickFactorResult {
  n: string;
  bits: number;
  classification: MatrixClassification;
  complete: boolean;
  factors: string[];
  exponents: PrimeExponent[];
  steps: FactorizationTraceStep[];
  matrixCoordinateLabelAr: string;
  matrixCoordinateLabelFr: string;
  blockPair?: { p: string; q: string };
}

const fermatSplit = (n: bigint, maxSteps = 45000): bigint | null => {
  if ((n & 1n) === 0n) return 2n;
  const r0 = bigIntSqrt(n);
  if (r0 * r0 === n) return r0;
  let x = r0 + 1n;
  for (let i = 0; i < maxSteps; i++) {
    const diff = x * x - n;
    const y = bigIntSqrt(diff);
    if (y * y === diff) {
      const f = x - y;
      if (f > 1n && f < n) return f;
    }
    x += 1n;
  }
  return null;
};

const brentRhoSplit = (n: bigint, maxSteps = 220000): bigint | null => {
  if ((n & 1n) === 0n) return 2n;
  for (let seed = 1n; seed <= 5n; seed++) {
    let y = seed * 3n + 2n;
    const c = seed * 7n + 1n;
    const m = 128;
    let g = 1n;
    let r = 1;
    let q = 1n;
    let x = y;
    let ys = y;
    let steps = 0;

    while (g === 1n && steps < maxSteps) {
      x = y;
      for (let i = 0; i < r; i++) y = (y * y + c) % n;
      let k = 0;
      while (k < r && g === 1n && steps < maxSteps) {
        ys = y;
        const lim = Math.min(m, r - k);
        for (let i = 0; i < lim; i++) {
          y = (y * y + c) % n;
          const diff = x > y ? x - y : y - x;
          q = (q * diff) % n;
          steps++;
        }
        g = gcdBig(q, n);
        k += m;
      }
      r <<= 1;
    }

    if (g === n) {
      do {
        ys = (ys * ys + c) % n;
        const diff = x > ys ? x - ys : ys - x;
        g = gcdBig(diff, n);
        steps++;
      } while (g === 1n && steps < maxSteps + 3000);
    }

    if (g > 1n && g < n) return g;
  }
  return null;
};

export const classifyFactorsForMatrix = (
  nBig: bigint,
  sortedPrimes: bigint[],
  complete: boolean
): {
  classification: MatrixClassification;
  exponents: PrimeExponent[];
  labelAr: string;
  labelFr: string;
  blockPair?: { p: string; q: string };
} => {
  if (nBig <= 1n) {
    return {
      classification: 'UNIT',
      exponents: [],
      labelAr: 'عنصر محايد (غير مصنّف)',
      labelFr: 'Élément unitaire'
    };
  }

  const counts = new Map<string, number>();
  for (const p of sortedPrimes) {
    const key = p.toString();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const exponents: PrimeExponent[] = Array.from(counts.entries()).map(([prime, power]) => ({ prime, power }));

  if (!complete) {
    return {
      classification: 'ESCALATE_CHRONOS_V4',
      exponents,
      labelAr: `يحتاج تفكيكاً عميقاً عبر عمال Chronos v4 (${nBig.toString(2).length} بت)`,
      labelFr: `Nécessite Chronos v4 Web Workers (${nBig.toString(2).length} bits)`
    };
  }

  if (sortedPrimes.length === 1) {
    const pStr = sortedPrimes[0].toString();
    return {
      classification: 'PRIME',
      exponents,
      labelAr: `عدد أولي في العمود الأول U_{${pStr}, 1} = ${pStr}`,
      labelFr: `Premier dans la colonne U_{${pStr}, 1} = ${pStr}`
    };
  }

  if (sortedPrimes.length === 2) {
    const [p, q] = sortedPrimes;
    if (p === q) {
      return {
        classification: 'PRIME_SQUARE',
        exponents,
        blockPair: { p: p.toString(), q: q.toString() },
        labelAr: `مربع أولي قطري في الكتلة القطرية M_{${p}, ${p}} (p = √N)`,
        labelFr: `Carré premier diagonal M_{${p}, ${p}} (p = √N)`
      };
    }
    return {
      classification: 'DISTINCT_SEMIPRIME',
      exponents,
      blockPair: { p: p.toString(), q: q.toString() },
      labelAr: `شبه أولي مميز في الكتلة الوحيدة M_{${p}, ${q}} (p ≤ q)`,
      labelFr: `Semi-premier distinct dans le bloc M_{${p}, ${q}} (p ≤ q)`
    };
  }

  return {
    classification: 'GENERAL_COMPOSITE',
    exponents,
    labelAr: `مركب عام يظهر كمسار متعدد الكتل في المصفوفة اللانهائية M_∞ (${sortedPrimes.length} عوامل أولية)`,
    labelFr: `Composé général formant un chemin multi-blocs dans M_∞ (${sortedPrimes.length} facteurs)`
  };
};

export const factorizeQuickWithTrace = (nInput: bigint): QuickFactorResult => {
  const t0 = performance.now();
  const steps: FactorizationTraceStep[] = [];
  const nBits = nInput > 0n ? nInput.toString(2).length : 0;

  if (nInput < 2n) {
    return {
      n: nInput.toString(),
      bits: nBits,
      classification: 'UNIT',
      complete: true,
      factors: [],
      exponents: [],
      steps: [{
        stage: 'Validation',
        detailAr: 'العدد أصغر من 2 ولا يقبل التفكيك الأولي.',
        detailFr: 'Entier inférieur à 2.',
        elapsedMs: 0
      }],
      matrixCoordinateLabelAr: 'خارج مجال الأعداد الأولية',
      matrixCoordinateLabelFr: 'Hors domaine premier'
    };
  }

  // Stage 1: Miller-Rabin primality gate
  if (isProbablePrimeBig(nInput, 16)) {
    steps.push({
      stage: 'Miller-Rabin',
      detailAr: `اجتاز العدد اختبار Miller-Rabin (16 قاعدة) فهو أولي مؤكد في العمود c=1.`,
      detailFr: `Test Miller-Rabin positif (16 bases) : nombre premier (c=1).`,
      elapsedMs: Number((performance.now() - t0).toFixed(2))
    });
    const cls = classifyFactorsForMatrix(nInput, [nInput], true);
    return {
      n: nInput.toString(),
      bits: nBits,
      classification: cls.classification,
      complete: true,
      factors: [nInput.toString()],
      exponents: cls.exponents,
      steps,
      matrixCoordinateLabelAr: cls.labelAr,
      matrixCoordinateLabelFr: cls.labelFr
    };
  }

  steps.push({
    stage: 'Miller-Rabin',
    detailAr: `عدد مركب (${nBits} بت). بدء القسمة الأولية وفحص فيرما وبرنت.`,
    detailFr: `Entier composé (${nBits} bits). Lancement division, Fermat et Brent.`,
    elapsedMs: Number((performance.now() - t0).toFixed(2))
  });

  const queue: bigint[] = [nInput];
  const primeFactors: bigint[] = [];
  let complete = true;

  // Stage 2: Trial division up to 1009
  const smallSieve = new Uint8Array(1010);
  const smallPrimes: bigint[] = [];
  for (let i = 2; i <= 1009; i++) {
    if (!smallSieve[i]) {
      smallPrimes.push(BigInt(i));
      for (let j = i * i; j <= 1009; j += i) smallSieve[j] = 1;
    }
  }

  let remRoot = queue.pop()!;
  let trialExtracted = 0;
  for (const sp of smallPrimes) {
    while (remRoot % sp === 0n) {
      primeFactors.push(sp);
      remRoot /= sp;
      trialExtracted++;
    }
    if (remRoot === 1n) break;
  }
  if (trialExtracted > 0) {
    steps.push({
      stage: 'Trial Division',
      detailAr: `استخراج ${trialExtracted} عامل أولي صغير (≤ 1009)، المتبقي = ${remRoot.toString().slice(0, 24)}${remRoot.toString().length > 24 ? '...' : ''}.`,
      detailFr: `${trialExtracted} petit(s) facteur(s) extraits (≤ 1009).`,
      elapsedMs: Number((performance.now() - t0).toFixed(2))
    });
  }
  if (remRoot > 1n) queue.push(remRoot);

  // Stage 3: Fermat + Pollard-Brent loop on remaining components (safe quick budget <= 78 bits)
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (cur <= 1n) continue;
    if (isProbablePrimeBig(cur, 16)) {
      primeFactors.push(cur);
      continue;
    }

    // Fermat check (fast even for huge bit sizes if factors are close or square)
    const fSplit = fermatSplit(cur, cur.toString(2).length > 100 ? 500 : 40000);
    if (fSplit && fSplit > 1n && fSplit < cur) {
      steps.push({
        stage: 'Fermat',
        detailAr: `فرق المربعات لفيرما عزل القاسم ${fSplit.toString()} × ${(cur / fSplit).toString()}.`,
        detailFr: `Fermat a isolé ${fSplit.toString()} × ${(cur / fSplit).toString()}.`,
        elapsedMs: Number((performance.now() - t0).toFixed(2))
      });
      queue.push(fSplit, cur / fSplit);
      continue;
    }

    const curBits = cur.toString(2).length;
    if (curBits <= 76) {
      const bSplit = brentRhoSplit(cur, 200000);
      if (bSplit && bSplit > 1n && bSplit < cur) {
        steps.push({
          stage: "Pollard's Rho (Brent)",
          detailAr: `خوارزمية برنت التدويرية عزلت القاسم ${bSplit.toString()} في ${(performance.now() - t0).toFixed(1)} ms.`,
          detailFr: `Pollard-Brent a isolé ${bSplit.toString()}.`,
          elapsedMs: Number((performance.now() - t0).toFixed(2))
        });
        queue.push(bSplit, cur / bSplit);
        continue;
      }
    }

    // Exceeded synchronous quick budget: hand off cleanly to Chronos v4 Web Worker Pool
    complete = false;
    steps.push({
      stage: 'Escalate → Chronos v4',
      detailAr: `المتبقي بحجم ${curBits} بت يتجاوز الميزانية المتزامنة السريعة؛ جاهز للتفكيك المتوازي عبر SIQS + Block Wiedemann + ECM.`,
      detailFr: `Reste de ${curBits} bits prêt pour le moteur parallèle Chronos v4.`,
      elapsedMs: Number((performance.now() - t0).toFixed(2))
    });
    break;
  }

  const sorted = primeFactors.sort((a, b) => (a < b ? -1 : 1));
  const cls = classifyFactorsForMatrix(nInput, sorted, complete);

  return {
    n: nInput.toString(),
    bits: nBits,
    classification: cls.classification,
    complete,
    factors: sorted.map(v => v.toString()),
    exponents: cls.exponents,
    steps,
    matrixCoordinateLabelAr: cls.labelAr,
    matrixCoordinateLabelFr: cls.labelFr,
    blockPair: cls.blockPair
  };
};

// Sieve primes & Mobius function mu(k) up to limit
export const sievePrimesAndMobius = (limit: number): { primes: number[]; isPrime: Uint8Array; mu: Int8Array } => {
  const isPrime = new Uint8Array(limit + 1);
  isPrime.fill(1);
  isPrime[0] = 0;
  isPrime[1] = 0;

  const mu = new Int8Array(limit + 1);
  mu[1] = 1;
  const primes: number[] = [];
  const lpf = new Int32Array(limit + 1);

  for (let i = 2; i <= limit; i++) {
    if (isPrime[i]) {
      primes.push(i);
      lpf[i] = i;
      mu[i] = -1;
    }
    for (let j = 0; j < primes.length; j++) {
      const p = primes[j];
      const next = i * p;
      if (next > limit) break;
      isPrime[next] = 0;
      lpf[next] = p;
      if (i % p === 0) {
        mu[next] = 0;
        break;
      } else {
        mu[next] = (-mu[i]) as -1 | 0 | 1;
      }
    }
  }
  return { primes, isPrime, mu };
};

export interface DirichletSample {
  s: number;
  primeTerm: number;       // P(s - 1)
  semiprimeTerm: number;   // 0.5 * (P(s - 1)^2 + P(2s - 2))
  totalD: number;          // D(s)
}

export const computeDirichletSpectrum = (primeCutoff = 300): DirichletSample[] => {
  const { primes } = sievePrimesAndMobius(primeCutoff);
  const samples: DirichletSample[] = [];

  for (let s = 2.08; s <= 3.85; s += 0.08) {
    let pSm1 = 0;
    let p2Sm2 = 0;
    for (const p of primes) {
      pSm1 += Math.pow(p, -(s - 1));
      p2Sm2 += Math.pow(p, -(2 * s - 2));
    }
    const semiprimeTerm = 0.5 * (pSm1 * pSm1 + p2Sm2);
    samples.push({
      s: Number(s.toFixed(2)),
      primeTerm: Number(pSm1.toFixed(4)),
      semiprimeTerm: Number(semiprimeTerm.toFixed(4)),
      totalD: Number((pSm1 + semiprimeTerm).toFixed(4))
    });
  }
  return samples;
};

// Logarithmic integral li(x) via Ramanujan / series expansion for x >= 2
const logIntegral = (x: number): number => {
  if (x <= 1.05) return 0;
  const u = Math.log(x);
  let sum = 0.5772156649015329 + Math.log(u);
  let term = u;
  for (let n = 1; n <= 25; n++) {
    sum += term / n;
    term = (term * u) / (n + 1);
  }
  return sum;
};

export interface ZetaCountingPoint {
  x: number;
  piActual: number;
  pi2Actual: number;
  riemannApprox: number;
  semiprimeApprox: number;
}

export const computePrimeCountingComparison = (
  maxX: number,
  zeroCount: number,
  mobiusDepth: number
): ZetaCountingPoint[] => {
  const cappedX = Math.max(40, Math.min(600, maxX));
  const { primes, isPrime, mu } = sievePrimesAndMobius(cappedX);

  // Precompute semiprimes <= cappedX
  const isSemiprime = new Uint8Array(cappedX + 1);
  for (let i = 0; i < primes.length; i++) {
    for (let j = i; j < primes.length; j++) {
      const prod = primes[i] * primes[j];
      if (prod > cappedX) break;
      isSemiprime[prod] = 1;
    }
  }

  const piCum = new Int32Array(cappedX + 1);
  const pi2Cum = new Int32Array(cappedX + 1);
  for (let i = 2; i <= cappedX; i++) {
    piCum[i] = piCum[i - 1] + isPrime[i];
    pi2Cum[i] = pi2Cum[i - 1] + isSemiprime[i];
  }

  const points: ZetaCountingPoint[] = [];
  const step = Math.max(2, Math.floor(cappedX / 45));

  for (let x = 10; x <= cappedX; x += step) {
    // R(x) = sum_{k=1..mobiusDepth} (mu(k)/k) * li(x^(1/k))
    let rVal = 0;
    const logX = Math.log(x);
    for (let k = 1; k <= Math.max(1, mobiusDepth); k++) {
      const mk = mu[k];
      if (mk === 0) continue;
      const rootX = Math.pow(x, 1 / k);
      if (rootX >= 2) {
        rVal += (mk / k) * logIntegral(rootX);
      }
    }

    // Oscillatory Riemann zeros correction on J(x) projected into pi(x)
    let osc = 0;
    const sqrtX = Math.sqrt(x);
    const activeZeros = Math.min(zeroCount, RIEMANN_ZEROS.length);
    for (let idx = 0; idx < activeZeros; idx++) {
      const gamma = RIEMANN_ZEROS[idx];
      const mag = Math.sqrt(0.25 + gamma * gamma);
      const phase = Math.atan2(gamma, 0.5);
      osc -= (2 * sqrtX * Math.cos(gamma * logX - phase)) / (mag * Math.max(1.1, logX));
    }

    const riemannApprox = Math.max(0, rVal + osc * 0.45);
    // Asymptotic semiprime counting pi_2(x) ~ (x / ln x) * ln(ln x) calibrated cleanly
    const llx = Math.log(Math.max(2.72, logX));
    const semiprimeApprox = Math.max(0, (x / logX) * (llx + 0.261497));

    points.push({
      x,
      piActual: piCum[x],
      pi2Actual: pi2Cum[x],
      riemannApprox: Number(riemannApprox.toFixed(2)),
      semiprimeApprox: Number(semiprimeApprox.toFixed(2))
    });
  }

  return points;
};
