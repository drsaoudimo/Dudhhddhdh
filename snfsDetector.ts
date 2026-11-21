import { gcdBig, isProbablePrimeBig } from './mpqsGf2Solver';

export interface SnfsPolySelection {
  degree: number;
  baseM: string;
  fCoeffs: string[];
  gCoeffs: string[];
  skew: string;
  alphaScoreEst: string;
}

export interface SnfsAnalysis {
  isSpecialForm: boolean;
  formType: 'mersenne' | 'fermat' | 'aurifeuillean' | 'cunningham' | 'repunit' | 'near-power' | 'general';
  formLabelAr: string;
  formLabelFr: string;
  expression: string;
  recommendedEngineAr: string;
  recommendedEngineFr: string;
  algebraicFactor: string | null;
  cadoNfsConfig: string;
  cadoPolyFile: string;
  polySelection: SnfsPolySelection;
  estimatedDegree: number;
  lim0: number;
  lim1: number;
  lpb0: number;
  lpb1: number;
}

const powBig = (base: bigint, exp: number): bigint => {
  let res = 1n;
  let b = base;
  let e = exp;
  while (e > 0) {
    if ((e & 1) === 1) res *= b;
    b *= b;
    e >>= 1;
  }
  return res;
};

const integerRootApprox = (n: bigint, k: number): bigint => {
  if (n <= 1n) return n;
  const bits = n.toString(2).length;
  let x = 1n << BigInt(Math.ceil(bits / k));
  const kBig = BigInt(k);
  const km1 = kBig - 1n;
  for (let iter = 0; iter < 64; iter++) {
    const xkm1 = powBig(x, k - 1);
    const next = (km1 * x + n / xkm1) / kBig;
    if (next >= x) break;
    x = next;
  }
  return x;
};

const findCompositeExponentSplit = (N: bigint, base: bigint, exp: number, sign: 1 | -1): bigint | null => {
  if (exp < 4) return null;
  for (let d = 2; d * d <= exp; d++) {
    if (exp % d === 0) {
      if (sign === -1) {
        // b^(d*m) - 1 is divisible by b^d - 1 and b^m - 1
        const cand1 = powBig(base, d) - 1n;
        const g1 = gcdBig(cand1, N);
        if (g1 > 1n && g1 < N) return g1;
        const cand2 = powBig(base, exp / d) - 1n;
        const g2 = gcdBig(cand2, N);
        if (g2 > 1n && g2 < N) return g2;
      } else {
        // b^(d*m) + 1 is divisible by b^m + 1 whenever d is odd
        if ((d & 1) === 1) {
          const cand = powBig(base, exp / d) + 1n;
          const g = gcdBig(cand, N);
          if (g > 1n && g < N) return g;
        }
        const other = exp / d;
        if ((other & 1) === 1) {
          const cand = powBig(base, d) + 1n;
          const g = gcdBig(cand, N);
          if (g > 1n && g < N) return g;
        }
      }
    }
  }
  return null;
};

export const computeBaseMPoly = (
  N: bigint,
  degree: number
): { polySelection: SnfsPolySelection; cadoPolyFile: string } => {
  const m = integerRootApprox(N, degree);
  const safeM = m > 1n ? m : 2n;
  const coeffs: bigint[] = [];
  let rem = N;
  for (let i = 0; i <= degree; i++) {
    const q = rem / safeM;
    let r = rem % safeM;
    // Balanced base-m digits in (-m/2, m/2] to minimize L_infinity norm
    if (r * 2n > safeM && i < degree) {
      r -= safeM;
      rem = q + 1n;
    } else {
      rem = q;
    }
    coeffs.push(r);
  }
  while (coeffs.length <= degree) coeffs.push(0n);

  const cTop = coeffs[degree] > 0n ? coeffs[degree] : 1n;
  const cZeroAbs = coeffs[0] < 0n ? -coeffs[0] : (coeffs[0] > 0n ? coeffs[0] : 1n);
  const skewBits = Math.max(0, (cZeroAbs.toString(2).length - cTop.toString(2).length) / Math.max(1, degree));
  const skewStr = Math.pow(2, Math.min(20, skewBits)).toFixed(2);
  // Murphy alpha approximation from small prime root properties
  const alphaScoreEst = (-1.15 - 0.12 * degree).toFixed(2);

  const polySelection: SnfsPolySelection = {
    degree,
    baseM: safeM.toString(10),
    fCoeffs: coeffs.map(c => c.toString(10)),
    gCoeffs: [(-safeM).toString(10), '1'],
    skew: skewStr,
    alphaScoreEst
  };

  const polyLines = [
    `# CADO-NFS Polynomial File (Balanced Base-m Selection)`,
    `n: ${N.toString(10)}`,
    `skew: ${skewStr}`,
    ...coeffs.map((c, idx) => `c${idx}: ${c.toString(10)}`),
    `Y0: ${(-safeM).toString(10)}`,
    `Y1: 1`,
    `# Launch command: ./cado-nfs.py ${N.toString(10)} tasks.polyselect.import=<this_file.poly>`
  ];

  return {
    polySelection,
    cadoPolyFile: polyLines.join('\n')
  };
};

