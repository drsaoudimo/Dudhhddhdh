import { CoppersmithInput, CoppersmithResult, CoppersmithVerificationChecklist } from '../zfCommon/resultTypes';
import { buildCoppersmithLattice } from './latticeBuilder';
import { runLllReduction } from './lllAdapter';
import { reconstructRootsFromReducedBasis } from './rootReconstruction';
import { verifyZf18Candidate } from './verification';

const emptyChecklist = (): CoppersmithVerificationChecklist => ({
  is_integer_root: false,
  within_bound_X: false,
  p_within_range: false,
  exact_division_N_mod_p: false,
  q_computed_exact: false,
  p_prime_independent: false,
  q_prime_independent: false
});

/**
 * ZF-18 Independent Coppersmith-LLL Engine.
 * Strictly follows CoppersmithInput -> CoppersmithResult with 7-point verification.
 * Never classifies ROOT_NOT_FOUND as PRIME.
 */
export const runZf18Coppersmith = (input: CoppersmithInput): CoppersmithResult => {
  const totalStart = performance.now();
  const { N, p0, X, beta, epsilon, timeout_seconds } = input;
  const m = Math.max(1, input.lattice_m ?? 3);
  const t = Math.max(0, input.lattice_t ?? m);

  if (N < 4n || X < 1n || p0 <= 0n || p0 >= N) {
    return {
      status: 'INVALID_CANDIDATE',
      candidate_root: null,
      factor_p: null,
      factor_q: null,
      lattice_dimension: 0,
      lattice_m: m,
      lattice_t: t,
      lattice_reduction_time: 0,
      root_reconstruction_time: 0,
      total_time: Number((performance.now() - totalStart).toFixed(3)),
      theoretical_bound_bits: 0,
      x_bits: 0,
      howgrave_bound_satisfied: false,
      polynomial_coeffs: [],
      roots_evaluated: [],
      lll_swaps: 0,
      verification_status: emptyChecklist(),
      diagnostic_message: 'مدخلات غير صالحة لهجوم كوبرسميث (تأكد من 0 < p0 < N و X ≥ 1).'
    };
  }

  const built = buildCoppersmithLattice(N, p0, X, beta, epsilon, m, t);

  // If bound X vastly exceeds theoretical Coppersmith bound N^(beta^2 - eps), report INSUFFICIENT_HINT if not even runnable
  const lllRes = runLllReduction(built.basis, Math.max(100, timeout_seconds * 1000));
  if (lllRes.timedOut) {
    return {
      status: 'TIME_LIMIT',
      candidate_root: null,
      factor_p: null,
      factor_q: null,
      lattice_dimension: built.dimension,
      lattice_m: m,
      lattice_t: t,
      lattice_reduction_time: lllRes.reductionTimeMs,
      root_reconstruction_time: 0,
      total_time: Number((performance.now() - totalStart).toFixed(3)),
      theoretical_bound_bits: built.theoreticalBoundLog2,
      x_bits: built.xLog2,
      howgrave_bound_satisfied: built.boundSatisfied,
      polynomial_coeffs: [],
      roots_evaluated: [],
      lll_swaps: lllRes.swaps,
      verification_status: emptyChecklist(),
      diagnostic_message: 'تجاوز تقليص الشبيكة المهلة الزمنية المحددة.'
    };
  }

  const rootRes = reconstructRootsFromReducedBasis(lllRes.reducedBasis, X);
  const firstPoly = rootRes.candidates[0]?.coeffs.map(c => c.toString()) ?? [];
  const rootsEvaluatedStr = rootRes.allRoots.map(r => r.toString());

  let lastChecklist = emptyChecklist();
  let hadInvalidCandidate = false;

  for (const candRoot of rootRes.allRoots) {
    const ver = verifyZf18Candidate(N, p0, X, candRoot);
    lastChecklist = ver.checklist;
    if (ver.passed && ver.p && ver.q) {
      const matchingCand = rootRes.candidates.find(c => c.rootsInBound.includes(candRoot));
      return {
        status: 'FACTORS_VERIFIED',
        candidate_root: candRoot.toString(),
        factor_p: ver.p.toString(),
        factor_q: ver.q.toString(),
        lattice_dimension: built.dimension,
        lattice_m: m,
        lattice_t: t,
        lattice_reduction_time: lllRes.reductionTimeMs,
        root_reconstruction_time: rootRes.reconstructionTimeMs,
        total_time: Number((performance.now() - totalStart).toFixed(3)),
        theoretical_bound_bits: built.theoreticalBoundLog2,
        x_bits: built.xLog2,
        howgrave_bound_satisfied: built.boundSatisfied,
        polynomial_coeffs: (matchingCand?.coeffs ?? []).map(c => c.toString()),
        roots_evaluated: rootsEvaluatedStr,
        lll_swaps: lllRes.swaps,
        verification_status: ver.checklist,
        diagnostic_message: `تم التحقق التام من العاملين p وq عبر شبيكة ${built.dimension}×${built.dimension} (الجذر x0 = ${candRoot}).`
      };
    } else {
      hadInvalidCandidate = true;
    }
  }

  const status = !built.boundSatisfied
    ? 'INSUFFICIENT_HINT'
    : hadInvalidCandidate
    ? 'INVALID_CANDIDATE'
    : 'ROOT_NOT_FOUND';

  return {
    status,
    candidate_root: rootRes.allRoots[0]?.toString() ?? null,
    factor_p: null,
    factor_q: null,
    lattice_dimension: built.dimension,
    lattice_m: m,
    lattice_t: t,
    lattice_reduction_time: lllRes.reductionTimeMs,
    root_reconstruction_time: rootRes.reconstructionTimeMs,
    total_time: Number((performance.now() - totalStart).toFixed(3)),
    theoretical_bound_bits: built.theoreticalBoundLog2,
    x_bits: built.xLog2,
    howgrave_bound_satisfied: built.boundSatisfied,
    polynomial_coeffs: firstPoly,
    roots_evaluated: rootsEvaluatedStr,
    lll_swaps: lllRes.swaps,
    verification_status: lastChecklist,
    diagnostic_message:
      status === 'INSUFFICIENT_HINT'
        ? `التلميح غير كافٍ: log2(X)=${built.xLog2} يتجاوز الحد النظري N^(β²-ε) ≈ 2^${built.theoreticalBoundLog2}.`
        : status === 'INVALID_CANDIDATE'
        ? 'وُجد جذر ضمن كثيرة الحدود المختصرة لكنه فشل في شروط القسمة الدقيقة أو الأولية.'
        : 'لم يُعثر على جذر صحيح ضمن (-X, X) يحقق f(x) ≡ 0 (mod p) — لا يعني ذلك أولية N.'
  };
};
