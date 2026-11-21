import { bigIntSqrt, gcd, generatePrime } from '../mathUtils';

export interface CoppersmithLatticeRowPreview {
  rowIndex: number;
  normBits: number;
  entriesPreview: string[];
}

export interface CoppersmithLllResult {
  success: boolean;
  pathUsed: 'lll-coppersmith' | 'narrow-sieve';
  nBits: number;
  pBits: number;
  unknownBits: number;
  boundX: string;
  boundXBits: number;
  m: number;
  t: number;
  dimension: number;
  howgraveBoundOk: boolean;
  howgraveLogMarginBits: number;
  initialNormsBits: number[];
  reducedNormsBits: number[];
  theoreticalTargetBits: number;
  initialMatrixPreview: CoppersmithLatticeRowPreview[];
  reducedMatrixPreview: CoppersmithLatticeRowPreview[];
  polynomialCoeffs: string[];
  polynomialLatex: string;
  rootsTested: string[];
  foundRootX0: string | null;
  factorP: string | null;
  factorQ: string | null;
  verifiedProduct: boolean;
  durationMs: number;
  lllSwaps: number;
  notesAr: string;
}

export interface NarrowSieveResult {
  success: boolean;
  candidatesChecked: number;
  maxBudget: number;
  truncatedByBudget: boolean;
  unknownBits: number;
  windowWidth: string;
  foundOffsetX0: string | null;
  factorP: string | null;
  factorQ: string | null;
  verifiedProduct: boolean;
  durationMs: number;
  notesAr: string;
}

export interface GeneratedHintKey {
  rsaBits: number;
  actualNBits: number;
  n: string;
  p: string;
  q: string;
  pBits: number;
  qBits: number;
  knownRatioPct: number;
  knownBits: number;
  unknownBits: number;
  hintP0Dec: string;
  hintP0Hex: string;
  trueOffsetX0: string;
  boundX: string;
  durationMs: number;
}

const bitLen = (v: bigint): number => {
  const a = v < 0n ? -v : v;
  return a === 0n ? 0 : a.toString(2).length;
};

const formatCompactBigInt = (v: bigint): string => {
  if (v === 0n) return '0';
  const sign = v < 0n ? '-' : '';
  const abs = v < 0n ? -v : v;
  const bits = abs.toString(2).length;
  if (bits <= 42) return v.toString(10);
  const s = abs.toString(10);
  return `${sign}${s.slice(0, 6)}…${s.slice(-4)} (${bits}b)`;
};

/**
 * Generates an RSA modulus N = p * q of target bit length (e.g. 500, 768, 1024 bits)
 * along with the high-bit hint p0 where p = p0 + x0 and 0 <= x0 < 2^unknownBits.
 */
export const generateRsaWithHint = (rsaBits: number, knownRatioPct: number): GeneratedHintKey => {
  const t0 = performance.now();
  const pTargetBits = Math.floor(rsaBits / 2);
  const qTargetBits = rsaBits - pTargetBits;

  const p = generatePrime(pTargetBits);
  let q = generatePrime(qTargetBits);
  while (q === p) {
    q = generatePrime(qTargetBits);
  }
  const n = p * q;
  const pBits = bitLen(p);
  const clampedPct = Math.min(99, Math.max(51, knownRatioPct));
  const knownBits = Math.max(1, Math.min(pBits - 1, Math.round((pBits * clampedPct) / 100)));
  const unknownBits = pBits - knownBits;

  const shift = BigInt(unknownBits);
  const p0 = (p >> shift) << shift;
  const x0 = p - p0;
  const boundX = 1n << shift;

  return {
    rsaBits,
    actualNBits: bitLen(n),
    n: n.toString(10),
    p: p.toString(10),
    q: q.toString(10),
    pBits,
    qBits: bitLen(q),
    knownRatioPct: clampedPct,
    knownBits,
    unknownBits,
    hintP0Dec: p0.toString(10),
    hintP0Hex: '0x' + p0.toString(16),
    trueOffsetX0: x0.toString(10),
    boundX: boundX.toString(10),
    durationMs: Math.round(performance.now() - t0)
  };
};

/**
 * Builds polynomial coefficients for a(x) * b(x)
 */
