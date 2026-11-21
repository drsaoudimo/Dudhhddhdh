import { gcdBig, modPowBig } from '../zfCommon/gcd';

export interface Zf19StoredRelation {
  step_k: number;
  a_k: bigint;
  P_next: bigint;
  Q_next: bigint;
  A_k_mod_N: bigint;
  sign_neg: boolean;
  exponents: number[];
  gf2_row: number[];
  identity_holds: boolean;
  modular_congruence_holds: boolean;
}

export interface DependencyCandidate {
  X: bigint;
  Y: bigint;
  allExponentsEven: boolean;
  signCountEven: boolean;
  congruenceHolds: boolean;
  d1: bigint;
  d2: bigint;
  nontrivialFactor: bigint | null;
}

/**
 * Reconstructs X = prod(A_k) mod N and Y = prod(l_i^(E_i / 2)) mod N
 * from a GF(2) dependency subset of relations, and extracts gcd(X ± Y, N).
 */
export const evaluateDependencyForFactors = (
  N: bigint,
  fbPrimes: number[],
  relations: Zf19StoredRelation[],
  subsetIndices: number[]
): DependencyCandidate => {
  let X = 1n;
  let negCount = 0;
  const totalExps = new Array<number>(fbPrimes.length).fill(0);

  for (const idx of subsetIndices) {
    const rel = relations[idx];
    X = (X * rel.A_k_mod_N) % N;
    if (rel.sign_neg) negCount++;
    for (let i = 0; i < fbPrimes.length; i++) {
      totalExps[i] += rel.exponents[i];
    }
  }

  const signCountEven = (negCount & 1) === 0;
  let allExponentsEven = true;
  let Y = 1n;

  for (let i = 0; i < fbPrimes.length; i++) {
    const exp = totalExps[i];
    if ((exp & 1) !== 0) {
      allExponentsEven = false;
      break;
    }
    if (exp > 0) {
      Y = (Y * modPowBig(BigInt(fbPrimes[i]), BigInt(exp >> 1), N)) % N;
    }
  }

  const x2 = (X * X) % N;
  const y2 = (Y * Y) % N;
  const congruenceHolds = signCountEven && allExponentsEven && x2 === y2;

  const diff = X > Y ? X - Y : Y - X;
  const d1 = gcdBig(diff, N);
  const d2 = gcdBig((X + Y) % N, N);

  let nontrivialFactor: bigint | null = null;
  if (d1 > 1n && d1 < N) nontrivialFactor = d1;
  else if (d2 > 1n && d2 < N) nontrivialFactor = d2;

  return {
    X,
    Y,
    allExponentsEven,
    signCountEven,
    congruenceHolds,
    d1,
    d2,
    nontrivialFactor
  };
};