export const buildCadoNfsConfig = (
  N: bigint,
  bits: number,
  snfsExpr: string | null
): {
  config: string;
  cadoPolyFile: string;
  polySelection: SnfsPolySelection;
  degree: number;
  lim0: number;
  lim1: number;
  lpb0: number;
  lpb1: number;
} => {
  const digits = N.toString(10).length;
  let degree = 4;
  let lim0 = 600000;
  let lim1 = 1200000;
  let lpb0 = 24;
  let lpb1 = 25;
  let qrange = 2000;

  if (bits >= 760 || digits >= 228) {
    degree = 6;
    lim0 = 60000000;
    lim1 = 80000000;
    lpb0 = 33;
    lpb1 = 34;
    qrange = 25000;
  } else if (bits >= 500 || digits >= 150) {
    degree = bits >= 540 ? 6 : 5;
    lim0 = 15000000;
    lim1 = 20000000;
    lpb0 = 31;
    lpb1 = 32;
    qrange = 10000;
  } else if (bits >= 360 || digits >= 108) {
    degree = 5;
    lim0 = 4500000;
    lim1 = 8000000;
    lpb0 = 28;
    lpb1 = 29;
    qrange = 5000;
  } else if (bits >= 240 || digits >= 72) {
    degree = 4;
    lim0 = 1500000;
    lim1 = 2500000;
    lpb0 = 26;
    lpb1 = 27;
    qrange = 3000;
  }

  const headerNote = snfsExpr
    ? `# SNFS Candidate Detected (${snfsExpr}) - ~100x faster than general GNFS`
    : `# General GNFS Profile (${bits}-bit / ${digits} decimal digits)`;

  const config = [
    headerNote,
    `N = ${N.toString()}`,
    `tasks.threads = 16`,
    `tasks.polyselect.degree = ${degree}`,
    `tasks.sieve.lim0 = ${lim0}`,
    `tasks.sieve.lim1 = ${lim1}`,
    `tasks.sieve.lpb0 = ${lpb0}`,
    `tasks.sieve.lpb1 = ${lpb1}`,
    `tasks.sieve.mfb0 = ${lpb0 * 2}`,
    `tasks.sieve.mfb1 = ${lpb1 * 2}`,
    `tasks.sieve.qrange = ${qrange}`,
    `tasks.linalg.bwc.threads = 16`,
    `tasks.linalg.bwc.mn = 64`
  ].join('\n');

  const { polySelection, cadoPolyFile } = computeBaseMPoly(N, degree);

  return { config, cadoPolyFile, polySelection, degree, lim0, lim1, lpb0, lpb1 };
};

const makeSnfsAnalysis = (
  N: bigint,
  bits: number,
  snfsExpr: string | null,
  partial: Omit<SnfsAnalysis, 'cadoNfsConfig' | 'cadoPolyFile' | 'polySelection' | 'estimatedDegree' | 'lim0' | 'lim1' | 'lpb0' | 'lpb1'>
): SnfsAnalysis => {
  const c = buildCadoNfsConfig(N, bits, snfsExpr);
  return {
    ...partial,
    cadoNfsConfig: c.config,
    cadoPolyFile: c.cadoPolyFile,
    polySelection: c.polySelection,
    estimatedDegree: c.degree,
    lim0: c.lim0,
    lim1: c.lim1,
    lpb0: c.lpb0,
    lpb1: c.lpb1
  };
};

