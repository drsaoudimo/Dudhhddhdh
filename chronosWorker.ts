import { getWorkerMontRedcCode } from './lib/montgomeryRedcKernel';

export const CHRONOS_WORKER_CODE = getWorkerMontRedcCode() + `
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

  const modPow = (base, exp, mod) => {
    let res = 1n;
    base = ((base % mod) + mod) % mod;
    while (exp > 0n) {
      if (exp & 1n) res = (res * base) % mod;
      base = (base * base) % mod;
      exp >>= 1n;
    }
    return res;
  };

  const bigSqrt = (val) => {
    if (val < 0n) return 0n;
    if (val < 2n) return val;
    let newX = (val >> 1n) + 1n;
    let x = newX + 1n;
    while (newX < x) {
      x = newX;
      newX = (val / x + x) >> 1n;
    }
    return x;
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

  const modInverseNum = (a, m) => {
    let m0 = m, t, q;
    let x0 = 0, x1 = 1;
    a = ((a % m) + m) % m;
    if (m === 1) return 0;
    if (a === 0) return 0;
    while (a > 1) {
      if (m === 0) return 0;
      q = Math.floor(a / m);
      t = m;
      m = a % m;
      a = t;
      t = x0;
      x0 = x1 - q * x0;
      x1 = t;
    }
    if (x1 < 0) x1 += m0;
    return x1;
  };

  const isProbablePrime = (n, k = 10) => {
    if (n === 2n || n === 3n) return true;
    if ((n & 1n) === 0n || n < 2n) return false;
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (let i = 0; i < Math.min(k, bases.length); i++) {
      const a = bases[i];
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
    if (primesCache.size > 8) primesCache.clear();
    primesCache.set(limit, primes);
    return primes;
  };

  const ZETA_ZEROS = [
    14.134725, 21.022040, 25.010858, 30.424876, 32.935062,
    37.586178, 40.918719, 43.327073, 48.005151, 49.773832,
    52.970321, 56.446248, 59.347044, 60.831779, 65.112544,
    67.079811, 69.546402, 72.067158, 75.704691, 77.144840
  ];

  // Fast Pollard-Brent cycle finder (supports 500-digit Zeta spectral rhoSeed)
  const runPollardBrent = (N, maxIterations = 30000, seedSkew = 0, zetaRhoSeedStr = null) => {
    if ((N & 1n) === 0n) return 2n;
    let y = BigInt((seedSkew * 17 + 2) % 100000) + 2n;
    let c = BigInt((seedSkew * 31 + 1) % 10000) + 1n;
    if (zetaRhoSeedStr) {
      try {
        const zr = BigInt(zetaRhoSeedStr);
        if (N > 7n) {
          y = ((zr + BigInt(seedSkew * 17)) % (N - 3n)) + 2n;
          c = ((zr >> 5n) + BigInt(seedSkew * 31)) % (N - 2n) + 1n;
        }
      } catch {}
    }
    const m = 128;
    let g = 1n, r = 1, q = 1n;
    let x = y, ys = y;
    let steps = 0;

    while (g === 1n && steps < maxIterations) {
      x = y;
      for (let i = 0; i < r; i++) {
        y = (y * y + c) % N;
      }
      let k = 0;
      while (k < r && g === 1n && steps < maxIterations) {
        ys = y;
        const lim = Math.min(m, r - k);
        for (let i = 0; i < lim; i++) {
          y = (y * y + c) % N;
          const diff = x > y ? x - y : y - x;
          q = (q * diff) % N;
          steps++;
        }
        g = gcd(q, N);
        k += m;
      }
      r <<= 1;
    }

    if (g === N) {
      do {
        ys = (ys * ys + c) % N;
        const diff = x > ys ? x - ys : ys - x;
        g = gcd(diff, N);
        steps++;
      } while (g === 1n && steps < maxIterations + 2000);
    }

    if (g > 1n && g < N) return g;
    return null;
  };

  // Unified Montgomery-REDC Wasm + fallback context comes from getWorkerMontRedcCode() above


  // Pollard p-1 Batched Windowed Stage 1 + Incremental-Gap Stage 2
  const runMontgomeryPMinus1 = (ctx, b1, b2) => {
    const { N, oneM, toMont, fromMont, montMul, montPow, montSub } = ctx;
    const primes = getPrimesUpTo(b2);
    let aM = toMont(2n);
    let idx = 0;

    // Stage 1: batch prime powers into ~256-bit exponent blocks for 4-bit windowed montPow
    let blockExp = 1n;
    const blockCap = 1n << 256n;
    for (; idx < primes.length && primes[idx] <= b1; idx++) {
      const p = primes[idx];
      let pwr = p;
      while (pwr * p <= b1) pwr *= p;
      blockExp *= BigInt(pwr);
      if (blockExp >= blockCap) {
        aM = montPow(aM, blockExp);
        blockExp = 1n;
        const g = gcd(montSub(fromMont(aM), 1n), N);
        if (g > 1n && g < N) return { factor: g, stage: 'Pollard p-1 Stage 1' };
      }
    }
    if (blockExp > 1n) {
      aM = montPow(aM, blockExp);
    }

    const aNorm = fromMont(aM);
    const g1 = gcd(aNorm >= 1n ? aNorm - 1n : aNorm + N - 1n, N);
    if (g1 > 1n && g1 < N) return { factor: g1, stage: 'Pollard p-1 Stage 1' };

    if (b2 <= b1 || idx >= primes.length) return null;

    // Stage 2: incremental step table for even prime gaps (1 mul per new gap)
    const a2M = montMul(aM, aM);
    const diffCache = new Map();
    diffCache.set(2, a2M);
    let maxCachedDelta = 2;
    const getStepPow = (delta) => {
      if ((delta & 1) === 1 || delta > 512) return montPow(aM, BigInt(delta));
      let cached = diffCache.get(delta);
      if (cached !== undefined) return cached;
      let cur = diffCache.get(maxCachedDelta);
      while (maxCachedDelta < delta) {
        maxCachedDelta += 2;
        cur = montMul(cur, a2M);
        diffCache.set(maxCachedDelta, cur);
      }
      return cur;
    };

    let prevP = primes[idx];
    let curM = montPow(aM, BigInt(prevP));
    let accumM = montSub(curM, oneM);
    if (accumM === 0n) accumM = oneM;

    for (let j = idx + 1; j < primes.length; j++) {
      const p = primes[j];
      const delta = p - prevP;
      prevP = p;
      const stepM = getStepPow(delta);
      curM = montMul(curM, stepM);
      const diff = montSub(curM, oneM);
      if (diff > 0n) accumM = montMul(accumM, diff);
      if ((j & 255) === 255) {
        const g2 = gcd(fromMont(accumM), N);
        if (g2 > 1n && g2 < N) return { factor: g2, stage: 'Pollard p-1 Stage 2' };
        accumM = oneM;
      }
    }
    const g2f = gcd(fromMont(accumM), N);
    if (g2f > 1n && g2f < N) return { factor: g2f, stage: 'Pollard p-1 Stage 2' };
    return null;
  };

  // Williams p+1 Stage 1 + BSGS Stage 2 (D = 210) using zero-alloc integer bit-scan Lucas V_k
  const runMontgomeryWilliamsPPlus1 = (ctx, b1, b2 = b1 * 8, seedsOverride = null) => {
    const { N, twoM, oneM, toMont, fromMont, montMul, montSub } = ctx;
    const primes = getPrimesUpTo(b1);

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

    const seeds = seedsOverride || [3n, 6n, 5n, 9n, 10n, 11n, 14n, 15n];
    const D = 210;
    const coprimes210 = [1, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103];

    for (let sIdx = 0; sIdx < seeds.length; sIdx++) {
      let vM = toMont(seeds[sIdx]);
      for (let i = 0; i < primes.length; i++) {
        const p = primes[i];
        let pwr = p;
        while (pwr * p <= b1) pwr *= p;
        vM = lucasStepNum(pwr, vM);
        if ((i & 511) === 511) {
          const vNorm = fromMont(vM);
          const g = gcd(vNorm >= 2n ? vNorm - 2n : vNorm + N - 2n, N);
          if (g > 1n && g < N) return { factor: g, stage: 'Williams p+1 Stage 1' };
        }
      }
      const vNorm = fromMont(vM);
      const g = gcd(vNorm >= 2n ? vNorm - 2n : vNorm + N - 2n, N);
      if (g > 1n && g < N) return { factor: g, stage: 'Williams p+1 Stage 1' };

      // Stage 2: V_{m*D +/- s} = 2 <=> V_{m*D} == V_s (mod p)
      if (b2 > b1) {
        const babies = new Array(coprimes210.length);
        for (let i = 0; i < coprimes210.length; i++) {
          babies[i] = lucasStepNum(coprimes210[i], vM);
        }
        const vD = lucasStepNum(D, vM);
        const startM = Math.max(1, Math.floor((b1 - 105) / D));
        const endM = Math.ceil((b2 + 105) / D);
        let vPrev = lucasStepNum(startM - 1, vD);
        let vCurr = lucasStepNum(startM, vD);
        let s2Acc = oneM;

        for (let m = startM; m <= endM; m++) {
          for (let i = 0; i < babies.length; i++) {
            const diff = montSub(vCurr, babies[i]);
            if (diff > 0n) s2Acc = montMul(s2Acc, diff);
          }
          if ((m & 31) === 31) {
            const g2 = gcd(fromMont(s2Acc), N);
            if (g2 > 1n && g2 < N) return { factor: g2, stage: 'Williams p+1 Stage 2' };
            s2Acc = oneM;
          }
          if (m < endM) {
            const vNext = montSub(montMul(vD, vCurr), vPrev);
            vPrev = vCurr;
            vCurr = vNext;
          }
        }
        const g2f = gcd(fromMont(s2Acc), N);
        if (g2f > 1n && g2f < N) return { factor: g2f, stage: 'Williams p+1 Stage 2' };
      }
    }
    return null;
  };

  // Unified Stage 1 + Stage 2 B2 (Suyama <-> Montgomery auto-switching) provided by runUnifiedEcmStage1And2


  const siqsCache = {
    key: '',
    fbPrimesBig: null,
    fbLogsScaled: null,
    start1Arr: null,
    start2Arr: null,
    soln1: null,
    soln2: null,
    bainv2: null,
    sieveBuffer: null,
    sieveU8: null,
    sieveU32: null,
    seenA: null,
    rngState: 0x12345679
  };

  const nextRandU32 = () => {
    let x = siqsCache.rngState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    siqsCache.rngState = x >>> 0;
    return siqsCache.rngState;
  };

  const LOG_SCALE = 1.35;

  // Split 2LP remainder (q1 * q2 with both <= lpBound) using fast bounded Pollard-Brent
  const splitDoubleLargePrime = (rem, lpBoundBig, seedBase) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const g = runPollardBrent(rem, 1100, seedBase + attempt * 19);
      if (g && g > 1n && g < rem) {
        const p1 = g;
        const p2 = rem / g;
        if (p1 <= lpBoundBig && p2 <= lpBoundBig && isProbablePrime(p1, 5) && isProbablePrime(p2, 5)) {
          return p1 <= p2 ? [p1, p2] : [p2, p1];
        }
        return null;
      }
    }
    return null;
  };

  // Factor candidate residue Q(x) at sieve index idx using O(1) modular root filter (idx % p === start1 || start2) + 1LP/2LP capture
  const factorSiqsCandidateFast = (
    Q,
    X,
    idx,
    A,
    aIndices,
    fbPrimes,
    fbPrimesBig,
    start1Arr,
    start2Arr,
    largePrimeBoundBig,
    lpBoundSq,
    allow2LP,
    N
  ) => {
    let signNeg = false;
    let rem = Q;
    if (rem < 0n) {
      signNeg = true;
      rem = -rem;
    }
    if (rem === 0n) {
      const g = gcd(X, N);
      if (g > 1n && g < N) return { directFactor: g };
      return null;
    }

    const sparseCols = [];
    let extraSquare = 1n;

    // 1. Divide primes in A first (each contributes +1 exponent from A)
    for (let j = 0; j < aIndices.length; j++) {
      const col = aIndices[j];
      const pBig = fbPrimesBig[col];
      let cnt = 1;
      while (rem % pBig === 0n) {
        rem /= pBig;
        cnt++;
      }
      if ((cnt & 1) === 1) sparseCols.push(col);
      const half = cnt >> 1;
      if (half > 0) extraSquare = (extraSquare * modPow(pBig, BigInt(half), N)) % N;
    }

    // 2. Divide small primes (< 11) directly without having written them into sieve array
    const fbLen = fbPrimes.length;
    let firstSievingIdx = 0;
    while (firstSievingIdx < fbLen && fbPrimes[firstSievingIdx] < 11) {
      const col = firstSievingIdx;
      firstSievingIdx++;
      if (start1Arr[col] === -2) continue; // belonged to A
      const p = fbPrimes[col];
      if (p === 2) {
        if ((rem & 1n) === 0n) {
          let cnt = 0;
          while ((rem & 1n) === 0n) {
            rem >>= 1n;
            cnt++;
          }
          if ((cnt & 1) === 1) sparseCols.push(col);
          const half = cnt >> 1;
          if (half > 0) extraSquare = (extraSquare * modPow(2n, BigInt(half), N)) % N;
        }
      } else {
        const pBig = fbPrimesBig[col];
        if (rem % pBig === 0n) {
          let cnt = 0;
          do {
            rem /= pBig;
            cnt++;
          } while (rem % pBig === 0n);
          if ((cnt & 1) === 1) sparseCols.push(col);
          const half = cnt >> 1;
          if (half > 0) extraSquare = (extraSquare * modPow(pBig, BigInt(half), N)) % N;
        }
      }
      if (rem === 1n) break;
    }

    // 3. Fast 32-bit modular filter for all FB primes >= 11:
    // p | Q_reduced(x) <=> (idx % p) === start1Arr[i] || (idx % p) === start2Arr[i]
    if (rem > 1n) {
      for (let i = firstSievingIdx; i < fbLen; i++) {
        const s1 = start1Arr[i];
        if (s1 < 0) continue;
        const p = fbPrimes[i];
        const rMod = idx % p;
        if (rMod !== s1 && rMod !== start2Arr[i]) continue;

        const pBig = fbPrimesBig[i];
        if (rem % pBig === 0n) {
          let cnt = 0;
          do {
            rem /= pBig;
            cnt++;
          } while (rem % pBig === 0n);
          if ((cnt & 1) === 1) sparseCols.push(i);
          const half = cnt >> 1;
          if (half > 0) extraSquare = (extraSquare * modPow(pBig, BigInt(half), N)) % N;
          if (rem === 1n) break;
        }
      }
    }

    if (rem === 1n) {
      sparseCols.sort((u, v) => u - v);
      return {
        relation: {
          xVal: X.toString(),
          qVal: (Q * A).toString(),
          signNeg,
          sparseCols,
          extraSquare: extraSquare.toString()
        }
      };
    }

    if (rem <= largePrimeBoundBig && isProbablePrime(rem, 5)) {
      sparseCols.sort((u, v) => u - v);
      return {
        relation: {
          xVal: X.toString(),
          qVal: (Q * A).toString(),
          signNeg,
          sparseCols,
          extraSquare: extraSquare.toString(),
          largePrime: rem.toString()
        }
      };
    }

    if (allow2LP && rem <= lpBoundSq && !isProbablePrime(rem, 4)) {
      const pair = splitDoubleLargePrime(rem, largePrimeBoundBig, idx & 255);
      if (pair) {
        sparseCols.sort((u, v) => u - v);
        return {
          relation: {
            xVal: X.toString(),
            qVal: (Q * A).toString(),
            signNeg,
            sparseCols,
            extraSquare: extraSquare.toString(),
            largePrime: pair[0].toString(),
            largePrime2: pair[1].toString()
          }
        };
      }
    }

    return null;
  };

  /**
   * High-Speed SIQS (Self-Initializing Quadratic Sieve):
   * - Uses Knuth-Schroeppel M = k * N for polynomials & roots while keeping X mod N.
   * - Selects optimal targetA = sqrt(2M)/H with sorted unique primes & disjoint worker partitioning.
   * - Updates start1Arr/start2Arr directly via Gray-code deltas.
   * - 4-wide Uint32Array & 0x80808080 threshold scan + 32-bit (idx % p) trial filter + 1LP/2LP capture.
   */
  const runSiqsPolyFamily = (
    N,
    targetM,
    fbPrimes,
    fbRoots,
    fbLogs,
    largePrimeBound,
    familyIdx,
    siqsRank = 0,
    siqsTotalWorkers = 1,
    seedOffset = 0,
    baseHalfWidth = 0,
    sieveMode = 'v4-fallback',
    sieveWeights = null
  ) => {
    if (!fbPrimes || fbPrimes.length < 6) {
      return { relations: [], directFactor: null, polysProcessed: 0, sieveHalfWidth: 8192, rowScale: 1 };
    }

    const fbLen = fbPrimes.length;
    const nBits = N.toString(2).length;
    const M = targetM && targetM >= N ? targetM : N;
    const cacheKey = N.toString() + ':' + M.toString() + ':' + fbLen + ':' + siqsRank;

    if (siqsCache.key !== cacheKey) {
      siqsCache.key = cacheKey;
      siqsCache.fbPrimesBig = fbPrimes.map(p => BigInt(p));
      const logs = new Uint8Array(fbLen);
      for (let i = 0; i < fbLen; i++) {
        logs[i] = Math.min(40, Math.max(2, Math.round(Math.log2(fbPrimes[i]) * LOG_SCALE)));
      }
      siqsCache.fbLogsScaled = logs;
      siqsCache.start1Arr = new Int32Array(fbLen);
      siqsCache.start2Arr = new Int32Array(fbLen);
      siqsCache.soln1 = new Int32Array(fbLen);
      siqsCache.soln2 = new Int32Array(fbLen);
      siqsCache.bainv2 = [];
      siqsCache.seenA = new Set();
      const mix = ((siqsRank + 1) * 2654435761) ^ Number(BigInt.asUintN(32, N)) ^ (seedOffset & 0x7fffffff) ^ 0x9e3779b9;
      siqsCache.rngState = (mix >>> 0) || 1;
    }

    const fbPrimesBig = siqsCache.fbPrimesBig;
    const sieveLogs = siqsCache.fbLogsScaled;
    const start1Arr = siqsCache.start1Arr;
    const start2Arr = siqsCache.start2Arr;
    const soln1 = siqsCache.soln1;
    const soln2 = siqsCache.soln2;
    const seenA = siqsCache.seenA;

    const autoHalfWidth = baseHalfWidth > 0
      ? baseHalfWidth
      : (nBits >= 165 ? 32768 : (nBits >= 125 ? 16384 : 8192));

    let rowScale = 1.0;
    let activeRowIdx = 0;
    const useV4 = sieveMode === 'v4-fallback' && sieveWeights && Array.isArray(sieveWeights.rowMedians) && sieveWeights.rowMedians.length > 0;
    if (useV4) {
      activeRowIdx = familyIdx % sieveWeights.rowMedians.length;
      const rawS = Number(sieveWeights.rowMedians[activeRowIdx]) || 1;
      rowScale = Math.min(1.5, Math.max(0.85, rawS >= 1.15 ? rawS : 1.0 + (rawS - 0.85) * 0.25));
    }

    const rawHalf = Math.round((autoHalfWidth * rowScale) / 64) * 64;
    const sieveHalfWidth = Math.min(49152, Math.max(6144, rawHalf));
    const totalLen = 2 * sieveHalfWidth;
    const numWords = totalLen >>> 2;

    if (!siqsCache.sieveBuffer || siqsCache.sieveBuffer.byteLength < totalLen) {
      const allocLen = Math.max(totalLen, 98304);
      siqsCache.sieveBuffer = new ArrayBuffer(allocLen);
      siqsCache.sieveU8 = new Uint8Array(siqsCache.sieveBuffer);
      siqsCache.sieveU32 = new Uint32Array(siqsCache.sieveBuffer);
    }
    const sieveU8 = siqsCache.sieveU8;
    const sieveU32 = siqsCache.sieveU32;

    const largePrimeBoundBig = BigInt(largePrimeBound || (fbPrimes[fbLen - 1] * 64));
    const lpBoundSq = largePrimeBoundBig * largePrimeBoundBig;
    const allow2LP = nBits >= 130;

    // Select optimal targetA = floor(sqrt(2*M) / H) and geometric-guided sCount in [2..8]
    const targetA = bigSqrt(2n * M) / BigInt(sieveHalfWidth);
    const targetABits = targetA > 1n ? targetA.toString(2).length : 10;
    const poolStart = Math.max(4, Math.floor(fbLen * 0.12));
    const tailLimit = Math.max(poolStart + 10, Math.floor(fbLen * 0.92));
    const medianPrimeBits = Math.max(6, Math.log2(fbPrimes[Math.floor(fbLen * 0.50)]));
    const sCount = Math.min(8, Math.max(2, Math.ceil(targetABits / medianPrimeBits)));

    // Binary search helper for target prime value in [minI..maxI]
    const findClosestIdx = (desiredVal, minI, maxI) => {
      let lo = minI;
      let hi = maxI;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (fbPrimes[mid] < desiredVal) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    // Pick strictly sorted unique aIndices, partitioning aIndices[0] across SIQS workers for 0% overlap
    const wTotal = Math.max(1, siqsTotalWorkers);
    const wRank = ((siqsRank % wTotal) + wTotal) % wTotal;
    const idealPerPrime = Math.pow(Math.max(4, Number(targetA)), 1 / sCount);
    const idealFirstCenter = findClosestIdx(idealPerPrime * 0.72, poolStart, tailLimit - sCount);
    const firstBandLo = Math.max(poolStart, idealFirstCenter - Math.max(wTotal * 6, Math.floor(fbLen * 0.14)));
    const firstBandHi = Math.min(tailLimit - sCount, Math.max(firstBandLo + wTotal, idealFirstCenter + Math.max(wTotal * 4, Math.floor(fbLen * 0.08))));

    let aIndices = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const picked = new Set();
      const cand = [];

      // Partitioned smallest prime index i0 strictly matching (i0 % wTotal === wRank)
      const bandCount = Math.max(1, Math.floor((firstBandHi - firstBandLo) / wTotal));
      let i0 = firstBandLo - (firstBandLo % wTotal) + wRank;
      if (i0 < firstBandLo) i0 += wTotal;
      i0 += (nextRandU32() % bandCount) * wTotal;
      if (i0 >= tailLimit - sCount) {
        i0 = poolStart - (poolStart % wTotal) + wRank;
        if (i0 < poolStart) i0 += wTotal;
      }
      cand.push(i0);
      picked.add(i0);
      let prevIdx = i0;
      let prodSoFar = fbPrimesBig[i0];

      const midRem = sCount - 2;
      for (let j = 0; j < midRem; j++) {
        const slotsAfter = midRem - j; // including last prime
        const minI = prevIdx + 1;
        const maxI = Math.max(minI, tailLimit - slotsAfter - 1);
        const remRatio = Number(targetA / prodSoFar);
        const idealMid = Math.pow(Math.max(4, remRatio), 1 / (slotsAfter + 1));
        const centerIdx = findClosestIdx(idealMid, minI, maxI);
        const jitterHalf = Math.max(4, Math.floor(fbLen * 0.09));
        const loJ = Math.max(minI, centerIdx - jitterHalf);
        const hiJ = Math.min(maxI, centerIdx + jitterHalf);
        let idxJ = loJ + (nextRandU32() % Math.max(1, hiJ - loJ + 1));
        while (picked.has(idxJ) && idxJ < maxI) idxJ++;
        while (picked.has(idxJ) && idxJ > minI) idxJ--;
        picked.add(idxJ);
        cand.push(idxJ);
        prodSoFar *= fbPrimesBig[idxJ];
        prevIdx = idxJ;
      }

      // Final prime chosen to closely match targetA / prod(cand)
      const desiredLast = Number(targetA / prodSoFar);
      let lastIdx = findClosestIdx(desiredLast, Math.min(fbLen - 1, prevIdx + 1), fbLen - 1);
      while ((picked.has(lastIdx) || lastIdx <= prevIdx) && lastIdx < fbLen - 1) lastIdx++;
      while ((picked.has(lastIdx) || lastIdx <= prevIdx) && lastIdx > prevIdx + 1) lastIdx--;

      if (!picked.has(lastIdx) && cand.length + 1 === sCount) {
        cand.push(lastIdx);
        cand.sort((u, v) => u - v);
        const key = cand.join(',');
        if (!seenA.has(key)) {
          seenA.add(key);
          aIndices = cand;
          break;
        }
      }
    }

    if (!aIndices) {
      aIndices = [];
      let cur = poolStart - (poolStart % wTotal) + wRank;
      if (cur < poolStart) cur += wTotal;
      for (let j = 0; j < sCount; j++) {
        const safe = Math.min(fbLen - 1 - (sCount - 1 - j), cur);
        aIndices.push(safe);
        cur = safe + 1 + ((familyIdx + j) % 3);
      }
    }

    let A = 1n;
    for (let j = 0; j < aIndices.length; j++) A *= fbPrimesBig[aIndices[j]];

    // Compute B_0..B_{s-1} such that B_j === fbRoots[j] (mod q_j) and 0 (mod q_i, i != j)
    const BTerms = new Array(aIndices.length);
    for (let j = 0; j < aIndices.length; j++) {
      const idxJ = aIndices[j];
      const q = fbPrimes[idxJ];
      const qBig = fbPrimesBig[idxJ];
      const r = fbRoots[idxJ];
      const Mj = A / qBig;
      const mjModQ = Number(Mj % qBig);
      const inv = modInverseNum(mjModQ, q);
      let gamma = (r * inv) % q;
      if (gamma > (q >> 1)) gamma -= q;
      BTerms[j] = BigInt(gamma) * Mj;
    }

    let b = 0n;
    for (let j = 0; j < BTerms.length; j++) b += BTerms[j];

    const numExtra = aIndices.length - 1;
    while (siqsCache.bainv2.length < numExtra) {
      siqsCache.bainv2.push(new Int32Array(fbLen));
    }
    const bainv2 = siqsCache.bainv2;
    const aSkip = new Set(aIndices);

    let firstSievingIdx = 0;
    while (firstSievingIdx < fbLen && fbPrimes[firstSievingIdx] < 11) {
      start1Arr[firstSievingIdx] = aSkip.has(firstSievingIdx) ? -2 : -1;
      start2Arr[firstSievingIdx] = -1;
      firstSievingIdx++;
    }

    for (let i = firstSievingIdx; i < fbLen; i++) {
      if (aSkip.has(i)) {
        start1Arr[i] = -2;
        start2Arr[i] = -2;
        continue;
      }
      const p = fbPrimes[i];
      const pBig = fbPrimesBig[i];
      const aModP = Number(A % pBig);
      if (aModP === 0) {
        start1Arr[i] = -1;
        start2Arr[i] = -1;
        continue;
      }
      const aInv = aModP === 1 ? 1 : modInverseNum(aModP, p);
      const bModP = Number(((b % pBig) + pBig) % pBig);
      const r = fbRoots[i];

      const s1 = ((((r - bModP) % p + p) % p) * aInv) % p;
      const s2 = ((((p - r - bModP) % p + p) % p) * aInv) % p;
      soln1[i] = s1;
      soln2[i] = s2;
      start1Arr[i] = (s1 + sieveHalfWidth) % p;
      start2Arr[i] = (s2 + sieveHalfWidth) % p;

      for (let j = 0; j < numExtra; j++) {
        const twoB = (2n * BTerms[j + 1]) % pBig;
        const twoBMod = Number((twoB + pBig) % pBig);
        bainv2[j][i] = (twoBMod * aInv) % p;
      }
    }

    // Estimate max |Q_reduced| and configure 4-wide sign-bit threshold (0x80), accounting for skipped p < 11 primes
    const mBig = BigInt(sieveHalfWidth);
    const qCenterApprox = M / A;
    const qEdgeApprox = A * mBig * mBig;
    const maxQEst = qCenterApprox > qEdgeApprox ? qCenterApprox : qEdgeApprox;
    const approxQBits = Math.max(14, maxQEst.toString(2).length);
    const lpBits = Math.log2(Number(largePrimeBoundBig));
    const subBits = allow2LP
      ? (nBits >= 170 ? Math.min(54, Math.round(lpBits * 2.0 + 12)) : Math.min(50, Math.round(lpBits * 1.9 + 11)))
      : Math.min(32, Math.round(lpBits * 1.15 + 9));
    const minNeededScore = Math.min(118, Math.max(6, Math.round((approxQBits - subBits) * LOG_SCALE)));
    const initVal = Math.max(4, 128 - minNeededScore);
    const initWord = (initVal | (initVal << 8) | (initVal << 16) | (initVal << 24)) >>> 0;

    const totalPolys = 1 << Math.max(0, numExtra);
    const relations = [];
    let prevGray = 0;

    for (let m = 0; m < totalPolys; m++) {
      if (m > 0) {
        const currGray = m ^ (m >> 1);
        const diff = prevGray ^ currGray;
        let nu = 0;
        while (((diff >> nu) & 1) === 0) nu++;
        const turnedToMinus = ((currGray >> nu) & 1) === 1;
        prevGray = currGray;

        const jTerm = BTerms[nu + 1];
        const deltas = bainv2[nu];
        if (turnedToMinus) {
          b -= 2n * jTerm;
          for (let i = firstSievingIdx; i < fbLen; i++) {
            const p = fbPrimes[i];
            let s1 = start1Arr[i];
            if (s1 < 0) continue;
            const d = deltas[i];
            s1 += d;
            if (s1 >= p) s1 -= p;
            let s2 = start2Arr[i] + d;
            if (s2 >= p) s2 -= p;
            start1Arr[i] = s1;
            start2Arr[i] = s2;
          }
        } else {
          b += 2n * jTerm;
          for (let i = firstSievingIdx; i < fbLen; i++) {
            const p = fbPrimes[i];
            let s1 = start1Arr[i];
            if (s1 < 0) continue;
            const d = deltas[i];
            s1 -= d;
            if (s1 < 0) s1 += p;
            let s2 = start2Arr[i] - d;
            if (s2 < 0) s2 += p;
            start1Arr[i] = s1;
            start2Arr[i] = s2;
          }
        }
      }

      const C = (b * b - M) / A;

      // Initialize Uint32Array with packed initVal
      for (let w = 0; w < numWords; w++) sieveU32[w] = initWord;

      // Fast ADD log sieve for primes >= 11
      for (let i = firstSievingIdx; i < fbLen; i++) {
        let idx1 = start1Arr[i];
        if (idx1 < 0) continue;
        const p = fbPrimes[i];
        const logP = sieveLogs[i];
        let idx2 = start2Arr[i];
        if (idx2 !== idx1) {
          while (idx1 < totalLen && idx2 < totalLen) {
            sieveU8[idx1] += logP;
            sieveU8[idx2] += logP;
            idx1 += p;
            idx2 += p;
          }
          for (; idx1 < totalLen; idx1 += p) sieveU8[idx1] += logP;
          for (; idx2 < totalLen; idx2 += p) sieveU8[idx2] += logP;
        } else {
          for (; idx1 < totalLen; idx1 += p) sieveU8[idx1] += logP;
        }
      }

      // 4-byte parallel sign-bit scan (0x80808080)
      for (let w = 0; w < numWords; w++) {
        if ((sieveU32[w] & 0x80808080) === 0) continue;
        const base = w << 2;
        for (let k = 0; k < 4; k++) {
          const idx = base + k;
          if (sieveU8[idx] >= 128) {
            const xOffset = BigInt(idx - sieveHalfWidth);
            const Q = A * xOffset * xOffset + 2n * b * xOffset + C;
            const X = ((A * xOffset + b) % N + N) % N;
            if (Q === 0n) {
              const g = gcd(X, N);
              if (g > 1n && g < N) return { relations, directFactor: g, polysProcessed: m + 1, sieveHalfWidth, rowScale, activeRowIdx };
              continue;
            }
            const res = factorSiqsCandidateFast(
              Q,
              X,
              idx,
              A,
              aIndices,
              fbPrimes,
              fbPrimesBig,
              start1Arr,
              start2Arr,
              largePrimeBoundBig,
              lpBoundSq,
              allow2LP,
              N
            );
            if (!res) continue;
            if (res.directFactor) {
              return { relations, directFactor: res.directFactor, polysProcessed: m + 1, sieveHalfWidth, rowScale, activeRowIdx };
            }
            if (res.relation) relations.push(res.relation);
          }
        }
      }
    }

    return { relations, directFactor: null, polysProcessed: totalPolys, sieveHalfWidth, rowScale, activeRowIdx };
  };

  const FERMAT_QR64 = (() => {
    const m = new Uint8Array(64);
    for (let i = 0; i < 64; i++) m[(i * i) & 63] = 1;
    return m;
  })();
  const FERMAT_QR45 = (() => {
    const m = new Uint8Array(45);
    for (let i = 0; i < 45; i++) m[(i * i) % 45] = 1;
    return m;
  })();
  const FERMAT_QR77 = (() => {
    const m = new Uint8Array(77);
    for (let i = 0; i < 77; i++) m[(i * i) % 77] = 1;
    return m;
  })();

  // QR-filtered Fermat close-primes search (>99% skip rate -> 200k steps in ~2ms) + Hart k*N close-ratio check
  const runFermatSearch = (N, maxSteps = 200000, startOffset = 0n) => {
    let s = bigSqrt(N);
    if (s * s === N) return s;
    s = s + 1n + startOffset;

    const nMod64 = Number(N & 63n);
    const nMod45 = Number(N % 45n);
    const nMod77 = Number(N % 77n);
    let x64 = Number(s & 63n);
    let x45 = Number(s % 45n);
    let x77 = Number(s % 77n);
    let x = s;

    for (let i = 0; i < maxSteps; i++) {
      if (
        FERMAT_QR64[(x64 * x64 - nMod64) & 63] &&
        FERMAT_QR45[((x45 * x45 - nMod45) % 45 + 45) % 45] &&
        FERMAT_QR77[((x77 * x77 - nMod77) % 77 + 77) % 77]
      ) {
        const diff = x * x - N;
        const r = bigSqrt(diff);
        if (r * r === diff) {
          const p = x - r;
          const q = x + r;
          if (p > 1n && p < N && p * q === N) return p;
        }
      }
      x += 1n;
      x64 = (x64 + 1) & 63;
      x45 = x45 + 1 >= 45 ? 0 : x45 + 1;
      x77 = x77 + 1 >= 77 ? 0 : x77 + 1;
    }
    return null;
  };

  // Bounded Hart/Lehman close-ratio scan for a*p ~ b*q using 4*k*N ((a*p + b*q)^2 - 4*k*N = (a*p - b*q)^2)
  const runHartCloseRatioSearch = (N, workerId = 0, totalWorkers = 1, maxK = 16, windowSteps = 2048) => {
    for (let k = 2 + workerId; k <= maxK; k += Math.max(1, totalWorkers)) {
      const kN = BigInt(4 * k) * N;
      let x = bigSqrt(kN);
      if (x * x < kN) x += 1n;
      const kMod64 = Number(kN & 63n);
      const kMod45 = Number(kN % 45n);
      let x64 = Number(x & 63n);
      let x45 = Number(x % 45n);
      for (let s = 0; s < windowSteps; s++) {
        if (FERMAT_QR64[(x64 * x64 - kMod64) & 63] && FERMAT_QR45[((x45 * x45 - kMod45) % 45 + 45) % 45]) {
          const diff = x * x - kN;
          const r = bigSqrt(diff);
          if (r * r === diff) {
            const g = gcd(x - r, N);
            if (g > 1n && g < N) return g;
          }
        }
        x += 1n;
        x64 = (x64 + 1) & 63;
        x45 = x45 + 1 >= 45 ? 0 : x45 + 1;
      }
    }
    return null;
  };

  const bigLn = (val) => {
    if (val <= 1n) return 0;
    const bits = val.toString(2).length;
    if (bits <= 53) return Math.log(Number(val));
    const shift = BigInt(bits - 53);
    const topMantissa = Number(val >> shift);
    return Math.log(topMantissa) + Number(shift) * Math.LN2;
  };

  const computeMDualMatrix = (N) => {
    const sqrtN = bigSqrt(N);
    const baseLn = bigLn(sqrtN);
    const scales = [0.85, 0.95, 0.99, 1.0, 1.01, 1.05, 1.15];
    const logCandidates = scales.map((sc) => Math.max(0.6931471805599453, baseLn + Math.log(sc)));
    const r = logCandidates.length;
    const zeros = ZETA_ZEROS.slice(0, 8);
    const m = zeros.length;
    const S = [];
    for (let i = 0; i < m; i++) {
      const row = [];
      for (let j = 0; j < r; j++) row.push(Math.cos(zeros[i] * logCandidates[j]));
      S.push(row);
    }
    const A = logCandidates.map(lnX => {
      let sum = 0;
      for (let k = 0; k < m; k++) sum += Math.cos(zeros[k] * lnX) / zeros[k];
      return Math.abs(1.0 - 2.0 * sum);
    });
    const STS = Array.from({ length: r }, () => Array(r).fill(0));
    for (let i = 0; i < r; i++) {
      for (let j = 0; j < r; j++) {
        let val = 0;
        for (let k = 0; k < m; k++) val += S[k][i] * S[k][j];
        STS[i][j] = val;
      }
    }
    const alpha = 0.5;
    const size = 2 * r;
    const M_dual = Array.from({ length: size }, () => Array(size).fill(0));
    for (let i = 0; i < r; i++) {
      for (let j = 0; j < r; j++) {
        M_dual[i][j] = STS[i][j];
        M_dual[i][j + r] = alpha * STS[i][j] * A[j];
        M_dual[i + r][j] = alpha * A[i] * STS[i][j];
        M_dual[i + r][j + r] = A[i] * A[j];
      }
    }
    return { matrix: M_dual, dimension: size };
  };

  /**
   * Find single factor via Role-Specialized Strategy:
   * - role === 'ecm': Cooperative p-1 Stage 1+2, Lucas p+1 Stage 1+2, & Progressive Suyama ECM Stage 1+2
   * - role === 'siqs': Disjoint-A Gray-code SIQS + 4-byte Uint32 scan + 1LP/2LP harvesting
   */
  const findSingleFactor = async (
    targetN,
    targetM,
    role = 'siqs',
    workerId = 0,
    totalWorkers = 1,
    siqsRank = 0,
    siqsTotalWorkers = 1,
    seedOffset = 0,
    fbPrimes = [],
    fbRoots = [],
    fbLogs = [],
    largePrimeBound = 1000000,
    sieveMode = 'v4-fallback',
    sieveWeights = null,
    zetaSigmaSeed = null,
    zetaRhoSeed = null
  ) => {
    const smallPrimes = getPrimesUpTo(2000);
    for (let i = 0; i < smallPrimes.length; i++) {
      const sp = BigInt(smallPrimes[i]);
      if (targetN % sp === 0n) return sp;
    }
    if (isProbablePrime(targetN, 10)) return targetN;

    const nBits = targetN.toString(2).length;
    const fermatBudget = nBits > 220 ? 120000 : 40000;
    const fermatFactor = runFermatSearch(targetN, fermatBudget, BigInt(workerId * fermatBudget));
    if (fermatFactor && fermatFactor > 1n && fermatFactor < targetN) return fermatFactor;

    if (nBits > 220) {
      const hartFactor = runHartCloseRatioSearch(targetN, workerId, totalWorkers, 16, 2048);
      if (hartFactor && hartFactor > 1n && hartFactor < targetN) return hartFactor;
    }

    const initialBrentCap = nBits > 220 ? 3500 : 25000;
    const brentFactor = runPollardBrent(targetN, initialBrentCap, workerId + seedOffset, zetaRhoSeed);
    if (brentFactor && brentFactor > 1n && brentFactor < targetN) return brentFactor;

    const sharedMontCtx = (targetN & 1n) === 1n ? createMontgomeryCtx(targetN) : null;
    if (sharedMontCtx && workerId === 0) {
      const redcBench = benchmarkWorkerRedcVsNaive(sharedMontCtx, 'web-worker');
      self.postMessage({ type: 'chronos_redc_benchmark', ...redcBench });
    }

    if ((role === 'ecm' || nBits > 220) && sharedMontCtx) {
      if (workerId === 0) {
        const pm1B1 = nBits > 500 ? 80000 : 30000;
        const pm1B2 = nBits > 500 ? 900000 : 240000;
        const autoSel = selectAutoCurveFamilyWorker(nBits, pm1B2);
        self.postMessage({
          type: 'chronos_suyama_stage',
          workerId,
          totalWorkers,
          role: 'ecm',
          cycle: 0,
          curveIndex: 0,
          sigma: 'p-1 Stage 1+2',
          b1Bound: pm1B1,
          b2Bound: pm1B2,
          torsionCertified: true,
          stagePhase: 'stage1',
          curveFamily: autoSel.curveFamily,
          autoSwitchReason: autoSel.autoSwitchReason,
          b2ProgressPct: 0,
          b2GiantStepsDone: 0,
          b2GiantStepsTotal: 0,
          dStep: 210
        });
        const pm1 = runMontgomeryPMinus1(sharedMontCtx, pm1B1, pm1B2);
        if (pm1 && pm1.factor && pm1.factor > 1n && pm1.factor < targetN) return pm1.factor;
      } else if (workerId === 1) {
        const pp1B1 = nBits > 500 ? 45000 : 20000;
        const pp1B2 = nBits > 500 ? 450000 : 180000;
        const autoSel = selectAutoCurveFamilyWorker(nBits, pp1B2);
        self.postMessage({
          type: 'chronos_suyama_stage',
          workerId,
          totalWorkers,
          role: 'ecm',
          cycle: 0,
          curveIndex: 0,
          sigma: 'p+1 Lucas Stage 1+2',
          b1Bound: pp1B1,
          b2Bound: pp1B2,
          torsionCertified: true,
          stagePhase: 'stage1',
          curveFamily: autoSel.curveFamily,
          autoSwitchReason: autoSel.autoSwitchReason,
          b2ProgressPct: 0,
          b2GiantStepsDone: 0,
          b2GiantStepsTotal: 0,
          dStep: 210
        });
        const pp1 = runMontgomeryWilliamsPPlus1(sharedMontCtx, pp1B1, pp1B2, [3n, 6n, 5n, 9n]);
        if (pp1 && pp1.factor && pp1.factor > 1n && pp1.factor < targetN) return pp1.factor;
      } else if (workerId === 2 && nBits > 500 && totalWorkers >= 4) {
        const pm1DeepB1 = 220000;
        const pm1DeepB2 = 2200000;
        const autoSel = selectAutoCurveFamilyWorker(nBits, pm1DeepB2);
        self.postMessage({
          type: 'chronos_suyama_stage',
          workerId,
          totalWorkers,
          role: 'ecm',
          cycle: 0,
          curveIndex: 0,
          sigma: 'Deep p-1 (220k/2.2M)',
          b1Bound: pm1DeepB1,
          b2Bound: pm1DeepB2,
          torsionCertified: true,
          stagePhase: 'stage1',
          curveFamily: autoSel.curveFamily,
          autoSwitchReason: autoSel.autoSwitchReason,
          b2ProgressPct: 0,
          b2GiantStepsDone: 0,
          b2GiantStepsTotal: 0,
          dStep: 210
        });
        const pm1Deep = runMontgomeryPMinus1(sharedMontCtx, pm1DeepB1, pm1DeepB2);
        if (pm1Deep && pm1Deep.factor && pm1Deep.factor > 1n && pm1Deep.factor < targetN) return pm1Deep.factor;
      } else if (workerId === 3 && nBits > 500 && totalWorkers >= 5) {
        const pp1B1 = 45000;
        const pp1B2 = 450000;
        const autoSel = selectAutoCurveFamilyWorker(nBits, pp1B2);
        self.postMessage({
          type: 'chronos_suyama_stage',
          workerId,
          totalWorkers,
          role: 'ecm',
          cycle: 0,
          curveIndex: 0,
          sigma: 'p+1 Lucas Seeds-B',
          b1Bound: pp1B1,
          b2Bound: pp1B2,
          torsionCertified: true,
          stagePhase: 'stage1',
          curveFamily: autoSel.curveFamily,
          autoSwitchReason: autoSel.autoSwitchReason,
          b2ProgressPct: 0,
          b2GiantStepsDone: 0,
          b2GiantStepsTotal: 0,
          dStep: 210
        });
        const pp1b = runMontgomeryWilliamsPPlus1(sharedMontCtx, pp1B1, pp1B2, [10n, 11n, 14n, 15n]);
        if (pp1b && pp1b.factor && pp1b.factor > 1n && pp1b.factor < targetN) return pp1b.factor;
      }
    }

    let cycle = 0;
    let totalCurves = 0;
    let totalPolys = 0;
    let smoothRelationsCount = 0;
    let steps = 0;
    let lastTelemetryTime = Date.now();
    let lastYieldTime = Date.now();
    let lastBatchFlushTime = Date.now();
    let pendingRelations = [];
    let lastHalfWidth = 32768;
    let lastRowScale = 1;
    let lastRowIdx = 0;
    let familyIdx = siqsRank;

    const ecmSchedule = [
      { b1: 4000, b2: 120000, curves: 10 },
      { b1: 15000, b2: 450000, curves: 8 },
      { b1: 50000, b2: 1500000, curves: 6 },
      { b1: 110000, b2: 2640000, curves: 4 }
    ];

    while (true) {
      cycle++;

      if (role === 'ecm' || nBits > 220 || !fbPrimes || fbPrimes.length < 8) {
        const tier = cycle <= ecmSchedule.length
          ? ecmSchedule[cycle - 1]
          : { b1: 110000 + (cycle - 4) * 75000, b2: (110000 + (cycle - 4) * 75000) * 24, curves: 4 };
        const b1 = tier.b1;
        const b2 = tier.b2;
        const primesB1 = getPrimesUpTo(b1);

        for (let c = 0; c < tier.curves; c++) {
          totalCurves++;
          steps += Math.round(b1 / 8);
          const gammaPerturb = BigInt(Math.floor(ZETA_ZEROS[(c + workerId) % ZETA_ZEROS.length] * 1000));
          const workerSeedSkew = BigInt(seedOffset + workerId * 104729 + c * 31337 + cycle * 9973);
          let baseZetaSigma = 7n;
          if (zetaSigmaSeed) {
            try {
              const parsed = BigInt(zetaSigmaSeed);
              if (parsed > 5n) baseZetaSigma = parsed;
            } catch {}
          }
          const sigmaVal = (cycle === 1 && c === 0 && zetaSigmaSeed)
            ? baseZetaSigma
            : (baseZetaSigma + gammaPerturb + workerSeedSkew + BigInt((c * 7919 + workerId * 65537) & 0xfffff));

          const ecmRes = runUnifiedEcmStage1And2(
            targetN,
            sigmaVal,
            b1,
            b2,
            primesB1,
            modInverse,
            gcd,
            (prog) => {
              const now = Date.now();
              if (c === 0 || prog.stagePhase === 'stage2-b2' || now - lastTelemetryTime >= 90) {
                lastTelemetryTime = now;
                self.postMessage({
                  type: 'chronos_suyama_stage',
                  workerId,
                  totalWorkers,
                  role: 'ecm',
                  cycle,
                  curveIndex: totalCurves,
                  sigma: sigmaVal.toString() + ' · ' + (prog.curveFamily === 'montgomery' ? 'Montgomery' : 'Suyama'),
                  b1Bound: b1,
                  b2Bound: b2,
                  torsionCertified: true,
                  stagePhase: prog.stagePhase,
                  curveFamily: prog.curveFamily,
                  autoSwitchReason: prog.autoSwitchReason,
                  b2ProgressPct: prog.b2ProgressPct,
                  b2GiantStepsDone: prog.b2GiantStepsDone,
                  b2GiantStepsTotal: prog.b2GiantStepsTotal,
                  dStep: prog.dStep
                });
              }
            },
            sharedMontCtx
          );
          if (ecmRes && ecmRes.factor && ecmRes.factor > 1n && ecmRes.factor < targetN) {
            return ecmRes.factor;
          }
        }

        const brentDeep = runPollardBrent(targetN, nBits > 220 ? 12000 : 30000, workerId + cycle * 97 + seedOffset, zetaRhoSeed);
        if (brentDeep && brentDeep > 1n && brentDeep < targetN) return brentDeep;
        await new Promise(r => setTimeout(r, 1));
      } else {
        const siqsRes = runSiqsPolyFamily(
          targetN,
          targetM,
          fbPrimes,
          fbRoots,
          fbLogs,
          largePrimeBound,
          familyIdx,
          siqsRank,
          siqsTotalWorkers,
          seedOffset,
          0,
          sieveMode,
          sieveWeights
        );
        familyIdx += Math.max(1, siqsTotalWorkers);
        totalPolys += siqsRes.polysProcessed || 1;
        lastHalfWidth = siqsRes.sieveHalfWidth || lastHalfWidth;
        lastRowScale = siqsRes.rowScale || 1;
        lastRowIdx = siqsRes.activeRowIdx || 0;
        steps += (siqsRes.polysProcessed || 1) * 180;

        if (siqsRes.directFactor && siqsRes.directFactor > 1n && siqsRes.directFactor < targetN) {
          return siqsRes.directFactor;
        }
        if (siqsRes.relations.length > 0) {
          for (let r = 0; r < siqsRes.relations.length; r++) {
            pendingRelations.push(siqsRes.relations[r]);
          }
          smoothRelationsCount += siqsRes.relations.length;
        }

        const now = Date.now();
        if (pendingRelations.length >= 24 || (pendingRelations.length > 0 && now - lastBatchFlushTime >= 110)) {
          lastBatchFlushTime = now;
          self.postMessage({
            type: 'chronos_relations_batch',
            workerId,
            role: 'siqs',
            source: sieveMode === 'v4-fallback' ? 'SIQS-v4' : 'SIQS-Vanilla',
            sieveMode,
            polysProcessed: totalPolys,
            sieveHalfWidth: lastHalfWidth,
            rowScale: lastRowScale,
            activeRowIdx: lastRowIdx,
            targetN: targetN.toString(),
            relations: pendingRelations
          });
          pendingRelations = [];
        }

        if (now - lastTelemetryTime >= 150) {
          lastTelemetryTime = now;
          self.postMessage({
            type: 'chronos_progress',
            workerId,
            role,
            cycle,
            totalCurves,
            totalPolys,
            smoothRelations: smoothRelationsCount,
            steps
          });
        }

        if (now - lastYieldTime >= 140) {
          lastYieldTime = now;
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }
  };

  const fullRecursiveFactorization = async (
    N,
    targetM,
    role = 'siqs',
    workerId = 0,
    totalWorkers = 1,
    siqsRank = 0,
    siqsTotalWorkers = 1,
    seedOffset = 0,
    fbPrimes = [],
    fbRoots = [],
    fbLogs = [],
    largePrimeBound = 1000000,
    sieveMode = 'v4-fallback',
    sieveWeights = null,
    zetaSigmaSeed = null,
    zetaRhoSeed = null
  ) => {
    const primeFactors = [];
    const queue = [N];

    while (queue.length > 0) {
      const current = queue.pop();
      if (current <= 1n) continue;
      if (isProbablePrime(current, 10)) {
        primeFactors.push(current);
        continue;
      }
      const isRoot = current === N;
      const f = await findSingleFactor(
        current,
        isRoot ? targetM : current,
        role,
        workerId,
        totalWorkers,
        siqsRank,
        siqsTotalWorkers,
        seedOffset,
        isRoot ? fbPrimes : [],
        isRoot ? fbRoots : [],
        isRoot ? fbLogs : [],
        largePrimeBound,
        sieveMode,
        sieveWeights,
        isRoot ? zetaSigmaSeed : null,
        isRoot ? zetaRhoSeed : null
      );
      if (f && f > 1n && f < current) {
        queue.push(f);
        queue.push(current / f);
      } else {
        primeFactors.push(current);
      }
    }

    return primeFactors.sort((a, b) => (a < b ? -1 : 1));
  };

  const runChronos196 = async (
    N,
    targetM,
    role = 'siqs',
    workerId = 0,
    totalWorkers = 1,
    siqsRank = 0,
    siqsTotalWorkers = 1,
    seedOffset = 0,
    fbPrimes = [],
    fbRoots = [],
    fbLogs = [],
    largePrimeBound = 1000000,
    sieveMode = 'v4-fallback',
    sieveWeights = null,
    zetaSigmaSeed = null,
    zetaRhoSeed = null
  ) => {
    const startTime = Date.now();
    const nBits = N.toString(2).length;
    const totalDigits = N.toString(10).length;
    const roleLabel = role === 'ecm'
      ? (zetaSigmaSeed ? 'Zeta-Seeded REDC ECM' : 'ECM-Suyama Scout')
      : (sieveMode === 'v4-fallback' ? 'SIQS v4 Fast-2LP' : 'SIQS Vanilla');

    self.postMessage({
      type: 'log',
      message: \`[Chronos W#\${workerId + 1}/\${totalWorkers} · \${roleLabel}] Active (\${nBits}-bit, \${totalDigits} dec)...\`
    });

    const mDualData = workerId === 0 ? computeMDualMatrix(N) : null;
    if (workerId === 0 && mDualData) {
      self.postMessage({
        type: 'chronos_m_dual',
        mDualMatrix: mDualData.matrix,
        dimension: mDualData.dimension
      });
    }

    const allPrimes = await fullRecursiveFactorization(
      N,
      targetM,
      role,
      workerId,
      totalWorkers,
      siqsRank,
      siqsTotalWorkers,
      seedOffset,
      fbPrimes,
      fbRoots,
      fbLogs,
      largePrimeBound,
      sieveMode,
      sieveWeights,
      zetaSigmaSeed,
      zetaRhoSeed
    );
    const duration = Date.now() - startTime;

    return {
      factors: allPrimes.map(p => p.toString()),
      method: \`Chronos (\${roleLabel} · 1LP+2LP · \${totalWorkers}W)\`,
      steps: allPrimes.length * 2500,
      mDualMatrix: mDualData ? mDualData.matrix : null,
      workerId,
      duration
    };
  };

  self.onmessage = async (e) => {
    const {
      type,
      n,
      targetM,
      role = 'siqs',
      workerId = 0,
      totalWorkers = 1,
      siqsRank = 0,
      siqsTotalWorkers = 1,
      seedOffset = 0,
      fbPrimes = [],
      fbRoots = [],
      fbLogs = [],
      largePrimeBound = 1000000,
      sieveMode = 'v4-fallback',
      sieveWeights = null,
      zetaSigmaSeed = null,
      zetaRhoSeed = null
    } = e.data;
    if (type === 'start') {
      try {
        const N = BigInt(n);
        const M = targetM ? BigInt(targetM) : N;
        const res = await runChronos196(N, M, role, workerId, totalWorkers, siqsRank, siqsTotalWorkers, seedOffset, fbPrimes, fbRoots, fbLogs, largePrimeBound, sieveMode, sieveWeights, zetaSigmaSeed, zetaRhoSeed);

        if (res && res.factors && res.factors.length > 0) {
          self.postMessage({
            type: 'result',
            factors: res.factors,
            factor: res.factors[0],
            allFactors: res.factors,
            method: res.method,
            steps: res.steps,
            mDualMatrix: res.mDualMatrix,
            workerId: res.workerId,
            duration: res.duration
          });
        } else {
          self.postMessage({
            type: 'result',
            factor: null,
            workerId,
            steps: 0,
            duration: 0
          });
        }
      } catch (err) {
        self.postMessage({ type: 'error', workerId, message: err.message });
      }
    }
  };
`;