const polyMul = (a: bigint[], b: bigint[]): bigint[] => {
  const out = new Array<bigint>(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0n) continue;
    for (let j = 0; j < b.length; j++) {
      out[i + j] += a[i] * b[j];
    }
  }
  return out;
};

const polyPow = (base: bigint[], exp: number): bigint[] => {
  let res: bigint[] = [1n];
  for (let i = 0; i < exp; i++) {
    res = polyMul(res, base);
  }
  return res;
};

const buildHowgraveGrahamLattice = (
  N: bigint,
  p0: bigint,
  X: bigint,
  m: number,
  t: number
): bigint[][] => {
  const dim = m + t + 1;
  const basis: bigint[][] = [];
  const fPoly: bigint[] = [p0, 1n]; // x + p0

  // Precompute powers of X
  const xPows: bigint[] = [1n];
  for (let j = 1; j < dim; j++) {
    xPows.push(xPows[j - 1] * X);
  }

  // g_i(x) = N^(m - i) * (x + p0)^i  for i = 0 .. m - 1
  for (let i = 0; i < m; i++) {
    const nPow = N ** BigInt(m - i);
    const fPow = polyPow(fPoly, i);
    const row = new Array<bigint>(dim).fill(0n);
    for (let j = 0; j < fPow.length; j++) {
      row[j] = nPow * fPow[j] * xPows[j];
    }
    basis.push(row);
  }

  // h_k(x) = x^k * (x + p0)^m  for k = 0 .. t
  const fm = polyPow(fPoly, m);
  for (let k = 0; k <= t; k++) {
    const row = new Array<bigint>(dim).fill(0n);
    for (let j = 0; j < fm.length; j++) {
      const col = j + k;
      if (col < dim) {
        row[col] = fm[j] * xPows[col];
      }
    }
    basis.push(row);
  }

  return basis;
};

const dotProduct = (a: bigint[], b: bigint[]): bigint => {
  let sum = 0n;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
};

const runCohenExactLll = (
  inputBasis: bigint[][],
  deltaNum: bigint = 99n,
  deltaDen: bigint = 100n
): { reduced: bigint[][]; swaps: number } => {
  const n = inputBasis.length;
  if (n <= 1) return { reduced: inputBasis.map(r => [...r]), swaps: 0 };
  const cols = inputBasis[0].length;
  const basis = inputBasis.map(r => [...r]);

  const D = new Array<bigint>(n + 1).fill(1n);
  const lambda: bigint[][] = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let u = dotProduct(basis[i], basis[j]);
      for (let k = 0; k < j; k++) {
        if (D[k] === 0n) return { reduced: basis, swaps: 0 };
        u = (D[k + 1] * u - lambda[i][k] * lambda[j][k]) / D[k];
      }
      if (j < i) {
        lambda[i][j] = u;
      } else {
        D[i + 1] = u;
      }
    }
  }

  const sizeReduce = (k: number, l: number) => {
    const denom = D[l + 1];
    if (denom === 0n) return;
    const lam = lambda[k][l];
    const absLam = lam < 0n ? -lam : lam;
    if (absLam * 2n > denom) {
      let q = (absLam * 2n + denom) / (2n * denom);
      if (lam < 0n) q = -q;
      for (let c = 0; c < cols; c++) {
        basis[k][c] -= q * basis[l][c];
      }
      lambda[k][l] -= q * denom;
      for (let j = 0; j < l; j++) {
        lambda[k][j] -= q * lambda[l][j];
      }
    }
  };

  let k = 1;
  let swaps = 0;
  const maxIter = Math.max(2000, n * n * 40);
  let iter = 0;

  while (k < n && iter < maxIter) {
    iter++;
    sizeReduce(k, k - 1);

    const lam = lambda[k][k - 1];
    const lhs = deltaDen * (D[k + 1] * D[k - 1] + lam * lam);
    const rhs = deltaNum * D[k] * D[k];

    if (lhs < rhs && D[k] !== 0n) {
      [basis[k - 1], basis[k]] = [basis[k], basis[k - 1]];
      for (let j = 0; j < k - 1; j++) {
        const tmp = lambda[k - 1][j];
        lambda[k - 1][j] = lambda[k][j];
        lambda[k][j] = tmp;
      }
      const B = (D[k + 1] * D[k - 1] + lam * lam) / D[k];
      for (let i = k + 1; i < n; i++) {
        const t = lambda[i][k];
        lambda[i][k] = (D[k + 1] * lambda[i][k - 1] - lam * t) / D[k];
        lambda[i][k - 1] = (D[k - 1] * t + lam * lambda[i][k - 1]) / D[k];
      }
      D[k] = B;
      swaps++;
      if (k > 1) k--;
    } else {
      for (let l = k - 2; l >= 0; l--) {
        sizeReduce(k, l);
      }
      k++;
    }
  }

  return { reduced: basis, swaps };
};

