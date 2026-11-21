import { Relation } from './types';

// --- BigInt Math Helpers ---

export const bigIntSqrt = (value: bigint): bigint => {
  if (value < 0n) throw new Error("negative number");
  if (value < 2n) return value;
  let newX = value / 2n + 1n; 
  let x = newX + 1n; 
  while (newX < x) {
    x = newX;
    newX = (value / x + x) / 2n;
  }
  return x;
};

export const isSquareBigInt = (value: bigint): { isSquare: boolean; root: bigint } => {
  if (value < 0n) return { isSquare: false, root: 0n };
  if (value === 0n) return { isSquare: true, root: 0n };
  const r64 = Number(value & 63n);
  const residues = [0, 1, 4, 9, 16, 17, 25, 33, 36, 41, 49, 57];
  if (!residues.includes(r64)) {
    return { isSquare: false, root: 0n };
  }
  const root = bigIntSqrt(value);
  return { isSquare: root * root === value, root };
};

export const gcd = (a: bigint, b: bigint): bigint => {
  while (b > 0n) {
    let temp = b;
    b = a % b;
    a = temp;
  }
  return a;
};

export const modPow = (base: bigint, exp: bigint, mod: bigint): bigint => {
  let res = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) res = (res * base) % mod;
    base = (base * base) % mod;
    exp /= 2n;
  }
  return res;
};

export const modInverse = (a: bigint, m: bigint): bigint => {
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

export const isProbablePrime = (n: bigint, k: number = 5): boolean => {
    if (n === 2n || n === 3n) return true;
    if (n % 2n === 0n || n < 2n) return false;
    
    let d = n - 1n;
    let s = 0;
    while (d % 2n === 0n) {
        d /= 2n;
        s++;
    }
    
    for (let i = 0; i < k; i++) {
        const maxRange = 1000000n;
        const range = n - 4n;
        const limit = range < maxRange ? range : maxRange;
        const a = 2n + BigInt(Math.floor(Math.random() * Number(limit)));
        
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        let composite = true;
        for (let r = 1; r < s; r++) {
            x = (x * x) % n;
            if (x === n - 1n) {
                composite = false;
                break;
            }
        }
        if (composite) return false;
    }
    return true;
};

/**
 * Calculates the determinant of a matrix modulo N using Gaussian Elimination.
 * Complexity: O(n^3)
 */
export const modDetBigInt = (M: bigint[][], n: bigint): bigint => {
    const A = M.map(row => [...row]);
    const size = A.length;
    let det = 1n;

    for (let col = 0; col < size; col++) {
        let pivot = -1;
        for (let row = col; row < size; row++) {
            if (A[row][col] % n !== 0n) {
                pivot = row;
                break;
            }
        }

        if (pivot === -1) return 0n;

        if (pivot !== col) {
            [A[col], A[pivot]] = [A[pivot], A[col]];
            det = (n - det) % n;
        }

        const pv = A[col][col] % n;
        det = (det * pv) % n;
        const invPv = modInverse(pv, n);

        for (let row = col + 1; row < size; row++) {
            const factor = (A[row][col] * invPv) % n;
            for (let c = col; c < size; c++) {
                A[row][c] = (A[row][c] - (factor * A[col][c]) % n + n) % n;
            }
        }
    }

    return (det + n) % n;
};

// --- Advanced Prime Generation (Miller-Rabin) ---

const SMALL_TRIAL_PRIMES = [
  3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n,
  53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n,
  109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n,
  173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n
];

const randomWords32 = (count: number): Uint32Array => {
  const arr = new Uint32Array(count);
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < count; i++) {
      arr[i] = Math.floor(Math.random() * 0x100000000);
    }
  }
  return arr;
};

const getRandomBigInt = (min: bigint, max: bigint): bigint => {
  const range = max - min;
  if (range <= 1n) return min;
  const bits = range.toString(2).length;
  const chunks = Math.ceil(bits / 32);

  while (true) {
    const words = randomWords32(chunks);
    let result = 0n;
    for (let i = 0; i < chunks; i++) {
      result = (result << 32n) | BigInt(words[i]);
    }
    const modVal = result % range;
    return min + modVal;
  }
};

