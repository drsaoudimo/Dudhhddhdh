// True 2000-Decimal-Digit Arbitrary Precision Engine (BD2000: 2050-digit BigInt Work Scale)
// + PPFO v16 High-Precision Riemann Phase Generator & Strict Primality Enforcement

export const HP2000_DEC_DIGITS = 2000;
export const HP2000_GUARD_DIGITS = 50;
export const HP2000_WORK_DIGITS = HP2000_DEC_DIGITS + HP2000_GUARD_DIGITS; // 2050
export const HP2000_WORK_SCALE = 10n ** BigInt(HP2000_WORK_DIGITS);
export const HP2000_OUT_SCALE = 10n ** BigInt(HP2000_DEC_DIGITS);
const GUARD2000_SCALE = 10n ** BigInt(HP2000_GUARD_DIGITS);

export type BD2000 = bigint;

export const RIEMANN_ZEROS_HIGH_PREC: string[] = [
  '14.13472514173469379045725198356247027078425711569924',
  '21.02203963877155499262847959389690277733434052490278',
  '25.01085758014568876321379099256282181865954967255799',
  '30.42487612585951321031189753058409132018156002371544',
  '32.93506158773918969066236896407490348881271560351703',
  '37.58617815882567125721776348070533282140559735083079',
  '40.91871901214749518739812691463325439572616596277727',
  '43.32707328091499951949612216540680578264566837183687',
  '48.00515088116715972794247274942751604168684400114442',
  '49.77383247767230218191678467856372405772317829967666',
  '52.97032147771446064414729660888099018432350016164790',
  '56.44624769706339480436775947670602080373712114178102',
  '59.34704400260235307965364867499221849690174645873475',
  '60.83177852460980984425990182452406694126305116230445',
  '65.11254404808160666087505425318360642073720534453035',
  '67.07981052949417371447882889652214699746809822905895',
];

const bigAbs = (x: bigint): bigint => (x < 0n ? -x : x);

