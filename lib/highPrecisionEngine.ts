// Symbolic Exact Quadratic Surd Arithmetic (Q(sqrt(d))) + 500-Decimal-Digit Arbitrary Precision Engine
// Maintains 30 internal guard digits (total 10^530 scale) and formats/rounds outputs to 500 decimal digits.

export const HP_DEC_DIGITS = 500;
export const HP_GUARD_DIGITS = 30;
export const HP_WORK_DIGITS = HP_DEC_DIGITS + HP_GUARD_DIGITS; // 530
export const HP_WORK_SCALE = 10n ** BigInt(HP_WORK_DIGITS);
export const HP_OUT_SCALE = 10n ** BigInt(HP_DEC_DIGITS);
const GUARD_SCALE = 10n ** BigInt(HP_GUARD_DIGITS);
const HALF_GUARD = GUARD_SCALE >> 1n;

export type BD500 = bigint; // Scaled fixed-point integer representing value / 10^530

export interface ExactSurd {
  // Represents (a + b * sqrt(d)) / c  where d >= 1 is square-free and c > 0
  a: bigint;
  b: bigint;
  d: bigint;
  c: bigint;
  isExactRational: boolean;
  canonicalText: string;
  decimal500: string;
  decimalPreview: string;
}

const bigAbs = (x: bigint): bigint => (x < 0n ? -x : x);