export const generatePrime = (bits: number): bigint => {
  if (bits < 2) return 2n;
  const min = (1n << BigInt(bits - 1)) | 1n;
  const max = (1n << BigInt(bits)) - 1n;
  const startTime = Date.now();

  while (true) {
    let candidate = getRandomBigInt(min, max);
    candidate |= 1n;
    candidate |= (1n << BigInt(bits - 1));

    let compositeSmall = false;
    for (let i = 0; i < SMALL_TRIAL_PRIMES.length; i++) {
      const sp = SMALL_TRIAL_PRIMES[i];
      if (candidate === sp) return sp;
      if (candidate % sp === 0n) {
        compositeSmall = true;
        break;
      }
    }
    if (compositeSmall) continue;

    if (isProbablePrime(candidate, 12)) return candidate;

    if (Date.now() - startTime > 12000) {
      throw new Error(`Prime generation timeout for ${bits}-bit target`);
    }
  }
};

// --- REAL FACTORIZATION ALGORITHMS (Topology Application) ---

/**
 * Pollard's Rho Algorithm (Brent's improvement).
 * Maps to "Geodesic Path Finding in Phase Space".
 * Effective for finding small factors of composite numbers.
 */
export const pollardRhoAttack = async (n: bigint, callback: (log: string) => void): Promise<bigint | null> => {
    if (n % 2n === 0n) return 2n;
    if (isProbablePrime(n)) return null;

    let x = BigInt(Math.floor(Math.random() * 1000)) + 2n;
    let y = x;
    let c = BigInt(Math.floor(Math.random() * 1000)) + 1n;
    let g = 1n;
    let q = 1n;
    let xs = 1n, ys = 1n;
    let m = 128n;
    let r = 1n;

    let steps = 0;
    const MAX_STEPS = 1000000; // Safety break for browser

    while (g === 1n) {
        x = y;
        for (let i = 0n; i < r; i++) {
            y = (y * y + c) % n;
        }
        let k = 0n;
        while (k < r && g === 1n) {
            ys = y;
            for (let i = 0n; i < BigInt(Math.min(Number(m), Number(r - k))); i++) {
                y = (y * y + c) % n;
                q = (q * (x > y ? x - y : y - x)) % n;
            }
            g = gcd(q, n);
            k += m;
            steps++;
            
            if (steps % 1000 === 0) {
                 callback(`Scan: t=${steps} | Ricci Flow Metric: ${g.toString()}`);
                 await new Promise(res => setTimeout(res, 0)); // Non-blocking UI
            }
            if (steps > MAX_STEPS) return null; // Singularity not found in time
        }
        r *= 2n;
    }

    if (g === n) {
        while (true) {
            ys = (ys * ys + c) % n;
            g = gcd(xs > ys ? xs - ys : ys - xs, n);
            if (g > 1n) break;
        }
    }

    if (g > 1n && g < n) return g;
    return null;
};


// --- Factorization Utilities (Dixon's Method) ---

export const getSmoothFactorization = (val: bigint, base: number[]): number[] | null => {
  const exponents = new Array(base.length).fill(0);
  let temp = val;

  for (let i = 0; i < base.length; i++) {
    const p = BigInt(base[i]);
    while (temp % p === 0n) {
      exponents[i]++;
      temp /= p;
    }
  }

  if (temp === 1n) {
    return exponents;
  }
  return null;
};

export const solveMatrixMod2 = (matrix: number[][]): number[][] => {
  const rows = matrix.length;
  if (rows === 0) return [];
  const cols = matrix[0].length;
  
  interface MatrixRow {
    data: number[];
    history: number[]; 
  }
  
  let workMatrix: MatrixRow[] = matrix.map((row, idx) => {
    const history = new Array(rows).fill(0);
    history[idx] = 1;
    return { data: [...row], history };
  });

  let pivotRow = 0;
  const pivotCols: number[] = [];

  for (let j = 0; j < cols && pivotRow < rows; j++) {
    let i = pivotRow;
    while (i < rows && workMatrix[i].data[j] === 0) {
      i++;
    }

    if (i < rows) {
      [workMatrix[pivotRow], workMatrix[i]] = [workMatrix[i], workMatrix[pivotRow]];
      pivotCols.push(j);
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

  const dependencies: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const isZeroRow = workMatrix[i].data.every(val => val === 0);
    if (isZeroRow) {
      dependencies.push(workMatrix[i].history);
    }
  }

  return dependencies;
};