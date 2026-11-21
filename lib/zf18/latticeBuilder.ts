import { bitLengthBig } from '../zfCommon/gcd';

export interface BuiltCoppersmithLattice {
  basis: bigint[][];
  dimension: number;
  m: number;
  t: number;
  theoreticalBoundLog2: number;
  xLog2: number;
  boundSatisfied: boolean;
}

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

/**
 * Checks Coppersmith univariate bound |x0| < N^(beta^2 / delta - epsilon) with delta = 1
 * and constructs Howgrave-Graham shift lattice:
 *   g_{i,0}(X*y) = N^(m - i) * (X*y + p0)^i   for i = 0..m-1
 *   h_{m,j}(X*y) = (X*y)^j * (X*y + p0)^m     for j = 0..t
 */
export const buildCoppersmithLattice = (
  N: bigint,
  p0: bigint,
  X: bigint,
  beta: number,
  epsilon: number,
  m: number,
  t: number
): BuiltCoppersmithLattice => {
  const nBits = bitLengthBig(N);
  const xBits = bitLengthBig(X > 1n ? X - 1n : 1n);
  const maxExp = Math.max(0, beta * beta - epsilon);
  const theoreticalBoundLog2 = Number((maxExp * nBits).toFixed(2));
  const boundSatisfied = xBits <= theoreticalBoundLog2 + 0.5;

  const dim = m + t + 1;
  const basis: bigint[][] = [];
  const fPoly: bigint[] = [p0, 1n];

  const xPows: bigint[] = [1n];
  for (let j = 1; j < dim; j++) xPows.push(xPows[j - 1] * X);

  for (let i = 0; i < m; i++) {
    const nPow = N ** BigInt(m - i);
    const fPow = polyPow(fPoly, i);
    const row = new Array<bigint>(dim).fill(0n);
    for (let j = 0; j < fPow.length; j++) {
      row[j] = nPow * fPow[j] * xPows[j];
    }
    basis.push(row);
  }

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

  return {
    basis,
    dimension: dim,
    m,
    t,
    theoreticalBoundLog2,
    xLog2: xBits,
    boundSatisfied
  };
};
