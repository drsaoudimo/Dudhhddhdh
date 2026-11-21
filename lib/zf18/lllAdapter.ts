export interface LllReductionResult {
  reducedBasis: bigint[][];
  swaps: number;
  iterations: number;
  timedOut: boolean;
  reductionTimeMs: number;
}

const dot = (a: bigint[], b: bigint[]): bigint => {
  let s = 0n;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * Exact BigInt Cohen Integral LLL (Algorithm 2.6.7) adapter.
 * Zero floating-point operations during Gram-Schmidt orthogonalization or Lovász swaps.
 */
export const runLllReduction = (
  inputBasis: bigint[][],
  timeoutMs: number = 15000,
  deltaNum: bigint = 99n,
  deltaDen: bigint = 100n
): LllReductionResult => {
  const start = performance.now();
  const n = inputBasis.length;
  if (n <= 1) {
    return {
      reducedBasis: inputBasis.map(r => [...r]),
      swaps: 0,
      iterations: 0,
      timedOut: false,
      reductionTimeMs: Number((performance.now() - start).toFixed(3))
    };
  }

  const cols = inputBasis[0].length;
  const basis = inputBasis.map(r => [...r]);
  const D = new Array<bigint>(n + 1).fill(1n);
  const lambda: bigint[][] = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let u = dot(basis[i], basis[j]);
      for (let k = 0; k < j; k++) {
        u = (D[k + 1] * u - lambda[i][k] * lambda[j][k]) / D[k];
      }
      if (j < i) lambda[i][j] = u;
      else D[i + 1] = u;
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
      for (let c = 0; c < cols; c++) basis[k][c] -= q * basis[l][c];
      lambda[k][l] -= q * denom;
      for (let j = 0; j < l; j++) lambda[k][j] -= q * lambda[l][j];
    }
  };

  let k = 1;
  let swaps = 0;
  let iterations = 0;
  let timedOut = false;
  const maxIter = Math.max(2500, n * n * 50);

  while (k < n && iterations < maxIter) {
    if ((iterations & 63) === 0 && performance.now() - start > timeoutMs) {
      timedOut = true;
      break;
    }
    iterations++;
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
      for (let l = k - 2; l >= 0; l--) sizeReduce(k, l);
      k++;
    }
  }

  return {
    reducedBasis: basis,
    swaps,
    iterations,
    timedOut,
    reductionTimeMs: Number((performance.now() - start).toFixed(3))
  };
};
