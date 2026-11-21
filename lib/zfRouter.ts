import { RouterHint, RouterResult } from './zfCommon/resultTypes';
import { bitLengthBig, isPerfectSquareBig } from './zfCommon/gcd';
import { isPrimeIndependent } from './zfCommon/primality';
import { runZf18Coppersmith } from './zf18/coppersmithEngine';
import { runZf19Cfrac } from './zf19/cfracEngine';

export interface ZfRouterOptions {
  allowFallbackToCfrac?: boolean;
  cfracMaxBits?: number;
  cfracFactorBaseBound?: number;
  cfracMatrixSolver?: 'gaussian' | 'block-wiedemann';
  latticeM?: number;
  latticeT?: number;
  timeoutSeconds?: number;
}

const estimateCfracBound = (bits: number): number => {
  if (bits <= 24) return 80;
  if (bits <= 36) return 260;
  if (bits <= 52) return 750;
  if (bits <= 68) return 1800;
  return 4500;
};

/**
 * Unified Phase-3 Router: ZF_Router(N, H)
 * 1. Independent precheck for perfect square and primality (never conflating NO_FACTOR_FOUND with PRIME).
 * 2. If partial-bit hint H = (p0, X) is provided -> routes to ZF-18 (Coppersmith via LLL).
 * 3. Else (or optional fallback on small/medium N) -> routes to ZF-19 (CFRAC).
 * 4. Always returns strict RouterStatus: FACTORS_VERIFIED | PERFECT_SQUARE | PRIME_MODULUS | INCONCLUSIVE.
 */