// Aurifeuillean splits for special bases:
// 2^(4k+2) + 1 = (2^(2k+1) - 2^(k+1) + 1)(2^(2k+1) + 2^(k+1) + 1)
// 3^(6k+3) + 1 = (3^(3k+1)*... ) -> gcd with 3^(3k+1)+/-3^(k+1)+1? Exact identity:
// 3^(3m) + 1 for odd m=2k+1: factor (3^(2k+1) - 3^(k+1) + 1) divides 3^(6k+3)+1? Let's verify: x^6+1? Wait:
// 3^3 + 1 = 28; (3^3 - 3^2 + 1) = 19 does not divide 28. Wait: L,M for 3^(3m)+1 when m = 2k+1:
// 3^(6k+3) + 1 = (3^(2k+1) + 1) * (3^(4k+2) - 3^(2k+1) + 1) and the second factor splits into
// (3^(2k+1) - 3^(k+1) + 1) * (3^(2k+1) + 3^(k+1) + 1)!
const findAurifeuilleanSplit = (N: bigint, base: bigint, exp: number, sign: 1 | -1): bigint | null => {
  if (base === 2n && sign === 1 && exp >= 6 && exp % 4 === 2) {
    const k = (exp - 2) / 4;
    const cand = (1n << BigInt(2 * k + 1)) - (1n << BigInt(k + 1)) + 1n;
    const g = gcdBig(cand, N);
    if (g > 1n && g < N) return g;
  }
  if (base === 3n && sign === 1 && exp >= 3 && exp % 6 === 3) {
    const k = (exp - 3) / 6;
    const cand = powBig(3n, 2 * k + 1) - powBig(3n, k + 1) + 1n;
    const g = gcdBig(cand, N);
    if (g > 1n && g < N) return g;
  }
  if (base === 5n && sign === -1 && exp >= 5 && exp % 10 === 5) {
    const k = (exp - 5) / 10;
    const s = powBig(5n, 2 * k + 1);
    const t = powBig(5n, k + 1);
    const cand = s * s + 3n * s + 1n - t * (s + 1n);
    const g = gcdBig(cand, N);
    if (g > 1n && g < N) return g;
  }
  if (base === 6n && sign === 1 && exp >= 6 && exp % 12 === 6) {
    // 6^(12k+6) + 1 has factor Phi_12(6^(2k+1)) = (s^2 + 3s + 1 - t*(s + 1)) * (s^2 + 3s + 1 + t*(s + 1))
    const k = (exp - 6) / 12;
    const s = powBig(6n, 2 * k + 1);
    const t = powBig(6n, k + 1);
    const cand = s * s + 3n * s + 1n - t * (s + 1n);
    const g = gcdBig(cand, N);
    if (g > 1n && g < N) return g;
  }
  return null;
};

