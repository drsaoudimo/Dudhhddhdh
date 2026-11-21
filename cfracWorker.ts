export const CFRAC_WORKER_CODE = `
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

  const isProbablePrime = (n, k = 8) => {
    if (n === 2n || n === 3n) return true;
    if (n < 2n || (n & 1n) === 0n) return false;
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n];
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

  const factorCfracResidue = (Q, X, signNeg, fbPrimes, fbPrimesBig, largePrimeBoundBig, N) => {
    let rem = Q;
    if (rem === 0n) {
      const g = gcd(X, N);
      if (g > 1n && g < N) return { directFactor: g };
      return null;
    }

    const sparseCols = [];
    let extraSquare = 1n;

    for (let i = 0; i < fbPrimes.length; i++) {
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

    if (rem === 1n) {
      return {
        status: 'smooth',
        relation: {
          xVal: X.toString(),
          qVal: (signNeg ? -Q : Q).toString(),
          signNeg,
          sparseCols,
          extraSquare: extraSquare.toString()
        }
      };
    }

    if (rem <= largePrimeBoundBig && isProbablePrime(rem, 5)) {
      return {
        status: '1lp',
        relation: {
          xVal: X.toString(),
          qVal: (signNeg ? -Q : Q).toString() + ':LP',
          signNeg,
          sparseCols,
          extraSquare: extraSquare.toString(),
          largePrime: rem.toString()
        }
      };
    }

    return null;
  };

  self.onmessage = async (e) => {
    const {
      type,
      n,
      kMultiplier = 1,
      fbPrimes = [],
      largePrimeBound = 500000
    } = e.data;

    if (type !== 'start') return;

    try {
      const N = BigInt(n);
      const startTime = Date.now();

      // Quick exact square or small divisor checks before expansion
      const directSqrt = isSquareBig(N);
      if (directSqrt && directSqrt > 1n && directSqrt < N) {
        self.postMessage({
          type: 'result',
          factors: [directSqrt.toString(), directSqrt.toString()],
          method: 'CFRAC (Exact Square)',
          steps: 1,
          duration: Date.now() - startTime
        });
        return;
      }

      const fbPrimesBig = fbPrimes.map(p => BigInt(p));
      const largePrimeBoundBig = BigInt(largePrimeBound);

      // Quick FB prime trial division
      for (let i = 0; i < Math.min(fbPrimesBig.length, 40); i++) {
        const sp = fbPrimesBig[i];
        if (sp > 1n && N % sp === 0n && sp < N) {
          const other = N / sp;
          const sorted = [sp, other].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
          self.postMessage({
            type: 'result',
            factors: sorted,
            method: 'CFRAC (Factor Base Trial Hit)',
            steps: i + 1,
            duration: Date.now() - startTime
          });
          return;
        }
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

      const maxSteps = 2000000;

      while (step < maxSteps) {
        // Recurrence step i -> i+1:
        // P_{i+1} = a_i * Q_i - P_i
        // Q_{i+1} = (M - P_{i+1}^2) / Q_i
        // Congruence: A_i^2 === (-1)^{i+1} * Q_{i+1} (mod N)
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
        const gQ = gcd(Q_next, N);
        if (gQ > 1n && gQ < N) {
          const other = N / gQ;
          const sorted = [gQ, other].sort((u, v) => (u < v ? -1 : 1)).map(v => v.toString());
          self.postMessage({
            type: 'result',
            factors: sorted,
            method: 'CFRAC (Residue GCD Hit)',
            steps: step + 1,
            duration: Date.now() - startTime
          });
          return;
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

        const factored = factorCfracResidue(Q_next, A_curr, signNeg, fbPrimes, fbPrimesBig, largePrimeBoundBig, N);
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

        if (convergentsSample.length < 8 || statusTag !== 'composite' || step % 25 === 0) {
          convergentsSample.push({
            step,
            a_val: a.toString(),
            q_val: (signNeg ? '-' : '+') + Q_next.toString(),
            a_cap: A_curr.toString().length > 16 ? A_curr.toString().slice(0, 12) + '…' : A_curr.toString(),
            status: statusTag
          });
          if (convergentsSample.length > 10) {
            convergentsSample = convergentsSample.slice(-10);
          }
        }

        // Advance continued fraction state
        const a_next = (P_next + a0) / Q_next;
        const A_next = (a_next * A_curr + A_prev) % N;
        P = P_next;
        Q = Q_next;
        a = a_next;
        A_prev = A_curr;
        A_curr = A_next;
        step++;

        //Flush relations batch periodically or when buffer reaches 12
        if (batch.length >= 12 || (batch.length > 0 && step % 80 === 0)) {
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

        const now = Date.now();
        if (now - lastReportTime >= 110) {
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

        // Period restart check if Q returns to 1 before collecting enough relations
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

        if ((step & 1023) === 0) {
          await new Promise(r => setTimeout(r, 2));
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