export const zfRouter = (
  N: bigint,
  H?: RouterHint,
  options: ZfRouterOptions = {}
): RouterResult => {
  const t0 = performance.now();
  const timeoutSeconds = options.timeoutSeconds ?? 12;
  const cfracMaxBits = options.cfracMaxBits ?? 96;
  const allowFallbackToCfrac = options.allowFallbackToCfrac ?? true;

  if (N < 2n) {
    return {
      status: 'INCONCLUSIVE',
      engine_used: 'PRECHECK',
      factor_p: null,
      factor_q: null,
      execution_time_ms: Number((performance.now() - t0).toFixed(3)),
      diagnostic_message: 'القيمة N أقل من 2 ولا تقبل التحليل.'
    };
  }

  const sq = isPerfectSquareBig(N);
  if (sq.isSquare) {
    return {
      status: 'PERFECT_SQUARE',
      engine_used: 'PRECHECK',
      factor_p: sq.root.toString(),
      factor_q: sq.root.toString(),
      execution_time_ms: Number((performance.now() - t0).toFixed(3)),
      diagnostic_message: `تم اكتشاف مربع كامل مسبقاً: N = ${sq.root}²`
    };
  }

  if (isPrimeIndependent(N, 16)) {
    return {
      status: 'PRIME_MODULUS',
      engine_used: 'PRECHECK',
      factor_p: null,
      factor_q: null,
      execution_time_ms: Number((performance.now() - t0).toFixed(3)),
      diagnostic_message: 'اجتاز العدد N اختبار الأولية المستقل (Miller-Rabin متعدد القواعد) — عدد أولي.'
    };
  }

  const nBits = bitLengthBig(N);
  const hasHint = Boolean(H && H.p0 !== undefined && H.X !== undefined && H.p0 > 0n && H.X >= 1n);

  if (hasHint && H && H.p0 !== undefined && H.X !== undefined) {
    const zf18Res = runZf18Coppersmith({
      N,
      p0: H.p0,
      X: H.X,
      beta: H.beta ?? 0.5,
      epsilon: H.epsilon ?? 0.02,
      lattice_m: options.latticeM ?? 3,
      lattice_t: options.latticeT ?? 3,
      timeout_seconds: timeoutSeconds
    });

    if (zf18Res.status === 'FACTORS_VERIFIED') {
      return {
        status: 'FACTORS_VERIFIED',
        engine_used: 'ZF-18',
        factor_p: zf18Res.factor_p,
        factor_q: zf18Res.factor_q,
        zf18_result: zf18Res,
        execution_time_ms: Number((performance.now() - t0).toFixed(3)),
        diagnostic_message: `وجّه ZF_Router المسألة إلى محرك ZF-18 (Coppersmith-LLL) وتم التحقق من العاملين.`
      };
    }

    if (allowFallbackToCfrac && nBits <= cfracMaxBits) {
      const bound = options.cfracFactorBaseBound ?? estimateCfracBound(nBits);
      const zf19Res = runZf19Cfrac({
        N,
        factor_base_bound: bound,
        max_relations: bound + 40,
        max_iterations: 250000,
        matrix_solver: options.cfracMatrixSolver ?? 'gaussian',
        timeout_seconds: timeoutSeconds,
        enable_partial_relations: true
      });

      if (zf19Res.status === 'FACTORS_VERIFIED') {
        return {
          status: 'FACTORS_VERIFIED',
          engine_used: 'ZF-18->ZF-19',
          factor_p: zf19Res.factor_p,
          factor_q: zf19Res.factor_q,
          zf18_result: zf18Res,
          zf19_result: zf19Res,
          execution_time_ms: Number((performance.now() - t0).toFixed(3)),
          diagnostic_message: `فشل تلميح ZF-18 (${zf18Res.status}) فتم التحويل إلى ZF-19 (CFRAC) وتم التحقق من العوامل.`
        };
      }

      return {
        status: 'INCONCLUSIVE',
        engine_used: 'ZF-18->ZF-19',
        factor_p: null,
        factor_q: null,
        zf18_result: zf18Res,
        zf19_result: zf19Res,
        execution_time_ms: Number((performance.now() - t0).toFixed(3)),
        diagnostic_message: `تعذّر الحسم عبر ZF-18 (${zf18Res.status}) ومسار التحويل ZF-19 (${zf19Res.status}).`
      };
    }

    return {
      status: 'INCONCLUSIVE',
      engine_used: 'ZF-18',
      factor_p: null,
      factor_q: null,
      zf18_result: zf18Res,
      execution_time_ms: Number((performance.now() - t0).toFixed(3)),
      diagnostic_message: `لم يحسم ZF-18 المسألة (${zf18Res.status}) وحجم N (${nBits} بت) يتجاوز سقف التحويل الفوري لـ CFRAC.`
    };
  }

  // No hint H -> route directly to ZF-19 if within budget
  if (nBits <= cfracMaxBits) {
    const bound = options.cfracFactorBaseBound ?? estimateCfracBound(nBits);
    const zf19Res = runZf19Cfrac({
      N,
      factor_base_bound: bound,
      max_relations: bound + 40,
      max_iterations: 250000,
      matrix_solver: options.cfracMatrixSolver ?? 'gaussian',
      timeout_seconds: timeoutSeconds,
      enable_partial_relations: true
    });

    if (zf19Res.status === 'FACTORS_VERIFIED') {
      return {
        status: 'FACTORS_VERIFIED',
        engine_used: 'ZF-19',
        factor_p: zf19Res.factor_p,
        factor_q: zf19Res.factor_q,
        zf19_result: zf19Res,
        execution_time_ms: Number((performance.now() - t0).toFixed(3)),
        diagnostic_message: `وجّه ZF_Router المسألة (بدون تلميح) إلى محرك ZF-19 (CFRAC) وتم التحقق من العوامل.`
      };
    }

    return {
      status: 'INCONCLUSIVE',
      engine_used: 'ZF-19',
      factor_p: null,
      factor_q: null,
      zf19_result: zf19Res,
      execution_time_ms: Number((performance.now() - t0).toFixed(3)),
      diagnostic_message: `توقف ZF-19 دون استخراج عامل غير تافه (${zf19Res.status}).`
    };
  }

  return {
    status: 'INCONCLUSIVE',
    engine_used: 'PRECHECK',
    factor_p: null,
    factor_q: null,
    execution_time_ms: Number((performance.now() - t0).toFixed(3)),
    diagnostic_message: `طول N (${nBits} بت) يتطلب تلميحاً جزئياً H لمسار ZF-18 أو التبديل إلى SIQS/ECM المتوازي.`
  };
};
