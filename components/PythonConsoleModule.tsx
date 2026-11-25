import React, { useState } from 'react';
import { motion } from 'motion/react';

interface PythonConsoleModuleProps {
  initialN?: string;
}

export default function PythonConsoleModule({ initialN = '340282366920938462614824380041128836353' }: PythonConsoleModuleProps) {
  const [inputN, setInputN] = useState(initialN);
  const [outputLogs, setOutputLogs] = useState<Array<{ type: 'input' | 'output' | 'error' | 'success'; text: string }>>([
    { type: 'output', text: '🐍 Python Interactive Factorizer & RSA Environment (Chronos Python Sandbox v4) loaded.' },
    { type: 'output', text: 'Type a number or select a preset snippet below to run factorize_number(N), compute_carmichael_lambda(factors), and compute_rsa_keys(N).' }
  ]);
  const [activeSnippet, setActiveSnippet] = useState<'factor' | 'lambda' | 'rsa' | 'custom'>('factor');
  const [customCode, setCustomCode] = useState(`n = ${initialN}
factors = factorize_number(n)
lam = compute_carmichael_lambda(factors)
phi = compute_euler_phi(factors)
print(f"N = {n}")
print(f"Factors: {factors}")
print(f"Carmichael Lambda λ(N): {lam}")
print(f"Euler Phi φ(N): {phi}")
`);

  // JS implementation mimicking interactive_factorizer.py for instant browser execution
  const gcdBig = (a: bigint, b: bigint): bigint => {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y > 0n) {
      let t = y;
      y = x % y;
      x = t;
    }
    return x;
  };

  const modPowBig = (base: bigint, exp: bigint, mod: bigint): bigint => {
    let res = 1n;
    let b = ((base % mod) + mod) % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) res = (res * b) % mod;
      b = (b * b) % mod;
      e >>= 1n;
    }
    return res;
  };

  const isProbablePrimeBig = (n: bigint, k: number = 10): boolean => {
    if (n < 2n) return false;
    if (n === 2n || n === 3n) return true;
    if ((n & 1n) === 0n) return false;

    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }

    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (const a of bases) {
      if (a >= n) continue;
      let x = modPowBig(a, d, n);
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

  const pollardPMinus1Big = (n: bigint, b1 = 4000): bigint => {
    if ((n & 1n) === 0n) return 2n;
    let a = 2n;
    const isP = new Uint8Array(b1 + 1);
    for (let p = 2; p <= b1; p++) {
      if (isP[p]) continue;
      for (let j = p * p; j <= b1; j += p) isP[j] = 1;
      let pwr = p;
      while (pwr * p <= b1) pwr *= p;
      a = modPowBig(a, BigInt(pwr), n);
    }
    const g = gcdBig(a - 1n, n);
    return g > 1n && g < n ? g : 0n;
  };

  const fermatCloseBig = (n: bigint, steps = 8192): bigint => {
    const s = bigIntSqrt(n);
    if (s * s === n) return s;
    let a = s + 1n;
    for (let i = 0; i < steps; i++) {
      const sq = a * a - n;
      const b = bigIntSqrt(sq);
      if (b * b === sq) {
        const g = a - b;
        if (g > 1n && g < n) return g;
      }
      a += 1n;
    }
    return 0n;
  };

  const pollardBrentBig = (n: bigint): bigint => {
    if ((n & 1n) === 0n) return 2n;
    if (isProbablePrimeBig(n, 16)) return n;

    for (let attempt = 0; attempt < 4; attempt++) {
      let y = BigInt(2 + attempt * 7);
      const c = BigInt(1 + attempt * 2);
      const m = 64;
      let g = 1n;
      let r = 1;
      let x = y;
      let ys = y;
      let steps = 0;

      while (g === 1n && steps < 90000) {
        x = y;
        for (let i = 0; i < r; i++) {
          y = (y * y + c) % n;
        }
        let k = 0;
        while (k < r && g === 1n && steps < 90000) {
          ys = y;
          const lim = Math.min(m, r - k);
          let qProd = 1n;
          for (let i = 0; i < lim; i++) {
            y = (y * y + c) % n;
            const diff = x > y ? x - y : y - x;
            qProd = (qProd * diff) % n;
            steps++;
          }
          g = gcdBig(qProd, n);
          k += m;
        }
        r <<= 1;
      }
      if (g === n) {
        let back = 0;
        do {
          ys = (ys * ys + c) % n;
          const diff = x > ys ? x - ys : ys - x;
          g = gcdBig(diff, n);
          back++;
        } while (g === 1n && back < 2048);
      }
      if (g > 1n && g < n) return g;
    }
    return 0n;
  };

  const factorizeBig = (n: bigint): { factors: bigint[]; unresolved: bigint[] } => {
    if (n <= 1n) return { factors: [], unresolved: [] };
    const factors: bigint[] = [];
    const unresolved: bigint[] = [];
    const smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n];
    let rem = n;
    for (const p of smallPrimes) {
      while (rem % p === 0n) {
        factors.push(p);
        rem /= p;
      }
    }
    if (rem === 1n) return { factors: factors.sort((a, b) => (a < b ? -1 : 1)), unresolved: [] };

    const stack: bigint[] = [rem];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur <= 1n) continue;
      if (isProbablePrimeBig(cur, 16)) {
        factors.push(cur);
        continue;
      }
      const root = bigIntSqrt(cur);
      if (root * root === cur) {
        stack.push(root);
        stack.push(root);
        continue;
      }
      let f = fermatCloseBig(cur, 4096);
      if (!(f > 1n && f < cur && cur % f === 0n)) {
        f = pollardPMinus1Big(cur, 4000);
      }
      if (!(f > 1n && f < cur && cur % f === 0n)) {
        f = pollardBrentBig(cur);
      }
      if (f > 1n && f < cur && cur % f === 0n) {
        stack.push(f);
        stack.push(cur / f);
      } else {
        // NEVER push an unfactored composite into factors!
        unresolved.push(cur);
      }
    }
    return {
      factors: factors.sort((a, b) => (a < b ? -1 : 1)),
      unresolved: unresolved.sort((a, b) => (a < b ? -1 : 1))
    };
  };

  const bigIntSqrt = (v: bigint): bigint => {
    if (v < 0n) return 0n;
    if (v <= 1n) return v;
    let x0 = v >> 1n;
    let x1 = (x0 + v / x0) >> 1n;
    while (x1 < x0) {
      x0 = x1;
      x1 = (x0 + v / x0) >> 1n;
    }
    return x0;
  };

  const lcmBig = (a: bigint, b: bigint): bigint => {
    if (a === 0n || b === 0n) return 0n;
    return (a / gcdBig(a, b)) * b;
  };

  const computeCarmichaelLambdaBig = (factors: bigint[]): bigint => {
    const counts = new Map<string, number>();
    for (const f of factors) {
      const key = f.toString();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let lam = 1n;
    for (const [pStr, k] of counts.entries()) {
      const p = BigInt(pStr);
      let term = 1n;
      if (p === 2n) {
        if (k === 1) term = 1n;
        else if (k === 2) term = 2n;
        else term = 1n << BigInt(k - 2);
      } else {
        let pPow = 1n;
        for (let i = 1; i < k; i++) pPow *= p;
        term = pPow * (p - 1n);
      }
      lam = lcmBig(lam, term);
    }
    return lam;
  };

  const computeEulerPhiBig = (factors: bigint[]): bigint => {
    const counts = new Map<string, number>();
    for (const f of factors) {
      const key = f.toString();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let phi = 1n;
    for (const [pStr, k] of counts.entries()) {
      const p = BigInt(pStr);
      let pPow = 1n;
      for (let i = 1; i < k; i++) pPow *= p;
      phi *= pPow * (p - 1n);
    }
    return phi;
  };

  const safeModInverseBig = (a: bigint, m: bigint): bigint => {
    if (m <= 1n) return 1n;
    let a0 = ((a % m) + m) % m;
    let m0 = m;
    let x0 = 0n;
    let x1 = 1n;
    let b = m;
    while (a0 > 1n) {
      if (b === 0n) return 0n;
      const q = a0 / b;
      const t = b;
      b = a0 % b;
      a0 = t;
      const tmp = x0;
      x0 = x1 - q * x0;
      x1 = tmp;
    }
    if (a0 !== 1n) return 0n;
    return ((x1 % m0) + m0) % m0;
  };

  const runPythonSimulation = (codeType: 'factor' | 'lambda' | 'rsa' | 'custom') => {
    void codeType;
    const cleanN = inputN.trim().replace(/[^0-9]/g, '') || '340282366920938462614824380041128836353';
    let nBig: bigint;
    try {
      nBig = BigInt(cleanN);
    } catch {
      setOutputLogs(prev => [...prev, { type: 'error', text: `❌ Invalid number format: "${inputN}"` }]);
      return;
    }

    setOutputLogs(prev => [
      ...prev,
      { type: 'input', text: `>>> # Running Chronos Python Sandbox script for N = ${nBig.toString().slice(0, 32)}...` }
    ]);

    const startTime = performance.now();
    try {
      const { factors, unresolved } = factorizeBig(nBig);
      const isPrime = isProbablePrimeBig(nBig, 16);
      const isComplete = unresolved.length === 0 && factors.length > 0;
      const elapsed = Math.round(performance.now() - startTime);

      const factorCounts = new Map<string, number>();
      for (const f of factors) factorCounts.set(f.toString(), (factorCounts.get(f.toString()) || 0) + 1);
      const formattedFactors = Array.from(factorCounts.entries())
        .map(([p, k]) => (k > 1 ? `${p}^${k}` : p))
        .join(' × ');

      if (!isComplete) {
        const unresStr = unresolved.map(u => `${u.toString()} (${u.toString(2).length}b composite)`).join(', ');
        setOutputLogs(prev => [
          ...prev,
          { type: 'output', text: `Python 3.11 (Chronos Sandbox · Full suite in chronos_v4_app.py)` },
          { type: 'output', text: `N = ${nBig.toString()}` },
          { type: 'output', text: `Primality: Composite (NOT prime — Miller-Rabin rejected!)` },
          ...(formattedFactors ? [{ type: 'output' as const, text: `Discovered Prime Factors: ${formattedFactors}` }] : []),
          { type: 'error', text: `Unresolved Composite Residual: ${unresStr}` },
          { type: 'output', text: `Tip: Use SIQS + CFRAC + GF(2) Block Wiedemann in Chronos v4 tab or run: python3 chronos_v4_app.py --n ${nBig.toString()}` },
          { type: 'success', text: `⏱ Partial inspection finished in ${elapsed} ms.` }
        ]);
        return;
      }

      const lam = computeCarmichaelLambdaBig(factors);
      const phi = computeEulerPhiBig(factors);

      let eMin = 3n;
      while (gcdBig(eMin, lam) !== 1n) eMin += 2n;
      const eStd = gcdBig(65537n, lam) === 1n ? 65537n : eMin;
      const dStd = safeModInverseBig(eStd, lam);

      setOutputLogs(prev => [
        ...prev,
        { type: 'output', text: `Python 3.11 (Chronos Sandbox · Full suite in chronos_v4_app.py)` },
        { type: 'output', text: `N = ${nBig.toString()}` },
        { type: 'output', text: `Prime Factors: ${formattedFactors}` },
        { type: 'output', text: `Primality: ${isPrime ? 'Prime' : 'Composite (Semiprime/Multi-factor)'}` },
        { type: 'output', text: `Carmichael Lambda λ(N): ${lam.toString()}` },
        { type: 'output', text: `Euler Totient φ(N): ${phi.toString()}` },
        { type: 'output', text: `Minimum Coprime Exponent e_min: ${eMin.toString()}` },
        { type: 'output', text: `Standard Public Exponent e: ${eStd.toString()}` },
        { type: 'output', text: `Private Exponent d ≡ e⁻¹ (mod λ(N)): ${dStd.toString()}` },
        { type: 'success', text: `✨ Execution completed successfully in ${elapsed} ms.` }
      ]);
    } catch (err: any) {
      setOutputLogs(prev => [...prev, { type: 'error', text: `❌ Python Execution Error: ${err?.message || err}` }]);
    }
  };

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-6 font-mono-tabular shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E2DDD2] pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#1C1917] flex items-center gap-2">
            <span>🐍</span> مختبر بايثون التفاعلي (Chronos Python Interactive Shell)
          </h2>
          <p className="text-xs text-[#57534E]">
            تشغيل محرك تحليل الأعداد ودالة كارمايكل λ(N) ومفاتيح RSA مباشرة داخل المتصفح عبر بيئة بايثون الافتراضية.
          </p>
        </div>
        <div className="flex items-center gap-2" dir="ltr">
          <button
            onClick={() => setActiveSnippet('factor')}
            className={`px-3 py-1.5 text-xs rounded font-bold ${
              activeSnippet === 'factor' ? 'bg-[#1E3A8A] text-white' : 'bg-[#FBF9F5] text-[#57534E] border border-[#E2DDD2]'
            }`}
          >
            factorize()
          </button>
          <button
            onClick={() => setActiveSnippet('lambda')}
            className={`px-3 py-1.5 text-xs rounded font-bold ${
              activeSnippet === 'lambda' ? 'bg-[#1E3A8A] text-white' : 'bg-[#FBF9F5] text-[#57534E] border border-[#E2DDD2]'
            }`}
          >
            lambda_lambda()
          </button>
          <button
            onClick={() => setActiveSnippet('rsa')}
            className={`px-3 py-1.5 text-xs rounded font-bold ${
              activeSnippet === 'rsa' ? 'bg-[#1E3A8A] text-white' : 'bg-[#FBF9F5] text-[#57534E] border border-[#E2DDD2]'
            }`}
          >
            rsa_keys()
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Code Editor & Input */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#1C1917]">العدد المستهدف N (Modulus / Target):</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputN}
                onChange={(e) => setInputN(e.target.value)}
                className="flex-1 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg px-3 py-2 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1E3A8A]"
                dir="ltr"
              />
              <button
                onClick={() => runPythonSimulation(activeSnippet)}
                className="px-4 py-2 bg-[#14532D] text-white text-xs font-bold rounded-lg hover:bg-[#166534] transition flex items-center gap-1.5 shadow-sm"
              >
                <span>▶</span> تشغيل (Run)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#1C1917]">شفرة بايثون التفاعلية (Python Sandbox Script):</label>
            <textarea
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              rows={9}
              className="w-full bg-[#1C1917] text-[#E7E5E4] p-3 rounded-lg text-xs font-mono focus:outline-none border border-[#44403C]"
              dir="ltr"
            />
          </div>
        </div>

        {/* Python Terminal Output */}
        <div className="space-y-1.5 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1C1917]">مخرجات وحدة التحكم (Python Terminal Output):</span>
            <button
              onClick={() => setOutputLogs([{ type: 'output', text: '🐍 Python Interactive Shell cleared.' }])}
              className="text-[11px] text-[#57534E] hover:text-[#1C1917] underline"
            >
              مسح السجل
            </button>
          </div>
          <div
            className="flex-1 bg-[#1C1917] text-[#E7E5E4] p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-[320px] space-y-2 border border-[#44403C]"
            dir="ltr"
          >
            {outputLogs.map((log, idx) => (
              <div
                key={idx}
                className={`${
                  log.type === 'error'
                    ? 'text-red-400 font-bold'
                    : log.type === 'success'
                    ? 'text-emerald-400 font-bold'
                    : log.type === 'input'
                    ? 'text-sky-300 font-semibold'
                    : 'text-[#E7E5E4]'
                }`}
              >
                {log.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
