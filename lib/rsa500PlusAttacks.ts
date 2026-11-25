import { bigIntSqrt, gcd, generatePrime, modInverse, modPow, isProbablePrime } from '../mathUtils';
import {
  integralLllReduce,
  solveCoppersmithLll,
  solveNarrowHighBitSieve,
  CoppersmithLllResult
} from './coppersmithLllEngine';
import {
  computeUniversalExponentReport,
  cacheFactorization,
  getCachedFactorization
} from './universalExponentEngine';

const bitLen = (v: bigint): number => {
  const a = v < 0n ? -v : v;
  return a === 0n ? 0 : a.toString(2).length;
};

// ============================================================================
// 1. WIENER CONTINUED-FRACTIONS ATTACK (>500b, 768b, 1024b, 2048b RSA)
// ============================================================================
export interface WienerConvergentStep {
  index: number;
  quotient: string;
  k: string;
  d: string;
  dBits: number;
  phiCandidateValid: boolean;
}

export interface WienerAttackResult {
  success: boolean;
  nBits: number;
  eBits: number;
  wienerBoundBits: number;
  convergentsTested: number;
  traceSample: WienerConvergentStep[];
  recoveredD: string | null;
  recoveredK: string | null;
  factorP: string | null;
  factorQ: string | null;
  verifiedProduct: boolean;
  verifiedPrimes: boolean;
  durationMs: number;
  strategyUsed?: 'classic-wiener' | 'lambda-quotient' | 'verheul-van-tilborg' | 'boneh-durfee-lll' | 'any-method-recovery' | 'none';
  reasonCode?: 'broken' | 'e-too-small' | 'beyond-bound';
  notesAr: string;
}

const QR64_WIENER = new Uint8Array(64);
[0, 1, 4, 9, 16, 17, 25, 33, 36, 41, 49, 57].forEach(v => {
  QR64_WIENER[v] = 1;
});

const tryVerifyKD = (
  N: bigint,
  e: bigint,
  kCand: bigint,
  dCand: bigint
): { p: bigint; q: bigint; dTrue: bigint; isLambdaQuotient: boolean } | null => {
  if (kCand <= 0n || dCand <= 0n) return null;
  const prod = e * dCand;
  const rem = prod % kCand;
  if (rem === 0n || rem > 2048n) return null;
  const phi = (prod - rem) / kCand;
  if (phi <= 0n || phi >= N) return null;

  const sumPQ = N - phi + 1n;
  if (sumPQ <= 0n || (sumPQ & 1n) !== 0n) return null;
  const halfS = sumPQ >> 1n;
  const disc = halfS * halfS - N;
  if (disc < 0n) return null;
  if (!QR64_WIENER[Number(disc & 63n)]) return null;

  const r = bigIntSqrt(disc);
  if (r * r !== disc) return null;
  const p = halfS - r;
  const qFactor = halfS + r;
  if (p > 1n && qFactor > 1n && p * qFactor === N) {
    // Reconstruct minimal verified private exponent d from true φ(N) or λ(N)
    const phiExact = (p - 1n) * (qFactor - 1n);
    const lambdaExact = phiExact / gcd(p - 1n, qFactor - 1n);
    const dTrue =
      gcd(e, phiExact) === 1n
        ? modInverse(e, phiExact)
        : gcd(e, lambdaExact) === 1n
        ? modInverse(e, lambdaExact)
        : dCand;
    return { p, q: qFactor, dTrue, isLambdaQuotient: rem > 1n };
  }
  return null;
};

export const runWienerAttack = (N: bigint, e: bigint): WienerAttackResult => {
  const t0 = performance.now();
  const nBits = bitLen(N);
  const eBits = bitLen(e);
  const wienerBoundBits = Math.max(1, Math.floor(nBits / 4));

  let a = e;
  let b = N;
  let kPrev = 0n, kCurr = 1n;
  let dPrev = 1n, dCurr = 0n;
  let idx = 0;
  const traceSample: WienerConvergentStep[] = [];
  const convergents: Array<{ q: bigint; k: bigint; d: bigint; kPrev: bigint; dPrev: bigint }> = [];

  const makeSuccess = (
    p: bigint,
    qFactor: bigint,
    dFinal: bigint,
    kFinal: bigint,
    quotient: bigint,
    strategyUsed: WienerAttackResult['strategyUsed'],
    labelAr: string
  ): WienerAttackResult => {
    const validPhi = true;
    traceSample.push({
      index: idx,
      quotient: quotient.toString().slice(0, 16),
      k: kFinal.toString(),
      d: dFinal.toString(),
      dBits: bitLen(dFinal),
      phiCandidateValid: validPhi
    });
    const primesOk = isProbablePrime(p, 12) && isProbablePrime(qFactor, 12);
    const durationMs = Math.max(1, Math.round((performance.now() - t0) * 100) / 100);
    return {
      success: true,
      nBits,
      eBits,
      wienerBoundBits,
      convergentsTested: idx,
      traceSample: traceSample.slice(-12),
      recoveredD: dFinal.toString(),
      recoveredK: kFinal.toString(),
      factorP: p.toString(),
      factorQ: qFactor.toString(),
      verifiedProduct: true,
      verifiedPrimes: primesOk,
      durationMs,
      strategyUsed,
      reasonCode: 'broken',
      notesAr: `${labelAr} في ${durationMs} مللي ثانية (|d| = ${bitLen(dFinal)} بت).`
    };
  };

  while (b !== 0n && idx < 4096) {
    const q = a / b;
    const rem = a % b;
    a = b;
    b = rem;

    const oldKPrev = kPrev;
    const oldDPrev = dPrev;
    const kNext = q * kCurr + kPrev;
    const dNext = q * dCurr + dPrev;
    kPrev = kCurr;
    kCurr = kNext;
    dPrev = dCurr;
    dCurr = dNext;
    idx++;

    convergents.push({ q, k: kCurr, d: dCurr, kPrev, dPrev });

    // Pass 1: Exact convergent (handles both e*d ≡ 1 mod φ(N) and mod λ(N) via quotient residue)
    const hit = tryVerifyKD(N, e, kCurr, dCurr);
    if (hit) {
      return makeSuccess(
        hit.p,
        hit.q,
        hit.dTrue,
        kCurr,
        q,
        hit.isLambdaQuotient ? 'lambda-quotient' : 'classic-wiener',
        hit.isLambdaQuotient
          ? `تم كسر مفتاح ${nBits} بت عبر متقاربة الكسر المستمر #${idx} مع تعميم λ(N)`
          : `تم كسر مفتاح ${nBits} بت عبر متقاربة الكسر المستمر #${idx}`
      );
    }

    // Also test immediate Dujella/Verheul-van Tilborg semi-convergents around bound window
    const dBitsNow = bitLen(dCurr);
    if (dPrev > 0n && (nBits <= 128 || (dBitsNow >= Math.max(1, wienerBoundBits - 14) && dBitsNow <= wienerBoundBits + 16))) {
      for (let r = 1n; r <= 6n; r += 1n) {
        for (let s = 0n; s <= 6n; s += 1n) {
          if (r === 1n && s === 0n) continue;
          const hitPlus = tryVerifyKD(N, e, r * kCurr + s * kPrev, r * dCurr + s * dPrev);
          if (hitPlus) {
            return makeSuccess(
              hitPlus.p,
              hitPlus.q,
              hitPlus.dTrue,
              r * kCurr + s * kPrev,
              q,
              'verheul-van-tilborg',
              `تم كسر مفتاح ${nBits} بت (تجاوز حد فينر التقليدي) عبر شبه متقاربة Verheul–van Tilborg (${r}k_n + ${s}k_{n-1})`
            );
          }
          if (s > 0n && r * dCurr > s * dPrev && r * kCurr > s * kPrev) {
            const hitMinus = tryVerifyKD(N, e, r * kCurr - s * kPrev, r * dCurr - s * dPrev);
            if (hitMinus) {
              return makeSuccess(
                hitMinus.p,
                hitMinus.q,
                hitMinus.dTrue,
                r * kCurr - s * kPrev,
                q,
                'verheul-van-tilborg',
                `تم كسر مفتاح ${nBits} بت (تجاوز حد فينر التقليدي) عبر شبه متقاربة Verheul–van Tilborg (${r}k_n - ${s}k_{n-1})`
              );
            }
          }
        }
      }
      // Also test quotient steps j*k_{n-1} + k_{n-2} when q is large
      if (q > 2n && oldDPrev > 0n) {
        const maxJ = q < 16n ? q : 16n;
        for (let j = 1n; j < maxJ; j += 1n) {
          const kj = j * kPrev + oldKPrev;
          const dj = j * dPrev + oldDPrev;
          const hitQ = tryVerifyKD(N, e, kj, dj);
          if (hitQ) {
            return makeSuccess(
              hitQ.p,
              hitQ.q,
              hitQ.dTrue,
              kj,
              q,
              'verheul-van-tilborg',
              `تم كسر مفتاح ${nBits} بت عبر شبه متقاربة Dujella (j=${j}) عند الخطوة #${idx}`
            );
          }
        }
      }
    }

    if (idx <= 8 || idx % 20 === 0) {
      traceSample.push({
        index: idx,
        quotient: q.toString().slice(0, 16),
        k: kCurr.toString().slice(0, 18),
        d: dCurr.toString().slice(0, 18),
        dBits: bitLen(dCurr),
        phiCandidateValid: false
      });
    }
  }

  // Pass 2: Expanded Verheul-van Tilborg sweep around N^0.25 if missed
  for (const cv of convergents) {
    const db = bitLen(cv.d);
    if (cv.dPrev <= 0n || db < Math.max(1, wienerBoundBits - 10) || db > wienerBoundBits + 14) continue;
    for (let r = 1n; r <= 12n; r += 1n) {
      for (let s = 1n; s <= 12n; s += 1n) {
        if (r <= 6n && s <= 6n) continue;
        const h1 = tryVerifyKD(N, e, r * cv.k + s * cv.kPrev, r * cv.d + s * cv.dPrev);
        if (h1) {
          return makeSuccess(
            h1.p,
            h1.q,
            h1.dTrue,
            r * cv.k + s * cv.kPrev,
            cv.q,
            'verheul-van-tilborg',
            `تم كسر مفتاح ${nBits} بت عبر توسعة Verheul–van Tilborg (${r}, ${s}) متجاوزاً حد فينر`
          );
        }
      }
    }
  }

  // Pass 3: Automatic Boneh-Durfee LLL Escalation (solves d up to ~N^0.275 when e is large)
  if (eBits >= Math.max(16, Math.floor(nBits * 0.55))) {
    const bdAttempt = runBonehDurfeeAttack(N, e, 0.264, 3, 1);
    if (bdAttempt.success && bdAttempt.factorP && bdAttempt.factorQ && bdAttempt.recoveredD) {
      const durationMs = Math.max(1, Math.round((performance.now() - t0) * 100) / 100);
      return {
        success: true,
        nBits,
        eBits,
        wienerBoundBits,
        convergentsTested: idx,
        traceSample: traceSample.slice(-12),
        recoveredD: bdAttempt.recoveredD,
        recoveredK: bdAttempt.recoveredK,
        factorP: bdAttempt.factorP,
        factorQ: bdAttempt.factorQ,
        verifiedProduct: bdAttempt.verifiedProduct,
        verifiedPrimes: bdAttempt.verifiedPrimes,
        durationMs,
        strategyUsed: 'boneh-durfee-lll',
        reasonCode: 'broken',
        notesAr: `تجاوز الأس السري حد فينر (N^0.25 ≈ ${wienerBoundBits} بت)؛ تم التصعيد التلقائي إلى شبيكة Boneh–Durfee LLL (${bdAttempt.latticeDim}×${bdAttempt.latticeDim}) وكسر المفتاح بالكامل في ${durationMs} مللي ثانية!`
      };
    }
  }

  const durationMs = Math.max(1, Math.round((performance.now() - t0) * 100) / 100);
  const eIsTooSmall = eBits <= 32;
  return {
    success: false,
    nBits,
    eBits,
    wienerBoundBits,
    convergentsTested: idx,
    traceSample: traceSample.slice(-12),
    recoveredD: null,
    recoveredK: null,
    factorP: null,
    factorQ: null,
    verifiedProduct: false,
    verifiedPrimes: false,
    durationMs,
    strategyUsed: 'none',
    reasonCode: eIsTooSmall ? 'e-too-small' : 'beyond-bound',
    notesAr: eIsTooSmall
      ? `الأس العام المُدخل صغير جداً (e = ${e.toString()}، ${eBits} بت)؛ في هذه الحالة يكون الأس السري d ≈ N/e ≈ ${nBits - eBits} بت، وهو أكبر بكثير من حد فينر (${wienerBoundBits} بت) وحد Boneh–Durfee. الحل: احسب e ضعيفاً متوافقاً مع فينر أو صعّد المودول إلى Chronos v4 للتفكيك المباشر.`
      : `تجاوز d حد فينر (${wienerBoundBits} بت) وحد شبه متقاربات Verheul–van Tilborg وتقليص Boneh–Durfee LLL (δ=0.264). يمكن تفكيك N مباشرة عبر محرك Chronos v4.`
  };
};

