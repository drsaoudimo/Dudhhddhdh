import { isProbablePrime, modPow, gcd } from '../mathUtils';
import { CHRONOS_WORKER_CODE } from '../chronosWorker';
import { CFRAC_WORKER_CODE } from '../cfracWorker';
import {
  buildMpqsFactorBase,
  selectRankedKnuthSchroeppelMultipliers,
  SingleLargePrimePool,
  SmoothRelation,
  solveBlockWiedemann
} from '../mpqsGf2Solver';
import { computeV4SieveDiagnostics } from '../v4FallbackOptimizer';
import { runUnifiedFastScout, UnifiedRaceHints } from './chronosUnifiedRace';
import { evaluateZetaGuidanceForGf2 } from './zetaGf2Advisor';
import {
  cacheFactorization,
  computeUniversalExponentReport,
  extractFactorsAnyN,
  getCachedFactorization,
  safeModInverse
} from './universalExponentEngine';

export interface AnyMethodProgressInfo {
  stage: string;
  elapsedMs: number;
  relationsCollected?: number;
  targetRelations?: number;
  curves?: number;
}

export interface AnyMethodSolveOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  workerCount?: number;
  hints?: UnifiedRaceHints;
  onProgress?: (info: AnyMethodProgressInfo) => void;
}

export interface AnyMethodSolveResult {
  success: boolean;
  aborted?: boolean;
  n: string;
  nBits: number;
  factors: string[];
  factorP: string | null;
  factorQ: string | null;
  verifiedProduct: boolean;
  verifiedPrimes: boolean;
  winningMethod: string;
  elapsedMs: number;
  notesAr: string;
}

export interface PrivateKeyRecoveryResult {
  success: boolean;
  aborted?: boolean;
  n: string;
  nBits: number;
  e: string;
  minimalE: string | null;
  p: string | null;
  q: string | null;
  allFactors: string[];
  lambda: string | null;
  phi: string | null;
  d: string | null;
  roundtripVerified: boolean;
  verifiedProduct: boolean;
  verifiedPrimes: boolean;
  winningMethod: string;
  elapsedMs: number;
  notesAr: string;
}