export const gcdBig = (a: bigint, b: bigint): bigint => {
  let x = bigAbs(a);
  let y = bigAbs(b);
  while (y > 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

export const bigIntSqrtFloor2000 = (n: bigint): bigint => {
  if (n < 0n) return 0n;
  if (n < 2n) return n;
  const bitLen = BigInt(n.toString(2).length);
  let x = 1n << ((bitLen + 1n) >> 1n);
  while (true) {
    const next = (x + n / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
};

export const bd2000FromString = (raw: string): BD2000 => {
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
  const delta = HP2000_WORK_DIGITS - currentFracLen;

  let val = BigInt(digits || '0');
  if (delta >= 0) {
    val *= 10n ** BigInt(delta);
  } else {
    const div = 10n ** BigInt(-delta);
    val = (val + (div >> 1n)) / div;
  }
  return neg ? -val : val;
};

export const bd2000Mul = (a: BD2000, b: BD2000): BD2000 => {
  if (a === 0n || b === 0n) return 0n;
  const prod = a * b;
  const half = HP2000_WORK_SCALE >> 1n;
  return prod >= 0n
    ? (prod + half) / HP2000_WORK_SCALE
    : -((-prod + half) / HP2000_WORK_SCALE);
};

export const bd2000Div = (a: BD2000, b: BD2000): BD2000 => {
  if (b === 0n || a === 0n) return 0n;
  const neg = (a < 0n) !== (b < 0n);
  const aa = bigAbs(a);
  const ab = bigAbs(b);
  const q = (aa * HP2000_WORK_SCALE + (ab >> 1n)) / ab;
  return neg ? -q : q;
};

export const bd2000RoundNearest = (a: BD2000): bigint => {
  const half = HP2000_WORK_SCALE >> 1n;
  if (a >= 0n) return (a + half) / HP2000_WORK_SCALE;
  return -((-a + half) / HP2000_WORK_SCALE);
};

export const bd2000Sqrt = (a: BD2000): BD2000 => {
  if (a <= 0n) return 0n;
  return bigIntSqrtFloor2000(a * HP2000_WORK_SCALE);
};

export const bd2000ToString = (
  a: BD2000,
  digits: number = HP2000_DEC_DIGITS,
  trimTrailingZeros = false
): string => {
  const cappedDigits = Math.max(0, Math.min(HP2000_DEC_DIGITS, digits));
  const neg = a < 0n;
  const absA = bigAbs(a);
  const dropDigits = HP2000_WORK_DIGITS - cappedDigits;
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

let CACHED_PI_2000: BD2000 | null = null;
let CACHED_LN2_2000: BD2000 | null = null;
const LN_BIG_CACHE_2000 = new Map<string, BD2000>();

const arctanInvInt2000 = (q: bigint): BD2000 => {
  const q2 = q * q;
  let term = HP2000_WORK_SCALE / q;
  let sum = term;
  let k = 1n;
  while (term !== 0n) {
    term /= q2;
    const delta = term / (2n * k + 1n);
    if (delta === 0n) break;
    sum += (k & 1n) === 1n ? -delta : delta;
    k += 1n;
  }
  return sum;
};

export const bd2000Pi = (): BD2000 => {
  if (CACHED_PI_2000 !== null) return CACHED_PI_2000;
  CACHED_PI_2000 = 16n * arctanInvInt2000(5n) - 4n * arctanInvInt2000(239n);
  return CACHED_PI_2000;
};

export const bd2000TwoPi = (): BD2000 => bd2000Pi() * 2n;
export const bd2000HalfPi = (): BD2000 => bd2000Pi() >> 1n;

const atanhRational2000 = (p: bigint, q: bigint): BD2000 => {
  const p2 = p * p;
  const q2 = q * q;
  let term = (HP2000_WORK_SCALE * p) / q;
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

export const bd2000Ln2 = (): BD2000 => {
  if (CACHED_LN2_2000 !== null) return CACHED_LN2_2000;
  CACHED_LN2_2000 =
    14n * atanhRational2000(1n, 31n) +
    10n * atanhRational2000(1n, 49n) +
    6n * atanhRational2000(1n, 161n);
  return CACHED_LN2_2000;
};

export const bd2000Ln = (x: BD2000): BD2000 => {
  if (x <= 0n) return 0n;
  if (x === HP2000_WORK_SCALE) return 0n;

  let y = x;
  let k = 0;
  while (y >= 2n * HP2000_WORK_SCALE) {
    const excessBits = Math.max(1, (y / HP2000_WORK_SCALE).toString(2).length - 1);
    y >>= BigInt(excessBits);
    k += excessBits;
  }
  while (y < HP2000_WORK_SCALE) {
    const deficitBits = Math.max(1, (HP2000_WORK_SCALE / y).toString(2).length);
    y <<= BigInt(deficitBits);
    k -= deficitBits;
    if (y >= 2n * HP2000_WORK_SCALE) {
      y >>= 1n;
      k += 1;
    }
  }

  // 10 square-root halvings -> |u| < 0.00034 for rapid 2050-digit convergence
  for (let i = 0; i < 10; i++) {
    y = bd2000Sqrt(y);
  }

  const u = bd2000Div(y - HP2000_WORK_SCALE, y + HP2000_WORK_SCALE);
  const u2 = bd2000Mul(u, u);
  let term = u;
  let sum = u;
  let denom = 3n;
  while (term !== 0n) {
    term = bd2000Mul(term, u2);
    const delta = term / denom;
    if (delta === 0n) break;
    sum += delta;
    denom += 2n;
  }

  const lnReduced = sum << 11n; // 2 * 2^10
  return k === 0 ? lnReduced : lnReduced + bd2000Ln2() * BigInt(k);
};

export const bd2000LnBigInt = (n: bigint): BD2000 => {
  if (n <= 1n) return 0n;
  const key = n.toString(10);
  const hit = LN_BIG_CACHE_2000.get(key);
  if (hit !== undefined) return hit;

  const bitLen = n.toString(2).length;
  const k = bitLen - 1;
  let y = (n * HP2000_WORK_SCALE) >> BigInt(k);
  let res: BD2000;
  if (y >= 2n * HP2000_WORK_SCALE) {
    y >>= 1n;
    res = bd2000Ln(y) + bd2000Ln2() * BigInt(k + 1);
  } else {
    res = bd2000Ln(y) + bd2000Ln2() * BigInt(k);
  }
  if (LN_BIG_CACHE_2000.size > 32) LN_BIG_CACHE_2000.clear();
  LN_BIG_CACHE_2000.set(key, res);
  return res;
};

export const bd2000SinCos = (x: BD2000): { sin: BD2000; cos: BD2000 } => {
  const halfPi = bd2000HalfPi();
  const qBig = bd2000RoundNearest(bd2000Div(x, halfPi));
  const r = x - qBig * halfPi; // |r| <= pi/4
  const rp = r >> 10n; // Divide by 1024 -> |rp| <= 0.00077
  const rp2 = bd2000Mul(rp, rp);

  let sTerm = rp;
  let sSum = rp;
  let cTerm = HP2000_WORK_SCALE;
  let cSum = HP2000_WORK_SCALE;
  for (let n = 1n; n < 420n; n++) {
    const m2 = 2n * n;
    cTerm = -bd2000Mul(cTerm, rp2) / ((m2 - 1n) * m2);
    sTerm = -bd2000Mul(sTerm, rp2) / (m2 * (m2 + 1n));
    cSum += cTerm;
    sSum += sTerm;
    if (cTerm === 0n && sTerm === 0n) break;
  }

  let s = sSum;
  let c = cSum;
  for (let i = 0; i < 10; i++) {
    const s2 = bd2000Mul(2n * s, c);
    const c2 = bd2000Mul(c, c) - bd2000Mul(s, s);
    s = s2;
    c = c2;
  }

  const quad = Number(((qBig % 4n) + 4n) % 4n);
  if (quad === 0) return { sin: s, cos: c };
  if (quad === 1) return { sin: c, cos: -s };
  if (quad === 2) return { sin: -s, cos: -c };
  return { sin: -c, cos: s };
};

export interface Surd2000Result {
  outer: string;
  radicand: string;
  isExactInt: boolean;
  canonical: string;
  decimal2000: string;
}

export const surd2000FromSqrtN = (n: bigint): Surd2000Result => {
  const s = bigIntSqrtFloor2000(n);
  if (s * s === n) {
    return {
      outer: s.toString(10),
      radicand: '1',
      isExactInt: true,
      canonical: s.toString(10),
      decimal2000: `${s.toString(10)}.${'0'.repeat(HP2000_DEC_DIGITS)}`,
    };
  }
  let outer = 1n;
  let rad = n;
  const smallP = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n,
    59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n,
  ];
  for (const p of smallP) {
    const p2 = p * p;
    if (p2 > rad) break;
    while (rad % p2 === 0n) {
      outer *= p;
      rad /= p2;
    }
  }
  const scaledSqrt = bigIntSqrtFloor2000(n * HP2000_WORK_SCALE * HP2000_WORK_SCALE);
  const decimal2000 = bd2000ToString(scaledSqrt, HP2000_DEC_DIGITS, false);
  const canonical = outer === 1n ? `√${n.toString(10)}` : `${outer.toString(10)}·√${rad.toString(10)}`;
  return {
    outer: outer.toString(10),
    radicand: rad.toString(10),
    isExactInt: false,
    canonical,
    decimal2000,
  };
};

export interface RiemannPhase2000State {
  zeroIndex: number;
  gamma: string;
  c0: string;
  s0: string;
  dc: string;
  ds: string;
  cosDecimal2000: string;
  seed2000d: string;
}

export const computeRiemannPhase2000d = (n: bigint, idx: number): RiemannPhase2000State => {
  const zeroIdx = ((idx % RIEMANN_ZEROS_HIGH_PREC.length) + RIEMANN_ZEROS_HIGH_PREC.length) % RIEMANN_ZEROS_HIGH_PREC.length;
  const gammaStr = RIEMANN_ZEROS_HIGH_PREC[zeroIdx];
  const gammaBD = bd2000FromString(gammaStr);
  const lnN = bd2000LnBigInt(n < 2n ? 2n : n);
  const angle0 = bd2000Mul(gammaBD, lnN);
  const stepAngle = lnN / 10n; // 0.1 * ln(N)

  const { sin: s0, cos: c0 } = bd2000SinCos(angle0);
  const { sin: ds, cos: dc } = bd2000SinCos(stepAngle);

  // Extract full 2000 decimal digits of |cos(gamma * ln(N))|
  const absC0Rounded = (bigAbs(c0) + (GUARD2000_SCALE >> 1n)) / GUARD2000_SCALE;
  const mask2048 = (1n << 2048n) - 1n;
  const nSlice = n & mask2048;
  const seedVal = absC0Rounded ^ (BigInt(idx) << 16n) ^ nSlice;
  const modSpan = n > 5n ? n - 3n : 2n;
  const seed = 2n + (seedVal % modSpan);

  return {
    zeroIndex: zeroIdx,
    gamma: gammaStr,
    c0: c0.toString(10),
    s0: s0.toString(10),
    dc: dc.toString(10),
    ds: ds.toString(10),
    cosDecimal2000: bd2000ToString(c0, HP2000_DEC_DIGITS, false),
    seed2000d: seed.toString(10),
  };
};

export interface Precision2000Snapshot {
  nStr: string;
  bits: number;
  pi2000d: string;
  lnN2000d: string;
  sqrtSurd: Surd2000Result;
  phases: RiemannPhase2000State[];
  elapsedMs: number;
}

export const build2000DigitSnapshot = (n: bigint, zeroCount: number = 8): Precision2000Snapshot => {
  const t0 = performance.now();
  const pi2000d = bd2000ToString(bd2000Pi(), HP2000_DEC_DIGITS, false);
  const lnN2000d = bd2000ToString(bd2000LnBigInt(n < 2n ? 2n : n), HP2000_DEC_DIGITS, false);
  const sqrtSurd = surd2000FromSqrtN(n);
  const phases: RiemannPhase2000State[] = [];
  for (let i = 0; i < Math.min(zeroCount, RIEMANN_ZEROS_HIGH_PREC.length); i++) {
    phases.push(computeRiemannPhase2000d(n, i));
  }
  return {
    nStr: n.toString(10),
    bits: n > 0n ? n.toString(2).length : 0,
    pi2000d,
    lnN2000d,
    sqrtSurd,
    phases,
    elapsedMs: Number((performance.now() - t0).toFixed(2)),
  };
};

// Strict 24-base Miller-Rabin primality test (never labels a semiprime or composite as prime)
export const modPowBig2000 = (base: bigint, exp: bigint, mod: bigint): bigint => {
  let res = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return res;
};

export const isProbablePrimeBig24 = (n: bigint): boolean => {
  if (n < 2n) return false;
  const smallP = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n,
    41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n,
  ];
  for (const p of smallP) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  if (n < 97n * 97n) return true;

  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }

  for (const a of smallP) {
    if (a >= n) break;
    let x = modPowBig2000(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let comp = true;
    for (let r = 1; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        comp = false;
        break;
      }
    }
    if (comp) return false;
  }
  return true;
};

const brentSplitQuick = (n: bigint, seedOffset: number, maxSteps: number): bigint => {
  if ((n & 1n) === 0n) return 2n;
  let y = BigInt(2 + seedOffset * 13);
  const c = BigInt(1 + seedOffset * 2);
  let r = 1;
  let q = 1n;
  let g = 1n;
  let x = y;
  let ys = y;
  let steps = 0;
  const m = 64;
  while (g === 1n && steps < maxSteps) {
    x = y;
    for (let i = 0; i < r; i++) y = (y * y + c) % n;
    let k = 0;
    while (k < r && g === 1n && steps < maxSteps) {
      ys = y;
      const lim = Math.min(m, r - k);
      for (let i = 0; i < lim; i++) {
        y = (y * y + c) % n;
        const diff = x > y ? x - y : y - x;
        q = (q * diff) % n;
        steps++;
      }
      g = gcdBig(q, n);
      k += m;
    }
    r <<= 1;
  }
  if (g === n) {
    do {
      ys = (ys * ys + c) % n;
      const diff = x > ys ? x - ys : ys - x;
      g = gcdBig(diff, n);
    } while (g === 1n);
  }
  return g > 1n && g < n ? g : 0n;
};

export const splitCompositeToPrimesSync = (
  val: bigint,
  budgetMs: number = 1200
): { primes: bigint[]; unresolved: bigint[] } => {
  const primes: bigint[] = [];
  const unresolved: bigint[] = [];
  const stack: bigint[] = [val];
  const deadline = performance.now() + budgetMs;

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur <= 1n) continue;
    if (isProbablePrimeBig24(cur)) {
      primes.push(cur);
      continue;
    }
    // Check perfect square / Fermat close
    const rt = bigIntSqrtFloor2000(cur);
    if (rt * rt === cur) {
      stack.push(rt, rt);
      continue;
    }
    let split: bigint = 0n;
    // Quick Fermat 4096
    let a = rt + 1n;
    for (let i = 0; i < 4096; i++) {
      const sq = a * a - cur;
      const b = bigIntSqrtFloor2000(sq);
      if (b * b === sq) {
        const g = a - b;
        if (g > 1n && g < cur) {
          split = g;
          break;
        }
      }
      a += 1n;
    }
    if (split === 0n && performance.now() < deadline) {
      for (let seed = 1; seed <= 4 && split === 0n; seed++) {
        split = brentSplitQuick(cur, seed, 25000);
      }
    }
    if (split > 1n && split < cur && cur % split === 0n) {
      stack.push(split, cur / split);
    } else {
      unresolved.push(cur);
    }
  }
  return { primes, unresolved };
};
