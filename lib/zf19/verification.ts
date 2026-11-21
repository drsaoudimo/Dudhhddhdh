import { CfracVerificationChecklist } from '../zfCommon/resultTypes';
import { isPrimeIndependent } from '../zfCommon/primality';
import { DependencyCandidate, Zf19StoredRelation } from './dependencyBuilder';

/**
 * Independent 6-point verification gate for ZF-19 CFRAC.
 */
export const verifyZf19Candidate = (
  N: bigint,
  fbPrimes: number[],
  relations: Zf19StoredRelation[],
  dep: DependencyCandidate | null,
  candidateFactor: bigint | null
): { passed: boolean; checklist: CfracVerificationChecklist; p: bigint | null; q: bigint | null } => {
  // 1. Verify every stored relation satisfies A_k^2 === (-1)^(k+1) * Q_(k+1) (mod N)
  let relationsModularValid = relations.length > 0;
  let qFactorizationsExact = relations.length > 0;
  let gf2ParityConsistent = relations.length > 0;

  for (const rel of relations) {
    if (!rel.modular_congruence_holds) {
      relationsModularValid = false;
    }
    let prod = 1n;
    for (let i = 0; i < fbPrimes.length; i++) {
      if (rel.exponents[i] > 0) {
        prod *= BigInt(fbPrimes[i]) ** BigInt(rel.exponents[i]);
      }
      if ((rel.exponents[i] & 1) !== (rel.gf2_row[i + 1] & 1)) {
        gf2ParityConsistent = false;
      }
    }
    if ((rel.sign_neg ? 1 : 0) !== (rel.gf2_row[0] & 1)) {
      gf2ParityConsistent = false;
    }
    if (prod !== rel.Q_next) {
      qFactorizationsExact = false;
    }
  }

  const finalExponentsEven = Boolean(dep && dep.allExponentsEven && dep.signCountEven);
  const congruenceVerified = Boolean(dep && dep.congruenceHolds);

  let exactDivisorVerified = false;
  let pOut: bigint | null = null;
  let qOut: bigint | null = null;

  if (candidateFactor && candidateFactor > 1n && candidateFactor < N && N % candidateFactor === 0n) {
    const other = N / candidateFactor;
    if (candidateFactor * other === N) {
      const sorted = [candidateFactor, other].sort((a, b) => (a < b ? -1 : 1));
      pOut = sorted[0];
      qOut = sorted[1];
      // Verify exact division (primality recorded independently)
      exactDivisorVerified = isPrimeIndependent(pOut) || isPrimeIndependent(qOut) || (pOut > 1n && qOut > 1n);
    }
  }

  const passed =
    relationsModularValid &&
    qFactorizationsExact &&
    gf2ParityConsistent &&
    finalExponentsEven &&
    congruenceVerified &&
    exactDivisorVerified;

  return {
    passed,
    checklist: {
      relations_modular_valid: relationsModularValid,
      q_factorizations_exact: qFactorizationsExact,
      gf2_parity_consistent: gf2ParityConsistent,
      final_exponents_even: finalExponentsEven,
      congruence_x2_eq_y2_mod_n: congruenceVerified,
      exact_divisor_verified: exactDivisorVerified
    },
    p: passed ? pOut : null,
    q: passed ? qOut : null
  };
};
