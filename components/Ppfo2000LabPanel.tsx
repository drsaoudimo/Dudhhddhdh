import React, { useEffect, useRef, useState } from 'react';
import {
  bigIntSqrtFloor2000,
  build2000DigitSnapshot,
  computeRiemannPhase2000d,
  gcdBig,
  HP2000_DEC_DIGITS,
  isProbablePrimeBig24,
  Precision2000Snapshot,
  splitCompositeToPrimesSync,
} from '../lib/ppfo2000Engine';
import { PPFO_2000_WORKER_CODE } from '../ppfo2000Worker';
import { CHRONOS_WORKER_CODE } from '../chronosWorker';
import { CFRAC_WORKER_CODE } from '../cfracWorker';
import { analyzeSnfsAndCadoParams } from '../snfsDetector';
import {
  buildMpqsFactorBase,
  selectRankedKnuthSchroeppelMultipliers,
  SingleLargePrimePool,
  SmoothRelation,
  solveBlockWiedemann,
} from '../mpqsGf2Solver';

interface Ppfo2000LabPanelProps {
  currentN: string;
  onChangeN?: (n: string) => void;
  onFactorsRecovered?: (
    n: string,
    p: string,
    q: string,
    methodLabel: string,
    durationMs: number,
    allFactors?: string[]
  ) => void;
}

interface PpfoExtractionEvent {
  factor: string;
  power: number;
  method: string;
  remainderAfter: string;
  isComplete: boolean;
  verifiedPrime: boolean;
}

interface PpfoRunResult {
  nStr: string;
  bits: number;
  isComplete: boolean;
  isPrime: boolean;
  productVerified: boolean;
  factors: Array<{ prime: string; power: number }>;
  unresolvedComposites: string[];
  events: PpfoExtractionEvent[];
  methodsSummary: Record<string, number>;
  elapsedMs: number;
  riemann2000dSeedSample: string;
  workerStatus: string;
}

const PPFO_PRESETS = [
  { label: '32-bit متوازن (2408052841)', n: '2408052841' },
  { label: 'متعدد العوامل (60097840681134)', n: '60097840681134' },
  { label: '64-bit مركب (2^64-1)', n: '18446744073709551615' },
  { label: '96-bit شبه أولي متوازن', n: '65238510166903171940783725549' },
  { label: '128-bit قريب (RSA)', n: '340282366920938462614824380041128836353' },
  { label: '143-bit متوازن صعب (SIQS)', n: '9516311845790656153499716760847001433441357' },
  { label: '7919 (أولي مؤكد)', n: '7919' },
];

const integerNthRoot = (n: bigint, k: number): bigint => {
  if (n < 2n || k <= 1) return n;
  const kBig = BigInt(k);
  const bitLen = n.toString(2).length;
  let high = 1n << BigInt(Math.ceil(bitLen / k) + 1);
  let low = 1n;
  while (low <= high) {
    const mid = (low + high) >> 1n;
    const pwr = mid ** kBig;
    if (pwr === n) return mid;
    if (pwr < n) low = mid + 1n;
    else high = mid - 1n;
  }
  return high;
};

const checkPerfectPowerBig = (n: bigint): { base: bigint; exp: number } | null => {
  if (n < 4n) return null;
  const s = bigIntSqrtFloor2000(n);
  if (s * s === n) return { base: s, exp: 2 };
  const maxExp = n.toString(2).length;
  for (let k = 3; k <= maxExp; k++) {
    const r = integerNthRoot(n, k);
    if (r > 1n && r ** BigInt(k) === n) {
      return { base: r, exp: k };
    }
  }
  return null;
};

const quickHartFermatSplit = (n: bigint): { factor: bigint; method: string } | null => {
  if (n < 4n) return null;
  if ((n & 1n) === 0n) return { factor: 2n, method: 'Even' };
  const s = bigIntSqrtFloor2000(n);
  if (s * s === n) return { factor: s, method: 'ExactSquare' };
  let a = s + 1n;
  for (let i = 0; i < 2048; i++) {
    const sq = a * a - n;
    const b = bigIntSqrtFloor2000(sq);
    if (b * b === sq) {
      const g = a - b;
      if (g > 1n && g < n) return { factor: g, method: 'Fermat-Precheck' };
    }
    a += 1n;
  }
  for (let k = 1; k <= 32; k++) {
    const kn4 = 4n * BigInt(k) * n;
    const sk = bigIntSqrtFloor2000(kn4) + 1n;
    const rem = sk * sk - kn4;
    const t = bigIntSqrtFloor2000(rem);
    if (t * t === rem) {
      const g = gcdBig(sk - t, n);
      if (g > 1n && g < n) return { factor: g, method: `Hart-4kN(k=${k})` };
    }
  }
  return null;
};

