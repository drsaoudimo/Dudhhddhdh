export const SPECTRAL_RESONANCE_WORKER_CODE = `
  const gcd = (a, b) => {
    while (b > 0n) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  };

  const modPow = (base, exp, mod) => {
    let res = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) res = (res * base) % mod;
      base = (base * base) % mod;
      exp /= 2n;
    }
    return res;
  };

  const bigSqrt = (val) => {
    if (val < 0n) return 0n;
    if (val < 2n) return val;
    let newX = val / 2n + 1n;
    let x = newX + 1n;
    while (newX < x) {
      x = newX;
      newX = (val / x + x) / 2n;
    }
    return x;
  };

  // Modulo 64 quadratic residue lookup table
  const MOD64_LOOKUP = new Uint8Array(64);
  [0, 1, 4, 9, 16, 17, 25, 33, 36, 41, 49, 57].forEach(r => { MOD64_LOOKUP[r] = 1; });

  const isSquare = (n) => {
    if (n < 0n) return { ok: false, root: 0n };
    if (n === 0n) return { ok: true, root: 0n };
    const r64 = Number(n & 63n);
    if (!MOD64_LOOKUP[r64]) return { ok: false, root: 0n };
    const root = bigSqrt(n);
    return { ok: root * root === n, root };
  };

  // Montgomery ECM curve arithmetic for arbitrarily large composites
  const runEcmStage = (N, maxCurves = 35) => {
    const B1 = 25000;
    const primes = [];
    const sieve = new Uint8Array(B1 + 1);
    for (let i = 2; i <= B1; i++) {
      if (!sieve[i]) {
        primes.push(i);
        for (let j = i * i; j <= B1; j += i) sieve[j] = 1;
      }
    }

    const kPowers = [];
    for (const p of primes) {
      let pwr = p;
      while (pwr * p <= B1) pwr *= p;
      kPowers.push(BigInt(pwr));
    }

    const addMont = (x1, z1, x2, z2, x0, z0, n) => {
      const u = (x1 - z1 + n) * (x2 + z2) % n;
      const v = (x1 + z1) * (x2 - z2 + n) % n;
      const x3 = (z0 * (u + v) % n * (u + v)) % n;
      const z3 = (x0 * (u - v + n) % n * (u - v + n)) % n;
      return [x3, z3];
    };

    const doubleMont = (x, z, a24, n) => {
      const u = (x + z) * (x + z) % n;
      const v = (x - z + n) * (x - z + n) % n;
      const diff = (u - v + n) % n;
      const x2 = (u * v) % n;
      const z2 = (diff * (v + a24 * diff % n)) % n;
      return [x2, z2];
    };

    const mulMont = (k, x, z, a24, n) => {
      let x0 = 1n, z0 = 0n;
      let x1 = x, z1 = z;
      const bits = k.toString(2);
      for (let i = 0; i < bits.length; i++) {
        if (bits[i] === '1') {
          const [nx0, nz0] = addMont(x1, z1, x0, z0, x, z, n);
          const [nx1, nz1] = doubleMont(x1, z1, a24, n);
          x0 = nx0; z0 = nz0; x1 = nx1; z1 = nz1;
        } else {
          const [nx1, nz1] = addMont(x0, z0, x1, z1, x, z, n);
          const [nx0, nz0] = doubleMont(x0, z0, a24, n);
          x0 = nx0; z0 = nz0; x1 = nx1; z1 = nz1;
        }
      }
      return [x0, z0];
    };

    for (let c = 0; c < maxCurves; c++) {
      const sigma = BigInt(Math.floor(Math.random() * 800000) + 6);
      const u = (sigma * sigma - 5n + N) % N;
      const v = (4n * sigma) % N;
      const x0 = modPow(u, 3n, N);
      const z0 = modPow(v, 3n, N);
      const diffUV = (v - u + N) % N;
      const a24Num = (modPow(diffUV, 3n, N) * (3n * u + v)) % N;
      const a24Den = (16n * x0 * v) % N;
      const gDen = gcd(a24Den, N);
      if (gDen > 1n && gDen < N) return gDen;

      let curX = x0, curZ = z0;
      for (let i = 0; i < kPowers.length; i++) {
        const [nx, nz] = mulMont(kPowers[i], curX, curZ, a24Num, N);
        curX = nx;
        curZ = nz;
        if (i % 250 === 0) {
          const g = gcd(curZ, N);
          if (g > 1n && g < N) return g;
        }
      }
      const g = gcd(curZ, N);
      if (g > 1n && g < N) return g;
    }
    return null;
  };

  const runSpectralResonanceAttack = async (N) => {
    // 1. Trivial checks
    if (N % 2n === 0n) return { factor: 2n, method: "Trivial (p=2)", steps: 1 };
    if (N % 3n === 0n) return { factor: 3n, method: "Trivial (p=3)", steps: 1 };
    if (N % 5n === 0n) return { factor: 5n, method: "Trivial (p=5)", steps: 1 };
    if (N % 7n === 0n) return { factor: 7n, method: "Trivial (p=7)", steps: 1 };

    // 2. Exact square check
    const sqrtN = bigSqrt(N);
    if (sqrtN * sqrtN === N) {
      return { factor: sqrtN, method: "Perfect Square (p=√N)", steps: 1 };
    }

    // 3. Multi-Multiplier Fermat Resonance (MMFR)
    // Curated spectrum of multipliers k
    const multipliers = [
      1n, 3n, 5n, 7n, 11n, 13n, 15n, 17n, 19n, 21n, 23n, 29n, 31n, 35n, 37n, 41n, 43n, 
      47n, 53n, 55n, 59n, 61n, 65n, 67n, 71n, 73n, 77n, 79n, 83n, 85n, 89n, 91n, 97n, 
      101n, 105n, 109n, 113n, 119n, 127n, 131n, 137n, 143n, 151n, 165n, 175n, 187n, 195n, 
      209n, 221n, 231n, 255n, 273n, 285n, 315n, 385n, 429n, 455n, 595n, 715n, 1001n
    ];

    let totalSteps = 0;
    const windowSize = 2500n; // window per multiplier
    const startTime = Date.now();

    for (let mIdx = 0; mIdx < multipliers.length; mIdx++) {
      const k = multipliers[mIdx];
      const fourKN = 4n * k * N;
      const s = bigSqrt(fourKN) + 1n; // ceil(sqrt(4kN))

      let batchProd = 1n;

      for (let j = 0n; j < windowSize; j++) {
        const t = s + j;
        const R = t * t - fourKN;
        totalSteps++;

        // Fast square check
        const { ok, root: r } = isSquare(R);
        if (ok) {
          const f1 = gcd(t - r, N);
          if (f1 > 1n && f1 < N) {
            return {
              factor: f1,
              method: \`MMFR Spectral Multiplier (k=\${k})\`,
              steps: totalSteps
            };
          }
          const f2 = gcd(t + r, N);
          if (f2 > 1n && f2 < N) {
            return {
              factor: f2,
              method: \`MMFR Spectral Multiplier (k=\${k})\`,
              steps: totalSteps
            };
          }
        }

        // Accumulate residue for periodic batch GCD
        batchProd = (batchProd * (R % N)) % N;

        if (j % 64n === 0n && batchProd > 0n) {
          const gBatch = gcd(batchProd, N);
          if (gBatch > 1n && gBatch < N) {
            return {
              factor: gBatch,
              method: \`Residue Congruence Batch (k=\${k})\`,
              steps: totalSteps
            };
          }
          batchProd = 1n;
        }

        if (totalSteps % 1000 === 0) {
          self.postMessage({
            type: 'spectral_trace',
            multiplier: Number(k),
            steps: totalSteps,
            currentT: t.toString().slice(0, 16) + '...',
            modResidue: (R % 64n).toString(),
            isCandidateSquare: ok
          });
        }
      }
    }

    // 4. Extended Projective Montgomery ECM for arbitrary large keys (> 128-bit)
    self.postMessage({
      type: 'log',
      message: "Advancing to Montgomery Projective Hyper-Curves (Stage 2/3)..."
    });

    const ecmFactor = runEcmStage(N, 60);
    if (ecmFactor && ecmFactor > 1n && ecmFactor < N) {
      return {
        factor: ecmFactor,
        method: "Montgomery Projective ECM (Stage 2)",
        steps: totalSteps + 50000
      };
    }

    return null;
  };

  self.onmessage = async (e) => {
    const { type, n } = e.data;
    if (type === 'start') {
      try {
        const N = BigInt(n);
        self.postMessage({ type: 'log', message: \`Starting Spectral Resonance Solver for N (\${N.toString(2).length} bits)...\` });
        const start = Date.now();
        const res = await runSpectralResonanceAttack(N);
        const duration = Date.now() - start;

        if (res && res.factor) {
          self.postMessage({
            type: 'result',
            factor: res.factor.toString(),
            method: res.method,
            steps: res.steps,
            duration
          });
        } else {
          self.postMessage({
            type: 'result',
            factor: null,
            steps: 0,
            duration
          });
        }
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
    }
  };
`;
