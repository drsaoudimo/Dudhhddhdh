
import { gcd, isProbablePrime } from './mathUtils';

// Matrices provided by the user for algebraic shortcut
const M_CORRECTED = [
  [8.87, 264.85, 462.24, 545.53, 337.34, 220.07, 406.48, 159.03, 325.79, 331.59, 141.21, 147.85, 405.12],
  [53.02, 42.75, 84.66, 55.93, 76.23, 50.61, 12.81, 46.08, 17.17, 8.58, 38.43, 34.58, 5.22],
  [6.32, 1.75, 0.65, 0.93, 0.13, 0.41, 1.73, 0.41, 0.71, 0.84, 0.75, 0.40, 0.86]
];

const pollardRho = async (n: bigint) => {
  if (n % 2n === 0n) return 2n;
  if (isProbablePrime(n)) return null;

  let x = BigInt(Math.floor(Math.random() * 1000)) + 2n;
  let y = x;
  let c = BigInt(Math.floor(Math.random() * 1000)) + 1n;
  let g = 1n;
  let r = 1n;
  let q = 1n;
  let m = 128n;
  let ys = 1n;
  let steps = 0;

  while (g === 1n) {
    x = y;
    for (let i = 0n; i < r; i++) y = (y * y + c) % n;
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
      
      // Send heartbeats every 5000 steps to avoid message overhead
      if (steps % 5000 === 0) {
        self.postMessage({ type: 'progress', steps, g: g.toString() });
      }
    }
    r *= 2n;
    if (steps > 5000000) break; // Safety
  }
  
  if (g === n) {
     // Fallback to simple walk
     let xs = x;
     while (true) {
        ys = (ys * ys + c) % n;
        g = gcd(xs > ys ? xs - ys : ys - xs, n);
        if (g > 1n) break;
     }
  }

  return (g > 1n && g < n) ? g : null;
};

self.onmessage = async (e) => {
  const { n, type } = e.data;
  if (type === 'start') {
    const N = BigInt(n);
    const result = await pollardRho(N);
    self.postMessage({ type: 'result', factor: result ? result.toString() : null });
  }
};