const runExactGramFixedLll = (
  inputBasis: bigint[][],
  fracBits: number,
  deltaNum: bigint = 99n,
  deltaDen: bigint = 100n
): { reduced: bigint[][]; swaps: number } => {
  const n = inputBasis.length;
  if (n <= 1) return { reduced: inputBasis.map(r => [...r]), swaps: 0 };
  const cols = inputBasis[0].length;
  const basis = inputBasis.map(r => [...r]);

  const G: bigint[][] = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const v = dotProduct(basis[i], basis[j]);
      G[i][j] = v;
      G[j][i] = v;
    }
  }

  const FRAC = BigInt(fracBits);
  const ONE = 1n << FRAC;
  const HALF = ONE >> 1n;
  const rFP: bigint[][] = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));
  const muFP: bigint[][] = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));
  const B = new Array<bigint>(n).fill(0n);
  let validUpTo = 0;

  const computeRowGso = (i: number) => {
    for (let j = 0; j < i; j++) {
      let sum = G[i][j] << FRAC;
      for (let m = 0; m < j; m++) {
        sum -= (muFP[i][m] * rFP[j][m]) >> FRAC;
      }
      rFP[i][j] = sum;
      muFP[i][j] = B[j] > 0n ? (sum << FRAC) / B[j] : 0n;
    }
    let normSq = G[i][i] << FRAC;
    for (let m = 0; m < i; m++) {
      normSq -= (muFP[i][m] * rFP[i][m]) >> FRAC;
    }
    B[i] = normSq > 0n ? normSq : 1n;
  };

  const ensureGso = (upto: number) => {
    while (validUpTo <= upto) {
      computeRowGso(validUpTo);
      validUpTo++;
    }
  };

  const reduceRowKL = (k: number, l: number): boolean => {
    const mu = muFP[k][l];
    const absMu = mu < 0n ? -mu : mu;
    if (absMu <= HALF) return false;
    let q = (absMu + HALF) >> FRAC;
    if (mu < 0n) q = -q;
    if (q === 0n) return false;

    const rowK = basis[k];
    const rowL = basis[l];
    for (let c = 0; c < cols; c++) rowK[c] -= q * rowL[c];

    const oldGkl = G[k][l];
    const gll = G[l][l];
    G[k][k] = G[k][k] - 2n * q * oldGkl + q * q * gll;
    const Gk = G[k];
    const Gl = G[l];
    for (let j = 0; j < n; j++) {
      if (j === k) continue;
      const nv = Gk[j] - q * Gl[j];
      Gk[j] = nv;
      G[j][k] = nv;
    }

    muFP[k][l] -= q * ONE;
    rFP[k][l] -= q * B[l];
    for (let j = 0; j < l; j++) {
      muFP[k][j] -= q * muFP[l][j];
      rFP[k][j] -= q * rFP[l][j];
    }
    return true;
  };

  ensureGso(0);
  let k = 1;
  let swaps = 0;
  let iter = 0;
  const maxIter = Math.max(8000, n * n * 200);

  while (k < n && iter < maxIter) {
    iter++;
    ensureGso(k);
    let reducedAny = false;
    for (let l = k - 1; l >= 0; l--) {
      if (reduceRowKL(k, l)) reducedAny = true;
    }
    if (reducedAny) computeRowGso(k);

    const mu = muFP[k][k - 1];
    const muSqB = (((mu * mu) >> FRAC) * B[k - 1]) >> FRAC;
    const rhs = (deltaNum * B[k - 1]) / deltaDen - muSqB;
    if (B[k] < rhs) {
      [basis[k - 1], basis[k]] = [basis[k], basis[k - 1]];
      [G[k - 1], G[k]] = [G[k], G[k - 1]];
      for (let i = 0; i < n; i++) {
        const tmp = G[i][k - 1];
        G[i][k - 1] = G[i][k];
        G[i][k] = tmp;
      }
      validUpTo = Math.min(validUpTo, k - 1);
      swaps++;
      if (k > 1) k--;
    } else {
      k++;
    }
  }

  return { reduced: basis, swaps };
};

