import { modPowBig } from './gcd';

const DETERMINISTIC_BASES_64 = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
const EXTRA_BASES = [41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n];

/**
 * Independent primality verifier (Miller-Rabin with deterministic bases up to 2^64
 * plus extended prime bases for large RSA moduli).
 */
export const isPrimeIndependent = (n: bigint, rounds: number = 16): boolean => {
  if (n < 2n) return false;
  for (const p of DETERMINISTIC_BASES_64) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  if (n < 1681n) return true;

  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }

  const allBases = [...DETERMINISTIC_BASES_64, ...EXTRA_BASES].slice(0, Math.max(12, rounds));
  for (const a of allBases) {
    if (a >= n) break;
    let x = modPowBig(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let witnessComposite = true;
    for (let r = 1; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        witnessComposite = false;
        break;
      }
    }
    if (witnessComposite) return false;
  }
  return true;
};