export const gcdHp = (a: bigint, b: bigint): bigint => {
  let x = bigAbs(a);
  let y = bigAbs(b);
  while (y > 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

export const bigIntSqrtFloor = (n: bigint): bigint => {
  if (n < 0n) return 0n;
  if (n < 2n) return n;
  let bitLen = BigInt(n.toString(2).length);
  let x = 1n << ((bitLen + 1n) >> 1n);
  while (true) {
    const next = (x + n / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
};

// --- Core BigDecimal (530-digit work / 500-digit output) ---

export const bdZero = (): BD500 => 0n;
export const bdOne = (): BD500 => HP_WORK_SCALE;

export const bdFromBigInt = (n: bigint): BD500 => n * HP_WORK_SCALE;

export const bdFromRational = (num: bigint, den: bigint): BD500 => {
  if (den === 0n) return 0n;
  const neg = (num < 0n) !== (den < 0n);
  const an = bigAbs(num);
  const ad = bigAbs(den);
  const q = (an * HP_WORK_SCALE + (ad >> 1n)) / ad;
  return neg ? -q : q;
};

export const bdFromString = (raw: string): BD500 => {
  const s = raw.trim();
  if (!s) return 0n;
  const neg = s.startsWith('-');
  const body = (neg || s.startsWith('+')) ? s.slice(1) : s;
  const parts = body.toLowerCase().split('e');
  const mant = parts[0];
  const expShift = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;

  const dotIdx = mant.indexOf('.');
  let intPart = dotIdx >= 0 ? mant.slice(0, dotIdx) : mant;
  let fracPart = dotIdx >= 0 ? mant.slice(dotIdx + 1) : '';
  intPart = intPart.replace(/[^0-9]/g, '') || '0';
  fracPart = fracPart.replace(/[^0-9]/g, '');

  const digits = intPart + fracPart;
  const currentFracLen = fracPart.length - expShift;
  const neededFrac = HP_WORK_DIGITS;
  const delta = neededFrac - currentFracLen;

  let val = BigInt(digits || '0');
  if (delta >= 0) {
    val *= 10n ** BigInt(delta);
  } else {
    const div = 10n ** BigInt(-delta);
    val = (val + (div >> 1n)) / div;
  }
  return neg ? -val : val;
};

export const bdFromNumber = (x: number): BD500 => {
  if (!Number.isFinite(x)) return 0n;
  if (x === 0) return 0n;
  return bdFromString(x.toString());
};

export const bdNeg = (a: BD500): BD500 => -a;
export const bdAbs = (a: BD500): BD500 => (a < 0n ? -a : a);
export const bdAdd = (a: BD500, b: BD500): BD500 => a + b;
export const bdSub = (a: BD500, b: BD500): BD500 => a - b;

export const bdMul = (a: BD500, b: BD500): BD500 => {
  if (a === 0n || b === 0n) return 0n;
  const prod = a * b;
  const half = HP_WORK_SCALE >> 1n;
  return prod >= 0n
    ? (prod + half) / HP_WORK_SCALE
    : -((-prod + half) / HP_WORK_SCALE);
};

export const bdDiv = (a: BD500, b: BD500): BD500 => {
  if (b === 0n) return 0n;
  if (a === 0n) return 0n;
  const neg = (a < 0n) !== (b < 0n);
  const aa = bigAbs(a);
  const ab = bigAbs(b);
  const q = (aa * HP_WORK_SCALE + (ab >> 1n)) / ab;
  return neg ? -q : q;
};

export const bdDivInt = (a: BD500, k: number | bigint): BD500 => {
  const kb = typeof k === 'bigint' ? k : BigInt(k);
  if (kb === 0n) return 0n;
  const neg = (a < 0n) !== (kb < 0n);
  const aa = bigAbs(a);
  const ak = bigAbs(kb);
  const q = (aa + (ak >> 1n)) / ak;
  return neg ? -q : q;
};

export const bdMulInt = (a: BD500, k: number | bigint): BD500 =>
  a * (typeof k === 'bigint' ? k : BigInt(k));

export const bdRoundFloor = (a: BD500): bigint => {
  if (a >= 0n) return a / HP_WORK_SCALE;
  return -((-a + HP_WORK_SCALE - 1n) / HP_WORK_SCALE);
};

export const bdRoundNearest = (a: BD500): bigint => {
  const half = HP_WORK_SCALE >> 1n;
  if (a >= 0n) return (a + half) / HP_WORK_SCALE;
  return -((-a + half) / HP_WORK_SCALE);
};

export const bdToString = (a: BD500, digits: number = HP_DEC_DIGITS, trimTrailingZeros = false): string => {
  const cappedDigits = Math.max(0, Math.min(HP_DEC_DIGITS, digits));
  const neg = a < 0n;
  const absA = bigAbs(a);
  // Drop unused guard + extra fractional digits with half-up rounding
  const dropDigits = HP_WORK_DIGITS - cappedDigits;
  const dropScale = 10n ** BigInt(dropDigits);
  const rounded = (absA + (dropScale >> 1n)) / dropScale;

  if (cappedDigits === 0) {
    return (neg && rounded > 0n ? '-' : '') + rounded.toString();
  }

  const decScale = 10n ** BigInt(cappedDigits);
  const intPart = rounded / decScale;
  let fracStr = (rounded % decScale).toString().padStart(cappedDigits, '0');
  if (trimTrailingZeros) {
    fracStr = fracStr.replace(/0+$/, '');
    if (!fracStr) return (neg && intPart > 0n ? '-' : '') + intPart.toString();
  }
  const sign = neg && (intPart > 0n || rounded > 0n) ? '-' : '';
  return `${sign}${intPart.toString()}.${fracStr}`;
};

export const bdPreview = (a: BD500, digits: number = 18): string => {
  const full = bdToString(a, Math.min(HP_DEC_DIGITS, Math.max(4, digits)), false);
  return full;
};

export const bdToNumber = (a: BD500): number => {
  // Convert safely from reduced precision string without precision panic
  return Number(bdToString(a, 18, false));
};

export const bdSqrt = (a: BD500): BD500 => {
  if (a <= 0n) return 0n;
  const scaled = a * HP_WORK_SCALE;
  return bigIntSqrtFloor(scaled);
};

export const bdNthRoot = (a: BD500, k: number): BD500 => {
  if (k <= 1) return a;
  if (k === 2) return bdSqrt(a);
  if (a <= 0n) return 0n;
  const fApprox = Math.pow(Math.max(1e-300, bdToNumber(a)), 1 / k);
  let x = bdFromNumber(fApprox);
  if (x <= 0n) x = bdOne();
  const km1 = k - 1;
  for (let i = 0; i < 16; i++) {
    let xPow = bdOne();
    for (let j = 0; j < km1; j++) xPow = bdMul(xPow, x);
    if (xPow === 0n) break;
    const term = bdDiv(a, xPow);
    const next = bdDivInt(bdMulInt(x, km1) + term, k);
    if (bdAbs(next - x) <= GUARD_SCALE >> 8n) {
      x = next;
      break;
    }
    x = next;
  }
  return x;
};

export const bdPowInt = (base: BD500, exp: number): BD500 => {
  if (exp === 0) return bdOne();
  if (exp < 0) return bdDiv(bdOne(), bdPowInt(base, -exp));
  let res = bdOne();
  let b = base;
  let e = exp;
  while (e > 0) {
    if ((e & 1) === 1) res = bdMul(res, b);
    e >>= 1;
    if (e > 0) b = bdMul(b, b);
  }
  return res;
};

// --- Lazy-Memoized 530-Digit Fundamental Constants ---

let CACHED_PI: BD500 | null = null;
let CACHED_LN2: BD500 | null = null;
let CACHED_LN10: BD500 | null = null;
let CACHED_E: BD500 | null = null;
let CACHED_GAMMA: BD500 | null = null;

// arctan(1 / q) for integer q >= 2 via alternating odd-power series
const arctanInvInt = (q: bigint): BD500 => {
  const q2 = q * q;
  let term = HP_WORK_SCALE / q;
  let sum = term;
  let k = 1n;
  while (term !== 0n) {
    term /= q2;
    const denom = 2n * k + 1n;
    const delta = term / denom;
    if (delta === 0n) break;
    sum += (k & 1n) === 1n ? -delta : delta;
    k += 1n;
  }
  return sum;
};

export const bdPi = (): BD500 => {
  if (CACHED_PI !== null) return CACHED_PI;
  // Machin's formula: pi = 16 * arctan(1/5) - 4 * arctan(1/239)
  CACHED_PI = 16n * arctanInvInt(5n) - 4n * arctanInvInt(239n);
  return CACHED_PI;
};

export const bdTwoPi = (): BD500 => bdPi() * 2n;
export const bdHalfPi = (): BD500 => bdPi() >> 1n;

// atanh(p/q) helper for integer rationals |p/q| < 1
const atanhRational = (p: bigint, q: bigint): BD500 => {
  const p2 = p * p;
  const q2 = q * q;
  let term = (HP_WORK_SCALE * p) / q;
  let sum = term;
  let k = 1n;
  while (term !== 0n) {
    term = (term * p2) / q2;
    const delta = term / (2n * k + 1n);
    if (delta === 0n) break;
    sum += delta;
    k += 1n;
  }
  return sum;
};

export const bdLn2 = (): BD500 => {
  if (CACHED_LN2 !== null) return CACHED_LN2;
  // ln(2) = 18*atanh(1/26) - 2*atanh(1/4801) + 8*atanh(1/8749)  Wait: simplest fast Machin-like for ln2 & ln5:
  // ln(2) = 2 * atanh(1/3) + 2*atanh(1/7)? No: (4/3)/(2/3)=2 and 2 = (3/2)*(4/3) => ln(2) = ln(3/2) + ln(4/3)
  // Using atanh(1/5) = 0.5*ln(3/2), atanh(1/7) = 0.5*ln(4/3): ln(2) = 2*atanh(1/5) + 2*atanh(1/7)
  // Even faster: 2 = (31/30)... using a=atanh(1/31), b=atanh(1/49), c=atanh(1/161):
  // Classic identity: ln(2) = 14*atanh(1/31) + 10*atanh(1/49) + 6*atanh(1/161) -> converges in ~180 tiny steps!
  CACHED_LN2 = 14n * atanhRational(1n, 31n) + 10n * atanhRational(1n, 49n) + 6n * atanhRational(1n, 161n);
  return CACHED_LN2;
};

export const bdLn10 = (): BD500 => {
  if (CACHED_LN10 !== null) return CACHED_LN10;
  // Classic identity: ln(10) = 46*atanh(1/31) + 34*atanh(1/49) + 20*atanh(1/161)
  CACHED_LN10 = 46n * atanhRational(1n, 31n) + 34n * atanhRational(1n, 49n) + 20n * atanhRational(1n, 161n);
  return CACHED_LN10;
};

export const bdE = (): BD500 => {
  if (CACHED_E !== null) return CACHED_E;
  let sum = HP_WORK_SCALE;
  let term = HP_WORK_SCALE;
  for (let n = 1n; n < 400n; n++) {
    term /= n;
    if (term === 0n) break;
    sum += term;
  }
  CACHED_E = sum;
  return CACHED_E;
};

// Euler-Mascheroni constant gamma to 530+ digits via Brent-McMillan Bessel identity / clean precomputed 540 digits
export const bdEulerGamma = (): BD500 => {
  if (CACHED_GAMMA !== null) return CACHED_GAMMA;
  // Exact 530 decimal digits of Euler-Mascheroni constant gamma:
  const gammaStr =
    '0.5772156649015328606065120900824024310421593359399235988057672348848677267776646709369470632917467495' +
    '1463144724980708248096050401448654283622417399764492353625350033374293733773767394279259525824709491' +
    '6008735203948165670853233151776611528621199501507984793745085705740029921354786146694029604325421519' +
    '0587755352673313992540129674205137541395491116851028079842348775872050384310939973613725530608893312' +
    '6760017247953783675927135157722610273492913940798430103417771778088154957066107501016191663340152278' +
    '935867965497252036212879226555';
  CACHED_GAMMA = bdFromString(gammaStr);
  return CACHED_GAMMA;
};

// --- Transcendental Functions to Full 500-Digit Precision ---

export const bdLn = (x: BD500): BD500 => {
  if (x <= 0n) return 0n;
  if (x === HP_WORK_SCALE) return 0n;

  // Binary range reduction: x = y * 2^k with y in [1, 2)
  let y = x;
  let k = 0;
  while (y >= 2n * HP_WORK_SCALE) {
    const excessBits = Math.max(1, (y / HP_WORK_SCALE).toString(2).length - 1);
    y >>= BigInt(excessBits);
    k += excessBits;
  }
  while (y < HP_WORK_SCALE) {
    const deficitBits = Math.max(1, (HP_WORK_SCALE / y).toString(2).length);
    y <<= BigInt(deficitBits);
    k -= deficitBits;
    if (y >= 2n * HP_WORK_SCALE) {
      y >>= 1n;
      k += 1;
    }
  }

  // Repeated square-root argument reduction: 8 halvings -> |u| < 0.00136
  for (let i = 0; i < 8; i++) {
    y = bdSqrt(y);
  }

  // u = (y - 1) / (y + 1), ln(y) = 2 * (u + u^3/3 + u^5/5 + ...)
  const u = bdDiv(y - HP_WORK_SCALE, y + HP_WORK_SCALE);
  const u2 = bdMul(u, u);
  let term = u;
  let sum = u;
  let denom = 3n;
  while (term !== 0n) {
    term = bdMul(term, u2);
    const delta = term / denom;
    if (delta === 0n) break;
    sum += delta;
    denom += 2n;
  }

  const lnReduced = sum * 512n; // 2 * 2^8
  return k === 0 ? lnReduced : lnReduced + bdMulInt(bdLn2(), k);
};

export const bdLnBigInt = (n: bigint): BD500 => {
  if (n <= 0n) return 0n;
  if (n === 1n) return 0n;
  // Normalize directly using bit shift without overflowing scale
  const bitLen = n.toString(2).length;
  const k = bitLen - 1;
  // Build y = n / 2^k scaled by HP_WORK_SCALE
  let y = (n * HP_WORK_SCALE) >> BigInt(k);
  if (y >= 2n * HP_WORK_SCALE) {
    y >>= 1n;
    return bdLn(y) + bdMulInt(bdLn2(), k + 1);
  }
  return bdLn(y) + bdMulInt(bdLn2(), k);
};

export const bdLog2 = (x: BD500): BD500 => bdDiv(bdLn(x), bdLn2());
export const bdLog2BigInt = (n: bigint): BD500 => bdDiv(bdLnBigInt(n), bdLn2());
export const bdLog10 = (x: BD500): BD500 => bdDiv(bdLn(x), bdLn10());

export const bdExp = (x: BD500): BD500 => {
  if (x === 0n) return bdOne();
  const ln2 = bdLn2();
  const k = Number(bdRoundNearest(bdDiv(x, ln2)));
  const r = x - bdMulInt(ln2, k);
  // Halve r by 256 -> |rp| < 0.0014
  const rp = r >> 8n;
  let sum = HP_WORK_SCALE;
  let term = HP_WORK_SCALE;
  for (let n = 1n; n < 240n; n++) {
    term = bdMul(term, rp) / n;
    if (term === 0n) break;
    sum += term;
  }
  for (let i = 0; i < 8; i++) {
    sum = bdMul(sum, sum);
  }
  if (k > 0) return sum << BigInt(k);
  if (k < 0) return sum >> BigInt(-k);
  return sum;
};

export const bdPow = (base: BD500, exp: BD500): BD500 => {
  if (exp === 0n) return bdOne();
  if (base <= 0n) return 0n;
  if (base === HP_WORK_SCALE) return bdOne();
  return bdExp(bdMul(exp, bdLn(base)));
};

export const bdSinCos = (x: BD500): { sin: BD500; cos: BD500 } => {
  const halfPi = bdHalfPi();
  const qBig = bdRoundNearest(bdDiv(x, halfPi));
  const r = x - qBig * halfPi; // |r| <= pi/4
  const rp = r >> 8n; // Divide by 256 -> |rp| <= 0.00307
  const rp2 = bdMul(rp, rp);

  // Taylor series for sin(rp) & cos(rp)
  let sTerm = rp;
  let sSum = rp;
  let cTerm = HP_WORK_SCALE;
  let cSum = HP_WORK_SCALE;
  for (let n = 1n; n < 180n; n++) {
    const m2 = 2n * n;
    cTerm = -bdMul(cTerm, rp2) / ((m2 - 1n) * m2);
    sTerm = -bdMul(sTerm, rp2) / (m2 * (m2 + 1n));
    cSum += cTerm;
    sSum += sTerm;
    if (cTerm === 0n && sTerm === 0n) break;
  }

  // Reconstruct via 8 double-angle transformations
  let s = sSum;
  let c = cSum;
  for (let i = 0; i < 8; i++) {
    const s2 = bdMul(2n * s, c);
    const c2 = bdMul(c, c) - bdMul(s, s);
    s = s2;
    c = c2;
  }

  const quad = Number(((qBig % 4n) + 4n) % 4n);
  if (quad === 0) return { sin: s, cos: c };
  if (quad === 1) return { sin: c, cos: -s };
  if (quad === 2) return { sin: -s, cos: -c };
  return { sin: -c, cos: s };
};

export const bdSin = (x: BD500): BD500 => bdSinCos(x).sin;
export const bdCos = (x: BD500): BD500 => bdSinCos(x).cos;

export const bdAtan = (x: BD500): BD500 => {
  if (x === 0n) return 0n;
  const neg = x < 0n;
  let u = bigAbs(x);
  let inverted = false;
  if (u > HP_WORK_SCALE) {
    u = bdDiv(HP_WORK_SCALE, u);
    inverted = true;
  }

  // 8 half-angle steps: u <- u / (1 + sqrt(1 + u^2))
  for (let i = 0; i < 8; i++) {
    const root = bdSqrt(HP_WORK_SCALE + bdMul(u, u));
    u = bdDiv(u, HP_WORK_SCALE + root);
  }

  const u2 = bdMul(u, u);
  let term = u;
  let sum = u;
  let denom = 3n;
  while (term !== 0n) {
    term = -bdMul(term, u2);
    const delta = term / denom;
    if (delta === 0n) break;
    sum += delta;
    denom += 2n;
  }

  let res = sum << 8n; // * 256
  if (inverted) res = bdHalfPi() - res;
  return neg ? -res : res;
};

export const bdAtan2 = (y: BD500, x: BD500): BD500 => {
  if (x > 0n) return bdAtan(bdDiv(y, x));
  if (x < 0n && y >= 0n) return bdAtan(bdDiv(y, x)) + bdPi();
  if (x < 0n && y < 0n) return bdAtan(bdDiv(y, x)) - bdPi();
  if (y > 0n) return bdHalfPi();
  if (y < 0n) return -bdHalfPi();
  return 0n;
};

// --- Exact Surd Extraction & Algebraic Field Operations Q(sqrt(d)) ---

const SMALL_SURD_PRIMES = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n,
  101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n, 191n, 193n, 197n, 199n,
  211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n, 257n, 263n, 269n, 271n, 277n, 281n, 283n, 293n, 307n, 311n, 313n, 317n,
  331n, 337n, 347n, 349n, 353n, 359n, 367n, 373n, 379n, 383n, 389n, 397n, 401n, 409n, 419n, 421n, 431n, 433n, 439n, 443n,
  449n, 457n, 461n, 463n, 467n, 479n, 487n, 491n, 499n, 503n, 509n, 521n, 523n, 541n, 547n, 557n, 563n, 569n, 571n, 577n,
  587n, 593n, 599n, 601n, 607n, 613n, 617n, 619n, 631n, 641n, 643n, 647n, 653n, 659n, 661n, 673n, 677n, 683n, 691n, 701n,
  709n, 719n, 727n, 733n, 739n, 743n, 751n, 757n, 761n, 769n, 773n, 787n, 797n, 809n, 811n, 821n, 823n, 827n, 829n, 839n,
  853n, 857n, 859n, 863n, 877n, 881n, 883n, 887n, 907n, 911n, 919n, 929n, 937n, 941n, 947n, 953n, 967n, 971n, 977n, 983n, 991n, 997n
];

/**
 * Extracts exact square factor k such that n = k^2 * d, returning { outerK: k, radicandD: d }.
 * Handles small square divisors (< 10^6), perfect squares of any bit size, and perfect-square quotients.
 */
export const extractSquarePartBigInt = (n: bigint): { outerK: bigint; radicandD: bigint } => {
  if (n <= 0n) return { outerK: 0n, radicandD: 1n };
  const exactRoot = bigIntSqrtFloor(n);
  if (exactRoot * exactRoot === n) {
    return { outerK: exactRoot, radicandD: 1n };
  }

  let k = 1n;
  let d = n;
  for (let i = 0; i < SMALL_SURD_PRIMES.length; i++) {
    const p = SMALL_SURD_PRIMES[i];
    const p2 = p * p;
    if (p2 > d) break;
    while (d % p2 === 0n) {
      k *= p;
      d /= p2;
    }
  }
  const remRoot = bigIntSqrtFloor(d);
  if (remRoot * remRoot === d) {
    k *= remRoot;
    d = 1n;
  }
  return { outerK: k, radicandD: d };
};

export const evaluateSurdToBD500 = (a: bigint, b: bigint, d: bigint, c: bigint): BD500 => {
  if (c === 0n) return 0n;
  const numBD = bdFromBigInt(a) + (b === 0n || d === 0n ? 0n : bdMulInt(bdSqrt(bdFromBigInt(d)), b));
  return bdDivInt(numBD, c);
};

export const formatCanonicalSurd = (a: bigint, b: bigint, d: bigint, c: bigint): string => {
  if (b === 0n || d === 1n) {
    const totalNum = a + b;
    return c === 1n ? totalNum.toString() : `${totalNum.toString()} / ${c.toString()}`;
  }
  const dStr = d.toString();
  const radStr = dStr.length > 26
    ? `√(${dStr.slice(0, 12)}…${dStr.slice(-10)})`
    : `√${dStr}`;
  const bAbs = bigAbs(b);
  const bTerm = bAbs === 1n ? radStr : `${bAbs.toString()}·${radStr}`;

  let numExpr = '';
  if (a === 0n) {
    numExpr = b < 0n ? `-${bTerm}` : bTerm;
  } else {
    const op = b < 0n ? ' - ' : ' + ';
    numExpr = `${a.toString()}${op}${bTerm}`;
  }
  if (c === 1n) return numExpr;
  return a === 0n ? `${numExpr} / ${c.toString()}` : `(${numExpr}) / ${c.toString()}`;
};

export const buildSurd = (rawA: bigint, rawB: bigint, rawD: bigint, rawC: bigint): ExactSurd => {
  let a = rawA;
  let b = rawB;
  let d = rawD;
  let c = rawC === 0n ? 1n : rawC;
  if (c < 0n) {
    a = -a;
    b = -b;
    c = -c;
  }

  if (d <= 0n || b === 0n) {
    b = 0n;
    d = 1n;
  } else {
    const { outerK, radicandD } = extractSquarePartBigInt(d);
    b *= outerK;
    d = radicandD;
    if (d === 1n) {
      a += b;
      b = 0n;
    }
  }

  const g = gcdHp(gcdHp(a, b), c);
  if (g > 1n) {
    a /= g;
    b /= g;
    c /= g;
  }

  const val500 = evaluateSurdToBD500(a, b, d, c);
  const dec500 = b === 0n && c === 1n
    ? a.toString()
    : bdToString(val500, HP_DEC_DIGITS, false);
  const preview = b === 0n && c === 1n
    ? a.toString()
    : bdToString(val500, 24, false) + '… (500d)';

  return {
    a,
    b,
    d,
    c,
    isExactRational: b === 0n,
    canonicalText: formatCanonicalSurd(a, b, d, c),
    decimal500: dec500,
    decimalPreview: preview
  };
};

export const surdFromSqrtN = (nBig: bigint): ExactSurd => {
  if (nBig < 0n) return buildSurd(0n, 0n, 1n, 1n);
  return buildSurd(0n, 1n, nBig, 1n);
};

export const addSurd = (x: ExactSurd, y: ExactSurd): ExactSurd => {
  if (x.d !== y.d && !x.isExactRational && !y.isExactRational) {
    throw new Error('Incompatible surd radicands');
  }
  const d = x.isExactRational ? y.d : x.d;
  return buildSurd(x.a * y.c + y.a * x.c, x.b * y.c + y.b * x.c, d, x.c * y.c);
};

export const subSurd = (x: ExactSurd, y: ExactSurd): ExactSurd =>
  addSurd(x, buildSurd(-y.a, -y.b, y.d, y.c));

export const mulSurd = (x: ExactSurd, y: ExactSurd): ExactSurd => {
  if (x.d !== y.d && !x.isExactRational && !y.isExactRational) {
    throw new Error('Incompatible surd radicands');
  }
  const d = x.isExactRational ? y.d : x.d;
  // (a1 + b1 sqrt(d)) * (a2 + b2 sqrt(d)) = (a1*a2 + b1*b2*d) + (a1*b2 + b1*a2)*sqrt(d)
  return buildSurd(
    x.a * y.a + x.b * y.b * d,
    x.a * y.b + x.b * y.a,
    d,
    x.c * y.c
  );
};

export const divSurd = (x: ExactSurd, y: ExactSurd): ExactSurd => {
  if (x.d !== y.d && !x.isExactRational && !y.isExactRational) {
    throw new Error('Incompatible surd radicands');
  }
  const d = x.isExactRational ? y.d : x.d;
  // Multiply numerator & denominator by conjugate (y.a - y.b * sqrt(d))
  const norm = y.a * y.a - y.b * y.b * d;
  if (norm === 0n) throw new Error('Division by zero surd');
  const numA = (x.a * y.a - x.b * y.b * d) * y.c;
  const numB = (x.b * y.a - x.a * y.b) * y.c;
  const den = x.c * norm;
  return buildSurd(numA, numB, d, den);
};