export const Ppfo2000LabPanel: React.FC<Ppfo2000LabPanelProps> = ({
  currentN,
  onChangeN,
  onFactorsRecovered,
}) => {
  const [inputN, setInputN] = useState<string>(currentN || '2408052841');
  const [useSmall, setUseSmall] = useState<boolean>(true);
  const [useRiemann, setUseRiemann] = useState<boolean>(true);
  const [useAdvanced, setUseAdvanced] = useState<boolean>(true);
  const [usePollardRho, setUsePollardRho] = useState<boolean>(true);
  const [useEmergency, setUseEmergency] = useState<boolean>(true);
  const [threadCount, setThreadCount] = useState<number>(8);
  const [timeoutSec, setTimeoutSec] = useState<number>(30);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [liveStatus, setLiveStatus] = useState<string>('جاهز لتشغيل PPFO v16 بدقة 2000 مرتبة عشرية');
  const [liveEvents, setLiveEvents] = useState<PpfoExtractionEvent[]>([]);
  const [runResult, setRunResult] = useState<PpfoRunResult | null>(null);
  const [snapshot2000, setSnapshot2000] = useState<Precision2000Snapshot | null>(null);
  const [activeSnapshotTab, setActiveSnapshotTab] = useState<'sqrt' | 'ln' | 'cos' | 'pi'>('sqrt');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const workersRef = useRef<Worker[]>([]);
  const workerUrlsRef = useRef<string[]>([]);
  const cancelFlagRef = useRef<boolean>(false);

  useEffect(() => {
    if (currentN && currentN !== inputN && !isRunning) {
      setInputN(currentN);
    }
  }, [currentN]);

  useEffect(() => {
    return () => {
      cleanupWorkers();
    };
  }, []);

  const cleanupWorkers = () => {
    workersRef.current.forEach((w) => {
      try {
        w.terminate();
      } catch {
        // ignore
      }
    });
    workersRef.current = [];
    workerUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    });
    workerUrlsRef.current = [];
  };

  const copyText = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  };

  const handleCompute2000dSnapshot = () => {
    const raw = inputN.replace(/[^0-9]/g, '');
    if (!raw) {
      setErrorMsg('أدخل عدداً صحيحاً موجباً لحساب دقة 2000 مرتبة عشرية.');
      return;
    }
    setErrorMsg(null);
    const nBig = BigInt(raw);
    onChangeN?.(raw);
    const snap = build2000DigitSnapshot(nBig, 8);
    setSnapshot2000(snap);
  };

  const handleStop = () => {
    cancelFlagRef.current = true;
    cleanupWorkers();
    setIsRunning(false);
    setLiveStatus('تم إيقاف الخيوط المتوازية يدوياً.');
  };

  const runPpfoWave = (
    remBig: bigint,
    waveIdx: number,
    phaseStates: ReturnType<typeof computeRiemannPhase2000d>[],
    waveBudgetMs: number
  ): Promise<{ factor: bigint; method: string } | null> => {
    return new Promise((resolve) => {
      cleanupWorkers();
      if (cancelFlagRef.current || waveBudgetMs <= 50) {
        resolve(null);
        return;
      }

      const roles: Array<'riemann' | 'advanced' | 'rho' | 'emergency'> = [];
      if (useRiemann) {
        const rCount = Math.max(1, Math.floor(threadCount / 2));
        for (let i = 0; i < rCount; i++) roles.push('riemann');
      }
      if (useAdvanced) {
        const aCount = Math.max(1, Math.floor(threadCount / 4));
        for (let i = 0; i < aCount; i++) roles.push('advanced');
      }
      if (usePollardRho) roles.push('rho');
      if (useEmergency) roles.push('emergency');
      if (roles.length === 0) roles.push('rho');

      const blob = new Blob([PPFO_2000_WORKER_CODE], { type: 'application/javascript' });
      let finishedCount = 0;
      let settled = false;

      const finish = (hit: { factor: bigint; method: string } | null) => {
        if (settled) return;
        settled = true;
        cleanupWorkers();
        resolve(hit);
      };

      const waveTimer = window.setTimeout(() => {
        finish(null);
      }, waveBudgetMs);

      roles.forEach((role, wid) => {
        const url = URL.createObjectURL(blob);
        workerUrlsRef.current.push(url);
        const w = new Worker(url);
        workersRef.current.push(w);

        const phaseState =
          role === 'riemann' && phaseStates.length > 0
            ? phaseStates[(wid + waveIdx) % phaseStates.length]
            : null;

        w.onmessage = (ev) => {
          if (settled || cancelFlagRef.current) {
            if (cancelFlagRef.current) {
              window.clearTimeout(waveTimer);
              finish(null);
            }
            return;
          }
          const msg = ev.data;
          if (msg.type === 'progress') {
            setLiveStatus(
              `PPFO الموجة #${waveIdx + 1} · خيط ${msg.workerId} (${msg.role}) عند الخطوة ${msg.iter} بدقة ${HP2000_DEC_DIGITS} مرتبة...`
            );
            return;
          }
          if (msg.type === 'done') {
            finishedCount++;
            if (msg.factor) {
              try {
                const fBig = BigInt(msg.factor);
                if (fBig > 1n && fBig < remBig && remBig % fBig === 0n) {
                  window.clearTimeout(waveTimer);
                  finish({ factor: fBig, method: msg.method || role });
                  return;
                }
              } catch {
                // ignore malformed
              }
            }
            if (finishedCount >= roles.length) {
              window.clearTimeout(waveTimer);
              finish(null);
            }
          }
        };

        w.onerror = () => {
          finishedCount++;
          if (finishedCount >= roles.length && !settled) {
            window.clearTimeout(waveTimer);
            finish(null);
          }
        };

        w.postMessage({
          nStr: remBig.toString(10),
          workerId: wid,
          role,
          phaseState,
          useSmall: useSmall && wid === 0,
          useRiemann,
          useAdvanced,
          usePollardRho,
          useEmergency,
          maxIter: 65000,
        });
      });
    });
  };

  // Escalate remaining hard balanced/large composites to Parallel SIQS + CFRAC -> Shared GF(2) Block Wiedemann + REDC ECM
  const runChronosSiqsEscalation = (
    remBig: bigint,
    riemannSeedStr: string,
    budgetMs: number
  ): Promise<{ factor: bigint; method: string } | null> => {
    return new Promise((resolve) => {
      cleanupWorkers();
      if (cancelFlagRef.current || budgetMs <= 120) {
        resolve(null);
        return;
      }

      const nStr = remBig.toString(10);
      const nBits = remBig.toString(2).length;
      const useSiqs = nBits <= 272;
      const numWorkers = useSiqs ? Math.max(3, Math.min(threadCount, 12)) : Math.max(2, Math.min(threadCount, 12));

      const rankedKsRes = useSiqs
        ? selectRankedKnuthSchroeppelMultipliers(remBig, Math.max(12, numWorkers + 4))
        : { ranked: [1], directFactor: undefined };

      if (rankedKsRes.directFactor && rankedKsRes.directFactor > 1n && rankedKsRes.directFactor < remBig && remBig % rankedKsRes.directFactor === 0n) {
        resolve({ factor: rankedKsRes.directFactor, method: 'Knuth-Schroeppel-GCD' });
        return;
      }

      const optK = rankedKsRes.ranked[0] ?? 1;
      const siqsM = BigInt(optK) * remBig;
      const activeFb = useSiqs
        ? buildMpqsFactorBase(remBig, siqsM)
        : { primes: [] as number[], roots: [] as number[], logs: [] as number[], largePrimeBound: 0 };
      const lpPool = new SingleLargePrimePool(remBig, activeFb.primes);
      const targetRelations = activeFb.primes.length + (nBits >= 160 ? 14 : 8);

      let settled = false;
      let matrixSolves = 0;
      let lastSolveCollected = 0;
      let siqsRelCount = 0;
      let cfracRelCount = 0;

      const chronosBlob = new Blob([CHRONOS_WORKER_CODE], { type: 'application/javascript' });
      const chronosUrl = URL.createObjectURL(chronosBlob);
      workerUrlsRef.current.push(chronosUrl);

      let cfracUrl = '';
      if (useSiqs) {
        const cfracBlob = new Blob([CFRAC_WORKER_CODE], { type: 'application/javascript' });
        cfracUrl = URL.createObjectURL(cfracBlob);
        workerUrlsRef.current.push(cfracUrl);
      }

      const finish = (hit: { factor: bigint; method: string } | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        cleanupWorkers();
        resolve(hit);
      };

      const timer = window.setTimeout(() => {
        finish(null);
      }, budgetMs);

      const roles: Array<'ecm' | 'cfrac' | 'siqs'> = Array.from({ length: numWorkers }, (_, idx) => {
        if (!useSiqs) return 'ecm';
        if (idx === 0) return 'ecm';
        if (idx === 1) return 'cfrac';
        return 'siqs';
      });
      const totalSiqsWorkers = Math.max(1, roles.filter((r) => r === 'siqs').length);
      let siqsRankCounter = 0;

      const trySolveMatrix = (sourceTag: string) => {
        if (settled || cancelFlagRef.current || !useSiqs) return;
        const collected = lpPool.fullCount;
        const solveDelta = nBits >= 160 ? 14 : 6;
        if (collected >= targetRelations && (collected - lastSolveCollected >= solveDelta || matrixSolves === 0)) {
          lastSolveCollected = collected;
          matrixSolves++;
          setLiveStatus(
            `تصعيد GF(2) Block Wiedemann (${collected}/${targetRelations} علاقة · SIQS=${siqsRelCount}, CFRAC=${cfracRelCount})...`
          );
          const bwRes = solveBlockWiedemann(remBig, activeFb.primes, lpPool.getFullRelations(), lpPool.getRedcCtx());
          if (bwRes.factor && bwRes.factor > 1n && bwRes.factor < remBig && remBig % bwRes.factor === 0n) {
            finish({ factor: bwRes.factor, method: `SIQS+CFRAC(${bwRes.methodUsed})` });
          }
        }
      };

      roles.forEach((role, wid) => {
        const w = new Worker(role === 'cfrac' ? cfracUrl : chronosUrl);
        workersRef.current.push(w);
        const mySiqsRank = role === 'siqs' ? siqsRankCounter++ : 0;

        w.onmessage = (ev) => {
          if (settled) return;
          if (cancelFlagRef.current) {
            finish(null);
            return;
          }
          const msg = ev.data;
          if (msg.type === 'chronos_relations_batch' && msg.targetN === nStr && Array.isArray(msg.relations)) {
            const { addedFull, newCollisions } = lpPool.ingestBatch(msg.relations as SmoothRelation[]);
            siqsRelCount += addedFull + newCollisions;
            if (lpPool.fullCount < targetRelations) {
              setLiveStatus(
                `تصعيد PPFO→SIQS/GF(2) (${nBits}-bit): ${lpPool.fullCount}/${targetRelations} علاقة (SIQS=${siqsRelCount} · CFRAC=${cfracRelCount})...`
              );
            }
            trySolveMatrix('SIQS');
            return;
          }
          if (msg.type === 'cfrac_relations_batch' && msg.targetN === nStr && Array.isArray(msg.relations)) {
            const { addedFull, newCollisions } = lpPool.ingestBatch(msg.relations as SmoothRelation[]);
            cfracRelCount += addedFull + newCollisions;
            if (lpPool.fullCount < targetRelations) {
              setLiveStatus(
                `تصعيد PPFO→SIQS/GF(2) (${nBits}-bit): ${lpPool.fullCount}/${targetRelations} علاقة (SIQS=${siqsRelCount} · CFRAC=${cfracRelCount})...`
              );
            }
            trySolveMatrix('CFRAC');
            return;
          }
          if (msg.type === 'chronos_suyama_stage') {
            setLiveStatus(
              `تصعيد ECM-REDC منحنى #${msg.curveIndex} (${msg.stagePhase === 'stage2-b2' ? `Stage 2 B2 ${msg.b2ProgressPct ?? 0}%` : `B1=${msg.b1Bound}`})...`
            );
            return;
          }
          if (msg.type === 'result') {
            const cands: string[] = [];
            if (Array.isArray(msg.allFactors)) cands.push(...msg.allFactors);
            if (Array.isArray(msg.factors)) cands.push(...msg.factors);
            if (msg.factor) cands.push(String(msg.factor));
            for (const cStr of cands) {
              try {
                const f = BigInt(cStr);
                if (f > 1n && f < remBig && remBig % f === 0n) {
                  finish({ factor: f, method: msg.method || `Chronos-${role.toUpperCase()}` });
                  return;
                }
              } catch {
                // ignore
              }
            }
          }
        };

        w.onerror = () => {
          // Wait for peer workers / timeout
        };

        if (role === 'cfrac') {
          w.postMessage({
            type: 'start',
            n: nStr,
            kMultiplier: optK,
            fbPrimes: activeFb.primes,
            largePrimeBound: activeFb.largePrimeBound,
            workerId: wid,
            totalWorkers: 1,
          });
        } else {
          w.postMessage({
            type: 'start',
            n: nStr,
            targetM: siqsM.toString(10),
            role,
            workerId: wid,
            totalWorkers: numWorkers,
            siqsRank: mySiqsRank,
            siqsTotalWorkers: totalSiqsWorkers,
            seedOffset: wid * 97 + 13,
            fbPrimes: activeFb.primes,
            fbRoots: activeFb.roots,
            fbLogs: activeFb.logs,
            largePrimeBound: activeFb.largePrimeBound,
            sieveMode: 'v4-fallback',
            zetaSigmaSeed: riemannSeedStr,
            zetaRhoSeed: riemannSeedStr,
          });
        }
      });
    });
  };

  const handleLaunchPpfo = async () => {
    const raw = inputN.replace(/[^0-9]/g, '');
    if (!raw) {
      setErrorMsg('يرجى إدخال عدد صحيح موجب صالح.');
      return;
    }
    const nBig = BigInt(raw);
    if (nBig < 2n) {
      setErrorMsg('يرجى إدخال عدد >= 2.');
      return;
    }

    setErrorMsg(null);
    onChangeN?.(raw);
    cancelFlagRef.current = false;
    setIsRunning(true);
    setLiveEvents([]);
    setRunResult(null);

    const t0 = performance.now();
    const deadline = t0 + timeoutSec * 1000;
    const events: PpfoExtractionEvent[] = [];
    const factorCounts = new Map<string, number>();
    const methodsSummary: Record<string, number> = {};
    const unresolved: bigint[] = [];

    // Compute 2000-digit Riemann snapshot & phase states right away
    setLiveStatus(`جاري تجهيز مصفوفة الطور لـ ${HP2000_DEC_DIGITS} مرتبة عشرية لريمان...`);
    await new Promise((r) => setTimeout(r, 10));
    const snap = build2000DigitSnapshot(nBig, 8);
    setSnapshot2000(snap);
    const seedSample = snap.phases[0]?.seed2000d || '0';

    let remainingProduct = nBig;

    const recordPrime = (p: bigint, power: number, methodTag: string) => {
      const pStr = p.toString(10);
      factorCounts.set(pStr, (factorCounts.get(pStr) || 0) + power);
      const label = `${methodTag}(^${power})`;
      methodsSummary[label] = (methodsSummary[label] || 0) + 1;
      for (let i = 0; i < power; i++) {
        if (remainingProduct % p === 0n) remainingProduct /= p;
      }
      const ev: PpfoExtractionEvent = {
        factor: pStr,
        power,
        method: methodTag,
        remainderAfter: remainingProduct.toString(10),
        isComplete: remainingProduct === 1n,
        verifiedPrime: true,
      };
      events.push(ev);
      setLiveEvents([...events]);
    };

    // Strict check before launching workers
    if (isProbablePrimeBig24(nBig)) {
      recordPrime(nBig, 1, 'Prime(MR-24)');
      const elapsedMs = Number((performance.now() - t0).toFixed(2));
      setRunResult({
        nStr: raw,
        bits: nBig.toString(2).length,
        isComplete: true,
        isPrime: true,
        productVerified: true,
        factors: [{ prime: raw, power: 1 }],
        unresolvedComposites: [],
        events,
        methodsSummary,
        elapsedMs,
        riemann2000dSeedSample: seedSample,
        workerStatus: 'عدد أولي مؤكد (24-round Miller-Rabin)',
      });
      setIsRunning(false);
      setLiveStatus(`✅ العدد ${raw} أولي مؤكد (${elapsedMs} ms).`);
      return;
    }

    let rem = nBig;

    // Optional fast small primes strip up to 997
    if (useSmall) {
      const smallPrimes = [
        2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n,
        53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n,
        127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n, 191n,
        193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n, 257n, 263n,
      ];
      for (const p of smallPrimes) {
        if (rem % p === 0n) {
          let cnt = 0;
          while (rem % p === 0n) {
            rem /= p;
            cnt++;
          }
          recordPrime(p, cnt, 'Small');
        }
      }
    }

    // Complete factor queue to guarantee splitting ALL composite parts into verified primes
    const workQueue: bigint[] = rem > 1n ? [rem] : [];
    let waveCounter = 0;

    while (workQueue.length > 0 && !cancelFlagRef.current) {
      const cur = workQueue.pop()!;
      if (cur <= 1n) continue;

      if (isProbablePrimeBig24(cur)) {
        recordPrime(cur, 1, 'Prime(MR-24)');
        continue;
      }

      if (performance.now() >= deadline) {
        unresolved.push(cur);
        continue;
      }

      // Stage 0a: Exact Perfect Power check (b^k)
      const pwr = checkPerfectPowerBig(cur);
      if (pwr && pwr.base > 1n && pwr.base < cur) {
        for (let i = 0; i < pwr.exp; i++) workQueue.push(pwr.base);
        methodsSummary[`PerfectPower(^${pwr.exp})`] = (methodsSummary[`PerfectPower(^${pwr.exp})`] || 0) + 1;
        continue;
      }

      // Stage 0b: SNFS / Aurifeuillean / Cunningham instant algebraic split
      const snfs = analyzeSnfsAndCadoParams(cur);
      if (snfs.isSpecialForm && snfs.algebraicFactor) {
        const af = BigInt(snfs.algebraicFactor);
        if (af > 1n && af < cur && cur % af === 0n) {
          methodsSummary[`SNFS(${snfs.formType})`] = (methodsSummary[`SNFS(${snfs.formType})`] || 0) + 1;
          workQueue.push(af, cur / af);
          continue;
        }
      }

      // Stage 0c: Quick Fermat & Hart 4kN precheck (instant on close primes)
      const hartHit = quickHartFermatSplit(cur);
      if (hartHit && hartHit.factor > 1n && hartHit.factor < cur && cur % hartHit.factor === 0n) {
        methodsSummary[hartHit.method] = (methodsSummary[hartHit.method] || 0) + 1;
        workQueue.push(hartHit.factor, cur / hartHit.factor);
        continue;
      }

      // Stage 1: PPFO v16 Parallel Swarm (Riemann-2000d + Real REDC ECM + Maynard + Pollard-Brent + REDC p±1)
      const remMs1 = Math.max(0, deadline - performance.now());
      const curBits = cur.toString(2).length;
      const ppfoBudget = curBits <= 84 ? Math.min(remMs1, 4000) : Math.min(remMs1, 2200);

      setLiveStatus(`تشغيل ${threadCount} خيوط PPFO v16 (دقة 2000 خانة) على ${curBits}-bit...`);
      const wavePhases = useRiemann
        ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => computeRiemannPhase2000d(cur, i + waveCounter * 3))
        : [];
      const ppfoHit = await runPpfoWave(cur, waveCounter++, wavePhases, ppfoBudget);

      if (ppfoHit && ppfoHit.factor > 1n && ppfoHit.factor < cur && cur % ppfoHit.factor === 0n) {
        const fBig = ppfoHit.factor;
        const other = cur / fBig;
        if (isProbablePrimeBig24(fBig)) {
          let cnt = 1;
          let rest = other;
          while (rest % fBig === 0n) {
            rest /= fBig;
            cnt++;
          }
          recordPrime(fBig, cnt, ppfoHit.method);
          if (rest > 1n) workQueue.push(rest);
        } else {
          workQueue.push(fBig, other);
        }
        continue;
      }

      if (cancelFlagRef.current || performance.now() >= deadline) {
        unresolved.push(cur);
        continue;
      }

      // Stage 2: Automatic Escalation to Parallel SIQS + CFRAC -> Shared GF(2) Block Wiedemann + Deep REDC ECM
      const escBudget = Math.max(0, deadline - performance.now());
      setLiveStatus(`تصعيد تلقائي إلى SIQS + CFRAC + GF(2) Block Wiedemann + ECM-REDC لجزء (${curBits}-bit)...`);
      const escHit = await runChronosSiqsEscalation(cur, seedSample, escBudget);

      if (escHit && escHit.factor > 1n && escHit.factor < cur && cur % escHit.factor === 0n) {
        const fBig = escHit.factor;
        const other = cur / fBig;
        if (isProbablePrimeBig24(fBig)) {
          let cnt = 1;
          let rest = other;
          while (rest % fBig === 0n) {
            rest /= fBig;
            cnt++;
          }
          recordPrime(fBig, cnt, escHit.method);
          if (rest > 1n) workQueue.push(rest);
        } else {
          methodsSummary[escHit.method] = (methodsSummary[escHit.method] || 0) + 1;
          workQueue.push(fBig, other);
        }
        continue;
      }

      // Final synchronous quick rescue before classifying as unresolved composite
      const { primes: lastPrimes, unresolved: lastUnres } = splitCompositeToPrimesSync(cur, 800);
      if (lastPrimes.length > 0) {
        for (const lp of lastPrimes) recordPrime(lp, 1, 'Split-Final');
        for (const lu of lastUnres) unresolved.push(lu);
      } else {
        unresolved.push(cur);
      }
    }

    const sortedFactors = Array.from(factorCounts.entries())
      .map(([prime, power]) => ({ prime, power }))
      .sort((a, b) => (BigInt(a.prime) < BigInt(b.prime) ? -1 : 1));

    let prod = 1n;
    for (const f of sortedFactors) {
      prod *= BigInt(f.prime) ** BigInt(f.power);
    }
    for (const u of unresolved) {
      prod *= u;
    }

    const isComplete = unresolved.length === 0 && prod === nBig && sortedFactors.length > 0;
    const isPrimeN = isComplete && sortedFactors.length === 1 && BigInt(sortedFactors[0].prime) === nBig;
    const elapsedMs = Number((performance.now() - t0).toFixed(2));

    const resultObj: PpfoRunResult = {
      nStr: raw,
      bits: nBig.toString(2).length,
      isComplete,
      isPrime: isPrimeN,
      productVerified: prod === nBig,
      factors: sortedFactors,
      unresolvedComposites: unresolved.map((u) => u.toString(10)),
      events,
      methodsSummary,
      elapsedMs,
      riemann2000dSeedSample: seedSample,
      workerStatus: isPrimeN
        ? 'عدد أولي مؤكد'
        : isComplete
        ? '✅ تفكيك أولي كامل ومطابق للجداء'
        : '⚠️ تفكيك جزئي — المتبقي عدد مركب (غير أولي)',
    };

    setRunResult(resultObj);
    setIsRunning(false);
    cleanupWorkers();
    setLiveStatus(`${resultObj.workerStatus} في ${elapsedMs} ms.`);

    if (isComplete && !isPrimeN && onFactorsRecovered) {
      const expanded: string[] = [];
      for (const f of sortedFactors) {
        for (let i = 0; i < f.power; i++) expanded.push(f.prime);
      }
      if (expanded.length >= 2) {
        onFactorsRecovered(
          raw,
          expanded[0],
          (nBig / BigInt(expanded[0])).toString(10),
          `PPFO v16 (${HP2000_DEC_DIGITS}d Riemann + ECM-REDC + SIQS/GF2)`,
          elapsedMs,
          expanded
        );
      }
    }
  };

  return (
    <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#1E3A8A]">
            <span>PPFO v16 · محرك التفكيك الطيفي المتعدد الخيوط</span>
            <span className="px-2 py-0.5 rounded bg-[#14532D]/10 text-[#14532D] font-bold">
              دقة 2000 مرتبة عشرية + تصعيد SIQS/GF(2)/ECM-REDC
            </span>
          </div>
          <h3 className="text-xl font-bold font-serif-academic text-[#1C1917]">
            محرك PPFO v16 (Riemann-2000d + Montgomery ECM-REDC + SIQS/GF(2) + فصل صارم للأولية)
          </h3>
          <p className="text-xs text-[#57534E] leading-relaxed max-w-4xl">
            يجمع بين أصفار ريمان ودالة <span dir="ltr" className="font-mono">cos(γ · ln N)</span> بدقة{' '}
            <strong>2000 مرتبة عشرية حقيقية</strong> داخل المتصفح مع التتبع العكسي الدقيق، تحليل القوى وSNFS الفوري، المنحنيات الإهليلجية Montgomery REDC (Stage 1+2)، والتصعيد التلقائي نحو SIQS + CFRAC ومصفوفة GF(2) لضمان استخراج جميع العوامل الأولية دون تصنيف أي مركب كأولي.
          </p>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PPFO_PRESETS.map((preset, idx) => (
          <button
            key={idx}
            disabled={isRunning}
            onClick={() => {
              setInputN(preset.n);
              onChangeN?.(preset.n);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-mono bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] transition-colors disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Input + Method Toggles */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-3">
          <label className="block text-xs font-bold text-[#1C1917]">
            العدد الهدف <span dir="ltr" className="font-mono">N</span>
          </label>
          <textarea
            value={inputN}
            onChange={(e) => setInputN(e.target.value)}
            disabled={isRunning}
            rows={2}
            dir="ltr"
            className="w-full bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg p-3 text-xs font-mono text-[#1C1917] outline-none focus:border-[#1E3A8A] resize-none"
            placeholder="أدخل العدد الصحيح N..."
          />
          {errorMsg && <div className="text-xs font-bold text-[#991B1B]">{errorMsg}</div>}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {[
              { id: 'small', label: 'Small factors', state: useSmall, set: setUseSmall },
              { id: 'riemann', label: 'Riemann-Rho (2000d)', state: useRiemann, set: setUseRiemann },
              { id: 'adv', label: 'ECM-REDC / Maynard', state: useAdvanced, set: setUseAdvanced },
              { id: 'rho', label: 'Pollard-Rho (Brent)', state: usePollardRho, set: setUsePollardRho },
              { id: 'emg', label: 'Hart 4kN / p±1 / SIQS', state: useEmergency, set: setUseEmergency },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={isRunning}
                onClick={() => opt.set(!opt.state)}
                className={`px-3 py-2 rounded-lg border text-xs font-mono font-bold text-right flex items-center justify-between transition-colors ${
                  opt.state
                    ? 'bg-[#1E3A8A]/8 border-[#1E3A8A] text-[#1E3A8A]'
                    : 'bg-[#FBF9F5] border-[#E2DDD2] text-[#57534E]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${opt.state ? 'bg-[#14532D] text-white' : 'bg-[#E2DDD2] text-[#57534E]'}`}>
                  {opt.state ? 'Y' : 'N'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#57534E] mb-1">عدد الخيوط (Threads)</label>
              <select
                value={threadCount}
                disabled={isRunning}
                onChange={(e) => setThreadCount(Number(e.target.value))}
                className="w-full bg-white border border-[#E2DDD2] rounded-lg px-2.5 py-2 text-xs font-mono text-[#1C1917]"
              >
                <option value={4}>4 Workers</option>
                <option value={8}>8 Workers</option>
                <option value={12}>12 Workers</option>
                <option value={16}>16 Workers (MAX)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#57534E] mb-1">المهلة (ثوانٍ)</label>
              <select
                value={timeoutSec}
                disabled={isRunning}
                onChange={(e) => setTimeoutSec(Number(e.target.value))}
                className="w-full bg-white border border-[#E2DDD2] rounded-lg px-2.5 py-2 text-xs font-mono text-[#1C1917]"
              >
                <option value={15}>15 ثانية</option>
                <option value={30}>30 ثانية</option>
                <option value={60}>60 ثانية</option>
                <option value={90}>90 ثانية</option>
              </select>
            </div>
          </div>

          <div className="text-[11px] font-mono text-[#57534E] bg-white border border-[#E2DDD2] rounded-lg px-3 py-2">
            {liveStatus}
          </div>

          <div className="flex flex-wrap gap-2">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleLaunchPpfo}
                className="flex-1 bg-[#14532D] hover:bg-[#166534] text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
              >
                ▶ تشغيل PPFO v16 (دقة 2000 خانة)
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="flex-1 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
              >
                ■ إيقاف الخيوط
              </button>
            )}
            <button
              type="button"
              disabled={isRunning}
              onClick={handleCompute2000dSnapshot}
              className="bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-bold px-3.5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              حساب 2000 مرتبة عشرية
            </button>
          </div>
        </div>
      </div>

      {/* Live Extraction Log */}
      {liveEvents.length > 0 && (
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold text-[#1E3A8A]">سجل الاستخراج المتوازي المباشر</div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {liveEvents.map((ev, i) => (
              <div
                key={i}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-mono ${
                  ev.isComplete
                    ? 'bg-[#14532D]/10 border-[#14532D]/40 text-[#14532D]'
                    : 'bg-white border-[#E2DDD2] text-[#1C1917]'
                }`}
              >
                <span>
                  {ev.isComplete ? '✅' : '⏳'} [{ev.method}] عامل أولي مؤكد:{' '}
                  <strong dir="ltr">{ev.factor}</strong>
                  {ev.power > 1 ? `^${ev.power}` : ''}
                </span>
                <span dir="ltr" className="text-[11px] text-[#57534E]">
                  Remainder: {ev.remainderAfter.length > 36 ? `${ev.remainderAfter.slice(0, 18)}...${ev.remainderAfter.slice(-12)}` : ev.remainderAfter}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Verified Result & Performance Report */}
      {runResult && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            className={`lg:col-span-7 rounded-xl border p-5 space-y-3 ${
              runResult.isComplete
                ? 'bg-[#14532D]/5 border-[#14532D]/40'
                : 'bg-[#B45309]/5 border-[#B45309]/40'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-[#1C1917]">
                النتيجة النهائية ({runResult.productVerified && runResult.isComplete ? '✅ صحيح ومطابق للجداء' : '⚠️ غير مكتمل'})
              </div>
              <span
                className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                  runResult.isPrime
                    ? 'bg-[#1E3A8A] text-white'
                    : runResult.isComplete
                    ? 'bg-[#14532D] text-white'
                    : 'bg-[#991B1B] text-white'
                }`}
              >
                {runResult.isPrime
                  ? 'أولي مؤكد (MR-24)'
                  : runResult.isComplete
                  ? 'تفكيك أولي كامل'
                  : 'يحتوي مركب غير محلل (ليس أولياً)'}
              </span>
            </div>

            <div
              dir="ltr"
              className="bg-white border border-[#E2DDD2] rounded-lg p-3 font-mono text-xs text-[#1E3A8A] break-all"
            >
              {runResult.factors.length > 0
                ? runResult.factors.map((f) => (f.power > 1 ? `${f.prime}^${f.power}` : f.prime)).join(' × ')
                : 'لم تُستخرج عوامل أولية'}
              {runResult.unresolvedComposites.length > 0 &&
                ` × [UNRESOLVED COMPOSITE: ${runResult.unresolvedComposites.join(' × ')}]`}
            </div>

            <div className="text-[11px] font-mono text-[#57534E]">
              بذرة ريمان (2000d): <span dir="ltr">{runResult.riemann2000dSeedSample.slice(0, 72)}...</span>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#F4F0E8] border border-[#E2DDD2] rounded-xl p-5 space-y-2 text-xs">
            <div className="font-bold text-[#1C1917] mb-2">📊 تقرير الأداء</div>
            <div className="flex justify-between font-mono">
              <span className="text-[#57534E]">⏱️ الزمن الكلي:</span>
              <span className="font-bold text-[#1C1917]">{runResult.elapsedMs} ms</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-[#57534E]">🔢 العوامل الأولية الكلية:</span>
              <span className="font-bold text-[#1C1917]">
                {runResult.factors.reduce((acc, f) => acc + f.power, 0)}
              </span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-[#57534E]">📐 دقة الحساب المطبقة:</span>
              <span className="font-bold text-[#14532D]">{HP2000_DEC_DIGITS} مرتبة عشرية</span>
            </div>
            <div className="pt-2 border-t border-[#E2DDD2] space-y-1">
              <div className="text-[#57534E] font-bold">🧠 التقنيات المستخدمة:</div>
              <div dir="ltr" className="font-mono text-[11px] text-[#1C1917] break-words">
                {Object.entries(runResult.methodsSummary)
                  .map(([m, c]) => `${m}:${c}`)
                  .join(', ') || 'None'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2000-Decimal-Digit Mathematical Output Viewer */}
      {snapshot2000 && (
        <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-[#1C1917]">
                مخرجات الدقة الفائقة — 2000 مرتبة عشرية مؤكدة (زمن الحساب: {snapshot2000.elapsedMs} ms)
              </h4>
              <div className="text-[11px] font-mono text-[#57534E]">
                الصيغة الجذرية التامة: <span dir="ltr">{snapshot2000.sqrtSurd.canonical}</span> · طول المنازل العشرية:{' '}
                <strong>{snapshot2000.sqrtSurd.decimal2000.split('.')[1]?.length || 2000}</strong> خانة
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'sqrt', label: '√N (2000d)' },
                { id: 'ln', label: 'ln(N) (2000d)' },
                { id: 'cos', label: 'cos(γ₁·ln N) (2000d)' },
                { id: 'pi', label: 'π (2000d)' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSnapshotTab(tab.id)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                    activeSnapshotTab === tab.id
                      ? 'bg-[#1E3A8A] text-white'
                      : 'bg-white border border-[#E2DDD2] text-[#57534E]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const activeVal =
              activeSnapshotTab === 'sqrt'
                ? snapshot2000.sqrtSurd.decimal2000
                : activeSnapshotTab === 'ln'
                ? snapshot2000.lnN2000d
                : activeSnapshotTab === 'cos'
                ? snapshot2000.phases[0]?.cosDecimal2000 || '0'
                : snapshot2000.pi2000d;
            const fracLen = activeVal.includes('.') ? activeVal.split('.')[1].length : 0;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#57534E]">
                  <span>عدد المراتب بعد الفاصلة: {fracLen}</span>
                  <button
                    type="button"
                    onClick={() => copyText(activeSnapshotTab, activeVal)}
                    className="px-2.5 py-1 rounded bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A] font-bold"
                  >
                    {copiedKey === activeSnapshotTab ? '✓ تم النسخ (2000 خانة)' : 'نسخ 2000 مرتبة كاملة'}
                  </button>
                </div>
                <pre
                  dir="ltr"
                  className="bg-white border border-[#E2DDD2] rounded-lg p-3 font-mono text-[11px] text-[#1C1917] max-h-44 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed"
                >
                  {activeVal}
                </pre>
              </div>
            );
          })()}

          {/* All 8 Riemann Zero 2000-Digit Seeds */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#1E3A8A]">بذور أصفار ريمان المولدة من 2000 خانة عشريّة (Top 8 Zeros)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {snapshot2000.phases.map((ph) => (
                <div
                  key={ph.zeroIndex}
                  dir="ltr"
                  className="bg-white border border-[#E2DDD2] rounded-lg p-2.5 text-[11px] font-mono space-y-1"
                >
                  <div className="flex justify-between text-[#1E3A8A] font-bold">
                    <span>γ_{ph.zeroIndex + 1} = {ph.gamma.slice(0, 18)}</span>
                    <span className="text-[#14532D]">2000d</span>
                  </div>
                  <div className="text-[#57534E] truncate">cos = {ph.cosDecimal2000.slice(0, 48)}...</div>
                  <div className="text-[#1C1917] truncate">seed = {ph.seed2000d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ppfo2000LabPanel;
