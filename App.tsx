import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import forge from 'node-forge';
import { bigIntSqrt, generatePrime } from './mathUtils';
import { RSAKey, SimulationState } from './types';
import TerminalLog from './components/TerminalLog';
import Chronos196Dashboard, { ChronosSuyamaInfo, ChronosCfracInfo, WorkerThreadStat, Gf2PoolStats } from './components/Chronos196Dashboard';
import WorkerMatrixMonitor, { Gf2MonitorState } from './components/WorkerMatrixMonitor';
import FactorizerModule, { PrimaryFactorAlgorithm } from './components/FactorizerModule';
import CoppersmithLabPanel from './components/CoppersmithLabPanel';
import Zf1819LabPanel from './components/Zf1819LabPanel';
import PsiFactorLabPanel from './components/PsiFactorLabPanel';
import Ppfo2000LabPanel from './components/Ppfo2000LabPanel';
import PythonConsoleModule from './components/PythonConsoleModule';
import Rsa500PlusLabPanel from './components/Rsa500PlusLabPanel';
import CfracTelemetryPanel from './components/CfracTelemetryPanel';
import ZetaFactorPanel, { ZetaLiveTrace } from './components/ZetaFactorPanel';
import MatrixInspectorModule from './components/MatrixInspectorModule';
import InfiniteMatrixModule from './components/InfiniteMatrixModule';
import ZetaSpectrumModule from './components/ZetaSpectrumModule';
import ZfProjectSummaryModule from './components/ZfProjectSummaryModule';
import CmveVerificationPanel from './components/CmveVerificationPanel';
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
import { HGS_WORKER_CODE } from './hgsWorker';
import HgsDashboard, { HgsTraceState } from './components/HgsDashboard';
import {
  buildMpqsFactorBase,
  buildCfracSharedUnionFactorBase,
  CfracSharedUnionFb,
  selectRankedKnuthSchroeppelMultipliers,
  SingleLargePrimePool,
  isProbablePrimeBig,
  SmoothRelation
} from './mpqsGf2Solver';
import { analyzeSnfsAndCadoParams } from './snfsDetector';
import { computeV4SieveDiagnostics, EmpiricalBenchmarkRun, SieveAllocationMode } from './v4FallbackOptimizer';
import { runUnifiedFastScout, UnifiedRaceHints, UnifiedRaceSummary } from './lib/chronosUnifiedRace';
import {
  cacheFactorization,
  computeUniversalExponentReport,
  getCachedFactorization
} from './lib/universalExponentEngine';
import { generateUltraPreciseZetaSeeds, UltraPreciseZetaSeed } from './lib/zfSmartIntegrator';
import { evaluateZetaGuidanceForGf2, ZetaGf2GuidanceResult } from './lib/zetaGf2Advisor';
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
  const [strategy, setStrategy] = useState<'chronos-196' | 'hgs' | 'cfrac' | 'unbounded-qs' | 'hybrid' | 'zeta' | 'mmfr' | 'gleeok' | 'ecm' | 'pollard' | 'algebraic'>('chronos-196');
  const [primaryAlgorithm, setPrimaryAlgorithm] = useState<PrimaryFactorAlgorithm>('chronos-196');
  const [view, setView] = useState<'factorizer' | 'inspector' | 'infinite' | 'zeta' | 'zf-summary' | 'cmve'>('factorizer');
  const [selectedBlockPair, setSelectedBlockPair] = useState<{ p: number; q: number }>({ p: 7, q: 53 });
  const [zetaTrace, setZetaTrace] = useState<ZetaLiveTrace | null>(null);
  const [hgsTrace, setHgsTrace] = useState<HgsTraceState | null>(null);
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
  
  const [rsaKey, setRsaKey] = useState<RSAKey | null>(() => {
    const rep = computeUniversalExponentReport(DEFAULT_196_N, 'standard', 0.258, DEFAULT_196_P, DEFAULT_196_Q);
    return {
      p: DEFAULT_196_P,
      q: DEFAULT_196_Q,
      n: DEFAULT_196_N,
      e: rep.minimalPublicExponentE || rep.publicExponentE || '???',
      d: rep.minimalPrivateExponentD || rep.privateExponentD || '???',
      bits: 196
    };
  });

  const [workerActive, setWorkerActive] = useState(false);
  const [cpuUsage, setCpuUsage] = useState(0);
  const [gleeokStats, setGleeokStats] = useState<GleeokStats | null>(null);

  // Hybrid states (kept for worker trace compatibility)
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3>(1);
  const [hybridFingerprint, setHybridFingerprint] = useState<any>(null);
  const [hybridTrace, setHybridTrace] = useState<any>(null);
  const [hybridEcmStats, setHybridEcmStats] = useState<any>(null);
  const [stopStage1OnUniversalExp, setStopStage1OnUniversalExp] = useState<boolean>(true);
  const [universalExpStage1Halted, setUniversalExpStage1Halted] = useState<boolean>(false);
  const [isUniversalExpPending, setIsUniversalExpPending] = useState<boolean>(false);

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
  const [gf2Monitor, setGf2Monitor] = useState<Gf2MonitorState>({
    solverStage: 'idle',
    offThreadActive: false,
    sieversPausedForGf2: false,
    manualPaused: false,
    directFullCount: 0,
    partialCount: 0,
    pendingCyclesCount: 0,
    materializedCyclesCount: 0,
    totalRows: 0,
    totalCols: 0,
    lastTimings: null,
    solveCount: 0,
    lastSolveError: null
  });

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
  const gf2WorkerRef = useRef<Worker | null>(null);
  const gf2InFlightRef = useRef<boolean>(false);
  const gf2SolveSeqRef = useRef<number>(0);
  const manualPauseRef = useRef<boolean>(false);
  const pauseStartedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  const raceTimerRef = useRef<number | null>(null);
  const universalExpRunRef = useRef<boolean>(false);
  const stopStage1OnUniversalExpRef = useRef<boolean>(true);
  stopStage1OnUniversalExpRef.current = stopStage1OnUniversalExp;

  const getAutoWorkersCount = (bits: number): number => {
    const hw = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 8;
    if (bits <= 96) return Math.min(2, hw);
    if (bits <= 128) return Math.min(4, hw);
    if (bits <= 272) return Math.min(12, Math.max(4, hw));
    return Math.min(16, Math.max(4, hw));
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
      gf2WorkerRef.current?.terminate();
    };
  }, []);

  const addLog = (msg: string) => {
    setSimState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
  };

  const handleTogglePauseSievers = () => {
    if (!workerActive || gf2InFlightRef.current) return;
    const nextPaused = !manualPauseRef.current;
    manualPauseRef.current = nextPaused;
    if (nextPaused) {
      if (pauseStartedAtRef.current === null) pauseStartedAtRef.current = Date.now();
    } else if (pauseStartedAtRef.current !== null) {
      totalPausedMsRef.current += Math.max(0, Date.now() - pauseStartedAtRef.current);
      pauseStartedAtRef.current = null;
    }
    const msgType = nextPaused ? 'pause' : 'resume';
    workersRef.current.forEach(w => {
      try {
        w.postMessage({ type: msgType });
      } catch {}
    });
    setWorkerThreadsStats(prev =>
      prev.map(s => ({
        ...s,
        paused: nextPaused,
        pauseReason: nextPaused ? 'manual' : null
      }))
    );
    setGf2Monitor(prev => ({ ...prev, manualPaused: nextPaused }));
    addLog(nextPaused ? '⏸ تم إيقاف خيوط الغربلة مؤقتاً يدوياً.' : '▶ تم استئناف عمل خيوط الغربلة.');
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
    if (gf2WorkerRef.current) {
      gf2WorkerRef.current.terminate();
      gf2WorkerRef.current = null;
    }
    gf2InFlightRef.current = false;
    manualPauseRef.current = false;
    pauseStartedAtRef.current = null;
    totalPausedMsRef.current = 0;
    setWorkerActive(false);
    setIsUniversalExpPending(false);
    universalExpRunRef.current = false;
    setCpuUsage(0);
    setWorkerThreadsStats(prev => prev.map(s => ({ ...s, active: false, paused: false, pauseReason: null, stage: 'Stopped' })));
    setGf2Monitor(prev => ({
      ...prev,
      solverStage: 'idle',
      offThreadActive: false,
      sieversPausedForGf2: false,
      manualPaused: false
    }));
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

      setRsaKey({ n: nBig.toString(), p: "???", q: "???", e: "???", d: "???", bits: bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setHgsTrace(null);
      setBd500ZetaSeeds([]);
      setShowInputN(false);
      setCustomN("");
      setHybridFingerprint(null);
      setHybridTrace(null);
      setHybridEcmStats(null);
      setUniversalExpStage1Halted(false);
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
      if (p !== '???' && q !== '???') {
        cacheFactorization(nStr, p, q, [p, q], 'PEM Private Key');
      }

      setRsaKey({ n: nStr, p, q, e: eStr, d, bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setHgsTrace(null);
      setBd500ZetaSeeds([]);
      setUniversalExpStage1Halted(false);
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
      setRsaKey({ n: cleanN, p: "???", q: "???", e: "???", d: "???", bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setHgsTrace(null);
      setBd500ZetaSeeds([]);
      setUniversalExpStage1Halted(false);
      setSimState({
        status: 'idle',
        logs: [`>> Benchmark Selected: ${bits}-bit Target Modulus.`, `N = ${cleanN}`],
        relations: [],
        factorBase: PRIMES_LIST.slice(0, 15),
        matrix: [],
        solution: null
      });
      setView('factorizer');
      if (primaryAlgorithm !== 'cfrac' && primaryAlgorithm !== 'zeta' && primaryAlgorithm !== 'hgs') {
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
      setRsaKey({ n: cleanN, p: "???", q: "???", e: "???", d: "???", bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setZetaTrace(null);
      setHgsTrace(null);
      setBd500ZetaSeeds([]);
      setUniversalExpStage1Halted(false);
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

  const handleComputeUniversalExponent = (targetN?: string) => {
    const clean = (targetN ?? rsaKey?.n ?? '').replace(/[^0-9]/g, '');
    if (!clean) return;
    if (workerActive) {
      stopAttack();
    }
    const nBig = BigInt(clean);
    const bits = nBig.toString(2).length;
    if (clean !== rsaKey?.n) {
      setRsaKey({ n: clean, p: '???', q: '???', e: '???', d: '???', bits });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
    }

    const rep = computeUniversalExponentReport(clean, 'standard', 0.258, undefined, undefined, {
      stopStage1BeforeFactors: stopStage1OnUniversalExp
    });

    if (rep.isComplete) {
      setIsUniversalExpPending(false);
      if (stopStage1OnUniversalExp) {
        setUniversalExpStage1Halted(true);
        setSimState(prev => ({
          ...prev,
          status: 'idle',
          solution: null,
          logs: [
            ...prev.logs,
            `⏹ تم إيقاف المرحلة 1 قبل إيجاد/عرض العوامل فور إيجاد الأس العام λ(N) (${rep.lambdaBits} بت).`,
            `λ(N) = ${rep.lambdaN}`,
            `Verified a^λ(N) ≡ 1 (mod N) on ${rep.verifiedBasesCount} bases: ${rep.lambdaVerified}`
          ]
        }));
      } else {
        setUniversalExpStage1Halted(false);
        addLog(`✓ الأس العام الكامل λ(N) = ${rep.lambdaN} (تم الحساب بدقة تامة).`);
      }
      return;
    }

    // Large unknown composite (>88b): escalate to async Stage 1 workers to guarantee exact λ(N),
    // stopping Stage 1 BEFORE emitting factor decomposition when stopStage1OnUniversalExp is active.
    runAttack(clean, 'chronos-196', undefined, true);
  };

  const handleRevealFactorsAfterStage1 = () => {
    const clean = (rsaKey?.n || '').replace(/[^0-9]/g, '');
    if (!clean) return;
    setUniversalExpStage1Halted(false);
    const cached = getCachedFactorization(clean);
    if (cached) {
      const list = (cached.allFactors && cached.allFactors.length > 0 ? cached.allFactors : [cached.p, cached.q])
        .map(v => v.toString());
      setSimState(prev => ({
        ...prev,
        status: 'success',
        solution: {
          x: 'Identified',
          y: 'Identified',
          factor1: list[0],
          factor2: list.slice(1).join(' × ') || list[0],
          allFactors: list
        } as any,
        logs: [...prev.logs, `▶ تم استكمال وعرض العوامل الأولية للمودول (${list.join(' × ')}).`]
      }));
      return;
    }
    const rep = computeUniversalExponentReport(clean, 'standard', 0.258, undefined, undefined, {
      stopStage1BeforeFactors: false
    });
    if (rep.isComplete && rep.factors.length > 0) {
      const expanded: string[] = [];
      for (const f of rep.factors) {
        for (let i = 0; i < f.power; i++) expanded.push(f.prime);
      }
      setSimState(prev => ({
        ...prev,
        status: 'success',
        solution: {
          x: 'Identified',
          y: 'Identified',
          factor1: expanded[0],
          factor2: expanded.slice(1).join(' × ') || expanded[0],
          allFactors: expanded
        } as any
      }));
    } else {
      runAttack(clean, 'chronos-196', undefined, false);
    }
  };

  const runAttack = async (
    overrideN?: string,
    strategyOverride?: 'chronos-196' | 'hgs' | 'cfrac' | 'zeta',
    hintsOverride?: UnifiedRaceHints,
    universalExponentOnly = false
  ) => {
    universalExpRunRef.current = universalExponentOnly;
    setIsUniversalExpPending(universalExponentOnly);
    if (!universalExponentOnly) {
      setUniversalExpStage1Halted(false);
    }
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
    if (gf2WorkerRef.current) {
      gf2WorkerRef.current.terminate();
      gf2WorkerRef.current = null;
    }
    gf2InFlightRef.current = false;
    manualPauseRef.current = false;
    pauseStartedAtRef.current = null;
    totalPausedMsRef.current = 0;
    setGf2Monitor({
      solverStage: 'idle',
      offThreadActive: false,
      sieversPausedForGf2: false,
      manualPaused: false,
      directFullCount: 0,
      partialCount: 0,
      pendingCyclesCount: 0,
      materializedCyclesCount: 0,
      totalRows: 0,
      totalCols: 0,
      lastTimings: null,
      solveCount: 0,
      lastSolveError: null
    });

    const nBigInit = BigInt(N);
    const nBitsInit = nBigInit.toString(2).length;
    if (cleanOverride && cleanOverride !== rsaKey?.n) {
      setRsaKey({ n: N, p: "???", q: "???", e: "???", d: "???", bits: nBitsInit });
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
    setHgsTrace(activeStrat === 'hgs' ? {
      stage: 'presieve',
      stageMessage: 'HGS 32KB Tiled Arrays + SQUFOF Initializing Across All Cores...',
      factorBase: [],
      factorBaseSize: 0,
      polynomial: 'SIQS Q(x) = A x² + 2Bx + C (Gray-Code + 32KB-Tiled)',
      smoothCount: 0,
      targetSmooth: 45,
      scannedCount: 0,
      skippedCount: 0,
      relations: [],
      matrixPreview: [],
      congruence: null,
      factorTree: null,
      activeWorkers: Math.max(1, effectiveWorkerCount),
      relRatePerSec: 0,
      lpCollisions: 0,
      partialCount: 0,
      squfof2LpCount: 0,
      blocksProcessed: 0
    } : null);
    setCurrentStage(1);
    setChronosSteps(0);

    if (activeStrat === 'chronos-196' || activeStrat === 'hgs' || activeStrat === 'cfrac') {
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
      const isHgs = activeStrat === 'hgs';

      // Fast Unified Race Scout (Ψ-Factor + >500b SNFS/Wiener/BD + ZF-18 Coppersmith + ZF-15/17 Spectral Guidance + 500d Zeta Seeds)
      let scoutOps = 0;
      let zfWorkerSeeds: Array<{
        seedOffset: number;
        recommendedMultiplier: number;
        zetaSigmaSeed?: string;
        zetaRhoSeed?: string;
      }> = [];

      let localZetaSeeds: UltraPreciseZetaSeed[] = bd500ZetaSeeds;

      if (isZeta) {
        try {
          const seeds500 = generateUltraPreciseZetaSeeds(nBig, 6, 48);
          localZetaSeeds = seeds500;
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
          localZetaSeeds = scout.zfGuidance.zetaSeeds;
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
          setIsUniversalExpPending(false);
          setCpuUsage(0);
          if (sorted.length >= 2) {
            cacheFactorization(N, sorted[0], (nBig / BigInt(sorted[0])).toString(), sorted, scout.winningEngine || 'Unified Fast Scout');
          }
          if (universalExpRunRef.current && stopStage1OnUniversalExpRef.current) {
            setUniversalExpStage1Halted(true);
            setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
            const rep = computeUniversalExponentReport(N, 'standard', 0.258, undefined, undefined, { stopStage1BeforeFactors: true });
            addLog(`⏹ تم إيقاف المرحلة 1 قبل عرض العوامل فور تحديد الأس العام λ(N) (${durationMs}ms).`);
            addLog(`λ(N) = ${rep.lambdaN}`);
            setSimState(prev => ({ ...prev, status: 'idle', solution: null }));
            return;
          }
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

      // Fast Pre-Sieve for standalone HGS (even / exact square / prime / small primes < 30000)
      if (isHgs) {
        const makeTree = (f1: bigint, f2: bigint) => ({
          value: nBig.toString(),
          bits: nBitsVal,
          isPrime: false,
          left: { value: f1.toString(), bits: f1.toString(2).length, isPrime: isProbablePrimeBig(f1, 8), role: 'factor_p' },
          right: { value: f2.toString(), bits: f2.toString(2).length, isPrime: isProbablePrimeBig(f2, 8), role: 'factor_q' }
        });
        let preFactor: bigint | null = null;
        let preMethod = '';
        let preOps = 0;
        if ((nBig & 1n) === 0n && nBig > 2n) {
          preFactor = 2n;
          preOps = 2;
          preMethod = 'HGS Pre-Sieve (Even Modulus)';
        } else {
          const sq = bigIntSqrt(nBig);
          preOps += 4;
          if (sq * sq === nBig) {
            preFactor = sq;
            preMethod = 'HGS Pre-Sieve (Exact Square)';
          } else {
            preOps += 10;
            if (isProbablePrimeBig(nBig, 10)) {
              const durationMs = Math.max(1, Date.now() - runStartedAt);
              setWorkerActive(false);
              setCpuUsage(0);
              setChronosSteps(preOps);
              setUnifiedRace({
                status: 'success',
                winningEngine: 'Miller-Rabin Pre-Check (Prime N)',
                factors: [nBig.toString()],
                verifiedProduct: true,
                verifiedPrimes: true,
                elapsedMs: durationMs,
                totalOperations: preOps
              });
              setHgsTrace(prev => prev ? {
                ...prev,
                stage: 'success',
                duration: durationMs,
                factorTree: { value: nBig.toString(), bits: nBitsVal, isPrime: true }
              } : prev);
              addLog(`✓ العدد N اجتاز فحص الأولية المحتملة (10 أساسات Miller-Rabin · ${preOps} ops).`);
              setSimState(prev => ({
                ...prev,
                status: 'success',
                solution: { x: 'Prime', y: 'Prime', factor1: nBig.toString(), factor2: '1', allFactors: [nBig.toString()] } as any,
                executionTime: durationMs / 1000,
                cycles: preOps
              }));
              return;
            }
            for (let i = 0; i < PRIMES_LIST.length; i++) {
              const p = BigInt(PRIMES_LIST[i]);
              if (p >= nBig) break;
              preOps++;
              if (nBig % p === 0n) {
                preFactor = p;
                preMethod = `HGS Pre-Sieve Small Prime (p=${p})`;
                break;
              }
            }
          }
        }
        if (preFactor && preFactor > 1n && preFactor < nBig) {
          const other = nBig / preFactor;
          const sortedBig = preFactor <= other ? [preFactor, other] : [other, preFactor];
          const sorted = sortedBig.map(v => v.toString());
          const durationMs = Math.max(1, Date.now() - runStartedAt);
          const safeOps = Math.max(1, preOps);
          cacheFactorization(N, sorted[0], sorted[1], sorted, preMethod);
          setWorkerActive(false);
          setCpuUsage(0);
          setChronosSteps(safeOps);
          setUnifiedRace({
            status: 'success',
            winningEngine: preMethod,
            factors: sorted,
            verifiedProduct: sortedBig[0] * sortedBig[1] === nBig,
            verifiedPrimes: isProbablePrimeBig(sortedBig[0], 10) && isProbablePrimeBig(sortedBig[1], 10),
            elapsedMs: durationMs,
            totalOperations: safeOps
          });
          setHgsTrace(prev => prev ? {
            ...prev,
            stage: 'success',
            duration: durationMs,
            factorTree: makeTree(sortedBig[0], sortedBig[1])
          } : prev);
          addLog(`✅ ${t.factorizationSuccess} (${preMethod} · ${durationMs}ms · ${safeOps.toLocaleString()} ops)`);
          addLog(`Prime Factors: ${sorted.join(' × ')}`);
          setSimState(prev => ({
            ...prev,
            status: 'success',
            solution: { x: 'Identified', y: 'Identified', factor1: sorted[0], factor2: sorted[1], allFactors: sorted } as any,
            executionTime: durationMs / 1000,
            cycles: safeOps
          }));
          return;
        }
      }

      // Worker Pool Configuration:
      // In Unified Chronos v4 mode (<=272b): 1 ECM/p±1 Worker + 1 CFRAC Worker + HGS SIQS Worker(s) + Chronos SIQS Workers sharing ONE GF(2) Matrix!
      // In Unified Chronos v4 mode (>272b): All workers race REDC ECM + p-1 + p+1 with 500d Zeta spectral seeds.
      // In standalone CFRAC or HGS mode: All effectiveWorkerCount CPU workers race into ONE shared Union GF(2) Matrix!
      const useSiqsUnified = isChronos && nBitsVal <= 272;
      const numWorkers = isChronos
        ? (useSiqsUnified ? Math.max(4, effectiveWorkerCount) : effectiveWorkerCount)
        : ((isCfrac || isHgs) ? Math.max(1, effectiveWorkerCount) : 1);
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

      let hgsUrl = '';
      if (isHgs || useSiqsUnified) {
        const hgsBlob = new Blob([HGS_WORKER_CODE], { type: 'application/javascript' });
        hgsUrl = URL.createObjectURL(hgsBlob);
        workerUrlsRef.current.push(hgsUrl);
      }

      let fallbackStrategyUrl = chronosUrl;
      if (!isChronos && !isCfrac && !isHgs) {
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

      const workerRoles: Array<'ecm' | 'siqs' | 'cfrac' | 'hgs'> = Array.from({ length: numWorkers }, (_, idx) => {
        if (isCfrac) return 'cfrac';
        if (isHgs) return 'hgs';
        if (!isChronos) return 'siqs';
        if (!useSiqsUnified) return 'ecm';
        if (idx === 0) return 'ecm';
        if (numWorkers >= 4 && idx === 1) return 'cfrac';
        return 'hgs';
      });
      const ecmWorkerCount = workerRoles.filter(r => r === 'ecm').length;

      setWorkerThreadsStats(
        workerRoles.map((roleVal, idx) => ({
          id: idx,
          role: roleVal,
          curves: 0,
          polys: 0,
          relations: 0,
          stage: roleVal === 'cfrac'
            ? 'CFRAC Fast-2LP √(kN) → GF(2)'
            : roleVal === 'hgs'
            ? 'HGS SIQS+Gray+1LP → GF(2)'
            : roleVal === 'ecm'
            ? 'Zeta REDC ECM + p±1'
            : 'SIQS v4 → GF(2)',
          active: true
        }))
      );

      const rankedKsRes = (useSiqsUnified || isCfrac || isHgs)
        ? selectRankedKnuthSchroeppelMultipliers(nBig, Math.max(18, numWorkers + 12))
        : { ranked: [1], directFactor: undefined };

      const directKsFactor = rankedKsRes.directFactor;
      const zetaGuide: ZetaGf2GuidanceResult | null = (!directKsFactor && (useSiqsUnified || isCfrac))
        ? evaluateZetaGuidanceForGf2(nBig, rankedKsRes.ranked, localZetaSeeds)
        : null;

      if (zetaGuide && zetaGuide.zetaSeeds.length > 0 && localZetaSeeds.length === 0) {
        setBd500ZetaSeeds(zetaGuide.zetaSeeds);
      }

      const instantFactor =
        (directKsFactor && directKsFactor > 1n && directKsFactor < nBig)
          ? directKsFactor
          : (zetaGuide?.directFactor && zetaGuide.directFactor > 1n && zetaGuide.directFactor < nBig
              ? zetaGuide.directFactor
              : null);

      if (instantFactor) {
        const f1 = instantFactor;
        const f2 = nBig / f1;
        const sorted = [f1, f2].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
        const winLabel = directKsFactor ? 'Knuth-Schroeppel Multiplier GCD' : 'Zeta Spectral Seed Micro-Sweep';
        cacheFactorization(N, sorted[0], sorted[1], sorted, winLabel);
        const durationMs = Math.max(1, Date.now() - runStartedAt);
        setWorkerActive(false);
        setIsUniversalExpPending(false);
        setCpuUsage(0);
        if (universalExpRunRef.current && stopStage1OnUniversalExpRef.current) {
          setUniversalExpStage1Halted(true);
          setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
          const rep = computeUniversalExponentReport(N, 'standard', 0.258, undefined, undefined, { stopStage1BeforeFactors: true });
          addLog(`⏹ تم إيقاف المرحلة 1 قبل عرض العوامل فور تحديد الأس العام λ(N) (${durationMs}ms).`);
          addLog(`λ(N) = ${rep.lambdaN}`);
          setSimState(prev => ({ ...prev, status: 'idle', solution: null }));
          return;
        }
        setUnifiedRace({
          status: 'success',
          winningEngine: winLabel,
          factors: sorted,
          verifiedProduct: f1 * f2 === nBig,
          verifiedPrimes: sorted.every(v => isProbablePrimeBig(BigInt(v), 10)),
          elapsedMs: durationMs,
          totalOperations: scoutOps + 64,
          noteAr: zetaGuide?.directFactor ? zetaGuide.summaryAr : undefined
        });
        addLog(`✅ ${t.factorizationSuccess} (${winLabel} · ${durationMs}ms)`);
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
          executionTime: durationMs / 1000,
          cycles: scoutOps + 64
        }));
        return;
      }

      if (zetaGuide) {
        addLog(`>> [Zeta→GF(2)] ${zetaGuide.summaryAr}`);
      }

      const optK = zetaGuide ? zetaGuide.selectedK : (rankedKsRes.ranked[0] ?? 1);
      const siqsM = BigInt(optK) * nBig;
      const rankedKsAll = zetaGuide
        ? zetaGuide.cfracMultipliers
        : (isCfrac
            ? rankedKsRes.ranked
            : [optK, ...[1, 3, 5, 7, 11, 13, 17, 19, 21, 23, 29].filter(v => v !== optK)]);
      const CFRAC_MULTIPLIERS = rankedKsAll.length > 0 ? rankedKsAll : [1, 3, 5, 7, 11, 13, 17];

      const cfracUnionFb: CfracSharedUnionFb | null = isCfrac
        ? buildCfracSharedUnionFactorBase(nBig, CFRAC_MULTIPLIERS.slice(0, Math.min(CFRAC_MULTIPLIERS.length, numWorkers + 6)))
        : null;

      let cfracMultIdx = 0;
      let activeCfracK = CFRAC_MULTIPLIERS[0];
      const workerCfracKMap: number[] = Array.from({ length: numWorkers }, (_, idx) => CFRAC_MULTIPLIERS[idx % CFRAC_MULTIPLIERS.length]);
      let nextCfracQueueIdx = numWorkers;
      let exhaustedCfracWorkers = 0;

      // Shared Factor Base & Single+Double Large Prime Pool so all CFRAC/HGS/SIQS workers share ONE GF(2) Matrix
      const activeFb = isCfrac && cfracUnionFb
        ? { primes: cfracUnionFb.sharedPrimes, roots: [] as number[], logs: [] as number[], largePrimeBound: cfracUnionFb.largePrimeBound }
        : ((useSiqsUnified || isHgs) ? buildMpqsFactorBase(nBig, siqsM, effectiveWorkerCount) : { primes: [], roots: [], logs: [], largePrimeBound: 0 });
      const lpPool = new SingleLargePrimePool(nBig, activeFb.primes);
      const targetRelations = activeFb.primes.length + (nBitsVal >= 260 ? 24 : (nBitsVal >= 160 ? 14 : (isCfrac ? 6 : 10)));
      let targetRelationsCurrent = targetRelations;
      let gf2Cursor = { fulls: 0, tree: 0, cycles: 0 };
      const v4Diag = computeV4SieveDiagnostics();
      const zetaWidthScale = zetaGuide ? zetaGuide.sieveHalfWidthScale : 1.0;
      const activeSieveWeights = sieveMode === 'v4-fallback'
        ? { rowMedians: v4Diag.rowMedians, colPriors: v4Diag.colPriors6, zetaWidthScale }
        : (zetaWidthScale !== 1.0 ? { zetaWidthScale } : null);
      const totalSiqsWorkers = Math.max(0, workerRoles.filter(r => r === 'siqs').length);
      const totalHgsWorkers = workerRoles.filter(r => r === 'hgs').length;
      const totalPolyWorkers = Math.max(1, totalSiqsWorkers + totalHgsWorkers);
      const workerPolysMap = new Array(numWorkers).fill(0);
      const workerOpsMap = new Array(numWorkers).fill(0);
      const workerScannedMap = new Array(numWorkers).fill(0);
      const workerSkippedMap = new Array(numWorkers).fill(0);
      const workerBlocksMap = new Array(numWorkers).fill(0);
      const workerSqufofMap = new Array(numWorkers).fill(0);
      let krylovOpsAccum = 0;
      let siqsRelCount = 0;
      let hgsRelCount = 0;
      let cfracRelCount = 0;
      let matrixSolves = 0;
      let lastMatrixSolveLen = 0;

      if (useSiqsUnified || isHgs || isCfrac) {
        setGf2Monitor(prev => ({
          ...prev,
          totalCols: activeFb.primes.length + 1
        }));
      }

      const getActiveElapsedSec = () => {
        const curPause = pauseStartedAtRef.current !== null ? Math.max(0, Date.now() - pauseStartedAtRef.current) : 0;
        return Math.max(0.05, (Date.now() - runStartedAt - totalPausedMsRef.current - curPause) / 1000);
      };

      const dispatchPauseToSievers = (paused: boolean, reason: 'gf2' | 'manual' | null) => {
        if (paused) {
          if (pauseStartedAtRef.current === null) pauseStartedAtRef.current = Date.now();
        } else if (!manualPauseRef.current && pauseStartedAtRef.current !== null) {
          totalPausedMsRef.current += Math.max(0, Date.now() - pauseStartedAtRef.current);
          pauseStartedAtRef.current = null;
        }
        const msgType = paused ? 'pause' : 'resume';
        workersRef.current.forEach(w => {
          try {
            w.postMessage({ type: msgType });
          } catch {}
        });
        setWorkerThreadsStats(prev =>
          prev.map(s => ({
            ...s,
            paused,
            pauseReason: paused ? reason : null
          }))
        );
      };

      const formatUnifiedWinLabel = (bwMethod: string) => {
        const parts: string[] = [];
        if (siqsRelCount > 0) parts.push('SIQS');
        if (hgsRelCount > 0) parts.push('HGS');
        if (cfracRelCount > 0) parts.push('CFRAC');
        if (parts.length >= 2 || hgsRelCount > 0 || cfracRelCount > 0) {
          return `GF(2) الموحد (${parts.join(' + ')} · ${bwMethod})`;
        }
        return `Chronos SIQS v4 (${bwMethod})`;
      };

      const getCurrentTotalOps = () =>
        scoutOps + krylovOpsAccum + workerOpsMap.reduce((a, b) => a + b, 0);

      if (isChronos || isHgs || isCfrac) {
        raceTimerRef.current = window.setInterval(() => {
          const liveOps = getCurrentTotalOps();
          setChronosSteps(liveOps);
          setUnifiedRace(prev =>
            prev.status === 'racing'
              ? {
                  ...prev,
                  elapsedMs: Date.now() - runStartedAt,
                  totalOperations: liveOps,
                  sharedGf2Stats: (useSiqsUnified || isHgs || isCfrac)
                    ? {
                        siqsRelations: siqsRelCount,
                        hgsRelations: hgsRelCount,
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
            ? 'Unified GF(2) (SIQS + HGS + CFRAC)'
            : 'Parallel Zeta-Seeded REDC ECM + p±1',
          partialCount: 0,
          lpCollisions: 0,
          krylovSteps: 0,
          coreShape: ''
        });
        addLog(
          useSiqsUnified
            ? `>> Chronos v4 Unified Race: ${ecmWorkerCount} Zeta REDC ECM/p±1 + 1 CFRAC + ${totalHgsWorkers} HGS (Gray+1LP/2LP) + ${totalSiqsWorkers} SIQS v4 (k=${optK}) | Shared GF(2) QR-FB=${activeFb.primes.length}.`
            : `>> Chronos v4 Unified Race (>272b): ${numWorkers} Parallel Zeta-Seeded Montgomery REDC ECM + p−1/p+1 Workers Active.`
        );
      } else if (isHgs) {
        const fbPreview = activeFb.primes.length > 220
          ? [-1, ...activeFb.primes.slice(0, 180), activeFb.primes[activeFb.primes.length - 1]]
          : [-1, ...activeFb.primes];
        setHgsTrace(prev => prev ? {
          ...prev,
          stage: 'sieving',
          stageMessage: `32KB Working-Set Tiled SIQS + 17b Bucket + SQUFOF 2LP across ${numWorkers} Workers...`,
          factorBase: fbPreview,
          factorBaseSize: activeFb.primes.length,
          polynomial: `SIQS Q(x) = A x² + 2Bx + C (k=${optK}, 32KB-Tiled + SQUFOF ×${numWorkers})`,
          targetSmooth: targetRelations,
          activeWorkers: numWorkers
        } : prev);
        setGf2Stats({
          collected: 0,
          target: targetRelations,
          factorBaseSize: activeFb.primes.length,
          matrixSolves: 0,
          lastSource: `Parallel HGS ×${numWorkers} (32KB-Tiled + SQUFOF)`,
          partialCount: 0,
          lpCollisions: 0,
          krylovSteps: 0,
          coreShape: ''
        });
        addLog(`>> Parallel HGS ×${numWorkers} Workers Active: k=${optK}, QR-FB=${activeFb.primes.length}, L_max=${activeFb.largePrimeBound.toLocaleString()}, 32KB-Tiled Arrays + Piecewise Log + SQUFOF 2LP → markowitz-core.`);
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
        setIsUniversalExpPending(false);
        setCpuUsage(0);
        workersRef.current.forEach(w => w.terminate());
        workersRef.current = [];
        workerUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        workerUrlsRef.current = [];
        if (gf2WorkerRef.current) {
          gf2WorkerRef.current.terminate();
          gf2WorkerRef.current = null;
        }
        gf2InFlightRef.current = false;
        manualPauseRef.current = false;
        pauseStartedAtRef.current = null;
        totalPausedMsRef.current = 0;
        setWorkerThreadsStats(prev => prev.map(s => ({ ...s, active: false, paused: false, pauseReason: null, stage: winningEngineLabel })));
        setGf2Monitor(prev => ({
          ...prev,
          solverStage: 'solved',
          offThreadActive: false,
          sieversPausedForGf2: false,
          manualPaused: false
        }));

        if (sortedFactors.length >= 2) {
          cacheFactorization(
            N,
            sortedFactors[0],
            (nBig / BigInt(sortedFactors[0])).toString(),
            sortedFactors,
            winningEngineLabel
          );
        }

        if (universalExpRunRef.current && stopStage1OnUniversalExpRef.current) {
          setUniversalExpStage1Halted(true);
          setUnifiedRace({
            status: 'idle',
            winningEngine: null,
            factors: [],
            verifiedProduct: false,
            verifiedPrimes: false,
            elapsedMs: 0,
            totalOperations: 0
          });
          return;
        }

        const safeTotalOps = Math.max(1, totalOps, getCurrentTotalOps());
        setChronosSteps(safeTotalOps);

        setUnifiedRace({
          status: 'success',
          winningEngine: winningEngineLabel,
          factors: sortedFactors,
          verifiedProduct: sortedFactors.reduce((acc, v) => acc * BigInt(v), 1n) === nBig,
          verifiedPrimes: sortedFactors.every(v => isProbablePrimeBig(BigInt(v), 10)),
          elapsedMs: durationMs,
          totalOperations: safeTotalOps,
          sharedGf2Stats: (useSiqsUnified || isHgs || isCfrac)
            ? {
                siqsRelations: siqsRelCount,
                hgsRelations: hgsRelCount,
                cfracRelations: cfracRelCount,
                totalFullRelations: lpPool.fullCount,
                targetRelations: targetRelationsCurrent,
                lpCollisions: lpPool.collisionsCount,
                matrixSolves
              }
            : undefined,
          noteAr
        });
      };

      const gf2SolveContextMap = new Map<number, { sourceKind: 'chronos' | 'hgs' | 'cfrac'; workerK?: number; collectedAtTrigger: number }>();

      const setupDedicatedGf2Worker = () => {
        if (!(useSiqsUnified || isHgs || isCfrac)) return;
        const gf2w = new Worker(new URL('./gf2Worker.ts', import.meta.url), { type: 'module' });
        gf2WorkerRef.current = gf2w;
        gf2w.postMessage({ type: 'init', nStr: N, fbPrimes: activeFb.primes });
        gf2w.onmessage = (ev: MessageEvent) => {
          if (solutionFound) return;
          const msg = ev.data;
          if (!msg) return;

          if (msg.type === 'gf2_stage') {
            if (msg.solveId !== gf2SolveSeqRef.current) return;
            setGf2Monitor(prev => ({
              ...prev,
              solverStage: msg.stage === 'materializing_bfs' ? 'materializing_bfs' : 'markowitz_sge',
              materializedCyclesCount: typeof msg.builtCycles === 'number' ? msg.builtCycles : prev.materializedCyclesCount,
              totalRows: typeof msg.totalRows === 'number' ? msg.totalRows : prev.totalRows,
              totalCols: typeof msg.totalCols === 'number' ? msg.totalCols : prev.totalCols
            }));
          } else if (msg.type === 'gf2_solved') {
            if (msg.solveId !== gf2SolveSeqRef.current) return;
            const ctxMeta = gf2SolveContextMap.get(msg.solveId);
            gf2SolveContextMap.delete(msg.solveId);
            gf2InFlightRef.current = false;

            if (msg.redcBenchmark) {
              setRedcSpeedupInfo(msg.redcBenchmark);
            }
            krylovOpsAccum += Math.max(64, (msg.krylovSteps || 1) * 64);

            setGf2Stats(prev => ({
              ...prev,
              matrixSolves,
              krylovSteps: msg.krylovSteps,
              coreShape: `${msg.coreRows}×${msg.coreCols}`,
              solverMethod: msg.methodUsed
            }));

            setGf2Monitor(prev => ({
              ...prev,
              lastTimings: msg.stageTimings || prev.lastTimings,
              materializedCyclesCount: typeof msg.builtCycles === 'number' ? msg.builtCycles : prev.materializedCyclesCount,
              pendingCyclesCount: typeof msg.remainingCycles === 'number' ? msg.remainingCycles : prev.pendingCyclesCount,
              totalRows: msg.totalRows || prev.totalRows,
              totalCols: msg.totalCols || prev.totalCols
            }));

            if (isHgs) {
              setHgsTrace(prev => prev ? {
                ...prev,
                stage: 'congruence',
                matrixDimensions: {
                  rows: msg.totalRows || 0,
                  cols: msg.totalCols || (activeFb.primes.length + 1),
                  dependencies: msg.dependenciesTested || 0
                }
              } : prev);
            }

            const f1 = msg.factorStr ? BigInt(msg.factorStr) : null;
            if (f1 && f1 > 1n && f1 < nBig) {
              const f2 = nBig / f1;
              if (isProbablePrimeBig(f1, 10) && isProbablePrimeBig(f2, 10)) {
                solutionFound = true;
                const sorted = [f1, f2].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                const durationMs = Math.max(1, Date.now() - runStartedAt);
                const elapsed = durationMs / 1000;
                const totalPolys = workerPolysMap.reduce((a, b) => a + b, 0);
                const totalCfracStepsNow = workerOpsMap.reduce((acc, v) => acc + Math.floor(v / 4), 0);
                const finalOps = getCurrentTotalOps();
                const collected = ctxMeta?.collectedAtTrigger ?? lpPool.fullCount;
                const sourceKind = ctxMeta?.sourceKind ?? 'chronos';
                const workerK = ctxMeta?.workerK ?? activeCfracK;
                const methodLabel = msg.methodUsed || 'markowitz-core';
                const winLabel = sourceKind === 'hgs' && isHgs
                  ? `HGS Parallel ×${numWorkers} (128-Bias + SQUFOF + ${methodLabel})`
                  : (sourceKind === 'cfrac' && !isChronos
                      ? `Parallel CFRAC ×${numWorkers} (k=${workerK}) · ${methodLabel}`
                      : formatUnifiedWinLabel(methodLabel));

                setBenchmarkHistory(prev => [
                  {
                    mode: sourceKind === 'cfrac' && !isChronos ? 'cfrac' : sieveMode,
                    bits: nBitsVal,
                    n: N,
                    durationMs,
                    relationsCollected: collected,
                    polysProcessed: sourceKind === 'cfrac' && !isChronos ? totalCfracStepsNow : totalPolys,
                    relationsPerSec: Number((collected / getActiveElapsedSec()).toFixed(2)),
                    lpCollisions: lpPool.collisionsCount,
                    solveMethod: sourceKind === 'cfrac' && !isChronos ? winLabel : methodLabel,
                    verified: f1 * f2 === nBig
                  },
                  ...prev
                ].slice(0, 12));

                if (isHgs) {
                  setHgsTrace(prev => prev ? {
                    ...prev,
                    stage: 'success',
                    duration: durationMs,
                    congruence: {
                      X: 'markowitz-core GF(2) Product',
                      Y: 'Square-Root Congruence',
                      diff: `|X - Y| mod N (${msg.dependenciesTested} deps)`,
                      g1: sorted[0],
                      g2: sorted[1],
                      factor1: sorted[0],
                      factor2: sorted[1],
                      duration: durationMs
                    },
                    factorTree: {
                      value: nBig.toString(),
                      bits: nBitsVal,
                      isPrime: false,
                      left: { value: sorted[0], bits: BigInt(sorted[0]).toString(2).length, isPrime: true, role: 'factor_p' },
                      right: { value: sorted[1], bits: BigInt(sorted[1]).toString(2).length, isPrime: true, role: 'factor_q' }
                    }
                  } : prev);
                }

                const noteAr = isHgs
                  ? `حُسمت مصفوفة HGS في Worker مستقل (${numWorkers} أنوية · ${collected} علاقة · ${lpPool.collisionsCount} دورة SQUFOF/LP).`
                  : (isChronos
                      ? `حُسمت مصفوفة GF(2) الموحدة في Worker مستقل (${siqsRelCount} SIQS + ${hgsRelCount} HGS + ${cfracRelCount} CFRAC).`
                      : undefined);

                finishUnifiedSuccess(winLabel, sorted, durationMs, finalOps, noteAr);

                if (universalExpRunRef.current && stopStage1OnUniversalExpRef.current) {
                  const rep = computeUniversalExponentReport(N, 'standard', 0.258, undefined, undefined, { stopStage1BeforeFactors: true });
                  addLog(`⏹ تم إيقاف المرحلة 1 قبل عرض العوامل فور تحديد الأس العام λ(N) (${durationMs}ms).`);
                  addLog(`λ(N) = ${rep.lambdaN}`);
                  setSimState(prev => ({ ...prev, status: 'idle', solution: null }));
                  return;
                }

                const st = msg.stageTimings;
                if (st) {
                  addLog(`>> [GF(2) Worker] BFS=${st.bfsBuildMs}ms (${st.builtCycles} cycles) · Markowitz=${st.markowitzMs}ms · Solve=${st.linearSolveMs}ms · Sqrt=${st.sqrtMs}ms`);
                }
                addLog(`✅ ${t.factorizationSuccess} (${winLabel} · ${durationMs}ms · ${finalOps.toLocaleString()} ops)`);
                addLog(`Prime Factors: ${sorted.join(' × ')}`);
                addLog(`Verification (Product == N): ${f1 * f2 === nBig}`);

                setSimState(prev => ({
                  ...prev,
                  status: 'success',
                  solution: {
                    x: 'Identified',
                    y: 'Identified',
                    factor1: sorted[0],
                    factor2: sorted[1],
                    allFactors: sorted
                  } as any,
                  executionTime: elapsed,
                  cycles: finalOps
                }));
                return;
              } else {
                addLog(`⚡ GF(2) Worker split composite factor (${f1.toString().slice(0, 14)}...) — collecting more relations...`);
              }
            }

            // No prime factor found yet — expand target and resume sievers
            targetRelationsCurrent = Math.max(targetRelationsCurrent, lpPool.fullCount) + (nBitsVal >= 260 ? 24 : (nBitsVal >= 160 ? 14 : 8));
            setGf2Stats(prev => ({ ...prev, target: targetRelationsCurrent }));
            setGf2Monitor(prev => ({
              ...prev,
              solverStage: 'idle',
              offThreadActive: false,
              sieversPausedForGf2: false
            }));
            if (!manualPauseRef.current) {
              dispatchPauseToSievers(false, null);
            }
          } else if (msg.type === 'gf2_error') {
            if (msg.solveId !== gf2SolveSeqRef.current) return;
            gf2InFlightRef.current = false;
            setGf2Monitor(prev => ({
              ...prev,
              solverStage: 'idle',
              offThreadActive: false,
              sieversPausedForGf2: false,
              lastSolveError: msg.message || 'GF(2) worker error'
            }));
            addLog(`⚠ GF(2) Worker: ${msg.message || 'Error'} — resuming sievers.`);
            if (!manualPauseRef.current) {
              dispatchPauseToSievers(false, null);
            }
          }
        };
        gf2w.onerror = () => {
          gf2InFlightRef.current = false;
          setGf2Monitor(prev => ({
            ...prev,
            solverStage: 'idle',
            offThreadActive: false,
            sieversPausedForGf2: false,
            lastSolveError: 'GF(2) worker crashed'
          }));
          if (!manualPauseRef.current) {
            dispatchPauseToSievers(false, null);
          }
        };
      };

      setupDedicatedGf2Worker();

      const triggerOffThreadGf2Solve = (sourceKind: 'chronos' | 'hgs' | 'cfrac', workerK?: number) => {
        if (solutionFound || gf2InFlightRef.current || !gf2WorkerRef.current) return;
        const collected = lpPool.fullCount;
        const solveDelta = sourceKind === 'cfrac'
          ? (nBitsVal >= 120 ? 10 : 4)
          : (nBitsVal >= 260 ? 24 : (nBitsVal >= 160 ? 16 : 6));
        if (collected < targetRelationsCurrent) return;
        if (matrixSolves > 0 && collected - lastMatrixSolveLen < solveDelta) return;

        lastMatrixSolveLen = collected;
        matrixSolves++;
        gf2InFlightRef.current = true;
        const solveId = ++gf2SolveSeqRef.current;
        gf2SolveContextMap.set(solveId, { sourceKind, workerK, collectedAtTrigger: collected });

        dispatchPauseToSievers(true, 'gf2');
        setGf2Monitor(prev => ({
          ...prev,
          solverStage: 'materializing_bfs',
          offThreadActive: true,
          sieversPausedForGf2: true,
          solveCount: matrixSolves,
          directFullCount: lpPool.directFullCount,
          partialCount: lpPool.partialCount,
          pendingCyclesCount: lpPool.pendingCyclesCount,
          lastSolveError: null
        }));

        const delta = lpPool.exportIncrementalPayload(gf2Cursor);
        gf2Cursor = delta.nextCursor;
        gf2WorkerRef.current.postMessage({
          type: 'solve',
          solveId,
          nStr: N,
          fbPrimes: activeFb.primes,
          fulls: delta.fulls,
          treeEdges: delta.treeEdges,
          cycleEdges: delta.cycleEdges
        });
      };

      const handleWorkerMessage = (e: MessageEvent, currentWorkerId: number) => {
        if (solutionFound) return;
        const { type, steps, total, factor, message, nBits, round, features, attempts, curveAdds, modMuls, curveInfo, duration, workerId = currentWorkerId } = e.data;
        
        if (type === 'worker_pause_ack') {
          setWorkerThreadsStats(prev => {
            const next = [...prev];
            if (next[workerId]) {
              next[workerId] = {
                ...next[workerId],
                paused: Boolean(e.data.paused),
                pauseReason: e.data.paused ? (gf2InFlightRef.current ? 'gf2' : 'manual') : null
              };
            }
            return next;
          });
        } else if (type === 'chronos_redc_benchmark') {
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
          setChronosSteps(getCurrentTotalOps());
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
          setChronosSteps(getCurrentTotalOps());
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
                    polysPerSec: e.data.polysPerSec ?? next[workerId].polysPerSec,
                    candsTested: e.data.candsTested ?? next[workerId].candsTested,
                    squfofSplits: e.data.squfof2Lp ?? next[workerId].squfofSplits,
                    lastBatchMs: e.data.batchDurationMs ?? next[workerId].lastBatchMs,
                    relations: (next[workerId].relations || 0) + addedFull + addedPartial,
                    stage: newCollisions > 0 ? `SIQS (+${newCollisions} LP-Cycle)` : (sieveMode === 'v4-fallback' ? 'SIQS v4 Fast-2LP' : 'SIQS Vanilla'),
                    active: true
                  };
                }
                return next;
              });

              const collected = lpPool.fullCount;
              const elapsedSecNow = getActiveElapsedSec();
              const totalPolysNow = workerPolysMap.reduce((a, b) => a + b, 0);
              setChronosSmooth(collected);
              setGf2Stats(prev => ({
                ...prev,
                collected,
                target: targetRelationsCurrent,
                factorBaseSize: activeFb.primes.length,
                matrixSolves,
                partialCount: lpPool.partialCount,
                lpCollisions: lpPool.collisionsCount,
                relationsPerSec: collected / elapsedSecNow,
                polysProcessed: totalPolysNow,
                lastSource: (cfracRelCount > 0 || hgsRelCount > 0)
                  ? `Unified GF(2): SIQS(${siqsRelCount}) + HGS(${hgsRelCount}) + CFRAC(${cfracRelCount})`
                  : `${sieveMode === 'v4-fallback' ? 'SIQS-v4' : 'Vanilla'} k=${optK} W#${workerId + 1}`
              }));
              setGf2Monitor(prev => ({
                ...prev,
                directFullCount: lpPool.directFullCount,
                partialCount: lpPool.partialCount,
                pendingCyclesCount: lpPool.pendingCyclesCount
              }));

              triggerOffThreadGf2Solve('chronos');
            }
          }
        } else if (type === 'hgs_relations_batch') {
          const batch: SmoothRelation[] = e.data.relations || [];
          const scannedBatchOps = (e.data.scannedCount || 0) + (e.data.blocksProcessed || 0) * 64 + 400;
          workerOpsMap[workerId] = Math.max(workerOpsMap[workerId] + 400, scannedBatchOps);
          setChronosSteps(getCurrentTotalOps());
          if (typeof e.data.scannedCount === 'number') workerScannedMap[workerId] = e.data.scannedCount;
          if (typeof e.data.skippedCount === 'number') workerSkippedMap[workerId] = e.data.skippedCount;
          if (typeof e.data.blocksProcessed === 'number') workerBlocksMap[workerId] = e.data.blocksProcessed;
          if (typeof e.data.squfof2Lp === 'number') workerSqufofMap[workerId] = e.data.squfof2Lp;

          if (e.data.targetN === N && (useSiqsUnified || isHgs)) {
            const { addedFull, addedPartial, newCollisions } = batch.length > 0
              ? lpPool.ingestBatch(batch)
              : { addedFull: 0, addedPartial: 0, newCollisions: 0 };
            hgsRelCount += addedFull + newCollisions;
            workerPolysMap[workerId] = e.data.polysProcessed || workerPolysMap[workerId] || 0;

            const collected = lpPool.fullCount;
            const elapsedSecNow = getActiveElapsedSec();
            const totalPolysNow = workerPolysMap.reduce((a, b) => a + b, 0);
            const totalScannedNow = workerScannedMap.reduce((a, b) => a + b, 0);
            const totalSkippedNow = workerSkippedMap.reduce((a, b) => a + b, 0);
            const totalBlocksNow = workerBlocksMap.reduce((a, b) => a + b, 0);
            const totalSqufofNow = workerSqufofMap.reduce((a, b) => a + b, 0);

            if (addedFull > 0 || addedPartial > 0 || typeof e.data.polysPerSec === 'number') {
              const kindStr = e.data.engineKind;
              const defaultHgsStage = kindStr === 'wasm-simd'
                ? 'HGS WASM-SIMD + SQUFOF'
                : (kindStr === 'wasm-i64' ? 'HGS WASM-i64 + SQUFOF' : 'HGS 128-Bias+SQUFOF');
              setWorkerThreadsStats(prev => {
                const next = [...prev];
                if (next[workerId]) {
                  next[workerId] = {
                    ...next[workerId],
                    role: 'hgs',
                    engineKind: kindStr ?? next[workerId].engineKind,
                    polys: workerPolysMap[workerId],
                    polysPerSec: e.data.polysPerSec ?? next[workerId].polysPerSec,
                    candsTested: e.data.candsTested ?? next[workerId].candsTested,
                    squfofSplits: e.data.squfof2Lp ?? next[workerId].squfofSplits,
                    lastBatchMs: e.data.batchDurationMs ?? next[workerId].lastBatchMs,
                    relations: (next[workerId].relations || 0) + addedFull + addedPartial,
                    stage: newCollisions > 0 ? `HGS (+${newCollisions} SQUFOF/LP)` : defaultHgsStage,
                    active: true
                  };
                }
                return next;
              });

              setChronosSmooth(collected);
              setGf2Stats(prev => ({
                ...prev,
                collected,
                target: targetRelationsCurrent,
                factorBaseSize: activeFb.primes.length,
                matrixSolves,
                partialCount: lpPool.partialCount,
                lpCollisions: lpPool.collisionsCount,
                relationsPerSec: collected / elapsedSecNow,
                polysProcessed: totalPolysNow,
                lastSource: isHgs
                  ? `Parallel HGS ×${numWorkers} (128-Bias + SQUFOF)`
                  : `Unified GF(2): SIQS(${siqsRelCount}) + HGS(${hgsRelCount}) + CFRAC(${cfracRelCount})`
              }));
              setGf2Monitor(prev => ({
                ...prev,
                directFullCount: lpPool.directFullCount,
                partialCount: lpPool.partialCount,
                pendingCyclesCount: lpPool.pendingCyclesCount
              }));
            }

            if (isHgs) {
              const previewItems = batch
                .filter(r => !r.largePrime)
                .slice(0, 4)
                .map((r, rIdx) => {
                  const exps = new Array(Math.min(32, activeFb.primes.length + 1)).fill(0);
                  if (r.signNeg) exps[0] = 1;
                  const sc = r.sparseCols || [];
                  for (let c = 0; c < sc.length; c++) {
                    if (sc[c] + 1 < exps.length) exps[sc[c] + 1] = 1;
                  }
                  return {
                    index: collected + rIdx,
                    x: r.xVal,
                    X: r.xVal,
                    Q: r.qVal || '',
                    exponents: exps
                  };
                });

              setHgsTrace(prev => prev ? {
                ...prev,
                stage: collected >= targetRelationsCurrent ? 'linear_algebra' : 'sieving',
                smoothCount: collected,
                targetSmooth: targetRelationsCurrent,
                scannedCount: totalScannedNow || prev.scannedCount,
                skippedCount: totalSkippedNow || prev.skippedCount,
                blocksProcessed: totalBlocksNow,
                squfof2LpCount: totalSqufofNow,
                lpCollisions: lpPool.collisionsCount,
                partialCount: lpPool.partialCount,
                relRatePerSec: collected / elapsedSecNow,
                activeWorkers: numWorkers,
                duration: Date.now() - runStartedAt,
                relations: previewItems.length > 0
                  ? [...prev.relations, ...previewItems].slice(-36)
                  : prev.relations
              } : prev);
              setCpuUsage(Math.min(98, 45 + Math.round((collected / Math.max(1, targetRelationsCurrent)) * 52)));
            }

            if (addedFull > 0 || addedPartial > 0) {
              triggerOffThreadGf2Solve('hgs');
            }
          }
        } else if (type === 'stage' && isHgs) {
          setHgsTrace(prev => ({
            ...(prev || {
              stage: 'presieve',
              factorBase: [],
              factorBaseSize: 0,
              polynomial: 'SIQS Q(x) = A x² + 2Bx + C',
              smoothCount: 0,
              targetSmooth: 45,
              scannedCount: 0,
              skippedCount: 0,
              relations: [],
              matrixPreview: [],
              congruence: null,
              factorTree: null
            }),
            stage: e.data.stage,
            stageMessage: e.data.message
          }));
        } else if (type === 'fb_built' && isHgs) {
          setHgsTrace(prev => ({
            ...(prev || {
              stage: 'building_fb',
              factorBase: [],
              factorBaseSize: 0,
              polynomial: '',
              smoothCount: 0,
              targetSmooth: 45,
              scannedCount: 0,
              skippedCount: 0,
              relations: [],
              matrixPreview: [],
              congruence: null,
              factorTree: null
            }),
            stage: 'sieving',
            factorBase: e.data.factorBase || [],
            factorBaseSize: e.data.factorBaseSize || 0,
            polynomial: e.data.polynomial || '',
            targetSmooth: e.data.targetSmooth || 45
          }));
        } else if (type === 'smooth_relation' && isHgs) {
          setHgsTrace(prev => {
            if (!prev) return prev;
            const nextRels = e.data.relation
              ? [...prev.relations, e.data.relation].slice(-36)
              : prev.relations;
            return {
              ...prev,
              smoothCount: e.data.smoothCount ?? prev.smoothCount,
              targetSmooth: e.data.targetSmooth ?? prev.targetSmooth,
              scannedCount: e.data.scannedCount ?? prev.scannedCount,
              skippedCount: e.data.skippedCount ?? prev.skippedCount,
              relations: nextRels
            };
          });
          setCpuUsage(Math.min(96, 40 + Math.round(((e.data.smoothCount || 1) / Math.max(1, e.data.targetSmooth || 45)) * 55)));
        } else if (type === 'f2_matrix_solved' && isHgs) {
          setHgsTrace(prev => prev ? {
            ...prev,
            stage: 'congruence',
            matrixPreview: e.data.matrixPreview || [],
            matrixDimensions: {
              rows: e.data.rows || 0,
              cols: e.data.cols || 0,
              dependencies: e.data.dependenciesCount || 0
            }
          } : prev);
        } else if (type === 'congruence_hit' && isHgs) {
          setHgsTrace(prev => prev ? {
            ...prev,
            stage: 'success',
            duration: e.data.duration,
            congruence: {
              X: e.data.X,
              Y: e.data.Y,
              diff: e.data.diff,
              g1: e.data.g1,
              g2: e.data.g2,
              factor1: e.data.factor1,
              factor2: e.data.factor2,
              duration: e.data.duration
            }
          } : prev);
        } else if (type === 'cfrac_progress') {
          const workerSteps = e.data.steps ?? 0;
          const workerK = e.data.kMultiplier ?? workerCfracKMap[currentWorkerId] ?? activeCfracK;
          workerOpsMap[currentWorkerId] = Math.max(workerOpsMap[currentWorkerId], workerSteps * 4);
          setChronosSteps(getCurrentTotalOps());
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
          setChronosSteps(getCurrentTotalOps());
          if (e.data.targetN === N && batch.length > 0 && (isCfrac || workerK === activeCfracK)) {
            const { addedFull, addedPartial, newCollisions } = lpPool.ingestBatch(batch);
            cfracRelCount += addedFull + newCollisions;
            const collected = lpPool.fullCount;
            const elapsedSecNow = getActiveElapsedSec();
            const totalCfracStepsNow = workerOpsMap.reduce((acc, v) => acc + Math.floor(v / 4), 0);

            setWorkerThreadsStats(prev => {
              const next = [...prev];
              if (next[currentWorkerId]) {
                next[currentWorkerId] = {
                  ...next[currentWorkerId],
                  polys: e.data.steps ?? 0,
                  lastBatchMs: e.data.batchDurationMs ?? next[currentWorkerId].lastBatchMs,
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
              targetRelations: targetRelationsCurrent,
              convergentsSample: e.data.convergentsSample ?? [],
              smoothRelations: collected,
              partialRelations: lpPool.partialCount,
              lpCollisions: lpPool.collisionsCount,
              statusLabel: collected >= targetRelationsCurrent
                ? 'حل مصفوفة GF(2) في Worker مستقل...'
                : (numWorkers > 1 && isCfrac ? `تجميع متوازٍ (${numWorkers} خيوط → ${collected}/${targetRelationsCurrent})` : `تجميع علاقات CFRAC (k=${workerK})`)
            });

            setGf2Stats(prev => ({
              ...prev,
              collected,
              target: targetRelationsCurrent,
              factorBaseSize: activeFb.primes.length,
              matrixSolves,
              partialCount: lpPool.partialCount,
              lpCollisions: lpPool.collisionsCount,
              relationsPerSec: collected / elapsedSecNow,
              polysProcessed: totalCfracStepsNow + workerPolysMap.reduce((a, b) => a + b, 0),
              lastSource: isChronos && (siqsRelCount > 0 || hgsRelCount > 0)
                ? `Unified GF(2): SIQS(${siqsRelCount}) + HGS(${hgsRelCount}) + CFRAC(${cfracRelCount})`
                : `Parallel CFRAC ×${numWorkers} (${collected}/${targetRelationsCurrent})`
            }));
            setGf2Monitor(prev => ({
              ...prev,
              directFullCount: lpPool.directFullCount,
              partialCount: lpPool.partialCount,
              pendingCyclesCount: lpPool.pendingCyclesCount
            }));

            triggerOffThreadGf2Solve('cfrac', workerK);
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
                workerId: currentWorkerId,
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
                workerId: currentWorkerId,
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
            if (isHgs && e.data.tree) {
              setHgsTrace(prev => prev ? {
                ...prev,
                stage: 'success',
                duration: durationMs,
                factorTree: e.data.tree
              } : prev);
            }
            const roleWin = workerRoles[currentWorkerId] === 'cfrac'
              ? (rawMethod || 'CFRAC Direct Congruence')
              : workerRoles[currentWorkerId] === 'hgs'
              ? (rawMethod || 'HGS SIQS (Gray-Code + 1LP/2LP + markowitz-core)')
              : (workerRoles[currentWorkerId] === 'ecm'
                ? 'Chronos Montgomery REDC ECM / p±1'
                : (rawMethod || `Chronos Worker #${workerId + 1}`));

            finishUnifiedSuccess(roleWin, recoveredFactors, durationMs, finalOps);
            if (universalExpRunRef.current && stopStage1OnUniversalExpRef.current) {
              const rep = computeUniversalExponentReport(N, 'standard', 0.258, undefined, undefined, { stopStage1BeforeFactors: true });
              addLog(`⏹ تم إيقاف المرحلة 1 قبل عرض العوامل فور تحديد الأس العام λ(N) (${durationMs}ms).`);
              addLog(`λ(N) = ${rep.lambdaN}`);
              setSimState(prev => ({ ...prev, status: 'idle', solution: null }));
              return;
            }
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
          } else if (isZeta) {
            if (raceTimerRef.current) {
              window.clearInterval(raceTimerRef.current);
              raceTimerRef.current = null;
            }
            workersRef.current.forEach(w => w.terminate());
            workersRef.current = [];
            workerUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
            workerUrlsRef.current = [];
            addLog(`>> انتهى المسح الطيفي السريع لأصفار زيتا دون قاسم مباشر — تصعيد تلقائي إلى السباق المتوازي الكامل (SIQS v4 + CFRAC + Zeta REDC ECM)...`);
            setTimeout(() => {
              runAttack(N, 'chronos-196', activeHints, universalExpRunRef.current);
            }, 30);
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
      let polyRankCounter = 0;

      for (let wId = 0; wId < numWorkers; wId++) {
        const wRole = workerRoles[wId];
        const wUrl = wRole === 'cfrac'
          ? cfracUrl
          : wRole === 'hgs'
          ? hgsUrl
          : (isChronos ? chronosUrl : fallbackStrategyUrl);
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
              workerId: wId,
              n: N,
              kMultiplier: wK,
              fbPrimes: sub.localPrimes,
              fbGlobalIndices: sub.globalCols,
              largePrimeBound: cfracUnionFb.largePrimeBound
            });
          } else {
            w.postMessage({
              type: 'start',
              workerId: wId,
              n: N,
              kMultiplier: activeCfracK,
              fbPrimes: activeFb.primes,
              largePrimeBound: activeFb.largePrimeBound
            });
          }
        } else if (wRole === 'hgs') {
          if (useSiqsUnified || (isHgs && activeFb.primes.length >= 6)) {
            const zfSeed = zfWorkerSeeds[wId]?.seedOffset ?? (wId * 250000);
            const myPolyRank = polyRankCounter++;
            w.postMessage({
              type: 'start',
              unifiedGf2: useSiqsUnified,
              sharedCoordinator: true,
              n: N,
              targetM: siqsM.toString(),
              workerId: wId,
              hgsRank: myPolyRank,
              hgsTotalWorkers: totalPolyWorkers,
              seedOffset: zfSeed,
              fbPrimes: activeFb.primes,
              fbRoots: activeFb.roots,
              largePrimeBound: activeFb.largePrimeBound,
              sieveMode,
              sieveWeights: activeSieveWeights
            });
          } else {
            w.postMessage({
              type: 'start',
              unifiedGf2: false,
              sharedCoordinator: false,
              n: N,
              workerId: wId,
              sieveMode,
              sieveWeights: activeSieveWeights
            });
          }
        } else if (isChronos) {
          const zfSeed = zfWorkerSeeds[wId]?.seedOffset ?? (wId * 250000);
          const mySiqsRank = wRole === 'siqs' ? polyRankCounter++ : 0;
          w.postMessage({
            type: 'start',
            n: N,
            targetM: useSiqsUnified ? siqsM.toString() : N,
            role: wRole === 'ecm' ? 'ecm' : 'siqs',
            workerId: wId,
            totalWorkers: numWorkers,
            siqsRank: mySiqsRank,
            siqsTotalWorkers: totalPolyWorkers,
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
      cacheFactorization(n, p, q, [p, q], 'Generated RSA Key');
      const keyRep = computeUniversalExponentReport(n, 'standard', 0.258, p, q);

      setRsaKey({
        p: p.toString(),
        q: q.toString(),
        n: n.toString(),
        e: keyRep.minimalPublicExponentE || keyRep.publicExponentE || '???',
        d: keyRep.minimalPrivateExponentD || keyRep.privateExponentD || '???',
        bits: actualBits
      });
      setUnifiedRace({ status: 'idle', winningEngine: null, factors: [], verifiedProduct: false, verifiedPrimes: false, elapsedMs: 0, totalOperations: 0 });
      setUniversalExpStage1Halted(false);

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
            <button
              onClick={() => setView('cmve')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                view === 'cmve'
                  ? 'bg-white text-[#14532D] border border-[#BBF7D0] shadow-sm'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              6. التحقق العلمي CMVE والشهادات (v5)
            </button>
          </nav>
        </header>

        {view === 'zf-summary' && <ZfProjectSummaryModule />}

        {view === 'cmve' && (
          <CmveVerificationPanel
            currentN={rsaKey?.n || ''}
            currentFactors={
              (simState.solution as any)?.allFactors?.length
                ? (simState.solution as any).allFactors
                : (rsaKey?.p && rsaKey?.q && rsaKey.p !== '???' && rsaKey.q !== '???' ? [rsaKey.p, rsaKey.q] : [])
            }
            currentE={rsaKey?.e}
            currentD={rsaKey?.d}
            lang={lang}
            onSyncN={handleManualNChange}
          />
        )}

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
                else if (alg === 'hgs') setStrategy('hgs');
                else if (alg === 'zeta') setStrategy('zeta');
                else if (alg === 'chronos-196') setStrategy('chronos-196');
              }}
              onLaunchChronos={(targetN, algOverride) => {
                const chosen = algOverride || (primaryAlgorithm === 'cfrac' ? 'cfrac' : (primaryAlgorithm === 'hgs' ? 'hgs' : (primaryAlgorithm === 'zeta' ? 'zeta' : 'chronos-196')));
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
                        : (strategy === 'hgs'
                          ? 'HGS SIQS (Multi-Poly Gray-Code + 1LP/2LP + markowitz-core)'
                          : (strategy === 'zeta'
                            ? 'Zeta 48-Zeros Spectral Seeding (500d / 160d)'
                            : 'Chronos v4 (SIQS + HGS + CFRAC + REDC ECM · markowitz-core)')),
                      duration: simState.executionTime ? Math.round(simState.executionTime * 1000) : undefined
                    }
                  : null
              }
              onJumpToBlock={handleJumpToBlock}
              stopStage1OnUniversalExp={stopStage1OnUniversalExp}
              onToggleStopStage1OnUniversalExp={setStopStage1OnUniversalExp}
              onComputeUniversalExponent={handleComputeUniversalExponent}
              isUniversalExpPending={isUniversalExpPending}
              universalExpStage1Halted={universalExpStage1Halted}
              onRevealFactorsAfterStage1={handleRevealFactorsAfterStage1}
            />

            {primaryAlgorithm === 'coppersmith' && (
              <CoppersmithLabPanel
                onFactorsRecovered={(nRecovered, pRecovered, qRecovered, methodLabel, durationMs) => {
                  const sorted = [BigInt(pRecovered), BigInt(qRecovered)].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                  cacheFactorization(nRecovered, sorted[0], sorted[1], sorted, methodLabel);
                  const rep = computeUniversalExponentReport(nRecovered, 'standard', 0.258, sorted[0], sorted[1]);
                  setUniversalExpStage1Halted(false);
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: rep.minimalPublicExponentE || rep.publicExponentE || '???',
                    d: rep.minimalPrivateExponentD || rep.privateExponentD || '???',
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

            {primaryAlgorithm === 'hgs' && (
              <HgsDashboard
                nValue={rsaKey?.n || ''}
                lang={lang}
                t={t}
                trace={hgsTrace}
                isRunning={workerActive}
                onLaunchHgs={(targetN) => runAttack(targetN || rsaKey?.n, 'hgs')}
                onStopHgs={stopAttack}
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
                  cacheFactorization(nRecovered, sorted[0], sorted[1], sorted, methodLabel);
                  const rep = computeUniversalExponentReport(nRecovered, 'standard', 0.258, sorted[0], sorted[1]);
                  setUniversalExpStage1Halted(false);
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: rep.minimalPublicExponentE || rep.publicExponentE || '???',
                    d: rep.minimalPrivateExponentD || rep.privateExponentD || '???',
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
                  cacheFactorization(nRecovered, sorted[0], sorted[1], sorted, methodLabel);
                  const rep = computeUniversalExponentReport(nRecovered, 'standard', 0.258, sorted[0], sorted[1]);
                  setUniversalExpStage1Halted(false);
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: rep.minimalPublicExponentE || rep.publicExponentE || '???',
                    d: rep.minimalPrivateExponentD || rep.privateExponentD || '???',
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
                  cacheFactorization(nRecovered, sorted[0], sorted[1], sorted, methodLabel);
                  const rep = computeUniversalExponentReport(nRecovered, 'standard', 0.258, sorted[0], sorted[1]);
                  setUniversalExpStage1Halted(false);
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: rep.minimalPublicExponentE || rep.publicExponentE || '???',
                    d: rep.minimalPrivateExponentD || rep.privateExponentD || '???',
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

            {primaryAlgorithm === 'ppfo-2000' && (
              <Ppfo2000LabPanel
                currentN={rsaKey?.n || ''}
                onChangeN={handleManualNChange}
                onFactorsRecovered={(nRecovered, pRecovered, qRecovered, methodLabel, durationMs, allFactors) => {
                  const sorted = [BigInt(pRecovered), BigInt(qRecovered)].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
                  cacheFactorization(nRecovered, sorted[0], sorted[1], allFactors || sorted, methodLabel);
                  const rep = computeUniversalExponentReport(nRecovered, 'standard', 0.258, sorted[0], sorted[1]);
                  setUniversalExpStage1Halted(false);
                  setRsaKey({
                    n: nRecovered,
                    p: sorted[0],
                    q: sorted[1],
                    e: rep.minimalPublicExponentE || rep.publicExponentE || '???',
                    d: rep.minimalPrivateExponentD || rep.privateExponentD || '???',
                    bits: BigInt(nRecovered).toString(2).length
                  });
                  setSimState(prev => ({
                    ...prev,
                    status: 'success',
                    logs: [
                      ...prev.logs,
                      `✅ ${methodLabel} Solved ${BigInt(nRecovered).toString(2).length}-bit modulus in ${durationMs}ms.`,
                      `Factors: ${(allFactors || sorted).join(' × ')}`
                    ],
                    solution: {
                      x: 'Identified',
                      y: 'Identified',
                      factor1: sorted[0],
                      factor2: sorted[1],
                      allFactors: allFactors || sorted
                    } as any,
                    executionTime: durationMs / 1000
                  }));
                }}
              />
            )}

            {primaryAlgorithm === 'python-console' && (
              <PythonConsoleModule initialN={rsaKey?.n || '340282366920938462614824380041128836353'} />
            )}

            <WorkerMatrixMonitor
              lang={lang}
              isRunning={workerActive}
              effectiveWorkerCount={effectiveWorkerCount}
              workerThreadsStats={workerThreadsStats}
              gf2Stats={gf2Stats}
              gf2Monitor={gf2Monitor}
              onTogglePauseSievers={handleTogglePauseSievers}
            />

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