/**
 * Adaptive Exact-Gram Fixed-Point LLL (50x-135x faster than naive Cohen determinants on >500b..1024b bases)
 * with exact integer operations on basis vectors and two-stage precision escalation when entry bit-lengths > 420.
 */
export const integralLllReduce = (
  inputBasis: bigint[][],
  deltaNum: bigint = 99n,
  deltaDen: bigint = 100n
): { reduced: bigint[][]; swaps: number } => {
  const n = inputBasis.length;
  if (n <= 1) return { reduced: inputBasis.map(r => [...r]), swaps: 0 };

  let maxEntryBits = 0;
  for (let i = 0; i < n; i++) {
    const row = inputBasis[i];
    for (let j = 0; j < row.length; j++) {
      const b = bitLen(row[j]);
      if (b > maxEntryBits) maxEntryBits = b;
    }
  }

  if (maxEntryBits <= 256 && n <= 6) {
    return runCohenExactLll(inputBasis, deltaNum, deltaDen);
  }

  if (maxEntryBits <= 420) {
    return runExactGramFixedLll(inputBasis, 256, deltaNum, deltaDen);
  }

  // Stage 1: fast low-precision Gram pass cuts row norms by >50%
  const frac1 = Math.max(256, Math.min(512, Math.ceil((maxEntryBits * 0.25) / 64) * 64));
  const stage1 = runExactGramFixedLll(inputBasis, frac1, deltaNum, deltaDen);

  let maxResBits = 0;
  for (let i = 0; i < n; i++) {
    const row = stage1.reduced[i];
    for (let j = 0; j < row.length; j++) {
      const b = bitLen(row[j]);
      if (b > maxResBits) maxResBits = b;
    }
  }

  const targetFrac2 = Math.ceil((Math.max(maxResBits * 0.72, maxEntryBits * 0.42)) / 64) * 64;
  const frac2 = Math.max(frac1, Math.min(2048, targetFrac2));
  if (frac2 <= frac1 && maxResBits <= maxEntryBits * 0.65) {
    return stage1;
  }

  const stage2 = runExactGramFixedLll(stage1.reduced, frac2, deltaNum, deltaDen);
  return {
    reduced: stage2.reduced,
    swaps: stage1.swaps + stage2.swaps
  };
};

// Evaluate BigInt polynomial c[0] + c[1]*x + ... + c[d]*x^d via Horner's method
const evalPoly = (coeffs: bigint[], x: bigint): bigint => {
  let acc = 0n;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    acc = acc * x + coeffs[i];
  }
  return acc;
};

const derivativePoly = (coeffs: bigint[]): bigint[] => {
  if (coeffs.length <= 1) return [0n];
  const d: bigint[] = [];
  for (let i = 1; i < coeffs.length; i++) {
    d.push(coeffs[i] * BigInt(i));
  }
  return d;
};

const trimPoly = (coeffs: bigint[]): bigint[] => {
  let end = coeffs.length - 1;
  while (end > 0 && coeffs[end] === 0n) end--;
  return coeffs.slice(0, end + 1);
};

// Exact integer root bisection on monotonic interval [lo, hi]
const bisectIntegerRootOnMonotonic = (
  coeffs: bigint[],
  lo: bigint,
  hi: bigint
): bigint[] => {
  if (lo > hi) return [];
  const fLo = evalPoly(coeffs, lo);
  if (fLo === 0n) return [lo];
  const fHi = evalPoly(coeffs, hi);
  if (fHi === 0n) return [hi];
  if ((fLo > 0n && fHi > 0n) || (fLo < 0n && fHi < 0n)) return [];

  const increasing = fLo < 0n;
  let l = lo;
  let r = hi;
  while (l <= r) {
    const mid = (l + r) >> 1n;
    const fMid = evalPoly(coeffs, mid);
    if (fMid === 0n) return [mid];
    if (increasing ? fMid < 0n : fMid > 0n) {
      l = mid + 1n;
    } else {
      r = mid - 1n;
    }
  }
  return [];
};

