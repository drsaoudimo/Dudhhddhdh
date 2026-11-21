import { bigIntSqrtFloor } from '../zfCommon/gcd';

export interface ReconstructedPolyCandidate {
  vectorIndex: number;
  coeffs: bigint[];
  rootsInBound: bigint[];
}

const evalPoly = (coeffs: bigint[], x: bigint): bigint => {
  let acc = 0n;
  for (let i = coeffs.length - 1; i >= 0; i--) acc = acc * x + coeffs[i];
  return acc;
};

const derivPoly = (coeffs: bigint[]): bigint[] => {
  if (coeffs.length <= 1) return [0n];
  const d: bigint[] = [];
  for (let i = 1; i < coeffs.length; i++) d.push(coeffs[i] * BigInt(i));
  return d;
};

const trimPoly = (coeffs: bigint[]): bigint[] => {
  let end = coeffs.length - 1;
  while (end > 0 && coeffs[end] === 0n) end--;
  return coeffs.slice(0, end + 1);
};

const bisectMonotonic = (coeffs: bigint[], lo: bigint, hi: bigint): bigint[] => {
  if (lo > hi) return [];
  const fLo = evalPoly(coeffs, lo);
  if (fLo === 0n) return [lo];
  const fHi = evalPoly(coeffs, hi);
  if (fHi === 0n) return [hi];
  if ((fLo > 0n && fHi > 0n) || (fLo < 0n && fHi < 0n)) return [];

  const inc = fLo < 0n;
  let l = lo;
  let r = hi;
  while (l <= r) {
    const mid = (l + r) >> 1n;
    const fMid = evalPoly(coeffs, mid);
    if (fMid === 0n) return [mid];
    if (inc ? fMid < 0n : fMid > 0n) l = mid + 1n;
    else r = mid - 1n;
  }
  return [];
};

const findRealBrackets = (rawCoeffs: bigint[], lo: bigint, hi: bigint): bigint[] => {
  const coeffs = trimPoly(rawCoeffs);
  const deg = coeffs.length - 1;
  if (deg <= 0) return [];
  if (deg === 1) {
    const pt = (-coeffs[0]) / coeffs[1];
    return pt >= lo && pt <= hi ? [pt] : [];
  }
  const crit = findRealBrackets(derivPoly(coeffs), lo, hi);
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

export const findIntegerRootsInInterval = (
  rawCoeffs: bigint[],
  lo: bigint,
  hi: bigint
): bigint[] => {
  const coeffs = trimPoly(rawCoeffs);
  const deg = coeffs.length - 1;
  if (deg <= 0 || lo > hi) return [];

  if (deg === 1) {
    const c0 = coeffs[0];
    const c1 = coeffs[1];
    if (c1 !== 0n && (-c0) % c1 === 0n) {
      const r = (-c0) / c1;
      if (r >= lo && r <= hi) return [r];
    }
    return [];
  }

  if (deg === 2) {
    const c = coeffs[0];
    const b = coeffs[1];
    const a = coeffs[2];
    const disc = b * b - 4n * a * c;
    if (disc < 0n) return [];
    const s = bigIntSqrtFloor(disc);
    if (s * s !== disc) return [];
    const denom = 2n * a;
    const out: bigint[] = [];
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

  const brackets = findRealBrackets(derivPoly(coeffs), lo, hi);
  const pts: bigint[] = [lo, ...brackets, hi].sort((u, v) => (u < v ? -1 : u > v ? 1 : 0));
  const found = new Set<bigint>();
  for (let i = 0; i < pts.length - 1; i++) {
    for (const r of bisectMonotonic(coeffs, pts[i], pts[i + 1])) found.add(r);
    for (const offset of [-1n, 0n, 1n]) {
      const probe = pts[i] + offset;
      if (probe >= lo && probe <= hi && evalPoly(coeffs, probe) === 0n) found.add(probe);
    }
  }
  return Array.from(found);
};

/**
 * Reconstructs small polynomials h(x) from ALL reduced LLL basis vectors
 * (never assumes only vector 0 yields the root) and extracts integer roots in (-X, X).
 */
export const reconstructRootsFromReducedBasis = (
  reducedBasis: bigint[][],
  X: bigint
): { candidates: ReconstructedPolyCandidate[]; allRoots: bigint[]; reconstructionTimeMs: number } => {
  const start = performance.now();
  const dim = reducedBasis.length;
  const xPows: bigint[] = [1n];
  for (let j = 1; j < dim; j++) xPows.push(xPows[j - 1] * X);

  const lo = -(X - 1n);
  const hi = X - 1n;
  const candidates: ReconstructedPolyCandidate[] = [];
  const rootSet = new Set<bigint>();

  for (let vIdx = 0; vIdx < reducedBasis.length; vIdx++) {
    const row = reducedBasis[vIdx];
    // Reconstruct h(x) coefficients by reversing X^j scaling
    const coeffs = row.map((val, j) => val / xPows[j]);
    const roots = findIntegerRootsInInterval(coeffs, lo, hi);
    if (evalPoly(coeffs, 0n) === 0n && !roots.includes(0n) && 0n >= lo && 0n <= hi) {
      roots.unshift(0n);
    }
    for (const r of roots) rootSet.add(r);
    candidates.push({
      vectorIndex: vIdx,
      coeffs,
      rootsInBound: roots
    });
  }

  return {
    candidates,
    allRoots: Array.from(rootSet),
    reconstructionTimeMs: Number((performance.now() - start).toFixed(3))
  };
};