const expandFactorPowers = (factorPowers: Array<{ prime: bigint; power: number }>): bigint[] => {
  const out: bigint[] = [];
  for (const item of factorPowers) {
    for (let i = 0; i < item.power; i++) out.push(item.prime);
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const finalizeSplitFactors = (N: bigint, discoveredParts: bigint[]): bigint[] => {
  const queue: bigint[] = [...discoveredParts];
  const leaves: bigint[] = [];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (cur <= 1n) continue;
    if (isProbablePrime(cur, 14)) {
      leaves.push(cur);
      continue;
    }
    const ext = extractFactorsAnyN(cur, 30000);
    if (ext.factors.length > 0) {
      const expanded = expandFactorPowers(ext.factors);
      if (expanded.length >= 2) {
        leaves.push(...expanded);
        continue;
      }
    }
    leaves.push(cur);
  }
  const prod = leaves.reduce((acc, v) => acc * v, 1n);
  if (prod === N && leaves.length >= 1) {
    return leaves.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return discoveredParts.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

/**
 * Escalates synchronously and asynchronously across ALL mathematical engines
 * (Cache -> Trial/SNFS/Fermat/Hart/p-1/Rho -> Unified Fast Scout (Ψ/Wiener/BD/Coppersmith)
 * -> Parallel Web Workers: Zeta-Seeded Montgomery REDC ECM + Williams p+1 + Deep p-1 + CFRAC + SIQS GF(2))
 * to factor N or determine its prime decomposition before assigning/accepting any exponent.
 */
export const solveModulusByAnyMethodAsync = async (
  rawN: bigint | string,
  options?: AnyMethodSolveOptions
): Promise<AnyMethodSolveResult> => {
  const t0 = performance.now();
  const N = typeof rawN === 'string' ? BigInt(rawN.trim().replace(/[^0-9]/g, '') || '0') : rawN;
  const nStr = N.toString();
  const nBits = N > 0n ? N.toString(2).length : 0;

  if (options?.signal?.aborted) {
    return {
      success: false,
      aborted: true,
      n: nStr,
      nBits,
      factors: [],
      factorP: null,
      factorQ: null,
      verifiedProduct: false,
      verifiedPrimes: false,
      winningMethod: 'aborted',
      elapsedMs: 0,
      notesAr: 'تم إلغاء عملية البحث بطلب المستخدم.'
    };
  }

  if (N < 2n) {
    return {
      success: false,
      n: nStr,
      nBits,
      factors: [],
      factorP: null,
      factorQ: null,
      verifiedProduct: false,
      verifiedPrimes: false,
      winningMethod: 'invalid-input',
      elapsedMs: 0,
      notesAr: 'القيمة المدخلة أصغر من 2.'
    };
  }

  // 1. Global Factor Cache Check
  const cached = getCachedFactorization(N);
  if (cached) {
    const rawList =
      cached.allFactors && cached.allFactors.length > 0
        ? cached.allFactors
        : cached.p > 1n && cached.q > 1n
        ? [cached.p, cached.q]
        : [];
    if (rawList.length > 0 && rawList.reduce((acc, v) => acc * v, 1n) === N) {
      const sorted = finalizeSplitFactors(N, rawList);
      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      const allPrime = sorted.every(v => isProbablePrime(v, 12));
      return {
        success: true,
        n: nStr,
        nBits,
        factors: sorted.map(v => v.toString()),
        factorP: sorted[0].toString(),
        factorQ: (sorted.length === 2 ? sorted[1] : N / sorted[0]).toString(),
        verifiedProduct: true,
        verifiedPrimes: allPrime,
        winningMethod: `ذاكرة التخزين (${cached.source})`,
        elapsedMs,
        notesAr: `تم استرجاع التفكيك المحقق من الذاكرة (${cached.source}) خلال ${elapsedMs} مللي ثانية.`
      };
    }
  }

  // 2. Direct Prime Check
  if (isProbablePrime(N, 16)) {
    const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
    return {
      success: true,
      n: nStr,
      nBits,
      factors: [nStr],
      factorP: nStr,
      factorQ: '1',
      verifiedProduct: true,
      verifiedPrimes: true,
      winningMethod: 'اختبار الأولية (Miller-Rabin 16 قاعدة)',
      elapsedMs,
      notesAr: `العدد أولي مؤكد (${nBits} بت)، وبالتالي λ(N) = N − 1 مباشرة.`
    };
  }

  options?.onProgress?.({ stage: 'فحص سريع أولي (Trial / SNFS / Fermat / Ψ-Factor)...', elapsedMs: Math.round(performance.now() - t0) });

  // 3. Tier-1 Sync Recursive Multi-Method Cascade
  const syncExt = extractFactorsAnyN(N, 60000);
  if (syncExt.isComplete && syncExt.factors.length > 0) {
    const sorted = expandFactorPowers(syncExt.factors);
    const prodOk = sorted.reduce((acc, v) => acc * v, 1n) === N;
    if (prodOk) {
      if (sorted.length >= 2) {
        cacheFactorization(N, sorted[0], N / sorted[0], sorted, syncExt.method);
      }
      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      return {
        success: true,
        n: nStr,
        nBits,
        factors: sorted.map(v => v.toString()),
        factorP: sorted[0].toString(),
        factorQ: (sorted.length === 2 ? sorted[1] : N / sorted[0]).toString(),
        verifiedProduct: true,
        verifiedPrimes: sorted.every(v => isProbablePrime(v, 12)),
        winningMethod: syncExt.method,
        elapsedMs,
        notesAr: `تم التفكيك الفوري عبر (${syncExt.method}) في ${elapsedMs} مللي ثانية.`
      };
    }
  }

  // 4. Unified Fast Scout (Ψ-Factor + Wiener + Boneh-Durfee LLL + Coppersmith + ZF-15/16/17 Spectral Seeds)
  const desiredWorkers = Math.max(
    4,
    Math.min(8, options?.workerCount ?? (typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4))
  );
  const scout = runUnifiedFastScout(N, desiredWorkers, options?.hints);
  if (scout.hit && scout.factors.length > 0) {
    const sorted = finalizeSplitFactors(
      N,
      scout.factors.map(v => BigInt(v))
    );
    const prodOk = sorted.reduce((acc, v) => acc * v, 1n) === N;
    if (prodOk) {
      if (sorted.length >= 2) {
        cacheFactorization(N, sorted[0], N / sorted[0], sorted, scout.winningEngine || 'Unified Fast Scout');
      }
      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      return {
        success: true,
        n: nStr,
        nBits,
        factors: sorted.map(v => v.toString()),
        factorP: sorted[0].toString(),
        factorQ: (sorted.length === 2 ? sorted[1] : N / sorted[0]).toString(),
        verifiedProduct: true,
        verifiedPrimes: sorted.every(v => isProbablePrime(v, 12)),
        winningMethod: scout.winningEngine || 'Unified Fast Scout',
        elapsedMs,
        notesAr: scout.noteAr
      };
    }
  }

  // 5. Tier-2 Check Worker Availability (e.g., SSR/Node fallback exits cleanly)
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
    return {
      success: false,
      n: nStr,
      nBits,
      factors: [],
      factorP: null,
      factorQ: null,
      verifiedProduct: false,
      verifiedPrimes: false,
      winningMethod: 'sync-only-exhausted',
      elapsedMs,
      notesAr: 'لم تنجح المرحلة المتزامنة، وبيئة التشغيل الحالية لا تدعم Web Workers المتوازية.'
    };
  }

  // Check Knuth-Schroeppel Multiplier GCD & Zeta Spectral Micro-Sweep before launching Web Workers
  const useSiqsUnified = nBits <= 272;
  const rankedKsRes = selectRankedKnuthSchroeppelMultipliers(N, 16);
  const zetaGuide = evaluateZetaGuidanceForGf2(N, rankedKsRes.ranked, scout.zfGuidance?.zetaSeeds);

  const instantFactor =
    (rankedKsRes.directFactor && rankedKsRes.directFactor > 1n && rankedKsRes.directFactor < N && N % rankedKsRes.directFactor === 0n)
      ? rankedKsRes.directFactor
      : (zetaGuide.directFactor && zetaGuide.directFactor > 1n && zetaGuide.directFactor < N && N % zetaGuide.directFactor === 0n
          ? zetaGuide.directFactor
          : null);

  if (instantFactor) {
    const sorted = finalizeSplitFactors(N, [instantFactor, N / instantFactor]);
    const winLabel = rankedKsRes.directFactor ? 'Knuth–Schroeppel Multiplier GCD' : 'Zeta Spectral Seed Micro-Sweep';
    cacheFactorization(N, sorted[0], N / sorted[0], sorted, winLabel);
    const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
    return {
      success: true,
      n: nStr,
      nBits,
      factors: sorted.map(v => v.toString()),
      factorP: sorted[0].toString(),
      factorQ: (sorted.length === 2 ? sorted[1] : N / sorted[0]).toString(),
      verifiedProduct: true,
      verifiedPrimes: sorted.every(v => isProbablePrime(v, 12)),
      winningMethod: winLabel,
      elapsedMs,
      notesAr: zetaGuide.directFactor
        ? `${zetaGuide.summaryAr} (${elapsedMs} مللي ثانية)`
        : `تم اصطياد عامل فوري عبر القاسم المشترك لمضاعف Knuth–Schroeppel في ${elapsedMs} مللي ثانية.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? (nBits <= 196 ? 90000 : 60000);
  const optK = zetaGuide.selectedK || 1;
  const siqsM = BigInt(optK) * N;
  const cfracMultipliers = zetaGuide.cfracMultipliers.length > 0 ? zetaGuide.cfracMultipliers : [1, 3, 5, 7, 11, 13, 17];
  const activeFb = useSiqsUnified
    ? buildMpqsFactorBase(N, siqsM)
    : { primes: [] as number[], roots: [] as number[], logs: [] as number[], largePrimeBound: 0 };

  const lpPool = new SingleLargePrimePool(N, activeFb.primes);
  const targetRelations = activeFb.primes.length + (nBits >= 160 ? 14 : 8);
  const v4Diag = computeV4SieveDiagnostics();
  const activeSieveWeights = {
    rowMedians: v4Diag.rowMedians,
    colPriors: v4Diag.colPriors6,
    zetaWidthScale: zetaGuide.sieveHalfWidthScale
  };
  const zfWorkerSeeds = scout.zfGuidance?.workerGuidance || [];
  const zetaSeeds = zetaGuide.zetaSeeds.length > 0 ? zetaGuide.zetaSeeds : (scout.zfGuidance?.zetaSeeds || []);

  const numWorkers = useSiqsUnified ? Math.max(4, Math.min(8, desiredWorkers)) : Math.max(4, Math.min(6, desiredWorkers));
  const workerRoles: Array<'ecm' | 'cfrac' | 'siqs'> = Array.from({ length: numWorkers }, (_, idx) => {
    if (!useSiqsUnified) return 'ecm';
    if (idx === 0) return 'ecm';
    if (idx === 1) return 'cfrac';
    return 'siqs';
  });
  const totalSiqsWorkers = Math.max(1, workerRoles.filter(r => r === 'siqs').length);

  return new Promise<AnyMethodSolveResult>((resolve) => {
    const workers: Worker[] = [];
    const blobUrls: string[] = [];
    let settled = false;
    let matrixSolves = 0;
    let lastMatrixLen = 0;
    let maxCurvesSeen = 0;
    let cfracMultCursor = 0;
    let activeCfracK = cfracMultipliers[0];
    let siqsRankCounter = 0;

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let progressHandle: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (progressHandle !== null) {
        clearInterval(progressHandle);
        progressHandle = null;
      }
      options?.signal?.removeEventListener('abort', onAbort);
      for (const w of workers) {
        try {
          w.terminate();
        } catch {}
      }
      workers.length = 0;
      for (const u of blobUrls) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
      blobUrls.length = 0;
    };

    const finish = (result: AnyMethodSolveResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const finishWithDiscoveredParts = (parts: bigint[], methodLabel: string) => {
      const validParts = parts.filter(p => p > 1n && p < N && N % p === 0n);
      if (validParts.length === 0) return;

      const fullParts =
        validParts.reduce((a, b) => a * b, 1n) === N
          ? validParts
          : [validParts[0], N / validParts[0]];
      const sorted = finalizeSplitFactors(N, fullParts);
      if (sorted.reduce((a, b) => a * b, 1n) !== N || sorted.length < 2) return;

      cacheFactorization(N, sorted[0], N / sorted[0], sorted, methodLabel);
      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      finish({
        success: true,
        n: nStr,
        nBits,
        factors: sorted.map(v => v.toString()),
        factorP: sorted[0].toString(),
        factorQ: (sorted.length === 2 ? sorted[1] : N / sorted[0]).toString(),
        verifiedProduct: true,
        verifiedPrimes: sorted.every(v => isProbablePrime(v, 12)),
        winningMethod: methodLabel,
        elapsedMs,
        notesAr: `تم اكتشاف العوامل عبر (${methodLabel}) خلال ${(elapsedMs / 1000).toFixed(2)} ثانية.`
      });
    };

    const onAbort = () => {
      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      finish({
        success: false,
        aborted: true,
        n: nStr,
        nBits,
        factors: [],
        factorP: null,
        factorQ: null,
        verifiedProduct: false,
        verifiedPrimes: false,
        winningMethod: 'aborted',
        elapsedMs,
        notesAr: 'تم إيقاف البحث المتوازي بطلب المستخدم.'
      });
    };

    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    timeoutHandle = setTimeout(() => {
      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      finish({
        success: false,
        n: nStr,
        nBits,
        factors: [],
        factorP: null,
        factorQ: null,
        verifiedProduct: false,
        verifiedPrimes: false,
        winningMethod: 'timeout',
        elapsedMs,
        notesAr: `انتهت المهلة الزمنية للبحث المتصفحي (${Math.round(timeoutMs / 1000)} ث) دون استكمال تفكيك مودول ${nBits} بت (يمكن الاستمرار عبر تصدير CADO-NFS أو زيادة المهلة).`
      });
    }, timeoutMs);

    options?.onProgress?.({
      stage: useSiqsUnified
        ? `سباق متوازٍ (${numWorkers} خيوط): Chronos SIQS v4 + CFRAC + REDC ECM`
        : `سباق متوازٍ (>220b · ${numWorkers} خيوط): Zeta REDC ECM + Pollard p±1`,
      elapsedMs: Math.round(performance.now() - t0),
      relationsCollected: 0,
      targetRelations: useSiqsUnified ? targetRelations : undefined,
      curves: 0
    });

    progressHandle = setInterval(() => {
      if (settled) return;
      options?.onProgress?.({
        stage: useSiqsUnified
          ? `تجميع علاقات GF(2) (${lpPool.fullCount}/${targetRelations}) + REDC ECM (${maxCurvesSeen} منحنى)`
          : `فحص منحنيات Zeta REDC ECM و p±1 (${maxCurvesSeen} منحنى)...`,
        elapsedMs: Math.round(performance.now() - t0),
        relationsCollected: lpPool.fullCount,
        targetRelations: useSiqsUnified ? targetRelations : undefined,
        curves: maxCurvesSeen
      });
    }, 350);

    try {
      const chronosBlob = new Blob([CHRONOS_WORKER_CODE], { type: 'application/javascript' });
      const chronosUrl = URL.createObjectURL(chronosBlob);
      blobUrls.push(chronosUrl);

      let cfracUrl = '';
      if (workerRoles.includes('cfrac')) {
        const cfracBlob = new Blob([CFRAC_WORKER_CODE], { type: 'application/javascript' });
        cfracUrl = URL.createObjectURL(cfracBlob);
        blobUrls.push(cfracUrl);
      }

      const tryMatrixSolve = (sourceLabel: string) => {
        if (!useSiqsUnified || settled) return;
        const collected = lpPool.fullCount;
        const delta = nBits >= 160 ? 14 : 6;
        if (collected >= targetRelations && (collected - lastMatrixLen >= delta || matrixSolves === 0)) {
          lastMatrixLen = collected;
          matrixSolves++;
          const bwRes = solveBlockWiedemann(N, activeFb.primes, lpPool.getFullRelations(), lpPool.getRedcCtx());
          if (bwRes.factor && bwRes.factor > 1n && bwRes.factor < N && N % bwRes.factor === 0n) {
            finishWithDiscoveredParts(
              [bwRes.factor, N / bwRes.factor],
              `${sourceLabel} · GF(2) ${bwRes.methodUsed}`
            );
          }
        }
      };

      workerRoles.forEach((roleVal, wId) => {
        if (settled) return;
        const url = roleVal === 'cfrac' ? cfracUrl : chronosUrl;
        const worker = new Worker(url);
        workers.push(worker);

        worker.onmessage = (ev: MessageEvent) => {
          if (settled) return;
          const d = ev.data || {};
          if (d.type === 'chronos_suyama_stage') {
            if (typeof d.curveIndex === 'number') {
              maxCurvesSeen = Math.max(maxCurvesSeen, d.curveIndex);
            }
          } else if (d.type === 'chronos_relations_batch') {
            const batch: SmoothRelation[] = d.relations || [];
            if (d.targetN === nStr && batch.length > 0 && useSiqsUnified) {
              lpPool.ingestBatch(batch);
              tryMatrixSolve('Chronos SIQS v4');
            }
          } else if (d.type === 'cfrac_relations_batch') {
            const batch: SmoothRelation[] = d.relations || [];
            const workerK = d.kMultiplier ?? activeCfracK;
            if (d.targetN === nStr && batch.length > 0 && useSiqsUnified && workerK === activeCfracK) {
              lpPool.ingestBatch(batch);
              tryMatrixSolve(`CFRAC (k=${workerK})`);
            }
          } else if (d.type === 'cfrac_period_exhausted') {
            cfracMultCursor++;
            if (cfracMultCursor < cfracMultipliers.length && useSiqsUnified && !settled) {
              activeCfracK = cfracMultipliers[cfracMultCursor];
              worker.postMessage({
                type: 'start',
                n: nStr,
                kMultiplier: activeCfracK,
                fbPrimes: activeFb.primes,
                largePrimeBound: activeFb.largePrimeBound
              });
            }
          } else if (d.type === 'result') {
            const rawFactors: string[] = Array.isArray(d.allFactors)
              ? d.allFactors
              : Array.isArray(d.factors)
              ? d.factors
              : d.factor
              ? [d.factor]
              : [];
            const parsed = rawFactors
              .map((s: string) => {
                try {
                  return BigInt(s);
                } catch {
                  return 0n;
                }
              })
              .filter((v: bigint) => v > 1n && v < N && N % v === 0n);
            if (parsed.length > 0) {
              finishWithDiscoveredParts(parsed, d.method || `Chronos Worker (${roleVal.toUpperCase()})`);
            }
          }
        };

        worker.onerror = () => {
          // Keep remaining parallel workers racing cleanly
        };

        if (roleVal === 'cfrac') {
          worker.postMessage({
            type: 'start',
            n: nStr,
            kMultiplier: activeCfracK,
            fbPrimes: activeFb.primes,
            largePrimeBound: activeFb.largePrimeBound
          });
        } else {
          const zGuide = zfWorkerSeeds[wId];
          const zSeed = zetaSeeds.length > 0 ? zetaSeeds[wId % zetaSeeds.length] : undefined;
          const mySiqsRank = roleVal === 'siqs' ? siqsRankCounter++ : 0;
          worker.postMessage({
            type: 'start',
            n: nStr,
            targetM: useSiqsUnified ? siqsM.toString() : nStr,
            role: roleVal === 'ecm' ? 'ecm' : 'siqs',
            workerId: wId,
            totalWorkers: numWorkers,
            siqsRank: mySiqsRank,
            siqsTotalWorkers: totalSiqsWorkers,
            seedOffset: zGuide?.seedOffset ?? wId * 250000,
            fbPrimes: activeFb.primes,
            fbRoots: activeFb.roots,
            fbLogs: activeFb.logs,
            largePrimeBound: activeFb.largePrimeBound,
            sieveMode: 'v4-fallback',
            sieveWeights: activeSieveWeights,
            zetaSigmaSeed: zGuide?.zetaSigmaSeed ?? zSeed?.ecmSigmaSeed ?? null,
            zetaRhoSeed: zSeed?.rhoSeed ?? null
          });
        }
      });
    } catch (err: any) {
      const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
      finish({
        success: false,
        n: nStr,
        nBits,
        factors: [],
        factorP: null,
        factorQ: null,
        verifiedProduct: false,
        verifiedPrimes: false,
        winningMethod: 'worker-error',
        elapsedMs,
        notesAr: err?.message || 'تعذر تشغيل خيوط البحث المتوازية.'
      });
    }
  });
};

/**
 * Recovers full private key (p, q, λ(N), φ(N), minimalE, and d ≡ e⁻¹ mod λ(N))
 * for ANY given (N, e) — including standard e = 65537 — by finding the factorization first
 * through any applicable method.
 */
export const recoverPrivateKeyFromAnyMethod = async (
  rawN: bigint | string,
  rawE: bigint | string,
  options?: AnyMethodSolveOptions
): Promise<PrivateKeyRecoveryResult> => {
  const t0 = performance.now();
  const N = typeof rawN === 'string' ? BigInt(rawN.trim().replace(/[^0-9]/g, '') || '0') : rawN;
  const e = typeof rawE === 'string' ? BigInt(rawE.trim().replace(/[^0-9]/g, '') || '0') : rawE;
  const nStr = N.toString();
  const nBits = N > 0n ? N.toString(2).length : 0;

  const solveRes = await solveModulusByAnyMethodAsync(N, {
    ...options,
    hints: {
      ...options?.hints,
      publicExponentE: e >= 3n ? e.toString() : options?.hints?.publicExponentE
    }
  });

  if (!solveRes.success || solveRes.factors.length === 0) {
    return {
      success: false,
      aborted: solveRes.aborted,
      n: nStr,
      nBits,
      e: e.toString(),
      minimalE: null,
      p: null,
      q: null,
      allFactors: [],
      lambda: null,
      phi: null,
      d: null,
      roundtripVerified: false,
      verifiedProduct: false,
      verifiedPrimes: false,
      winningMethod: solveRes.winningMethod,
      elapsedMs: solveRes.elapsedMs,
      notesAr: solveRes.notesAr
    };
  }

  const pHint = solveRes.factorP || solveRes.factors[0];
  const qHint =
    solveRes.factorQ && solveRes.factorQ !== '1'
      ? solveRes.factorQ
      : (N / BigInt(pHint)).toString();

  const rep = computeUniversalExponentReport(N, 'standard', 0.258, pHint, qHint);
  const lambdaBig = BigInt(rep.lambdaN);
  const isCoprime = e >= 1n && gcd(e, lambdaBig) === 1n;
  const dBig = isCoprime ? safeModInverse(e, lambdaBig) : 0n;

  let roundtripVerified = false;
  if (isCoprime && dBig > 0n && N > 42n) {
    const m = 42n;
    const c = modPow(m, e, N);
    const dec = modPow(c, dBig, N);
    roundtripVerified = dec === m;
  } else if (isCoprime && dBig > 0n && N >= 2n) {
    const m = N - 1n;
    roundtripVerified = modPow(modPow(m, e, N), dBig, N) === m;
  }

  const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
  return {
    success: true,
    n: nStr,
    nBits,
    e: e.toString(),
    minimalE: rep.minimalPublicExponentE ?? null,
    p: pHint,
    q: qHint,
    allFactors: solveRes.factors,
    lambda: rep.lambdaN,
    phi: rep.phiN,
    d: isCoprime ? dBig.toString() : null,
    roundtripVerified,
    verifiedProduct: solveRes.verifiedProduct,
    verifiedPrimes: solveRes.verifiedPrimes,
    winningMethod: solveRes.winningMethod,
    elapsedMs,
    notesAr: isCoprime
      ? `تم العثور على العوامل وحساب λ(N) أولاً عبر (${solveRes.winningMethod}) ثم استخراج الأس الخاص d ≡ e⁻¹ mod λ(N) والتحقق من التشفير وفك التشفير (roundtrip=${roundtripVerified}) خلال ${elapsedMs} مللي ثانية.`
      : `تم تفكيك N عبر (${solveRes.winningMethod}) وحساب λ(N)، إلا أن e=${e.toString()} غير أولي نسبياً مع λ(N) (أصغر أس صالح e_min=${rep.minimalPublicExponentE}).`
  };
};
