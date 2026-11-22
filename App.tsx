import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import forge from 'node-forge';
import { generatePrime } from './mathUtils';
import { RSAKey, SimulationState } from './types';
import TerminalLog from './components/TerminalLog';
import Chronos196Dashboard, { ChronosSuyamaInfo, ChronosCfracInfo, WorkerThreadStat, Gf2PoolStats } from './components/Chronos196Dashboard';
import FactorizerModule, { PrimaryFactorAlgorithm } from './components/FactorizerModule';
import CoppersmithLabPanel from './components/CoppersmithLabPanel';
import Zf1819LabPanel from './components/Zf1819LabPanel';
import PsiFactorLabPanel from './components/PsiFactorLabPanel';
import Rsa500PlusLabPanel from './components/Rsa500PlusLabPanel';
import CfracTelemetryPanel from './components/CfracTelemetryPanel';
import ZetaFactorPanel, { ZetaLiveTrace } from './components/ZetaFactorPanel';
import MatrixInspectorModule from './components/MatrixInspectorModule';
import InfiniteMatrixModule from './components/InfiniteMatrixModule';
import ZetaSpectrumModule from './components/ZetaSpectrumModule';
import ZfProjectSummaryModule from './components/ZfProjectSummaryModule';
import { PRIMES_LIST } from './constants';
import { A1_MATRIX, ANT_MATRIX, M_MATRIX, generateSimulationMatrices } from './matricesData';
import { ALGEBRAIC_WORKER_CODE } from './algebraicWorker';
import { GLEEOK_WORKER_CODE } from './gleeokWorker';
import { SPECTRAL_RESONANCE_WORKER_CODE } from './spectralResonanceWorker';
import { GLEEOK_MMFR_WORKER_CODE } from './gleeokMmfrWorker';
import { ZETA_WORKER_CODE } from './zetaWorker';
import { UNBOUNDED_QS_WORKER_CODE } from './unboundedQsWorker';
import { CHRONOS_WORKER_CODE } from './chronosWorker';
import { CFRAC_WORKER_CODE } from './cfracWorker';
import {
  buildMpqsFactorBase,
  buildCfracSharedUnionFactorBase,
  CfracSharedUnionFb,
  selectKnuthSchroeppelMultiplier,
  selectRankedKnuthSchroeppelMultipliers,
  solveBlockWiedemann,
  SingleLargePrimePool,
  isProbablePrimeBig,
  SmoothRelation
} from './mpqsGf2Solver';
import { analyzeSnfsAndCadoParams } from './snfsDetector';
import { computeV4SieveDiagnostics, EmpiricalBenchmarkRun, SieveAllocationMode } from './v4FallbackOptimizer';
import { runUnifiedFastScout, UnifiedRaceHints, UnifiedRaceSummary } from './lib/chronosUnifiedRace';
import { generateUltraPreciseZetaSeeds, UltraPreciseZetaSeed } from './lib/zfSmartIntegrator';
import { benchmarkRedcVsNaive, getWorkerMontRedcCode, RedcBenchmarkResult } from './lib/montgomeryRedcKernel';
import { Language, translations } from './translations';

interface GleeokStats {
  nBits: number;
  permsDone: number;
  currentRound: number;
  featureSize: number;
  stability: number;
  entropy: number;
  bitDensity: number;
  convergence: number;
  qualityIndex: number;
  readyCurves: number;
  curveAdds: number;
  modMuls: number;
  currentCurveInfo: any;
  maxPriority: number;
  minPriority: number;
  avgPriority: number;
}