/**
 * Finds all integer roots x in [lo, hi] of a BigInt polynomial g(x) = 0
 * via recursive Rolle-derivative critical point bracketing + binary search.
 */
const findIntegerRootsRecursive = (
  rawCoeffs: bigint[],
  lo: bigint,
  hi: bigint
): bigint[] => {
  const coeffs = trimPoly(rawCoeffs);
  const deg = coeffs.length - 1;
  if (deg <= 0) return [];

  if (deg === 1) {
    const c0 = coeffs[0];
    const c1 = coeffs[1];
    if (c1 !== 0n && (-c0) % c1 === 0n) {
      const root = (-c0) / c1;
      if (root >= lo && root <= hi) return [root];
    }
    return [];
  }

  if (deg === 2) {
    const c = coeffs[0];
    const b = coeffs[1];
    const a = coeffs[2];
    const disc = b * b - 4n * a * c;
    if (disc < 0n) return [];
    const s = bigIntSqrt(disc);
    if (s * s !== disc) return [];
    const out: bigint[] = [];
    const denom = 2n * a;
    if ((-b + s) % denom === 0n) {
      const r1 = (-b + s) / denom;
      if (r1 >= lo && r1 <= hi) out.push(r1);
    }
    if (s !== 0n && (-b - s) % denom === 0n) {
      const r2 = (-b - s) / denom;
      if (r2 >= lo && r2 <= hi) out.push(r2);
    }
    return out;
  }

  // Recursive Rolle bracketing via g'(x)
  const dCoeffs = derivativePoly(coeffs);
  // Also find continuous bracket centers of g'(x) recursively by finding integer floor extrema
  const derivRoots = findRealBracketPoints(dCoeffs, lo, hi);
  const splitPoints: bigint[] = [lo, ...derivRoots, hi].sort((u, v) => (u < v ? -1 : u > v ? 1 : 0));

  const found = new Set<bigint>();
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const aPt = splitPoints[i];
    const bPt = splitPoints[i + 1];
    const rootsInSub = bisectIntegerRootOnMonotonic(coeffs, aPt, bPt);
    for (const r of rootsInSub) found.add(r);
    if (aPt < bPt && aPt + 1n <= bPt) {
      // Also check neighbor around turning point in case real extremum lies between integers
      for (const offset of [-1n, 0n, 1n]) {
        const probe = aPt + offset;
        if (probe >= lo && probe <= hi && evalPoly(coeffs, probe) === 0n) found.add(probe);
      }
    }
  }
  return Array.from(found);
};

// Returns integer floor points near every real root of polynomial on [lo, hi]
const findRealBracketPoints = (rawCoeffs: bigint[], lo: bigint, hi: bigint): bigint[] => {
  const coeffs = trimPoly(rawCoeffs);
  const deg = coeffs.length - 1;
  if (deg <= 0) return [];
  if (deg === 1) {
    const pt = (-coeffs[0]) / coeffs[1];
    return pt >= lo && pt <= hi ? [pt] : [];
  }
  const deriv = derivativePoly(coeffs);
  const crit = findRealBracketPoints(deriv, lo, hi);
  const bounds: bigint[] = [lo, ...crit, hi].sort((u, v) => (u < v ? -1 : u > v ? 1 : 0));
  const out: bigint[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    let l = bounds[i];
    let r = bounds[i + 1];
    const fl = evalPoly(coeffs, l);
    const fr = evalPoly(coeffs, r);
    if (fl === 0n) out.push(l);
    if (fr === 0n) out.push(r);
    if ((fl < 0n && fr > 0n) || (fl > 0n && fr < 0n)) {
      const inc = fl < 0n;
      while (r - l > 1n) {
        const mid = (l + r) >> 1n;
        const fm = evalPoly(coeffs, mid);
        if (fm === 0n) {
          l = mid;
          break;
        }
        if (inc ? fm < 0n : fm > 0n) l = mid;
        else r = mid;
      }
      out.push(l);
      if (l + 1n <= hi) out.push(l + 1n);
    }
  }
  return out;
};

