export const absBig = (a: bigint): bigint => (a < 0n ? -a : a);

export const gcdBig = (a: bigint, b: bigint): bigint => {
  let x = absBig(a);
  let y = absBig(b);
  while (y > 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

export const extendedGcdBig = (a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } => {
  let oldR = a;
  let r = b;
  let oldS = 1n;
  let s = 0n;
  let oldT = 0n;
  let t = 1n;
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  return { g: oldR, x: oldS, y: oldT };
};

export const modPowBig = (base: bigint, exp: bigint, mod: bigint): bigint => {
  if (mod === 1n) return 0n;
  let res = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return res;
};

export const bigIntSqrtFloor = (val: bigint): bigint => {
  if (val < 0n) throw new Error('Square root of negative BigInt is undefined');
  if (val < 2n) return val;
  let x0 = val >> 1n;
  let x1 = (x0 + val / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + val / x0) >> 1n;
  }
  return x0;
};

export const isPerfectSquareBig = (val: bigint): { isSquare: boolean; root: bigint } => {
  if (val < 0n) return { isSquare: false, root: 0n };
  if (val === 0n) return { isSquare: true, root: 0n };
  const r64 = Number(val & 63n);
  if (
    r64 !== 0 && r64 !== 1 && r64 !== 4 && r64 !== 9 && r64 !== 16 && r64 !== 17 &&
    r64 !== 25 && r64 !== 33 && r64 !== 36 && r64 !== 41 && r64 !== 49 && r64 !== 57
  ) {
    return { isSquare: false, root: 0n };
  }
  const s = bigIntSqrtFloor(val);
  return { isSquare: s * s === val, root: s };
};

export const legendreSymbolNum = (nModP: number, p: number): -1 | 0 | 1 => {
  if (p === 2) return (nModP & 1) === 0 ? 0 : 1;
  const r = ((nModP % p) + p) % p;
  if (r === 0) return 0;
  const val = modPowBig(BigInt(r), BigInt((p - 1) >> 1), BigInt(p));
  if (val === 1n) return 1;
  return -1;
};

export const bitLengthBig = (n: bigint): number => {
  const a = absBig(n);
  return a === 0n ? 0 : a.toString(2).length;
};
