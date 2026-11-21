export type Zf18Status =
  | 'FACTORS_VERIFIED'
  | 'INSUFFICIENT_HINT'
  | 'ROOT_NOT_FOUND'
  | 'INVALID_CANDIDATE'
  | 'TIME_LIMIT';

export type Zf19Status =
  | 'FACTORS_VERIFIED'
  | 'PERFECT_SQUARE'
  | 'NO_FACTOR_FOUND'
  | 'RELATIONS_INSUFFICIENT'
  | 'DEPENDENCY_NOT_FOUND'
  | 'TRIVIAL_GCD'
  | 'RELATION_VERIFICATION_FAILED'
  | 'TIME_LIMIT';

export type ZfRouterStatus =
  | 'FACTORS_VERIFIED'
  | 'PERFECT_SQUARE'
  | 'PRIME_MODULUS'
  | 'INCONCLUSIVE';

export interface CoppersmithInput {
  N: bigint;
  p0: bigint;
  X: bigint;
  beta: number;
  epsilon: number;
  lattice_m?: number;
  lattice_t?: number;
  timeout_seconds: number;
}

export interface CoppersmithVerificationChecklist {
  is_integer_root: boolean;
  within_bound_X: boolean;
  p_within_range: boolean;
  exact_division_N_mod_p: boolean;
  q_computed_exact: boolean;
  p_prime_independent: boolean;
  q_prime_independent: boolean;
}

export interface CoppersmithResult {
  status: Zf18Status;
  candidate_root: string | null;
  factor_p: string | null;
  factor_q: string | null;
  lattice_dimension: number;
  lattice_m: number;
  lattice_t: number;
  lattice_reduction_time: number;
  root_reconstruction_time: number;
  total_time: number;
  theoretical_bound_bits: number;
  x_bits: number;
  howgrave_bound_satisfied: boolean;
  polynomial_coeffs: string[];
  roots_evaluated: string[];
  lll_swaps: number;
  verification_status: CoppersmithVerificationChecklist;
  diagnostic_message: string;
}

export interface CfracInput {
  N: bigint;
  factor_base_bound: number;
  max_relations: number;
  max_iterations: number;
  matrix_solver: 'gaussian' | 'block-wiedemann';
  timeout_seconds: number;
  enable_partial_relations: boolean;
}

export interface CfracRelationAudit {
  step_k: number;
  a_k: string;
  P_next: string;
  Q_next: string;
  A_k_mod_N: string;
  sign_neg: boolean;
  exponents: number[];
  gf2_row: number[];
  identity_holds: boolean;
  modular_congruence_holds: boolean;
}

export interface CfracVerificationChecklist {
  relations_modular_valid: boolean;
  q_factorizations_exact: boolean;
  gf2_parity_consistent: boolean;
  final_exponents_even: boolean;
  congruence_x2_eq_y2_mod_n: boolean;
  exact_divisor_verified: boolean;
}

export interface CfracResult {
  status: Zf19Status;
  factor_p: string | null;
  factor_q: string | null;
  factor_base_size: number;
  factor_base_primes: number[];
  relations_collected: number;
  smooth_relations: number;
  partial_relations: number;
  iterations_run: number;
  matrix_rows: number;
  matrix_columns: number;
  dependencies_found: number;
  gcd_attempts: number;
  identity_checks_passed: number;
  verification_status: CfracVerificationChecklist;
  sample_relations: CfracRelationAudit[];
  winning_X?: string;
  winning_Y?: string;
  execution_time: number;
  init_time_ms: number;
  expansion_time_ms: number;
  gf2_time_ms: number;
  diagnostic_message: string;
}

export interface RouterHint {
  p0?: bigint;
  X?: bigint;
  beta?: number;
  epsilon?: number;
}

export interface RouterResult {
  status: ZfRouterStatus;
  engine_used: 'PRECHECK' | 'ZF-18' | 'ZF-19' | 'ZF-18->ZF-19';
  factor_p: string | null;
  factor_q: string | null;
  zf18_result?: CoppersmithResult;
  zf19_result?: CfracResult;
  execution_time_ms: number;
  diagnostic_message: string;
}

export interface BenchmarkMetricSummary {
  runs: number;
  median_ms: number;
  iqr_ms: number;
  q1_ms: number;
  q3_ms: number;
  min_ms: number;
  max_ms: number;
  success_rate: number;
}