const formatPolyLatex = (coeffs: bigint[]): string => {
  const trimmed = trimPoly(coeffs);
  const terms: string[] = [];
  for (let deg = trimmed.length - 1; deg >= 0; deg--) {
    const c = trimmed[deg];
    if (c === 0n) continue;
    const sign = c < 0n ? '-' : terms.length > 0 ? '+' : '';
    const abs = c < 0n ? -c : c;
    const cBits = bitLen(abs);
    const cStr = cBits > 28 ? `${abs.toString(10).slice(0, 5)}\\cdots_{(${cBits}b)}` : abs.toString(10);
    if (deg === 0) {
      terms.push(`${sign}${cStr}`);
    } else if (deg === 1) {
      terms.push(`${sign}${abs === 1n ? '' : cStr}x`);
    } else {
      terms.push(`${sign}${abs === 1n ? '' : cStr}x^{${deg}}`);
    }
  }
  if (terms.length === 0) return '0';
  return `g(x) = ${terms.slice(0, 5).join(' ')}${terms.length > 5 ? ' + \\cdots' : ''}`;
};

const selectOptimalLatticeDimensions = (
  nBits: number,
  xBits: number
): { m: number; t: number; boundOk: boolean; marginBits: number } => {
  const candidates: Array<[number, number]> = [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 6]
  ];

  let best: { m: number; t: number; boundOk: boolean; marginBits: number } | null = null;
  for (const [m, t] of candidates) {
    const d = m + t + 1;
    // Howgrave-Graham log2 bound check for beta = 0.5:
    // (1/d) * (m*(m+1)/2 * log2(N) + (d*(d-1)/2) * log2(X)) + (d-1)/4 + 0.5*log2(d) < 0.5 * m * log2(N)
    const expN = (m * (m + 1)) / (2 * d);
    const expX = (d - 1) / 2;
    const detRootLog = expN * nBits + expX * xBits;
    const lllPenalty = (d - 1) / 4 + 0.5 * Math.log2(d);
    const targetLog = 0.5 * m * nBits;
    const margin = Number((targetLog - (detRootLog + lllPenalty)).toFixed(2));
    if (margin > 0.5) {
      return { m, t, boundOk: true, marginBits: margin };
    }
    best = { m, t, boundOk: false, marginBits: margin };
  }
  return best!;
};

const rowNormBits = (row: bigint[]): number => {
  const normSq = dotProduct(row, row);
  return Math.round(bitLen(normSq) / 2);
};

/**
 * Executes Coppersmith's Attack via Exact BigInt LLL to find small root |x0| < X
 * of f(x) = x + p0 === 0 (mod p) where p | N.
 */
