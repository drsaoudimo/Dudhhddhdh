export interface ConvergentState {
  N: bigint;
  A_prev2: bigint;
  A_prev1: bigint;
  B_prev2: bigint;
  B_prev1: bigint;
  // Exact (non-modular) values tracked while small enough for direct Z identity proof
  A_exact_prev2: bigint;
  A_exact_prev1: bigint;
  B_exact_prev2: bigint;
  B_exact_prev1: bigint;
  trackExact: boolean;
}

export interface ConvergentStep {
  A_k_mod_N: bigint;
  B_k_mod_N: bigint;
  signedQ: bigint; // (-1)^(k+1) * Q_(k+1)
  exactIdentityHolds: boolean;
  modularCongruenceHolds: boolean;
}

export const initConvergents = (N: bigint, trackExact: boolean = true): ConvergentState => ({
  N,
  A_prev2: 0n,
  A_prev1: 1n,
  B_prev2: 1n,
  B_prev1: 0n,
  A_exact_prev2: 0n,
  A_exact_prev1: 1n,
  B_exact_prev2: 1n,
  B_exact_prev1: 0n,
  trackExact
});

/**
 * Advances convergent recurrence:
 *   A_k = a_k * A_{k-1} + A_{k-2}
 *   B_k = a_k * B_{k-1} + B_{k-2}
 * Verifies:
 *   A_k^2 - N * B_k^2 = (-1)^(k+1) * Q_(k+1)
 *   A_k^2 === (-1)^(k+1) * Q_(k+1) (mod N)
 */
export const advanceConvergent = (
  state: ConvergentState,
  k: number,
  a_k: bigint,
  Q_next: bigint
): { result: ConvergentStep; nextState: ConvergentState } => {
  const N = state.N;
  const A_k_mod_N = (a_k * state.A_prev1 + state.A_prev2) % N;
  const B_k_mod_N = (a_k * state.B_prev1 + state.B_prev2) % N;

  const signNeg = ((k + 1) & 1) === 1;
  const signedQ = signNeg ? -Q_next : Q_next;

  // Modular verification: A_k^2 === (-1)^(k+1) * Q_(k+1) (mod N)
  const lhsMod = (A_k_mod_N * A_k_mod_N) % N;
  const rhsMod = ((signedQ % N) + N) % N;
  const modularCongruenceHolds = lhsMod === rhsMod;

  let A_exact = 0n;
  let B_exact = 0n;
  let exactIdentityHolds = modularCongruenceHolds;
  let keepExact = state.trackExact && k <= 250;

  if (keepExact) {
    A_exact = a_k * state.A_exact_prev1 + state.A_exact_prev2;
    B_exact = a_k * state.B_exact_prev1 + state.B_exact_prev2;
    exactIdentityHolds = A_exact * A_exact - N * B_exact * B_exact === signedQ;
  }

  return {
    result: {
      A_k_mod_N,
      B_k_mod_N,
      signedQ,
      exactIdentityHolds,
      modularCongruenceHolds
    },
    nextState: {
      N,
      A_prev2: state.A_prev1,
      A_prev1: A_k_mod_N,
      B_prev2: state.B_prev1,
      B_prev1: B_k_mod_N,
      A_exact_prev2: keepExact ? state.A_exact_prev1 : 0n,
      A_exact_prev1: keepExact ? A_exact : 0n,
      B_exact_prev2: keepExact ? state.B_exact_prev1 : 0n,
      B_exact_prev1: keepExact ? B_exact : 0n,
      trackExact: keepExact
    }
  };
};
