import { CoppersmithVerificationChecklist } from '../zfCommon/resultTypes';
import { absBig } from '../zfCommon/gcd';
import { isPrimeIndependent } from '../zfCommon/primality';

/**
 * Independent 7-point verification gate for ZF-18 Coppersmith candidate root x:
 *   1. x is integer
 *   2. |x| < X
 *   3. p = p0 + x, 1 < p < N
 *   4. N mod p == 0
 *   5. q = N / p (and p*q == N)
 *   6. independent primality check on p
 *   7. independent primality check on q
 */
export const verifyZf18Candidate = (
  N: bigint,
  p0: bigint,
  X: bigint,
  candidateX: bigint
): { passed: boolean; checklist: CoppersmithVerificationChecklist; p: bigint | null; q: bigint | null } => {
  const isIntegerRoot = typeof candidateX === 'bigint';
  const withinBoundX = absBig(candidateX) < X;
  const pRaw = p0 + candidateX;
  const pWithinRange = pRaw > 1n && pRaw < N;
  const exactDivision = pWithinRange && N % pRaw === 0n;
  const qRaw = exactDivision ? N / pRaw : 0n;
  const qComputedExact = exactDivision && qRaw > 1n && pRaw * qRaw === N;
  const pPrime = qComputedExact && isPrimeIndependent(pRaw);
  const qPrime = qComputedExact && isPrimeIndependent(qRaw);

  const passed =
    isIntegerRoot &&
    withinBoundX &&
    pWithinRange &&
    exactDivision &&
    qComputedExact &&
    pPrime &&
    qPrime;

  let pOut: bigint | null = null;
  let qOut: bigint | null = null;
  if (passed) {
    const sorted = [pRaw, qRaw].sort((a, b) => (a < b ? -1 : 1));
    pOut = sorted[0];
    qOut = sorted[1];
  }

  return {
    passed,
    checklist: {
      is_integer_root: isIntegerRoot,
      within_bound_X: withinBoundX,
      p_within_range: pWithinRange,
      exact_division_N_mod_p: exactDivision,
      q_computed_exact: qComputedExact,
      p_prime_independent: pPrime,
      q_prime_independent: qPrime
    },
    p: pOut,
    q: qOut
  };
};
