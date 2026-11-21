export const GLEEOK_MMFR_WORKER_CODE = `
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

  class PRNG {
    constructor(seed) {
      this.state = seed >>> 0;
    }
    next() {
      this.state = (this.state * 1664525 + 1013904223) >>> 0;
      return this.state / 4294967296;
    }
  }

  // Phase 1: Gleeok Structural Fingerprint & Multiplier Prioritization with seed mutation
  const computeGleeokFingerprint = (N, nBits, attemptOffset = 0) => {
    const baseSeed = Number(N % 4294967296n) + (attemptOffset * 31337);
    const perms = [];
    
    for (let i = 0; i < nBits; i++) {
      const rng = new PRNG(baseSeed ^ (i * 7919 + attemptOffset));
      const p = Array.from({ length: nBits }, (_, j) => j);
      for (let j = nBits - 1; j > 0; j--) {
        const k = Math.floor(rng.next() * (j + 1));
        [p[j], p[k]] = [p[k], p[j]];
      }
      perms.push(p);

      if (i === 0 && attemptOffset === 0) {
        self.postMessage({
          type: 'hybrid_perm_progress',
          round: i + 1,
          total: nBits
        });
      }
    }

    const nStr = N.toString(2).padStart(nBits, '0');
    let onesCount = 0;
    for (let i = 0; i < nBits; i++) {
      if (nStr[i] === '1') onesCount++;
    }
    const bitDensity = onesCount / nBits;

    let transitions = 0;
    for (let i = 0; i < nBits - 1; i++) {
      if (nStr[i] !== nStr[i + 1]) transitions++;
    }
    const entropy = transitions / (nBits - 1);
    const stability = Math.max(0.1, 1 - Math.abs(bitDensity - 0.5) * 2);
    const convergence = (stability * 0.4) + (entropy * 0.6);
    const qualityIndex = (bitDensity * entropy * stability) * 10;

    // Expanded base multiplier pool with dynamic perturbation
    const baseMultipliers = [
      1n, 3n, 5n, 7n, 11n, 13n, 15n, 17n, 19n, 21n, 23n, 29n, 31n, 35n, 37n, 41n, 
      43n, 47n, 53n, 55n, 59n, 61n, 65n, 67n, 71n, 73n, 77n, 79n, 83n, 85n, 89n, 
      91n, 97n, 101n, 105n, 113n, 119n, 127n, 131n, 143n, 151n, 165n, 195n, 231n, 
      315n, 385n, 429n, 511n, 715n, 1001n, BigInt(11 + attemptOffset * 7), BigInt(37 + attemptOffset * 13)
    ];

    const prioritizedMultipliers = baseMultipliers.map((k, idx) => {
      const kSeed = Number((k + BigInt(attemptOffset)) * 2654435761n % 1000n) / 1000;
      const modRes = Number((4n * k * N) % 64n);
      const isResidueGood = MOD64_LOOKUP[modRes] ? 1.8 : 0.7;
      const priority = (kSeed * 0.4 + entropy * 0.3 + stability * 0.3 + (idx % 3) * 0.1) * isResidueGood;
      return { k, priority };
    }).sort((a, b) => b.priority - a.priority);

    return {
      bitDensity,
      entropy,
      stability,
      convergence,
      qualityIndex,
      prioritizedMultipliers
    };
  };

  // Phase 3: Projective Montgomery Curve Arithmetic with adaptive batching
  const runPrioritizedEcm = (N, maxCurves = 70, attemptOffset = 0) => {
    const B1 = 25000 + attemptOffset * 5000;
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

    let curveAdds = 0;
    let modMuls = 0;

    for (let c = 0; c < maxCurves; c++) {
      const sigma = BigInt(Math.floor(Math.random() * 999999) + 6 + attemptOffset * 1000);
      const u = (sigma * sigma - 5n + N) % N;
      const v = (4n * sigma) % N;
      const x0 = modPow(u, 3n, N);
      const z0 = modPow(v, 3n, N);
      const diffUV = (v - u + N) % N;
      const a24Num = (modPow(diffUV, 3n, N) * (3n * u + v)) % N;
      const a24Den = (16n * x0 * v) % N;
      const gDen = gcd(a24Den, N);
      if (gDen > 1n && gDen < N) return { factor: gDen, curveAdds, modMuls };

      let curX = x0, curZ = z0;
      for (let i = 0; i < kPowers.length; i++) {
        const [nx, nz] = mulMont(kPowers[i], curX, curZ, a24Num, N);
        curX = nx;
        curZ = nz;
        curveAdds += 2;
        modMuls += 12;

        if (i % 180 === 0) {
          const g = gcd(curZ, N);
          if (g > 1n && g < N) return { factor: g, curveAdds, modMuls };
        }
      }

      const g = gcd(curZ, N);
      if (g > 1n && g < N) return { factor: g, curveAdds, modMuls };

      self.postMessage({
        type: 'hybrid_curve_progress',
        curveIndex: c + 1,
        totalCurves: maxCurves,
        curveAdds,
        modMuls,
        priority: (1 - (c / maxCurves)).toFixed(4)
      });
    }
    return null;
  };

  // Smart Automatic Retry Loop with Seed Mutation & Adaptive Expansion
  const runGleeokMmfrHybridWithAutoRetry = async (N) => {
    const nBits = N.toString(2).length;
    const MAX_ATTEMPTS = 6;

    if (N % 2n === 0n) return { factor: 2n, method: "Trivial (p=2)", steps: 1 };
    if (N % 3n === 0n) return { factor: 3n, method: "Trivial (p=3)", steps: 1 };
    if (N % 5n === 0n) return { factor: 5n, method: "Trivial (p=5)", steps: 1 };
    if (N % 7n === 0n) return { factor: 7n, method: "Trivial (p=7)", steps: 1 };

    const sqrtN = bigSqrt(N);
    if (sqrtN * sqrtN === N) {
      return { factor: sqrtN, method: "Exact Square (p=√N)", steps: 1 };
    }

    let cumulativeSteps = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      self.postMessage({
        type: 'log',
        message: \`[Gleeok-MMFR] Auto-Retry Attempt \${attempt + 1}/\${MAX_ATTEMPTS} (Seed Mutation & Adaptive Scan)...\`
      });

      // Phase 1: Fingerprint with attempt seed mutation
      const fingerprint = computeGleeokFingerprint(N, nBits, attempt);

      if (attempt === 0) {
        self.postMessage({
          type: 'hybrid_fingerprint',
          featureSize: nBits,
          entropy: fingerprint.entropy,
          stability: fingerprint.stability,
          bitDensity: fingerprint.bitDensity,
          convergence: fingerprint.convergence,
          qualityIndex: fingerprint.qualityIndex,
          prioritizedCount: fingerprint.prioritizedMultipliers.length
        });
      }

      // Phase 2: Guided Spectral Sieve with expanding window per attempt
      const topMultipliers = fingerprint.prioritizedMultipliers;
      const windowSize = 3500n + BigInt(attempt * 1500);

      for (let mIdx = 0; mIdx < topMultipliers.length; mIdx++) {
        const { k, priority } = topMultipliers[mIdx];
        const fourKN = 4n * k * N;
        const s = bigSqrt(fourKN) + 1n;

        let batchProd = 1n;

        for (let j = 0n; j < windowSize; j++) {
          const t = s + j;
          const R = t * t - fourKN;
          cumulativeSteps++;

          const { ok, root: r } = isSquare(R);
          if (ok) {
            const f1 = gcd(t - r, N);
            if (f1 > 1n && f1 < N) {
              return {
                factor: f1,
                method: \`Gleeok-MMFR Hybrid (Attempt \${attempt + 1}, k=\${k})\`,
                steps: cumulativeSteps
              };
            }
            const f2 = gcd(t + r, N);
            if (f2 > 1n && f2 < N) {
              return {
                factor: f2,
                method: \`Gleeok-MMFR Hybrid (Attempt \${attempt + 1}, k=\${k})\`,
                steps: cumulativeSteps
              };
            }
          }

          batchProd = (batchProd * (R % N)) % N;

          if (j % 64n === 0n && batchProd > 0n) {
            const gBatch = gcd(batchProd, N);
            if (gBatch > 1n && gBatch < N) {
              return {
                factor: gBatch,
                method: \`Gleeok Congruence Batch (Attempt \${attempt + 1}, k=\${k})\`,
                steps: cumulativeSteps
              };
            }
            batchProd = 1n;
          }

          if (cumulativeSteps % 1200 === 0) {
            self.postMessage({
              type: 'hybrid_trace',
              multiplier: Number(k),
              kPriority: priority,
              steps: cumulativeSteps,
              currentT: t.toString().slice(0, 16) + '...',
              modResidue: (R % 64n).toString(),
              isCandidateSquare: ok
            });
          }
        }
      }

      // Phase 3: Projective Montgomery ECM with adaptive curve count per attempt
      self.postMessage({
        type: 'log',
        message: \`[Phase 3 - Attempt \{attempt + 1}] Deploying Expanded Montgomery Hyper-Curves...\`
      });

      const curvesCount = 60 + attempt * 25; // Expands from 60 to 185 curves across attempts
      const ecmResult = runPrioritizedEcm(N, curvesCount, attempt);
      if (ecmResult && ecmResult.factor > 1n && ecmResult.factor < N) {
        return {
          factor: ecmResult.factor,
          method: \`Gleeok-Montgomery ECM (Attempt \${attempt + 1})\`,
          steps: cumulativeSteps + ecmResult.curveAdds
        };
      }
    }

    return null;
  };

  self.onmessage = async (e) => {
    const { type, n } = e.data;
    if (type === 'start') {
      try {
        const N = BigInt(n);
        const start = Date.now();
        const res = await runGleeokMmfrHybridWithAutoRetry(N);
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