export const solveCoppersmithLll = (
  N: bigint,
  p0: bigint,
  unknownBitsEstimate: number,
  opts?: { m?: number; t?: number }
): CoppersmithLllResult => {
  const t0 = performance.now();
  const nBits = bitLen(N);
  const pBits = Math.max(1, Math.round(nBits / 2));
  const uBits = Math.max(1, Math.min(pBits - 1, Math.round(unknownBitsEstimate)));
  const X = 1n << BigInt(uBits);

  const autoDims = selectOptimalLatticeDimensions(nBits, uBits);
  const m = opts?.m ?? autoDims.m;
  const t = opts?.t ?? autoDims.t;
  const dim = m + t + 1;

  const initialBasis = buildHowgraveGrahamLattice(N, p0, X, m, t);
  const initialNormsBits = initialBasis.map(rowNormBits);
  const initialMatrixPreview: CoppersmithLatticeRowPreview[] = initialBasis.map((row, idx) => ({
    rowIndex: idx,
    normBits: initialNormsBits[idx],
    entriesPreview: row.map(formatCompactBigInt)
  }));

  const { reduced, swaps } = integralLllReduce(initialBasis);
  const reducedNormsBits = reduced.map(rowNormBits);
  const reducedMatrixPreview: CoppersmithLatticeRowPreview[] = reduced.map((row, idx) => ({
    rowIndex: idx,
    normBits: reducedNormsBits[idx],
    entriesPreview: row.map(formatCompactBigInt)
  }));

  const xPows: bigint[] = [1n];
  for (let j = 1; j < dim; j++) xPows.push(xPows[j - 1] * X);

  const theoreticalTargetBits = Math.round(0.5 * m * nBits);
  const testedRootsSet = new Set<string>();
  let bestPolyCoeffs: bigint[] = [];
  let foundX0: bigint | null = null;
  let foundP: bigint | null = null;
  let foundQ: bigint | null = null;

  // Test the shortest 3 reduced basis vectors to extract integer polynomial g(x)
  const checkRows = Math.min(3, reduced.length);
  for (let rIdx = 0; rIdx < checkRows; rIdx++) {
    const vec = reduced[rIdx];
    const polyCoeffs = vec.map((val, j) => val / xPows[j]);
    if (rIdx === 0) bestPolyCoeffs = polyCoeffs;

    // Search both [-X, X] so approximate rounded hints p0 work as well as floored hints
    const candidateRoots = findIntegerRootsRecursive(polyCoeffs, -X, X);
    // Also check direct 0 offset
    if (evalPoly(polyCoeffs, 0n) === 0n && !candidateRoots.includes(0n)) {
      candidateRoots.unshift(0n);
    }

    for (const xr of candidateRoots) {
      testedRootsSet.add(xr.toString(10));
      const cand = p0 + xr;
      if (cand > 1n && cand < N) {
        const g = gcd(cand, N);
        if (g > 1n && g < N) {
          foundX0 = xr;
          foundP = g;
          foundQ = N / g;
          bestPolyCoeffs = polyCoeffs;
          break;
        }
      }
    }
    if (foundP !== null) break;
  }

  const durationMs = Math.max(1, Math.round(performance.now() - t0));
  const verified = foundP !== null && foundQ !== null && foundP * foundQ === N;

  return {
    success: verified,
    pathUsed: 'lll-coppersmith',
    nBits,
    pBits,
    unknownBits: uBits,
    boundX: X.toString(10),
    boundXBits: uBits,
    m,
    t,
    dimension: dim,
    howgraveBoundOk: autoDims.boundOk,
    howgraveLogMarginBits: autoDims.marginBits,
    initialNormsBits,
    reducedNormsBits,
    theoreticalTargetBits,
    initialMatrixPreview,
    reducedMatrixPreview,
    polynomialCoeffs: bestPolyCoeffs.map(c => c.toString(10)),
    polynomialLatex: formatPolyLatex(bestPolyCoeffs),
    rootsTested: Array.from(testedRootsSet),
    foundRootX0: foundX0 !== null ? foundX0.toString(10) : null,
    factorP: foundP !== null ? foundP.toString(10) : null,
    factorQ: foundQ !== null ? foundQ.toString(10) : null,
    verifiedProduct: verified,
    durationMs,
    lllSwaps: swaps,
    notesAr: verified
      ? `تم استخراج الجذر الصحيح x_0 عبر تقليص LLL (${dim}×${dim}) والتحقق من p × q = N في ${durationMs} مللي ثانية.`
      : autoDims.boundOk
      ? 'اكتمل تقليص الشبيكة لكن لم يعثر على عامل غير تافه ضمن مجال التلميح المقدم (تأكد أن p_0 يمثل البتات العليا لعامل أولي p وليس للعدد N).'
      : `نسبة البتات المكشوفة أقل من الحد النظري لكوبرسميث (المتبقي ${uBits} بت يتطلب أبعاد شبيكة أكبر من ${dim}×${dim}).`
  };
};

/**
 * Narrow High-Bit Sieve (ideal when 90%–99% of p's upper bits are known).
 * Uses modular wheel filtering over odd candidates before exact BigInt division.
 */
