// Hybrid Geodesic Sieve (HGS) Web Worker Code
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

  const bigIntSqrt = (value) => {
    if (value < 0n) return 0n;
    if (value < 2n) return value;
    let newX = value / 2n + 1n;
    let x = newX + 1n;
    while (newX < x) {
      x = newX;
      newX = (value / x + x) / 2n;
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

  const isProbablePrimeBig = (n, k = 6) => {
    if (n === 2n || n === 3n) return true;
    if (n % 2n === 0n || n < 2n) return false;
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (let i = 0; i < Math.min(k, bases.length); i++) {
      const a = bases[i];
      if (n === a) return true;
      if (n % a === 0n) return false;
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

  const legendreSymbol = (n, p) => {
    if (n % p === 0n) return 0;
    const res = modPow(n % p, (p - 1n) / 2n, p);
    if (res === 1n) return 1;
    if (res === p - 1n) return -1;
    return 0;
  };

  const tonelliShanks = (n, p) => {
    n = ((n % p) + p) % p;
    if (n === 0n) return 0n;
    if (p === 2n) return n;
    if (legendreSymbol(n, p) !== 1) return null;
    if (p % 4n === 3n) return modPow(n, (p + 1n) / 4n, p);

    let s = 0n;
    let q = p - 1n;
    while ((q & 1n) === 0n) {
      s += 1n;
      q >>= 1n;
    }
    let z = 2n;
    while (legendreSymbol(z, p) !== -1) z += 1n;

    let m = s;
    let c = modPow(z, q, p);
    let t = modPow(n, q, p);
    let r = modPow(n, (q + 1n) / 2n, p);

    while (true) {
      if (t === 0n) return 0n;
      if (t === 1n) return r;
      let i = 0n, temp = t;
      while (temp !== 1n && i < m) {
        temp = (temp * temp) % p;
        i += 1n;
      }
      if (i === 0n) return r;
      if (i >= m) return null;
      let b = c;
      for (let j = 0n; j < m - i - 1n; j++) b = (b * b) % p;
      m = i;
      c = (b * b) % p;
      t = (t * c) % p;
      r = (r * b) % p;
    }
  };

  const getPrimesList = (limit) => {
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
    return primes;
  };

  const bigIntLnApprox = (n) => {
    if (n <= 0n) return 0;
    const s = n.toString(16);
    const len = s.length;
    const topHex = s.slice(0, Math.min(12, len));
    const topVal = parseInt(topHex, 16);
    const remainingBits = (len - topHex.length) * 4;
    return Math.log(topVal) + remainingBits * 0.6931471805599453;
  };

  const solveMatrixMod2 = (matrix) => {
    const rows = matrix.length;
    if (rows === 0) return [];
    const cols = matrix[0].length;
    let workMatrix = matrix.map((row, idx) => {
      const history = new Array(rows).fill(0);
      history[idx] = 1;
      return { data: [...row], history };
    });

    let pivotRow = 0;
    for (let j = 0; j < cols && pivotRow < rows; j++) {
      let i = pivotRow;
      while (i < rows && workMatrix[i].data[j] === 0) i++;
      if (i < rows) {
        const temp = workMatrix[pivotRow];
        workMatrix[pivotRow] = workMatrix[i];
        workMatrix[i] = temp;

        for (let k = 0; k < rows; k++) {
          if (k !== pivotRow && workMatrix[k].data[j] === 1) {
            for (let col = 0; col < cols; col++) {
              workMatrix[k].data[col] ^= workMatrix[pivotRow].data[col];
            }
            for (let h = 0; h < rows; h++) {
              workMatrix[k].history[h] ^= workMatrix[pivotRow].history[h];
            }
          }
        }
        pivotRow++;
      }
    }

    const dependencies = [];
    for (let i = 0; i < rows; i++) {
      if (workMatrix[i].data.every(v => v === 0)) {
        dependencies.push(workMatrix[i].history);
      }
    }
    return dependencies;
  };

  const buildFactorTree = (N, factor1, factor2) => {
    const pBig = BigInt(factor1);
    const qBig = BigInt(factor2);
    const isPPrime = isProbablePrimeBig(pBig, 8);
    const isQPrime = isProbablePrimeBig(qBig, 8);

    return {
      value: N.toString(),
      bits: N.toString(2).length,
      isPrime: false,
      left: {
        value: pBig.toString(),
        bits: pBig.toString(2).length,
        isPrime: isPPrime,
        role: 'factor_p'
      },
      right: {
        value: qBig.toString(),
        bits: qBig.toString(2).length,
        isPrime: isQPrime,
        role: 'factor_q'
      }
    };
  };

  const runHgsSolver = async (N) => {
    const startTime = Date.now();
    self.postMessage({
      type: 'log',
      message: '[HGS Initialized] Starting Hybrid Geodesic Sieve on modulus N (' + N.toString(2).length + ' bits)...'
    });

    // 1. Direct Pre-sieve
    if (N <= 1n) return { factor: null, method: 'Invalid Input' };
    if ((N & 1n) === 0n) {
      const q = N / 2n;
      return {
        factor: 2n,
        factor2: q,
        method: 'HGS Pre-Sieve (Even Modulus)',
        steps: 1,
        tree: buildFactorTree(N, 2n, q)
      };
    }

    const sqrtN = bigIntSqrt(N);
    if (sqrtN * sqrtN === N) {
      return {
        factor: sqrtN,
        factor2: sqrtN,
        method: 'HGS Pre-Sieve (Exact Square N = sqrt(N)^2)',
        steps: 1,
        tree: buildFactorTree(N, sqrtN, sqrtN)
      };
    }

    if (isProbablePrimeBig(N, 10)) {
      return {
        factor: N,
        factor2: 1n,
        method: 'Miller-Rabin Primality Proof (N is Prime)',
        steps: 1,
        tree: {
          value: N.toString(),
          bits: N.toString(2).length,
          isPrime: true
        }
      };
    }

    // Small prime trial division
    const smallPrimes = getPrimesList(20000);
    for (let i = 0; i < smallPrimes.length; i++) {
      const sp = BigInt(smallPrimes[i]);
      if (sp >= N) break;
      if (N % sp === 0n) {
        const q = N / sp;
        return {
          factor: sp,
          factor2: q,
          method: 'HGS Pre-Sieve Small Prime (p=' + sp + ')',
          steps: i + 1,
          tree: buildFactorTree(N, sp, q)
        };
      }
    }

    self.postMessage({
      type: 'stage',
      stage: 'building_fb',
      message: 'Building Quadratic Factor Base (Legendre symbol (N/p) = 1 + sign factor -1)...'
    });

    // 2. Build Factor Base dynamically based on N bit length
    const nBits = N.toString(2).length;
    let targetFbSize = 35;
    if (nBits <= 40) targetFbSize = 25;
    else if (nBits <= 55) targetFbSize = 45;
    else if (nBits <= 70) targetFbSize = 75;
    else if (nBits <= 90) targetFbSize = 130;
    else if (nBits <= 115) targetFbSize = 220;
    else if (nBits <= 140) targetFbSize = 360;
    else targetFbSize = Math.min(800, 400 + Math.floor((nBits - 140) * 4));

    const candidatePrimes = getPrimesList(Math.max(10000, targetFbSize * 18));
    const factorBase = [-1, 2];
    const roots = [null, null]; // roots for -1 and 2

    for (let i = 0; i < candidatePrimes.length; i++) {
      const p = candidatePrimes[i];
      if (p === 2) continue;
      const pBig = BigInt(p);
      if (legendreSymbol(N, pBig) === 1) {
        const r = tonelliShanks(N, pBig);
        if (r !== null) {
          factorBase.push(p);
          roots.push(r);
        }
        if (factorBase.length >= targetFbSize) break;
      }
    }

    const polynomialStr = 'Q(x) = (x + ' + sqrtN.toString() + ')^2 - N';
    self.postMessage({
      type: 'fb_built',
      factorBase,
      factorBaseSize: factorBase.length,
      polynomial: polynomialStr,
      targetSmooth: factorBase.length + 6
    });

    self.postMessage({
      type: 'log',
      message: '[HGS Factor Base Built] ' + factorBase.length + ' primes with Legendre symbol (N/p)=1. Starting Segmented Geodesic Sieving...'
    });

    // 3. Segmented Array Sieving
    const targetRelations = factorBase.length + 6;
    const relations = [];
    const segSize = 32768;
    const sieveArr = new Float32Array(segSize);
    const fbLogs = factorBase.map(p => p > 1 ? Math.log(p) : 0);
    const maxP = factorBase[factorBase.length - 1];
    const maxLog = Math.log(maxP);

    let skippedTotal = 0;
    let testedTotal = 0;
    let currentXStart = 1;
    let iterations = 0;

    self.postMessage({
      type: 'stage',
      stage: 'sieving',
      message: 'Segmented Array Sieving in Progress...'
    });

    while (relations.length < targetRelations && iterations < 300) {
      iterations++;
      sieveArr.fill(0);

      // Sieve by 2:
      const nMod2 = Number(N & 1n);
      const mMod2 = Number(sqrtN & 1n);
      let start2 = ((nMod2 - mMod2) % 2 + 2) % 2;
      const off2 = (start2 - (currentXStart % 2) + 2) % 2;
      for (let idx = off2; idx < segSize; idx += 2) {
        sieveArr[idx] += fbLogs[1];
      }

      // Sieve by odd primes in FB
      for (let i = 2; i < factorBase.length; i++) {
        const p = factorBase[i];
        const r = Number(roots[i]);
        const mModP = Number(sqrtN % BigInt(p));
        const r1 = (r - mModP + p) % p;
        const r2 = (p - r - mModP + p) % p;
        const logP = fbLogs[i];

        let idx1 = (r1 - (currentXStart % p) + p) % p;
        while (idx1 < segSize) {
          sieveArr[idx1] += logP;
          idx1 += p;
        }
        if (r1 !== r2) {
          let idx2 = (r2 - (currentXStart % p) + p) % p;
          while (idx2 < segSize) {
            sieveArr[idx2] += logP;
            idx2 += p;
          }
        }
      }

      // Scan segment for threshold candidates
      for (let idx = 0; idx < segSize && relations.length < targetRelations; idx++) {
        const curX = BigInt(currentXStart + idx);
        
        // Test positive and negative offset
        for (const sign of [1n, -1n]) {
          const xVal = sign * curX;
          const Q = (xVal + sqrtN) * (xVal + sqrtN) - N;
          if (Q === 0n) {
            const f = gcd(xVal + sqrtN, N);
            if (f > 1n && f < N) {
              const q = N / f;
              return {
                factor: f,
                factor2: q,
                method: 'HGS Direct Geodesic Zero Hit Q(x)=0',
                steps: testedTotal + idx,
                tree: buildFactorTree(N, f, q)
              };
            }
          }

          const absQ = Q < 0n ? -Q : Q;
          const targetLog = bigIntLnApprox(absQ);
          const threshold = targetLog - 1.9 * maxLog;

          if (sieveArr[idx] >= threshold) {
            testedTotal++;
            let rem = absQ;
            const exponents = new Array(factorBase.length).fill(0);
            if (Q < 0n) exponents[0] = 1;

            for (let fIdx = 1; fIdx < factorBase.length; fIdx++) {
              const pBig = BigInt(factorBase[fIdx]);
              while (rem % pBig === 0n) {
                exponents[fIdx]++;
                rem /= pBig;
              }
              if (rem === 1n) break;
            }

            if (rem === 1n) {
              const X = ((xVal + sqrtN) % N + N) % N;
              relations.push({
                x: xVal.toString(),
                X: X.toString(),
                Q: Q.toString(),
                exponents,
                parity: exponents.map(e => e % 2)
              });

              self.postMessage({
                type: 'smooth_relation',
                smoothCount: relations.length,
                targetSmooth: targetRelations,
                scannedCount: testedTotal,
                skippedCount: skippedTotal,
                relation: {
                  index: relations.length,
                  x: xVal.toString(),
                  X: X.toString(),
                  Q: Q.toString(),
                  exponents
                }
              });

              if (relations.length >= targetRelations) break;
            }
          } else {
            skippedTotal++;
          }
        }
      }

      currentXStart += segSize;
      // Yield to avoid blocking
      await new Promise(r => setTimeout(r, 0));
    }

    if (relations.length < factorBase.length) {
      self.postMessage({
        type: 'log',
        message: '[HGS] Collected ' + relations.length + ' smooth relations. Attempting partial linear algebra...'
      });
    }

    // 4. Linear Algebra over F_2 (Gaussian elimination)
    self.postMessage({
      type: 'stage',
      stage: 'linear_algebra',
      message: 'Solving Binary F_2 Matrix via Gaussian Elimination mod 2...'
    });

    const matrix = relations.map(r => r.parity);
    const deps = solveMatrixMod2(matrix);

    self.postMessage({
      type: 'f2_matrix_solved',
      rows: matrix.length,
      cols: factorBase.length,
      dependenciesCount: deps.length,
      matrixPreview: matrix.slice(0, 16).map(row => row.slice(0, 32))
    });

    // 5. Congruence of Squares X^2 = Y^2 mod N
    self.postMessage({
      type: 'stage',
      stage: 'congruence',
      message: 'Evaluating Congruence of Squares X^2 = Y^2 (mod N) and GCD Extraction...'
    });

    for (let dIdx = 0; dIdx < deps.length; dIdx++) {
      const dep = deps[dIdx];
      let X_prod = 1n;
      const totalExp = new Array(factorBase.length).fill(0);

      for (let r = 0; r < relations.length; r++) {
        if (dep[r] === 1) {
          X_prod = (X_prod * BigInt(relations[r].X)) % N;
          for (let i = 0; i < factorBase.length; i++) {
            totalExp[i] += relations[r].exponents[i];
          }
        }
      }

      let Y_prod = 1n;
      for (let i = 1; i < factorBase.length; i++) {
        const p = BigInt(factorBase[i]);
        const halfE = BigInt(Math.floor(totalExp[i] / 2));
        if (halfE > 0n) {
          Y_prod = (Y_prod * modPow(p, halfE, N)) % N;
        }
      }

      const diff = X_prod > Y_prod ? X_prod - Y_prod : Y_prod - X_prod;
      const g1 = gcd(diff, N);
      const g2 = gcd((X_prod + Y_prod) % N, N);

      const targetFactor = (g1 > 1n && g1 < N) ? g1 : ((g2 > 1n && g2 < N) ? g2 : null);

      if (targetFactor !== null) {
        const qFactor = N / targetFactor;
        const sorted = [targetFactor, qFactor].sort((a, b) => a < b ? -1 : 1);
        const pFinal = sorted[0];
        const qFinal = sorted[1];
        const duration = Date.now() - startTime;
        const tree = buildFactorTree(N, pFinal, qFinal);

        self.postMessage({
          type: 'congruence_hit',
          X: X_prod.toString(),
          Y: Y_prod.toString(),
          diff: diff.toString(),
          g1: g1.toString(),
          g2: g2.toString(),
          factor1: pFinal.toString(),
          factor2: qFinal.toString(),
          duration
        });

        return {
          factor: pFinal,
          factor2: qFinal,
          method: 'HGS Congruence of Squares X^2 = Y^2 (mod N)',
          steps: testedTotal,
          duration,
          tree
        };
      }
    }

    // Fallback: If square combination didn't split (all trivial), return null
    return {
      factor: null,
      factor2: null,
      method: 'HGS Exhausted (Trivial Nullspace)',
      steps: testedTotal,
      duration: Date.now() - startTime
    };
  };

  self.onmessage = async (e) => {
    const { type, n } = e.data;
    if (type === 'start') {
      try {
        const N = BigInt(n);
        const res = await runHgsSolver(N);
        if (res && res.factor) {
          self.postMessage({
            type: 'result',
            success: true,
            factor1: res.factor.toString(),
            factor2: res.factor2 ? res.factor2.toString() : (N / res.factor).toString(),
            method: res.method,
            steps: res.steps,
            duration: res.duration || 0,
            tree: res.tree
          });
        } else {
          self.postMessage({
            type: 'result',
            success: false,
            factor1: null,
            factor2: null,
            method: res ? res.method : 'Failed',
            steps: res ? res.steps : 0
          });
        }
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
    }
  };
`;
