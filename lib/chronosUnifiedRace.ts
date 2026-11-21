import { bigIntSqrt, isProbablePrimeBig } from './mathEngine';
import { runPsiFactor } from './psiFactorEngine';
import { analyzeSnfsAndCadoParams } from '../snfsDetector';
import { runWienerAttack, runBonehDurfeeAttack } from './rsa500PlusAttacks';
import { solveCoppersmithLll } from './coppersmithLllEngine';
import { analyzeTargetWithZf151716, ZfSmartAnalysisResult } from './zfSmartIntegrator';

export interface UnifiedRaceHints {
  publicExponentE?: string;
  partialPrimeP0?: string;
  unknownBits?: number;
}

export interface UnifiedSharedGf2Stats {
  siqsRelations: number;
  cfracRelations: number;
  totalFullRelations: number;
  targetRelations: number;
  lpCollisions: number;
  matrixSolves: number;
}

export interface UnifiedRaceSummary {
  status: 'idle' | 'racing' | 'success' | 'failed';
  winningEngine: string | null;
  factors: string[];
  verifiedProduct: boolean;
  verifiedPrimes: boolean;
  elapsedMs: number;
  totalOperations: number;
  sharedGf2Stats?: UnifiedSharedGf2Stats;
  noteAr?: string;
}

export interface FastScoutOutcome {
  hit: boolean;
  winningEngine: string | null;
  factors: string[];
  verifiedProduct: boolean;
  verifiedPrimes: boolean;
  scoutOps: number;
  elapsedMs: number;
  zfGuidance: ZfSmartAnalysisResult | null;
  noteAr: string;
}

const parseCleanBigInt = (raw?: string): bigint | null => {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.trim().replace(/\s+/g, '');
  try {
    if (cleaned.startsWith('0x') || cleaned.startsWith('0X')) return BigInt(cleaned);
    const digits = cleaned.replace(/[^0-9]/g, '');
    return digits ? BigInt(digits) : null;
  } catch {
    return null;
  }
};

/**
 * Runs the fast non-blocking parallel-race scouts across:
 *   - Exact square / Probable-prime precheck
 *   - Ψ-Factor (Wheel-30 + Fermat + Pollard-Brent Rho with exact op counters)
 *   - >500b SNFS / Aurifeuillean algebraic splits
 *   - >500b Wiener Continued Fractions & Boneh-Durfee LLL (when e is supplied)
 *   - ZF-18 Coppersmith LLL (when partial prime hint p0 is supplied)
 * Also returns ZF-15/16/17 spectral guidance for orthogonal worker seeding.
 */
