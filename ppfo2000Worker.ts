import { getWorkerMontRedcCode } from './lib/montgomeryRedcKernel';

export const PPFO_2000_WORKER_CODE = getWorkerMontRedcCode() + `
const WORK_SCALE = 10n ** 2050n;

const gcd = (a, b) => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y > 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

const bigIntSqrtFloor = (n) => {
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

const modPow = (base, exp, mod) => {
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

const modInverse = (a, m) => {
  let m0 = m, t, q;
  let x0 = 0n, x1 = 1n;
  a = ((a % m) + m) % m;
  if (m === 1n) return 0n;
  while (a > 1n) {
    if (m === 0n) return 0n;
    q = a / m;
    t = m;
    m = a % m;
    a = t;
    t = x0;
    x0 = x1 - q * x0;
    x1 = t;
  }
  if (x1 < 0n) x1 += m0;
  return x1;
};

const isProbablePrime24 = (n) => {
  if (n < 2n) return false;
  const bases = [
    2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n,
    41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n
  ];
  for (const p of bases) {
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
  for (const a of bases) {
    if (a >= n) break;
    let x = modPow(a, d, n);
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

const primesCache = new Map();
const getPrimesUpTo = (limit) => {
  if (primesCache.has(limit)) return primesCache.get(limit);
  const sieve = new Uint8Array(limit + 1);
  const primes = [];
  for (let i = 2; i <= limit; i++) {
    if (!sieve[i]) {
      primes.push(i);
      if (i * i <= limit) {
        for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
      }
    }
  }
  if (primesCache.size > 6) primesCache.clear();
  primesCache.set(limit, primes);
  return primes;
};

const bdMul = (a, b) => {
  if (a === 0n || b === 0n) return 0n;
  return (a * b) / WORK_SCALE;
};

// Deterministic pseudo-random helper seeded from 2000-digit Riemann seed
const makePrng = (seedBig) => {
  let state = (seedBig ^ 0x9E3779B97F4A7C15n) & ((1n << 128n) - 1n);
  if (state === 0n) state = 0x123456789ABCDEF0123456789ABCDEF0n;
  return (modVal) => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 128n) - 1n);
    if (modVal <= 3n) return 2n;
    return 2n + (state % (modVal - 2n));
  };
};

// 1. Small primes pass
const runSmallPrimes = (n) => {
  const primes = getPrimesUpTo(1000);
  for (let i = 0; i < primes.length; i++) {
    const p = BigInt(primes[i]);
    if (p >= n) break;
    if (n % p === 0n) return p;
  }
  return 0n;
};

// 2. Fixed 2000-Digit Riemann-Pollard-Rho:
//    - Evolves 2050-digit cos((gamma + 0.1*rot)*ln(N)) cleanly every 16 iterations
//    - Preserves exact per-step perturbations inside each 32-step batch for faithful backtracking
//    - Reseeds (x, y, cAdd) when x === y (mod n) instead of prematurely aborting
const runRiemannRho2000d = (n, phaseState, maxIter, workerId, onTick) => {
  if ((n & 1n) === 0n) return 2n;
  if (n < 4n) return 0n;

  const seed = BigInt(phaseState.seed2000d);
  let cTrig = BigInt(phaseState.c0);
  let sTrig = BigInt(phaseState.s0);
  const dc = BigInt(phaseState.dc);
  const ds = BigInt(phaseState.ds);

  const nextRand = makePrng(seed + BigInt(workerId * 131 + 17));
  let x = nextRand(n);
  let y = x;
  let cAdd = nextRand(n) % (n - 1n) || 1n;

  let prodDiff = 1n;
  let batch = 0;
  let xSnap = x;
  let ySnap = y;
  const batchPerturbs = new Array(32).fill(0n);
  const topScale = WORK_SCALE / 10n;
  let absC = cTrig < 0n ? -cTrig : cTrig;
  let topFloat = Number(absC / topScale);
  let rotCount = 0;
  let reseedCount = 0;

  for (let i = 0; i < maxIter; i++) {
    // Advance 2050-digit trigonometric recurrence every 16 Rho steps (fast + true 2000-digit drift-free evolution)
    if ((i & 15) === 0) {
      const cNext = bdMul(cTrig, dc) - bdMul(sTrig, ds);
      const sNext = bdMul(sTrig, dc) + bdMul(cTrig, ds);
      cTrig = cNext;
      sTrig = sNext;
      rotCount++;
      if ((rotCount & 63) === 63) {
        const norm2 = bdMul(cTrig, cTrig) + bdMul(sTrig, sTrig);
        if (norm2 > 0n) {
          const norm = bigIntSqrtFloor(norm2 * WORK_SCALE);
          if (norm > 0n) {
            cTrig = (cTrig * WORK_SCALE) / norm;
            sTrig = (sTrig * WORK_SCALE) / norm;
          }
        }
      }
      absC = cTrig < 0n ? -cTrig : cTrig;
      topFloat = Number(absC / topScale);
    }

    const sliceShift = BigInt((i % 64) * 32);
    const deepSlice = Number((absC >> sliceShift) & 15n);
    const alpha = 1.0 / Math.sqrt(i + 1);
    const perturb = BigInt(Math.floor(alpha * (topFloat + deepSlice)));
    batchPerturbs[batch] = perturb;

    x = (x * x + cAdd + perturb) % n;
    y = (y * y + cAdd + perturb) % n;
    y = (y * y + cAdd + perturb) % n;

    const diff = x > y ? x - y : y - x;
    if (diff === 0n) {
      if (batch > 0 && prodDiff > 1n) {
        const gPre = gcd(prodDiff, n);
        if (gPre > 1n && gPre < n) return gPre;
      }
      reseedCount++;
      if (reseedCount > 10) break;
      x = nextRand(n);
      y = x;
      cAdd = nextRand(n) % (n - 1n) || 1n;
      prodDiff = 1n;
      batch = 0;
      xSnap = x;
      ySnap = y;
      continue;
    }

    prodDiff = (prodDiff * diff) % n;
    batch++;

    if (batch === 32) {
      const g = gcd(prodDiff, n);
      if (g === n) {
        let tx = xSnap;
        let ty = ySnap;
        for (let b = 0; b < 32; b++) {
          const bp = batchPerturbs[b];
          tx = (tx * tx + cAdd + bp) % n;
          ty = (ty * ty + cAdd + bp) % n;
          ty = (ty * ty + cAdd + bp) % n;
          const g2 = gcd(tx > ty ? tx - ty : ty - tx, n);
          if (g2 > 1n && g2 < n) return g2;
          if (g2 === n) break;
        }
        reseedCount++;
        if (reseedCount > 10) break;
        x = nextRand(n);
        y = x;
        cAdd = nextRand(n) % (n - 1n) || 1n;
        prodDiff = 1n;
        batch = 0;
        xSnap = x;
        ySnap = y;
        continue;
      }
      if (g > 1n) return g;
      prodDiff = 1n;
      batch = 0;
      xSnap = x;
      ySnap = y;
    }

    if ((i & 4095) === 4095 && onTick) {
      onTick(i + 1);
    }
  }
  if (batch > 0 && prodDiff > 1n) {
    const gTail = gcd(prodDiff, n);
    if (gTail > 1n && gTail < n) return gTail;
  }
  return 0n;
};

// 3. Real Montgomery + Suyama REDC ECM Stage 1 + Stage 2 + Maynard Constellation Sieve
const runEcmReal = (n, seedVal, bitLen, montCtx) => {
  if ((n & 1n) === 0n) return 2n;
  const tiers = bitLen <= 80
    ? [{ b1: 2000, b2: 24000, curves: 8 }]
    : bitLen <= 128
    ? [{ b1: 4000, b2: 60000, curves: 10 }, { b1: 12000, b2: 240000, curves: 8 }]
    : [{ b1: 8000, b2: 140000, curves: 10 }, { b1: 25000, b2: 600000, curves: 8 }];

  for (let t = 0; t < tiers.length; t++) {
    const { b1, b2, curves } = tiers[t];
    const primesB1 = getPrimesUpTo(b1);
    for (let c = 0; c < curves; c++) {
      const sigma = BigInt(seedVal) + BigInt(t * 1009 + c * 7919 + 7);
      const ecmRes = runUnifiedEcmStage1And2(
        n,
        sigma,
        b1,
        b2,
        primesB1,
        modInverse,
        gcd,
        null,
        montCtx
      );
      if (ecmRes && ecmRes.factor && ecmRes.factor > 1n && ecmRes.factor < n) {
        return ecmRes.factor;
      }
    }
  }
  return 0n;
};

const runMaynardSieve = (n) => {
  if (n < 4n) return 0n;
  const root = bigIntSqrtFloor(n);
  if (root < 100n) return 0n;
  const clusters = [
    [0n, 2n, 6n, 8n, 12n, 18n],
    [0n, 4n, 6n, 10n, 12n, 16n]
  ];
  const rawWin = root / 100n;
  const window = rawWin > 18000n ? 18000n : (rawWin < 200n ? 200n : rawWin);
  const start = root > window + 2n ? root - window : 2n;
  const end = root + window;
  for (let cand = start; cand < end; cand++) {
    for (let ci = 0; ci < clusters.length; ci++) {
      const cluster = clusters[ci];
      for (let oi = 0; oi < cluster.length; oi++) {
        const x = cand + cluster[oi];
        if (x > 1n && x < n) {
          const g = gcd(n, x);
          if (g > 1n && g < n) return g;
        }
      }
    }
  }
  return 0n;
};

// 4. Iterative Pollard-Brent (multi-seed, safe for all modulus sizes)
const runPollardBrent = (n, seedBase, maxSteps) => {
  if ((n & 1n) === 0n) return 2n;
  for (let attempt = 0; attempt < 6; attempt++) {
    let y = (BigInt(2 + (seedBase + attempt) * 173) % (n - 2n)) + 2n;
    const c = BigInt(1 + attempt * 2 + (seedBase & 15));
    const m = 64;
    let g = 1n;
    let r = 1;
    let q = 1n;
    let x = y;
    let ys = y;
    let steps = 0;
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
        g = gcd(q, n);
        k += m;
      }
      r <<= 1;
    }
    if (g === n) {
      do {
        ys = (ys * ys + c) % n;
        const diff = x > ys ? x - ys : ys - x;
        g = gcd(diff, n);
      } while (g === 1n);
    }
    if (g > 1n && g < n) return g;
  }
  return 0n;
};

// 5. Upgraded Emergency Fallback: Exact Square + Fermat + Hart 4kN + Montgomery p-1 (B1+B2) + Williams p+1
const runEmergencyFallback = (n, montCtx) => {
  if ((n & 1n) === 0n) return 2n;
  const s = bigIntSqrtFloor(n);
  if (s * s === n) return s;

  // Fermat close-prime scan
  let a = s + 1n;
  for (let i = 0; i < 12000; i++) {
    const sq = a * a - n;
    const b = bigIntSqrtFloor(sq);
    if (b * b === sq) {
      const g = a - b;
      if (g > 1n && g < n) return g;
    }
    a += 1n;
  }

  // Hart's One-Line 4kN Fermat multipliers
  for (let k = 1; k <= 64; k++) {
    const kn4 = 4n * BigInt(k) * n;
    const sk = bigIntSqrtFloor(kn4) + 1n;
    const rem = sk * sk - kn4;
    const t = bigIntSqrtFloor(rem);
    if (t * t === rem) {
      const g = gcd(sk - t, n);
      if (g > 1n && g < n) return g;
    }
  }

  // Pollard p-1 Stage 1 (B1=25000) + Stage 2 (B2=250000) in Montgomery REDC
  if (montCtx) {
    const { oneM, twoM, toMont, fromMont, montMul, montPow, montSub } = montCtx;
    const primesB2 = getPrimesUpTo(250000);
    const B1 = 25000;
    let aM = toMont(2n);
    let blockExp = 1n;
    const blockCap = 1n << 256n;
    let idx = 0;
    for (; idx < primesB2.length && primesB2[idx] <= B1; idx++) {
      const p = primesB2[idx];
      let pwr = p;
      while (pwr * p <= B1) pwr *= p;
      blockExp *= BigInt(pwr);
      if (blockExp >= blockCap) {
        aM = montPow(aM, blockExp);
        blockExp = 1n;
        const g1 = gcd(montSub(fromMont(aM), 1n), n);
        if (g1 > 1n && g1 < n) return g1;
      }
    }
    if (blockExp > 1n) aM = montPow(aM, blockExp);
    const aNorm = fromMont(aM);
    const g1f = gcd(aNorm >= 1n ? aNorm - 1n : aNorm + n - 1n, n);
    if (g1f > 1n && g1f < n) return g1f;

    // Stage 2 p-1
    if (idx < primesB2.length) {
      const a2M = montMul(aM, aM);
      const diffCache = new Map();
      diffCache.set(2, a2M);
      let maxDelta = 2;
      const getStepPow = (delta) => {
        if ((delta & 1) === 1 || delta > 512) return montPow(aM, BigInt(delta));
        let cached = diffCache.get(delta);
        if (cached !== undefined) return cached;
        let cur = diffCache.get(maxDelta);
        while (maxDelta < delta) {
          maxDelta += 2;
          cur = montMul(cur, a2M);
          diffCache.set(maxDelta, cur);
        }
        return cur;
      };
      let prevP = primesB2[idx];
      let curM = montPow(aM, BigInt(prevP));
      let accumM = montSub(curM, oneM);
      if (accumM === 0n) accumM = oneM;
      for (let j = idx + 1; j < primesB2.length; j++) {
        const p = primesB2[j];
        const stepM = getStepPow(p - prevP);
        prevP = p;
        curM = montMul(curM, stepM);
        const df = montSub(curM, oneM);
        if (df > 0n) accumM = montMul(accumM, df);
        if ((j & 255) === 255) {
          const g2 = gcd(fromMont(accumM), n);
          if (g2 > 1n && g2 < n) return g2;
          accumM = oneM;
        }
      }
      const g2f = gcd(fromMont(accumM), n);
      if (g2f > 1n && g2f < n) return g2f;
    }

    // Williams p+1 Stage 1 (B1=10000)
    const primesP1 = getPrimesUpTo(10000);
    const lucasStepNum = (k, pM) => {
      if (k === 0) return twoM;
      if (k === 1) return pM;
      let v0 = twoM;
      let v1 = pM;
      const msb = 31 - Math.clz32(k);
      for (let bit = msb; bit >= 0; bit--) {
        if ((k >>> bit) & 1) {
          v0 = montSub(montMul(v0, v1), pM);
          v1 = montSub(montMul(v1, v1), twoM);
        } else {
          v1 = montSub(montMul(v0, v1), pM);
          v0 = montSub(montMul(v0, v0), twoM);
        }
      }
      return v0;
    };
    for (const seed of [3n, 6n, 5n, 9n, 10n]) {
      let vM = toMont(seed);
      for (let i = 0; i < primesP1.length; i++) {
        const p = primesP1[i];
        let pwr = p;
        while (pwr * p <= 10000) pwr *= p;
        vM = lucasStepNum(pwr, vM);
      }
      const vNorm = fromMont(vM);
      const gp = gcd(vNorm >= 2n ? vNorm - 2n : vNorm + n - 2n, n);
      if (gp > 1n && gp < n) return gp;
    }
  }
  return 0n;
};

self.onmessage = (e) => {
  const {
    nStr,
    workerId,
    role,
    phaseState,
    useSmall,
    useRiemann,
    useAdvanced,
    usePollardRho,
    useEmergency,
    maxIter
  } = e.data;

  const n = BigInt(nStr);
  if (n < 2n) {
    self.postMessage({ type: 'done', workerId, factor: null, method: 'Invalid' });
    return;
  }
  if (isProbablePrime24(n)) {
    self.postMessage({ type: 'done', workerId, factor: n.toString(10), method: 'Prime(MR-24)', isVerifiedPrime: true });
    return;
  }

  const bitLen = n.toString(2).length;
  const montCtx = (n & 1n) === 1n && (role === 'advanced' || role === 'emergency')
    ? createMontgomeryCtx(n)
    : null;

  let found = 0n;
  let method = '';

  if (useSmall && workerId === 0) {
    found = runSmallPrimes(n);
    if (found > 1n) method = 'Small';
  }

  if (found === 0n && role === 'riemann' && useRiemann && phaseState) {
    found = runRiemannRho2000d(n, phaseState, maxIter || 65000, workerId, (iter) => {
      self.postMessage({ type: 'progress', workerId, role: 'Riemann-2000d', iter });
    });
    if (found > 1n) method = 'Riemann2000d-' + workerId;
  }

  if (found === 0n && role === 'advanced' && useAdvanced) {
    found = runEcmReal(n, 1009 + workerId * 971, bitLen, montCtx);
    if (found > 1n) {
      method = 'ECM-REDC-' + workerId;
    } else {
      found = runMaynardSieve(n);
      if (found > 1n) method = 'Maynard-' + workerId;
    }
  }

  if (found === 0n && role === 'rho' && usePollardRho) {
    found = runPollardBrent(n, workerId + 1, 140000);
    if (found > 1n) method = 'Pollard-Brent-' + workerId;
  }

  if (found === 0n && role === 'emergency' && useEmergency) {
    found = runEmergencyFallback(n, montCtx);
    if (found > 1n) method = 'Emergency(Hart4kN/p±1)';
  }

  self.postMessage({
    type: 'done',
    workerId,
    factor: found > 1n && found < n ? found.toString(10) : null,
    method,
    isVerifiedPrime: found > 1n ? isProbablePrime24(found) : false
  });
};
`;