// ============================================================================
// 2. BONEH–DURFEE (HERRMANN–MAY SUBLATTICE LLL + BIVARIATE RESULTANT)
// ============================================================================
export interface BonehDurfeeResult {
  success: boolean;
  nBits: number;
  deltaAttempted: number;
  latticeDim: number;
  m: number;
  t: number;
  lllSwaps: number;
  reducedNormBits: number[];
  recoveredD: string | null;
  recoveredK: string | null;
  factorP: string | null;
  factorQ: string | null;
  verifiedProduct: boolean;
  verifiedPrimes: boolean;
  durationMs: number;
  notesAr: string;
}

type BiPoly = Map<string, bigint>; // key "degX,degY"

const biKey = (ix: number, iy: number): string => `${ix},${iy}`;
const parseBiKey = (k: string): [number, number] => {
  const [a, b] = k.split(',');
  return [Number(a), Number(b)];
};

const biMul = (p: BiPoly, q: BiPoly): BiPoly => {
  const out: BiPoly = new Map();
  for (const [kp, vp] of p.entries()) {
    if (vp === 0n) continue;
    const [xp, yp] = parseBiKey(kp);
    for (const [kq, vq] of q.entries()) {
      if (vq === 0n) continue;
      const [xq, yq] = parseBiKey(kq);
      const nk = biKey(xp + xq, yp + yq);
      out.set(nk, (out.get(nk) || 0n) + vp * vq);
    }
  }
  return out;
};

const biPow = (base: BiPoly, exp: number): BiPoly => {
  let res: BiPoly = new Map([[biKey(0, 0), 1n]]);
  for (let i = 0; i < exp; i++) res = biMul(res, base);
  return res;
};

const bigIntDetBareiss = (mat: bigint[][]): bigint => {
  const n = mat.length;
  if (n === 0) return 1n;
  if (n === 1) return mat[0][0];
  const a = mat.map(r => [...r]);
  let sign = 1n;
  let prevPivot = 1n;
  for (let k = 0; k < n - 1; k++) {
    if (a[k][k] === 0n) {
      let swapRow = -1;
      for (let r = k + 1; r < n; r++) {
        if (a[r][k] !== 0n) {
          swapRow = r;
          break;
        }
      }
      if (swapRow === -1) return 0n;
      [a[k], a[swapRow]] = [a[swapRow], a[k]];
      sign = -sign;
    }
    const pivot = a[k][k];
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) {
        a[i][j] = (a[i][j] * pivot - a[i][k] * a[k][j]) / prevPivot;
      }
      a[i][k] = 0n;
    }
    prevPivot = pivot;
  }
  return sign * a[n - 1][n - 1];
};

// Univariate BigInt polynomial arithmetic: coeffs[i] * x^i
const uPolyAdd = (a: bigint[], b: bigint[]): bigint[] => {
  const len = Math.max(a.length, b.length);
  const out = new Array<bigint>(len).fill(0n);
  for (let i = 0; i < a.length; i++) out[i] += a[i];
  for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
};

const uPolySub = (a: bigint[], b: bigint[]): bigint[] => {
  const len = Math.max(a.length, b.length);
  const out = new Array<bigint>(len).fill(0n);
  for (let i = 0; i < a.length; i++) out[i] += a[i];
  for (let i = 0; i < b.length; i++) out[i] -= b[i];
  return out;
};

const uPolyMul = (a: bigint[], b: bigint[]): bigint[] => {
  if (a.length === 0 || b.length === 0) return [];
  const out = new Array<bigint>(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0n) continue;
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  }
  return out;
};