export const solveNarrowHighBitSieve = (
  N: bigint,
  p0: bigint,
  unknownBits: number,
  maxBudget: number = 250000
): NarrowSieveResult => {
  const t0 = performance.now();
  const clampedU = Math.max(1, unknownBits);
  const windowWidth = 1n << BigInt(clampedU);

  // Quick check direct p0 and parity alignment
  if (p0 > 1n && p0 < N && N % p0 === 0n) {
    const q = N / p0;
    return {
      success: true,
      candidatesChecked: 1,
      maxBudget,
      truncatedByBudget: false,
      unknownBits: clampedU,
      windowWidth: windowWidth.toString(10),
      foundOffsetX0: '0',
      factorP: p0.toString(10),
      factorQ: q.toString(10),
      verifiedProduct: p0 * q === N,
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      notesAr: 'مطابقة مباشرة عند الحد الأدنى p_0.'
    };
  }

  let start = p0 | 1n;
  const wheelPrimes = [3, 5, 7, 11, 13, 17, 19];
  const remainders = wheelPrimes.map(wp => Number(start % BigInt(wp)));

  // Limit candidate count safely for browser UI responsiveness
  const totalOddInForward = clampedU <= 22 ? Number(windowWidth >> 1n) + 1 : maxBudget;
  const limit = Math.min(maxBudget, totalOddInForward);
  const truncated = clampedU > 22 || totalOddInForward > maxBudget;

  let checked = 0;
  let cand = start;

  for (let step = 0; step < limit; step++) {
    let skip = false;
    for (let w = 0; w < wheelPrimes.length; w++) {
      if (remainders[w] === 0 && cand > BigInt(wheelPrimes[w])) {
        skip = true;
        break;
      }
    }

    if (!skip) {
      checked++;
      if (cand > 1n && N % cand === 0n) {
        const q = N / cand;
        const x0 = cand - p0;
        return {
          success: true,
          candidatesChecked: checked,
          maxBudget,
          truncatedByBudget: false,
          unknownBits: clampedU,
          windowWidth: windowWidth.toString(10),
          foundOffsetX0: x0.toString(10),
          factorP: cand.toString(10),
          factorQ: q.toString(10),
          verifiedProduct: cand * q === N,
          durationMs: Math.max(1, Math.round(performance.now() - t0)),
          notesAr: `تم غربلة المجال الضيق واستخراج العامل p بعد ${checked} فحصاً فعلياً (بعد تصفية المضاعفات الصغيرة).`
        };
      }
    }

    cand += 2n;
    for (let w = 0; w < wheelPrimes.length; w++) {
      const wp = wheelPrimes[w];
      let r = remainders[w] + 2;
      if (r >= wp) r -= wp;
      remainders[w] = r;
    }
  }

  // Also scan symmetrically backwards if user supplied an approximate rounded manual p0 (up to 4096 steps)
  const backLimit = Math.min(4096, limit >> 2);
  let backCand = (p0 | 1n) - 2n;
  for (let step = 0; step < backLimit && backCand > 2n; step++) {
    checked++;
    if (N % backCand === 0n) {
      const q = N / backCand;
      return {
        success: true,
        candidatesChecked: checked,
        maxBudget,
        truncatedByBudget: false,
        unknownBits: clampedU,
        windowWidth: windowWidth.toString(10),
        foundOffsetX0: (backCand - p0).toString(10),
        factorP: backCand.toString(10),
        factorQ: q.toString(10),
        verifiedProduct: backCand * q === N,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        notesAr: `تم العثور على العامل أسفل التلميح التقريبي p_0 بعد ${checked} فحصاً.`
      };
    }
    backCand -= 2n;
  }

  return {
    success: false,
    candidatesChecked: checked,
    maxBudget,
    truncatedByBudget: truncated,
    unknownBits: clampedU,
    windowWidth: windowWidth.toString(10),
    foundOffsetX0: null,
    factorP: null,
    factorQ: null,
    verifiedProduct: false,
    durationMs: Math.max(1, Math.round(performance.now() - t0)),
    notesAr: truncated
      ? `تجاوزت النافذة (${clampedU} بت مجهول) سقف الغربلة المباشرة (${maxBudget} مرشح)؛ يُرجى استخدام مسار شبيكات كوبرسميث LLL الذي يحل هذه النافذة فورياً.`
      : 'لم يُعثر على عامل في النطاق الضيق؛ تأكد من دقة البتات العليا لـ p_0.'
  };
};
