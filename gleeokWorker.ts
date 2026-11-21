export const GLEEOK_WORKER_CODE = `
    const gcd = (a, b) => {
        while (b > 0n) { let t = b; b = a % b; a = t; }
        return a;
    };
    const modInverse = (a, m) => {
        let m0 = m, t, q;
        let x0 = 0n, x1 = 1n;
        if (m === 1n) return 0n;
        while (a > 1n) {
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

    // Simple LCG PRNG for repeatable permutations
    class PRNG {
        constructor(seed) {
            this.state = seed >>> 0;
        }
        next() {
            this.state = (this.state * 1664525 + 1013904223) >>> 0;
            return this.state / 4294967296;
        }
    }

    const generateGleeokPermutations = (N, nBits) => {
        let perms = [];
        let baseSeed = Number(N % 4294967296n);
        for(let i = 0; i < nBits; i++) {
            let rng = new PRNG(baseSeed ^ i);
            let p = Array.from({length: nBits}, (_, j) => j);
            // Fisher-Yates shuffle
            for (let j = nBits - 1; j > 0; j--) {
                let k = Math.floor(rng.next() * (j + 1));
                [p[j], p[k]] = [p[k], p[j]];
            }
            perms.push(p);
            
            // Post progress for generation
             if (i % Math.max(1, Math.floor(nBits/20)) === 0) {
                 self.postMessage({ type: 'gleeok_perm', round: i + 1, total: nBits });
             }
        }
        return perms;
    };

    const computeFeaturePriority = (N, perms, nBits) => {
        let nStr = N.toString(2).padStart(nBits, '0');
        
        let bitVectors = [];
        for (let i = 0; i < nBits; i++) {
            let p = perms[i];
            let v = new Array(nBits);
            for (let j = 0; j < nBits; j++) {
                v[j] = nStr[p[j]] === '1' ? 1 : 0;
            }
            bitVectors.push(v);
        }

        // Feature(N) = average of all vectors
        let feature = new Array(nBits).fill(0);
        for (let i = 0; i < nBits; i++) {
            for (let j = 0; j < nBits; j++) {
                feature[j] += bitVectors[i][j];
            }
        }
        for (let j = 0; j < nBits; j++) feature[j] /= nBits;

        // Stability = sum of deviations
        let stability = 0;
        for (let i = 0; i < nBits; i++) {
            let dev = 0;
            for (let j = 0; j < nBits; j++) {
                dev += Math.abs(bitVectors[i][j] - feature[j]);
            }
            stability += dev;
        }
        stability /= (nBits * nBits); // normalize
        
        // Compute pseudo-entropy
        let entropy = 0;
        for (let j = 0; j < nBits; j++) {
            let p1 = feature[j];
            if (p1 > 0 && p1 < 1) {
                entropy -= p1 * Math.log2(p1) + (1-p1) * Math.log2(1-p1);
            }
        }
        entropy /= nBits;
        
        let bitDensity = feature.reduce((a, b) => a + b, 0) / nBits;
        let convergence = 1.0 - stability; // Inverse relationship for convergence
        
        let qualityIndex = (convergence + entropy + bitDensity) / 3;
        
        let curvesParams = [];
        // Generate nBits curves, use feature vector to derive curve params
        for(let i = 0; i < Math.min(nBits, 500); i++) { // cap at 500 curves for performance
            let wFingerprint = feature[i % nBits];
            let wStability = 1 - stability;
            let wEntropy = entropy;
            let score = (wFingerprint * 0.4) + (wStability * 0.3) + (wEntropy * 0.3);
            
            curvesParams.push({
                id: i,
                priority: score,
                featureSeed: Math.floor(feature[i % nBits] * 1000000)
            });
        }
        curvesParams.sort((a, b) => b.priority - a.priority);

        const priorities = curvesParams.map(c => c.priority);
        const maxPriority = Math.max(...priorities);
        const minPriority = Math.min(...priorities);
        const avgPriority = priorities.reduce((a, b) => a + b, 0) / priorities.length;

        return {
            featureSize: nBits, 
            stability: 1.0 - stability, // Show as positive stability
            entropy, 
            bitDensity, 
            convergence, 
            qualityIndex,
            curvesParams, 
            maxPriority, 
            minPriority, 
            avgPriority
        };
    };

    const ecmAttackGleeok = async (N) => {
        if (N % 2n === 0n) return 2n;
        if (N % 3n === 0n) return 3n;

        const B1 = 20000; 
        const primes = [];
        const sieve = new Uint8Array(B1 + 1);
        for (let i = 2; i <= B1; i++) {
            if (!sieve[i]) {
                primes.push(i);
                for (let j = i * i; j <= B1; j += i) sieve[j] = 1;
            }
        }

        let k_factors = [];
        for (const p of primes) {
            let power = p;
            while (power * p <= B1) power *= p;
            k_factors.push(power);
        }

        const addAffine = (P, Q, a) => {
            if (!P) return Q;
            if (!Q) return P;
            let num, den;
            if (P.x === Q.x) {
                if (P.y === Q.y) {
                    num = (3n * P.x * P.x + a) % N;
                    den = (2n * P.y) % N;
                } else {
                    return null;
                }
            } else {
                num = (Q.y - P.y) % N;
                den = (Q.x - P.x) % N;
            }
            if (num < 0n) num += N;
            if (den < 0n) den += N;

            let g = gcd(den, N);
            if (g > 1n && g < N) throw { factor: g };
            if (g === N) return null;

            let invDen = modInverse(den, N);
            let m = (num * invDen) % N;
            let x3 = (m * m - P.x - Q.x) % N;
            if (x3 < 0n) x3 += N;
            let y3 = (m * (P.x - x3) - P.y) % N;
            if (y3 < 0n) y3 += N;

            return { x: x3, y: y3 };
        };

        const mulPoint = (P, k, a) => {
            let R = null;
            let Q = P;
            let temp = k;
            while (temp > 0) {
                if (temp & 1) R = addAffine(R, Q, a);
                Q = addAffine(Q, Q, a);
                temp >>= 1;
            }
            return R;
        };

        const nBits = N.toString(2).length;
        self.postMessage({ type: 'gleeok_init', nBits });
        
        let perms = generateGleeokPermutations(N, nBits);

        const features = computeFeaturePriority(N, perms, nBits);
        self.postMessage({ type: 'gleeok_features', features });

        let attempts = 0;
        let modMuls = 0;
        let curveAdds = 0;

        for(let c = 0; c < features.curvesParams.length; c++) {
            let curveInfo = features.curvesParams[c];
            attempts++;
            
            // Seed ECM curves using the feature signature
            let rng = new PRNG((Number(N % 4294967296n) ^ curveInfo.id) + curveInfo.featureSeed);
            let x0 = BigInt(Math.floor(rng.next() * 1000000)) + 1n;
            let y0 = BigInt(Math.floor(rng.next() * 1000000)) + 1n;
            let a = BigInt(Math.floor(rng.next() * 1000000)) + 1n;
            
            let P = { x: x0, y: y0 };
            try {
                for (let i = 0; i < k_factors.length; i++) {
                    let R = mulPoint(P, k_factors[i], a);
                    modMuls += 5; 
                    curveAdds += 1;
                    if (!R) break;
                    P = R;
                    if (i % 200 === 0) {
                        self.postMessage({ type: 'gleeok_progress', attempts, total: features.curvesParams.length, curveAdds, modMuls, curveInfo });
                    }
                }
            } catch (e) {
                if (e.factor) return { factor: e.factor, attempts, curveAdds, modMuls };
            }
        }
        return null;
    };

    self.onmessage = async (e) => {
        const { n, type } = e.data;
        if (type === 'start') {
            try {
                self.postMessage({ type: 'log', message: "Initializing Gleeok-n Framework..." });
                const res = await ecmAttackGleeok(BigInt(n));
                self.postMessage({ type: 'result', factor: res ? res.factor.toString() : null, method: "Gleeok-n ECM Priority", steps: res ? res.attempts : 0 });
            } catch (err) {
                self.postMessage({ type: 'error', message: err.message });
            }
        }
    };
`;