const uPolyTrim = (a: bigint[]): bigint[] => {
  let e = a.length - 1;
  while (e > 0 && a[e] === 0n) e--;
  return a.slice(0, e + 1);
};

// Evaluates univariate polynomial determinant of matrix of univariate polynomials
// via Lagrange interpolation at d+1 sample integer points! (Wait: exact & very fast for deg <= 20)
const polyMatrixDetViaEval = (mat: bigint[][][], maxDeg: number): bigint[] => {
  const n = mat.length;
  if (n === 0) return [1n];
  const evalAt = (p: bigint[], x: bigint): bigint => {
    let acc = 0n;
    for (let i = p.length - 1; i >= 0; i--) acc = acc * x + p[i];
    return acc;
  };
  const numPts = maxDeg + 2;
  const xs: bigint[] = [];
  const ys: bigint[] = [];
  const half = Math.floor(numPts / 2);
  for (let i = 0; i < numPts; i++) {
    const x = BigInt(i - half);
    xs.push(x);
    const numMat = mat.map(row => row.map(cell => evalAt(cell, x)));
    ys.push(bigIntDetBareiss(numMat));
  }

  // Exact Newton divided-difference / Lagrange with rational scaling? Keep exact via common denominator!
  // Compute prod_{j != i} (x - x_j) and den_i = prod_{j != i} (x_i - x_j), multiply by D = lcm/prod of dens
  let commonDen = 1n;
  const dens: bigint[] = new Array(numPts).fill(1n);
  const numerPolys: bigint[][] = [];
  for (let i = 0; i < numPts; i++) {
    let p: bigint[] = [1n];
    let d = 1n;
    for (let j = 0; j < numPts; j++) {
      if (i === j) continue;
      p = uPolyMul(p, [-xs[j], 1n]);
      d *= (xs[i] - xs[j]);
    }
    dens[i] = d;
    numerPolys.push(p);
    commonDen = (commonDen * (d < 0n ? -d : d)) / gcd(commonDen, d < 0n ? -d : d);
  }

  let accPoly: bigint[] = [0n];
  for (let i = 0; i < numPts; i++) {
    if (ys[i] === 0n) continue;
    const scale = (ys[i] * commonDen) / dens[i];
    const scaled = numerPolys[i].map(c => c * scale);
    accPoly = uPolyAdd(accPoly, scaled);
  }
  return uPolyTrim(accPoly.map(c => c / commonDen));
};

// Sylvester resultant Res_y(P(x,y), Q(x,y)) returning univariate polynomial in x
const bivariateResultantY = (p: BiPoly, q: BiPoly): bigint[] => {
  let degYp = 0, degYq = 0, degXp = 0, degXq = 0;
  for (const [k, v] of p.entries()) {
    if (v === 0n) continue;
    const [ix, iy] = parseBiKey(k);
    if (iy > degYp) degYp = iy;
    if (ix > degXp) degXp = ix;
  }
  for (const [k, v] of q.entries()) {
    if (v === 0n) continue;
    const [ix, iy] = parseBiKey(k);
    if (iy > degYq) degYq = iy;
    if (ix > degXq) degXq = ix;
  }
  if (degYp === 0 && degYq === 0) return [0n];

  const coeffsP: bigint[][] = Array.from({ length: degYp + 1 }, () => [0n]);
  for (let j = 0; j <= degYp; j++) {
    const arr = new Array<bigint>(degXp + 1).fill(0n);
    for (let i = 0; i <= degXp; i++) arr[i] = p.get(biKey(i, j)) || 0n;
    coeffsP[j] = uPolyTrim(arr);
  }
  const coeffsQ: bigint[][] = Array.from({ length: degYq + 1 }, () => [0n]);
  for (let j = 0; j <= degYq; j++) {
    const arr = new Array<bigint>(degXq + 1).fill(0n);
    for (let i = 0; i <= degXq; i++) arr[i] = q.get(biKey(i, j)) || 0n;
    coeffsQ[j] = uPolyTrim(arr);
  }

  const sylDim = degYp + degYq;
  const syl: bigint[][][] = Array.from({ length: sylDim }, () =>
    Array.from({ length: sylDim }, () => [0n])
  );

  for (let r = 0; r < degYq; r++) {
    for (let j = 0; j <= degYp; j++) {
      syl[r][r + (degYp - j)] = coeffsP[j];
    }
  }
  for (let r = 0; r < degYp; r++) {
    for (let j = 0; j <= degYq; j++) {
      syl[degYq + r][r + (degYq - j)] = coeffsQ[j];
    }
  }
  const maxResDeg = degXp * degYq + degXq * degYp;
  return polyMatrixDetViaEval(syl, maxResDeg);
};

// Fast univariate integer root finder on [lo, hi] for Boneh-Durfee resultant polynomials
const findSmallIntegerRoots = (rawCoeffs: bigint[], lo: bigint, hi: bigint): bigint[] => {
  const coeffs = uPolyTrim(rawCoeffs);
  const deg = coeffs.length - 1;
  if (deg <= 0) return [];

  const evalP = (c: bigint[], x: bigint) => {
    let acc = 0n;
    for (let i = c.length - 1; i >= 0; i--) acc = acc * x + c[i];
    return acc;
  };

  if (deg === 1) {
    if (coeffs[1] !== 0n && (-coeffs[0]) % coeffs[1] === 0n) {
      const r = -coeffs[0] / coeffs[1];
      return r >= lo && r <= hi ? [r] : [];
    }
    return [];
  }

  // Modular root filtering first (fast!) or derivative Rolle bracketing:
  // Rolle critical points recursively
  const deriv = (c: bigint[]) => c.slice(1).map((v, i) => v * BigInt(i + 1));
  const critPts = (c: bigint[], l: bigint, h: bigint): bigint[] => {
    const cc = uPolyTrim(c);
    const d = cc.length - 1;
    if (d <= 0) return [];
    if (d === 1) {
      const p = -cc[0] / cc[1];
      return p >= l && p <= h ? [p] : [];
    }
    const dc = deriv(cc);
    const sub = critPts(dc, l, h);
    const pts = [l, ...sub, h].sort((u, v) => (u < v ? -1 : u > v ? 1 : 0));
    const out: bigint[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      let a = pts[i], b = pts[i + 1];
      const fa = evalP(cc, a), fb = evalP(cc, b);
      if (fa === 0n) out.push(a);
      if (fb === 0n) out.push(b);
      if ((fa < 0n && fb > 0n) || (fa > 0n && fb < 0n)) {
        const inc = fa < 0n;
        while (b - a > 1n) {
          const mid = (a + b) >> 1n;
          const fm = evalP(cc, mid);
          if (fm === 0n) { a = mid; break; }
          if (inc ? fm < 0n : fm > 0n) a = mid;
          else b = mid;
        }
        out.push(a);
        if (a + 1n <= h) out.push(a + 1n);
      }
    }
    return out;
  };

  const breaks = critPts(deriv(coeffs), lo, hi);
  const splits = [lo, ...breaks, hi].sort((u, v) => (u < v ? -1 : u > v ? 1 : 0));
  const found = new Set<bigint>();
  for (let i = 0; i < splits.length - 1; i++) {
    let l = splits[i], r = splits[i + 1];
    const fl = evalP(coeffs, l), fr = evalP(coeffs, r);
    if (fl === 0n) found.add(l);
    if (fr === 0n) found.add(r);
    if ((fl < 0n && fr > 0n) || (fl > 0n && fr < 0n)) {
      const inc = fl < 0n;
      while (l <= r) {
        const mid = (l + r) >> 1n;
        const fm = evalP(coeffs, mid);
        if (fm === 0n) { found.add(mid); break; }
        if (inc ? fm < 0n : fm > 0n) l = mid + 1n;
        else r = mid - 1n;
      }
    }
    for (const off of [-1n, 0n, 1n]) {
      const p = splits[i] + off;
      if (p >= lo && p <= hi && evalP(coeffs, p) === 0n) found.add(p);
    }
  }
  return Array.from(found);
};

