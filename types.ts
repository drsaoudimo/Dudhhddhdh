export interface RSAKey {
  p: string;
  q: string;
  n: string;
  e: string;
  d: string;
  bits: number;
}

export interface Relation {
  x: string;          // The number we squared (random or sqrt(N)+i)
  val: string;        // x^2 mod N
  factors: number[];  // Exponent vector for the factor base
  smooth: boolean;
}

export interface FactorBase {
  primes: number[];
}

export interface SimulationState {
  status: 'idle' | 'sieving' | 'matrix' | 'solving' | 'success' | 'failed';
  logs: string[];
  relations: Relation[];
  factorBase: number[];
  matrix: number[][]; // The binary matrix
  solution: {
    x: string;
    y: string;
    factor1: string;
    factor2: string;
  } | null;
  executionTime?: number;
  cycles?: number;
}