import { legendreSymbolNum } from '../zfCommon/gcd';

export interface Zf19FactorBase {
  primes: number[];
  bound: number;
}

/**
 * Builds Factor Base FB = {2, l_1, l_2, ..., l_r} up to `bound`
 * selecting primes l where Legendre(N, l) = +1.
 */
export const buildZf19FactorBase = (N: bigint, bound: number): Zf19FactorBase => {
  const safeBound = Math.max(5, Math.min(200000, Math.floor(bound)));
  const isComp = new Uint8Array(safeBound + 1);
  const primes: number[] = [2];

  for (let p = 3; p <= safeBound; p += 2) {
    if (!isComp[p]) {
      for (let j = p * p; j <= safeBound; j += 2 * p) {
        isComp[j] = 1;
      }
      const nModP = Number(N % BigInt(p));
      if (nModP === 0) continue; // Do not include direct prime factors of N inside FB
      if (legendreSymbolNum(nModP, p) === 1) {
        primes.push(p);
      }
    }
  }

  return { primes, bound: safeBound };
};
