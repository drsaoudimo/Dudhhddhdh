import { bigIntSqrtFloor } from '../zfCommon/gcd';

export interface ContinuedFractionState {
  N: bigint;
  a0: bigint;
  k: number;
  P: bigint;
  Q: bigint;
  a: bigint;
}

export interface ContinuedFractionStep {
  k: number;
  a_k: bigint;
  P_next: bigint;
  Q_next: bigint;
  exactDivisionOk: boolean;
}

export const initContinuedFraction = (N: bigint): ContinuedFractionState => {
  const a0 = bigIntSqrtFloor(N);
  return {
    N,
    a0,
    k: 0,
    P: 0n,
    Q: 1n,
    a: a0
  };
};

/**
 * Computes one exact CFRAC recurrence step:
 *   a_k     = floor((a0 + P_k) / Q_k)
 *   P_{k+1} = a_k * Q_k - P_k
 *   Q_{k+1} = (N - P_{k+1}^2) / Q_k   (must divide with zero remainder)
 */
export const stepContinuedFraction = (
  state: ContinuedFractionState
): { step: ContinuedFractionStep; nextState: ContinuedFractionState } => {
  const a_k = (state.a0 + state.P) / state.Q;
  const P_next = a_k * state.Q - state.P;
  const num = state.N - P_next * P_next;
  const exactDivisionOk = num % state.Q === 0n;
  if (!exactDivisionOk) {
    throw new Error(`CFRAC exact division invariant failed at step k=${state.k}`);
  }
  const Q_next = num / state.Q;

  return {
    step: {
      k: state.k,
      a_k,
      P_next,
      Q_next,
      exactDivisionOk
    },
    nextState: {
      N: state.N,
      a0: state.a0,
      k: state.k + 1,
      P: P_next,
      Q: Q_next,
      a: a_k
    }
  };
};