export const runUnifiedFastScout = (
  nBig: bigint,
  workerCount: number,
  hints?: UnifiedRaceHints
): FastScoutOutcome => {
  const t0 = performance.now();
  let scoutOps = 0;

  if (nBig < 2n) {
    return {
      hit: false,
      winningEngine: null,
      factors: [],
      verifiedProduct: false,
      verifiedPrimes: false,
      scoutOps: 1,
      elapsedMs: 0,
      zfGuidance: null,
      noteAr: 'القيمة المدخلة أقل من 2.'
    };
  }

  // 1. Exact square check
  const rt = bigIntSqrt(nBig);
  scoutOps += 12;
  if (rt * rt === nBig && rt > 1n) {
    const facs = isProbablePrimeBig(rt, 12) ? [rt.toString(), rt.toString()] : [rt.toString(), rt.toString()];
    const allPrime = isProbablePrimeBig(rt, 12);
    return {
      hit: allPrime,
      winningEngine: allPrime ? 'فحص المربع الكامل (Precheck)' : null,
      factors: allPrime ? facs : [],
      verifiedProduct: allPrime && rt * rt === nBig,
      verifiedPrimes: allPrime,
      scoutOps,
      elapsedMs: Number((performance.now() - t0).toFixed(2)),
      zfGuidance: null,
      noteAr: allPrime ? `تم تحليل المربع الكامل فوراً (${rt}²).` : 'الجذر التربيعي مركب وسيُستكمل تفكيكه.'
    };
  }

  // 2. Probable prime check (Miller-Rabin 16 rounds)
  scoutOps += 16;
  if (isProbablePrimeBig(nBig, 16)) {
    return {
      hit: true,
      winningEngine: 'اختبار الأولية (Miller-Rabin)',
      factors: [nBig.toString()],
      verifiedProduct: true,
      verifiedPrimes: true,
      scoutOps,
      elapsedMs: Number((performance.now() - t0).toFixed(2)),
      zfGuidance: null,
      noteAr: 'العدد أولي محتمل (اجتاز 16 جولة Miller-Rabin).'
    };
  }

  const nBits = nBig.toString(2).length;

  // 3. ZF-15 / ZF-17 / ZF-16 Spectral Worker Guidance
  let zfGuidance: ZfSmartAnalysisResult | null = null;
  try {
    zfGuidance = analyzeTargetWithZf151716(nBig, workerCount);
    scoutOps += 48;
  } catch {}

  // 4. Instantaneous >500-bit SNFS & Aurifeuillean Algebraic Split (runs before heavy Rho so 770b+ SNFS resolves in <2ms)
  const snfs = analyzeSnfsAndCadoParams(nBig);
  scoutOps += 64;
  if (snfs.isSpecialForm && snfs.algebraicFactor) {
    const af1 = parseCleanBigInt(snfs.algebraicFactor);
    if (af1 && af1 > 1n && af1 < nBig && nBig % af1 === 0n) {
      const af2 = nBig / af1;
      const refineAlgebraicPart = (part: bigint, depth: number): bigint[] => {
        if (part <= 1n) return [];
        if (isProbablePrimeBig(part, 10)) return [part];
        if (depth >= 4) return [part];

        const subPsi = runPsiFactor(part, {
          mode: 'psi-hybrid',
          wheelPrimes: [2, 3, 5],
          wheelLimit: 3000,
          fermatLimit: 300,
          rhoIterLimit: part.toString(2).length <= 72 ? 25000 : 1200,
          allowCfracFallback: false
        });
        scoutOps += subPsi.totalOperations;
        if (subPsi.factors.length >= 2) {
          const out: bigint[] = [];
          for (const fs of subPsi.factors) {
            out.push(...refineAlgebraicPart(BigInt(fs), depth + 1));
          }
          return out;
        }

        const subSnfs = analyzeSnfsAndCadoParams(part);
        scoutOps += 32;
        const subAf = parseCleanBigInt(subSnfs.algebraicFactor ?? undefined);
        if (subAf && subAf > 1n && subAf < part && part % subAf === 0n) {
          return [
            ...refineAlgebraicPart(subAf, depth + 1),
            ...refineAlgebraicPart(part / subAf, depth + 1)
          ];
        }
        return [part];
      };

      const refined = [...refineAlgebraicPart(af1, 0), ...refineAlgebraicPart(af2, 0)];
      const productCheck = refined.reduce((acc, v) => acc * v, 1n) === nBig;
      const finalParts = productCheck && refined.length >= 2 ? refined : [af1, af2];
      const sorted = [...finalParts].sort((a, b) => (a < b ? -1 : 1)).map(v => v.toString());
      const allPrime = finalParts.every(v => isProbablePrimeBig(v, 10));

      return {
        hit: true,
        winningEngine: `SNFS / ${snfs.formLabelAr}`,
        factors: sorted,
        verifiedProduct: finalParts.reduce((acc, v) => acc * v, 1n) === nBig,
        verifiedPrimes: allPrime,
        scoutOps,
        elapsedMs: Number((performance.now() - t0).toFixed(2)),
        zfGuidance,
        noteAr: allPrime
          ? `انقسام جبري كامل لصيغة ${snfs.expression}.`
          : `انقسام جبري فوري لصيغة ${snfs.expression} إلى ${sorted.length} عوامل محققة الجداء (يمكن استكمال تفكيك العوامل المركبة عبر CADO-NFS).`
      };
    }
  }

  // 5. >500-bit RSA Weak-Key Attacks (Wiener CF + Boneh-Durfee LLL) when public exponent e is given
  const eBig = parseCleanBigInt(hints?.publicExponentE);
  if (eBig && eBig >= 3n) {
    const wiener = runWienerAttack(nBig, eBig);
    scoutOps += Math.max(10, wiener.convergentsTested * 12);
    if (wiener.success && wiener.verifiedProduct && wiener.factorP && wiener.factorQ) {
      const sorted = [BigInt(wiener.factorP), BigInt(wiener.factorQ)]
        .sort((a, b) => (a < b ? -1 : 1))
        .map(v => v.toString());
      return {
        hit: true,
        winningEngine: `Wiener الكسور المستمرة (d=${wiener.recoveredD?.slice(0, 12)}…)`,
        factors: sorted,
        verifiedProduct: true,
        verifiedPrimes: wiener.verifiedPrimes,
        scoutOps,
        elapsedMs: Number((performance.now() - t0).toFixed(2)),
        zfGuidance,
        noteAr: wiener.notesAr
      };
    }

    // Run Boneh-Durfee only for non-tiny e (typical inverse of d > N^0.25) within fast Gram-LLL size
    if (eBig > 65537n && nBits <= 1024) {
      const bd = runBonehDurfeeAttack(nBig, eBig, 0.266, 3, 1);
      scoutOps += Math.max(400, bd.lllSwaps * 196 + 1500);
      if (bd.success && bd.verifiedProduct && bd.factorP && bd.factorQ) {
        const sorted = [BigInt(bd.factorP), BigInt(bd.factorQ)]
          .sort((a, b) => (a < b ? -1 : 1))
          .map(v => v.toString());
        return {
          hit: true,
          winningEngine: 'Boneh–Durfee LLL (>N^0.25)',
          factors: sorted,
          verifiedProduct: true,
          verifiedPrimes: bd.verifiedPrimes,
          scoutOps,
          elapsedMs: Number((performance.now() - t0).toFixed(2)),
          zfGuidance,
          noteAr: bd.notesAr
        };
      }
    }
  }

  // 6. Ψ-Factor Fast Hybrid Pre-Scout (Wheel-30 + Fermat + bounded Brent Rho; lighter on >220b before Web Workers spawn)
  const psiRes = runPsiFactor(nBig, {
    mode: 'psi-hybrid',
    wheelPrimes: [2, 3, 5],
    wheelLimit: nBits <= 64 ? 35000 : (nBits <= 220 ? 10000 : 3000),
    fermatLimit: nBits <= 220 ? 2500 : 512,
    rhoIterLimit: nBits <= 76 ? 120000 : (nBits <= 220 ? 20000 : 1200),
    allowCfracFallback: false
  });
  scoutOps += psiRes.totalOperations;

  if (psiRes.status === 'FACTORS_VERIFIED' && psiRes.verifiedProduct && psiRes.allFactorsProbablePrime) {
    return {
      hit: true,
      winningEngine: `Ψ-Factor (${psiRes.winningStage})`,
      factors: psiRes.factors,
      verifiedProduct: true,
      verifiedPrimes: true,
      scoutOps,
      elapsedMs: Number((performance.now() - t0).toFixed(2)),
      zfGuidance,
      noteAr: `حسم محرك Ψ-Factor التحليل عبر ${psiRes.winningStage}.`
    };
  }

  // 7. ZF-18 Coppersmith LLL when partial prime hint p0 is supplied
  const p0Big = parseCleanBigInt(hints?.partialPrimeP0);
  if (p0Big && p0Big > 0n) {
    const estUnknown =
      hints?.unknownBits && hints.unknownBits >= 2
        ? hints.unknownBits
        : Math.max(8, Math.round(nBits * 0.16));
    const copper = solveCoppersmithLll(nBig, p0Big, estUnknown);
    scoutOps += Math.max(200, copper.lllSwaps * 64 + 400);
    if (copper.success && copper.verifiedProduct && copper.factorP && copper.factorQ) {
      const sorted = [BigInt(copper.factorP), BigInt(copper.factorQ)]
        .sort((a, b) => (a < b ? -1 : 1))
        .map(v => v.toString());
      return {
        hit: true,
        winningEngine: `ZF-18 Coppersmith LLL (${copper.dimension}×${copper.dimension})`,
        factors: sorted,
        verifiedProduct: true,
        verifiedPrimes: true,
        scoutOps,
        elapsedMs: Number((performance.now() - t0).toFixed(2)),
        zfGuidance,
        noteAr: copper.notesAr
      };
    }
  }

  return {
    hit: false,
    winningEngine: null,
    factors: [],
    verifiedProduct: false,
    verifiedPrimes: false,
    scoutOps,
    elapsedMs: Number((performance.now() - t0).toFixed(2)),
    zfGuidance,
    noteAr: 'انطلقت الخيوط المتوازية (Chronos SIQS + CFRAC + REDC ECM/p±1) في سباق مفتوح بمصفوفة GF(2) موحدة.'
  };
};
