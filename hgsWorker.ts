// Hybrid Geodesic Sieve (HGS) Web Worker Code
// Ultra-Accelerated Architecture (260..820+ bits):
// 1. Self-Initializing Multi-Polynomial Quadratic Sieve (SIQS / MPQS) with Gray Code root updates & 260..820b dynamic scaling
// 2. 32 KB L1 Cache-Blocked Sieving + Large-Prime Bucket Sieve (p >= blockSize) + Small-Prime Bypass (p < 29) + 4x Unrolling
// 3. Piecewise Block Logarithmic Thresholds (zero BigInt inside block loop) + Dynamic LOG_SCALE (zero Uint8 overflow)
// 4. BigInt-Free Candidate Hit Extraction (Bucket reuse + L1 Re-scan) + 53/62-bit Shanks' SQUFOF for 2LP Splitting
// 5. All-Core Disjoint-A Streaming into Shared GF(2) Pool & markowitz-core / Block Wiedemann Solver

export const HGS_WORKER_CODE = `
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

  const gcdNum = (a, b) => {
    let x = a < 0 ? -a : a;
    let y = b < 0 ? -b : b;
    while (y !== 0) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x;
  };

  const bigIntSqrt = (value) => {
    if (value <= 0n) return 0n;
    if (value < 2n) return value;
    let x = 1n << BigInt((value.toString(2).length + 1) >> 1);
    while (true) {
      const next = (x + value / x) >> 1n;
      if (next >= x) return x;
      x = next;
    }
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

  // Exact modular multiplication for IEEE-754 integers (fast path <= 67,108,864)
  const mulModNum = (a, b, mod) => {
    if (mod <= 67108864) return (a * b) % mod;
    return Number((BigInt(a) * BigInt(b)) % BigInt(mod));
  };

  const modPowNum = (base, exp, mod) => {
    if (mod <= 67108864) {
      let res = 1;
      let b = ((base % mod) + mod) % mod;
      let e = exp;
      while (e > 0) {
        if ((e & 1) === 1) res = (res * b) % mod;
        b = (b * b) % mod;
        e = Math.floor(e / 2);
      }
      return res;
    }
    let res = 1n;
    let b = BigInt(((base % mod) + mod) % mod);
    let e = BigInt(exp);
    const m = BigInt(mod);
    while (e > 0n) {
      if (e & 1n) res = (res * b) % m;
      b = (b * b) % m;
      e >>= 1n;
    }
    return Number(res);
  };

  const modInverseNum = (a, m) => {
    let m0 = m, t, q;
    let x0 = 0, x1 = 1;
    a = ((a % m) + m) % m;
    if (m === 1 || a === 0) return 0;
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

  const isProbablePrimeNum = (n, k = 4) => {
    if (n === 2 || n === 3) return true;
    if (n < 2 || n % 2 === 0) return false;
    if (n < 9) return true;
    if (n % 3 === 0 || n % 5 === 0) return false;
    let d = n - 1;
    let s = 0;
    while (d % 2 === 0) {
      d = Math.floor(d / 2);
      s++;
    }
    const bases = n < 4759123141 ? [2, 7, 61] : [2, 3, 5, 7, 11, 13];
    const rounds = Math.min(k, bases.length);
    for (let i = 0; i < rounds; i++) {
      const a = bases[i];
      if (a >= n) break;
      let x = modPowNum(a, d, n);
      if (x === 1 || x === n - 1) continue;
      let comp = true;
      for (let r = 1; r < s; r++) {
        x = mulModNum(x, x, n);
        if (x === n - 1) {
          comp = false;
          break;
        }
      }
      if (comp) return false;
    }
    return true;
  };

  const isProbablePrimeBig = (n, k = 8) => {
    if (n <= 9007199254740991n) return isProbablePrimeNum(Number(n), k);
    if (n === 2n || n === 3n) return true;
    if ((n & 1n) === 0n || n < 2n) return false;
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
    const rounds = Math.min(k, bases.length);
    for (let i = 0; i < rounds; i++) {
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

  const tonelliShanksNum = (nModP, p) => {
    if (p === 2) return nModP & 1;
    if (nModP === 0) return 0;
    if (p % 4 === 3) return modPowNum(nModP, (p + 1) >> 2, p);
    let q = p - 1;
    let s = 0;
    while ((q & 1) === 0) {
      q >>= 1;
      s++;
    }
    let z = 2;
    while (modPowNum(z, (p - 1) >> 1, p) !== p - 1) z++;
    let m = s;
    let c = modPowNum(z, q, p);
    let t = modPowNum(nModP, q, p);
    let r = modPowNum(nModP, (q + 1) >> 1, p);
    while (t !== 1) {
      if (t === 0) return 0;
      let i = 1;
      let temp = mulModNum(t, t, p);
      while (temp !== 1 && i < m) {
        temp = mulModNum(temp, temp, p);
        i++;
      }
      if (i === m) return 0;
      const b = modPowNum(c, 1 << (m - i - 1), p);
      m = i;
      c = mulModNum(b, b, p);
      t = mulModNum(t, c, p);
      r = mulModNum(r, b, p);
    }
    return r;
  };

  const getPrimesList = (limit) => {
    const half = (limit >> 1) + 1;
    const compOdd = new Uint8Array(half);
    const sqrtLim = Math.floor(Math.sqrt(limit));
    for (let p = 3; p <= sqrtLim; p += 2) {
      if (!compOdd[p >> 1]) {
        for (let j = (p * p) >> 1; j < half; j += p) compOdd[j] = 1;
      }
    }
    const primes = limit >= 2 ? [2] : [];
    for (let p = 3; p <= limit; p += 2) {
      if (!compOdd[p >> 1]) primes.push(p);
    }
    return primes;
  };

  // Knuth-Schroeppel multiplier selection
  const selectBestKsMultiplier = (N) => {
    const KS_MULTS = [1, 2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 29, 31, 37, 41, 43];
    const KS_PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
    let bestK = 1;
    let bestScore = -1e9;
    for (let i = 0; i < KS_MULTS.length; i++) {
      const k = KS_MULTS[i];
      if (k > 1) {
        const g = gcd(BigInt(k), N);
        if (g > 1n && g < N) return { k, directFactor: g };
      }
      const kN = BigInt(k) * N;
      let score = k <= 1 ? 0 : -0.5 * Math.log(k);
      const mod8 = Number(kN & 7n);
      if (mod8 === 1) score += 2.0 * Math.LN2;
      else if (mod8 === 5) score += Math.LN2;
      else if (mod8 === 3 || mod8 === 7) score += 0.5 * Math.LN2;
      for (let j = 0; j < KS_PRIMES.length; j++) {
        const p = KS_PRIMES[j];
        const contrib = Math.log(p) / (p - 1);
        if (k % p === 0) score += contrib;
        else {
          const r = Number(kN % BigInt(p));
          if (r === 0) score += contrib;
          else if (modPowNum(r, (p - 1) >> 1, p) === 1) score += 2 * contrib;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    return { k: bestK, directFactor: null };
  };

  // Odd-only Factor Base builder scaling across 64..820+ bits (core-adaptive at 225..280b)
  const buildHgsFactorBase = (N, M, workerCount = 1) => {
    const bits = N.toString(2).length;
    const wc = Math.max(1, Math.floor(workerCount || 1));
    const fb256 = wc <= 2 ? 3800 : (wc <= 4 ? 4400 : (wc <= 6 ? 5000 : 5600));
    let targetSize = 65;
    if (bits <= 40) targetSize = 32;
    else if (bits <= 64) targetSize = 65;
    else if (bits <= 100) targetSize = 115;
    else if (bits <= 125) targetSize = 220;
    else if (bits <= 145) targetSize = 380;
    else if (bits <= 170) targetSize = 680;
    else if (bits <= 198) targetSize = 1350;
    else if (bits <= 224) targetSize = 1950;
    else if (bits <= 256) targetSize = Math.round(1950 + ((bits - 224) / 32) * (fb256 - 1950));
    else if (bits <= 320) targetSize = Math.round(fb256 + ((bits - 256) / 64) * (6000 - fb256));
    else if (bits <= 420) targetSize = Math.round(6000 + ((bits - 320) / 100) * 12000);
    else if (bits <= 540) targetSize = Math.round(18000 + ((bits - 420) / 120) * 27000);
    else if (bits <= 680) targetSize = Math.round(45000 + ((bits - 540) / 140) * 25000);
    else if (bits <= 820) targetSize = Math.round(70000 + ((bits - 680) / 140) * 20000);
    else targetSize = 90000;

    const primes = [2];
    const roots = [Number(M & 1n)];
    const logs = [1];

    const limit = targetSize >= 70000
      ? 2900000
      : (targetSize >= 45000
        ? 2200000
        : (targetSize >= 18000
          ? 1350000
          : (targetSize >= 4500
            ? 600000
            : (targetSize >= 3000
              ? 420000
              : (bits > 220 ? 320000 : 120000)))));
    const halfLimit = (limit >> 1) + 1;
    const isCompOdd = new Uint8Array(halfLimit);
    const sqrtLim = Math.floor(Math.sqrt(limit));
    for (let p = 3; p <= sqrtLim; p += 2) {
      if (!isCompOdd[p >> 1]) {
        for (let j = (p * p) >> 1; j < halfLimit; j += p) isCompOdd[j] = 1;
      }
    }

    for (let p = 3; p <= limit && primes.length < targetSize; p += 2) {
      if (!isCompOdd[p >> 1]) {
        const pBig = BigInt(p);
        const mMod = Number(M % pBig);
        if (mMod === 0) continue;
        if (modPowNum(mMod, (p - 1) >> 1, p) === 1) {
          const r = tonelliShanksNum(mMod, p);
          if (r > 0) {
            primes.push(p);
            roots.push(r);
            logs.push(Math.max(1, Math.round(Math.log2(p))));
          }
        }
      }
    }
    const maxP = primes[primes.length - 1] || 2;
    const lpMult256 = wc <= 2 ? 240 : (wc <= 4 ? 280 : (wc <= 6 ? 310 : 350));
    const lpCap256 = wc <= 2 ? 20000000 : (wc <= 4 ? 26000000 : (wc <= 6 ? 32000000 : 38000000));
    const lpMult = bits >= 660 ? 750 : (bits >= 420 ? 600 : (bits >= 280 ? 420 : (bits >= 225 ? lpMult256 : 260)));
    const lpCap = bits >= 660
      ? 120000000
      : (bits >= 420
        ? 80000000
        : (bits >= 280
          ? 36000000
          : (bits >= 225 ? lpCap256 : (bits > 220 ? 15000000 : 4500000))));
    const largePrimeBound = Math.min(maxP * lpMult, maxP * maxP, lpCap);
    return { primes, roots, logs, largePrimeBound };
  };

  // Inline compiled WebAssembly HGS Kernel (v128 SIMD / i64 + L1 32KB sieve + 64-bit SQUFOF & deterministic MR)
  const buildHgsWasmBytes = (useSimd) => {
    const encU32 = (arr, val) => {
      let v = val >>> 0;
      while (true) {
        const b = v & 0x7f;
        v >>>= 7;
        if (v === 0) { arr.push(b); break; }
        arr.push(b | 0x80);
      }
    };
    const encI32 = (arr, val) => {
      let v = val | 0;
      while (true) {
        const b = v & 0x7f;
        v >>= 7;
        if ((v === 0 && (b & 0x40) === 0) || (v === -1 && (b & 0x40) !== 0)) {
          arr.push(b); break;
        }
        arr.push(b | 0x80);
      }
    };
    const encI64 = (arr, val) => {
      let v = BigInt.asIntN(64, val);
      while (true) {
        const b = Number(v & 0x7fn);
        v >>= 7n;
        if ((v === 0n && (b & 0x40) === 0) || (v === -1n && (b & 0x40) !== 0)) {
          arr.push(b); break;
        }
        arr.push(b | 0x80);
      }
    };
    const sec = (id, payload) => {
      const l = [];
      encU32(l, payload.length);
      return [id, ...l, ...payload];
    };
    const encStr = (s) => [s.length, ...Array.from(s, c => c.charCodeAt(0))];

    const typePayload = [
      10,
      0x60, 7, ...Array(7).fill(0x7f), 1, 0x7f,
      0x60, 14, ...Array(14).fill(0x7f), 1, 0x7f,
      0x60, 17, ...Array(17).fill(0x7f), 1, 0x7f,
      0x60, 14, ...Array(14).fill(0x7f), 1, 0x7f,
      0x60, 1, 0x7e, 1, 0x7e,
      0x60, 1, 0x7e, 1, 0x7f,
      0x60, 3, 0x7e, 0x7e, 0x7e, 1, 0x7e,
      0x60, 3, 0x7e, 0x7e, 0x7e, 1, 0x7e,
      0x60, 2, 0x7e, 0x7e, 1, 0x7e,
      0x60, 1, 0x7e, 1, 0x7e,
    ];
    const funcPayload = [10, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const memPayload = [0x01, 0x00, 0x20]; // 1 memory, min 32 pages (2 MB), growable to any FB size up to 820+b
    const expPayload = [
      7,
      ...encStr('memory'), 0x02, 0x00,
      ...encStr('grayUpdate'), 0x00, 0x00,
      ...encStr('fillBuckets'), 0x00, 0x01,
      ...encStr('sieveBlockAndScan'), 0x00, 0x02,
      ...encStr('matchBlockCands'), 0x00, 0x03,
      ...encStr('squfof64'), 0x00, 0x04,
      ...encStr('isPrime64'), 0x00, 0x05,
    ];
    const makeBody = (locals, code) => {
      const out = [...locals, ...code];
      const l = [];
      encU32(l, out.length);
      return [...l, ...out];
    };

    // Func 0: grayUpdate
    const f0 = [];
    const p0 = (...b) => f0.push(...b);
    p0(0x20, 0, 0x21, 7);
    p0(0x02, 0x40, 0x03, 0x40);
      p0(0x20, 7, 0x20, 1, 0x4e, 0x0d, 1);
      p0(0x20, 7, 0x41, 2, 0x74, 0x21, 12);
      p0(0x20, 2, 0x20, 12, 0x6a, 0x28, 2, 0, 0x22, 8);
      p0(0x41, 0, 0x48);
      p0(0x04, 0x40, 0x20, 7, 0x41, 1, 0x6a, 0x21, 7, 0x0c, 1, 0x0b);
      p0(0x20, 3, 0x20, 12, 0x6a, 0x28, 2, 0, 0x21, 9);
      p0(0x20, 4, 0x20, 12, 0x6a, 0x28, 2, 0, 0x21, 10);
      p0(0x20, 5, 0x20, 12, 0x6a, 0x28, 2, 0, 0x21, 11);
      p0(0x20, 6, 0x04, 0x40);
        p0(0x20, 8, 0x20, 11, 0x6a, 0x22, 8);
        p0(0x20, 10, 0x4e, 0x04, 0x40, 0x20, 8, 0x20, 10, 0x6b, 0x21, 8, 0x0b);
        p0(0x20, 9, 0x20, 11, 0x6a, 0x22, 9);
        p0(0x20, 10, 0x4e, 0x04, 0x40, 0x20, 9, 0x20, 10, 0x6b, 0x21, 9, 0x0b);
      p0(0x05);
        p0(0x20, 8, 0x20, 11, 0x6b, 0x22, 8);
        p0(0x41, 0, 0x48, 0x04, 0x40, 0x20, 8, 0x20, 10, 0x6a, 0x21, 8, 0x0b);
        p0(0x20, 9, 0x20, 11, 0x6b, 0x22, 9);
        p0(0x41, 0, 0x48, 0x04, 0x40, 0x20, 9, 0x20, 10, 0x6a, 0x21, 9, 0x0b);
      p0(0x0b);
      p0(0x20, 2, 0x20, 12, 0x6a, 0x20, 8, 0x36, 2, 0);
      p0(0x20, 3, 0x20, 12, 0x6a, 0x20, 9, 0x36, 2, 0);
      p0(0x20, 7, 0x41, 1, 0x6a, 0x21, 7, 0x0c, 0);
    p0(0x0b, 0x0b, 0x41, 1, 0x0b);
    const f0Body = makeBody([1, 6, 0x7f], f0);

    // Func 1: fillBuckets
    const f1 = [];
    const p1 = (...b) => f1.push(...b);
    p1(0x20, 12, 0x41, 2, 0x76, 0x21, 24);
    p1(0x20, 0, 0x21, 14);
    p1(0x02, 0x40, 0x03, 0x40);
      p1(0x20, 14, 0x20, 1, 0x4e, 0x0d, 1);
      p1(0x20, 14, 0x41, 2, 0x74, 0x21, 15);
      p1(0x20, 8, 0x20, 15, 0x6a, 0x20, 6, 0x20, 15, 0x6a, 0x28, 2, 0, 0x36, 2, 0);
      p1(0x20, 9, 0x20, 15, 0x6a, 0x20, 7, 0x20, 15, 0x6a, 0x28, 2, 0, 0x36, 2, 0);
      p1(0x20, 14, 0x41, 1, 0x6a, 0x21, 14, 0x0c, 0);
    p1(0x0b, 0x0b);
    p1(0x41, 0, 0x21, 14);
    p1(0x02, 0x40, 0x03, 0x40);
      p1(0x20, 14, 0x41, 32, 0x4e, 0x0d, 1);
      p1(0x20, 13, 0x20, 14, 0x41, 2, 0x74, 0x6a, 0x41, 0, 0x36, 2, 0);
      p1(0x20, 14, 0x41, 1, 0x6a, 0x21, 14, 0x0c, 0);
    p1(0x0b, 0x0b);
    p1(0x20, 1, 0x21, 14);
    p1(0x02, 0x40, 0x03, 0x40);
      p1(0x20, 14, 0x20, 2, 0x4e, 0x0d, 1);
      p1(0x20, 14, 0x41, 2, 0x74, 0x21, 15);
      p1(0x20, 6, 0x20, 15, 0x6a, 0x28, 2, 0, 0x22, 16);
      p1(0x41, 0, 0x48, 0x04, 0x40, 0x20, 14, 0x41, 1, 0x6a, 0x21, 14, 0x0c, 1, 0x0b);
      p1(0x20, 7, 0x20, 15, 0x6a, 0x28, 2, 0, 0x21, 17);
      p1(0x20, 10, 0x20, 15, 0x6a, 0x28, 2, 0, 0x21, 18);
      p1(0x20, 14, 0x41, 15, 0x74, 0x21, 19);
      p1(0x20, 17, 0x20, 16, 0x47, 0x21, 23);
      p1(0x02, 0x40, 0x03, 0x40);
        p1(0x20, 16, 0x20, 3, 0x4e, 0x0d, 1);
        p1(0x20, 16, 0x20, 5, 0x76, 0x22, 20);
        p1(0x20, 13, 0x20, 20, 0x41, 2, 0x74, 0x6a, 0x28, 2, 0, 0x22, 21);
        p1(0x20, 24, 0x48, 0x04, 0x40);
          p1(0x20, 11, 0x20, 20, 0x20, 12, 0x6c, 0x6a, 0x20, 21, 0x41, 2, 0x74, 0x6a);
          p1(0x20, 19, 0x20, 16, 0x20, 4, 0x71, 0x72, 0x36, 2, 0);
          p1(0x20, 13, 0x20, 20, 0x41, 2, 0x74, 0x6a, 0x20, 21, 0x41, 1, 0x6a, 0x36, 2, 0);
        p1(0x0b);
        p1(0x20, 16, 0x20, 18, 0x6a, 0x21, 16, 0x0c, 0);
      p1(0x0b, 0x0b);
      p1(0x20, 23, 0x04, 0x40);
        p1(0x02, 0x40, 0x03, 0x40);
          p1(0x20, 17, 0x20, 3, 0x4e, 0x0d, 1);
          p1(0x20, 17, 0x20, 5, 0x76, 0x22, 20);
          p1(0x20, 13, 0x20, 20, 0x41, 2, 0x74, 0x6a, 0x28, 2, 0, 0x22, 21);
          p1(0x20, 24, 0x48, 0x04, 0x40);
            p1(0x20, 11, 0x20, 20, 0x20, 12, 0x6c, 0x6a, 0x20, 21, 0x41, 2, 0x74, 0x6a);
            p1(0x20, 19, 0x20, 17, 0x20, 4, 0x71, 0x72, 0x36, 2, 0);
            p1(0x20, 13, 0x20, 20, 0x41, 2, 0x74, 0x6a, 0x20, 21, 0x41, 1, 0x6a, 0x36, 2, 0);
          p1(0x0b);
          p1(0x20, 17, 0x20, 18, 0x6a, 0x21, 17, 0x0c, 0);
        p1(0x0b, 0x0b);
      p1(0x0b);
      p1(0x20, 14, 0x41, 1, 0x6a, 0x21, 14, 0x0c, 0);
    p1(0x0b, 0x0b, 0x41, 1, 0x0b);
    const f1Body = makeBody([1, 11, 0x7f], f1);

    // Func 2: sieveBlockAndScan
    const f2 = [];
    const p2 = (...b) => f2.push(...b);
    const initQuarter = (wParam, startOffExpr, endLocal) => {
      p2(0x20, wParam, 0xad, 0x20, wParam, 0xad, 0x42, 32, 0x86, 0x84, 0x21, 33);
      startOffExpr(); p2(0x21, 17);
      p2(0x02, 0x40, 0x03, 0x40);
        p2(0x20, 17, 0x20, endLocal, 0x4f, 0x0d, 1);
        p2(0x20, 17, 0x20, 33, 0x37, 3, 0);
        p2(0x20, 17, 0x20, 33, 0x37, 3, 8);
        p2(0x20, 17, 0x20, 33, 0x37, 3, 16);
        p2(0x20, 17, 0x20, 33, 0x37, 3, 24);
        p2(0x20, 17, 0x41, 32, 0x6a, 0x21, 17, 0x0c, 0);
      p2(0x0b, 0x0b);
    };
    p2(0x20, 0, 0x41, 2, 0x76, 0x21, 28);
    initQuarter(3, () => { p2(0x41, 0); }, 28);
    p2(0x20, 28, 0x41, 1, 0x74, 0x21, 29);
    initQuarter(4, () => { p2(0x20, 28); }, 29);
    p2(0x20, 28, 0x20, 29, 0x6a, 0x21, 30);
    initQuarter(5, () => { p2(0x20, 29); }, 30);
    initQuarter(6, () => { p2(0x20, 30); }, 0);

    p2(0x20, 1, 0x21, 17);
    p2(0x02, 0x40, 0x03, 0x40);
      p2(0x20, 17, 0x20, 2, 0x4e, 0x0d, 1);
      p2(0x20, 17, 0x41, 2, 0x74, 0x21, 24);
      p2(0x20, 7, 0x20, 24, 0x6a, 0x28, 2, 0, 0x22, 18);
      p2(0x20, 9, 0x20, 24, 0x6a, 0x20, 18, 0x36, 2, 0);
      p2(0x20, 18, 0x41, 0, 0x48, 0x04, 0x40, 0x20, 17, 0x41, 1, 0x6a, 0x21, 17, 0x0c, 1, 0x0b);
      p2(0x20, 8, 0x20, 24, 0x6a, 0x28, 2, 0, 0x21, 19);
      p2(0x20, 10, 0x20, 24, 0x6a, 0x20, 19, 0x36, 2, 0);
      p2(0x20, 11, 0x20, 24, 0x6a, 0x28, 2, 0, 0x21, 20);
      p2(0x20, 12, 0x20, 17, 0x6a, 0x2d, 0, 0, 0x21, 21);
      p2(0x20, 18, 0x20, 19, 0x47, 0x21, 32);

      const sieveCursor = (curLoc) => {
        p2(0x20, 20, 0x41, 1, 0x74, 0x21, 30);
        p2(0x20, 30, 0x20, 20, 0x6a, 0x21, 31);
        p2(0x20, 30, 0x41, 1, 0x74, 0x21, 23);
        p2(0x20, 0, 0x20, 31, 0x6b, 0x21, 22);
        p2(0x02, 0x40, 0x03, 0x40);
          p2(0x20, curLoc, 0x20, 22, 0x4e, 0x0d, 1);
          p2(0x20, curLoc, 0x20, curLoc, 0x2d, 0, 0, 0x20, 21, 0x6a, 0x3a, 0, 0);
          p2(0x20, curLoc, 0x20, 20, 0x6a, 0x22, 25);
          p2(0x20, 25, 0x20, 25, 0x2d, 0, 0, 0x20, 21, 0x6a, 0x3a, 0, 0);
          p2(0x20, curLoc, 0x20, 30, 0x6a, 0x22, 25);
          p2(0x20, 25, 0x20, 25, 0x2d, 0, 0, 0x20, 21, 0x6a, 0x3a, 0, 0);
          p2(0x20, curLoc, 0x20, 31, 0x6a, 0x22, 25);
          p2(0x20, 25, 0x20, 25, 0x2d, 0, 0, 0x20, 21, 0x6a, 0x3a, 0, 0);
          p2(0x20, curLoc, 0x20, 23, 0x6a, 0x21, curLoc, 0x0c, 0);
        p2(0x0b, 0x0b);
        p2(0x02, 0x40, 0x03, 0x40);
          p2(0x20, curLoc, 0x20, 0, 0x4e, 0x0d, 1);
          p2(0x20, curLoc, 0x20, curLoc, 0x2d, 0, 0, 0x20, 21, 0x6a, 0x3a, 0, 0);
          p2(0x20, curLoc, 0x20, 20, 0x6a, 0x21, curLoc, 0x0c, 0);
        p2(0x0b, 0x0b);
      };

      sieveCursor(18);
      p2(0x20, 7, 0x20, 24, 0x6a, 0x20, 18, 0x20, 0, 0x6b, 0x36, 2, 0);
      p2(0x20, 32, 0x04, 0x40);
        sieveCursor(19);
        p2(0x20, 8, 0x20, 24, 0x6a, 0x20, 19, 0x20, 0, 0x6b, 0x36, 2, 0);
      p2(0x05);
        p2(0x20, 8, 0x20, 24, 0x6a, 0x20, 18, 0x20, 0, 0x6b, 0x36, 2, 0);
      p2(0x0b);
      p2(0x20, 17, 0x41, 1, 0x6a, 0x21, 17, 0x0c, 0);
    p2(0x0b, 0x0b);

    p2(0x41, 0, 0x21, 25);
    p2(0x02, 0x40, 0x03, 0x40);
      p2(0x20, 25, 0x20, 14, 0x4e, 0x0d, 1);
      p2(0x20, 13, 0x20, 25, 0x41, 2, 0x74, 0x6a, 0x28, 2, 0, 0x21, 26);
      p2(0x20, 26, 0x41); encI32(f2, 0x7fff); p2(0x71, 0x22, 28);
      p2(0x20, 28, 0x2d, 0, 0);
      p2(0x20, 12, 0x20, 26, 0x41, 15, 0x76, 0x6a, 0x2d, 0, 0, 0x6a);
      p2(0x3a, 0, 0);
      p2(0x20, 25, 0x41, 1, 0x6a, 0x21, 25, 0x0c, 0);
    p2(0x0b, 0x0b);

    p2(0x41, 0, 0x21, 27);
    p2(0x41, 0, 0x21, 25);
    if (useSimd) {
      p2(0x02, 0x40, 0x03, 0x40);
        p2(0x20, 25, 0x20, 0, 0x4e, 0x0d, 1);
        p2(0x20, 25, 0xfd, 0x00, 0x03, 0x00, 0xfd, 0x64, 0x22, 26);
        p2(0x04, 0x40);
          p2(0x02, 0x40, 0x03, 0x40);
            p2(0x20, 26, 0x45, 0x0d, 1);
            p2(0x20, 27, 0x20, 16, 0x4e, 0x0d, 1);
            p2(0x20, 26, 0x68, 0x21, 28);
            p2(0x20, 15, 0x20, 27, 0x41, 2, 0x74, 0x6a, 0x20, 25, 0x20, 28, 0x6a, 0x36, 2, 0);
            p2(0x20, 27, 0x41, 1, 0x6a, 0x21, 27);
            p2(0x20, 26, 0x20, 26, 0x41, 1, 0x6b, 0x71, 0x21, 26);
            p2(0x0c, 0);
          p2(0x0b, 0x0b);
        p2(0x0b);
        p2(0x20, 25, 0x41, 16, 0x6a, 0x21, 25, 0x0c, 0);
      p2(0x0b, 0x0b);
    } else {
      p2(0x02, 0x40, 0x03, 0x40);
        p2(0x20, 25, 0x20, 0, 0x4e, 0x0d, 1);
        p2(0x20, 25, 0x29, 3, 0, 0x42); encI64(f2, -0x7f7f7f7f7f7f7f80n); p2(0x83, 0x22, 34);
        p2(0x50, 0x45, 0x04, 0x40);
          p2(0x41, 0, 0x21, 28);
          p2(0x02, 0x40, 0x03, 0x40);
            p2(0x20, 28, 0x41, 8, 0x4e, 0x0d, 1);
            p2(0x20, 25, 0x20, 28, 0x6a, 0x2d, 0, 0, 0x41); encI32(f2, 128); p2(0x4e);
            p2(0x20, 27, 0x20, 16, 0x48, 0x71, 0x04, 0x40);
              p2(0x20, 15, 0x20, 27, 0x41, 2, 0x74, 0x6a, 0x20, 25, 0x20, 28, 0x6a, 0x36, 2, 0);
              p2(0x20, 27, 0x41, 1, 0x6a, 0x21, 27);
            p2(0x0b);
            p2(0x20, 28, 0x41, 1, 0x6a, 0x21, 28, 0x0c, 0);
          p2(0x0b, 0x0b);
        p2(0x0b);
        p2(0x20, 25, 0x41, 8, 0x6a, 0x21, 25, 0x0c, 0);
      p2(0x0b, 0x0b);
    }
    p2(0x20, 27, 0x0b);
    const f2Body = makeBody([2, 16, 0x7f, 2, 0x7e], f2);

    // Func 3: matchBlockCands
    const f3 = [];
    const p3 = (...b) => f3.push(...b);
    p3(0x41, 0, 0x21, 14);
    p3(0x02, 0x40, 0x03, 0x40);
      p3(0x20, 14, 0x20, 2, 0x4e, 0x0d, 1);
      p3(0x20, 13, 0x20, 14, 0x41, 2, 0x74, 0x6a, 0x41, 0, 0x36, 2, 0);
      p3(0x20, 5, 0x20, 4, 0x20, 14, 0x41, 2, 0x74, 0x6a, 0x28, 2, 0, 0x41, 1, 0x74, 0x6a, 0x20, 14, 0x41, 1, 0x6a, 0x3b, 1, 0);
      p3(0x20, 14, 0x41, 1, 0x6a, 0x21, 14, 0x0c, 0);
    p3(0x0b, 0x0b);
    const pushMatchCol = (slotLoc, colExpr) => {
      p3(0x20, slotLoc, 0x41, 1, 0x6b, 0x21, 14);
      p3(0x20, 13, 0x20, 14, 0x41, 2, 0x74, 0x6a, 0x28, 2, 0, 0x22, 18);
      p3(0x20, 12, 0x48, 0x04, 0x40);
        p3(0x20, 11, 0x20, 14, 0x20, 12, 0x6c, 0x20, 18, 0x6a, 0x41, 2, 0x74, 0x6a);
        colExpr();
        p3(0x36, 2, 0);
        p3(0x20, 13, 0x20, 14, 0x41, 2, 0x74, 0x6a, 0x20, 18, 0x41, 1, 0x6a, 0x36, 2, 0);
      p3(0x0b);
    };
    p3(0x41, 0, 0x21, 15);
    p3(0x02, 0x40, 0x03, 0x40);
      p3(0x20, 15, 0x20, 10, 0x4e, 0x0d, 1);
      p3(0x20, 9, 0x20, 15, 0x41, 2, 0x74, 0x6a, 0x28, 2, 0, 0x22, 16);
      p3(0x20, 5, 0x20, 16, 0x41); encI32(f3, 0x7fff); p3(0x71, 0x41, 1, 0x74, 0x6a, 0x2f, 1, 0, 0x22, 17);
      p3(0x04, 0x40); pushMatchCol(17, () => { p3(0x20, 16, 0x41, 15, 0x76); }); p3(0x0b);
      p3(0x20, 15, 0x41, 1, 0x6a, 0x21, 15, 0x0c, 0);
    p3(0x0b, 0x0b);
    p3(0x20, 0, 0x21, 19);
    p3(0x02, 0x40, 0x03, 0x40);
      p3(0x20, 19, 0x20, 1, 0x4e, 0x0d, 1);
      p3(0x20, 19, 0x41, 2, 0x74, 0x21, 24);
      p3(0x20, 6, 0x20, 24, 0x6a, 0x28, 2, 0, 0x22, 20);
      p3(0x41, 0, 0x48, 0x04, 0x40, 0x20, 19, 0x41, 1, 0x6a, 0x21, 19, 0x0c, 1, 0x0b);
      p3(0x20, 7, 0x20, 24, 0x6a, 0x28, 2, 0, 0x21, 21);
      p3(0x20, 8, 0x20, 24, 0x6a, 0x28, 2, 0, 0x21, 22);
      p3(0x20, 21, 0x20, 20, 0x47, 0x21, 23);
      p3(0x02, 0x40, 0x03, 0x40);
        p3(0x20, 20, 0x20, 3, 0x4e, 0x0d, 1);
        p3(0x20, 5, 0x20, 20, 0x41, 1, 0x74, 0x6a, 0x2f, 1, 0, 0x22, 17);
        p3(0x04, 0x40); pushMatchCol(17, () => p3(0x20, 19)); p3(0x0b);
        p3(0x20, 20, 0x20, 22, 0x6a, 0x21, 20, 0x0c, 0);
      p3(0x0b, 0x0b);
      p3(0x20, 23, 0x04, 0x40);
        p3(0x20, 21, 0x21, 20);
        p3(0x02, 0x40, 0x03, 0x40);
          p3(0x20, 20, 0x20, 3, 0x4e, 0x0d, 1);
          p3(0x20, 5, 0x20, 20, 0x41, 1, 0x74, 0x6a, 0x2f, 1, 0, 0x22, 17);
          p3(0x04, 0x40); pushMatchCol(17, () => p3(0x20, 19)); p3(0x0b);
          p3(0x20, 20, 0x20, 22, 0x6a, 0x21, 20, 0x0c, 0);
        p3(0x0b, 0x0b);
      p3(0x0b);
      p3(0x20, 19, 0x41, 1, 0x6a, 0x21, 19, 0x0c, 0);
    p3(0x0b, 0x0b);
    p3(0x41, 0, 0x21, 14);
    p3(0x02, 0x40, 0x03, 0x40);
      p3(0x20, 14, 0x20, 2, 0x4e, 0x0d, 1);
      p3(0x20, 5, 0x20, 4, 0x20, 14, 0x41, 2, 0x74, 0x6a, 0x28, 2, 0, 0x41, 1, 0x74, 0x6a, 0x41, 0, 0x3b, 1, 0);
      p3(0x20, 14, 0x41, 1, 0x6a, 0x21, 14, 0x0c, 0);
    p3(0x0b, 0x0b, 0x41, 1, 0x0b);
    const f3Body = makeBody([1, 11, 0x7f], f3);

    // Func 8: gcd64
    const f8Body = makeBody([0], [
      0x02, 0x40, 0x03, 0x40,
        0x20, 1, 0x50, 0x0d, 1,
        0x20, 0, 0x20, 1, 0x82, 0x20, 1, 0x21, 0, 0x21, 1, 0x0c, 0,
      0x0b, 0x0b, 0x20, 0, 0x0b
    ]);
    // Func 6: mulMod64
    const f6Body = makeBody([1, 1, 0x7e], [
      0x20, 0, 0x20, 1, 0x84, 0x42, 31, 0x88, 0x50,
      0x04, 0x7e, 0x20, 0, 0x20, 1, 0x7e, 0x20, 2, 0x82,
      0x05,
        0x42, 0, 0x21, 3,
        0x20, 0, 0x20, 2, 0x82, 0x21, 0,
        0x02, 0x40, 0x03, 0x40,
          0x20, 1, 0x50, 0x0d, 1,
          0x20, 1, 0x42, 1, 0x83, 0x50, 0x45,
          0x04, 0x40, 0x20, 3, 0x20, 0, 0x7c, 0x20, 2, 0x82, 0x21, 3, 0x0b,
          0x20, 0, 0x42, 1, 0x86, 0x22, 0, 0x20, 2, 0x5a,
          0x04, 0x40, 0x20, 0, 0x20, 2, 0x7d, 0x21, 0, 0x0b,
          0x20, 1, 0x42, 1, 0x88, 0x21, 1, 0x0c, 0,
        0x0b, 0x0b, 0x20, 3,
      0x0b, 0x0b
    ]);
    // Func 7: powMod64
    const f7Body = makeBody([1, 1, 0x7e], [
      0x42, 1, 0x21, 3,
      0x20, 0, 0x20, 2, 0x82, 0x21, 0,
      0x02, 0x40, 0x03, 0x40,
        0x20, 1, 0x50, 0x0d, 1,
        0x20, 1, 0x42, 1, 0x83, 0x50, 0x45,
        0x04, 0x40, 0x20, 3, 0x20, 0, 0x20, 2, 0x10, 6, 0x21, 3, 0x0b,
        0x20, 0, 0x20, 0, 0x20, 2, 0x10, 6, 0x21, 0,
        0x20, 1, 0x42, 1, 0x88, 0x21, 1, 0x0c, 0,
      0x0b, 0x0b, 0x20, 3, 0x0b
    ]);
    // Func 9: isqrt64
    const f9Body = makeBody([1, 2, 0x7e], [
      0x20, 0, 0x42, 2, 0x54, 0x04, 0x40, 0x20, 0, 0x0f, 0x0b,
      0x20, 0, 0xba, 0x9f, 0xb1, 0x42, 1, 0x7c, 0x21, 1,
      0x02, 0x40, 0x03, 0x40,
        0x20, 1, 0x20, 0, 0x20, 1, 0x80, 0x7c, 0x42, 1, 0x88, 0x22, 2,
        0x20, 1, 0x5a, 0x0d, 1,
        0x20, 2, 0x21, 1, 0x0c, 0,
      0x0b, 0x0b, 0x20, 1, 0x0b
    ]);
    // Func 5: isPrime64
    const f5 = [];
    const p5 = (...b) => f5.push(...b);
    p5(0x20, 0, 0x42, 2, 0x54, 0x04, 0x40, 0x41, 0, 0x0f, 0x0b);
    p5(0x20, 0, 0x42, 2, 0x51, 0x20, 0, 0x42, 3, 0x51, 0x72, 0x04, 0x40, 0x41, 1, 0x0f, 0x0b);
    p5(0x20, 0, 0x42, 1, 0x83, 0x50, 0x04, 0x40, 0x41, 0, 0x0f, 0x0b);
    p5(0x20, 0, 0x42, 1, 0x7d, 0x22, 8, 0x21, 5);
    p5(0x20, 5, 0x7a, 0xa7, 0x21, 2);
    p5(0x20, 5, 0x20, 2, 0xad, 0x88, 0x21, 5);
    const MR_BASES = [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n];
    for (const base of MR_BASES) {
      p5(0x42); encI64(f5, base); p5(0x20, 0, 0x82, 0x22, 7, 0x50, 0x45);
      p5(0x04, 0x40);
        p5(0x20, 7, 0x20, 5, 0x20, 0, 0x10, 7, 0x22, 6);
        p5(0x42, 1, 0x51, 0x20, 6, 0x20, 8, 0x51, 0x72, 0x45);
        p5(0x04, 0x40);
          p5(0x41, 1, 0x21, 3, 0x41, 1, 0x21, 4);
          p5(0x02, 0x40, 0x03, 0x40);
            p5(0x20, 3, 0x20, 2, 0x4e, 0x0d, 1);
            p5(0x20, 6, 0x20, 6, 0x20, 0, 0x10, 6, 0x22, 6);
            p5(0x20, 8, 0x51, 0x04, 0x40, 0x41, 0, 0x21, 4, 0x0c, 2, 0x0b);
            p5(0x20, 3, 0x41, 1, 0x6a, 0x21, 3, 0x0c, 0);
          p5(0x0b, 0x0b);
          p5(0x20, 4, 0x04, 0x40, 0x41, 0, 0x0f, 0x0b);
        p5(0x0b);
      p5(0x0b);
    }
    p5(0x41, 1, 0x0b);
    const f5Body = makeBody([2, 4, 0x7f, 4, 0x7e], f5);

    // Func 4: squfof64
    let mask64 = 0n; for (let i = 0; i < 64; i++) mask64 |= 1n << BigInt((i * i) & 63);
    let mask63 = 0n; for (let i = 0; i < 63; i++) mask63 |= 1n << BigInt((i * i) % 63);
    const RING_BASE = 32768;
    const f4 = [];
    const p4 = (...b) => f4.push(...b);
    p4(0x20, 0, 0x42, 3, 0x58, 0x04, 0x40, 0x42, 0, 0x0f, 0x0b);
    p4(0x20, 0, 0x42, 1, 0x83, 0x50, 0x04, 0x40, 0x42, 2, 0x0f, 0x0b);
    p4(0x20, 0, 0x10, 9, 0x21, 11);
    p4(0x20, 11, 0x20, 11, 0x7e, 0x20, 0, 0x51, 0x04, 0x40, 0x20, 11, 0x0f, 0x0b);
    p4(0x42); encI64(f4, 0x7fffffffffffffffn); p4(0x20, 0, 0x80, 0x21, 28);
    const MULTS = [1, 3, 5, 7, 11, 15, 21, 33, 35, 55, 77, 105, 165, 231, 385, 1155];
    const isQR64And63 = (valLoc) => {
      p4(0x42); encI64(f4, mask64);
      p4(0x20, valLoc, 0x42, 63, 0x83, 0x88, 0x42, 1, 0x83, 0x50, 0x45);
      p4(0x42); encI64(f4, mask63);
      p4(0x20, valLoc, 0x42, 63, 0x82, 0x88, 0x42, 1, 0x83, 0x50, 0x45, 0x71);
    };
    for (const mult of MULTS) {
      p4(0x42); encI64(f4, BigInt(mult)); p4(0x22, 9, 0x20, 28, 0x58);
      p4(0x04, 0x40);
        p4(0x20, 9, 0x20, 0, 0x7e, 0x21, 10);
        p4(0x20, 10, 0x10, 9, 0x21, 11);
        p4(0x20, 11, 0x20, 11, 0x7e, 0x20, 10, 0x51);
        p4(0x04, 0x40);
          p4(0x20, 11, 0x20, 0, 0x10, 8, 0x22, 12);
          p4(0x42, 1, 0x56, 0x20, 12, 0x20, 0, 0x54, 0x71, 0x04, 0x40, 0x20, 12, 0x0f, 0x0b);
        p4(0x05);
          p4(0x20, 11, 0x21, 13, 0x42, 1, 0x21, 14);
          p4(0x20, 10, 0x20, 11, 0x20, 11, 0x7e, 0x7d, 0x22, 15, 0x42, 1, 0x56);
          p4(0x04, 0x40);
            p4(0x20, 11, 0x42, 1, 0x86, 0x10, 9, 0x42, 1, 0x86, 0x22, 16);
            p4(0xa7, 0x41, 3, 0x6c, 0x41, 64, 0x6a, 0x21, 4);
            p4(0x20, 4, 0x41); encI32(f4, 28000); p4(0x4b, 0x04, 0x40, 0x41); encI32(f4, 28000); p4(0x21, 4, 0x0b);
            p4(0x41, 0, 0x21, 5, 0x41, 0, 0x21, 6, 0x41, 1, 0x21, 2);
            p4(0x02, 0x40, 0x03, 0x40);
              p4(0x20, 2, 0x20, 4, 0x4a, 0x0d, 1);
              p4(0x20, 11, 0x20, 13, 0x7c, 0x20, 15, 0x80, 0x21, 17);
              p4(0x20, 17, 0x20, 15, 0x7e, 0x20, 13, 0x7d, 0x21, 18);
              p4(0x20, 14, 0x20, 17, 0x20, 13, 0x20, 18, 0x7d, 0x7e, 0x7c, 0x21, 19);
              p4(0x20, 15, 0x20, 16, 0x58);
              p4(0x04, 0x40);
                isQR64And63(15);
                p4(0x04, 0x40);
                  p4(0x20, 15, 0x10, 9, 0x21, 20);
                  p4(0x20, 20, 0x20, 20, 0x7e, 0x20, 15, 0x51);
                  p4(0x04, 0x40);
                    p4(0x41); encI32(f4, RING_BASE); p4(0x20, 5, 0x41, 3, 0x74, 0x6a, 0x20, 20, 0x37, 3, 0);
                    p4(0x20, 5, 0x41, 1, 0x6a, 0x41, 63, 0x71, 0x21, 5);
                    p4(0x20, 6, 0x41, 64, 0x48, 0x04, 0x40, 0x20, 6, 0x41, 1, 0x6a, 0x21, 6, 0x0b);
                  p4(0x0b);
                p4(0x0b);
              p4(0x0b);
              p4(0x20, 2, 0x41, 1, 0x71, 0x20, 19, 0x42, 1, 0x56, 0x71);
              p4(0x04, 0x40);
                isQR64And63(19);
                p4(0x04, 0x40);
                  p4(0x20, 19, 0x10, 9, 0x21, 20);
                  p4(0x20, 20, 0x20, 20, 0x7e, 0x20, 19, 0x51);
                  p4(0x04, 0x40);
                    p4(0x41, 0, 0x21, 8, 0x41, 0, 0x21, 7);
                    p4(0x02, 0x40, 0x03, 0x40);
                      p4(0x20, 7, 0x20, 6, 0x4e, 0x0d, 1);
                      p4(0x41); encI32(f4, RING_BASE); p4(0x20, 7, 0x41, 3, 0x74, 0x6a, 0x29, 3, 0, 0x20, 20, 0x51);
                      p4(0x04, 0x40, 0x41, 1, 0x21, 8, 0x0c, 2, 0x0b);
                      p4(0x20, 7, 0x41, 1, 0x6a, 0x21, 7, 0x0c, 0);
                    p4(0x0b, 0x0b);
                    p4(0x20, 8, 0x45);
                    p4(0x04, 0x40);
                      p4(0x20, 11, 0x20, 18, 0x7d, 0x20, 20, 0x80, 0x21, 21);
                      p4(0x20, 21, 0x20, 20, 0x7e, 0x20, 18, 0x7c, 0x21, 22);
                      p4(0x20, 20, 0x21, 23);
                      p4(0x20, 10, 0x20, 22, 0x20, 22, 0x7e, 0x7d, 0x20, 20, 0x80, 0x22, 24);
                      p4(0x42, 0, 0x56);
                      p4(0x04, 0x40);
                        p4(0x41, 0, 0x21, 3);
                        p4(0x02, 0x40, 0x03, 0x40);
                          p4(0x20, 3, 0x20, 4, 0x4e, 0x0d, 1);
                          p4(0x20, 11, 0x20, 22, 0x7c, 0x20, 24, 0x80, 0x21, 25);
                          p4(0x20, 25, 0x20, 24, 0x7e, 0x20, 22, 0x7d, 0x22, 26);
                          p4(0x20, 22, 0x51);
                          p4(0x04, 0x40);
                            p4(0x20, 26, 0x20, 0, 0x10, 8, 0x22, 12);
                            p4(0x42, 1, 0x56, 0x20, 12, 0x20, 0, 0x54, 0x71, 0x04, 0x40, 0x20, 12, 0x0f, 0x0b);
                            p4(0x0c, 2);
                          p4(0x0b);
                          p4(0x20, 23, 0x20, 25, 0x20, 22, 0x20, 26, 0x7d, 0x7e, 0x7c, 0x22, 27);
                          p4(0x42, 0, 0x58, 0x0d, 1);
                          p4(0x20, 26, 0x21, 22, 0x20, 24, 0x21, 23, 0x20, 27, 0x21, 24);
                          p4(0x20, 3, 0x41, 1, 0x6a, 0x21, 3, 0x0c, 0);
                        p4(0x0b, 0x0b);
                      p4(0x0b);
                    p4(0x0b);
                  p4(0x0b);
                p4(0x0b);
              p4(0x0b);
              p4(0x20, 18, 0x21, 13, 0x20, 15, 0x21, 14, 0x20, 19, 0x22, 15);
              p4(0x42, 1, 0x58, 0x0d, 1);
              p4(0x20, 2, 0x41, 1, 0x6a, 0x21, 2, 0x0c, 0);
            p4(0x0b, 0x0b);
          p4(0x0b);
        p4(0x0b);
      p4(0x0b);
    }
    p4(0x42, 0, 0x0b);
    const f4Body = makeBody([2, 8, 0x7f, 20, 0x7e], f4);

    const codeBodies = [f0Body, f1Body, f2Body, f3Body, f4Body, f5Body, f6Body, f7Body, f8Body, f9Body];
    const codeLenEnc = [];
    encU32(codeLenEnc, codeBodies.length);
    const codePayload = [...codeLenEnc, ...codeBodies.flat()];

    return new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...sec(1, typePayload),
      ...sec(3, funcPayload),
      ...sec(5, memPayload),
      ...sec(7, expPayload),
      ...sec(10, codePayload),
    ]);
  };

  let cachedWasmKernel;
  const getHgsWasmKernel = () => {
    if (cachedWasmKernel !== undefined) return cachedWasmKernel;
    if (typeof WebAssembly === 'undefined') {
      cachedWasmKernel = null;
      return null;
    }
    for (const simd of [true, false]) {
      try {
        const bytes = buildHgsWasmBytes(simd);
        const mod = new WebAssembly.Module(bytes);
        const inst = new WebAssembly.Instance(mod);
        const ex = inst.exports;
        cachedWasmKernel = {
          engineKind: simd ? 'wasm-simd' : 'wasm-i64',
          memory: ex.memory,
          grayUpdate: ex.grayUpdate,
          fillBuckets: ex.fillBuckets,
          sieveBlockAndScan: ex.sieveBlockAndScan,
          matchBlockCands: ex.matchBlockCands,
          squfof64: ex.squfof64,
          isPrime64: ex.isPrime64
        };
        return cachedWasmKernel;
      } catch {}
    }
    cachedWasmKernel = null;
    return null;
  };

  // Precomputed 3-moduli Quadratic Residue bitmasks (rejects ~98.5% of non-squares in 3 lookups before Math.sqrt)
  const SQ64 = new Uint8Array(64);
  const SQ63 = new Uint8Array(63);
  const SQ65 = new Uint8Array(65);
  for (let i = 0; i < 64; i++) SQ64[(i * i) & 63] = 1;
  for (let i = 0; i < 63; i++) SQ63[(i * i) % 63] = 1;
  for (let i = 0; i < 65; i++) SQ65[(i * i) % 65] = 1;

  // Pure IEEE-754 52-bit Shanks' SQUFOF with 16 multipliers + 3-moduli QR filter + Uint32Array(64) ring buffer
  const SQUFOF_MULTS = [1, 3, 5, 7, 11, 15, 21, 33, 35, 55, 77, 105, 165, 231, 385, 1155];
  const SQF_RING = new Uint32Array(64);
  const squfof53 = (n) => {
    if (n <= 3) return 0;
    if (n % 2 === 0) return 2;
    const rt = Math.round(Math.sqrt(n));
    if (rt * rt === n) return rt;
    for (let mi = 0; mi < SQUFOF_MULTS.length; mi++) {
      const k = SQUFOF_MULTS[mi];
      const kN = k * n;
      if (kN > 9007199254740991) break;
      const s = Math.floor(Math.sqrt(kN));
      if (s * s === kN) {
        const g = gcdNum(s, n);
        if (g > 1 && g < n) return g;
        continue;
      }
      let Pprev = s;
      let Qprev = 1;
      let Qcurr = kN - s * s;
      if (Qcurr <= 1) continue;
      const L = 2 * Math.floor(Math.sqrt(2 * Math.sqrt(kN)));
      const maxIter = Math.min(28000, 3 * L + 64);
      let ringHead = 0;
      let ringCount = 0;

      for (let i = 1; i <= maxIter; i++) {
        const b = Math.floor((s + Pprev) / Qcurr);
        const Pcurr = b * Qcurr - Pprev;
        const Qnext = Qprev + b * (Pprev - Pcurr);
        if (Qcurr <= L && SQ64[Qcurr & 63] && SQ63[Qcurr % 63] && SQ65[Qcurr % 65]) {
          const sr = Math.round(Math.sqrt(Qcurr));
          if (sr * sr === Qcurr) {
            SQF_RING[ringHead] = sr >>> 0;
            ringHead = (ringHead + 1) & 63;
            if (ringCount < 64) ringCount++;
          }
        }
        if ((i & 1) === 1 && Qnext > 1) {
          if (SQ64[Qnext & 63] && SQ63[Qnext % 63] && SQ65[Qnext % 65]) {
            const r = Math.round(Math.sqrt(Qnext));
            if (r * r === Qnext) {
              let trapped = false;
              for (let ri = 0; ri < ringCount; ri++) {
                if (SQF_RING[ri] === r) {
                  trapped = true;
                  break;
                }
              }
              if (!trapped) {
                const b0 = Math.floor((s - Pcurr) / r);
                let bP = b0 * r + Pcurr;
                let bQ0 = r;
                let bQ1 = Math.floor((kN - bP * bP) / r);
                if (bQ1 > 0) {
                  for (let j = 0; j < maxIter; j++) {
                    const bb = Math.floor((s + bP) / bQ1);
                    const nP = bb * bQ1 - bP;
                    const nQ = bQ0 + bb * (bP - nP);
                    if (nP === bP) {
                      const g = gcdNum(nP, n);
                      if (g > 1 && g < n) return g;
                      break;
                    }
                    if (nQ <= 0) break;
                    bP = nP;
                    bQ0 = bQ1;
                    bQ1 = nQ;
                  }
                }
              }
            }
          }
        }
        Pprev = Pcurr;
        Qprev = Qcurr;
        Qcurr = Qnext;
        if (Qcurr <= 1) break;
      }
    }
    return 0;
  };

  // BigInt Shanks' SQUFOF fallback for 54..62 bit 2LP remainders
  const squfofBig = (n) => {
    if ((n & 1n) === 0n) return 2n;
    const multLimit = Math.min(8, SQUFOF_MULTS.length);
    for (let mi = 0; mi < multLimit; mi++) {
      const k = BigInt(SQUFOF_MULTS[mi]);
      const kN = k * n;
      const s = bigIntSqrt(kN);
      if (s * s === kN) {
        const g = gcd(s, n);
        if (g > 1n && g < n) return g;
        continue;
      }
      let Pprev = s;
      let Qprev = 1n;
      let Qcurr = kN - s * s;
      if (Qcurr <= 1n) continue;
      const maxIter = Math.min(28000, 4 * Number(bigIntSqrt(2n * s)) + 64);
      for (let i = 1; i <= maxIter; i++) {
        const b = (s + Pprev) / Qcurr;
        const Pcurr = b * Qcurr - Pprev;
        const Qnext = Qprev + b * (Pprev - Pcurr);
        if ((i & 1) === 1 && Qnext > 1n) {
          const r = bigIntSqrt(Qnext);
          if (r * r === Qnext) {
            const b0 = (s - Pcurr) / r;
            let bP = b0 * r + Pcurr;
            let bQ0 = r;
            let bQ1 = (kN - bP * bP) / r;
            if (bQ1 > 0n) {
              for (let j = 0; j < maxIter; j++) {
                const bb = (s + bP) / bQ1;
                const nP = bb * bQ1 - bP;
                const nQ = bQ0 + bb * (bP - nP);
                if (nP === bP) {
                  const g = gcd(nP, n);
                  if (g > 1n && g < n) return g;
                  break;
                }
                bP = nP;
                bQ0 = bQ1;
                bQ1 = nQ;
              }
            }
          }
        }
        Pprev = Pcurr;
        Qprev = Qcurr;
        Qcurr = Qnext;
        if (Qcurr <= 1n) break;
      }
    }
    return 0n;
  };

  // Fast bounded Pollard-Brent fallback (only when SQUFOF fails on edge-case inputs)
  const runBoundedBrent = (rem, maxIter = 750, seedSkew = 1) => {
    if ((rem & 1n) === 0n) return 2n;
    let y = BigInt((seedSkew * 17 + 3) % 10000) + 2n;
    const c = BigInt((seedSkew * 31 + 1) % 997) + 1n;
    let g = 1n, r = 1, q = 1n, x = y, ys = y, steps = 0;
    const m = 64;
    while (g === 1n && steps < maxIter) {
      x = y;
      for (let i = 0; i < r; i++) y = (y * y + c) % rem;
      let k = 0;
      while (k < r && g === 1n && steps < maxIter) {
        ys = y;
        const lim = Math.min(m, r - k);
        for (let i = 0; i < lim; i++) {
          y = (y * y + c) % rem;
          const diff = x > y ? x - y : y - x;
          q = (q * diff) % rem;
          steps++;
        }
        g = gcd(q, rem);
        k += m;
      }
      r <<= 1;
    }
    if (g === rem) {
      do {
        ys = (ys * ys + c) % rem;
        const diff = x > ys ? x - ys : ys - x;
        g = gcd(diff, rem);
        steps++;
      } while (g === 1n && steps < maxIter + 250);
    }
    return (g > 1n && g < rem) ? g : null;
  };

  const MAX_SAFE_INT_BIG = 9007199254740991n;
  const MAX_WASM_I64_BIG = 4611686018427387903n; // 2^62 - 1 (safe i64 range for deterministic MR & SQUFOF)
  const splitDoubleLargePrimeFast = (rem, lpBoundBig, lpBoundNum, seedBase, wasmKernel) => {
    if (wasmKernel && rem <= MAX_WASM_I64_BIG) {
      if (wasmKernel.isPrime64(rem) === 1) return null;
      const g64 = wasmKernel.squfof64(rem);
      if (g64 > 1n && g64 < rem) {
        const p1 = g64;
        const p2 = rem / g64;
        if (p1 <= lpBoundBig && p2 <= lpBoundBig && wasmKernel.isPrime64(p1) === 1 && wasmKernel.isPrime64(p2) === 1) {
          return p1 <= p2 ? [p1, p2] : [p2, p1];
        }
        return null;
      }
      if (rem <= MAX_SAFE_INT_BIG) {
        const gJs = squfof53(Number(rem));
        if (gJs > 1 && BigInt(gJs) < rem) {
          const p1 = BigInt(gJs);
          const p2 = rem / p1;
          if (p1 <= lpBoundBig && p2 <= lpBoundBig && wasmKernel.isPrime64(p1) === 1 && wasmKernel.isPrime64(p2) === 1) {
            return p1 <= p2 ? [p1, p2] : [p2, p1];
          }
          return null;
        }
      }
      return null;
    }

    if (rem <= MAX_SAFE_INT_BIG) {
      const remNum = Number(rem);
      if (isProbablePrimeNum(remNum, 3)) return null;
      const g = squfof53(remNum);
      if (g > 1 && g < remNum) {
        const p1 = g;
        const p2 = Math.floor(remNum / g);
        if (p1 <= lpBoundNum && p2 <= lpBoundNum && isProbablePrimeNum(p1, 4) && isProbablePrimeNum(p2, 4)) {
          return p1 <= p2 ? [BigInt(p1), BigInt(p2)] : [BigInt(p2), BigInt(p1)];
        }
        return null;
      }
      if (remNum > 1000000000000) {
        const gBigAlt = squfofBig(rem);
        if (gBigAlt > 1n && gBigAlt < rem) {
          const p1 = Number(gBigAlt);
          const p2 = Number(rem / gBigAlt);
          if (p1 <= lpBoundNum && p2 <= lpBoundNum && isProbablePrimeNum(p1, 4) && isProbablePrimeNum(p2, 4)) {
            return p1 <= p2 ? [gBigAlt, rem / gBigAlt] : [rem / gBigAlt, gBigAlt];
          }
          return null;
        }
      }
      return null;
    }

    if (isProbablePrimeBig(rem, 3)) return null;
    const gBig = squfofBig(rem);
    if (gBig > 1n && gBig < rem) {
      const p1 = gBig;
      const p2 = rem / gBig;
      if (p1 <= lpBoundBig && p2 <= lpBoundBig && isProbablePrimeBig(p1, 4) && isProbablePrimeBig(p2, 4)) {
        return p1 <= p2 ? [p1, p2] : [p2, p1];
      }
      return null;
    }
    const g2 = runBoundedBrent(rem, 600, seedBase);
    if (g2 && g2 > 1n && g2 < rem) {
      const p1 = g2;
      const p2 = rem / g2;
      if (p1 <= lpBoundBig && p2 <= lpBoundBig && isProbablePrimeBig(p1, 4) && isProbablePrimeBig(p2, 4)) {
        return p1 <= p2 ? [p1, p2] : [p2, p1];
      }
    }
    return null;
  };

  // Helper: convert BigInt to scaled IEEE-754 float (val / 2^shift) without precision loss on top 48 bits
  const bigToScaledFloat = (val, shift) => {
    if (val === 0n) return 0;
    const neg = val < 0n;
    const absV = neg ? -val : val;
    const bits = absV.toString(2).length;
    let res;
    if (bits <= 48) {
      res = Number(absV) * Math.pow(2, -shift);
    } else {
      const drop = bits - 48;
      const top = Number(absV >> BigInt(drop));
      res = top * Math.pow(2, drop - shift);
    }
    return neg ? -res : res;
  };

  const log2BigApprox = (val) => {
    const absV = val < 0n ? -val : val;
    if (absV <= 1n) return 0;
    const bits = absV.toString(2).length;
    if (bits <= 48) return Math.log2(Number(absV));
    const drop = bits - 48;
    return drop + Math.log2(Number(absV >> BigInt(drop)));
  };

  const MAX_WASM_CANDS = 2048;
  const MAX_COLS_PER_CAND = 128;

  // Persistent L1 Cache-Blocked + Bucket Sieve Cache (WASM Linear Memory or JS TypedArray Fallback)
  const hgsCache = {
    key: '',
    logScale: 1.0,
    usingWasm: false,
    engineKind: 'js-fallback',
    wasmOff: null,
    wasmU8: null,
    wasmI32: null,
    wasmU32: null,
    fbPrimesBig: null,
    fbLogsScaled: null,
    start1Arr: null,
    start2Arr: null,
    cur1: null,
    cur2: null,
    blockS1: null,
    blockS2: null,
    bainv2: null,
    blockBuffer: null,
    blockU8: null,
    blockU32: null,
    candMark: null,
    candOffs: null,
    candCols: null,
    buckets: null,
    bucketCounts: null,
    seenA: null,
    rngState: 0x243f6a88
  };

  const nextHgsRandU32 = () => {
    let x = hgsCache.rngState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    hgsCache.rngState = x >>> 0;
    return hgsCache.rngState;
  };

  // Candidate verification with batched 50-bit Number division + deferred extraSquare/X allocation
  const factorHgsMatchedCandidate = (
    idx,
    sieveHalfWidth,
    A,
    b,
    C,
    aIndices,
    fbPrimes,
    fbPrimesBig,
    smallEnd,
    aSkipArr,
    matchedColsArr,
    matchedColStart,
    matchedColCount,
    largePrimeBoundBig,
    largePrimeBoundNum,
    lpBoundSq,
    lpBoundSqMargin,
    allow2LP,
    N,
    wasmKernel
  ) => {
    const xOffset = BigInt(idx - sieveHalfWidth);
    const Q = A * xOffset * xOffset + 2n * b * xOffset + C;

    if (Q === 0n) {
      const X0 = ((A * xOffset + b) % N + N) % N;
      const g = gcd(X0, N);
      if (g > 1n && g < N) return { directFactor: g };
      return null;
    }

    let signNeg = false;
    let rem = Q;
    if (rem < 0n) {
      signNeg = true;
      rem = -rem;
    }

    const sparseCols = [];
    const powPairs = [];

    // 1. Small primes (< smallEnd: just p=2 when WASM sieves >= 3)
    for (let col = 0; col < smallEnd && rem > 1n; col++) {
      if (aSkipArr[col]) continue;
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
          if (half > 0) powPairs.push(col, half);
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
          if (half > 0) powPairs.push(col, half);
        }
      }
    }

    // 2. Divide ALL guaranteed sieve-matched primes using batched 50-bit products while rem > 2^53
    const matchedEnd = matchedColStart + matchedColCount;
    let batchEnd = matchedColStart;
    while (batchEnd < matchedEnd && rem > MAX_SAFE_INT_BIG) {
      let prod = 1;
      const segStart = batchEnd;
      while (batchEnd < matchedEnd) {
        const p = fbPrimes[matchedColsArr[batchEnd]];
        const nxt = prod * p;
        if (nxt > 1125899906842624) break;
        prod = nxt;
        batchEnd++;
      }
      if (batchEnd === segStart) {
        const col = matchedColsArr[batchEnd++];
        rem /= fbPrimesBig[col];
      } else {
        rem /= BigInt(prod);
      }
    }

    // Fast reject if rem is still far above lpBound^2 * margin (skips 85%+ non-smooth hits!)
    if (rem > lpBoundSqMargin) return null;

    // 3. Check repeated prime powers (p^2+) for [matchedColStart .. batchEnd-1] + full division for [batchEnd .. matchedEnd-1]
    if (rem <= MAX_SAFE_INT_BIG) {
      let remNum = Number(rem);
      for (let k = matchedColStart; k < batchEnd; k++) {
        const col = matchedColsArr[k];
        const p = fbPrimes[col];
        let cnt = 1;
        while (remNum % p === 0) {
          remNum = Math.floor(remNum / p);
          cnt++;
        }
        if ((cnt & 1) === 1) sparseCols.push(col);
        const half = cnt >> 1;
        if (half > 0) powPairs.push(col, half);
      }
      for (let k = batchEnd; k < matchedEnd; k++) {
        const col = matchedColsArr[k];
        const p = fbPrimes[col];
        let cnt = 0;
        while (remNum % p === 0) {
          remNum = Math.floor(remNum / p);
          cnt++;
        }
        if ((cnt & 1) === 1) sparseCols.push(col);
        const half = cnt >> 1;
        if (half > 0) powPairs.push(col, half);
      }
      rem = BigInt(remNum);
    } else {
      for (let k = matchedColStart; k < batchEnd; k++) {
        const col = matchedColsArr[k];
        const pBig = fbPrimesBig[col];
        let cnt = 1;
        while (rem > 1n && rem % pBig === 0n) {
          rem /= pBig;
          cnt++;
        }
        if ((cnt & 1) === 1) sparseCols.push(col);
        const half = cnt >> 1;
        if (half > 0) powPairs.push(col, half);
      }
      for (let k = batchEnd; k < matchedEnd; k++) {
        const col = matchedColsArr[k];
        const pBig = fbPrimesBig[col];
        let cnt = 0;
        while (rem > 1n && rem % pBig === 0n) {
          rem /= pBig;
          cnt++;
        }
        if ((cnt & 1) === 1) sparseCols.push(col);
        const half = cnt >> 1;
        if (half > 0) powPairs.push(col, half);
      }
    }

    // 4. Primes in A (+1 exponent from A in A*Q(x) === (Ax+b)^2 mod N)
    for (let j = 0; j < aIndices.length; j++) {
      const col = aIndices[j];
      const pBig = fbPrimesBig[col];
      let cnt = 1;
      if (rem >= pBig && rem % pBig === 0n) {
        do {
          rem /= pBig;
          cnt++;
        } while (rem % pBig === 0n);
      }
      if ((cnt & 1) === 1) sparseCols.push(col);
      const half = cnt >> 1;
      if (half > 0) powPairs.push(col, half);
    }

    const finalizeRelation = (is2LP, lp1, lp2) => {
      let extraSquare = 1n;
      for (let i = 0; i < powPairs.length; i += 2) {
        const pBig = fbPrimesBig[powPairs[i]];
        const half = powPairs[i + 1];
        if (half === 1) extraSquare = (extraSquare * pBig) % N;
        else extraSquare = (extraSquare * modPow(pBig, BigInt(half), N)) % N;
      }
      const X = ((A * xOffset + b) % N + N) % N;
      sparseCols.sort((u, v) => u - v);
      const rel = {
        xVal: X.toString(),
        qVal: (Q * A).toString(),
        signNeg,
        sparseCols,
        extraSquare: extraSquare.toString()
      };
      if (lp1) rel.largePrime = lp1;
      if (lp2) rel.largePrime2 = lp2;
      return { is2LP, relation: rel };
    };

    if (rem === 1n) {
      return finalizeRelation(false, null, null);
    }

    if (rem <= largePrimeBoundBig) {
      const isP = (wasmKernel && rem <= MAX_WASM_I64_BIG)
        ? wasmKernel.isPrime64(rem) === 1
        : (rem <= MAX_SAFE_INT_BIG ? isProbablePrimeNum(Number(rem), 5) : isProbablePrimeBig(rem, 5));
      if (isP) {
        return finalizeRelation(false, rem.toString(), null);
      }
    }

    if (allow2LP && rem <= lpBoundSq) {
      const pair = splitDoubleLargePrimeFast(rem, largePrimeBoundBig, largePrimeBoundNum, idx & 255, wasmKernel);
      if (pair) {
        return finalizeRelation(true, pair[0].toString(), pair[1].toString());
      }
    }

    return null;
  };

  // Multi-Polynomial Self-Initializing Sieve (SIQS / MPQS) powered by WASM SIMD/i64 L1 Kernel (+ JS Fallback)
  const runHgsSiqsPolyFamily = async (
    N,
    targetM,
    fbPrimes,
    fbRoots,
    largePrimeBound,
    familyIdx,
    hgsRank = 0,
    hgsTotalWorkers = 1,
    seedOffset = 0,
    sieveMode = 'v4-fallback',
    sieveWeights = null,
    onChunkFlush = null
  ) => {
    if (!fbPrimes || fbPrimes.length < 6) {
      return { relations: [], directFactor: null, polysProcessed: 0, sieveHalfWidth: 8192, blocksProcessed: 0, scannedCount: 0, skippedCount: 0, squfof2Lp: 0, engineKind: 'js-fallback' };
    }

    const fbLen = fbPrimes.length;
    const nBits = N.toString(2).length;
    const M = targetM && targetM >= N ? targetM : N;

    // Geometry: exact multiple of 32 KB L1 cache block
    const rawAutoHalf = nBits >= 680
      ? 524288
      : nBits >= 540
      ? 393216
      : nBits >= 420
      ? 262144
      : nBits >= 320
      ? 196608
      : nBits >= 225
      ? 131072
      : nBits >= 155
      ? 32768
      : nBits >= 105
      ? 16384
      : 8192;

    let rowScale = 1.0;
    if (sieveMode === 'v4-fallback' && sieveWeights && Array.isArray(sieveWeights.rowMedians) && sieveWeights.rowMedians.length > 0) {
      const rIdx = familyIdx % sieveWeights.rowMedians.length;
      const rawS = Number(sieveWeights.rowMedians[rIdx]) || 1;
      rowScale = Math.min(1.5, Math.max(0.85, rawS >= 1.15 ? rawS : 1.0 + (rawS - 0.85) * 0.25));
    }
    const zetaScale = sieveWeights && typeof sieveWeights.zetaWidthScale === 'number' ? sieveWeights.zetaWidthScale : 1.0;
    const blockSize = nBits >= 105 ? 32768 : 16384;
    const blockShift = blockSize === 32768 ? 15 : 14;
    const blockMask = blockSize - 1;
    const blockWords = blockSize >>> 2;

    const scaledTotal = Math.round(2 * rawAutoHalf * rowScale * zetaScale);
    const numBlocks = Math.max(1, Math.min(32, Math.round(scaledTotal / blockSize)));
    const totalLen = numBlocks * blockSize;
    const sieveHalfWidth = totalLen >>> 1;

    // Dynamic LOG_SCALE prevents Uint8Array (0..255) overflow even for 820+ bit moduli
    const sqrtM = bigIntSqrt(M);
    const targetA = bigIntSqrt(2n * M) / BigInt(sieveHalfWidth);
    const approxQBitsEst = Math.max(24, Math.round(log2BigApprox(M) - log2BigApprox(targetA > 1n ? targetA : 2n)));
    const logScale = Math.min(1.25, 84 / Math.max(68, approxQBitsEst));

    const wasmKernel = getHgsWasmKernel();
    const useWasm = Boolean(wasmKernel && fbLen <= 131000 && numBlocks <= 32);

    const cacheKey = N.toString() + ':' + M.toString() + ':' + fbLen + ':' + hgsRank + ':' + blockSize + ':' + (useWasm ? wasmKernel.engineKind : 'js');
    if (hgsCache.key !== cacheKey) {
      hgsCache.key = cacheKey;
      hgsCache.logScale = logScale;
      hgsCache.usingWasm = useWasm;
      hgsCache.engineKind = useWasm ? wasmKernel.engineKind : 'js-fallback';
      hgsCache.fbPrimesBig = fbPrimes.map(p => BigInt(p));
      const bucketCap = Math.max(8192, Math.min(Math.ceil((fbLen * 2.2) / 32) + 4096, 65536));

      if (useWasm) {
        const fbAligned4 = ((fbLen + 3) & ~3);
        const fbAligned16 = ((fbLen + 15) & ~15);
        const maxGrayStore = 10;
        let ptr = 36864; // leave 0..32767 for blockU8 and 32768..33279 for SQUFOF ring buffer!
        const alloc = (bytes, align = 16) => {
          ptr = (ptr + align - 1) & ~(align - 1);
          const off = ptr;
          ptr += bytes;
          return off;
        };
        const start1 = alloc(fbAligned4 * 4);
        const start2 = alloc(fbAligned4 * 4);
        const cur1 = alloc(fbAligned4 * 4);
        const cur2 = alloc(fbAligned4 * 4);
        const blockS1 = alloc(fbAligned4 * 4);
        const blockS2 = alloc(fbAligned4 * 4);
        const primes = alloc(fbAligned4 * 4);
        const bainvBase = alloc(maxGrayStore * fbAligned4 * 4);
        const logs = alloc(fbAligned16);
        const bucketCounts = alloc(32 * 4);
        const candOffs = alloc(MAX_WASM_CANDS * 4);
        const candMark = alloc(32768 * 2);
        const outCols = alloc(MAX_WASM_CANDS * MAX_COLS_PER_CAND * 4);
        const outColCounts = alloc(MAX_WASM_CANDS * 4);
        const bucketStride = bucketCap * 4;
        const buckets = alloc(32 * bucketStride);

        const mem = wasmKernel.memory;
        if (mem.buffer.byteLength < ptr) {
          mem.grow(Math.ceil((ptr - mem.buffer.byteLength) / 65536));
        }
        const u8 = new Uint8Array(mem.buffer);
        const i32 = new Int32Array(mem.buffer);
        const u32 = new Uint32Array(mem.buffer);
        hgsCache.wasmU8 = u8;
        hgsCache.wasmI32 = i32;
        hgsCache.wasmU32 = u32;
        hgsCache.wasmOff = {
          start1, start2, cur1, cur2, blockS1, blockS2, primes,
          bainvBase, fbAligned4, maxGrayStore, logs,
          bucketCounts, candOffs, candMark, outCols, outColCounts,
          buckets, bucketStride
        };
        for (let i = 0; i < fbLen; i++) {
          i32[(primes >> 2) + i] = fbPrimes[i];
          u8[logs + i] = Math.min(36, Math.max(1, Math.round(Math.log2(fbPrimes[i]) * logScale)));
        }
        hgsCache.fbLogsScaled = u8.subarray(logs, logs + fbLen);
        hgsCache.start1Arr = i32.subarray(start1 >> 2, (start1 >> 2) + fbLen);
        hgsCache.start2Arr = i32.subarray(start2 >> 2, (start2 >> 2) + fbLen);
        hgsCache.cur1 = i32.subarray(cur1 >> 2, (cur1 >> 2) + fbLen);
        hgsCache.cur2 = i32.subarray(cur2 >> 2, (cur2 >> 2) + fbLen);
        hgsCache.blockS1 = i32.subarray(blockS1 >> 2, (blockS1 >> 2) + fbLen);
        hgsCache.blockS2 = i32.subarray(blockS2 >> 2, (blockS2 >> 2) + fbLen);
        hgsCache.bainv2 = Array.from({ length: maxGrayStore }, (_, j) => {
          const rStart = (bainvBase + j * fbAligned4 * 4) >> 2;
          return i32.subarray(rStart, rStart + fbLen);
        });
        hgsCache.candOffs = i32.subarray(candOffs >> 2, (candOffs >> 2) + MAX_WASM_CANDS);
        hgsCache.bucketCounts = i32.subarray(bucketCounts >> 2, (bucketCounts >> 2) + 32);
      } else {
        const logs = new Uint8Array(fbLen);
        for (let i = 0; i < fbLen; i++) {
          logs[i] = Math.min(36, Math.max(1, Math.round(Math.log2(fbPrimes[i]) * logScale)));
        }
        hgsCache.fbLogsScaled = logs;
        hgsCache.start1Arr = new Int32Array(fbLen);
        hgsCache.start2Arr = new Int32Array(fbLen);
        hgsCache.cur1 = new Int32Array(fbLen);
        hgsCache.cur2 = new Int32Array(fbLen);
        hgsCache.blockS1 = new Int32Array(fbLen);
        hgsCache.blockS2 = new Int32Array(fbLen);
        hgsCache.bainv2 = [];
        hgsCache.blockBuffer = new ArrayBuffer(32768);
        hgsCache.blockU8 = new Uint8Array(hgsCache.blockBuffer);
        hgsCache.blockU32 = new Uint32Array(hgsCache.blockBuffer);
        hgsCache.candMark = new Uint16Array(32768);
        hgsCache.candOffs = new Int32Array(4096);
        hgsCache.candCols = Array.from({ length: 512 }, () => []);
        hgsCache.buckets = Array.from({ length: 32 }, () => new Uint32Array(bucketCap));
        hgsCache.bucketCounts = new Int32Array(32);
      }

      hgsCache.seenA = new Set();
      const mix = ((hgsRank + 1) * 2246822519) ^ Number(BigInt.asUintN(32, N)) ^ (seedOffset & 0x7fffffff) ^ 0x517cc1b7;
      hgsCache.rngState = (mix >>> 0) || 1;
    }

    const fbPrimesBig = hgsCache.fbPrimesBig;
    const sieveLogs = hgsCache.fbLogsScaled;
    const effLogScale = hgsCache.logScale;
    const start1Arr = hgsCache.start1Arr;
    const start2Arr = hgsCache.start2Arr;
    const seenA = hgsCache.seenA;

    const largePrimeBoundNum = largePrimeBound || (fbPrimes[fbLen - 1] * 260);
    const largePrimeBoundBig = BigInt(largePrimeBoundNum);
    const lpBoundSq = largePrimeBoundBig * largePrimeBoundBig;
    const lpBoundSqMargin = lpBoundSq << 20n;
    const allow2LP = nBits >= 110;

    // Choose sCount primes for A ~ sqrt(2*M)/H (bias toward 9..10 primes around 225..272b so maxGrayBits=8..9)
    const targetABits = targetA > 1n ? targetA.toString(2).length : 10;
    const useUpperBand = targetABits >= 125;
    const useMid256Band = !useUpperBand && targetABits >= 96 && fbLen >= 1600;
    const poolStart = Math.max(4, Math.floor(fbLen * (useUpperBand ? 0.22 : (useMid256Band ? 0.08 : 0.12))));
    const tailLimit = Math.max(poolStart + 16, Math.floor(fbLen * (useMid256Band ? 0.72 : 0.94)));
    const refPrime = fbPrimes[Math.floor(fbLen * (useUpperBand ? 0.65 : (useMid256Band ? 0.22 : 0.50)))];
    const refPrimeBits = Math.max(6, Math.log2(refPrime));
    const sCount = Math.min(26, Math.max(2, Math.round(targetABits / refPrimeBits)));

    const findClosestIdx = (desiredVal, minI, maxI) => {
      let lo = minI, hi = maxI;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (fbPrimes[mid] < desiredVal) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const wTotal = Math.max(1, hgsTotalWorkers);
    const wRank = ((hgsRank % wTotal) + wTotal) % wTotal;
    const idealPerPrime = Math.pow(Math.max(4, Number(targetA > 1000000000000n ? 0 : targetA) || refPrime), 1 / Math.max(1, sCount));
    const idealFirstCenter = targetABits <= 48
      ? findClosestIdx(idealPerPrime * 0.72, poolStart, tailLimit - sCount)
      : Math.floor((poolStart + tailLimit) * (useMid256Band ? 0.34 : 0.42));
    const firstBandLo = Math.max(poolStart, idealFirstCenter - Math.max(wTotal * 6, Math.floor(fbLen * 0.12)));
    const firstBandHi = Math.min(tailLimit - sCount, Math.max(firstBandLo + wTotal, idealFirstCenter + Math.max(wTotal * 4, Math.floor(fbLen * 0.08))));

    let aIndices = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const picked = new Set();
      const cand = [];
      const bandCount = Math.max(1, Math.floor((firstBandHi - firstBandLo) / wTotal));
      let i0 = firstBandLo - (firstBandLo % wTotal) + wRank;
      if (i0 < firstBandLo) i0 += wTotal;
      i0 += (nextHgsRandU32() % bandCount) * wTotal;
      if (i0 >= tailLimit - sCount) {
        i0 = poolStart - (poolStart % wTotal) + wRank;
        if (i0 < poolStart) i0 += wTotal;
      }
      cand.push(i0);
      picked.add(i0);
      let prevIdx = i0;
      let prodBits = Math.log2(fbPrimes[i0]);

      const midRem = sCount - 2;
      for (let j = 0; j < midRem; j++) {
        const slotsAfter = midRem - j;
        const minI = prevIdx + 1;
        const maxI = Math.max(minI, tailLimit - slotsAfter - 1);
        const remBits = Math.max(4, targetABits - prodBits);
        const idealMidBits = remBits / (slotsAfter + 1);
        const idealMidVal = Math.pow(2, Math.min(22, idealMidBits));
        const centerIdx = findClosestIdx(idealMidVal, minI, maxI);
        const jitterHalf = Math.max(4, Math.floor(fbLen * 0.08));
        const loJ = Math.max(minI, centerIdx - jitterHalf);
        const hiJ = Math.min(maxI, centerIdx + jitterHalf);
        let idxJ = loJ + (nextHgsRandU32() % Math.max(1, hiJ - loJ + 1));
        while (picked.has(idxJ) && idxJ < maxI) idxJ++;
        while (picked.has(idxJ) && idxJ > minI) idxJ--;
        picked.add(idxJ);
        cand.push(idxJ);
        prodBits += Math.log2(fbPrimes[idxJ]);
        prevIdx = idxJ;
      }

      const remLastBits = Math.max(3, targetABits - prodBits);
      const desiredLast = Math.pow(2, Math.min(22, remLastBits));
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

    // CRT BTerms so b^2 === M (mod A)
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
    const maxGrayBits = Math.min(10, Math.max(0, numExtra));
    const totalPolys = 1 << maxGrayBits;
    while (hgsCache.bainv2.length < maxGrayBits) {
      hgsCache.bainv2.push(new Int32Array(fbLen));
    }
    const bainv2 = hgsCache.bainv2;

    const aSkipArr = new Uint8Array(fbLen);
    for (let j = 0; j < aIndices.length; j++) aSkipArr[aIndices[j]] = 1;

    // When WASM L1 sieve is active, sieve ALL odd primes >= 3 in WASM (smallEnd=1, skipping only p=2)
    let smallEnd = 0;
    const smallCutoff = useWasm ? 3 : 29;
    while (smallEnd < fbLen && fbPrimes[smallEnd] < smallCutoff) {
      start1Arr[smallEnd] = aSkipArr[smallEnd] ? -2 : -1;
      start2Arr[smallEnd] = -1;
      smallEnd++;
    }

    let medEnd = smallEnd;
    while (medEnd < fbLen && fbPrimes[medEnd] < blockSize) medEnd++;

    let med4End = smallEnd;
    while (med4End < medEnd && fbPrimes[med4End] < 4096) med4End++;

    let med512End = smallEnd;
    while (med512End < medEnd && fbPrimes[med512End] < 512) med512End++;

    for (let i = smallEnd; i < fbLen; i++) {
      if (aSkipArr[i]) {
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
      start1Arr[i] = (s1 + sieveHalfWidth) % p;
      start2Arr[i] = (s2 + sieveHalfWidth) % p;

      for (let j = 0; j < maxGrayBits; j++) {
        const twoB = (2n * BTerms[j + 1]) % pBig;
        const twoBMod = Number((twoB + pBig) % pBig);
        bainv2[j][i] = (twoBMod * aInv) % p;
      }
    }

    // Quarter-block threshold parameters (zero BigInt inside block loop!)
    const sShift = Math.max(0, sqrtM.toString(2).length - 28);
    const sqrtMf = bigToScaledFloat(sqrtM, sShift);
    const sqrtMfSq = sqrtMf * sqrtMf;
    const Af = Math.max(1e-12, bigToScaledFloat(A, sShift));
    const lpBits = Math.log2(largePrimeBoundNum);
    const lpFactor = nBits >= 225 ? 1.88 : (nBits >= 170 ? 1.78 : 1.66);
    const smallBias = useWasm ? 1.2 : 4.0;
    const subBits = (allow2LP
      ? (lpBits * lpFactor + 2.5)
      : (lpBits * 1.05 + 2.0)) + smallBias;
    const exactMaxRemBits = lpBits * (allow2LP ? 2.15 : 1.15) + (useWasm ? 3.5 : 6.5);

    const initValArr = new Int32Array(4);
    const initWordArr = new Uint32Array(4);
    const qSize = blockSize >>> 2;
    const qShift = blockShift - 2;

    const relations = [];
    let blocksProcessed = 0;
    let scannedCount = 0;
    let skippedCount = 0;
    let candsTested = 0;
    let squfof2Lp = 0;
    let prevGray = 0;
    let lastPauseCheckMs = Date.now();

    const wOff = hgsCache.wasmOff;
    const wU8 = hgsCache.wasmU8;
    const wI32 = hgsCache.wasmI32;
    const jsCur1 = hgsCache.cur1;
    const jsCur2 = hgsCache.cur2;
    const jsBlockS1 = hgsCache.blockS1;
    const jsBlockS2 = hgsCache.blockS2;
    const jsBlockU8 = hgsCache.blockU8;
    const jsBlockU32 = hgsCache.blockU32;
    const jsCandMark = hgsCache.candMark;
    const candOffs = hgsCache.candOffs;
    const jsCandCols = hgsCache.candCols;
    const jsBuckets = hgsCache.buckets;
    const jsBucketCounts = hgsCache.bucketCounts;

    for (let m = 0; m < totalPolys; m++) {
      if (isPaused) {
        await waitIfPaused();
        lastPauseCheckMs = Date.now();
      } else if ((m & 7) === 7) {
        const nowPausePoll = Date.now();
        if (nowPausePoll - lastPauseCheckMs >= 35) {
          lastPauseCheckMs = nowPausePoll;
          await new Promise(r => setTimeout(r, 0));
          if (isPaused) await waitIfPaused();
        }
      }

      if (m > 0) {
        const currGray = m ^ (m >> 1);
        const diff = prevGray ^ currGray;
        let nu = 0;
        while (((diff >> nu) & 1) === 0) nu++;
        const turnedToMinus = ((currGray >> nu) & 1) === 1;
        prevGray = currGray;

        const jTerm = BTerms[nu + 1];
        if (turnedToMinus) b -= 2n * jTerm;
        else b += 2n * jTerm;

        if (useWasm) {
          const deltaOff = wOff.bainvBase + nu * wOff.fbAligned4 * 4;
          wasmKernel.grayUpdate(smallEnd, fbLen, wOff.start1, wOff.start2, wOff.primes, deltaOff, turnedToMinus ? 1 : 0);
        } else {
          const deltas = bainv2[nu];
          if (turnedToMinus) {
            for (let i = smallEnd; i < fbLen; i++) {
              let s1 = start1Arr[i];
              if (s1 < 0) continue;
              const p = fbPrimes[i];
              const d = deltas[i];
              s1 += d;
              if (s1 >= p) s1 -= p;
              let s2 = start2Arr[i] + d;
              if (s2 >= p) s2 -= p;
              start1Arr[i] = s1;
              start2Arr[i] = s2;
            }
          } else {
            for (let i = smallEnd; i < fbLen; i++) {
              let s1 = start1Arr[i];
              if (s1 < 0) continue;
              const p = fbPrimes[i];
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
      }

      const C = (b * b - M) / A;
      const bf = bigToScaledFloat(b, sShift);

      if (useWasm) {
        wasmKernel.fillBuckets(
          smallEnd, medEnd, fbLen, totalLen, blockMask, blockShift,
          wOff.start1, wOff.start2, wOff.cur1, wOff.cur2, wOff.primes,
          wOff.buckets, wOff.bucketStride, wOff.bucketCounts
        );
      } else {
        for (let i = smallEnd; i < medEnd; i++) {
          jsCur1[i] = start1Arr[i];
          jsCur2[i] = start2Arr[i];
        }
        for (let blk = 0; blk < numBlocks; blk++) jsBucketCounts[blk] = 0;
        for (let i = medEnd; i < fbLen; i++) {
          let pos1 = start1Arr[i];
          if (pos1 < 0) continue;
          const p = fbPrimes[i];
          const colPacked = i << 15;
          let pos2 = start2Arr[i];
          const diffRoots = pos2 !== pos1;
          while (pos1 < totalLen) {
            const blk = pos1 >>> blockShift;
            const cnt = jsBucketCounts[blk];
            const bArr = jsBuckets[blk];
            if (cnt < bArr.length) {
              bArr[cnt] = (colPacked | (pos1 & blockMask)) >>> 0;
              jsBucketCounts[blk] = cnt + 1;
            }
            pos1 += p;
          }
          if (diffRoots) {
            while (pos2 < totalLen) {
              const blk = pos2 >>> blockShift;
              const cnt = jsBucketCounts[blk];
              const bArr = jsBuckets[blk];
              if (cnt < bArr.length) {
                bArr[cnt] = (colPacked | (pos2 & blockMask)) >>> 0;
                jsBucketCounts[blk] = cnt + 1;
              }
              pos2 += p;
            }
          }
        }
      }

      for (let blk = 0; blk < numBlocks; blk++) {
        blocksProcessed++;
        const blkBaseIdx = blk * blockSize;
        const xBlockStart = blkBaseIdx - sieveHalfWidth;

        // Compute 4 tight 8KB quarter-block init thresholds
        for (let q = 0; q < 4; q++) {
          const qx0 = xBlockStart + q * qSize;
          const qx1 = qx0 + qSize - 1;
          const qxm = (qx0 + qx1) * 0.5;
          const u0 = Af * qx0 + bf;
          const u1 = Af * qx1 + bf;
          const um = Af * qxm + bf;
          const qq0 = Math.abs(u0 * u0 - sqrtMfSq) / Af;
          const qq1 = Math.abs(u1 * u1 - sqrtMfSq) / Af;
          const qqm = Math.abs(um * um - sqrtMfSq) / Af;
          const qMax = Math.max(qq0, qq1, qqm, 1);
          const qBits = Math.max(14, Math.log2(qMax) + sShift);
          const needed = Math.min(118, Math.max(5, Math.round((qBits - subBits) * effLogScale)));
          const initV = Math.max(4, 128 - needed);
          initValArr[q] = initV;
          initWordArr[q] = (initV | (initV << 8) | (initV << 16) | (initV << 24)) >>> 0;
        }

        if (useWasm) {
          const bLen = jsBucketCounts[blk];
          const bOff = wOff.buckets + blk * wOff.bucketStride;
          const rawCandCount = wasmKernel.sieveBlockAndScan(
            blockSize, smallEnd, medEnd,
            initWordArr[0], initWordArr[1], initWordArr[2], initWordArr[3],
            wOff.cur1, wOff.cur2, wOff.blockS1, wOff.blockS2,
            wOff.primes, wOff.logs, bOff, bLen,
            wOff.candOffs, MAX_WASM_CANDS
          );
          scannedCount += blockSize;
          skippedCount += (blockSize - rawCandCount);
          if (rawCandCount === 0) continue;

          // Float Q(x) vs exact sieve-score prefilter BEFORE matchBlockCands & BigInt!
          let filtCount = 0;
          for (let c = 0; c < rawCandCount; c++) {
            const off = candOffs[c];
            const score = wU8[off];
            const qIdx = off >>> qShift;
            const logSumEst = (score - initValArr[qIdx]) / effLogScale;
            const xValF = xBlockStart + off;
            const uValF = Af * xValF + bf;
            const qExactF = Math.max(1, Math.abs(uValF * uValF - sqrtMfSq) / Af);
            const qBitsExact = Math.log2(qExactF) + sShift;
            if (qBitsExact - logSumEst <= exactMaxRemBits) {
              candOffs[filtCount++] = off;
            }
          }
          if (filtCount === 0) continue;
          candsTested += filtCount;

          wasmKernel.matchBlockCands(
            smallEnd, medEnd, filtCount, blockSize,
            wOff.candOffs, wOff.candMark, wOff.blockS1, wOff.blockS2,
            wOff.primes, bOff, bLen, wOff.outCols, MAX_COLS_PER_CAND, wOff.outColCounts
          );

          const outColsBase32 = wOff.outCols >> 2;
          const outCountsBase32 = wOff.outColCounts >> 2;
          for (let c = 0; c < filtCount; c++) {
            const colCnt = wI32[outCountsBase32 + c];
            const res = factorHgsMatchedCandidate(
              blkBaseIdx + candOffs[c],
              sieveHalfWidth,
              A,
              b,
              C,
              aIndices,
              fbPrimes,
              fbPrimesBig,
              smallEnd,
              aSkipArr,
              wI32,
              outColsBase32 + c * MAX_COLS_PER_CAND,
              colCnt,
              largePrimeBoundBig,
              largePrimeBoundNum,
              lpBoundSq,
              lpBoundSqMargin,
              allow2LP,
              N,
              wasmKernel
            );
            if (!res) continue;
            if (res.directFactor) {
              return {
                relations,
                directFactor: res.directFactor,
                polysProcessed: m + 1,
                sieveHalfWidth,
                blocksProcessed,
                scannedCount,
                skippedCount,
                candsTested,
                squfof2Lp,
                engineKind: hgsCache.engineKind
              };
            }
            if (res.is2LP) squfof2Lp++;
            if (res.relation) relations.push(res.relation);
          }
        } else {
          // Pure JS TypedArray Fallback Path
          const qWords = blockWords >>> 2;
          for (let q = 0; q < 4; q++) {
            const wVal = initWordArr[q];
            const wEnd = (q + 1) * qWords;
            for (let w = q * qWords; w < wEnd; w++) jsBlockU32[w] = wVal;
          }

          for (let i = smallEnd; i < med4End; i++) {
            let idx1 = jsCur1[i];
            if (idx1 < 0) continue;
            let idx2 = jsCur2[i];
            jsBlockS1[i] = idx1;
            jsBlockS2[i] = idx2;
            const p = fbPrimes[i];
            const logP = sieveLogs[i];
            const p2 = p + p;
            const p3 = p2 + p;
            const p4 = p2 + p2;
            const lim4 = blockSize - p3;

            if (idx1 !== idx2) {
              while (idx1 < lim4) {
                jsBlockU8[idx1] += logP;
                jsBlockU8[idx1 + p] += logP;
                jsBlockU8[idx1 + p2] += logP;
                jsBlockU8[idx1 + p3] += logP;
                idx1 += p4;
              }
              while (idx1 < blockSize) { jsBlockU8[idx1] += logP; idx1 += p; }
              while (idx2 < lim4) {
                jsBlockU8[idx2] += logP;
                jsBlockU8[idx2 + p] += logP;
                jsBlockU8[idx2 + p2] += logP;
                jsBlockU8[idx2 + p3] += logP;
                idx2 += p4;
              }
              while (idx2 < blockSize) { jsBlockU8[idx2] += logP; idx2 += p; }
              jsCur1[i] = idx1 - blockSize;
              jsCur2[i] = idx2 - blockSize;
            } else {
              while (idx1 < lim4) {
                jsBlockU8[idx1] += logP;
                jsBlockU8[idx1 + p] += logP;
                jsBlockU8[idx1 + p2] += logP;
                jsBlockU8[idx1 + p3] += logP;
                idx1 += p4;
              }
              while (idx1 < blockSize) { jsBlockU8[idx1] += logP; idx1 += p; }
              const nxt = idx1 - blockSize;
              jsCur1[i] = nxt;
              jsCur2[i] = nxt;
            }
          }

          for (let i = med4End; i < medEnd; i++) {
            let idx1 = jsCur1[i];
            if (idx1 < 0) continue;
            let idx2 = jsCur2[i];
            jsBlockS1[i] = idx1;
            jsBlockS2[i] = idx2;
            const p = fbPrimes[i];
            const logP = sieveLogs[i];
            if (idx1 !== idx2) {
              while (idx1 < blockSize && idx2 < blockSize) {
                jsBlockU8[idx1] += logP;
                jsBlockU8[idx2] += logP;
                idx1 += p;
                idx2 += p;
              }
              while (idx1 < blockSize) { jsBlockU8[idx1] += logP; idx1 += p; }
              while (idx2 < blockSize) { jsBlockU8[idx2] += logP; idx2 += p; }
              jsCur1[i] = idx1 - blockSize;
              jsCur2[i] = idx2 - blockSize;
            } else {
              while (idx1 < blockSize) { jsBlockU8[idx1] += logP; idx1 += p; }
              const nxt = idx1 - blockSize;
              jsCur1[i] = nxt;
              jsCur2[i] = nxt;
            }
          }

          const bArr = jsBuckets[blk];
          const bLen = jsBucketCounts[blk];
          for (let k = 0; k < bLen; k++) {
            const entry = bArr[k];
            jsBlockU8[entry & 0x7FFF] += sieveLogs[entry >>> 15];
          }

          let rawCandCount = 0;
          const maxCand = candOffs.length;
          for (let w = 0; w < blockWords; w++) {
            if ((jsBlockU32[w] & 0x80808080) === 0) continue;
            const base = w << 2;
            for (let k = 0; k < 4; k++) {
              const off = base + k;
              if (jsBlockU8[off] >= 128 && rawCandCount < maxCand) {
                candOffs[rawCandCount++] = off;
              }
            }
          }

          scannedCount += blockSize;
          skippedCount += (blockSize - rawCandCount);
          if (rawCandCount === 0) continue;

          let filtCount = 0;
          for (let c = 0; c < rawCandCount; c++) {
            const off = candOffs[c];
            const score = jsBlockU8[off];
            const qIdx = off >>> qShift;
            const logSumEst = (score - initValArr[qIdx]) / effLogScale;
            const xValF = xBlockStart + off;
            const uValF = Af * xValF + bf;
            const qExactF = Math.max(1, Math.abs(uValF * uValF - sqrtMfSq) / Af);
            const qBitsExact = Math.log2(qExactF) + sShift;
            if (qBitsExact - logSumEst <= exactMaxRemBits) {
              candOffs[filtCount++] = off;
            }
          }
          if (filtCount === 0) continue;
          candsTested += filtCount;

          while (jsCandCols.length < filtCount) jsCandCols.push([]);
          for (let c = 0; c < filtCount; c++) {
            jsCandMark[candOffs[c]] = c + 1;
            jsCandCols[c].length = 0;
          }
          for (let k = 0; k < bLen; k++) {
            const entry = bArr[k];
            const slot = jsCandMark[entry & 0x7FFF];
            if (slot !== 0) jsCandCols[slot - 1].push(entry >>> 15);
          }

          if (filtCount >= 4) {
            for (let i = smallEnd; i < med512End; i++) {
              const s1 = start1Arr[i];
              if (s1 < 0) continue;
              const s2 = start2Arr[i];
              const p = fbPrimes[i];
              const diffR = s2 !== s1;
              for (let c = 0; c < filtCount; c++) {
                const u = blkBaseIdx + candOffs[c];
                const mMod = u % p;
                if (mMod === s1 || (diffR && mMod === s2)) jsCandCols[c].push(i);
              }
            }
            for (let i = med512End; i < medEnd; i++) {
              let pos = jsBlockS1[i];
              if (pos < 0) continue;
              const b2 = jsBlockS2[i];
              const p = fbPrimes[i];
              const diffR = b2 !== pos;
              while (pos < blockSize) {
                const slot = jsCandMark[pos];
                if (slot !== 0) jsCandCols[slot - 1].push(i);
                pos += p;
              }
              if (diffR) {
                pos = b2;
                while (pos < blockSize) {
                  const slot = jsCandMark[pos];
                  if (slot !== 0) jsCandCols[slot - 1].push(i);
                  pos += p;
                }
              }
            }
          } else {
            for (let i = smallEnd; i < medEnd; i++) {
              const s1 = start1Arr[i];
              if (s1 < 0) continue;
              const s2 = start2Arr[i];
              const p = fbPrimes[i];
              const diffR = s2 !== s1;
              for (let c = 0; c < filtCount; c++) {
                const u = blkBaseIdx + candOffs[c];
                const mMod = u % p;
                if (mMod === s1 || (diffR && mMod === s2)) jsCandCols[c].push(i);
              }
            }
          }
          for (let c = 0; c < filtCount; c++) jsCandMark[candOffs[c]] = 0;

          for (let c = 0; c < filtCount; c++) {
            const cols = jsCandCols[c];
            const res = factorHgsMatchedCandidate(
              blkBaseIdx + candOffs[c],
              sieveHalfWidth,
              A,
              b,
              C,
              aIndices,
              fbPrimes,
              fbPrimesBig,
              smallEnd,
              aSkipArr,
              cols,
              0,
              cols.length,
              largePrimeBoundBig,
              largePrimeBoundNum,
              lpBoundSq,
              lpBoundSqMargin,
              allow2LP,
              N,
              null
            );
            if (!res) continue;
            if (res.directFactor) {
              return {
                relations,
                directFactor: res.directFactor,
                polysProcessed: m + 1,
                sieveHalfWidth,
                blocksProcessed,
                scannedCount,
                skippedCount,
                candsTested,
                squfof2Lp,
                engineKind: hgsCache.engineKind
              };
            }
            if (res.is2LP) squfof2Lp++;
            if (res.relation) relations.push(res.relation);
          }
        }
      }

      if (onChunkFlush && (relations.length >= 18 || (m & 7) === 7)) {
        const flushed = await onChunkFlush(
          relations.splice(0, relations.length),
          m + 1,
          sieveHalfWidth,
          blocksProcessed,
          scannedCount,
          skippedCount,
          candsTested,
          squfof2Lp
        );
        if (flushed && flushed.stop) {
          return {
            relations,
            directFactor: null,
            polysProcessed: m + 1,
            sieveHalfWidth,
            blocksProcessed,
            scannedCount,
            skippedCount,
            candsTested,
            squfof2Lp,
            engineKind: hgsCache.engineKind
          };
        }
      }
    }

    return {
      relations,
      directFactor: null,
      polysProcessed: totalPolys,
      sieveHalfWidth,
      blocksProcessed,
      scannedCount,
      skippedCount,
      candsTested,
      squfof2Lp,
      engineKind: hgsCache.engineKind
    };
  };

  // Lazy 1LP/2LP Cycle Pool + BFS Spanning Forest Materialization at solve time (Fallback Standalone Mode)
  const createStandaloneLpPool = (N, fbPrimes) => {
    const fullMap = new Map();
    const fullList = [];
    const seenPartials = new Set();
    const ufParent = new Map([['1', '1']]);
    const treeAdj = new Map([['1', []]]);
    const cycleEdges = [];
    let pendingCycleOffset = 0;
    let partialCount = 0;
    let collisionsCount = 0;

    const findRoot = (v) => {
      if (!ufParent.has(v)) {
        ufParent.set(v, v);
        treeAdj.set(v, []);
        return v;
      }
      let root = v;
      while (ufParent.get(root) !== root) root = ufParent.get(root);
      let node = v;
      while (node !== root) {
        const nxt = ufParent.get(node);
        ufParent.set(node, root);
        node = nxt;
      }
      return root;
    };

    const combineCycle = (cycleRels, cycleVerts) => {
      let combinedX = 1n;
      let combinedExtra = 1n;
      let signNeg = false;
      const colCounts = new Map();
      for (let i = 0; i < cycleRels.length; i++) {
        const r = cycleRels[i];
        combinedX = (combinedX * BigInt(r.xVal)) % N;
        combinedExtra = (combinedExtra * BigInt(r.extraSquare || '1')) % N;
        if (r.signNeg) signNeg = !signNeg;
        const cols = r.sparseCols || [];
        for (let j = 0; j < cols.length; j++) {
          colCounts.set(cols[j], (colCounts.get(cols[j]) || 0) + 1);
        }
      }
      for (let i = 0; i < cycleVerts.length; i++) {
        const v = cycleVerts[i];
        if (v !== '1') combinedExtra = (combinedExtra * BigInt(v)) % N;
      }
      const mergedCols = [];
      for (const [col, cnt] of colCounts.entries()) {
        if ((cnt & 1) === 1) mergedCols.push(col);
        const half = cnt >> 1;
        if (half > 0) combinedExtra = (combinedExtra * modPow(BigInt(fbPrimes[col]), BigInt(half), N)) % N;
      }
      mergedCols.sort((a, b) => a - b);
      const cKey = 'CYC:' + combinedX.toString() + ':' + mergedCols.slice(0, 6).join(',') + ':' + fullList.length;
      return {
        xVal: combinedX.toString(),
        qVal: cKey,
        signNeg,
        sparseCols: mergedCols,
        extraSquare: combinedExtra.toString()
      };
    };

    const materializeFullRelations = () => {
      if (pendingCycleOffset >= cycleEdges.length) return;
      const depth = new Map();
      const parent = new Map();
      const parentRel = new Map();
      const compRoot = new Map();
      const q = [];
      const runBfs = (root) => {
        if (depth.has(root)) return;
        depth.set(root, 0);
        parent.set(root, null);
        parentRel.set(root, null);
        compRoot.set(root, root);
        q.length = 0;
        q.push(root);
        let head = 0;
        while (head < q.length) {
          const u = q[head++];
          const du = depth.get(u) + 1;
          const adj = treeAdj.get(u);
          if (!adj) continue;
          for (let i = 0; i < adj.length; i++) {
            const edge = adj[i];
            if (!depth.has(edge.to)) {
              depth.set(edge.to, du);
              parent.set(edge.to, u);
              parentRel.set(edge.to, edge.rel);
              compRoot.set(edge.to, root);
              q.push(edge.to);
            }
          }
        }
      };
      if (treeAdj.has('1')) runBfs('1');
      for (const node of treeAdj.keys()) if (!depth.has(node)) runBfs(node);

      while (pendingCycleOffset < cycleEdges.length) {
        const edge = cycleEdges[pendingCycleOffset++];
        let a = edge.u;
        let b = edge.v;
        if (compRoot.get(a) !== compRoot.get(b)) continue;
        let da = depth.get(a);
        let db = depth.get(b);
        const pathRels = [];
        const pathVerts = [];
        let hops = 0;
        while (da > db && hops <= 20) {
          pathVerts.push(a);
          const ra = parentRel.get(a);
          if (ra) pathRels.push(ra);
          a = parent.get(a);
          da--;
          hops++;
        }
        while (db > da && hops <= 20) {
          pathVerts.push(b);
          const rb = parentRel.get(b);
          if (rb) pathRels.push(rb);
          b = parent.get(b);
          db--;
          hops++;
        }
        while (a !== b && hops <= 20) {
          pathVerts.push(a, b);
          const ra = parentRel.get(a);
          const rb = parentRel.get(b);
          if (ra) pathRels.push(ra);
          if (rb) pathRels.push(rb);
          a = parent.get(a);
          b = parent.get(b);
          hops += 2;
        }
        if (a !== b || pathRels.length === 0) continue;
        pathVerts.push(a);
        const combined = combineCycle([edge.rel, ...pathRels], pathVerts);
        if (!fullMap.has(combined.qVal)) {
          fullMap.set(combined.qVal, combined);
          fullList.push(combined);
        }
      }
    };

    const ingest = (rel) => {
      const key = rel.qVal || rel.xVal;
      if (!rel.largePrime) {
        if (!fullMap.has(key)) {
          fullMap.set(key, rel);
          fullList.push(rel);
          return { addedFull: rel, isCollision: false };
        }
        return null;
      }
      const u = rel.largePrime;
      const v = rel.largePrime2 || '1';
      if (u === v) {
        const sqExtra = (BigInt(rel.extraSquare || '1') * BigInt(u)) % N;
        const sqKey = 'LP2SQ:' + u + ':' + key;
        if (!fullMap.has(sqKey)) {
          const fullRel = {
            xVal: rel.xVal,
            qVal: sqKey,
            signNeg: rel.signNeg,
            sparseCols: rel.sparseCols,
            extraSquare: sqExtra.toString()
          };
          fullMap.set(sqKey, fullRel);
          fullList.push(fullRel);
          collisionsCount++;
          return { addedFull: fullRel, isCollision: true };
        }
        return null;
      }
      if (seenPartials.has(key)) return null;
      seenPartials.add(key);
      partialCount++;
      const ru = findRoot(u);
      const rv = findRoot(v);
      if (ru !== rv) {
        if (ru === '1') ufParent.set(rv, '1');
        else ufParent.set(ru, rv);
        treeAdj.get(u).push({ to: v, rel });
        treeAdj.get(v).push({ to: u, rel });
        return null;
      } else {
        cycleEdges.push({ u, v, rel });
        collisionsCount++;
        return { addedFull: null, isCollision: true };
      }
    };

    return {
      ingest,
      getFullRelations: () => {
        materializeFullRelations();
        return fullList;
      },
      get fullCount() { return fullList.length + (cycleEdges.length - pendingCycleOffset); },
      get partialCount() { return partialCount; },
      get collisionsCount() { return collisionsCount; }
    };
  };

  // Sparse Matrix Singleton Filtering + Markowitz SGE + Bit-packed Uint32Array GF(2) Solver (Fallback Standalone Mode)
  const solveMatrixMod2Markowitz = (N, fbPrimes, relations) => {
    const numRows = relations.length;
    const totalCols = fbPrimes.length + 1;
    if (numRows <= 4) return { factor: null, dependenciesCount: 0, coreRows: 0, coreCols: 0 };

    const rowColsList = new Array(numRows);
    const rowHistList = new Array(numRows);
    const rowAlive = new Uint8Array(numRows).fill(1);
    const colAdj = Array.from({ length: totalCols }, () => []);
    const colDeg = new Int32Array(totalCols);

    for (let r = 0; r < numRows; r++) {
      const rel = relations[r];
      const sc = rel.sparseCols || [];
      const offset = rel.signNeg ? 1 : 0;
      const cols = new Array(sc.length + offset);
      if (offset) cols[0] = 0;
      for (let j = 0; j < sc.length; j++) cols[j + offset] = sc[j] + 1;
      rowColsList[r] = cols;
      rowHistList[r] = [r];
      for (let j = 0; j < cols.length; j++) {
        const c = cols[j];
        colDeg[c]++;
        colAdj[c].push(r);
      }
    }

    const colCountsBuf = new Int32Array(fbPrimes.length);
    const touchedColsBuf = [];
    const testDep = (subset) => {
      if (!subset || subset.length === 0) return null;
      let negParity = 0;
      let XProd = 1n;
      let YProd = 1n;
      touchedColsBuf.length = 0;
      for (let i = 0; i < subset.length; i++) {
        const rel = relations[subset[i]];
        XProd = (XProd * BigInt(rel.xVal)) % N;
        if (rel.extraSquare && rel.extraSquare !== '1') {
          YProd = (YProd * BigInt(rel.extraSquare)) % N;
        }
        if (rel.signNeg) negParity ^= 1;
        const cols = rel.sparseCols || [];
        for (let j = 0; j < cols.length; j++) {
          const c = cols[j];
          if (colCountsBuf[c] === 0) touchedColsBuf.push(c);
          colCountsBuf[c]++;
        }
      }
      if (negParity !== 0) {
        for (let t = 0; t < touchedColsBuf.length; t++) colCountsBuf[touchedColsBuf[t]] = 0;
        return null;
      }
      for (let t = 0; t < touchedColsBuf.length; t++) {
        const c = touchedColsBuf[t];
        const cnt = colCountsBuf[c];
        colCountsBuf[c] = 0;
        if ((cnt & 1) !== 0) {
          for (let k = t + 1; k < touchedColsBuf.length; k++) colCountsBuf[touchedColsBuf[k]] = 0;
          return null;
        }
        const half = cnt >> 1;
        const pBig = BigInt(fbPrimes[c]);
        if (half === 1) YProd = (YProd * pBig) % N;
        else if (half > 1) YProd = (YProd * modPow(pBig, BigInt(half), N)) % N;
      }
      const diff = XProd > YProd ? XProd - YProd : YProd - XProd;
      const g1 = gcd(diff, N);
      if (g1 > 1n && g1 < N) return { factor: g1, X: XProd, Y: YProd, diff, g1, g2: 1n };
      const g2 = gcd((XProd + YProd) % N, N);
      if (g2 > 1n && g2 < N) return { factor: g2, X: XProd, Y: YProd, diff, g1, g2 };
      return null;
    };

    const mergeScratch = new Int32Array(totalCols + numRows + 16);
    const xorSorted = (a, b) => {
      let i = 0, j = 0, k = 0;
      const aLen = a.length, bLen = b.length;
      while (i < aLen && j < bLen) {
        if (a[i] < b[j]) mergeScratch[k++] = a[i++];
        else if (b[j] < a[i]) mergeScratch[k++] = b[j++];
        else { i++; j++; }
      }
      while (i < aLen) mergeScratch[k++] = a[i++];
      while (j < bLen) mergeScratch[k++] = b[j++];
      const out = new Array(k);
      for (let p = 0; p < k; p++) out[p] = mergeScratch[p];
      return out;
    };

    const MAX_SGE_DEG = 3;
    const degQueues = Array.from({ length: MAX_SGE_DEG + 1 }, () => []);
    const degHeads = new Int32Array(MAX_SGE_DEG + 1);
    const queuedDeg = new Int8Array(totalCols);
    for (let c = 0; c < totalCols; c++) {
      const d = colDeg[c];
      if (d >= 1 && d <= MAX_SGE_DEG) {
        degQueues[d].push(c);
        queuedDeg[c] = d;
      }
    }
    const enqueueDeg = (c) => {
      const d = colDeg[c];
      if (d >= 1 && d <= MAX_SGE_DEG && queuedDeg[c] !== d) {
        degQueues[d].push(c);
        queuedDeg[c] = d;
      }
    };
    const killRow = (rIdx) => {
      rowAlive[rIdx] = 0;
      const cols = rowColsList[rIdx];
      for (let j = 0; j < cols.length; j++) {
        colDeg[cols[j]]--;
        enqueueDeg(cols[j]);
      }
    };

    const inOldRow = new Int32Array(totalCols);
    let oldStamp = 1;
    const colRowsBuf = new Int32Array(MAX_SGE_DEG);
    let mergesDone = 0;
    const maxMerges = numRows * 3;

    while (mergesDone < maxMerges) {
      let targetDeg = 0, targetCol = -1;
      for (let d = 1; d <= MAX_SGE_DEG; d++) {
        const q = degQueues[d];
        let h = degHeads[d];
        while (h < q.length) {
          const c = q[h++];
          if (colDeg[c] === d) {
            targetDeg = d;
            targetCol = c;
            break;
          }
        }
        degHeads[d] = h;
        if (targetCol >= 0) break;
      }
      if (targetCol < 0) break;

      const adj = colAdj[targetCol];
      let found = 0;
      for (let i = 0; i < adj.length; i++) {
        const rIdx = adj[i];
        if (!rowAlive[rIdx]) continue;
        let dup = false;
        for (let k = 0; k < found; k++) if (colRowsBuf[k] === rIdx) { dup = true; break; }
        if (!dup) {
          colRowsBuf[found++] = rIdx;
          if (found === targetDeg) break;
        }
      }
      if (found !== targetDeg) continue;

      if (targetDeg === 1) {
        killRow(colRowsBuf[0]);
        continue;
      }

      let pivSlot = 0, pivLen = rowColsList[colRowsBuf[0]].length;
      for (let k = 1; k < targetDeg; k++) {
        const len = rowColsList[colRowsBuf[k]].length;
        if (len < pivLen) { pivLen = len; pivSlot = k; }
      }
      if (targetDeg === 2) {
        if (pivLen + rowColsList[colRowsBuf[1 - pivSlot]].length > 56) continue;
      } else {
        if (pivLen > 10) continue;
        let tooDense = false;
        for (let k = 0; k < targetDeg; k++) {
          if (k !== pivSlot && pivLen + rowColsList[colRowsBuf[k]].length > 48) { tooDense = true; break; }
        }
        if (tooDense) continue;
      }

      const rPiv = colRowsBuf[pivSlot];
      const colsPiv = rowColsList[rPiv];
      const histPiv = rowHistList[rPiv];
      rowAlive[rPiv] = 0;
      for (let j = 0; j < colsPiv.length; j++) colDeg[colsPiv[j]]--;

      for (let k = 0; k < targetDeg; k++) {
        if (k === pivSlot) continue;
        const rDst = colRowsBuf[k];
        const colsDst = rowColsList[rDst];
        const mergedCols = xorSorted(colsDst, colsPiv);
        const mergedHist = xorSorted(rowHistList[rDst], histPiv);
        const stamp = oldStamp++;
        for (let j = 0; j < colsDst.length; j++) {
          colDeg[colsDst[j]]--;
          inOldRow[colsDst[j]] = stamp;
        }
        rowColsList[rDst] = mergedCols;
        rowHistList[rDst] = mergedHist;
        for (let j = 0; j < mergedCols.length; j++) {
          const mc = mergedCols[j];
          colDeg[mc]++;
          if (inOldRow[mc] !== stamp) colAdj[mc].push(rDst);
          enqueueDeg(mc);
        }
        for (let j = 0; j < colsDst.length; j++) enqueueDeg(colsDst[j]);
      }
      for (let j = 0; j < colsPiv.length; j++) enqueueDeg(colsPiv[j]);
      mergesDone++;
    }

    let dependenciesCount = 0;
    const activeRows = [];
    for (let r = 0; r < numRows; r++) {
      if (!rowAlive[r]) continue;
      if (rowColsList[r].length === 0) {
        dependenciesCount++;
        const hit = testDep(rowHistList[r]);
        if (hit) return { ...hit, dependenciesCount, coreRows: activeRows.length, coreCols: 0 };
        continue;
      }
      activeRows.push({ cols: rowColsList[r], hist: rowHistList[r] });
    }

    if (activeRows.length === 0) return { factor: null, dependenciesCount, coreRows: 0, coreCols: 0 };

    const activeColFreq = new Int32Array(totalCols);
    const activeColList = [];
    for (let i = 0; i < activeRows.length; i++) {
      const cols = activeRows[i].cols;
      for (let j = 0; j < cols.length; j++) {
        const c = cols[j];
        if (activeColFreq[c] === 0) activeColList.push(c);
        activeColFreq[c]++;
      }
    }
    activeColList.sort((a, b) => activeColFreq[b] - activeColFreq[a]);
    const colMap = new Int32Array(totalCols).fill(-1);
    for (let i = 0; i < activeColList.length; i++) colMap[activeColList[i]] = i;

    const mCore = activeRows.length;
    const kCore = activeColList.length;
    if (mCore <= kCore) return { factor: null, dependenciesCount, coreRows: mCore, coreCols: kCore };

    for (let i = 0; i < mCore; i++) {
      const cols = activeRows[i].cols;
      for (let j = 0; j < cols.length; j++) cols[j] = colMap[cols[j]];
      if (cols.length > 1) cols.sort((a, b) => a - b);
    }
    activeRows.sort((a, b) => a.cols.length - b.cols.length);

    // Transposed Forward Elimination + SWAR popcnt Back-Substitution over GF(2)
    const W = (mCore + 31) >>> 5;
    const matT = new Uint32Array(kCore * W);
    for (let r = 0; r < mCore; r++) {
      const cols = activeRows[r].cols;
      const wIdx = r >>> 5;
      const bitMask = 1 << (r & 31);
      for (let j = 0; j < cols.length; j++) {
        matT[cols[j] * W + wIdx] |= bitMask;
      }
    }

    const pivRel = new Int32Array(kCore);
    const freeRels = [];
    let rank = 0;

    for (let r = 0; r < mCore; r++) {
      if (rank === kCore) {
        for (let rr = r; rr < mCore; rr++) freeRels.push(rr);
        break;
      }
      const wIdx = r >>> 5;
      const bitMask = 1 << (r & 31);
      let foundRow = -1;
      for (let i = rank; i < kCore; i++) {
        if ((matT[i * W + wIdx] & bitMask) !== 0) {
          foundRow = i;
          break;
        }
      }
      if (foundRow < 0) {
        freeRels.push(r);
        continue;
      }
      const pivOff = rank * W;
      if (foundRow !== rank) {
        const fOff = foundRow * W;
        for (let w = wIdx; w < W; w++) {
          const tmp = matT[pivOff + w];
          matT[pivOff + w] = matT[fOff + w];
          matT[fOff + w] = tmp;
        }
      }
      for (let k = rank + 1; k < kCore; k++) {
        const kOff = k * W;
        if ((matT[kOff + wIdx] & bitMask) !== 0) {
          for (let w = wIdx; w < W; w++) {
            matT[kOff + w] ^= matT[pivOff + w];
          }
        }
      }
      pivRel[rank++] = r;
    }

    const depParity = new Uint8Array(numRows);
    const depTouched = [];
    const depSubset = [];
    const xWords = new Uint32Array(W);

    for (let fi = 0; fi < freeRels.length; fi++) {
      const freeCol = freeRels[fi];
      const freeWord = freeCol >>> 5;
      xWords.fill(0, 0, freeWord + 1);
      xWords[freeWord] = 1 << (freeCol & 31);

      for (let j = rank - 1; j >= 0; j--) {
        const pCol = pivRel[j];
        if (pCol > freeCol) continue;
        const pWord = pCol >>> 5;
        const jOff = j * W;
        let acc = 0;
        for (let w = pWord; w <= freeWord; w++) {
          acc ^= matT[jOff + w] & xWords[w];
        }
        if (acc !== 0) {
          acc = acc - ((acc >>> 1) & 0x55555555);
          acc = (acc & 0x33333333) + ((acc >>> 2) & 0x33333333);
          const pc = Math.imul((acc + (acc >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
          if ((pc & 1) !== 0) {
            xWords[pWord] |= 1 << (pCol & 31);
          }
        }
      }

      depTouched.length = 0;
      for (let w = 0; w <= freeWord; w++) {
        let word = xWords[w];
        while (word !== 0) {
          const lsb = word & -word;
          const rowIdx = (w << 5) + (Math.clz32(lsb) ^ 31);
          if (rowIdx < mCore) {
            const origHist = activeRows[rowIdx].hist;
            for (let k = 0; k < origHist.length; k++) {
              const origIdx = origHist[k];
              if (depParity[origIdx] === 0) depTouched.push(origIdx);
              depParity[origIdx] ^= 1;
            }
          }
          word ^= lsb;
        }
      }
      depSubset.length = 0;
      for (let k = 0; k < depTouched.length; k++) {
        const idx = depTouched[k];
        if (depParity[idx] === 1) {
          depSubset.push(idx);
          depParity[idx] = 0;
        }
      }
      if (depSubset.length > 0) {
        dependenciesCount++;
        const hit = testDep(depSubset);
        if (hit) return { ...hit, dependenciesCount, coreRows: mCore, coreCols: kCore };
      }
    }

    return { factor: null, dependenciesCount, coreRows: mCore, coreCols: kCore };
  };

  const buildFactorTree = (N, factor1, factor2) => {
    const pBig = BigInt(factor1);
    const qBig = BigInt(factor2);
    return {
      value: N.toString(),
      bits: N.toString(2).length,
      isPrime: false,
      left: {
        value: pBig.toString(),
        bits: pBig.toString(2).length,
        isPrime: isProbablePrimeBig(pBig, 8),
        role: 'factor_p'
      },
      right: {
        value: qBig.toString(),
        bits: qBig.toString(2).length,
        isPrime: isProbablePrimeBig(qBig, 8),
        role: 'factor_q'
      }
    };
  };

  // High-Speed Parallel Stream Mode: powers BOTH Unified GF(2) AND All-Core Standalone HGS Mode
  const runHgsStreamLoop = async (
    N,
    targetM,
    workerId = 0,
    hgsRank = 0,
    hgsTotalWorkers = 1,
    seedOffset = 0,
    fbPrimes = [],
    fbRoots = [],
    largePrimeBound = 1000000,
    sieveMode = 'v4-fallback',
    sieveWeights = null
  ) => {
    const initKernel = getHgsWasmKernel();
    const initKind = initKernel ? initKernel.engineKind : 'js-fallback';
    self.postMessage({
      type: 'log',
      message: '[HGS W#' + (workerId + 1) + ' · ' + initKind.toUpperCase() + '] Active (Rank ' + (hgsRank + 1) + '/' + hgsTotalWorkers + ', FB=' + fbPrimes.length + ')...'
    });

    let familyIdx = hgsRank;
    let totalPolys = 0;
    let totalBlocks = 0;
    let totalScanned = 0;
    let totalSkipped = 0;
    let totalCands = 0;
    let totalSqufof2Lp = 0;
    let pendingRelations = [];
    let lastBatchFlushTime = Date.now();
    let lastYieldTime = Date.now();
    const streamStartedAt = Date.now();

    while (true) {
      if (isPaused) await waitIfPaused();
      let prevChunkPolys = 0;
      let prevChunkBlocks = 0;
      let prevChunkScanned = 0;
      let prevChunkSkipped = 0;
      let prevChunkCands = 0;
      let prevChunkSqufof = 0;

      const siqsRes = await runHgsSiqsPolyFamily(
        N,
        targetM,
        fbPrimes,
        fbRoots,
        largePrimeBound,
        familyIdx,
        hgsRank,
        hgsTotalWorkers,
        seedOffset,
        sieveMode,
        sieveWeights,
        async (chunkRels, polysDone, halfW, blkDone, scanDone, skipDone, candsDone, squfofDone) => {
          const dPolys = polysDone - prevChunkPolys;
          const dBlocks = blkDone - prevChunkBlocks;
          const dScan = scanDone - prevChunkScanned;
          const dSkip = skipDone - prevChunkSkipped;
          const dCands = candsDone - prevChunkCands;
          const dSqufof = squfofDone - prevChunkSqufof;
          prevChunkPolys = polysDone;
          prevChunkBlocks = blkDone;
          prevChunkScanned = scanDone;
          prevChunkSkipped = skipDone;
          prevChunkCands = candsDone;
          prevChunkSqufof = squfofDone;

          totalPolys += dPolys;
          totalBlocks += dBlocks;
          totalScanned += dScan;
          totalSkipped += dSkip;
          totalCands += dCands;
          totalSqufof2Lp += dSqufof;

          for (let r = 0; r < chunkRels.length; r++) pendingRelations.push(chunkRels[r]);
          const now = Date.now();
          if (pendingRelations.length >= 18 || now - lastBatchFlushTime >= 110) {
            const batchDurationMs = Math.max(1, now - lastBatchFlushTime);
            const activeElapsedSec = Math.max(0.05, (now - streamStartedAt - totalPausedMs) / 1000);
            lastBatchFlushTime = now;
            self.postMessage({
              type: 'hgs_relations_batch',
              workerId,
              role: 'hgs',
              engineKind: hgsCache.engineKind || initKind,
              polysProcessed: totalPolys,
              polysPerSec: Number((totalPolys / activeElapsedSec).toFixed(1)),
              blocksProcessed: totalBlocks,
              scannedCount: totalScanned,
              skippedCount: totalSkipped,
              candsTested: totalCands,
              squfof2Lp: totalSqufof2Lp,
              batchDurationMs,
              sieveHalfWidth: halfW,
              targetN: N.toString(),
              relations: pendingRelations
            });
            pendingRelations = [];
          }
          if (now - lastYieldTime >= 85) {
            lastYieldTime = now;
            await new Promise(r => setTimeout(r, 0));
          }
          if (isPaused) await waitIfPaused();
          return null;
        }
      );

      familyIdx += Math.max(1, hgsTotalWorkers);
      totalPolys += Math.max(0, (siqsRes.polysProcessed || 0) - prevChunkPolys);
      totalBlocks += Math.max(0, (siqsRes.blocksProcessed || 0) - prevChunkBlocks);
      totalScanned += Math.max(0, (siqsRes.scannedCount || 0) - prevChunkScanned);
      totalSkipped += Math.max(0, (siqsRes.skippedCount || 0) - prevChunkSkipped);
      totalCands += Math.max(0, (siqsRes.candsTested || 0) - prevChunkCands);
      totalSqufof2Lp += Math.max(0, (siqsRes.squfof2Lp || 0) - prevChunkSqufof);

      if (siqsRes.directFactor && siqsRes.directFactor > 1n && siqsRes.directFactor < N) {
        const f1 = siqsRes.directFactor;
        const f2 = N / f1;
        const sorted = [f1, f2].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
        return {
          factor: sorted[0],
          factors: sorted,
          method: 'HGS SIQS Direct Congruence (32KB-Tiled)',
          steps: totalPolys * 180,
          tree: buildFactorTree(N, sorted[0], sorted[1])
        };
      }

      if (siqsRes.relations.length > 0) {
        for (let r = 0; r < siqsRes.relations.length; r++) {
          pendingRelations.push(siqsRes.relations[r]);
        }
      }

      const now = Date.now();
      if (pendingRelations.length > 0 || now - lastBatchFlushTime >= 110) {
        const batchDurationMs = Math.max(1, now - lastBatchFlushTime);
        const activeElapsedSec = Math.max(0.05, (now - streamStartedAt - totalPausedMs) / 1000);
        lastBatchFlushTime = now;
        self.postMessage({
          type: 'hgs_relations_batch',
          workerId,
          role: 'hgs',
          engineKind: siqsRes.engineKind || hgsCache.engineKind || initKind,
          polysProcessed: totalPolys,
          polysPerSec: Number((totalPolys / activeElapsedSec).toFixed(1)),
          blocksProcessed: totalBlocks,
          scannedCount: totalScanned,
          skippedCount: totalSkipped,
          candsTested: totalCands,
          squfof2Lp: totalSqufof2Lp,
          batchDurationMs,
          sieveHalfWidth: siqsRes.sieveHalfWidth || 32768,
          targetN: N.toString(),
          relations: pendingRelations
        });
        pendingRelations = [];
      }

      if (now - lastYieldTime >= 85) {
        lastYieldTime = now;
        await new Promise(r => setTimeout(r, 0));
      }
    }
  };

  // Fallback Single-Worker Standalone Mode (used only when no coordinator FB is supplied)
  const runHgsStandalone = async (N, sieveMode = 'v4-fallback', sieveWeights = null) => {
    const startTime = Date.now();
    self.postMessage({
      type: 'log',
      message: '[HGS SIQS 32KB-Tiled+SQUFOF Initialized] 32KB Working-Set Tiled Sieve + Piecewise Log + SQUFOF 2LP + markowitz-core on N (' + N.toString(2).length + ' bits)...'
    });

    if (N <= 1n) return { factor: null, method: 'Invalid Input' };
    if ((N & 1n) === 0n) {
      const q = N / 2n;
      return { factor: 2n, factor2: q, method: 'HGS Pre-Sieve (Even Modulus)', steps: 1, tree: buildFactorTree(N, 2n, q) };
    }

    const sqrtN = bigIntSqrt(N);
    if (sqrtN * sqrtN === N) {
      return { factor: sqrtN, factor2: sqrtN, method: 'HGS Pre-Sieve (Exact Square)', steps: 1, tree: buildFactorTree(N, sqrtN, sqrtN) };
    }

    if (isProbablePrimeBig(N, 10)) {
      return {
        factor: N,
        factor2: 1n,
        method: 'Miller-Rabin Primality Proof (N is Prime)',
        steps: 1,
        tree: { value: N.toString(), bits: N.toString(2).length, isPrime: true }
      };
    }

    const smallPrimes = getPrimesList(30000);
    for (let i = 0; i < smallPrimes.length; i++) {
      const sp = BigInt(smallPrimes[i]);
      if (sp >= N) break;
      if (N % sp === 0n) {
        const q = N / sp;
        return { factor: sp, factor2: q, method: 'HGS Pre-Sieve Small Prime (p=' + sp + ')', steps: i + 1, tree: buildFactorTree(N, sp, q) };
      }
    }

    const brentQuick = runBoundedBrent(N, 16000, 7);
    if (brentQuick && brentQuick > 1n && brentQuick < N) {
      const q = N / brentQuick;
      const sorted = [brentQuick, q].sort((a, b) => (a < b ? -1 : 1));
      return {
        factor: sorted[0],
        factor2: sorted[1],
        method: 'HGS Fast Brent Rho Scout',
        steps: 16000,
        duration: Date.now() - startTime,
        tree: buildFactorTree(N, sorted[0], sorted[1])
      };
    }

    self.postMessage({
      type: 'stage',
      stage: 'building_fb',
      message: 'Selecting Knuth-Schroeppel Multiplier & Building Odd-Only QR Factor Base...'
    });

    const ksRes = selectBestKsMultiplier(N);
    if (ksRes.directFactor) {
      const f = ksRes.directFactor;
      const q = N / f;
      const sorted = [f, q].sort((a, b) => (a < b ? -1 : 1));
      return { factor: sorted[0], factor2: sorted[1], method: 'HGS Knuth-Schroeppel GCD', steps: 1, tree: buildFactorTree(N, sorted[0], sorted[1]) };
    }

    const optK = ksRes.k;
    const targetM = BigInt(optK) * N;
    const { primes: fbPrimes, roots: fbRoots, largePrimeBound } = buildHgsFactorBase(N, targetM);
    let targetRelations = fbPrimes.length + 12;

    self.postMessage({
      type: 'fb_built',
      factorBase: [-1, ...fbPrimes],
      factorBaseSize: fbPrimes.length,
      polynomial: 'SIQS Q(x) = A x² + 2Bx + C (k=' + optK + ', 32KB-Tiled + Piecewise + SQUFOF)',
      targetSmooth: targetRelations
    });

    const lpPool = createStandaloneLpPool(N, fbPrimes);
    let familyIdx = 0;
    let totalPolys = 0;
    let totalScanned = 0;
    let totalSkipped = 0;
    let totalBlocks = 0;
    let totalSqufof2Lp = 0;
    let uiRelSent = 0;

    self.postMessage({
      type: 'stage',
      stage: 'sieving',
      message: 'Running 32KB Working-Set Tiled SIQS + Piecewise Log Thresholds + SQUFOF 2LP...'
    });

    for (let round = 0; round < 6000; round++) {
      while (lpPool.fullCount < targetRelations && round < 6000) {
        round++;
        const siqsRes = await runHgsSiqsPolyFamily(
          N,
          targetM,
          fbPrimes,
          fbRoots,
          largePrimeBound,
          familyIdx++,
          0,
          1,
          0,
          sieveMode,
          sieveWeights
        );
        totalPolys += siqsRes.polysProcessed || 1;
        totalBlocks += siqsRes.blocksProcessed || 0;
        totalScanned += siqsRes.scannedCount || 0;
        totalSkipped += siqsRes.skippedCount || 0;
        totalSqufof2Lp += siqsRes.squfof2Lp || 0;

        if (siqsRes.directFactor && siqsRes.directFactor > 1n && siqsRes.directFactor < N) {
          const f = siqsRes.directFactor;
          const q = N / f;
          const sorted = [f, q].sort((a, b) => (a < b ? -1 : 1));
          return {
            factor: sorted[0],
            factor2: sorted[1],
            method: 'HGS SIQS Direct Zero/GCD Hit',
            steps: totalPolys * 180,
            duration: Date.now() - startTime,
            tree: buildFactorTree(N, sorted[0], sorted[1])
          };
        }

        for (let r = 0; r < siqsRes.relations.length; r++) {
          const out = lpPool.ingest(siqsRes.relations[r]);
          if (out && out.addedFull && uiRelSent < 36) {
            uiRelSent++;
            const exps = new Array(Math.min(32, fbPrimes.length + 1)).fill(0);
            if (out.addedFull.signNeg) exps[0] = 1;
            const sc = out.addedFull.sparseCols || [];
            for (let c = 0; c < sc.length; c++) {
              if (sc[c] + 1 < exps.length) exps[sc[c] + 1] = 1;
            }
            self.postMessage({
              type: 'smooth_relation',
              smoothCount: lpPool.fullCount,
              targetSmooth: targetRelations,
              scannedCount: totalScanned,
              skippedCount: totalSkipped,
              blocksProcessed: totalBlocks,
              squfof2Lp: totalSqufof2Lp,
              lpCollisions: lpPool.collisionsCount,
              relation: {
                index: lpPool.fullCount,
                x: out.addedFull.xVal,
                X: out.addedFull.xVal,
                Q: out.addedFull.qVal || '',
                exponents: exps
              }
            });
          }
        }

        if (round % 2 === 0) {
          self.postMessage({
            type: 'smooth_relation',
            smoothCount: lpPool.fullCount,
            targetSmooth: targetRelations,
            scannedCount: totalScanned,
            skippedCount: totalSkipped,
            blocksProcessed: totalBlocks,
            squfof2Lp: totalSqufof2Lp,
            lpCollisions: lpPool.collisionsCount,
            relation: null
          });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (lpPool.fullCount < targetRelations) break;

      self.postMessage({
        type: 'stage',
        stage: 'linear_algebra',
        message: 'Singleton Peel + Markowitz SGE (markowitz-core) GF(2) Linear Algebra...'
      });

      const fullRels = lpPool.getFullRelations();
      const solveRes = solveMatrixMod2Markowitz(N, fbPrimes, fullRels);

      const previewRows = fullRels.slice(0, 16).map(rel => {
        const row = new Array(Math.min(32, fbPrimes.length + 1)).fill(0);
        if (rel.signNeg) row[0] = 1;
        const sc = rel.sparseCols || [];
        for (let c = 0; c < sc.length; c++) {
          if (sc[c] + 1 < row.length) row[sc[c] + 1] = 1;
        }
        return row;
      });

      self.postMessage({
        type: 'f2_matrix_solved',
        rows: fullRels.length,
        cols: fbPrimes.length + 1,
        dependenciesCount: solveRes.dependenciesCount,
        matrixPreview: previewRows
      });

      if (solveRes.factor && solveRes.factor > 1n && solveRes.factor < N) {
        const qFactor = N / solveRes.factor;
        const sorted = [solveRes.factor, qFactor].sort((a, b) => (a < b ? -1 : 1));
        const duration = Date.now() - startTime;
        const tree = buildFactorTree(N, sorted[0], sorted[1]);

        self.postMessage({
          type: 'congruence_hit',
          X: solveRes.X.toString(),
          Y: solveRes.Y.toString(),
          diff: solveRes.diff.toString(),
          g1: solveRes.g1.toString(),
          g2: solveRes.g2.toString(),
          factor1: sorted[0].toString(),
          factor2: sorted[1].toString(),
          duration
        });

        return {
          factor: sorted[0],
          factor2: sorted[1],
          method: 'HGS SIQS (32KB-Tiled + Piecewise + SQUFOF + markowitz-core)',
          steps: totalPolys * 180,
          duration,
          tree
        };
      }

      targetRelations = lpPool.fullCount + 8;
    }

    return {
      factor: null,
      factor2: null,
      method: 'HGS SIQS Exhausted',
      steps: totalPolys * 180,
      duration: Date.now() - startTime
    };
  };

  let isPaused = false;
  let pauseStartedAt = 0;
  let totalPausedMs = 0;
  let activeWorkerId = 0;
  const pauseWaiters = [];
  const waitIfPaused = async () => {
    while (isPaused) {
      await new Promise(res => { pauseWaiters.push(res); });
    }
  };

  self.onmessage = async (e) => {
    const {
      type,
      cmd,
      n,
      unifiedGf2 = false,
      sharedCoordinator = false,
      targetM = null,
      workerId = 0,
      hgsRank = 0,
      hgsTotalWorkers = 1,
      seedOffset = 0,
      fbPrimes = [],
      fbRoots = [],
      largePrimeBound = 1000000,
      sieveMode = 'v4-fallback',
      sieveWeights = null
    } = e.data || {};

    if (type === 'pause' || cmd === 'pause') {
      if (!isPaused) {
        isPaused = true;
        pauseStartedAt = Date.now();
        self.postMessage({ type: 'worker_pause_ack', workerId: activeWorkerId, paused: true });
      }
      return;
    }

    if (type === 'resume' || cmd === 'resume') {
      if (isPaused) {
        isPaused = false;
        if (pauseStartedAt > 0) {
          totalPausedMs += Math.max(0, Date.now() - pauseStartedAt);
          pauseStartedAt = 0;
        }
        while (pauseWaiters.length > 0) {
          const resolve = pauseWaiters.shift();
          if (resolve) resolve();
        }
        self.postMessage({ type: 'worker_pause_ack', workerId: activeWorkerId, paused: false });
      }
      return;
    }

    if (type === 'start') {
      activeWorkerId = workerId;
      isPaused = false;
      pauseStartedAt = 0;
      totalPausedMs = 0;
      try {
        const N = BigInt(n);
        if ((unifiedGf2 || sharedCoordinator) && fbPrimes && fbPrimes.length >= 6) {
          const M = targetM ? BigInt(targetM) : N;
          const res = await runHgsStreamLoop(
            N,
            M,
            workerId,
            hgsRank,
            hgsTotalWorkers,
            seedOffset,
            fbPrimes,
            fbRoots,
            largePrimeBound,
            sieveMode,
            sieveWeights
          );
          if (res && res.factor) {
            self.postMessage({
              type: 'result',
              success: true,
              workerId,
              factor: res.factor.toString(),
              factor1: res.factors[0],
              factor2: res.factors[1] || res.factors[0],
              factors: res.factors,
              allFactors: res.factors,
              method: res.method,
              steps: res.steps,
              tree: res.tree
            });
          }
          return;
        }

        const res = await runHgsStandalone(N, sieveMode, sieveWeights);
        if (res && res.factor) {
          self.postMessage({
            type: 'result',
            success: true,
            workerId,
            factor: res.factor.toString(),
            factor1: res.factor.toString(),
            factor2: res.factor2 ? res.factor2.toString() : (N / res.factor).toString(),
            factors: [res.factor.toString(), res.factor2 ? res.factor2.toString() : (N / res.factor).toString()],
            method: res.method,
            steps: res.steps,
            duration: res.duration || 0,
            tree: res.tree
          });
        } else {
          self.postMessage({
            type: 'result',
            success: false,
            workerId,
            factor1: null,
            factor2: null,
            method: res ? res.method : 'Failed',
            steps: res ? res.steps : 0
          });
        }
      } catch (err) {
        self.postMessage({ type: 'error', workerId, message: err.message });
      }
    }
  };
`;