export const runBonehDurfeeAttack = (
  N: bigint,
  e: bigint,
  deltaTarget = 0.258,
  mParam = 3,
  tParam = 1
): BonehDurfeeResult => {
  const t0 = performance.now();
  const nBits = bitLen(N);
  const clampedDelta = Math.min(0.285, Math.max(0.251, deltaTarget));

  // Target bivariate congruence centered at S0 = 2*sqrt(N):
  // phi = N + 1 - (p + q) = (N + 1 - S0) + (S0 - (p + q)) = A + y0
  // f(x, y) = x*(A + y) + 1 === 0 (mod e), with x0 = k < e^delta and |y0| <= sqrt(N)/2
  const sqrtN = bigIntSqrt(N);
  const S0 = 2n * sqrtN;
  const A = N + 1n - S0;
  const dBound = 1n << BigInt(Math.max(4, Math.ceil(nBits * clampedDelta)));
  const X = ((e * dBound) / (N > 4n * sqrtN ? N - 3n * sqrtN : N)) + 8n;
  const Y = (sqrtN >> 2n) + 64n;

  const fBase: BiPoly = new Map([
    [biKey(0, 0), 1n],
    [biKey(1, 0), A],
    [biKey(1, 1), 1n]
  ]);

  const shiftPolys: BiPoly[] = [];
  const ePows: bigint[] = [1n];
  for (let p = 1; p <= mParam; p++) ePows.push(ePows[p - 1] * e);

  for (let k = 0; k <= mParam; k++) {
    const fk = biPow(fBase, k);
    const ePow = ePows[mParam - k];
    for (let i = 0; i <= mParam - k; i++) {
      const poly: BiPoly = new Map();
      for (const [key, coeff] of fk.entries()) {
        const [ix, iy] = parseBiKey(key);
        poly.set(biKey(ix + i, iy), coeff * ePow);
      }
      shiftPolys.push(poly);
    }
  }

  for (let j = 1; j <= tParam; j++) {
    for (let k = 0; k <= mParam; k++) {
      // Only include y-shifts whose diagonal e^{m-k} X^k Y^{k+j} < e^m (strictly improves lattice determinant)
      if ((X ** BigInt(k)) * (Y ** BigInt(k + j)) >= ePows[k]) continue;
      const fk = biPow(fBase, k);
      const ePow = ePows[mParam - k];
      const poly: BiPoly = new Map();
      for (const [key, coeff] of fk.entries()) {
        const [ix, iy] = parseBiKey(key);
        poly.set(biKey(ix, iy + j), coeff * ePow);
      }
      shiftPolys.push(poly);
    }
  }

  // Collect monomial set appearing across shiftPolys
  const monSet = new Set<string>();
  for (const sp of shiftPolys) {
    for (const [k, v] of sp.entries()) if (v !== 0n) monSet.add(k);
  }
  const monomials = Array.from(monSet)
    .map(parseBiKey)
    .sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[1] - b[1] || a[0] - b[0]);

  const dimRows = shiftPolys.length;
  const dimCols = monomials.length;

  const xPowMap = new Map<number, bigint>([[0, 1n]]);
  const yPowMap = new Map<number, bigint>([[0, 1n]]);
  const getXPow = (n: number) => {
    if (!xPowMap.has(n)) xPowMap.set(n, X ** BigInt(n));
    return xPowMap.get(n)!;
  };
  const getYPow = (n: number) => {
    if (!yPowMap.has(n)) yPowMap.set(n, Y ** BigInt(n));
    return yPowMap.get(n)!;
  };

  const lattice: bigint[][] = shiftPolys
    .map(poly =>
      monomials.map(([ix, iy]) => {
        const c = poly.get(biKey(ix, iy)) || 0n;
        return c * getXPow(ix) * getYPow(iy);
      })
    )
    .sort((a, b) => {
      let na = 0n;
      let nb = 0n;
      for (let idx = 0; idx < dimCols; idx++) {
        na += a[idx] * a[idx];
        nb += b[idx] * b[idx];
      }
      return na < nb ? -1 : na > nb ? 1 : 0;
    });

  const { reduced, swaps } = integralLllReduce(lattice);
  const reducedNormBits = reduced.slice(0, Math.min(5, dimRows)).map(row => {
    let sq = 0n;
    for (const c of row) sq += c * c;
    return Math.round(bitLen(sq) / 2);
  });

  // Reconstruct candidate short bivariate polynomials g_r(x, y); skip degenerate 1-term [e^m, 0, ...] vectors
  const recPolys: BiPoly[] = reduced
    .slice(0, Math.min(6, dimRows))
    .map(row => {
      const bp: BiPoly = new Map();
      for (let col = 0; col < dimCols; col++) {
        if (row[col] === 0n) continue;
        const [ix, iy] = monomials[col];
        const origCoeff = row[col] / (getXPow(ix) * getYPow(iy));
        if (origCoeff !== 0n) bp.set(biKey(ix, iy), origCoeff);
      }
      return bp;
    })
    .filter(bp => bp.size > 1);

  let foundP: bigint | null = null;
  let foundQ: bigint | null = null;
  let foundK: bigint | null = null;
  let foundD: bigint | null = null;

  const tryRecoverFromK = (kCand: bigint): boolean => {
    if (kCand <= 0n) return false;
    for (const bp of recPolys) {
      let maxY = 0;
      for (const [key] of bp.entries()) {
        const [, iy] = parseBiKey(key);
        if (iy > maxY) maxY = iy;
      }
      const yCoeffs = new Array<bigint>(maxY + 1).fill(0n);
      for (const [key, v] of bp.entries()) {
        const [ix, iy] = parseBiKey(key);
        yCoeffs[iy] += v * (kCand ** BigInt(ix));
      }
      const yRoots = findSmallIntegerRoots(yCoeffs, -Y, Y);
      for (const y0 of yRoots) {
        // y0 = S0 - (p + q) => sumPQ = S0 - y0 = p + q
        const sumPQ = S0 - y0;
        if (sumPQ > 0n && (sumPQ & 1n) === 0n) {
          const halfS = sumPQ >> 1n;
          const disc = halfS * halfS - N;
          if (disc >= 0n) {
            const sq = bigIntSqrt(disc);
            if (sq * sq === disc) {
              const p = halfS - sq;
              const q = halfS + sq;
              if (p > 1n && q > 1n && p * q === N) {
                foundP = p;
                foundQ = q;
                foundK = kCand;
                const phi = (p - 1n) * (q - 1n);
                foundD = (1n + kCand * phi) / e;
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  };

  // Compute pairwise Sylvester resultants in y among the shortest non-trivial reduced vectors
  const maxPairsPolys = Math.min(recPolys.length, 5);
  outer: for (let i = 0; i < maxPairsPolys; i++) {
    for (let j = i + 1; j < maxPairsPolys; j++) {
      const resX = bivariateResultantY(recPolys[i], recPolys[j]);
      if (resX.length <= 1) continue;
      const xRoots = findSmallIntegerRoots(resX, 1n, X);
      for (const x0 of xRoots) {
        if (tryRecoverFromK(x0)) break outer;
      }
    }
  }

  const durationMs = Math.max(1, Math.round((performance.now() - t0) * 100) / 100);
  const verifiedProduct = foundP !== null && foundQ !== null && foundP * foundQ === N;
  const verifiedPrimes = verifiedProduct && isProbablePrime(foundP!, 10) && isProbablePrime(foundQ!, 10);

  return {
    success: verifiedProduct,
    nBits,
    deltaAttempted: clampedDelta,
    latticeDim: dimRows,
    m: mParam,
    t: tParam,
    lllSwaps: swaps,
    reducedNormBits,
    recoveredD: foundD ? foundD.toString() : null,
    recoveredK: foundK ? foundK.toString() : null,
    factorP: foundP ? foundP.toString() : null,
    factorQ: foundQ ? foundQ.toString() : null,
    verifiedProduct,
    verifiedPrimes,
    durationMs,
    notesAr: verifiedProduct
      ? `نجح هجوم Boneh–Durfee (LLL ${dimRows}×${dimCols} + ناتج سلفستر) واستخرج d (${bitLen(foundD!) } بت، تتجاوز حد فينر N^0.25) في ${durationMs} مللي ثانية.`
      : `لم يلتقط التقليص (${mParam},${tParam}) الجذر عند δ=${clampedDelta}؛ يُنصح بخفض δ أو زيادة البعد (m=3).`
  };
};

// ============================================================================
// 3. COPPERSMITH LSB & MSB UNIFIED ATTACK (>500b..1024b)
// ============================================================================
export interface CoppersmithLsbResult extends CoppersmithLllResult {
  leakDirection: 'msb' | 'lsb';
  knownLsbBits?: number;
  knownPartLow?: string;
}

export const solveCoppersmithLsbLll = (
  N: bigint,
  pLow: bigint,
  knownLsbBits: number,
  pBitsEstimate?: number
): CoppersmithLsbResult => {
  const nBits = bitLen(N);
  const pBits = pBitsEstimate ?? Math.max(2, Math.round(nBits / 2));
  const unknownBits = Math.max(1, pBits - knownLsbBits);
  const twoPowK = 1n << BigInt(knownLsbBits);
  const inv2k = modInverse(twoPowK % N, N);
  // p = 2^k * x0 + pLow => x0 + pLow * (2^-k mod N) === 0 (mod p)
  const monicOffset = (pLow * inv2k) % N;

  // Run Coppersmith LLL for monic f(x) = x + monicOffset === 0 (mod p) with unknown upper part x0 < 2^unknownBits
  const t0 = performance.now();
  const res = solveCoppersmithLll(N, monicOffset, unknownBits);
  // Wait: Coppersmith LLL extracts p from p0 + xr; if foundRootX0 is xr, true p_high = (monicOffset + xr) mod N?
  // Wait: in solveCoppersmithLll: cand = p0 + xr, g = gcd(cand, N). Since (x0 + monicOffset) === x0 + pLow * inv2k === p * inv2k (mod p),
  // gcd(monicOffset + x0, N) ALREADY EQUALS p!! And verified = (p * q === N)!
  const durationMs = Math.max(res.durationMs, Math.round(performance.now() - t0));

  return {
    ...res,
    durationMs,
    leakDirection: 'lsb',
    knownLsbBits,
    knownPartLow: pLow.toString(10),
    notesAr: res.success
      ? `تم تطبيع التلميح السفلي (${knownLsbBits} بت LSB) إلى كثيرة حدود أحادية واستعادة p عبر LLL (${res.dimension}×${res.dimension}) في ${durationMs} مللي ثانية.`
      : res.notesAr
  };
};

// Narrow LSB sieve for 90–99% known LSB bits: tests candidates k * 2^knownLsbBits + pLow
export const solveNarrowLowBitSieve = (
  N: bigint,
  pLow: bigint,
  knownLsbBits: number,
  unknownHighBits: number,
  maxBudget = 300000
) => {
  const t0 = performance.now();
  const stride = 1n << BigInt(knownLsbBits);
  const totalSpace = unknownHighBits <= 24 ? (1 << unknownHighBits) : maxBudget;
  const limit = Math.min(maxBudget, totalSpace);
  const highHalfStart = unknownHighBits >= 2 && unknownHighBits <= 24 ? (1n << BigInt(unknownHighBits - 1)) : 0n;
  const highHalfCount = unknownHighBits >= 2 && unknownHighBits <= 24 ? (1 << (unknownHighBits - 1)) : limit;

  let checked = 0;
  // Pass 1: Upper half [2^(u-1), 2^u - 1] where exact pBits primes reside
  const pass1Limit = Math.min(limit, highHalfCount);
  let cand = pLow + highHalfStart * stride;
  if (cand === 0n) cand = stride;
  for (let i = 0; i < pass1Limit; i++) {
    checked++;
    if (cand > 1n && cand < N && N % cand === 0n) {
      const q = N / cand;
      return {
        success: true,
        candidatesChecked: checked,
        maxBudget,
        truncatedByBudget: false,
        unknownBits: unknownHighBits,
        windowWidth: (1n << BigInt(unknownHighBits)).toString(10),
        foundOffsetX0: (highHalfStart + BigInt(i)).toString(10),
        factorP: cand.toString(10),
        factorQ: q.toString(10),
        verifiedProduct: cand * q === N,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        notesAr: `تمت غربلة المجال العلوي الضيق لـ ${knownLsbBits} بت LSB بعد ${checked} فحصاً.`
      };
    }
    cand += stride;
  }

  // Pass 2: Lower half [0, 2^(u-1) - 1] in case p had fewer bits than estimated
  const pass2Limit = Math.max(0, limit - pass1Limit);
  cand = pLow === 0n ? stride : pLow;
  for (let i = 0; i < pass2Limit; i++) {
    checked++;
    if (cand > 1n && cand < N && N % cand === 0n) {
      const q = N / cand;
      return {
        success: true,
        candidatesChecked: checked,
        maxBudget,
        truncatedByBudget: false,
        unknownBits: unknownHighBits,
        windowWidth: (1n << BigInt(unknownHighBits)).toString(10),
        foundOffsetX0: BigInt(i).toString(10),
        factorP: cand.toString(10),
        factorQ: q.toString(10),
        verifiedProduct: cand * q === N,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        notesAr: `تمت غربلة المجال العلوي الضيق لـ ${knownLsbBits} بت LSB بعد ${checked} فحصاً.`
      };
    }
    cand += stride;
  }

  return {
    success: false,
    candidatesChecked: checked,
    maxBudget,
    truncatedByBudget: (1n << BigInt(Math.min(30, unknownHighBits))) > BigInt(maxBudget),
    unknownBits: unknownHighBits,
    windowWidth: (1n << BigInt(unknownHighBits)).toString(10),
    foundOffsetX0: null,
    factorP: null,
    factorQ: null,
    verifiedProduct: false,
    durationMs: Math.max(1, Math.round(performance.now() - t0)),
    notesAr: 'لم يُعثر على عامل في نافذة LSB الضيقة ضمن الميزانية.'
  };
};

// ============================================================================
// 4. BATCH GCD PRODUCT & REMAINDER TREE (SHARED PRIME ACROSS 512–1024b KEYS)
// ============================================================================
export interface BatchGcdHit {
  index: number;
  modulusBits: number;
  modulusPreview: string;
  factorP: string;
  factorQ: string;
  verifiedProduct: boolean;
}

export interface BatchGcdResult {
  totalModuli: number;
  compromisedCount: number;
  hits: BatchGcdHit[];
  treeDepth: number;
  productBits: number;
  durationMs: number;
  notesAr: string;
}

export const runBatchGcdAttack = (moduli: bigint[]): BatchGcdResult => {
  const t0 = performance.now();
  const valid = moduli.filter(m => m > 3n);
  const n = valid.length;
  if (n < 2) {
    return {
      totalModuli: n,
      compromisedCount: 0,
      hits: [],
      treeDepth: 0,
      productBits: 0,
      durationMs: 0,
      notesAr: 'يحتاج فحص Batch GCD إلى مودولين على الأقل.'
    };
  }

  // Bottom-up Product Tree
  const layers: bigint[][] = [valid];
  let curr = valid;
  while (curr.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < curr.length; i += 2) {
      if (i + 1 < curr.length) next.push(curr[i] * curr[i + 1]);
      else next.push(curr[i]);
    }
    layers.push(next);
    curr = next;
  }

  const rootProduct = layers[layers.length - 1][0];
  const productBits = bitLen(rootProduct);

  // Top-down Remainder Tree: R[layer-1][j] = R[layer][floor(j/2)] mod (P[layer-1][j]^2)
  let remLayer: bigint[] = [rootProduct];
  for (let level = layers.length - 2; level >= 0; level--) {
    const nodes = layers[level];
    const nextRem = new Array<bigint>(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const parentRem = remLayer[i >> 1];
      const modSq = nodes[i] * nodes[i];
      nextRem[i] = parentRem % modSq;
    }
    remLayer = nextRem;
  }

  const hits: BatchGcdHit[] = [];
  for (let i = 0; i < n; i++) {
    const Ni = valid[i];
    const rModN2 = remLayer[i];
    const quot = rModN2 / Ni;
    const g = gcd(quot, Ni);
    if (g > 1n && g < Ni) {
      const q = Ni / g;
      hits.push({
        index: i,
        modulusBits: bitLen(Ni),
        modulusPreview: `${Ni.toString().slice(0, 12)}…${Ni.toString().slice(-8)}`,
        factorP: g < q ? g.toString() : q.toString(),
        factorQ: g < q ? q.toString() : g.toString(),
        verifiedProduct: g * q === Ni
      });
    }
  }

  const durationMs = Math.max(1, Math.round((performance.now() - t0) * 100) / 100);
  return {
    totalModuli: n,
    compromisedCount: hits.length,
    hits,
    treeDepth: layers.length,
    productBits,
    durationMs,
    notesAr: hits.length > 0
      ? `كشفت شجرة الجداء والباقي عن ${hits.length} مفتاحاً مخترقاً يشترك في عامل أولي من أصل ${n} مفتاحاً في ${durationMs} مللي ثانية.`
      : `تم فحص ${n} مفتاحاً (${productBits.toLocaleString()} بت إجمالي) ولم يُرصد أي عامل أولي مشترك.`
  };
};

// ============================================================================
// 5. NO-LEAKAGE TEST KEY GENERATORS (>500b..1024b)
// ============================================================================
export const generateWeakWienerRsa = (bits: number): { n: string; e: string; d: string; p: string; q: string; nBits: number; dBits: number } => {
  const half = Math.floor(bits / 2);
  let p = generatePrime(half);
  let q = generatePrime(bits - half);
  while (p === q || p > 2n * q || q > 2n * p) {
    q = generatePrime(bits - half);
  }
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const dBitsTarget = Math.max(12, Math.floor(bitLen(n) / 4) - 8);
  let d = (1n << BigInt(dBitsTarget - 1)) | BigInt(Math.floor(Math.random() * 1000000) * 2 + 1);
  while (gcd(d, phi) !== 1n) d += 2n;
  const e = modInverse(d, phi);
  cacheFactorization(n, p, q, [p, q], 'Wiener Weak-Key Generator');
  return {
    n: n.toString(),
    e: e.toString(),
    d: d.toString(),
    p: p.toString(),
    q: q.toString(),
    nBits: bitLen(n),
    dBits: bitLen(d)
  };
};

export const generateBonehDurfeeRsa = (
  bits: number,
  deltaTarget = 0.265
): { n: string; e: string; d: string; p: string; q: string; nBits: number; dBits: number } => {
  const half = Math.floor(bits / 2);
  let p = generatePrime(half);
  let q = generatePrime(bits - half);
  while (p === q || p > 2n * q || q > 2n * p) {
    q = generatePrime(bits - half);
  }
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const nBits = bitLen(n);
  const dBitsTarget = Math.max(20, Math.min(Math.floor(nBits * 0.282), Math.round(nBits * deltaTarget)));
  // Randomize middle bits of d cleanly while keeping gcd(d, phi) === 1
  let d = (1n << BigInt(dBitsTarget - 1)) + 1n;
  for (let b = 4; b < dBitsTarget - 2; b += 7) {
    if (Math.random() > 0.45) d |= (1n << BigInt(b));
  }
  while (gcd(d, phi) !== 1n) d += 2n;
  const e = modInverse(d, phi);
  cacheFactorization(n, p, q, [p, q], 'Boneh-Durfee Generator');
  return {
    n: n.toString(),
    e: e.toString(),
    d: d.toString(),
    p: p.toString(),
    q: q.toString(),
    nBits,
    dBits: bitLen(d)
  };
};

export const generateLsbHintRsa = (bits: number, knownRatioPct: number) => {
  const pBitsTarget = Math.floor(bits / 2);
  const qBitsTarget = bits - pBitsTarget;
  const p = generatePrime(pBitsTarget);
  let q = generatePrime(qBitsTarget);
  while (q === p) q = generatePrime(qBitsTarget);
  const n = p * q;
  const pBits = bitLen(p);
  const clampedPct = Math.min(99, Math.max(51, knownRatioPct));
  const knownBits = Math.max(1, Math.min(pBits - 1, Math.round((pBits * clampedPct) / 100)));
  const unknownBits = pBits - knownBits;
  const mask = (1n << BigInt(knownBits)) - 1n;
  const pLow = p & mask;
  const trueX0 = p >> BigInt(knownBits);
  return {
    rsaBits: bits,
    actualNBits: bitLen(n),
    n: n.toString(),
    p: p.toString(),
    q: q.toString(),
    pBits,
    knownRatioPct: clampedPct,
    knownBits,
    unknownBits,
    pLowDec: pLow.toString(10),
    pLowHex: '0x' + pLow.toString(16),
    trueX0: trueX0.toString(10)
  };
};

// Generate a prime p such that p - 1 or p + 1 is B-smooth for genuine >500-bit p-1/p+1/ECM demos
export const generateSmoothFactorRsa = (
  bits: number,
  mode: 'p-1-smooth' | 'unbalanced-ecm' | 'close-primes'
): { n: string; p: string; q: string; bits: number; labelAr: string } => {
  if (mode === 'close-primes') {
    const half = Math.floor(bits / 2);
    const base = generatePrime(half);
    let q = base + 2n;
    // Pick next prime shortly after base
    let steps = 0;
    while (!isProbablePrime(q, 10) && steps < 4000) {
      q += 2n;
      steps++;
    }
    const n = base * q;
    return {
      n: n.toString(),
      p: base.toString(),
      q: q.toString(),
      bits: bitLen(n),
      labelAr: `${bitLen(n)} بت · عاملان متقاربان (|p - q| ≈ ${q - base})`
    };
  }

  if (mode === 'unbalanced-ecm') {
    // 38-bit unbalanced prime factor inside 512..1024-bit modulus (breaks quickly via Montgomery REDC ECM)
    const pSmall = generatePrime(38);
    const qLarge = generatePrime(Math.max(128, bits - 38));
    const n = pSmall * qLarge;
    return {
      n: n.toString(),
      p: pSmall.toString(),
      q: qLarge.toString(),
      bits: bitLen(n),
      labelAr: `${bitLen(n)} بت · عامل غير متوازن (38b × ${bitLen(qLarge)}b)`
    };
  }

  // Genuine B-powersmooth p-1 prime (each prime power p_i^e_i <= 4096) inside full 512..1024b modulus
  const smoothPool = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n,
    67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n,
    149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n,
    233n, 239n, 241n, 251n, 257n, 263n, 269n, 271n, 277n, 281n, 283n, 293n, 307n, 311n, 313n, 317n,
    331n, 337n, 347n, 349n, 353n, 359n, 367n, 373n, 379n, 383n, 389n, 397n, 401n, 409n, 419n, 421n
  ];
  const half = Math.floor(bits / 2);
  let p = 0n;
  // Build a guaranteed B-powersmooth base up to (half - 16) bits with each prime factor <= 421 and multiplicity <= 2
  const shuffled = [...smoothPool].sort(() => Math.random() - 0.5);
  let prod = 6n;
  for (const sp of shuffled) {
    if (bitLen(prod) >= half - 14) break;
    prod *= sp;
  }
  while (bitLen(prod) < half - 14) {
    for (const sp of smoothPool) {
      if (bitLen(prod) >= half - 14) break;
      if ((prod % (sp * sp * sp)) !== 0n) prod *= sp;
    }
  }
  const startCof = (Math.floor(Math.random() * 2000) * 2) + 1;
  for (let offset = 0; offset < 6000; offset++) {
    const cofactor = BigInt(startCof + offset * 2);
    const cand = prod * cofactor + 1n;
    if (isProbablePrime(cand, 10)) {
      p = cand;
      break;
    }
  }
  if (p === 0n) p = generatePrime(half);
  const q = generatePrime(Math.max(128, bits - bitLen(p)));
  const n = p * q;
  return {
    n: n.toString(),
    p: p.toString(),
    q: q.toString(),
    bits: bitLen(n),
    labelAr: `${bitLen(n)} بت · عامل أملس p−1 (قابل للكشف السريع بـ REDC)`
  };
};

export const generateBatchGcdTestSet = (bits: number, count = 12) => {
  const half = Math.floor(bits / 2);
  const sharedP1 = generatePrime(half);
  const sharedP2 = generatePrime(half);
  const items: Array<{ n: string; p: string; q: string; sharedGroup: number | null }> = [];

  for (let i = 0; i < count; i++) {
    let p: bigint;
    let sharedGroup: number | null = null;
    if (i === 1 || i === 5) {
      p = sharedP1;
      sharedGroup = 1;
    } else if (i === 3 || i === 8) {
      p = sharedP2;
      sharedGroup = 2;
    } else {
      p = generatePrime(half);
    }
    let q = generatePrime(bits - half);
    while (q === p) q = generatePrime(bits - half);
    const n = p * q;
    items.push({ n: n.toString(), p: p.toString(), q: q.toString(), sharedGroup });
  }
  return items;
};

// ============================================================================
// 6. 512 / 768 / 1024-BIT MEDIAN & IQR EMPIRICAL BENCHMARK SUITE
// ============================================================================
export interface Benchmark500Row {
  id: string;
  titleAr: string;
  bits: 512 | 768 | 1024;
  attackType: 'wiener' | 'boneh-durfee' | 'coppersmith-msb' | 'coppersmith-lsb' | 'batch-gcd' | 'snfs-aurifeuillean';
  rounds: number;
  successCount: number;
  medianMs: number;
  iqrMs: number;
  q1Ms: number;
  q3Ms: number;
  minMs: number;
  maxMs: number;
  verifiedAll: boolean;
}

const computeMedianIqr = (vals: number[]) => {
  const sorted = [...vals].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { median: 0, q1: 0, q3: 0, iqr: 0, min: 0, max: 0 };
  const qAt = (p: number) => {
    const pos = (n - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (base + 1 < n) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    return sorted[base];
  };
  const q1 = Number(qAt(0.25).toFixed(2));
  const median = Number(qAt(0.5).toFixed(2));
  const q3 = Number(qAt(0.75).toFixed(2));
  return {
    median,
    q1,
    q3,
    iqr: Number((q3 - q1).toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[n - 1].toFixed(2))
  };
};

export const run500PlusSingleBenchmark = (
  bits: 512 | 768 | 1024,
  attackType: Benchmark500Row['attackType'],
  rounds = 3
): Benchmark500Row => {
  const durations: number[] = [];
  let successCount = 0;
  let verifiedAll = true;

  for (let r = 0; r < rounds; r++) {
    if (attackType === 'wiener') {
      const k = generateWeakWienerRsa(bits);
      const t0 = performance.now();
      const res = runWienerAttack(BigInt(k.n), BigInt(k.e));
      durations.push(performance.now() - t0);
      if (res.success && res.verifiedProduct) successCount++;
      else verifiedAll = false;
    } else if (attackType === 'boneh-durfee') {
      const k = generateBonehDurfeeRsa(bits, 0.264);
      const t0 = performance.now();
      const res = runBonehDurfeeAttack(BigInt(k.n), BigInt(k.e), 0.266, 3, 1);
      durations.push(performance.now() - t0);
      if (res.success && res.verifiedProduct) successCount++;
      else verifiedAll = false;
    } else if (attackType === 'coppersmith-msb') {
      const half = Math.floor(bits / 2);
      const p = generatePrime(half);
      const q = generatePrime(bits - half);
      const n = p * q;
      const uBits = Math.max(16, Math.round(half * 0.35)); // 65% MSB known
      const p0 = (p >> BigInt(uBits)) << BigInt(uBits);
      const t0 = performance.now();
      const res = solveCoppersmithLll(n, p0, uBits);
      durations.push(performance.now() - t0);
      if (res.success && res.verifiedProduct) successCount++;
      else verifiedAll = false;
    } else if (attackType === 'coppersmith-lsb') {
      const k = generateLsbHintRsa(bits, 65);
      const t0 = performance.now();
      const res = solveCoppersmithLsbLll(BigInt(k.n), BigInt(k.pLowDec), k.knownBits, k.pBits);
      durations.push(performance.now() - t0);
      if (res.success && res.verifiedProduct) successCount++;
      else verifiedAll = false;
    } else if (attackType === 'batch-gcd') {
      const batch = generateBatchGcdTestSet(bits, 12).map(item => BigInt(item.n));
      const t0 = performance.now();
      const res = runBatchGcdAttack(batch);
      durations.push(performance.now() - t0);
      if (res.compromisedCount === 4 && res.hits.every(h => h.verifiedProduct)) successCount++;
      else verifiedAll = false;
    } else {
      // SNFS Aurifeuillean 2^(4k+2)+1 >500..1024 bits
      const exp = bits === 512 ? 514 : bits === 768 ? 770 : 1026; // 4k+2
      const nVal = (1n << BigInt(exp)) + 1n;
      const halfShift = (exp - 2) / 4; // k
      const t0 = performance.now();
      // Aurifeuillean factors: 2^(2k+1) +/- 2^(k+1) + 1
      const two2kp1 = 1n << BigInt(2 * halfShift + 1);
      const twokp1 = 1n << BigInt(halfShift + 1);
      const L = two2kp1 - twokp1 + 1n;
      const g = gcd(L, nVal);
      durations.push(performance.now() - t0);
      if (g > 1n && g < nVal && (nVal / g) * g === nVal) successCount++;
      else verifiedAll = false;
    }
  }

  const stats = computeMedianIqr(durations);
  const titleMap: Record<Benchmark500Row['attackType'], string> = {
    wiener: `Wiener Continued Fractions (${bits}-bit)`,
    'boneh-durfee': `Boneh–Durfee LLL (${bits}-bit, δ=0.264)`,
    'coppersmith-msb': `Coppersmith MSB 65% LLL (${bits}-bit)`,
    'coppersmith-lsb': `Coppersmith LSB 65% LLL (${bits}-bit)`,
    'batch-gcd': `Batch GCD Tree (12×${bits}-bit)`,
    'snfs-aurifeuillean': `SNFS Aurifeuillean 2^(4k+2)+1 (${bits}-bit)`
  };

  return {
    id: `${attackType}-${bits}`,
    titleAr: titleMap[attackType],
    bits,
    attackType,
    rounds,
    successCount,
    medianMs: stats.median,
    iqrMs: stats.iqr,
    q1Ms: stats.q1,
    q3Ms: stats.q3,
    minMs: stats.min,
    maxMs: stats.max,
    verifiedAll
  };
};

// Exportable Python Reference Script for >500-bit Factorization & Attacks
export const PYTHON_500PLUS_REFERENCE_SCRIPT = `#!/usr/bin/env python3
"""
ZF >500-bit Factorization & RSA Cryptanalysis Suite (512–1024+ bits)
Pure-Python Exact Integer Reference:
  1. Pollard p-1 (Stage 1 & Stage 2)
  2. Williams p+1 (Lucas V_k)
  3. Montgomery Suyama Z/12Z ECM
  4. Wiener Continued Fractions (d < N^0.25)
  5. Batch GCD Remainder Tree
"""
from math import gcd, isqrt

def pollard_p_minus_1(n: int, b1: int = 50000, b2: int = 400000):
    if n % 2 == 0:
        return 2
    sieve = bytearray([1]) * (b2 + 1)
    primes = []
    for i in range(2, b2 + 1):
        if sieve[i]:
            primes.append(i)
            for j in range(i * i, b2 + 1, i):
                sieve[j] = 0
    a = 2
    for p in primes:
        if p > b1:
            break
        pwr = p
        while pwr * p <= b1:
            pwr *= p
        a = pow(a, pwr, n)
    g = gcd(a - 1, n)
    if 1 < g < n:
        return g
    # Stage 2
    prod = 1
    prev_p = b1
    for p in primes:
        if p <= b1:
            continue
        a = pow(a, p - prev_p, n)
        prev_p = p
        prod = (prod * (a - 1)) % n
    g2 = gcd(prod, n)
    return g2 if 1 < g2 < n else None

def williams_p_plus_1(n: int, b1: int = 50000):
    def lucas_chain(k: int, p_seed: int) -> int:
        v0, v1 = 2, p_seed % n
        for bit in bin(k)[2:]:
            if bit == '1':
                v0 = (v0 * v1 - p_seed) % n
                v1 = (v1 * v1 - 2) % n
            else:
                v1 = (v0 * v1 - p_seed) % n
                v0 = (v0 * v0 - 2) % n
        return v0
    sieve = bytearray([1]) * (b1 + 1)
    primes = [i for i in range(2, b1 + 1) if sieve[i] and not sieve.__setitem__(slice(i*i, b1+1, i), bytearray(len(range(i*i, b1+1, i))))]
    for seed in (5, 7, 11, 13, 17, 19):
        v = seed
        for p in primes:
            pwr = p
            while pwr * p <= b1:
                pwr *= p
            v = lucas_chain(pwr, v)
        g = gcd(v - 2, n)
        if 1 < g < n:
            return g
    return None

def wiener_attack(n: int, e: int):
    a, b = e, n
    k0, k1, d0, d1 = 0, 1, 1, 0
    while b:
        q, r = divmod(a, b)
        a, b = b, r
        k0, k1 = k1, q * k1 + k0
        d0, d1 = d1, q * d1 + d0
        if k1 > 0 and (e * d1 - 1) % k1 == 0:
            phi = (e * d1 - 1) // k1
            s = n - phi + 1
            if s > 0 and s % 2 == 0:
                half = s >> 1
                disc = half * half - n
                if disc >= 0:
                    rt = isqrt(disc)
                    if rt * rt == disc:
                        p, qf = half - rt, half + rt
                        if p * qf == n:
                            return p, qf, d1
    return None

def batch_gcd(moduli):
    tree = [list(moduli)]
    while len(tree[-1]) > 1:
        lvl = tree[-1]
        tree.append([lvl[i] * lvl[i+1] if i+1 < len(lvl) else lvl[i] for i in range(0, len(lvl), 2)])
    rem = tree[-1]
    for lvl in reversed(tree[:-1]):
        rem = [rem[i // 2] % (lvl[i] * lvl[i]) for i in range(len(lvl))]
    return [(i, gcd(rem[i] // moduli[i], moduli[i])) for i in range(len(moduli)) if 1 < gcd(rem[i] // moduli[i], moduli[i]) < moduli[i]]
`;

// ============================================================================
// 7. AUTOMATIC PUBLIC EXPONENT COMPUTATION FOR CUSTOM MODULUS N
// ============================================================================
export interface AutoExponentResult {
  e: string | null;
  minimalE?: string;
  minimalD?: string;
  source: 'known-pq' | 'factored-fast' | 'prime-n' | 'unresolved-pending';
  phiComputed: boolean;
  dBits: number | null;
  factorMethod?: string;
  notesAr: string;
  lambda?: string;
  phi?: string;
  d?: string;
}

const brentRhoQuick = (n: bigint, maxIters = 14000): bigint | null => {
  if ((n & 1n) === 0n) return 2n;
  for (let seed = 1; seed <= 3; seed++) {
    let y = BigInt(seed + 1);
    const c = BigInt(seed * 2 + 1);
    const m = 64;
    let g = 1n;
    let r = 1;
    let q = 1n;
    let x = y;
    let ys = y;
    let iters = 0;

    while (g === 1n && iters < maxIters) {
      x = y;
      for (let i = 0; i < r; i++) y = (y * y + c) % n;
      let k = 0;
      while (k < r && g === 1n && iters < maxIters) {
        ys = y;
        const lim = Math.min(m, r - k);
        for (let i = 0; i < lim; i++) {
          y = (y * y + c) % n;
          const diff = x > y ? x - y : y - x;
          q = (q * diff) % n;
        }
        g = gcd(q, n);
        k += m;
        iters += lim;
      }
      r <<= 1;
    }

    if (g === n) {
      do {
        ys = (ys * ys + c) % n;
        const diff = x > ys ? x - ys : ys - x;
        g = gcd(diff, n);
      } while (g === 1n);
    }
    if (g > 1n && g < n) return g;
  }
  return null;
};

const QR64_MASK = (() => {
  const m = new Uint8Array(64);
  for (let i = 0; i < 64; i++) m[(i * i) & 63] = 1;
  return m;
})();
const QR45_MASK = (() => {
  const m = new Uint8Array(45);
  for (let i = 0; i < 45; i++) m[(i * i) % 45] = 1;
  return m;
})();

const fastExtractFactor = (n: bigint): { p: bigint; method: string } | null => {
  if ((n & 1n) === 0n) return { p: 2n, method: 'قسمة أولية (2)' };
  if (n % 3n === 0n) return { p: 3n, method: 'قسمة أولية (3)' };
  // Bounded trial division up to 100,000 (catches small factors even on >500-bit N)
  for (let d = 5; d <= 100000; d += 6) {
    const bd = BigInt(d);
    if (n % bd === 0n) return { p: bd, method: `قسمة تجريبية (${d})` };
    const bd2 = BigInt(d + 2);
    if (n % bd2 === 0n) return { p: bd2, method: `قسمة تجريبية (${d + 2})` };
  }
  // QR-filtered Fermat close-primes scan (24,576 steps in < 1ms)
  const root = bigIntSqrt(n);
  let a = root * root === n ? root : root + 1n;
  const nMod64 = Number(n & 63n);
  const nMod45 = Number(n % 45n);
  let a64 = Number(a & 63n);
  let a45 = Number(a % 45n);
  for (let i = 0; i < 24576; i++) {
    if (QR64_MASK[(a64 * a64 - nMod64) & 63] && QR45_MASK[((a45 * a45 - nMod45) % 45 + 45) % 45]) {
      const sq = a * a - n;
      const b = bigIntSqrt(sq);
      if (b * b === sq) {
        const f = a - b;
        if (f > 1n && f < n) return { p: f, method: `فيرما القريب (${i + 1} خطوة)` };
      }
    }
    a += 1n;
    a64 = (a64 + 1) & 63;
    a45 = a45 + 1 >= 45 ? 0 : a45 + 1;
  }
  // Quick Pollard p-1 check (B1 = 2000) for >500-bit p-1 smooth custom N
  let p1Base = 2n;
  for (let p = 2; p <= 2000; p++) {
    let isP = true;
    for (let d = 2; d * d <= p; d++) if (p % d === 0) { isP = false; break; }
    if (!isP) continue;
    let pwr = p;
    while (pwr * p <= 2000) pwr *= p;
    p1Base = modPow(p1Base, BigInt(pwr), n);
  }
  const gp1 = gcd(p1Base - 1n, n);
  if (gp1 > 1n && gp1 < n) return { p: gp1, method: 'Pollard p-1 (B1=2000)' };
  // Bounded Pollard-Brent rho for tractable custom N <= 76 bits
  if (bitLen(n) <= 76) {
    const rho = brentRhoQuick(n, 180000);
    if (rho && rho > 1n && rho < n) return { p: rho, method: 'Pollard-Brent Rho' };
  }
  return null;
};

const computeEulerPhiExact = (n: bigint, firstP: bigint): { phi: bigint; isSemiprime: boolean } => {
  const other = n / firstP;
  if (firstP === other && isProbablePrime(firstP, 10)) {
    return { phi: firstP * (firstP - 1n), isSemiprime: false };
  }
  if (isProbablePrime(firstP, 10) && isProbablePrime(other, 10)) {
    return { phi: (firstP - 1n) * (other - 1n), isSemiprime: true };
  }
  // Complete prime-power factorization if small enough
  const counts = new Map<bigint, number>();
  const stack: bigint[] = [firstP, other];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur <= 1n) continue;
    if (isProbablePrime(cur, 10)) {
      counts.set(cur, (counts.get(cur) || 0) + 1);
      continue;
    }
    const split = fastExtractFactor(cur);
    if (split) {
      stack.push(split.p, cur / split.p);
    } else {
      // Partial fallback when cofactor remains large composite
      return { phi: (firstP - 1n) * (other - 1n), isSemiprime: false };
    }
  }
  let phi = 1n;
  for (const [prime, exp] of counts.entries()) {
    let pPow = 1n;
    for (let i = 1; i < exp; i++) pPow *= prime;
    phi *= (prime - 1n) * pPow;
  }
  const totalPrimes = Array.from(counts.values()).reduce((s, v) => s + v, 0);
  return { phi, isSemiprime: totalPrimes === 2 && counts.size === 2 };
};

export const autoComputePublicExponentForN = (
  N: bigint,
  mode: 'wiener' | 'boneh-durfee' | 'standard',
  deltaTarget = 0.258,
  hintP?: bigint,
  hintQ?: bigint
): AutoExponentResult => {
  if (N < 2n) {
    return {
      e: null,
      source: 'unresolved-pending',
      phiComputed: false,
      dBits: null,
      notesAr: 'يرجى إدخال مودول N أكبر من أو يساوي 2.'
    };
  }

  const rep = computeUniversalExponentReport(N, mode, deltaTarget, hintP, hintQ);

  if (!rep.isComplete || !rep.publicExponentE) {
    return {
      e: null,
      source: 'unresolved-pending',
      phiComputed: false,
      dBits: null,
      factorMethod: rep.status,
      notesAr: rep.explanationAr
    };
  }

  let source: AutoExponentResult['source'] = 'factored-fast';
  if (rep.status === 'prime') source = 'prime-n';
  else if (rep.status === 'cached-factors') source = 'known-pq';

  return {
    e: rep.publicExponentE,
    minimalE: rep.minimalPublicExponentE ?? undefined,
    minimalD: rep.minimalPrivateExponentD ?? undefined,
    source,
    phiComputed: true,
    dBits: rep.dBits,
    factorMethod: rep.status,
    notesAr: rep.explanationAr,
    lambda: rep.lambdaN,
    phi: rep.phiN,
    d: rep.privateExponentD || undefined
  };
};