const DEFAULT_128_N = "340282366920938462614824380041128836353"; // 18446744073709551557 * 18446744073709551629
const DEFAULT_196_N = "25345924542096859410889582407385856782286168978105125446929";
const DEFAULT_196_P = "159278732114318224236124748923";
const DEFAULT_196_Q = "159129371546638582179743517923";

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('ar');
  const t = translations[lang];
  const isRTL = lang === 'ar';

  const [keySize, setKeySize] = useState<number>(116);
  const [strategy, setStrategy] = useState<'chronos-196' | 'cfrac' | 'unbounded-qs' | 'hybrid' | 'zeta' | 'mmfr' | 'gleeok' | 'ecm' | 'pollard' | 'algebraic'>('chronos-196');
  const [primaryAlgorithm, setPrimaryAlgorithm] = useState<PrimaryFactorAlgorithm>('chronos-196');
  const [view, setView] = useState<'factorizer' | 'inspector' | 'infinite' | 'zeta' | 'zf-summary'>('factorizer');
  const [selectedBlockPair, setSelectedBlockPair] = useState<{ p: number; q: number }>({ p: 7, q: 53 });
  const [zetaTrace, setZetaTrace] = useState<ZetaLiveTrace | null>(null);
  const [bd500ZetaSeeds, setBd500ZetaSeeds] = useState<UltraPreciseZetaSeed[]>([]);

  // Chronos v2 Hybrid states
  const [chronosCycle, setChronosCycle] = useState<number>(1);
  const [chronosSuyamaInfo, setChronosSuyamaInfo] = useState<ChronosSuyamaInfo | null>(null);
  const [cfracInfo, setCfracInfo] = useState<ChronosCfracInfo | null>(null);
  const [chronosMDual, setChronosMDual] = useState<number[][] | null>(null);
  const [chronosCurves, setChronosCurves] = useState<number>(0);
  const [chronosSmooth, setChronosSmooth] = useState<number>(0);
  const [chronosSteps, setChronosSteps] = useState<number>(0);

  // Unbounded Continuous QS states
  const [qsCycle, setQsCycle] = useState<number>(1);
  const [qsLane, setQsLane] = useState<string>('Lane A (Unit Lift)');
  const [qsUN, setQsUN] = useState<number>(1);
  const [qsValidPairs, setQsValidPairs] = useState<number[][]>([[1, 1], [3, 7], [7, 3], [9, 9]]);
  const [qsLiftsCount, setQsLiftsCount] = useState<number>(4);
  const [qsModPower, setQsModPower] = useState<string>('10000');
  const [qsSteps, setQsSteps] = useState<number>(0);
  const [qsTotalCurves, setQsTotalCurves] = useState<number>(0);
  const [qsCandidateT, setQsCandidateT] = useState<string>('');
  const [qsHenselDepth, setQsHenselDepth] = useState<number>(1);
  const [qsHenselMaxDepth, setQsHenselMaxDepth] = useState<number>(20);
  const [qsDecadicP, setQsDecadicP] = useState<string>('');
  const [qsDecadicQ, setQsDecadicQ] = useState<string>('');
  const [qsNewtonRate, setQsNewtonRate] = useState<number>(0);
  const [qsInstantGcdCount, setQsInstantGcdCount] = useState<number>(0);
  const [qsUserStartDepth, setQsUserStartDepth] = useState<number>(1);
  const [qsUserMaxDepth, setQsUserMaxDepth] = useState<number | 'auto'>('auto');
  
  const [rsaKey, setRsaKey] = useState<RSAKey | null>({
    p: DEFAULT_196_P,
    q: DEFAULT_196_Q,
    n: DEFAULT_196_N,
    e: "65537",
    d: "???",
    bits: 196
  });

  const [workerActive, setWorkerActive] = useState(false);
  const [cpuUsage, setCpuUsage] = useState(0);
  const [gleeokStats, setGleeokStats] = useState<GleeokStats | null>(null);

  // Hybrid states (kept for worker trace compatibility)
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3>(1);
  const [hybridFingerprint, setHybridFingerprint] = useState<any>(null);
  const [hybridTrace, setHybridTrace] = useState<any>(null);
  const [hybridEcmStats, setHybridEcmStats] = useState<any>(null);

  const [simState, setSimState] = useState<SimulationState>({
    status: 'idle',
    logs: [
      ">> Chronos-196 Master Hybrid System Initialized.",
      `>> Modulus N: ${DEFAULT_196_N} (196-bit).`,
      ">> Suyama Z/12Z Torsion ECM & CFRAC Ready."
    ],
    relations: [],
    factorBase: PRIMES_LIST.slice(0, 15),
    matrix: [],
    solution: null
  });
  
  const [showInputN, setShowInputN] = useState<boolean>(false);
  const [customN, setCustomN] = useState<string>("");
  const [showImportPem, setShowImportPem] = useState<boolean>(false);
  const [pemText, setPemText] = useState<string>("");
  const [startTime, setStartTime] = useState<number>(0);

  // Dynamic Multi-Worker Pool & GF(2) Matrix + v4 Safe Fallback states
  const [workerCountMode, setWorkerCountMode] = useState<number | 'auto'>('auto');
  const [sieveMode, setSieveMode] = useState<SieveAllocationMode>('v4-fallback');
  const [benchmarkHistory, setBenchmarkHistory] = useState<EmpiricalBenchmarkRun[]>([]);
  const [workerThreadsStats, setWorkerThreadsStats] = useState<WorkerThreadStat[]>([]);
  const [gf2Stats, setGf2Stats] = useState<Gf2PoolStats>({
    collected: 0,
    target: 123,
    factorBaseSize: 115,
    matrixSolves: 0,
    lastSource: 'Standby'
  });
  const [unifiedHints, setUnifiedHints] = useState<UnifiedRaceHints>({
    publicExponentE: '',
    partialPrimeP0: '',
    unknownBits: undefined
  });
  const [unifiedRace, setUnifiedRace] = useState<UnifiedRaceSummary>({
    status: 'idle',
    winningEngine: null,
    factors: [],
    verifiedProduct: false,
    verifiedPrimes: false,
    elapsedMs: 0,
    totalOperations: 0
  });
  const [redcSpeedupInfo, setRedcSpeedupInfo] = useState<RedcBenchmarkResult | null>(null);

  useEffect(() => {
    const rawN = rsaKey?.n?.trim();
    if (!rawN) {
      setRedcSpeedupInfo(null);
      return;
    }
    try {
      const nBig = BigInt(rawN);
      if (nBig > 2n && (nBig & 1n) === 1n) {
        const res = benchmarkRedcVsNaive(nBig, 'gf2-solver');
        setRedcSpeedupInfo(res);
      } else {
        setRedcSpeedupInfo(null);
      }
    } catch {
      setRedcSpeedupInfo(null);
    }
  }, [rsaKey?.n]);

  const workersRef = useRef<Worker[]>([]);
  const workerUrlsRef = useRef<string[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const raceTimerRef = useRef<number | null>(null);

  const getAutoWorkersCount = (bits: number): number => {
    const hw = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 8;
    if (bits <= 96) return Math.min(2, hw);
    if (bits <= 128) return Math.min(4, hw);
    if (bits <= 220) return Math.min(12, Math.max(4, hw));
    if (bits <= 480) return Math.min(8, hw);
    return Math.min(16, Math.max(8, hw));
  };

  const targetBits = rsaKey?.bits || 196;
  const effectiveWorkerCount = workerCountMode === 'auto' ? getAutoWorkersCount(targetBits) : workerCountMode;

  const ecmWorkerCode = getWorkerMontRedcCode() + `
    const gcd = (a, b) => {
        let x = a < 0n ? -a : a;
        let y = b < 0n ? -b : b;
        while (y > 0n) { let t = y; y = x % y; x = t; }
        return x;
    };
    const modInverse = (a, m) => {
        let m0 = m, t, q;
        let x0 = 0n, x1 = 1n;
        a = ((a % m) + m) % m;
        if (m === 1n) return 0n;
        while (a > 1n) {
            if (m === 0n) return 0n;
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
    const getPrimesUpTo = (limit) => {
        const primes = [];
        const sieve = new Uint8Array(limit + 1);
        for (let i = 2; i <= limit; i++) {
            if (!sieve[i]) {
                primes.push(i);
                for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
            }
        }
        return primes;
    };
    const ecmAttack = async (N) => {
        if ((N & 1n) === 0n) return { factor: 2n, attempts: 1 };
        if (N % 3n === 0n) return { factor: 3n, attempts: 1 };

        const nBits = N.toString(2).length;
        const ctx = createMontgomeryCtx(N);
        const redcBench = benchmarkWorkerRedcVsNaive(ctx, 'web-worker');
        self.postMessage({ type: 'chronos_redc_benchmark', ...redcBench });

        const B1 = nBits > 500 ? 50000 : 20000;
        const B2 = nBits > 500 ? 1500000 : 480000;
        const primesB1 = getPrimesUpTo(B1);

        let attempts = 0;
        const maxAttempts = 80;
        while (attempts < maxAttempts) {
            attempts++;
            const sigma = BigInt(attempts * 31337 + 17) + (BigInt(Math.floor(Math.random() * 100000)) + 6n);
            const res = runUnifiedEcmStage1And2(
                N,
                sigma,
                B1,
                B2,
                primesB1,
                modInverse,
                gcd,
                (prog) => {
                    self.postMessage({
                        type: 'chronos_suyama_stage',
                        workerId: 0,
                        totalWorkers: 1,
                        role: 'ecm',
                        cycle: 1,
                        curveIndex: attempts,
                        sigma: sigma.toString() + ' · ' + (prog.curveFamily === 'montgomery' ? 'Montgomery' : 'Suyama'),
                        b1Bound: B1,
                        b2Bound: B2,
                        torsionCertified: true,
                        stagePhase: prog.stagePhase,
                        curveFamily: prog.curveFamily,
                        autoSwitchReason: prog.autoSwitchReason,
                        b2ProgressPct: prog.b2ProgressPct,
                        b2GiantStepsDone: prog.b2GiantStepsDone,
                        b2GiantStepsTotal: prog.b2GiantStepsTotal,
                        dStep: prog.dStep
                    });
                },
                ctx
            );
            if (res && res.factor && res.factor > 1n && res.factor < N) {
                return { factor: res.factor, attempts, stage: res.stage };
            }
            if (attempts % 2 === 0) {
                self.postMessage({ type: 'progress', steps: attempts, total: maxAttempts });
                await new Promise(r => setTimeout(r, 0));
            }
        }
        return null;
    };

    self.onmessage = async (e) => {
        const { n, type } = e.data;
        if (type === 'start') {
            try {
                self.postMessage({ type: 'log', message: "Initializing Unified Montgomery-REDC ECM Stage 1 + Stage 2 (B2)..." });
                const res = await ecmAttack(BigInt(n));
                self.postMessage({ type: 'result', factor: res ? res.factor.toString() : null, method: res?.stage || "ECM Stage 1+2 REDC", steps: res ? res.attempts : 0 });
            } catch (err) {
                self.postMessage({ type: 'error', message: err.message });
            }
        }
    };
  `;

  const pollardWorkerCode = `
    const gcd = (a, b) => {
      while (b > 0n) { let t = b; b = a % b; a = t; }
      return a;
    };
    const modPow = (base, exp, mod) => {
      let res = 1n; base %= mod;
      while (exp > 0n) {
        if (exp % 2n === 1n) res = (res * base) % mod;
        base = (base * base) % mod;
        exp /= 2n;
      }
      return res;
    };
    const isProbablePrime = (n, k = 5) => {
      if (n === 2n || n === 3n) return true;
      if (n % 2n === 0n || n < 2n) return false;
      let d = n - 1n; let s = 0;
      while (d % 2n === 0n) { d /= 2n; s++; }
      for (let i = 0; i < k; i++) {
        const a = 2n + BigInt(Math.floor(Math.random() * 100) + 1);
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        let comp = true;
        for (let r = 1; r < s; r++) {
          x = (x * x) % n;
          if (x === n - 1n) { comp = false; break; }
        }
        if (comp) return false;
      }
      return true;
    };

    const pollardRho = async (n) => {
      if (n % 2n === 0n) return 2n;
      if (isProbablePrime(n)) return null;
      let x = BigInt(Math.floor(Math.random() * 1000)) + 2n;
      let y = x; let c = BigInt(Math.floor(Math.random() * 1000)) + 1n;
      let g = 1n; let r = 1n; let q = 1n; let m = 128n; let ys = 1n;
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
          k += m; steps++;
          if (steps % 5000 === 0) self.postMessage({ type: 'progress', steps, g: g.toString() });
        }
        r *= 2n;
        if (steps > 2000000) break; 
      }
      if (g === n) {
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
        try {
          const res = await pollardRho(BigInt(n));
          self.postMessage({ type: 'result', factor: res ? res.toString() : null, method: "Pollard Rho" });
        } catch (err) {
          self.postMessage({ type: 'error', message: err.message });
        }
      }
    };
  `;

  useEffect(() => {
    return () => {
      if (raceTimerRef.current) window.clearInterval(raceTimerRef.current);
      workersRef.current.forEach(w => w.terminate());
      workersRef.current = [];
      workerUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      workerUrlsRef.current = [];
      workerRef.current?.terminate();
    };
  }, []);

  const addLog = (msg: string) => {
    setSimState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
  };

  const stopAttack = () => {
    if (raceTimerRef.current) {
      window.clearInterval(raceTimerRef.current);
      raceTimerRef.current = null;
    }
    if (workersRef.current.length > 0) {
      workersRef.current.forEach(w => w.terminate());
      workersRef.current = [];
    }
    workerUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    workerUrlsRef.current = [];
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setWorkerActive(false);
    setCpuUsage(0);
    setWorkerThreadsStats(prev => prev.map(s => ({ ...s, active: false, stage: 'Stopped' })));
    setUnifiedRace(prev => (prev.status === 'racing' ? { ...prev, status: 'idle' } : prev));
    addLog(t.statusFailed);
    setSimState(prev => ({ ...prev, status: 'idle' }));
  };

  const handleCustomNSubmit = () => {
    try {
      const cleanN = customN.replace(/[^0-9]/g, '');
      if (!cleanN) throw new Error("Input empty.");
      const nBig = BigInt(cleanN);
      const bits = nBig.toString(2).length;
      
      setSimState({
        status: 'idle',
        logs: [`>> Manual Injection: ${bits}-bit modulus initialized.`, `N = ${cleanN}`],
        relations: [], 
        factorBase: PRIMES_LIST.slice(0, 15), 
        matrix: [], 
        solution: null
      });

      setRsaKey({ n: nBig.toString(), p: "???", q: "???", e: "65537", d: "???", bits: bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setBd500ZetaSeeds([]);
      setShowInputN(false);
      setCustomN("");
      setHybridFingerprint(null);
      setHybridTrace(null);
      setHybridEcmStats(null);
    } catch(e: any) {
      addLog(`Error: ${e.message}`);
    }
  };

  const handlePemSubmit = () => {
    try {
      if (!pemText.trim()) throw new Error("Input is empty.");
      
      let key;
      let p = "???", q = "???", d = "???";
      
      if (pemText.includes("PRIVATE KEY")) {
        key = forge.pki.privateKeyFromPem(pemText);
        p = key.p.toString(10);
        q = key.q.toString(10);
        d = key.d.toString(10);
      } else if (pemText.includes("PUBLIC KEY")) {
        key = forge.pki.publicKeyFromPem(pemText);
      } else {
        throw new Error("Could not detect PUBLIC or PRIVATE key in PEM format.");
      }

      const nStr = key.n.toString(10);
      const eStr = key.e.toString(10);
      const bits = BigInt(nStr).toString(2).length;

      setRsaKey({ n: nStr, p, q, e: eStr, d, bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setBd500ZetaSeeds([]);
      if (eStr && eStr !== '65537') {
        setUnifiedHints(prev => ({ ...prev, publicExponentE: eStr }));
      }
      setSimState({
        status: 'idle',
        logs: [`>> Extracted ${bits}-bit key from PEM.`, `N = ${nStr}`],
        relations: [], 
        factorBase: PRIMES_LIST.slice(0, 15), 
        matrix: [], 
        solution: null
      });

      setShowImportPem(false);
      setPemText("");
      setHybridFingerprint(null);
      setHybridTrace(null);
      setHybridEcmStats(null);
    } catch(e: any) {
      addLog(`PEM Error: ${e.message}`);
    }
  };

  const handleSelectBenchmark = (nStr: string) => {
    try {
      const cleanN = nStr.replace(/[^0-9]/g, '');
      const nBig = BigInt(cleanN);
      const bits = nBig.toString(2).length;
      setRsaKey({ n: cleanN, p: "???", q: "???", e: "65537", d: "???", bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setBd500ZetaSeeds([]);
      setSimState({
        status: 'idle',
        logs: [`>> Benchmark Selected: ${bits}-bit Target Modulus.`, `N = ${cleanN}`],
        relations: [],
        factorBase: PRIMES_LIST.slice(0, 15),
        matrix: [],
        solution: null
      });
      setView('factorizer');
      if (primaryAlgorithm !== 'cfrac' && primaryAlgorithm !== 'zeta') {
        setStrategy('chronos-196');
      }
      setChronosMDual(null);
    } catch (e: any) {
      addLog(`Error selecting benchmark: ${e.message}`);
    }
  };

  const handleManualNChange = (newN: string) => {
    try {
      const cleanN = newN.replace(/[^0-9]/g, '');
      if (!cleanN) return;
      const nBig = BigInt(cleanN);
      const bits = nBig.toString(2).length;
      setRsaKey({ n: cleanN, p: "???", q: "???", e: "65537", d: "???", bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setBd500ZetaSeeds([]);
      setSimState({
        status: 'idle',
        logs: [`>> Target Modulus Updated: ${bits}-bit.`, `N = ${cleanN}`],
        relations: [],
        factorBase: PRIMES_LIST.slice(0, 15),
        matrix: [],
        solution: null
      });
      setChronosMDual(null);
    } catch (e: any) {
      addLog(`Error updating modulus: ${e.message}`);
    }
  };

  const runAttack = async (
    overrideN?: string,
    strategyOverride?: 'chronos-196' | 'cfrac' | 'zeta',
    hintsOverride?: UnifiedRaceHints
  ) => {
    const activeStrat = strategyOverride || strategy;
    if (strategyOverride && strategyOverride !== strategy) {
      setStrategy(strategyOverride);
    }
    const cleanOverride = typeof overrideN === 'string' ? overrideN.replace(/[^0-9]/g, '') : '';
    const N = cleanOverride || rsaKey?.n || '';
    if (!N) return;

    // Clean any previously running workers/timers before launching fresh race
    if (raceTimerRef.current) {
      window.clearInterval(raceTimerRef.current);
      raceTimerRef.current = null;
    }
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    workerUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    workerUrlsRef.current = [];

    const nBigInit = BigInt(N);
    const nBitsInit = nBigInit.toString(2).length;
    if (cleanOverride && cleanOverride !== rsaKey?.n) {
      setRsaKey({ n: N, p: "???", q: "???", e: "65537", d: "???", bits: nBitsInit });
    }

    const activeHints: UnifiedRaceHints = hintsOverride ?? {
      publicExponentE: unifiedHints.publicExponentE || (rsaKey?.e && rsaKey.e !== '65537' ? rsaKey.e : ''),
      partialPrimeP0: unifiedHints.partialPrimeP0,
      unknownBits: unifiedHints.unknownBits
    };

    setSimState(prev => ({
      ...prev,
      status: 'sieving',
      logs: [
        `>> Launching [${activeStrat === 'chronos-196' ? 'CHRONOS-V4 UNIFIED RACE' : (activeStrat === 'zeta' ? 'ZETA 48-ZEROS · 500d/160d SPECTRAL ENGINE' : activeStrat.toUpperCase())}] Solver...`,
        `>> Modulus length: ${nBitsInit} bits.`
      ],
      solution: null,
      matrix: [],
      executionTime: 0,
      cycles: 0
    }));

    const runStartedAt = Date.now();
    setStartTime(runStartedAt);
    setWorkerActive(true);
    setGleeokStats(null);
    setHybridFingerprint(null);
    setHybridTrace(null);
    setHybridEcmStats(null);
    setChronosMDual(null);
    setCfracInfo(null);
    setZetaTrace(null);
    setCurrentStage(1);

    if (activeStrat === 'chronos-196') {
      setUnifiedRace({
        status: 'racing',
        winningEngine: null,
        factors: [],
        verifiedProduct: false,
        verifiedPrimes: false,
        elapsedMs: 0,
        totalOperations: 0
      });
    }

    try {
      const nBig = BigInt(N);
      const nBitsVal = nBig.toString(2).length;
      const isChronos = activeStrat === 'chronos-196';
      const isCfrac = activeStrat === 'cfrac';
      const isZeta = activeStrat === 'zeta';

      // Fast Unified Race Scout (Ψ-Factor + >500b SNFS/Wiener/BD + ZF-18 Coppersmith + ZF-15/17 Spectral Guidance + 500d Zeta Seeds)
      let scoutOps = 0;
      let zfWorkerSeeds: Array<{
        seedOffset: number;
        recommendedMultiplier: number;
        zetaSigmaSeed?: string;
        zetaRhoSeed?: string;
      }> = [];

      if (isZeta) {
        try {
          const seeds500 = generateUltraPreciseZetaSeeds(nBig, 6, 48);
          setBd500ZetaSeeds(seeds500);
          if (seeds500.length > 0) {
            addLog(`>> [BD500 Zeta Seeds] 48 zeros active · Peak#1 δ*=${seeds500[0].delta500d.slice(0, 16)} · p_seed≈${seeds500[0].candidatePSeed.slice(0, 16)}... · σ=${seeds500[0].ecmSigmaSeed} · k=${seeds500[0].suggestedK}`);
          }
        } catch {}
      }

      if (isChronos) {
        const scout = runUnifiedFastScout(nBig, effectiveWorkerCount, activeHints);
        scoutOps = scout.scoutOps;
        if (scout.zfGuidance?.zetaSeeds?.length) {
          setBd500ZetaSeeds(scout.zfGuidance.zetaSeeds);
        }
        if (scout.zfGuidance?.workerGuidance) {
          const zSeedsList = scout.zfGuidance.zetaSeeds || [];
          zfWorkerSeeds = scout.zfGuidance.workerGuidance.map((g, idx) => {
            const zs = zSeedsList[idx % Math.max(1, zSeedsList.length)];
            return {
              seedOffset: g.seedOffset,
              recommendedMultiplier: g.recommendedMultiplier,
              zetaSigmaSeed: g.zetaSigmaSeed || zs?.ecmSigmaSeed,
              zetaRhoSeed: zs?.rhoSeed
            };
          });
        }

        if (scout.hit && scout.factors.length > 0) {
          const sorted = [...scout.factors].map(v => BigInt(v)).sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
          const durationMs = Math.max(1, Math.round(Date.now() - runStartedAt));
          setWorkerActive(false);
          setCpuUsage(0);
          setUnifiedRace({
            status: 'success',
            winningEngine: scout.winningEngine || 'Unified Fast Scout',
            factors: sorted,
            verifiedProduct: scout.verifiedProduct,
            verifiedPrimes: scout.verifiedPrimes,
            elapsedMs: durationMs,
            totalOperations: scoutOps,
            noteAr: scout.noteAr
          });
          addLog(`✅ ${t.factorizationSuccess} (${scout.winningEngine} · ${durationMs}ms · ${scoutOps.toLocaleString()} ops)`);
          addLog(`Prime Factors: ${sorted.join(' × ')}`);
          setSimState(prev => ({
            ...prev,
            status: 'success',
            solution: {
              x: "Identified",
              y: "Identified",
              factor1: sorted[0],
              factor2: sorted.slice(1).join(' × ') || sorted[0],
              allFactors: sorted
            } as any,
            executionTime: durationMs / 1000,
            cycles: scoutOps
          }));
          return;
        }
      }

      // Worker Pool Configuration:
      // In Unified Chronos v4 mode (<=220b): 1 ECM/p±1 Worker + 1 CFRAC Worker + (N-2) Chronos SIQS Workers sharing ONE GF(2) Matrix!
      // In Unified Chronos v4 mode (>220b): All workers race REDC ECM + p-1 + p+1 with 500d Zeta spectral seeds.
      // In standalone CFRAC mode: All effectiveWorkerCount workers race distinct KS multipliers into ONE shared Union GF(2) Matrix!
      const useSiqsUnified = isChronos && nBitsVal <= 220;
      const numWorkers = isChronos
        ? (useSiqsUnified ? Math.max(3, effectiveWorkerCount) : effectiveWorkerCount)
        : (isCfrac ? Math.max(1, effectiveWorkerCount) : 1);
      workersRef.current = [];

      const chronosBlob = new Blob([CHRONOS_WORKER_CODE], { type: 'application/javascript' });
      const chronosUrl = URL.createObjectURL(chronosBlob);
      workerUrlsRef.current.push(chronosUrl);

      let cfracUrl = '';
      if (isCfrac || useSiqsUnified) {
        const cfracBlob = new Blob([CFRAC_WORKER_CODE], { type: 'application/javascript' });
        cfracUrl = URL.createObjectURL(cfracBlob);
        workerUrlsRef.current.push(cfracUrl);
      }

      let fallbackStrategyUrl = chronosUrl;
      if (!isChronos && !isCfrac) {
        let code = CHRONOS_WORKER_CODE;
        if (activeStrat === 'unbounded-qs') code = UNBOUNDED_QS_WORKER_CODE;
        else if (activeStrat === 'zeta') code = ZETA_WORKER_CODE;
        else if (activeStrat === 'hybrid') code = GLEEOK_MMFR_WORKER_CODE;
        else if (activeStrat === 'mmfr') code = SPECTRAL_RESONANCE_WORKER_CODE;
        else if (activeStrat === 'pollard') code = pollardWorkerCode;
        else if (activeStrat === 'ecm') code = ecmWorkerCode;
        else if (activeStrat === 'gleeok') code = GLEEOK_WORKER_CODE;
        else if (activeStrat === 'algebraic') code = ALGEBRAIC_WORKER_CODE;
        const b = new Blob([code], { type: 'application/javascript' });
        fallbackStrategyUrl = URL.createObjectURL(b);
        workerUrlsRef.current.push(fallbackStrategyUrl);
      }

      const workerRoles: Array<'ecm' | 'siqs' | 'cfrac'> = Array.from({ length: numWorkers }, (_, idx) => {
        if (isCfrac) return 'cfrac';
        if (!isChronos) return 'siqs';
        if (!useSiqsUnified) return 'ecm';
        if (idx === 0) return 'ecm';
        if (idx === 1) return 'cfrac';
        return 'siqs';
      });
      const ecmWorkerCount = workerRoles.filter(r => r === 'ecm').length;

      setWorkerThreadsStats(
        workerRoles.map((roleVal, idx) => ({
          id: idx,
          role: roleVal === 'cfrac' ? 'siqs' : roleVal,
          curves: 0,
          polys: 0,
          relations: 0,
          stage: roleVal === 'cfrac' ? 'CFRAC Fast-2LP √(kN) → GF(2)' : (roleVal === 'ecm' ? 'Zeta REDC ECM + p±1' : 'SIQS v4 → GF(2)'),
          active: true
        }))
      );

      const ksResult = useSiqsUnified
        ? selectKnuthSchroeppelMultiplier(nBig)
        : (isCfrac ? (() => {
            const rankedRes = selectRankedKnuthSchroeppelMultipliers(nBig, 1);
            return { k: rankedRes.ranked[0] ?? 1, directFactor: rankedRes.directFactor };
          })() : { k: 1 });
      if (ksResult.directFactor && ksResult.directFactor > 1n && ksResult.directFactor < nBig) {
        const f1 = ksResult.directFactor;
        const f2 = nBig / f1;
        const sorted = [f1, f2].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
        const durationMs = Math.max(1, Date.now() - runStartedAt);
        setWorkerActive(false);
        setCpuUsage(0);
        setUnifiedRace({
          status: 'success',
          winningEngine: 'Knuth-Schroeppel Multiplier GCD',
          factors: sorted,
          verifiedProduct: f1 * f2 === nBig,
          verifiedPrimes: sorted.every(v => isProbablePrimeBig(BigInt(v), 10)),
          elapsedMs: durationMs,
          totalOperations: scoutOps + 64
        });
        addLog(`✅ ${t.factorizationSuccess} (KS Multiplier GCD · ${durationMs}ms)`);
        addLog(`Prime Factors: ${sorted.join(' × ')}`);
        return;
      }

      const optK = ksResult.k;
      const siqsM = BigInt(optK) * nBig;
      const rankedKsAll = isCfrac
        ? selectRankedKnuthSchroeppelMultipliers(nBig, Math.max(18, numWorkers + 12)).ranked
        : [optK, ...[1, 3, 5, 7, 11, 13, 15, 17, 19, 21, 23, 29].filter(v => v !== optK)];
      const CFRAC_MULTIPLIERS = rankedKsAll.length > 0 ? rankedKsAll : [1, 3, 5, 7, 11, 13, 17];

      const cfracUnionFb: CfracSharedUnionFb | null = isCfrac
        ? buildCfracSharedUnionFactorBase(nBig, CFRAC_MULTIPLIERS.slice(0, Math.min(CFRAC_MULTIPLIERS.length, numWorkers + 6)))
        : null;

      let cfracMultIdx = 0;
      let activeCfracK = CFRAC_MULTIPLIERS[0];
      const workerCfracKMap: number[] = Array.from({ length: numWorkers }, (_, idx) => CFRAC_MULTIPLIERS[idx % CFRAC_MULTIPLIERS.length]);
      let nextCfracQueueIdx = numWorkers;
      let exhaustedCfracWorkers = 0;

      // Shared Factor Base & Single+Double Large Prime Pool so all CFRAC workers (or SIQS + CFRAC) share ONE GF(2) Matrix
      const activeFb = isCfrac && cfracUnionFb
        ? { primes: cfracUnionFb.sharedPrimes, roots: [] as number[], logs: [] as number[], largePrimeBound: cfracUnionFb.largePrimeBound }
        : (useSiqsUnified ? buildMpqsFactorBase(nBig, siqsM) : { primes: [], roots: [], logs: [], largePrimeBound: 0 });
      const lpPool = new SingleLargePrimePool(nBig, activeFb.primes);
      const targetRelations = activeFb.primes.length + (nBitsVal >= 160 ? 14 : (isCfrac ? 6 : 10));
      const v4Diag = computeV4SieveDiagnostics();
      const activeSieveWeights = sieveMode === 'v4-fallback'
        ? { rowMedians: v4Diag.rowMedians, colPriors: v4Diag.colPriors6 }
        : null;
      const totalSiqsWorkers = Math.max(1, workerRoles.filter(r => r === 'siqs').length);
      const workerPolysMap = new Array(numWorkers).fill(0);
      const workerOpsMap = new Array(numWorkers).fill(0);
      let krylovOpsAccum = 0;
      let siqsRelCount = 0;
      let cfracRelCount = 0;
      let matrixSolves = 0;
      let lastMatrixSolveLen = 0;

      const getCurrentTotalOps = () =>
        scoutOps + krylovOpsAccum + workerOpsMap.reduce((a, b) => a + b, 0);

      if (isChronos) {
        raceTimerRef.current = window.setInterval(() => {
          setUnifiedRace(prev =>
            prev.status === 'racing'
              ? {
                  ...prev,
                  elapsedMs: Date.now() - runStartedAt,
                  totalOperations: getCurrentTotalOps(),
                  sharedGf2Stats: useSiqsUnified
                    ? {
                        siqsRelations: siqsRelCount,
                        cfracRelations: cfracRelCount,
                        totalFullRelations: lpPool.fullCount,
                        targetRelations,
                        lpCollisions: lpPool.collisionsCount,
                        matrixSolves
                      }
                    : undefined
                }
              : prev
          );
        }, 120);
      }

      if (isCfrac) {
        const activeKsStr = workerCfracKMap.slice(0, numWorkers).join(',');
        setCfracInfo({
          kMultiplier: activeCfracK,
          steps: 0,
          fbSize: activeFb.primes.length,
          targetRelations,
          convergentsSample: [],
          smoothRelations: 0,
          partialRelations: 0,
          lpCollisions: 0,
          statusLabel: `نشر متوازٍ (${numWorkers} خيوط · k=[${activeKsStr}])`
        });
        setGf2Stats({
          collected: 0,
          target: targetRelations,
          factorBaseSize: activeFb.primes.length,
          matrixSolves: 0,
          lastSource: `Parallel CFRAC ×${numWorkers} (Union QR-FB)`,
          partialCount: 0,
          lpCollisions: 0,
          krylovSteps: 0,
          coreShape: ''
        });
        addLog(`>> Parallel CFRAC (${numWorkers} Workers, Fast 2LP+52b Chunks): k=[${activeKsStr}], Shared Union QR-FB=${activeFb.primes.length}, L_max=${activeFb.largePrimeBound}.`);
      } else if (isChronos) {
        setGf2Stats({
          collected: 0,
          target: targetRelations,
          factorBaseSize: activeFb.primes.length,
          matrixSolves: 0,
          lastSource: useSiqsUnified
            ? 'Unified GF(2) (SIQS + CFRAC)'
            : 'Parallel Zeta-Seeded REDC ECM + p±1',
          partialCount: 0,
          lpCollisions: 0,
          krylovSteps: 0,
          coreShape: ''
        });
        addLog(
          useSiqsUnified
            ? `>> Chronos v4 Unified Race: ${ecmWorkerCount} Zeta REDC ECM/p±1 + 1 CFRAC + ${totalSiqsWorkers} SIQS v4 (1LP+2LP, k=${optK}) | Shared GF(2) QR-FB=${activeFb.primes.length}.`
            : `>> Chronos v4 Unified Race (>220b): ${numWorkers} Parallel Zeta-Seeded Montgomery REDC ECM + p−1/p+1 Workers Active.`
        );
      } else if (isZeta) {
        addLog(`>> Zeta 160d Worker Active (48 Verified Riemann Zeros + Batch-GCD + Hart 4kN + REDC ECM B2).`);
      }

      const finishUnifiedSuccess = (
        winningEngineLabel: string,
        sortedFactors: string[],
        durationMs: number,
        totalOps: number,
        noteAr?: string
      ) => {
        if (raceTimerRef.current) {
          window.clearInterval(raceTimerRef.current);
          raceTimerRef.current = null;
        }
        setWorkerActive(false);
        setCpuUsage(0);
        workersRef.current.forEach(w => w.terminate());
        workersRef.current = [];
        workerUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        workerUrlsRef.current = [];
        setWorkerThreadsStats(prev => prev.map(s => ({ ...s, active: false, stage: winningEngineLabel })));

        if (isChronos) {
          setUnifiedRace({
            status: 'success',
            winningEngine: winningEngineLabel,
            factors: sortedFactors,
            verifiedProduct: sortedFactors.reduce((acc, v) => acc * BigInt(v), 1n) === nBig,
            verifiedPrimes: sortedFactors.every(v => isProbablePrimeBig(BigInt(v), 10)),
            elapsedMs: durationMs,
            totalOperations: totalOps,
            sharedGf2Stats: useSiqsUnified
              ? {
                  siqsRelations: siqsRelCount,
                  cfracRelations: cfracRelCount,
                  totalFullRelations: lpPool.fullCount,
                  targetRelations,
                  lpCollisions: lpPool.collisionsCount,
                  matrixSolves
                }
              : undefined,
            noteAr
          });
        }
      };

      const handleWorkerMessage = (e: MessageEvent, currentWorkerId: number) => {
        if (solutionFound) return;
        const { type, steps, total, factor, message, nBits, round, features, attempts, curveAdds, modMuls, curveInfo, duration, workerId = currentWorkerId } = e.data;
        
        // Chronos v4 Unified Race events
        if (type === 'chronos_redc_benchmark') {
          setRedcSpeedupInfo({
            active: Boolean(e.data.active),
            backend: e.data.backend,
            nBits: e.data.nBits,
            speedupPct: e.data.speedupPct,
            redcNsPerMul: e.data.redcNsPerMul,
            naiveNsPerMul: e.data.naiveNsPerMul,
            source: e.data.source || 'web-worker',
            opsPerSec: e.data.opsPerSec
          });
        } else if (type === 'chronos_suyama_stage') {
          workerOpsMap[workerId] += 600;
          const phaseLabel = e.data.stagePhase === 'stage2-b2'
            ? `B2 ${e.data.b2ProgressPct ?? 0}% (${e.data.curveFamily === 'montgomery' ? 'Mont' : 'Suy'})`
            : (e.data.sigma ? String(e.data.sigma) : `B1=${Math.round(e.data.b1Bound / 1000)}k`);
          setWorkerThreadsStats(prev => {
            const next = [...prev];
            if (next[workerId]) {
              next[workerId] = {
                ...next[workerId],
                role: 'ecm',
                curves: e.data.curveIndex,
                stage: phaseLabel,
                active: true
              };
            }
            return next;
          });
          setChronosCycle(e.data.cycle);
          setChronosCurves(prev => Math.max(prev, e.data.curveIndex * Math.max(1, ecmWorkerCount)));
          setChronosSuyamaInfo({
            curveIndex: e.data.curveIndex,
            sigma: e.data.sigma,
            b1Bound: e.data.b1Bound,
            b2Bound: e.data.b2Bound,
            torsionCertified: e.data.torsionCertified,
            stagePhase: e.data.stagePhase,
            curveFamily: e.data.curveFamily,
            autoSwitchReason: e.data.autoSwitchReason,
            b2ProgressPct: e.data.b2ProgressPct,
            b2GiantStepsDone: e.data.b2GiantStepsDone,
            b2GiantStepsTotal: e.data.b2GiantStepsTotal,
            dStep: e.data.dStep
          });
          setCpuUsage(Math.min(99, 70 + numWorkers * 3));
        } else if (type === 'chronos_relations_batch') {
          const batch: SmoothRelation[] = e.data.relations || [];
          workerOpsMap[workerId] += 1800;
          if (e.data.targetN === N && batch.length > 0 && useSiqsUnified) {
            const { addedFull, addedPartial, newCollisions } = lpPool.ingestBatch(batch);
            siqsRelCount += addedFull + newCollisions;

            if (addedFull > 0 || addedPartial > 0) {
              workerPolysMap[workerId] = e.data.polysProcessed || workerPolysMap[workerId] || 0;
              setWorkerThreadsStats(prev => {
                const next = [...prev];
                if (next[workerId]) {
                  next[workerId] = {
                    ...next[workerId],
                    role: 'siqs',
                    polys: workerPolysMap[workerId],
                    relations: (next[workerId].relations || 0) + addedFull + addedPartial,
                    stage: newCollisions > 0 ? `SIQS (+${newCollisions} LP-Cycle)` : (sieveMode === 'v4-fallback' ? 'SIQS v4 Fast-2LP' : 'SIQS Vanilla'),
                    active: true
                  };
                }
                return next;
              });

              const collected = lpPool.fullCount;
              const elapsedSecNow = Math.max(0.05, (Date.now() - runStartedAt) / 1000);
              const totalPolysNow = workerPolysMap.reduce((a, b) => a + b, 0);
              setChronosSmooth(collected);
              setGf2Stats(prev => ({
                ...prev,
                collected,
                target: targetRelations,
                factorBaseSize: activeFb.primes.length,
                matrixSolves,
                partialCount: lpPool.partialCount,
                lpCollisions: lpPool.collisionsCount,
                relationsPerSec: collected / elapsedSecNow,
                polysProcessed: totalPolysNow,
                lastSource: cfracRelCount > 0
                  ? `Unified GF(2): SIQS(${siqsRelCount}) + CFRAC(${cfracRelCount})`
                  : `${sieveMode === 'v4-fallback' ? 'SIQS-v4' : 'Vanilla'} k=${optK} W#${workerId + 1}`
              }));

              // Trigger Shared Sparse GF(2) Solver once combined SIQS+CFRAC relations reach FB + margin
              const solveDelta = nBitsVal >= 160 ? 16 : 6;
              if (collected >= targetRelations && (collected - lastMatrixSolveLen >= solveDelta || matrixSolves === 0)) {
                lastMatrixSolveLen = collected;
                matrixSolves++;
                const bwRes = solveBlockWiedemann(nBig, activeFb.primes, lpPool.getFullRelations(), lpPool.getRedcCtx());
                if (bwRes.redcBenchmark) {
                  setRedcSpeedupInfo(bwRes.redcBenchmark);
                }
                krylovOpsAccum += Math.max(64, (bwRes.krylovSteps || 1) * 64);
                setGf2Stats(prev => ({
                  ...prev,
                  matrixSolves,
                  krylovSteps: bwRes.krylovSteps,
                  coreShape: `${bwRes.coreRows}×${bwRes.coreCols}`,
                  solverMethod: bwRes.methodUsed
                }));

                if (bwRes.factor && bwRes.factor > 1n && bwRes.factor < nBig) {
                  const f1 = bwRes.factor;
                  const f2 = nBig / f1;
                  if (isProbablePrimeBig(f1, 10) && isProbablePrimeBig(f2, 10)) {
                    solutionFound = true;
                    const sorted = [f1, f2].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                    const durationMs = Math.max(1, Date.now() - runStartedAt);
                    const elapsed = durationMs / 1000;
                    const totalPolys = workerPolysMap.reduce((a, b) => a + b, 0);
                    const finalOps = getCurrentTotalOps();
                    const winLabel = cfracRelCount > 0 && siqsRelCount > 0
                      ? `GF(2) الموحد (SIQS + CFRAC · ${bwRes.methodUsed})`
                      : `Chronos SIQS v4 (${bwRes.methodUsed})`;

                    setBenchmarkHistory(prev => [
                      {
                        mode: sieveMode,
                        bits: nBitsVal,
                        n: N,
                        durationMs,
                        relationsCollected: collected,
                        polysProcessed: totalPolys,
                        relationsPerSec: Number((collected / (durationMs / 1000)).toFixed(2)),
                        lpCollisions: lpPool.collisionsCount,
                        solveMethod: bwRes.methodUsed,
                        verified: f1 * f2 === nBig
                      },
                      ...prev
                    ].slice(0, 12));

                    finishUnifiedSuccess(winLabel, sorted, durationMs, finalOps, `حُسمت مصفوفة GF(2) الموحدة (${siqsRelCount} SIQS + ${cfracRelCount} CFRAC).`);

                    addLog(`✅ ${t.factorizationSuccess} (${winLabel} · ${durationMs}ms · ${finalOps.toLocaleString()} ops)`);
                    addLog(`Prime Factors: ${sorted.join(' × ')}`);
                    addLog(`Verification (Product == N): ${f1 * f2 === nBig}`);

                    setSimState(prev => ({
                      ...prev,
                      status: 'success',
                      solution: {
                        x: "Identified",
                        y: "Identified",
                        factor1: sorted[0],
                        factor2: sorted[1],
                        allFactors: sorted
                      } as any,
                      executionTime: elapsed,
                      cycles: finalOps
                    }));
                    return;
                  } else {
                    addLog(`⚡ Block Wiedemann split factor (${f1.toString().slice(0, 14)}...) — resolving remaining composite prime tree...`);
                  }
                }
              }
            }
          }
        } else if (type === 'cfrac_progress') {
          const workerSteps = e.data.steps ?? 0;
          const workerK = e.data.kMultiplier ?? workerCfracKMap[currentWorkerId] ?? activeCfracK;
          workerOpsMap[currentWorkerId] = Math.max(workerOpsMap[currentWorkerId], workerSteps * 4);
          setCpuUsage(Math.min(96, 40 + Math.round(((lpPool.fullCount + 1) / Math.max(1, targetRelations)) * 55)));
          setCfracInfo(prev => ({
            kMultiplier: workerK,
            steps: workerOpsMap.reduce((acc, v) => acc + Math.floor(v / 4), 0),
            fbSize: activeFb.primes.length,
            targetRelations,
            convergentsSample: e.data.convergentsSample ?? prev?.convergentsSample ?? [],
            smoothRelations: lpPool.fullCount,
            partialRelations: lpPool.partialCount,
            lpCollisions: lpPool.collisionsCount,
            statusLabel: numWorkers > 1 && isCfrac
              ? `نشر متوازٍ (${numWorkers} خيوط · k=${workerK})`
              : `نشر √(${workerK}N): الخطوة ${workerSteps.toLocaleString()}`
          }));
        } else if (type === 'cfrac_relations_batch') {
          const batch: SmoothRelation[] = e.data.relations || [];
          const workerK = e.data.kMultiplier ?? workerCfracKMap[currentWorkerId] ?? activeCfracK;
          workerOpsMap[currentWorkerId] = Math.max(workerOpsMap[currentWorkerId], (e.data.steps ?? 0) * 4);
          if (e.data.targetN === N && batch.length > 0 && (isCfrac || workerK === activeCfracK)) {
            const { addedFull, addedPartial, newCollisions } = lpPool.ingestBatch(batch);
            cfracRelCount += addedFull + newCollisions;
            const collected = lpPool.fullCount;
            const elapsedSecNow = Math.max(0.05, (Date.now() - runStartedAt) / 1000);
            const totalCfracStepsNow = workerOpsMap.reduce((acc, v) => acc + Math.floor(v / 4), 0);

            setWorkerThreadsStats(prev => {
              const next = [...prev];
              if (next[currentWorkerId]) {
                next[currentWorkerId] = {
                  ...next[currentWorkerId],
                  polys: e.data.steps ?? 0,
                  relations: (next[currentWorkerId].relations || 0) + addedFull + addedPartial,
                  stage: `CFRAC k=${workerK} → GF(2)`,
                  active: true
                };
              }
              return next;
            });

            setCfracInfo({
              kMultiplier: workerK,
              steps: totalCfracStepsNow,
              fbSize: activeFb.primes.length,
              targetRelations,
              convergentsSample: e.data.convergentsSample ?? [],
              smoothRelations: collected,
              partialRelations: lpPool.partialCount,
              lpCollisions: lpPool.collisionsCount,
              statusLabel: collected >= targetRelations
                ? 'حل مصفوفة GF(2) Block Wiedemann...'
                : (numWorkers > 1 && isCfrac ? `تجميع متوازٍ (${numWorkers} خيوط → ${collected}/${targetRelations})` : `تجميع علاقات CFRAC (k=${workerK})`)
            });

            setGf2Stats(prev => ({
              ...prev,
              collected,
              target: targetRelations,
              factorBaseSize: activeFb.primes.length,
              matrixSolves,
              partialCount: lpPool.partialCount,
              lpCollisions: lpPool.collisionsCount,
              relationsPerSec: collected / elapsedSecNow,
              polysProcessed: totalCfracStepsNow + workerPolysMap.reduce((a, b) => a + b, 0),
              lastSource: isChronos && siqsRelCount > 0
                ? `Unified GF(2): SIQS(${siqsRelCount}) + CFRAC(${cfracRelCount})`
                : `Parallel CFRAC ×${numWorkers} (${collected}/${targetRelations})`
            }));

            const solveDeltaCfrac = nBitsVal >= 120 ? 10 : 4;
            if (collected >= targetRelations && (collected - lastMatrixSolveLen >= solveDeltaCfrac || matrixSolves === 0)) {
              lastMatrixSolveLen = collected;
              matrixSolves++;
              const bwRes = solveBlockWiedemann(nBig, activeFb.primes, lpPool.getFullRelations(), lpPool.getRedcCtx());
              if (bwRes.redcBenchmark) {
                setRedcSpeedupInfo(bwRes.redcBenchmark);
              }
              krylovOpsAccum += Math.max(64, (bwRes.krylovSteps || 1) * 64);
              setGf2Stats(prev => ({
                ...prev,
                matrixSolves,
                krylovSteps: bwRes.krylovSteps,
                coreShape: `${bwRes.coreRows}×${bwRes.coreCols}`,
                solverMethod: bwRes.methodUsed
              }));

              if (bwRes.factor && bwRes.factor > 1n && bwRes.factor < nBig) {
                const f1 = bwRes.factor;
                const f2 = nBig / f1;
                if (isProbablePrimeBig(f1, 10) && isProbablePrimeBig(f2, 10)) {
                  solutionFound = true;
                  const sorted = [f1, f2].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                  const durationMs = Math.max(1, Date.now() - runStartedAt);
                  const elapsed = durationMs / 1000;
                  const finalOps = getCurrentTotalOps();
                  const winLabel = isChronos && siqsRelCount > 0
                    ? `GF(2) الموحد (SIQS + CFRAC · ${bwRes.methodUsed})`
                    : `Parallel CFRAC ×${numWorkers} (k=${workerK}) · ${bwRes.methodUsed}`;

                  setBenchmarkHistory(prev => [
                    {
                      mode: 'cfrac',
                      bits: nBitsVal,
                      n: N,
                      durationMs,
                      relationsCollected: collected,
                      polysProcessed: totalCfracStepsNow,
                      relationsPerSec: Number((collected / (durationMs / 1000)).toFixed(2)),
                      lpCollisions: lpPool.collisionsCount,
                      solveMethod: winLabel,
                      verified: f1 * f2 === nBig
                    },
                    ...prev
                  ].slice(0, 12));

                  finishUnifiedSuccess(winLabel, sorted, durationMs, finalOps, isChronos ? `حُسمت مصفوفة GF(2) الموحدة بمشاركة CFRAC (${cfracRelCount}) و SIQS (${siqsRelCount}).` : undefined);

                  addLog(`✅ ${t.factorizationSuccess} (${winLabel} · ${durationMs}ms · ${finalOps.toLocaleString()} ops)`);
                  addLog(`Prime Factors: ${sorted.join(' × ')}`);
                  setSimState(prev => ({
                    ...prev,
                    status: 'success',
                    solution: {
                      x: "Identified",
                      y: "Identified",
                      factor1: sorted[0],
                      factor2: sorted[1],
                      allFactors: sorted
                    } as any,
                    executionTime: elapsed,
                    cycles: finalOps
                  }));
                  return;
                }
              }
            }
          }
        } else if (type === 'cfrac_period_exhausted') {
          if (isCfrac && cfracUnionFb) {
            const nextIdx = nextCfracQueueIdx++;
            if (nextIdx < CFRAC_MULTIPLIERS.length && workersRef.current[currentWorkerId]) {
              const nextK = CFRAC_MULTIPLIERS[nextIdx];
              workerCfracKMap[currentWorkerId] = nextK;
              const sub = cfracUnionFb.getWorkerSubset(nextK);
              addLog(`>> CFRAC W#${currentWorkerId + 1} switched to k=${nextK} (keeping ${lpPool.fullCount} shared relations).`);
              workersRef.current[currentWorkerId].postMessage({
                type: 'start',
                n: N,
                kMultiplier: nextK,
                fbPrimes: sub.localPrimes,
                fbGlobalIndices: sub.globalCols,
                largePrimeBound: cfracUnionFb.largePrimeBound
              });
            } else {
              exhaustedCfracWorkers++;
              setWorkerThreadsStats(prev => {
                const next = [...prev];
                if (next[currentWorkerId]) {
                  next[currentWorkerId] = { ...next[currentWorkerId], active: false, stage: 'Period Complete' };
                }
                return next;
              });
              if (exhaustedCfracWorkers >= numWorkers) {
                setWorkerActive(false);
                addLog(`❌ CFRAC exhausted all ${CFRAC_MULTIPLIERS.length} ranked multipliers without enough smooth relations.`);
                setSimState(prev => ({ ...prev, status: 'failed' }));
              }
            }
          } else {
            cfracMultIdx++;
            if (cfracMultIdx < CFRAC_MULTIPLIERS.length && workersRef.current[currentWorkerId]) {
              activeCfracK = CFRAC_MULTIPLIERS[cfracMultIdx];
              addLog(`>> CFRAC Period Reached: Switching to multiplier k=${activeCfracK} (shared QR-FB=${activeFb.primes.length}).`);
              workersRef.current[currentWorkerId].postMessage({
                type: 'start',
                n: N,
                kMultiplier: activeCfracK,
                fbPrimes: activeFb.primes,
                largePrimeBound: activeFb.largePrimeBound
              });
            } else if (!isChronos) {
              setWorkerActive(false);
              addLog(`❌ CFRAC exhausted multiplier schedule without enough smooth relations.`);
              setSimState(prev => ({ ...prev, status: 'failed' }));
            }
          }
        } else if (type === 'chronos_progress') {
          workerOpsMap[workerId] = Math.max(workerOpsMap[workerId], e.data.steps || 0);
          setChronosCycle(e.data.cycle);
          setChronosCurves(prev => Math.max(prev, (e.data.totalCurves || 0) * Math.max(1, ecmWorkerCount)));
          setChronosSteps(getCurrentTotalOps());
          setCpuUsage(Math.min(99, 75 + numWorkers * 3));
        } else if (type === 'chronos_m_dual') {
          setChronosMDual(e.data.mDualMatrix);
        }

        // Unbounded Continuous QS events
        else if (type === 'unbounded_init') {
          setQsUN(e.data.uN);
          setQsValidPairs(e.data.validPairs);
          setQsLiftsCount(e.data.liftsCount);
          setQsModPower(e.data.modPower);
          setQsHenselDepth(1);
          setCpuUsage(75);
        } else if (type === 'unbounded_hensel_update') {
          setQsHenselDepth(e.data.henselDepth);
          setQsHenselMaxDepth(e.data.henselMaxDepth);
          setQsDecadicP(e.data.decadicP || '');
          setQsDecadicQ(e.data.decadicQ || '');
          setQsNewtonRate(e.data.newtonRate || 0);
          setQsInstantGcdCount(e.data.instantGcdCount || 0);
        } else if (type === 'unbounded_progress') {
          setQsCycle(e.data.cycle);
          setQsLane(e.data.lane);
          setQsSteps(e.data.steps);
          setQsTotalCurves(e.data.totalCurves);
          setQsCandidateT(e.data.candidateT || '');
          setCpuUsage(Math.min(98, 70 + (e.data.cycle % 25)));
        }
        
        // Hybrid Gleeok-MMFR events
        else if (type === 'hybrid_perm_progress') {
          setCurrentStage(1);
          setCpuUsage(Math.min(95, (e.data.round / e.data.total) * 100));
        } else if (type === 'hybrid_fingerprint') {
          setCurrentStage(2);
          setHybridFingerprint({
            featureSize: e.data.featureSize,
            entropy: e.data.entropy,
            stability: e.data.stability,
            bitDensity: e.data.bitDensity,
            convergence: e.data.convergence,
            qualityIndex: e.data.qualityIndex,
            prioritizedCount: e.data.prioritizedCount
          });
          setCpuUsage(80);
        } else if (type === 'hybrid_trace') {
          setCurrentStage(2);
          setHybridTrace({
            multiplier: e.data.multiplier,
            kPriority: e.data.kPriority,
            steps: e.data.steps,
            currentT: e.data.currentT,
            modResidue: e.data.modResidue,
            isCandidateSquare: e.data.isCandidateSquare
          });
          setCpuUsage(85 + (e.data.multiplier % 15));
        } else if (type === 'hybrid_curve_progress') {
          setCurrentStage(3);
          setHybridEcmStats({
            curveIndex: e.data.curveIndex,
            totalCurves: e.data.totalCurves,
            curveAdds: e.data.curveAdds,
            modMuls: e.data.modMuls,
            priority: e.data.priority
          });
          setCpuUsage(90);
        }
        
        // Fallback trace for other strategies
        else if (type === 'zeta_trace') {
          workerOpsMap[currentWorkerId] = Math.max(workerOpsMap[currentWorkerId], e.data.steps || 0);
          setZetaTrace(prev => ({
            activeZeros: e.data.activeZeros,
            coherencePeak: e.data.coherencePeak,
            resonanceScore: e.data.resonanceScore,
            steps: e.data.steps,
            precisionDigits: e.data.precisionDigits ?? prev?.precisionDigits,
            seeds: e.data.seeds ?? prev?.seeds
          }));
          setCpuUsage(88);
        } else if (type === 'spectral_trace') {
          setHybridTrace({
            multiplier: e.data.multiplier,
            kPriority: 1.0,
            steps: e.data.steps,
            currentT: e.data.currentT,
            modResidue: e.data.modResidue,
            isCandidateSquare: e.data.isCandidateSquare
          });
          setCpuUsage(80);
        } else if (type === 'progress') {
          if (strategy === 'pollard') {
            setCpuUsage(Math.min(100, (steps / 500000) * 100));
            if (steps % 50000 === 0) addLog(`Iteration ${steps}: Searching cycle...`);
          } else if (strategy === 'ecm') {
            setCpuUsage(Math.min(100, (steps / total) * 100));
            if (steps % 10 === 0) addLog(`ECM Curve ${steps}/${total}: Testing group orders...`);
          }
        } else if (type === 'gleeok_init') {
          setGleeokStats({
            nBits: nBits, permsDone: 0, currentRound: 0, featureSize: 0, stability: 0, entropy: 0, bitDensity: 0, convergence: 0, qualityIndex: 0, readyCurves: 0, curveAdds: 0, modMuls: 0, currentCurveInfo: null, maxPriority: 0, minPriority: 0, avgPriority: 0
          });
          addLog(`Gleeok: Target size ${nBits} bits.`);
        } else if (type === 'gleeok_perm') {
          setGleeokStats(prev => prev ? { ...prev, permsDone: round, currentRound: round } : null);
          setCpuUsage(Math.min(100, (round / total) * 100));
        } else if (type === 'gleeok_features') {
          setGleeokStats(prev => prev ? { 
            ...prev, 
            featureSize: features.featureSize,
            stability: features.stability,
            entropy: features.entropy,
            bitDensity: features.bitDensity,
            convergence: features.convergence,
            qualityIndex: features.qualityIndex,
            readyCurves: features.curvesParams.length,
            maxPriority: features.maxPriority,
            minPriority: features.minPriority,
            avgPriority: features.avgPriority
          } : null);
          addLog(`Gleeok: Structural fingerprint generated.`);
        } else if (type === 'gleeok_progress') {
          setGleeokStats(prev => prev ? { ...prev, curveAdds, modMuls, currentCurveInfo: curveInfo } : null);
          setCpuUsage(Math.min(100, (attempts / total) * 100));
        } else if (type === 'log') {
          addLog(message);
        } else if (type === 'result') {
          solutionFound = true;
          const endTime = Date.now();
          const durationMs = duration || Math.max(1, endTime - runStartedAt);
          const elapsed = durationMs / 1000;
          const workerStepInc = steps || 2500;
          workerOpsMap[workerId] = Math.max(workerOpsMap[workerId], workerStepInc);
          const finalOps = getCurrentTotalOps();

          const { factors, mDualMatrix, method: rawMethod } = e.data;
          if (mDualMatrix) {
            setChronosMDual(mDualMatrix);
          }

          let recoveredFactors: string[] = [];
          if (factors && Array.isArray(factors) && factors.length > 0) {
            recoveredFactors = factors.map((f: string) => BigInt(f)).sort((a: bigint, b: bigint) => (a < b ? -1 : 1)).map((v: bigint) => v.toString());
          } else if (factor) {
            const p = BigInt(factor);
            const q = BigInt(N) / p;
            recoveredFactors = [p, q].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
          }

          if (recoveredFactors.length > 0) {
            const roleWin = workerRoles[currentWorkerId] === 'cfrac'
              ? (rawMethod || 'CFRAC Direct Congruence')
              : (workerRoles[currentWorkerId] === 'ecm'
                ? 'Chronos Montgomery REDC ECM / p±1'
                : (rawMethod || `Chronos Worker #${workerId + 1}`));

            finishUnifiedSuccess(roleWin, recoveredFactors, durationMs, finalOps);
            const product = recoveredFactors.reduce((acc: bigint, f: string) => acc * BigInt(f), 1n);
            addLog(`✅ ${t.factorizationSuccess} (${roleWin} · ${durationMs}ms · ${finalOps.toLocaleString()} ops)`);
            addLog(`Prime Factors: ${recoveredFactors.join(' × ')}`);
            addLog(`Verification (Product == N): ${product === BigInt(N)}`);

            setSimState(prev => ({
              ...prev,
              status: 'success',
              solution: {
                x: "Identified",
                y: "Identified",
                factor1: recoveredFactors[0],
                factor2: recoveredFactors.slice(1).join(', ') || recoveredFactors[0],
                allFactors: recoveredFactors
              } as any,
              executionTime: elapsed,
              cycles: finalOps
            }));
          } else {
            finishUnifiedSuccess('Failed', [], durationMs, finalOps);
            setUnifiedRace(prev => ({ ...prev, status: 'failed' }));
            addLog(`❌ ${t.statusFailed}`);
            setSimState(prev => ({ ...prev, status: 'failed' }));
          }
        } else if (type === 'error') {
          addLog(`❌ Worker #${workerId + 1} Error: ${message}`);
          setWorkerActive(false);
        }
      };

      let solutionFound = false;
      let siqsRankCounter = 0;

      for (let wId = 0; wId < numWorkers; wId++) {
        const wRole = workerRoles[wId];
        const wUrl = wRole === 'cfrac' ? cfracUrl : (isChronos ? chronosUrl : fallbackStrategyUrl);
        const w = new Worker(wUrl);
        workersRef.current.push(w);
        if (wId === 0) workerRef.current = w;
        w.onmessage = (e) => handleWorkerMessage(e, wId);
        w.onerror = () => {
          addLog(`❌ Worker #${wId + 1} execution stopped.`);
          if (numWorkers === 1) {
            setWorkerActive(false);
            setSimState(prev => ({ ...prev, status: 'failed' }));
          }
        };

        if (activeStrat === 'unbounded-qs') {
          const totalDecDigits = BigInt(N).toString(10).length;
          const computedMax = qsUserMaxDepth === 'auto' ? Math.max(6, Math.ceil(totalDecDigits / 2)) : qsUserMaxDepth;
          w.postMessage({
            type: 'start',
            n: N,
            startDepth: qsUserStartDepth,
            maxDepth: computedMax
          });
        } else if (wRole === 'cfrac') {
          if (isCfrac && cfracUnionFb) {
            const wK = workerCfracKMap[wId];
            const sub = cfracUnionFb.getWorkerSubset(wK);
            w.postMessage({
              type: 'start',
              n: N,
              kMultiplier: wK,
              fbPrimes: sub.localPrimes,
              fbGlobalIndices: sub.globalCols,
              largePrimeBound: cfracUnionFb.largePrimeBound
            });
          } else {
            w.postMessage({
              type: 'start',
              n: N,
              kMultiplier: activeCfracK,
              fbPrimes: activeFb.primes,
              largePrimeBound: activeFb.largePrimeBound
            });
          }
        } else if (isChronos) {
          const zfSeed = zfWorkerSeeds[wId]?.seedOffset ?? (wId * 250000);
          const mySiqsRank = wRole === 'siqs' ? siqsRankCounter++ : 0;
          w.postMessage({
            type: 'start',
            n: N,
            targetM: useSiqsUnified ? siqsM.toString() : N,
            role: wRole === 'ecm' ? 'ecm' : 'siqs',
            workerId: wId,
            totalWorkers: numWorkers,
            siqsRank: mySiqsRank,
            siqsTotalWorkers: totalSiqsWorkers,
            seedOffset: zfSeed,
            fbPrimes: activeFb.primes,
            fbRoots: activeFb.roots,
            fbLogs: activeFb.logs,
            largePrimeBound: activeFb.largePrimeBound,
            sieveMode,
            sieveWeights: activeSieveWeights,
            zetaSigmaSeed: zfWorkerSeeds[wId]?.zetaSigmaSeed ?? null,
            zetaRhoSeed: zfWorkerSeeds[wId]?.zetaRhoSeed ?? null
          });
        } else if (activeStrat === 'hybrid' || activeStrat === 'zeta' || activeStrat === 'mmfr' || activeStrat === 'pollard' || activeStrat === 'ecm') {
          w.postMessage({ type: 'start', n: N });
        } else {
          const matrices = generateSimulationMatrices(114, 28, N.toString()).map(m => m.map(row => row.map(v => v.toString())));
          const a1Str = A1_MATRIX.map(row => row.map(v => v.toString()));
          const antStr = ANT_MATRIX.map(row => row.map(v => v.toString()));
          const mStr = M_MATRIX.map(row => row.map(v => v.toString()));
          w.postMessage({
            type: 'start',
            n: N,
            matrices,
            A1: a1Str,
            ANT: antStr,
            M_DATA: mStr
          });
        }
      }

    } catch (err: any) {
      if (raceTimerRef.current) {
        window.clearInterval(raceTimerRef.current);
        raceTimerRef.current = null;
      }
      addLog(`❌ Initialization Error: ${err.message || err}`);
      setUnifiedRace(prev => (prev.status === 'racing' ? { ...prev, status: 'failed' } : prev));
      setWorkerActive(false);
    }
  };

  const handleGenerateKeys = (bitsOverride?: number) => {
    try {
      const targetKeyBits = typeof bitsOverride === 'number' ? bitsOverride : keySize;
      setKeySize(targetKeyBits);
      const bitSize = Math.floor(targetKeyBits / 2);
      addLog(`>> Generating two ~${bitSize}-bit primes...`);
      const p = generatePrime(bitSize);
      const q = generatePrime(bitSize);
      const n = p * q;
      const actualBits = n.toString(2).length;

      setRsaKey({
        p: p.toString(),
        q: q.toString(),
        n: n.toString(),
        e: "65537",
        d: "???",
        bits: actualBits
      });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });

      setSimState({
        status: 'idle',
        logs: [
          `>> Generated new ${actualBits}-bit RSA modulus. Ready for factorization.`,
          `N = ${n.toString()}`
        ],
        relations: [],
        factorBase: PRIMES_LIST.slice(0, 15),
        matrix: [],
        solution: null
      });
      setHybridFingerprint(null);
      setHybridTrace(null);
      setHybridEcmStats(null);
      setZetaTrace(null);
      setBd500ZetaSeeds([]);
    } catch (e: any) {
      addLog(`Error generating key: ${e.message}`);
    }
  };

  const handleJumpToBlock = (p: number, q: number) => {
    setSelectedBlockPair({ p: Math.min(p, q), q: Math.max(p, q) });
    setView('infinite');
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#1C1917] selection:bg-[#1E3A8A]/15" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Light Academic Manuscript Top Bar */}
        <header className="border-b border-[#E2DDD2] pb-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-[#1E3A8A]">
                مخطوطة التحليل العددي والطيف التحليلي · Chronos v4
              </div>
              <h1 className="text-2xl md:text-3xl font-bold font-serif-academic text-[#1C1917] tracking-tight">
                مختبر المصفوفات الأولية ودالة زيتا
              </h1>
              <p className="text-xs md:text-sm text-[#57534E]">
                التفكيك المتوازي (Miller-Rabin · Brent · SIQS + 1LP · Block Wiedemann · ECM) والمصفوفة الأم <span dir="ltr" className="font-mono">U_∞ / M_∞</span> وأصفار ريمان
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowInputN(true)}
                disabled={workerActive}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                إدخال N مخصص
              </button>
              <button
                onClick={() => setShowImportPem(true)}
                disabled={workerActive}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                استيراد PEM
              </button>
              <button
                onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A] transition-colors whitespace-nowrap shrink-0"
              >
                {lang === 'ar' ? 'FR' : 'عربي'}
              </button>

              <div className="flex items-center gap-2.5 bg-white px-3.5 py-1.5 rounded-lg border border-[#E2DDD2] shrink-0">
                <div className="text-right">
                  <div className="text-[10px] text-[#57534E] font-mono">حالة الخيوط</div>
                  <div className={`text-xs font-mono font-bold ${workerActive ? 'text-[#14532D]' : 'text-[#57534E]'}`}>
                    {workerActive ? `ACTIVE (${effectiveWorkerCount})` : 'STANDBY'}
                  </div>
                </div>
                <div className="w-16 h-1.5 bg-[#EAE5DA] rounded-full overflow-hidden">
                  <div
                    style={{ width: `${workerActive ? Math.max(18, cpuUsage) : 0}%` }}
                    className="h-full bg-[#14532D] transition-all duration-300"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Unified Single-Line Academic Navigation Tabs */}
          <nav className="flex flex-wrap lg:flex-nowrap items-center gap-1.5 bg-[#F4F0E8] p-1.5 rounded-xl border border-[#E2DDD2] w-full lg:w-fit overflow-x-auto">
            <button
              onClick={() => setView('factorizer')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                view === 'factorizer'
                  ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] shadow-sm'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              1. محلل الأعداد والتفكيك · Chronos v4
            </button>
            <button
              onClick={() => setView('inspector')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                view === 'inspector'
                  ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] shadow-sm'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              2. فاحص المصفوفات والنظريات الثلاث
            </button>
            <button
              onClick={() => setView('infinite')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                view === 'infinite'
                  ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] shadow-sm'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              3. المصفوفة الأم U_∞ وباني الكتل
            </button>
            <button
              onClick={() => setView('zeta')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                view === 'zeta'
                  ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] shadow-sm'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              4. دالة زيتا وأصفار ريمان
            </button>
            <button
              onClick={() => setView('zf-summary')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                view === 'zf-summary'
                  ? 'bg-white text-[#1E3A8A] border border-[#E2DDD2] shadow-sm'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              5. الملخص العلمي ZF (الإصدارات 1-17)
            </button>
          </nav>
        </header>

        {view === 'zf-summary' && <ZfProjectSummaryModule />}

        {/* Tab 1: Unified Factorizer & Chronos v4 Parallel Lab */}
        {view === 'factorizer' && (
          <div className="space-y-6">
            <FactorizerModule
              nValue={rsaKey?.n || ''}
              onChangeN={handleManualNChange}
              onGenerateRsaKey={(bits) => handleGenerateKeys(bits)}
              activeAlgorithm={primaryAlgorithm}
              onSelectAlgorithm={(alg) => {
                setPrimaryAlgorithm(alg);
                if (alg === 'cfrac') setStrategy('cfrac');
                else if (alg === 'zeta') setStrategy('zeta');
                else if (alg === 'chronos-196') setStrategy('chronos-196');
              }}
              onLaunchChronos={(targetN, algOverride) => {
                const chosen = algOverride || (primaryAlgorithm === 'cfrac' ? 'cfrac' : (primaryAlgorithm === 'zeta' ? 'zeta' : 'chronos-196'));
                setStrategy(chosen);
                runAttack(targetN, chosen);
              }}
              onStopChronos={stopAttack}
              isChronosRunning={workerActive}
              chronosSolution={
                simState.solution
                  ? {
                      factor1: simState.solution.factor1,
                      factor2: simState.solution.factor2,
                      allFactors: (simState.solution as any).allFactors,
                      method: strategy === 'cfrac'
                        ? 'Parallel CFRAC (Fast 2LP + Shared GF(2) Block Wiedemann)'
                        : (strategy === 'zeta'
                          ? 'Zeta 48-Zeros Spectral Seeding (500d / 160d)'
                          : 'Chronos v4 (SIQS + 1LP + Block Wiedemann + Zeta REDC ECM)'),
                      duration: simState.executionTime ? Math.round(simState.executionTime * 1000) : undefined
                    }
                  : null
              }
              onJumpToBlock={handleJumpToBlock}
            />

            {primaryAlgorithm === 'coppersmith' && (
              <CoppersmithLabPanel
                onFactorsRecovered={(nRecovered, pRecovered, qRecovered, methodLabel, durationMs) => {
                  const sorted = [BigInt(pRecovered), BigInt(qRecovered)].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: '65537',
                    d: '???',
                    bits: BigInt(nRecovered).toString(2).length
                  });
                  setSimState(prev => ({
                    ...prev,
                    status: 'success',
                    logs: [
                      ...prev.logs,
                      `✅ ${methodLabel} Solved ${BigInt(nRecovered).toString(2).length}-bit modulus in ${durationMs}ms.`,
                      `p = ${sorted[0]}`,
                      `q = ${sorted[1]}`
                    ],
                    solution: {
                      x: 'Identified',
                      y: 'Identified',
                      factor1: sorted[0],
                      factor2: sorted[1],
                      allFactors: sorted
                    } as any,
                    executionTime: durationMs / 1000
                  }));
                }}
              />
            )}

            {primaryAlgorithm === 'cfrac' && (
              <CfracTelemetryPanel
                nValue={rsaKey?.n || ''}
                cfracInfo={cfracInfo}
                isRunning={workerActive}
                benchmarkHistory={benchmarkHistory}
                onLaunchCfrac={() => runAttack(rsaKey?.n, 'cfrac')}
                onStop={stopAttack}
              />
            )}

            {primaryAlgorithm === 'zeta' && (
              <ZetaFactorPanel
                nValue={rsaKey?.n || ''}
                zetaTrace={zetaTrace}
                bd500Seeds={bd500ZetaSeeds}
                isRunning={workerActive}
                onGenerateSeeds500d={() => {
                  const raw = (rsaKey?.n || '').replace(/[^0-9]/g, '');
                  if (!raw) return;
                  try {
                    const seeds = generateUltraPreciseZetaSeeds(BigInt(raw), 6, 48);
                    setBd500ZetaSeeds(seeds);
                    if (seeds.length > 0) {
                      addLog(`>> Generated ${seeds.length} Ultra-Precise BD500 Zeta Seeds (48 zeros): Peak#1 δ*=${seeds[0].delta500d.slice(0, 16)}, p_seed≈${seeds[0].candidatePSeed.slice(0, 18)}...`);
                    }
                  } catch (err: any) {
                    addLog(`❌ Seed generation error: ${err?.message || err}`);
                  }
                }}
                onLaunchZeta={() => runAttack(rsaKey?.n, 'zeta')}
                onStop={stopAttack}
              />
            )}

            {primaryAlgorithm === 'zf18-19-lab' && (
              <Zf1819LabPanel
                onFactorsRecovered={(nRecovered, pRecovered, qRecovered, methodLabel, durationMs) => {
                  const sorted = [BigInt(pRecovered), BigInt(qRecovered)].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: '65537',
                    d: '???',
                    bits: BigInt(nRecovered).toString(2).length
                  });
                  setSimState(prev => ({
                    ...prev,
                    status: 'success',
                    logs: [
                      ...prev.logs,
                      `✅ ${methodLabel} Verified ${BigInt(nRecovered).toString(2).length}-bit modulus in ${durationMs}ms.`,
                      `p = ${sorted[0]}`,
                      `q = ${sorted[1]}`
                    ],
                    solution: {
                      x: 'Identified',
                      y: 'Identified',
                      factor1: sorted[0],
                      factor2: sorted[1],
                      allFactors: sorted
                    } as any,
                    executionTime: durationMs / 1000
                  }));
                }}
              />
            )}

            {primaryAlgorithm === 'rsa-500plus' && (
              <Rsa500PlusLabPanel
                currentN={rsaKey?.n || ''}
                currentP={rsaKey?.p || ''}
                currentQ={rsaKey?.q || ''}
                onLaunchChronos={(targetN) => {
                  handleManualNChange(targetN);
                  setPrimaryAlgorithm('chronos-196');
                  setStrategy('chronos-196');
                  runAttack(targetN, 'chronos-196');
                }}
                onFactorsRecovered={(nRecovered, pRecovered, qRecovered, methodLabel, durationMs) => {
                  const sorted = [BigInt(pRecovered), BigInt(qRecovered)].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: '65537',
                    d: '???',
                    bits: BigInt(nRecovered).toString(2).length
                  });
                  setSimState(prev => ({
                    ...prev,
                    status: 'success',
                    logs: [
                      ...prev.logs,
                      `✅ ${methodLabel} Solved ${BigInt(nRecovered).toString(2).length}-bit modulus in ${durationMs}ms.`,
                      `p = ${sorted[0]}`,
                      `q = ${sorted[1]}`
                    ],
                    solution: {
                      x: 'Identified',
                      y: 'Identified',
                      factor1: sorted[0],
                      factor2: sorted[1],
                      allFactors: sorted
                    } as any,
                    executionTime: durationMs / 1000
                  }));
                }}
              />
            )}

            {primaryAlgorithm === 'psi-factor' && (
              <PsiFactorLabPanel
                onEscalateToChronos={(targetN) => {
                  setPrimaryAlgorithm('chronos-196');
                  setStrategy('chronos-196');
                  runAttack(targetN, 'chronos-196');
                }}
                onFactorsRecovered={(nRecovered, pRecovered, qRecovered, methodLabel, durationMs) => {
                  const sorted = [BigInt(pRecovered), BigInt(qRecovered)].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: '65537',
                    d: '???',
                    bits: BigInt(nRecovered).toString(2).length
                  });
                  setSimState(prev => ({
                    ...prev,
                    status: 'success',
                    logs: [
                      ...prev.logs,
                      `✅ ${methodLabel} Verified ${BigInt(nRecovered).toString(2).length}-bit modulus in ${durationMs}ms.`,
                      `p = ${sorted[0]}`,
                      `q = ${sorted[1]}`
                    ],
                    solution: {
                      x: 'Identified',
                      y: 'Identified',
                      factor1: sorted[0],
                      factor2: sorted[1],
                      allFactors: sorted
                    } as any,
                    executionTime: durationMs / 1000
                  }));
                }}
              />
            )}

            <Chronos196Dashboard
              nValue={rsaKey?.n || ''}
              lang={lang}
              t={t}
              cycle={chronosCycle}
              suyamaInfo={chronosSuyamaInfo}
              cfracInfo={cfracInfo}
              mDualMatrix={chronosMDual}
              totalCurves={chronosCurves}
              smoothRelations={chronosSmooth}
              steps={chronosSteps}
              solution={
                simState.solution
                  ? {
                      factor1: simState.solution.factor1,
                      factor2: simState.solution.factor2,
                      allFactors: (simState.solution as any).allFactors,
                      method: unifiedRace.winningEngine || (strategy === 'chronos-196' ? t.stratChronosTitle : strategy.toUpperCase()),
                      duration: simState.executionTime ? Math.round(simState.executionTime * 1000) : undefined
                    }
                  : null
              }
              isRunning={workerActive}
              cpuUsage={cpuUsage}
              onSelectBenchmark={handleSelectBenchmark}
              workerCountMode={workerCountMode}
              onWorkerCountModeChange={setWorkerCountMode}
              effectiveWorkerCount={effectiveWorkerCount}
              workerThreadsStats={workerThreadsStats}
              gf2Stats={gf2Stats}
              sieveMode={sieveMode}
              onSieveModeChange={setSieveMode}
              benchmarkHistory={benchmarkHistory}
              onClearBenchmarks={() => setBenchmarkHistory([])}
              unifiedRace={unifiedRace}
              unifiedHints={unifiedHints}
              onUpdateUnifiedHints={setUnifiedHints}
              onLaunchUnifiedRace={(hintsArg) => runAttack(rsaKey?.n, 'chronos-196', hintsArg)}
              onStopUnifiedRace={stopAttack}
              redcSpeedupInfo={redcSpeedupInfo}
            />

            <div className="h-64 rounded-xl overflow-hidden border border-[#E2DDD2] bg-white">
              <TerminalLog logs={simState.logs} />
            </div>
          </div>
        )}

        {/* Tab 2: Reference & Custom Matrix Inspector + 3 Theorems */}
        {view === 'inspector' && (
          <MatrixInspectorModule onSendBlockPair={handleJumpToBlock} />
        )}

        {/* Tab 3: Infinite Mother Matrix U_∞ & Arbitrary Rank M_{p,q} Builder */}
        {view === 'infinite' && (
          <InfiniteMatrixModule initialP={selectedBlockPair.p} initialQ={selectedBlockPair.q} />
        )}

        {/* Tab 4: Riemann Zeta Dirichlet Series & Prime/Semiprime Counting */}
        {view === 'zeta' && <ZetaSpectrumModule />}
      </div>

      {/* Light Academic Modals */}
      <AnimatePresence>
        {showInputN && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/40 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.97, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 12 }}
              className="bg-white border border-[#E2DDD2] w-full max-w-xl rounded-xl overflow-hidden shadow-lg"
            >
              <div className="p-5 bg-[#F4F0E8] border-b border-[#E2DDD2] flex justify-between items-center">
                <h2 className="text-[#1C1917] text-sm font-bold font-serif-academic">
                  {t.customNLabel}
                </h2>
                <button onClick={() => setShowInputN(false)} className="text-[#57534E] hover:text-[#1C1917]">
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <textarea
                  value={customN}
                  onChange={(e) => setCustomN(e.target.value)}
                  className="w-full h-36 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 text-xs font-mono text-[#1C1917] outline-none focus:border-[#1E3A8A] transition-colors resize-none leading-relaxed"
                  placeholder={t.customNPlaceholder}
                  dir="ltr"
                />
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowInputN(false)}
                    className="text-xs font-semibold text-[#57534E] px-4 py-2 hover:text-[#1C1917]"
                  >
                    {t.closeBtn}
                  </button>
                  <button
                    onClick={handleCustomNSubmit}
                    className="bg-[#1E3A8A] hover:bg-[#172554] px-5 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                  >
                    {t.applyCustomN}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showImportPem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/40 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.97, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 12 }}
              className="bg-white border border-[#E2DDD2] w-full max-w-xl rounded-xl overflow-hidden shadow-lg"
            >
              <div className="p-5 bg-[#F4F0E8] border-b border-[#E2DDD2] flex justify-between items-center">
                <h2 className="text-[#1C1917] text-sm font-bold font-serif-academic">
                  {t.importPemLabel}
                </h2>
                <button onClick={() => setShowImportPem(false)} className="text-[#57534E] hover:text-[#1C1917]">
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <textarea
                  value={pemText}
                  onChange={(e) => setPemText(e.target.value)}
                  className="w-full h-36 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-4 text-xs font-mono text-[#1C1917] outline-none focus:border-[#1E3A8A] transition-colors resize-none leading-relaxed"
                  placeholder={t.importPemPlaceholder}
                  dir="ltr"
                />
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowImportPem(false)}
                    className="text-xs font-semibold text-[#57534E] px-4 py-2 hover:text-[#1C1917]"
                  >
                    {t.closeBtn}
                  </button>
                  <button
                    onClick={handlePemSubmit}
                    className="bg-[#1E3A8A] hover:bg-[#172554] px-5 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                  >
                    {t.importPemBtn}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;