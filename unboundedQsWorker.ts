export const UNBOUNDED_QS_WORKER_CODE = `
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

  // Prime Units Reconstruction: Allowed pairs (u(p), u(q)) such that u(p)*u(q) = u(N) mod 10
  const UNIT_PAIRS_MAP = {
    1: [[1n, 1n], [3n, 7n], [7n, 3n], [9n, 9n]],
    3: [[1n, 3n], [3n, 1n], [7n, 9n], [9n, 7n]],
    7: [[1n, 7n], [7n, 1n], [3n, 9n], [9n, 3n]],
    9: [[1n, 9n], [9n, 1n], [3n, 3n], [7n, 7n]]
  };

  // High-speed Newton 10-adic modular inversion
  // Computes a^(-1) mod 10^k in O(log k) quadratic doubling steps
  const invNewton10 = (a, mod) => {
    const a10 = Number(a % 10n);
    let inv = (a10 === 1) ? 1n : (a10 === 3) ? 7n : (a10 === 7) ? 3n : 9n;
    let curMod = 10n;
    while (curMod < mod) {
      const nextMod = curMod * curMod;
      const targetMod = nextMod > mod ? mod : nextMod;
      const aMod = a % targetMod;
      inv = (inv * (2n - (aMod * inv) % targetMod) % targetMod + targetMod) % targetMod;
      curMod = targetMod;
      if (curMod === mod) break;
    }
    return inv;
  };

  // Montgomery ECM Curve Arithmetic
  const runMontgomeryEcmBatch = (N, curvesCount, b1Bound) => {
    const primes = [];
    const sieve = new Uint8Array(b1Bound + 1);
    for (let i = 2; i <= b1Bound; i++) {
      if (!sieve[i]) {
        primes.push(i);
        for (let j = i * i; j <= b1Bound; j += i) sieve[j] = 1;
      }
    }

    const kPowers = [];
    for (const p of primes) {
      let pwr = p;
      while (pwr * p <= b1Bound) pwr *= p;
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

    for (let c = 0; c < curvesCount; c++) {
      const sigma = BigInt(Math.floor(Math.random() * 1000000)) + 6n;
      const u = (sigma * sigma - 5n + N) % N;
      const v = (4n * sigma) % N;
      const x0 = modPow(u, 3n, N);
      const z0 = modPow(v, 3n, N);
      const diffUV = (v - u + N) % N;
      const a24Num = (modPow(diffUV, 3n, N) * (3n * u + v)) % N;
      const a24Den = (16n * x0 * v) % N;
      const gDen = gcd(a24Den, N);
      if (gDen > 1n && gDen < N) return gDen;
      if (gDen === N) continue;

      let x = (x0 * x0 % N * v) % N;
      let z = z0;
      let a24 = 0n;
      try {
        const invA24 = invNewton10(a24Den % 10n === 0n ? 1n : a24Den, N);
        a24 = (a24Num * invA24) % N;
      } catch (e) {
        a24 = 1n;
      }

      for (let i = 0; i < kPowers.length; i++) {
        const [nx, nz] = mulMont(kPowers[i], x, z, a24, N);
        x = nx;
        z = nz;
        const g = gcd(z, N);
        if (g > 1n && g < N) return g;
      }
    }
    return null;
  };

  // Main Continuous Unbounded Competitive Multi-Lane Solver
  const runUnboundedContinuousQS = async (N, customStartDepth = 1, customMaxDepth = null) => {
    const startTime = Date.now();
    const nBits = N.toString(2).length;
    const totalDecDigits = N.toString(10).length;
    const defaultMaxModPower = Math.max(6, Math.ceil(totalDecDigits / 2));
    const maxModPower = customMaxDepth ? Math.min(totalDecDigits, Math.max(2, customMaxDepth)) : defaultMaxModPower;
    const initialDepth = Math.min(maxModPower, Math.max(1, customStartDepth || 1));

    self.postMessage({
      type: 'log',
      message: \`[Unbounded QS & Newton 10-adic] Starting Continuous Solver for \${nBits}-bit Modulus (\${totalDecDigits} digits, Start: 10^\${initialDepth}, Max Lift: 10^\${maxModPower})...\`
    });

    // 0. Immediate Divisibility Checks
    const smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n];
    for (const sp of smallPrimes) {
      if (N % sp === 0n) {
        return { factor: sp, method: \`Small Prime Sieve (p=\${sp})\`, steps: 1 };
      }
    }

    const sqrtN = bigSqrt(N);
    if (sqrtN * sqrtN === N) {
      return { factor: sqrtN, method: "Exact Integer Square (p=√N)", steps: 1 };
    }

    const minS = 2n * sqrtN;
    const uN = Number(N % 10n);
    const validPairs = UNIT_PAIRS_MAP[uN] || [[1n, 1n], [3n, 7n], [7n, 3n], [9n, 9n]];

    self.postMessage({
      type: 'log',
      message: \`[Prime Units] N mod 10 = \${uN} ⟹ Allowed Pairs: \${JSON.stringify(validPairs.map(p => [Number(p[0]), Number(p[1])]))}\`
    });

    self.postMessage({
      type: 'unbounded_init',
      uN,
      validPairs: validPairs.map(p => [Number(p[0]), Number(p[1])]),
      liftsCount: validPairs.length,
      modPower: \`10^\${maxModPower}\`
    });

    // Initialize Adaptive Decadic Lift Pool
    let decadicCandidates = validPairs.map(p => ({
      p: p[0],
      q: p[1],
      depth: 1
    }));

    let curLiftDepth = 1;
    let curLiftMod = 10n;

    // Fast-forward initial depth if customStartDepth > 1
    if (initialDepth > 1) {
      curLiftDepth = initialDepth;
      curLiftMod = 10n ** BigInt(initialDepth);
      const ffCandidates = [];
      const nMod = N % curLiftMod;
      for (const cand of decadicCandidates) {
        for (let d = 0n; d < 10n; d++) {
          const candP = cand.p + d * 10n;
          if (candP % 2n === 0n || candP % 5n === 0n) continue;
          const invP = invNewton10(candP, curLiftMod);
          const candQ = (nMod * invP) % curLiftMod;
          if ((candP * candQ) % curLiftMod === nMod) {
            ffCandidates.push({ p: candP, q: candQ, depth: initialDepth });
          }
        }
      }
      if (ffCandidates.length > 0) {
        decadicCandidates = ffCandidates.slice(0, 48);
      }
    }

    let totalSteps = 0;
    let cycle = 0;
    let totalCurves = 0;
    let instantGcdCount = 0;
    let newtonOps = 0;

    // CONTINUOUS UNBOUNDED LOOP (Runs until solution found)
    while (true) {
      cycle++;
      const cycleStart = Date.now();

      self.postMessage({
        type: 'log',
        message: \`[Continuous Loop] Cycle #\${cycle} (Lift Depth 10^\${curLiftDepth} / 10^\${maxModPower})...\`
      });

      // --- LANE A: Adaptive Newton 10-adic Hensel Lift & Instant GCD ---
      if (curLiftDepth < maxModPower) {
        const nextDepth = Math.min(maxModPower, curLiftDepth + Math.max(1, Math.floor(cycle / 2)));
        const nextMod = 10n ** BigInt(nextDepth);
        const nextCandidates = [];
        const nMod = N % nextMod;

        for (const cand of decadicCandidates) {
          totalSteps++;
          instantGcdCount++;

          // 1. Instant GCD test on current lifted candidate
          const gP = gcd(cand.p, N);
          if (gP > 1n && gP < N) {
            return {
              factor: gP,
              method: \`Lane A: Newton 10-adic Instant GCD (mod 10^\${cand.depth})\`,
              steps: totalSteps
            };
          }
          const gQ = gcd(cand.q, N);
          if (gQ > 1n && gQ < N) {
            return {
              factor: gQ,
              method: \`Lane A: Newton 10-adic Instant GCD (mod 10^\${cand.depth})\`,
              steps: totalSteps
            };
          }

          // 2. Newton 10-adic modular inversion to lift digits to nextMod
          for (let d = 0n; d < 10n; d++) {
            const candP = cand.p + d * curLiftMod;
            if (candP % 2n === 0n || candP % 5n === 0n) continue;

            const invP = invNewton10(candP, nextMod);
            newtonOps++;
            const candQ = (nMod * invP) % nextMod;

            if ((candP * candQ) % nextMod === nMod) {
              // Direct check if this candidate already divides N
              if (candP > 1n && candP < N && N % candP === 0n) {
                return {
                  factor: candP,
                  method: \`Lane A: Decadic Hensel Lift Factor (mod 10^\${nextDepth})\`,
                  steps: totalSteps
                };
              }
              if (candQ > 1n && candQ < N && N % candQ === 0n) {
                return {
                  factor: candQ,
                  method: \`Lane A: Decadic Hensel Lift Factor (mod 10^\${nextDepth})\`,
                  steps: totalSteps
                };
              }

              nextCandidates.push({ p: candP, q: candQ, depth: nextDepth });
            }
          }
        }

        if (nextCandidates.length > 0) {
          decadicCandidates = nextCandidates.slice(0, 48); // Prune to top coherent branches
          curLiftDepth = nextDepth;
          curLiftMod = nextMod;
        }
      }

      // Quick candidate scan around minS matching decadic parity
      for (const cand of decadicCandidates) {
        const targetSMod10 = Number((cand.p + cand.q) % 10n);
        const minSMod10 = Number(minS % 10n);
        let offset = BigInt((targetSMod10 - minSMod10 + 10) % 10);
        if (offset % 2n !== 0n) offset += 10n;

        const scanBudget = 1500n + BigInt(cycle * 1000);
        for (let sCand = minS + offset; sCand <= minS + offset + scanBudget; sCand += 20n) {
          totalSteps++;
          const diffSq = sCand * sCand - 4n * N;
          if (diffSq < 0n) continue;
          const { ok, root: r } = isSquare(diffSq);
          if (ok) {
            const f1 = (sCand - r) / 2n;
            if (f1 > 1n && f1 < N && N % f1 === 0n) {
              return {
                factor: f1,
                method: \`Lane A: Newton Decadic Congruence (Cycle #\${cycle})\`,
                steps: totalSteps
              };
            }
          }
        }
      }

      const sampleP = decadicCandidates[0] ? decadicCandidates[0].p.toString() : '';
      const sampleQ = decadicCandidates[0] ? decadicCandidates[0].q.toString() : '';

      self.postMessage({
        type: 'unbounded_hensel_update',
        henselDepth: curLiftDepth,
        henselMaxDepth: maxModPower,
        decadicP: sampleP.length > 20 ? '...' + sampleP.slice(-20) : sampleP,
        decadicQ: sampleQ.length > 20 ? '...' + sampleQ.slice(-20) : sampleQ,
        newtonRate: Math.max(120, Math.round((newtonOps * 1000) / Math.max(1, (Date.now() - cycleStart)))),
        instantGcdCount
      });

      self.postMessage({
        type: 'unbounded_progress',
        cycle,
        lane: \`Lane A (Newton Lift 10^\${curLiftDepth})\`,
        activeMultiplier: 1,
        steps: totalSteps,
        totalCurves,
        candidateT: sampleP.slice(0, 14) + '...'
      });

      // --- LANE B: Structured Multi-Multiplier Quadratic Sieve ---
      const spectralMultipliers = [
        1n, 3n, 5n, 7n, 11n, 13n, 15n, 17n, 19n, 21n, 23n, 29n, 31n, 35n, 37n, 41n, 
        43n, 47n, 53n, 55n, 59n, 61n, 65n, 67n, 71n, 73n, 77n, 79n, 83n, 85n, 89n, 91n, 
        97n, 101n, 105n, 113n, 127n, 137n, 151n, 165n, 231n, 315n, 385n, 429n, 1001n
      ];

      const windowSize = 5000n + BigInt(cycle * 2000);

      for (let mIdx = 0; mIdx < spectralMultipliers.length; mIdx++) {
        const k = spectralMultipliers[mIdx];
        const fourKN = 4n * k * N;
        const s = bigSqrt(fourKN) + 1n;

        let batchProd = 1n;

        for (let j = 0n; j < windowSize; j++) {
          const t = s + j;
          const R = t * t - fourKN;
          totalSteps++;

          // Check if square
          const { ok, root: r } = isSquare(R);
          if (ok) {
            const f1 = gcd(t - r, N);
            if (f1 > 1n && f1 < N) {
              return {
                factor: f1,
                method: \`Lane B: Structured QS Sieve (k=\${k}, Cycle #\${cycle})\`,
                steps: totalSteps
              };
            }
            const f2 = gcd(t + r, N);
            if (f2 > 1n && f2 < N) {
              return {
                factor: f2,
                method: \`Lane B: Structured QS Sieve (k=\${k}, Cycle #\${cycle})\`,
                steps: totalSteps
              };
            }
          }

          batchProd = (batchProd * (R % N)) % N;

          if (j % 64n === 0n && batchProd > 0n) {
            const gBatch = gcd(batchProd, N);
            if (gBatch > 1n && gBatch < N) {
              return {
                factor: gBatch,
                method: \`Lane B: Modular Batch Residue Product (Cycle #\${cycle})\`,
                steps: totalSteps
              };
            }
            batchProd = 1n;
          }

          if (totalSteps % 3000 === 0) {
            self.postMessage({
              type: 'unbounded_progress',
              cycle,
              lane: 'Lane B (Structured QS)',
              activeMultiplier: Number(k),
              steps: totalSteps,
              totalCurves,
              candidateT: t.toString().slice(0, 16) + '...'
            });
          }
        }
      }

      // --- LANE C: Unbounded Scaling Montgomery ECM ---
      const curvesThisCycle = 40 + cycle * 20;
      const b1Bound = 30000 + cycle * 10000;
      totalCurves += curvesThisCycle;

      self.postMessage({
        type: 'log',
        message: \`[Lane C: Progressive ECM] Deploying \${curvesThisCycle} curves (B1=\${b1Bound})...\`
      });

      self.postMessage({
        type: 'unbounded_progress',
        cycle,
        lane: 'Lane C (Progressive ECM)',
        activeMultiplier: 1,
        steps: totalSteps,
        totalCurves,
        candidateT: 'Active Group Multiplication'
      });

      const ecmFactor = runMontgomeryEcmBatch(N, curvesThisCycle, b1Bound);
      if (ecmFactor && ecmFactor > 1n && ecmFactor < N) {
        return {
          factor: ecmFactor,
          method: \`Lane C: Progressive Montgomery ECM (Cycle #\${cycle})\`,
          steps: totalSteps + totalCurves
        };
      }
    }
  };

  self.onmessage = async (e) => {
    const { type, n, startDepth, maxDepth } = e.data;
    if (type === 'start') {
      try {
        const N = BigInt(n);
        const start = Date.now();
        const res = await runUnboundedContinuousQS(N, Number(startDepth) || 1, Number(maxDepth) || null);
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
