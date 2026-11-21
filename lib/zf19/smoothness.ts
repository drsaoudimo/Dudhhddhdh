export interface SmoothCheckResult {
  isSmooth: boolean;
  exponents: number[];
  gf2Row: number[]; // [signBit, e_1 mod 2, ..., e_r mod 2]
  remainder: bigint;
  exactProductVerified: boolean;
}

/**
 * Trial-factors |Q_(k+1)| over FB = {2, l_1, ..., l_r} and builds exponent + GF(2) parity vector.
 */
export const checkSmoothnessOverBase = (
  absQ: bigint,
  signNeg: boolean,
  fbPrimes: number[]
): SmoothCheckResult => {
  const r = fbPrimes.length;
  const exponents = new Array<number>(r).fill(0);
  let rem = absQ < 0n ? -absQ : absQ;
  if (rem === 0n) {
    return {
      isSmooth: false,
      exponents,
      gf2Row: [signNeg ? 1 : 0, ...exponents],
      remainder: 0n,
      exactProductVerified: false
    };
  }

  let reconstructed = 1n;
  for (let i = 0; i < r; i++) {
    const p = BigInt(fbPrimes[i]);
    if (rem % p === 0n) {
      let e = 0;
      do {
        rem /= p;
        e++;
        reconstructed *= p;
      } while (rem % p === 0n);
      exponents[i] = e;
      if (rem === 1n) break;
    }
  }

  const isSmooth = rem === 1n;
  const exactProductVerified = isSmooth ? reconstructed === absQ : false;
  const gf2Row = [signNeg ? 1 : 0, ...exponents.map(e => e & 1)];

  return {
    isSmooth,
    exponents,
    gf2Row,
    remainder: rem,
    exactProductVerified
  };
};
