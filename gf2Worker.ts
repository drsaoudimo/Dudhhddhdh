import {
  LazyPoolEdge,
  SingleLargePrimePool,
  SmoothRelation,
  solveBlockWiedemann
} from './mpqsGf2Solver';

let activeNStr = '';
let activeFbKey = '';
let activeN = 0n;
let activeFbPrimes: number[] = [];
let workerPool: SingleLargePrimePool | null = null;

interface Gf2InitMsg {
  type: 'init';
  nStr: string;
  fbPrimes: number[];
}

interface Gf2SolveMsg {
  type: 'solve';
  solveId: number;
  nStr: string;
  fbPrimes: number[];
  fulls: SmoothRelation[];
  treeEdges: LazyPoolEdge[];
  cycleEdges: LazyPoolEdge[];
  maxCyclesToBuild?: number;
}

type Gf2WorkerInMsg = Gf2InitMsg | Gf2SolveMsg;

const ensurePool = (nStr: string, fbPrimes: number[]): SingleLargePrimePool => {
  const fbKey = `${fbPrimes.length}:${fbPrimes[0] ?? 0}:${fbPrimes[fbPrimes.length - 1] ?? 0}`;
  if (!workerPool || activeNStr !== nStr || activeFbKey !== fbKey) {
    activeNStr = nStr;
    activeFbKey = fbKey;
    activeN = BigInt(nStr);
    activeFbPrimes = fbPrimes;
    workerPool = new SingleLargePrimePool(activeN, activeFbPrimes);
  }
  return workerPool;
};

self.onmessage = (e: MessageEvent<Gf2WorkerInMsg>) => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'init') {
    activeNStr = '';
    activeFbKey = '';
    workerPool = null;
    ensurePool(msg.nStr, msg.fbPrimes);
    self.postMessage({ type: 'gf2_ready' });
    return;
  }

  if (msg.type === 'solve') {
    const { solveId, nStr, fbPrimes, fulls, treeEdges, cycleEdges, maxCyclesToBuild } = msg;
    try {
      const pool = ensurePool(nStr, fbPrimes);
      pool.ingestWorkerPayload(fulls || [], treeEdges || [], cycleEdges || []);

      self.postMessage({
        type: 'gf2_stage',
        solveId,
        stage: 'materializing_bfs',
        pendingCycles: pool.pendingCyclesCount,
        directFull: pool.directFullCount
      });

      const { builtCycles, bfsMs } = pool.materializeFullRelations(maxCyclesToBuild);
      const allFulls = pool.getFullRelations(0);

      self.postMessage({
        type: 'gf2_stage',
        solveId,
        stage: 'markowitz_sge',
        bfsBuildMs: bfsMs,
        builtCycles,
        totalRows: allFulls.length,
        totalCols: fbPrimes.length + 1
      });

      const bwRes = solveBlockWiedemann(activeN, activeFbPrimes, allFulls, pool.getRedcCtx());
      const timings = {
        bfsBuildMs: Number(bfsMs.toFixed(2)),
        markowitzMs: Number((bwRes.stageTimings?.markowitzMs ?? 0).toFixed(2)),
        linearSolveMs: Number((bwRes.stageTimings?.linearSolveMs ?? 0).toFixed(2)),
        sqrtMs: Number((bwRes.stageTimings?.sqrtMs ?? 0).toFixed(2)),
        builtCycles
      };

      self.postMessage({
        type: 'gf2_solved',
        solveId,
        factorStr: bwRes.factor ? bwRes.factor.toString() : null,
        methodUsed: bwRes.methodUsed,
        krylovSteps: bwRes.krylovSteps,
        coreRows: bwRes.coreRows,
        coreCols: bwRes.coreCols,
        dependenciesTested: bwRes.dependenciesTested,
        redcBenchmark: bwRes.redcBenchmark,
        stageTimings: timings,
        totalRows: allFulls.length,
        totalCols: fbPrimes.length + 1,
        builtCycles,
        remainingCycles: pool.pendingCyclesCount
      });
    } catch (err: any) {
      self.postMessage({
        type: 'gf2_error',
        solveId,
        message: err?.message || String(err)
      });
    }
  }
};
