import { getWorkerMontRedcCode } from './lib/montgomeryRedcKernel';

export const CFRAC_WORKER_CODE = getWorkerMontRedcCode() + `
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
    if (val <= 0n) return 0n;
    if (val < 2n) return val;
    let x = 1n << BigInt((val.toString(2).length + 1) >> 1);
    while (true) {
      const next = (x + val / x) >> 1n;
      if (next >= x) return x;
      x = next;
    }
  };

  const isProbablePrime = (n, k = 5) => {
    if (n === 2n || n === 3n) return true;
    if (n < 2n || (n & 1n) === 0n) return false;
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }
    const bases = n < 4759123141n ? [2n, 7n, 61n] : [2n, 3n, 5n, 7n, 11n, 13n];
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

  const isSquareBig = (val) => {
    if (val < 0n) return null;
    if (val === 0n) return 0n;
    const r = Number(val & 63n);
    if (r !== 0 && r !== 1 && r !== 4 && r !== 9 && r !== 16 && r !== 17 &&
        r !== 25 && r !== 33 && r !== 36 && r !== 41 && r !== 49 && r !== 57) {
      return null;
    }
    const s = bigSqrt(val);
    return s * s === val ? s : null;
  };

  // Count trailing zero bits of positive BigInt without % 2n loop
  const countTrailingZerosBig = (v) => {
    let tz = 0;
    let cur = v;
    while ((cur & 0xffffffffn) === 0n) {
      tz += 32;
      cur >>= 32n;
    }
    let low = Number(cur & 0xffffffffn);
    while ((low & 1) === 0) {
      tz++;
      low >>>= 1;
    }
    return tz;
  };

  // Fast pure-Float64 Pollard-Brent splitter for 2-Large-Prime leftovers (n <= 9e15, fits exact 53-bit integer)
  const split2LPNum = (nNum) => {
    if (nNum <= 3 || (nNum & 1) === 0) return nNum === 2 ? 0 : 2;
    const nBig = BigInt(nNum);
    for (const cVal of [1n, 3n, 5n]) {
      let y = 2n, c = cVal, m = 32;
      let g = 1n, r = 1, q = 1n, x = 2n, ys = 2n, steps = 0;
      while (g === 1n && steps < 420) {
        x = y;
        for (let i = 0; i < r; i++) y = (y * y + c) % nBig;
        let k = 0;
        while (k < r && g === 1n && steps < 420) {
          ys = y;
          const lim = Math.min(m, r - k);
          for (let i = 0; i < lim; i++) {
            y = (y * y + c) % nBig;
            const diff = x > y ? x - y : y - x;
            q = (q * diff) % nBig;
            steps++;
          }
          g = gcd(q, nBig);
          k += m;
        }
        r <<= 1;
      }
      if (g === nBig) {
        do {
          ys = (ys * ys + c) % nBig;
          const diff = x > ys ? x - ys : ys - x;
          g = gcd(diff, nBig);
        } while (g === 1n);
      }
      if (g > 1n && g < nBig) return Number(g);
    }
    return 0;
  };

  const MAX_SAFE_BIG = 9007199254740991n;
  const CHUNK_CAP = 2251799813685248; // 2^51 guarantees exact IEEE-754 modulo per chunk

  // Precompute 52-bit grouped divisor chunks and Montgomery-domain prime residues
  const prepareCfracChunks = (fbPrimes, fbGlobalIndices, montCtx, N) => {
    const hasTwo = fbPrimes.length > 0 && fbPrimes[0] === 2;
    const twoGlobalCol = hasTwo ? (fbGlobalIndices ? fbGlobalIndices[0] : 0) : -1;
    const twoModNM = montCtx ? montCtx.toMont(2n) : 2n;

    const oddStart = hasTwo ? 1 : 0;
    const chunks = [];
    let curPrimes = [];
    let curCols = [];
    let curModsNM = [];
    let curProd = 1;

    for (let i = oddStart; i < fbPrimes.length; i++) {
      const p = fbPrimes[i];
      const gCol = fbGlobalIndices ? fbGlobalIndices[i] : i;
      const pModNM = montCtx ? montCtx.toMont(BigInt(p)) : (BigInt(p) % N);

      if (curPrimes.length >= 5 || curProd * p > CHUNK_CAP) {
        chunks.push({
          prodNum: curProd,
          prodBig: BigInt(curProd),
          primes: curPrimes,
          cols: curCols,
          modsNM: curModsNM
        });
        curPrimes = [];
        curCols = [];
        curModsNM = [];
        curProd = 1;
      }
      curPrimes.push(p);
      curCols.push(gCol);
      curModsNM.push(pModNM);
      curProd *= p;
    }

    if (curPrimes.length > 0) {
      chunks.push({
        prodNum: curProd,
        prodBig: BigInt(curProd),
        primes: curPrimes,
        cols: curCols,
        modsNM: curModsNM
      });
    }

    const maxP = fbPrimes[fbPrimes.length - 1] || 2;
    return {
      hasTwo,
      twoGlobalCol,
      twoModNM,
      chunks,
      maxPSq: BigInt(maxP) * BigInt(maxP)
    };
  };

  const factorCfracResidueFast = (
    Q,
    X,
    signNeg,
    prep,
    montCtx,
    N,
    largePrimeBoundBig,
    twoLpCapBig
  ) => {
    let rem = Q;
    if (rem === 0n) {
      const g = gcd(X, N);
      if (g > 1n && g < N) return { directFactor: g };
      return null;
    }

    const sparseCols = [];
    let extraM = montCtx ? montCtx.oneM : 1n;

    // Step 1: O(1) bit-shift removal for p = 2
    if (prep.hasTwo && (rem & 1n) === 0n) {
      const tz = countTrailingZerosBig(rem);
      rem >>= BigInt(tz);
      if ((tz & 1) === 1) sparseCols.push(prep.twoGlobalCol);
      const half = tz >> 1;
      if (half > 0) {
        if (montCtx) {
          const twoPow = half === 1 ? prep.twoModNM : montCtx.montPow(prep.twoModNM, BigInt(half));
          extraM = montCtx.montMul(extraM, twoPow);
        } else {
          extraM = (extraM * modPow(2n, BigInt(half), N)) % N;
        }
      }
    }

    const chunks = prep.chunks;
    const chunkLen = chunks.length;
    let cIdx = 0;

    // Step 2: 52-bit grouped BigInt % chunk tests while rem > 2^53 - 1
    while (cIdx < chunkLen && rem > MAX_SAFE_BIG) {
      const ch = chunks[cIdx++];
      const modChunk = Number(rem % ch.prodBig);
      if (modChunk === 0 || gcdNum(modChunk, ch.prodNum) > 1) {
        const ps = ch.primes;
        const cols = ch.cols;
        const modsNM = ch.modsNM;
        for (let j = 0; j < ps.length; j++) {
          const p = ps[j];
          if (modChunk % p === 0) {
            const pBig = BigInt(p);
            let cnt = 0;
            do {
              rem /= pBig;
              cnt++;
            } while (rem % pBig === 0n);
            if ((cnt & 1) === 1) sparseCols.push(cols[j]);
            const half = cnt >> 1;
            if (half > 0) {
              if (montCtx) {
                const pPowM = half === 1 ? modsNM[j] : montCtx.montPow(modsNM[j], BigInt(half));
                extraM = montCtx.montMul(extraM, pPowM);
              } else {
                extraM = (extraM * modPow(pBig, BigInt(half), N)) % N;
              }
            }
            if (rem === 1n) break;
          }
        }
        if (rem === 1n) break;
      }
    }

    // Step 3: Instant drop into pure V8 Number arithmetic once rem <= 2^53 - 1 (zero BigInt ops!)
    if (rem > 1n && rem <= MAX_SAFE_BIG && cIdx < chunkLen) {
      let remN = Number(rem);
      for (; cIdx < chunkLen && remN > 1; cIdx++) {
        const ch = chunks[cIdx];
        const modChunk = remN % ch.prodNum;
        if (modChunk === 0 || gcdNum(modChunk, ch.prodNum) > 1) {
          const ps = ch.primes;
          const cols = ch.cols;
          const modsNM = ch.modsNM;
          for (let j = 0; j < ps.length; j++) {
            const p = ps[j];
            if (modChunk % p === 0) {
              let cnt = 0;
              do {
                remN = Math.floor(remN / p);
                cnt++;
              } while (remN % p === 0);
              if ((cnt & 1) === 1) sparseCols.push(cols[j]);
              const half = cnt >> 1;
              if (half > 0) {
                if (montCtx) {
                  const pPowM = half === 1 ? modsNM[j] : montCtx.montPow(modsNM[j], BigInt(half));
                  extraM = montCtx.montMul(extraM, pPowM);
                } else {
                  extraM = (extraM * modPow(BigInt(p), BigInt(half), N)) % N;
                }
              }
              if (remN === 1) break;
            }
          }
        }
      }
      rem = BigInt(remN);
    }

    // Classify residual cofactor: Smooth | 1LP | 2LP (via fast Brent)
    if (rem === 1n) {
      const extraSquare = montCtx ? montCtx.fromMont(extraM) : extraM;
      return {
        status: 'smooth',
        relation: {
          xVal: X.toString(),
          qVal: (signNeg ? '-' : '+') + Q.toString(),
          signNeg,
          sparseCols,
          extraSquare: extraSquare.toString()
        }
      };
    }

    if (rem <= largePrimeBoundBig) {
      const definitelyPrime = rem < prep.maxPSq ? true : isProbablePrime(rem, 4);
      if (definitelyPrime) {
        const extraSquare = montCtx ? montCtx.fromMont(extraM) : extraM;
        return {
          status: '1lp',
          relation: {
            xVal: X.toString(),
            qVal: (signNeg ? '-' : '+') + Q.toString() + ':LP',
            signNeg,
            sparseCols,
            extraSquare: extraSquare.toString(),
            largePrime: rem.toString()
          }
        };
      }
    }

    // 2-Large-Prime (2LP) harvesting when rem fits within B_lp^2 and splits cleanly
    if (rem > largePrimeBoundBig && rem <= twoLpCapBig && rem <= MAX_SAFE_BIG && !isProbablePrime(rem, 3)) {
      const remN = Number(rem);
      const lpNum = Number(largePrimeBoundBig);
      const q1 = split2LPNum(remN);
      if (q1 > 1 && q1 < remN) {
        const q2 = Math.floor(remN / q1);
        if (q1 <= lpNum && q2 <= lpNum) {
          const q1B = BigInt(q1);
          const q2B = BigInt(q2);
          if (isProbablePrime(q1B, 4) && isProbablePrime(q2B, 4)) {
            const extraSquare = montCtx ? montCtx.fromMont(extraM) : extraM;
            const lo = q1 <= q2 ? q1 : q2;
            const hi = q1 <= q2 ? q2 : q1;
            return {
              status: '2lp',
              relation: {
                xVal: X.toString(),
                qVal: (signNeg ? '-' : '+') + Q.toString() + ':2LP',
                signNeg,
                sparseCols,
                extraSquare: extraSquare.toString(),
                largePrime: String(lo),
                largePrime2: String(hi)
              }
            };
          }
        }
      }
    }

    return null;
  };

  self.onmessage = async (e) => {
    const {
      type,
      n,
      kMultiplier = 1,
      fbPrimes = [],
      fbGlobalIndices = null,
      largePrimeBound = 500000
    } = e.data;

    if (type !== 'start') return;

    try {
      const N = BigInt(n);
      const startTime = Date.now();

      const directSqrt = bigSqrt(N);
      if (directSqrt * directSqrt === N && directSqrt > 1n && directSqrt < N) {
        self.postMessage({
          type: 'result',
          factors: [directSqrt.toString(), directSqrt.toString()],
          method: 'CFRAC (Exact Square)',
          steps: 1,
          duration: Date.now() - startTime
        });
        return;
      }

      // Fast batch trial division against first 64 FB primes
      let tdProd = 1n;
      for (let i = 0; i < Math.min(fbPrimes.length, 64); i++) {
        const sp = BigInt(fbPrimes[i]);
        if (sp > 1n && sp < N) {
          tdProd *= sp;
        }
      }
      const gTd = gcd(tdProd, N);
      if (gTd > 1n && gTd < N) {
        let hit = gTd;
        for (let i = 0; i < Math.min(fbPrimes.length, 64); i++) {
          const sp = BigInt(fbPrimes[i]);
          if (sp > 1n && N % sp === 0n && sp < N) {
            hit = sp;
            break;
          }
        }
        const other = N / hit;
        const sorted = [hit, other].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
        self.postMessage({
          type: 'result',
          factors: sorted,
          method: 'CFRAC (Factor Base Trial Hit)',
          steps: 1,
          duration: Date.now() - startTime
        });
        return;
      }

      const kBig = BigInt(kMultiplier);
      const M = kBig * N;
      const gMult = gcd(kBig, N);
      if (gMult > 1n && gMult < N) {
        const other = N / gMult;
        const sorted = [gMult, other].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
        self.postMessage({
          type: 'result',
          factors: sorted,
          method: 'CFRAC (Multiplier GCD)',
          steps: 1,
          duration: Date.now() - startTime
        });
        return;
      }

      const montCtx = (N & 1n) === 1n ? createMontgomeryCtx(N) : null;
      const prep = prepareCfracChunks(fbPrimes, fbGlobalIndices, montCtx, N);
      const largePrimeBoundBig = BigInt(largePrimeBound);
      const twoLpCapBig = largePrimeBoundBig * largePrimeBoundBig > MAX_SAFE_BIG
        ? MAX_SAFE_BIG
        : largePrimeBoundBig * largePrimeBoundBig;

      const a0 = bigSqrt(M);
      let P = 0n;
      let Q = 1n;
      let a = a0;
      let A_prev = 1n;
      let A_curr = a0 % N;

      let step = 0;
      let smoothCount = 0;
      let partialCount = 0;
      let batch = [];
      let convergentsSample = [];
      let lastReportTime = Date.now();
      let lastBatchFlushTime = Date.now();
      let lastSampleTime = 0;
      let lastYieldTime = Date.now();
      let gcdAccum = 1n;
      let gcdQueueQ = [];

      const maxSteps = 4000000;

      while (step < maxSteps) {
        const P_next = a * Q - P;
        const Q_next = (M - P_next * P_next) / Q;

        if (Q_next === 0n) {
          const g = gcd(A_curr, N);
          if (g > 1n && g < N) {
            const other = N / g;
            const sorted = [g, other].sort((u, v) => (u < v ? -1 : 1)).map(v => v.toString());
            self.postMessage({
              type: 'result',
              factors: sorted,
              method: 'CFRAC (Exact Period Root)',
              steps: step + 1,
              duration: Date.now() - startTime
            });
            return;
          }
          break;
        }

        const signNeg = ((step + 1) & 1) === 1;

        // Batched residue GCD once per 128 steps (eliminates 99.2% of per-step BigInt Euclid GCD calls)
        gcdAccum = (gcdAccum * (Q_next % N)) % N;
        gcdQueueQ.push(Q_next);
        if (gcdQueueQ.length >= 128) {
          if (gcdAccum === 0n || gcd(gcdAccum, N) > 1n) {
            for (let qi = 0; qi < gcdQueueQ.length; qi++) {
              const gQ = gcd(gcdQueueQ[qi], N);
              if (gQ > 1n && gQ < N) {
                const other = N / gQ;
                const sorted = [gQ, other].sort((u, v) => (u < v ? -1 : 1)).map(v => v.toString());
                self.postMessage({
                  type: 'result',
                  factors: sorted,
                  method: 'CFRAC (Batched Residue GCD Hit)',
                  steps: step + 1,
                  duration: Date.now() - startTime
                });
                return;
              }
            }
          }
          gcdAccum = 1n;
          gcdQueueQ.length = 0;
        }

        // Instant square shortcut on even step: A_i^2 === s^2 (mod N)
        if (!signNeg) {
          const sqRoot = isSquareBig(Q_next);
          if (sqRoot !== null) {
            const g1 = gcd(A_curr > sqRoot ? A_curr - sqRoot : sqRoot - A_curr, N);
            if (g1 > 1n && g1 < N) {
              const other = N / g1;
              const sorted = [g1, other].sort((u, v) => (u < v ? -1 : 1)).map(v => v.toString());
              self.postMessage({
                type: 'result',
                factors: sorted,
                method: 'CFRAC (Direct Even-Step Square)',
                steps: step + 1,
                duration: Date.now() - startTime
              });
              return;
            }
          }
        }

        const factored = factorCfracResidueFast(
          Q_next,
          A_curr,
          signNeg,
          prep,
          montCtx,
          N,
          largePrimeBoundBig,
          twoLpCapBig
        );

        let statusTag = 'composite';
        if (factored) {
          if (factored.directFactor) {
            const df = factored.directFactor;
            const other = N / df;
            const sorted = [df, other].sort((u, v) => (u < v ? -1 : 1)).map(v => v.toString());
            self.postMessage({
              type: 'result',
              factors: sorted,
              method: 'CFRAC (Direct Congruence)',
              steps: step + 1,
              duration: Date.now() - startTime
            });
            return;
          }
          if (factored.relation) {
            batch.push(factored.relation);
            if (factored.status === 'smooth') {
              smoothCount++;
              statusTag = 'smooth';
            } else {
              partialCount++;
              statusTag = '1lp';
            }
          }
        }

        // Advance continued fraction state
        const a_next = (P_next + a0) / Q_next;
        const A_next = (a_next * A_curr + A_prev) % N;

        // Throttled convergent sampling ONLY on early steps or telemetry intervals (zero hot-loop strings)
        if ((step & 255) === 0 || statusTag !== 'composite') {
          const nowSample = Date.now();
          if (convergentsSample.length < 6 || nowSample - lastSampleTime >= 85) {
            lastSampleTime = nowSample;
            const qStr = Q_next.toString();
            const aStr = A_curr.toString();
            convergentsSample.push({
              step,
              a_val: a.toString(),
              q_val: (signNeg ? '-' : '+') + (qStr.length > 22 ? qStr.slice(0, 18) + '...' : qStr),
              a_cap: aStr.length > 16 ? aStr.slice(0, 12) + '...' : aStr,
              status: statusTag
            });
            if (convergentsSample.length > 10) {
              convergentsSample = convergentsSample.slice(-10);
            }
          }
        }

        P = P_next;
        Q = Q_next;
        a = a_next;
        A_prev = A_curr;
        A_curr = A_next;
        step++;

        if ((step & 127) === 0 || batch.length >= 24) {
          const now = Date.now();
          if (batch.length >= 24 || (batch.length > 0 && now - lastBatchFlushTime >= 90)) {
            lastBatchFlushTime = now;
            self.postMessage({
              type: 'cfrac_relations_batch',
              targetN: N.toString(),
              kMultiplier,
              steps: step,
              smoothCount,
              partialCount,
              convergentsSample,
              relations: batch
            });
            batch = [];
          }

          if (now - lastReportTime >= 115) {
            lastReportTime = now;
            self.postMessage({
              type: 'cfrac_progress',
              kMultiplier,
              steps: step,
              smoothCount,
              partialCount,
              convergentsSample
            });
          }

          if (now - lastYieldTime >= 45) {
            lastYieldTime = now;
            await new Promise(r => setTimeout(r, 0));
          }
        }

        if (Q === 1n && step > 1) {
          self.postMessage({
            type: 'cfrac_period_exhausted',
            kMultiplier,
            steps: step,
            smoothCount,
            partialCount
          });
          break;
        }
      }

      if (batch.length > 0) {
        self.postMessage({
          type: 'cfrac_relations_batch',
          targetN: N.toString(),
          kMultiplier,
          steps: step,
          smoothCount,
          partialCount,
          convergentsSample,
          relations: batch
        });
      }
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  };
`;