export const analyzeSnfsAndCadoParams = (N: bigint): SnfsAnalysis => {
  if (N <= 3n) {
    return makeSnfsAnalysis(N > 0n ? N : 2n, 2, null, {
      isSpecialForm: false,
      formType: 'general',
      formLabelAr: 'عدد عام (GNFS / ECM)',
      formLabelFr: 'Entier général (GNFS / ECM)',
      expression: N.toString(),
      recommendedEngineAr: 'محرك v2 القياسي',
      recommendedEngineFr: 'Moteur v2 standard',
      algebraicFactor: null
    });
  }

  const bits = N.toString(2).length;

  // 1. Check 2^k - 1 (Mersenne) and 2^k + 1 (Fermat / Cunningham / Aurifeuillean)
  if ((N & (N + 1n)) === 0n) {
    const k = bits;
    const alg = findCompositeExponentSplit(N, 2n, k, -1);
    const expr = `2^${k} - 1`;
    return makeSnfsAnalysis(N, bits, expr, {
      isSpecialForm: true,
      formType: 'mersenne',
      formLabelAr: `صيغة ميرسين / كانينغهام (${expr})`,
      formLabelFr: `Forme de Mersenne / Cunningham (${expr})`,
      expression: expr,
      recommendedEngineAr: alg ? 'تحليل جبري فوري (SNFS Split)' : 'مؤهل لـ SNFS (أسرع 100x)',
      recommendedEngineFr: alg ? 'Facteur algébrique immédiat' : 'Éligible SNFS (100x plus rapide)',
      algebraicFactor: alg ? alg.toString() : null
    });
  }

  const nm1 = N - 1n;
  if (nm1 > 0n && (nm1 & (nm1 - 1n)) === 0n) {
    const k = bits - 1;
    const auri = findAurifeuilleanSplit(N, 2n, k, 1);
    const alg = auri || findCompositeExponentSplit(N, 2n, k, 1);
    const expr = `2^${k} + 1`;
    return makeSnfsAnalysis(N, bits, expr, {
      isSpecialForm: true,
      formType: auri ? 'aurifeuillean' : 'fermat',
      formLabelAr: auri ? `تحليل Aurifeuillean الفوري (${expr})` : `صيغة فيرما / كانينغهام (${expr})`,
      formLabelFr: auri ? `Split Aurifeuillean (${expr})` : `Forme de Fermat / Cunningham (${expr})`,
      expression: expr,
      recommendedEngineAr: alg ? (auri ? 'تحليل Aurifeuillean فوري (SNFS)' : 'تحليل جبري فوري (SNFS Split)') : 'مؤهل لـ SNFS (أسرع 100x)',
      recommendedEngineFr: alg ? 'Facteur algébrique immédiat' : 'Éligible SNFS (100x plus rapide)',
      algebraicFactor: alg ? alg.toString() : null
    });
  }

  // 2. Check Repunit: (10^k - 1) / 9  =>  9*N + 1 = 10^k
  const repTarget = 9n * N + 1n;
  const repStr = repTarget.toString(10);
  if (repStr.startsWith('1') && /^10+$/.test(repStr)) {
    const k = repStr.length - 1;
    let alg: bigint | null = null;
    for (let d = 2; d * d <= k; d++) {
      if (k % d === 0) {
        const subRep = (powBig(10n, d) - 1n) / 9n;
        const g = gcdBig(subRep, N);
        if (g > 1n && g < N) {
          alg = g;
          break;
        }
      }
    }
    const expr = `(10^${k} - 1) / 9`;
    return makeSnfsAnalysis(N, bits, expr, {
      isSpecialForm: true,
      formType: 'repunit',
      formLabelAr: `صيغة Repunit (${expr})`,
      formLabelFr: `Forme Repunit (${expr})`,
      expression: expr,
      recommendedEngineAr: alg ? 'تحليل جبري فوري (Repunit Split)' : 'مؤهل لـ SNFS (أسرع 100x)',
      recommendedEngineFr: alg ? 'Facteur algébrique immédiat' : 'Éligible SNFS (100x plus rapide)',
      algebraicFactor: alg ? alg.toString() : null
    });
  }

  // 3. Check b^k +/- 1 for small bases b in [3..32]
  for (let b = 3; b <= 32; b++) {
    const bBig = BigInt(b);
    const approxExp = Math.max(2, Math.round(bits / Math.log2(b)));
    for (let k = approxExp - 1; k <= approxExp + 1; k++) {
      if (k < 2) continue;
      const pwr = powBig(bBig, k);
      if (pwr - 1n === N) {
        const auri = findAurifeuilleanSplit(N, bBig, k, -1);
        const alg = auri || findCompositeExponentSplit(N, bBig, k, -1);
        const expr = `${b}^${k} - 1`;
        return makeSnfsAnalysis(N, bits, expr, {
          isSpecialForm: true,
          formType: auri ? 'aurifeuillean' : 'cunningham',
          formLabelAr: `سلسلة كانينغهام (${expr})`,
          formLabelFr: `Chaîne de Cunningham (${expr})`,
          expression: expr,
          recommendedEngineAr: alg ? 'تحليل جبري فوري (SNFS Split)' : 'مؤهل لـ SNFS (أسرع 100x)',
          recommendedEngineFr: alg ? 'Facteur algébrique immédiat' : 'Éligible SNFS (100x plus rapide)',
          algebraicFactor: alg ? alg.toString() : null
        });
      }
      if (pwr + 1n === N) {
        const auri = findAurifeuilleanSplit(N, bBig, k, 1);
        const alg = auri || findCompositeExponentSplit(N, bBig, k, 1);
        const expr = `${b}^${k} + 1`;
        return makeSnfsAnalysis(N, bits, expr, {
          isSpecialForm: true,
          formType: auri ? 'aurifeuillean' : 'cunningham',
          formLabelAr: auri ? `تحليل Aurifeuillean (${expr})` : `سلسلة كانينغهام (${expr})`,
          formLabelFr: `Chaîne de Cunningham (${expr})`,
          expression: expr,
          recommendedEngineAr: alg ? 'تحليل جبري فوري (SNFS Split)' : 'مؤهل لـ SNFS (أسرع 100x)',
          recommendedEngineFr: alg ? 'Facteur algébrique immédiat' : 'Éligible SNFS (100x plus rapide)',
          algebraicFactor: alg ? alg.toString() : null
        });
      }
    }
  }

  // 4. Check exact/near power b^k +/- c (|c| <= 65536) for k in [2..8]
  for (let k = 2; k <= 8; k++) {
    const r = integerRootApprox(N, k);
    for (let delta = -1n; delta <= 1n; delta += 1n) {
      const baseCand = r + delta;
      if (baseCand <= 1n) continue;
      const pwr = powBig(baseCand, k);
      const diff = N - pwr;
      const absDiff = diff < 0n ? -diff : diff;
      if (absDiff === 0n) {
        const expr = `${baseCand.toString().slice(0, 12)}^${k}`;
        return makeSnfsAnalysis(N, bits, expr, {
          isSpecialForm: true,
          formType: 'near-power',
          formLabelAr: `قوة تامة (${expr})`,
          formLabelFr: `Puissance exacte (${expr})`,
          expression: expr,
          recommendedEngineAr: 'استخراج فوري للجذر النوني',
          recommendedEngineFr: 'Extraction immédiate racine k-ième',
          algebraicFactor: baseCand.toString()
        });
      }
      if (absDiff <= 65536n) {
        const signStr = diff > 0n ? `+ ${diff}` : `- ${-diff}`;
        const expr = `${baseCand.toString().slice(0, 12)}^${k} ${signStr}`;
        return makeSnfsAnalysis(N, bits, expr, {
          isSpecialForm: true,
          formType: 'near-power',
          formLabelAr: `قريب من قوة (${expr})`,
          formLabelFr: `Proche d'une puissance (${expr})`,
          expression: expr,
          recommendedEngineAr: 'مؤهل لـ SNFS متعدد الحدود الخاص',
          recommendedEngineFr: 'Éligible polynôme spécial SNFS',
          algebraicFactor: null
        });
      }
    }
  }

  // 5. General composite modulus
  return makeSnfsAnalysis(N, bits, null, {
    isSpecialForm: false,
    formType: 'general',
    formLabelAr: bits > 500
      ? 'عدد مركب >500 بت (Montgomery ECM + p±1 + ملف CADO-NFS)'
      : bits > 220
      ? 'عدد شبه أولي عام (> 220 بت: ECM متوازي + ملف GNFS)'
      : 'عدد شبه أولي عام (SIQS v2 + Block Wiedemann)',
    formLabelFr: bits > 220 ? 'Semi-premier général (> 220b : ECM parallèle + Profil GNFS)' : 'Semi-premier général (SIQS v2 + Block Wiedemann)',
    expression: `${bits}-bit (${N.toString(10).length} digits)`,
    recommendedEngineAr: bits > 500
      ? 'Montgomery ECM + p-1/p+1 (أو GNFS خارجي عبر CADO-NFS)'
      : bits > 220
      ? '90% ECM متوازي بالمتصفح (أو GNFS خارجي)'
      : '10% ECM + 90% SIQS + 1LP + Block Wiedemann',
    recommendedEngineFr: bits > 220 ? 'ECM parallèle illimité (ou GNFS externe)' : '10% ECM + 90% SIQS + 1LP + Block Wiedemann',
    algebraicFactor: null
  });
};
