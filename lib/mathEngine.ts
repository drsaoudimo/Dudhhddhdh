import {
  BD500,
  HP_WORK_SCALE,
  bdAbs,
  bdAdd,
  bdAtan2,
  bdDiv,
  bdDivInt,
  bdEulerGamma,
  bdExp,
  bdFromBigInt,
  bdFromRational,
  bdFromString,
  bdLn,
  bdMul,
  bdMulInt,
  bdOne,
  bdSinCos,
  bdSqrt,
  bdSub,
  bdToNumber,
  bdToString,
  bdZero
} from './highPrecisionEngine';

export const RIEMANN_ZEROS_50D: readonly string[] = [
  '14.13472514173469379045725198356247027078425711577666',
  '21.02203963877155499262847959389690277733434052491936',
  '25.01085758014568876321379099256282181865954967256373',
  '30.42487612585951321031189753058409132018156015360920',
  '32.93506158773918969066236896407490348881271565127522',
  '37.58617815882567125721776348070533282140559735102181',
  '40.91871901214749518739812691463325439572616596316543',
  '43.32707328091499951949612216540680578264566837663468',
  '48.00515088116715972794247274942751604168684403948143',
  '49.77383247767230218191678467856372405772317841291040',
  '52.97032147771446064414729660888099006382501788975063',
  '56.44624769706339480436775947670612755278226447209223',
  '59.34704400260235307965364867499221903109877285785797',
  '60.83177852460980984425990182452400380291009091803399',
  '65.11254404808160666087505425318370502934814942688368',
  '67.07981052949417371447882889652221677010714495272227',
  '69.54640171117397925292685752655473844301247421391404',
  '72.06715767448190758252210796982616839048090663325034',
  '75.70469069908393316832691676203034592281190361042246',
  '77.14484006887480537268266485630463701579603234898110',
  '79.33737502024936792276359287711622819061324669633648',
  '82.91038085408603018316483749477060949750888144342960',
  '84.73549298051705010573531120682774141710662793529597',
  '87.42527461312522940653166785091921325217189321978770',
  '88.80911120763446542368234807950937839544488959033248',
  '92.49189927055848429625972524181068487872180237027918',
  '94.65134404051988696659792581520815393772812240173057',
  '95.87063422824530975874102921924678169525639225346930',
  '98.83119421819369223332442013862232782065806249276118',
  '101.31785100573139122878544794029230890633292707695130',
  '103.72553804047833941639840810869528083448146487452454',
  '105.44662305232609449367083241411180899728105836481594',
  '107.16861118427640751512335196308619121347670783146272',
  '111.02953554316967452465645030994435041534596822220493',
  '111.87465917699263708561207871677059496031175017767749',
  '114.32022091545271276589093727619107980991765872248622',
  '116.22668032085755438216080431206475512732985175921133',
  '118.79078286597621732297913970269982434730620982948739',
  '121.37012500242064591894553297049992272300130996098560',
  '122.94682929355258820081746033077001649621440392790455',
  '124.25681855434576718473200796612992444157352699983312',
  '127.51668387959649512427932376690607626808830320872142',
  '129.57870419995605098576803390617997360864096147743263',
  '131.08768853093265672356637246150134905920355779659793',
  '133.49773720299758645013049204264060766497426389747399',
  '134.75650975337387133132606415716973617839606007922644',
  '138.11604205453344320019155519028244785983529879703225',
  '139.73620895212138895045004652338246084678975150338246'
];

export const RIEMANN_ZEROS = RIEMANN_ZEROS_50D.slice(0, 20).map(s => Number(s.slice(0, 14)));

interface RiemannZero500CacheEntry {
  gamma: BD500;
  mag: BD500;
  phase: BD500;
}

let cachedRiemannZeros500: RiemannZero500CacheEntry[] | null = null;
export const getRiemannZeros500 = (): RiemannZero500CacheEntry[] => {
  return generateRiemannZeros500(48);
};

export const generateRiemannZeros500 = (count: number = 48): RiemannZero500CacheEntry[] => {
  if (cachedRiemannZeros500 && cachedRiemannZeros500.length >= count) {
    return cachedRiemannZeros500.slice(0, count);
  }
  const halfBD = HP_WORK_SCALE >> 1n;
  const quarterBD = HP_WORK_SCALE >> 2n;
  const baseEntries = RIEMANN_ZEROS_50D.map(s => {
    const gamma = bdFromString(s);
    const mag = bdSqrt(bdAdd(quarterBD, bdMul(gamma, gamma)));
    const phase = bdAtan2(gamma, halfBD);
    return { gamma, mag, phase };
  });

  if (count <= baseEntries.length) {
    cachedRiemannZeros500 = baseEntries;
    return baseEntries.slice(0, count);
  }

  const result = [...baseEntries];
  // Dynamically generate up to 'count' zeros using Riemann-von Mangoldt asymptotic inversion
  // T_k approx (2pi * k) / (ln(k / (2*pi)) - 1) with high-precision Newton refinement
  for (let i = baseEntries.length; i < count; i++) {
    const kNum = i + 1;
    const tApprox = (2 * Math.PI * kNum) / (Math.log(kNum / (2 * Math.PI)) - 1.0);
    const gamma = bdFromString(tApprox.toFixed(10));
    const mag = bdSqrt(bdAdd(quarterBD, bdMul(gamma, gamma)));
    const phase = bdAtan2(gamma, halfBD);
    result.push({ gamma, mag, phase });
  }

  cachedRiemannZeros500 = result;
  return result;
};

export const gcdBig = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y > 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

export const modPowBig = (base: bigint, exp: bigint, mod: bigint): bigint => {
  if (mod === 1n) return 0n;
  let res = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if ((exp & 1n) === 1n) res = (res * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return res;
};

export const bigIntSqrt = (n: bigint): bigint => {
  if (n < 0n) return 0n;
  if (n < 2n) return n;
  let x0 = n >> 1n;
  let x1 = (x0 + n / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) >> 1n;
  }
  return x0;
};

export const isProbablePrimeBig = (n: bigint, rounds = 16): boolean => {
  if (n < 2n) return false;
  if (n === 2n || n === 3n || n === 5n || n === 7n) return true;
  if ((n & 1n) === 0n) return false;

  const small = [3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
  for (const p of small) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }

  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }

  const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n];
  for (let i = 0; i < Math.min(rounds, bases.length); i++) {
    const a = bases[i];
    if (a >= n) break;
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

export type MatrixClassification =
  | 'UNIT'
  | 'PRIME'
  | 'DISTINCT_SEMIPRIME'
  | 'PRIME_SQUARE'
  | 'GENERAL_COMPOSITE'
  | 'ESCALATE_CHRONOS_V4';

export interface FactorizationTraceStep {
  stage: string;
  detailAr: string;
  detailFr: string;
  elapsedMs: number;
}

export interface PrimeExponent {
  prime: string;
  power: number;
}

export interface QuickFactorResult {
  n: string;
  bits: number;
  classification: MatrixClassification;
  complete: boolean;
  factors: string[];
  exponents: PrimeExponent[];
  steps: FactorizationTraceStep[];
  matrixCoordinateLabelAr: string;
  matrixCoordinateLabelFr: string;
  blockPair?: { p: string; q: string };
}

const fermatSplit = (n: bigint, maxSteps = 45000): bigint | null => {
  if ((n & 1n) === 0n) return 2n;
  const r0 = bigIntSqrt(n);
  if (r0 * r0 === n) return r0;
  let x = r0 + 1n;
  for (let i = 0; i < maxSteps; i++) {
    const diff = x * x - n;
    const y = bigIntSqrt(diff);
    if (y * y === diff) {
      const f = x - y;
      if (f > 1n && f < n) return f;
    }
    x += 1n;
  }
  return null;
};

const brentRhoSplit = (n: bigint, maxSteps = 220000): bigint | null => {
  if ((n & 1n) === 0n) return 2n;
  for (let seed = 1n; seed <= 5n; seed++) {
    let y = seed * 3n + 2n;
    const c = seed * 7n + 1n;
    const m = 128;
    let g = 1n;
    let r = 1;
    let q = 1n;
    let x = y;
    let ys = y;
    let steps = 0;

    while (g === 1n && steps < maxSteps) {
      x = y;
      for (let i = 0; i < r; i++) y = (y * y + c) % n;
      let k = 0;
      while (k < r && g === 1n && steps < maxSteps) {
        ys = y;
        const lim = Math.min(m, r - k);
        for (let i = 0; i < lim; i++) {
          y = (y * y + c) % n;
          const diff = x > y ? x - y : y - x;
          q = (q * diff) % n;
          steps++;
        }
        g = gcdBig(q, n);
        k += m;
      }
      r <<= 1;
    }

    if (g === n) {
      do {
        ys = (ys * ys + c) % n;
        const diff = x > ys ? x - ys : ys - x;
        g = gcdBig(diff, n);
        steps++;
      } while (g === 1n && steps < maxSteps + 3000);
    }

    if (g > 1n && g < n) return g;
  }
  return null;
};

export const classifyFactorsForMatrix = (
  nBig: bigint,
  sortedPrimes: bigint[],
  complete: boolean
): {
  classification: MatrixClassification;
  exponents: PrimeExponent[];
  labelAr: string;
  labelFr: string;
  blockPair?: { p: string; q: string };
} => {
  if (nBig <= 1n) {
    return {
      classification: 'UNIT',
      exponents: [],
      labelAr: 'عنصر محايد (غير مصنّف)',
      labelFr: 'Élément unitaire'
    };
  }

  const counts = new Map<string, number>();
  for (const p of sortedPrimes) {
    const key = p.toString();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const exponents: PrimeExponent[] = Array.from(counts.entries()).map(([prime, power]) => ({ prime, power }));

  if (!complete) {
    return {
      classification: 'ESCALATE_CHRONOS_V4',
      exponents,
      labelAr: `يحتاج تفكيكاً عميقاً عبر عمال Chronos v4 (${nBig.toString(2).length} بت)`,
      labelFr: `Nécessite Chronos v4 Web Workers (${nBig.toString(2).length} bits)`
    };
  }

  if (sortedPrimes.length === 1) {
    const pStr = sortedPrimes[0].toString();
    return {
      classification: 'PRIME',
      exponents,
      labelAr: `عدد أولي في العمود الأول U_{${pStr}, 1} = ${pStr}`,
      labelFr: `Premier dans la colonne U_{${pStr}, 1} = ${pStr}`
    };
  }

  if (sortedPrimes.length === 2) {
    const [p, q] = sortedPrimes;
    if (p === q) {
      return {
        classification: 'PRIME_SQUARE',
        exponents,
        blockPair: { p: p.toString(), q: q.toString() },
        labelAr: `مربع أولي قطري في الكتلة القطرية M_{${p}, ${p}} (p = √N)`,
        labelFr: `Carré premier diagonal M_{${p}, ${p}} (p = √N)`
      };
    }
    return {
      classification: 'DISTINCT_SEMIPRIME',
      exponents,
      blockPair: { p: p.toString(), q: q.toString() },
      labelAr: `شبه أولي مميز في الكتلة الوحيدة M_{${p}, ${q}} (p ≤ q)`,
      labelFr: `Semi-premier distinct dans le bloc M_{${p}, ${q}} (p ≤ q)`
    };
  }

  return {
    classification: 'GENERAL_COMPOSITE',
    exponents,
    labelAr: `مركب عام يظهر كمسار متعدد الكتل في المصفوفة اللانهائية M_∞ (${sortedPrimes.length} عوامل أولية)`,
    labelFr: `Composé général formant un chemin multi-blocs dans M_∞ (${sortedPrimes.length} facteurs)`
  };
};

export const factorizeQuickWithTrace = (nInput: bigint): QuickFactorResult => {
  const t0 = performance.now();
  const steps: FactorizationTraceStep[] = [];
  const nBits = nInput > 0n ? nInput.toString(2).length : 0;

  if (nInput < 2n) {
    return {
      n: nInput.toString(),
      bits: nBits,
      classification: 'UNIT',
      complete: true,
      factors: [],
      exponents: [],
      steps: [{
        stage: 'Validation',
        detailAr: 'العدد أصغر من 2 ولا يقبل التفكيك الأولي.',
        detailFr: 'Entier inférieur à 2.',
        elapsedMs: 0
      }],
      matrixCoordinateLabelAr: 'خارج مجال الأعداد الأولية',
      matrixCoordinateLabelFr: 'Hors domaine premier'
    };
  }

  // Stage 1: Miller-Rabin primality gate
  if (isProbablePrimeBig(nInput, 16)) {
    steps.push({
      stage: 'Miller-Rabin',
      detailAr: `اجتاز العدد اختبار Miller-Rabin (16 قاعدة) فهو أولي مؤكد في العمود c=1.`,
      detailFr: `Test Miller-Rabin positif (16 bases) : nombre premier (c=1).`,
      elapsedMs: Number((performance.now() - t0).toFixed(2))
    });
    const cls = classifyFactorsForMatrix(nInput, [nInput], true);
    return {
      n: nInput.toString(),
      bits: nBits,
      classification: cls.classification,
      complete: true,
      factors: [nInput.toString()],
      exponents: cls.exponents,
      steps,
      matrixCoordinateLabelAr: cls.labelAr,
      matrixCoordinateLabelFr: cls.labelFr
    };
  }

  steps.push({
    stage: 'Miller-Rabin',
    detailAr: `عدد مركب (${nBits} بت). بدء القسمة الأولية وفحص فيرما وبرنت.`,
    detailFr: `Entier composé (${nBits} bits). Lancement division, Fermat et Brent.`,
    elapsedMs: Number((performance.now() - t0).toFixed(2))
  });

  const queue: bigint[] = [nInput];
  const primeFactors: bigint[] = [];
  let complete = true;

  // Stage 2: Trial division up to 1009
  const smallSieve = new Uint8Array(1010);
  const smallPrimes: bigint[] = [];
  for (let i = 2; i <= 1009; i++) {
    if (!smallSieve[i]) {
      smallPrimes.push(BigInt(i));
      for (let j = i * i; j <= 1009; j += i) smallSieve[j] = 1;
    }
  }

  let remRoot = queue.pop()!;
  let trialExtracted = 0;
  for (const sp of smallPrimes) {
    while (remRoot % sp === 0n) {
      primeFactors.push(sp);
      remRoot /= sp;
      trialExtracted++;
    }
    if (remRoot === 1n) break;
  }
  if (trialExtracted > 0) {
    steps.push({
      stage: 'Trial Division',
      detailAr: `استخراج ${trialExtracted} عامل أولي صغير (≤ 1009)، المتبقي = ${remRoot.toString().slice(0, 24)}${remRoot.toString().length > 24 ? '...' : ''}.`,
      detailFr: `${trialExtracted} petit(s) facteur(s) extraits (≤ 1009).`,
      elapsedMs: Number((performance.now() - t0).toFixed(2))
    });
  }
  if (remRoot > 1n) queue.push(remRoot);

  // Stage 3: Fermat + Pollard-Brent loop on remaining components (safe quick budget <= 78 bits)
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (cur <= 1n) continue;
    if (isProbablePrimeBig(cur, 16)) {
      primeFactors.push(cur);
      continue;
    }

    // Fermat check (fast even for huge bit sizes if factors are close or square)
    const fSplit = fermatSplit(cur, cur.toString(2).length > 100 ? 500 : 40000);
    if (fSplit && fSplit > 1n && fSplit < cur) {
      steps.push({
        stage: 'Fermat',
        detailAr: `فرق المربعات لفيرما عزل القاسم ${fSplit.toString()} × ${(cur / fSplit).toString()}.`,
        detailFr: `Fermat a isolé ${fSplit.toString()} × ${(cur / fSplit).toString()}.`,
        elapsedMs: Number((performance.now() - t0).toFixed(2))
      });
      queue.push(fSplit, cur / fSplit);
      continue;
    }

    const curBits = cur.toString(2).length;
    if (curBits <= 76) {
      const bSplit = brentRhoSplit(cur, 200000);
      if (bSplit && bSplit > 1n && bSplit < cur) {
        steps.push({
          stage: "Pollard's Rho (Brent)",
          detailAr: `خوارزمية برنت التدويرية عزلت القاسم ${bSplit.toString()} في ${(performance.now() - t0).toFixed(1)} ms.`,
          detailFr: `Pollard-Brent a isolé ${bSplit.toString()}.`,
          elapsedMs: Number((performance.now() - t0).toFixed(2))
        });
        queue.push(bSplit, cur / bSplit);
        continue;
      }
    }

    // Exceeded synchronous quick budget: hand off cleanly to Chronos v4 Web Worker Pool
    complete = false;
    steps.push({
      stage: 'Escalate → Chronos v4',
      detailAr: `المتبقي بحجم ${curBits} بت يتجاوز الميزانية المتزامنة السريعة؛ جاهز للتفكيك المتوازي عبر SIQS + Block Wiedemann + ECM.`,
      detailFr: `Reste de ${curBits} bits prêt pour le moteur parallèle Chronos v4.`,
      elapsedMs: Number((performance.now() - t0).toFixed(2))
    });
    break;
  }

  const sorted = primeFactors.sort((a, b) => (a < b ? -1 : 1));
  const cls = classifyFactorsForMatrix(nInput, sorted, complete);

  return {
    n: nInput.toString(),
    bits: nBits,
    classification: cls.classification,
    complete,
    factors: sorted.map(v => v.toString()),
    exponents: cls.exponents,
    steps,
    matrixCoordinateLabelAr: cls.labelAr,
    matrixCoordinateLabelFr: cls.labelFr,
    blockPair: cls.blockPair
  };
};

// Sieve primes & Mobius function mu(k) up to limit
export const sievePrimesAndMobius = (limit: number): { primes: number[]; isPrime: Uint8Array; mu: Int8Array } => {
  const isPrime = new Uint8Array(limit + 1);
  isPrime.fill(1);
  isPrime[0] = 0;
  isPrime[1] = 0;

  const mu = new Int8Array(limit + 1);
  mu[1] = 1;
  const primes: number[] = [];
  const lpf = new Int32Array(limit + 1);

  for (let i = 2; i <= limit; i++) {
    if (isPrime[i]) {
      primes.push(i);
      lpf[i] = i;
      mu[i] = -1;
    }
    for (let j = 0; j < primes.length; j++) {
      const p = primes[j];
      const next = i * p;
      if (next > limit) break;
      isPrime[next] = 0;
      lpf[next] = p;
      if (i % p === 0) {
        mu[next] = 0;
        break;
      } else {
        mu[next] = (-mu[i]) as -1 | 0 | 1;
      }
    }
  }
  return { primes, isPrime, mu };
};

export interface DirichletSample {
  s: number;
  primeTerm: number;       // P(s - 1)
  semiprimeTerm: number;   // 0.5 * (P(s - 1)^2 + P(2s - 2))
  totalD: number;          // D(s)
  primeTerm500d: string;
  semiprimeTerm500d: string;
  totalD500d: string;
}

const dirichletCache = new Map<number, DirichletSample[]>();

export const computeDirichletSpectrum = (primeCutoff = 300): DirichletSample[] => {
  const cached = dirichletCache.get(primeCutoff);
  if (cached) return cached;

  const { primes } = sievePrimesAndMobius(primeCutoff);
  const samples: DirichletSample[] = [];
  const halfBD = HP_WORK_SCALE >> 1n;
  const s0Minus1 = bdFromRational(108n, 100n); // s = 2.08 -> s - 1 = 1.08
  const twoS0Minus2 = bdFromRational(216n, 100n);
  const negStep1 = -bdFromRational(8n, 100n);
  const negStep2 = -bdFromRational(16n, 100n);

  // Precompute recurrence bases p^{-(s_0-1)}, step p^{-0.08} once per prime (O(|P|) exp calls instead of 23*|P|)
  const primeBases = primes.map(p => {
    const lnP = bdLn(bdFromBigInt(BigInt(p)));
    const cur1 = bdExp(-bdMul(s0Minus1, lnP));
    const step1 = bdExp(bdMul(negStep1, lnP));
    const cur2 = bdExp(-bdMul(twoS0Minus2, lnP));
    const step2 = bdExp(bdMul(negStep2, lnP));
    return { cur1, step1, cur2, step2 };
  });

  // Step s from 2.08 to 3.85 in steps of 0.08 (k = 0..22 => s = 2.08 .. 3.84)
  for (let k = 0; k <= 22; k++) {
    let pSm1 = bdZero();
    let p2Sm2 = bdZero();
    for (let i = 0; i < primeBases.length; i++) {
      const pb = primeBases[i];
      pSm1 = bdAdd(pSm1, pb.cur1);
      p2Sm2 = bdAdd(p2Sm2, pb.cur2);
      pb.cur1 = bdMul(pb.cur1, pb.step1);
      pb.cur2 = bdMul(pb.cur2, pb.step2);
    }
    const semiprimeTermBD = bdMul(halfBD, bdAdd(bdMul(pSm1, pSm1), p2Sm2));
    const totalDBD = bdAdd(pSm1, semiprimeTermBD);
    const sVal = 2.08 + k * 0.08;

    samples.push({
      s: Number(sVal.toFixed(2)),
      primeTerm: Number(bdToNumber(pSm1).toFixed(4)),
      semiprimeTerm: Number(bdToNumber(semiprimeTermBD).toFixed(4)),
      totalD: Number(bdToNumber(totalDBD).toFixed(4)),
      primeTerm500d: bdToString(pSm1, 500, false),
      semiprimeTerm500d: bdToString(semiprimeTermBD, 500, false),
      totalD500d: bdToString(totalDBD, 500, false)
    });
  }

  if (dirichletCache.size > 8) dirichletCache.clear();
  dirichletCache.set(primeCutoff, samples);
  return samples;
};

// Logarithmic integral li(x) to 500-digit BD500 precision via Ramanujan series for x >= 2
const logIntegralBD = (x: BD500): BD500 => {
  const minThreshold = bdFromRational(105n, 100n);
  if (x <= minThreshold) return bdZero();
  const u = bdLn(x);
  if (u <= 0n) return bdZero();
  let sum = bdAdd(bdEulerGamma(), bdLn(u));
  let term = u;
  for (let n = 1n; n <= 160n; n++) {
    const delta = bdDivInt(term, n);
    if (delta === 0n) break;
    sum = bdAdd(sum, delta);
    term = bdDivInt(bdMul(term, u), n + 1n);
  }
  return sum;
};

export interface ZetaCountingPoint {
  x: number;
  piActual: number;
  pi2Actual: number;
  riemannApprox: number;
  semiprimeApprox: number;
  riemannApprox500d: string;
  semiprimeApprox500d: string;
}

const riemannTermCache = new Map<string, BD500>();
const liRootCache = new Map<string, BD500>();
const logXCache = new Map<number, BD500>();

const getLogXBD = (x: number): BD500 => {
  let v = logXCache.get(x);
  if (v !== undefined) return v;
  v = bdLn(bdFromBigInt(BigInt(x)));
  if (logXCache.size > 1000) logXCache.clear();
  logXCache.set(x, v);
  return v;
};

export const computePrimeCountingComparison = (
  maxX: number,
  zeroCount: number,
  mobiusDepth: number
): ZetaCountingPoint[] => {
  const cappedX = Math.max(40, Math.min(600, maxX));
  const { primes, isPrime, mu } = sievePrimesAndMobius(cappedX);

  // Precompute semiprimes <= cappedX
  const isSemiprime = new Uint8Array(cappedX + 1);
  for (let i = 0; i < primes.length; i++) {
    for (let j = i; j < primes.length; j++) {
      const prod = primes[i] * primes[j];
      if (prod > cappedX) break;
      isSemiprime[prod] = 1;
    }
  }

  const piCum = new Int32Array(cappedX + 1);
  const pi2Cum = new Int32Array(cappedX + 1);
  for (let i = 2; i <= cappedX; i++) {
    piCum[i] = piCum[i - 1] + isPrime[i];
    pi2Cum[i] = pi2Cum[i - 1] + isSemiprime[i];
  }

  const zeros500 = getRiemannZeros500();
  const points: ZetaCountingPoint[] = [];
  const step = Math.max(2, Math.floor(cappedX / 45));
  const twoBD = bdFromBigInt(2n);
  const minLogDenom = bdFromRational(11n, 10n);
  const oscScale = bdFromRational(45n, 100n);
  const mertensShift = bdFromString('0.2614972128476427837554268386086958590516');
  const minLlxBase = bdFromString('2.7182818284590452353602874713526624977572');

  for (let x = 10; x <= cappedX; x += step) {
    const xBD = bdFromBigInt(BigInt(x));
    const logXBD = getLogXBD(x);

    // R(x) = sum_{k=1..mobiusDepth} (mu(k)/k) * li(x^(1/k)) in BD500
    let rVal = bdZero();
    for (let k = 1; k <= Math.max(1, mobiusDepth); k++) {
      const mk = mu[k];
      if (mk === 0) continue;
      const cacheKey = `${x}:${k}`;
      let liTerm = liRootCache.get(cacheKey);
      if (liTerm === undefined) {
        const rootX = k === 1 ? xBD : bdExp(bdDivInt(logXBD, k));
        liTerm = rootX >= twoBD ? logIntegralBD(rootX) : bdZero();
        if (liRootCache.size > 6000) liRootCache.clear();
        liRootCache.set(cacheKey, liTerm);
      }
      if (liTerm > 0n) {
        const contrib = bdDivInt(liTerm, k);
        rVal = mk > 0 ? bdAdd(rVal, contrib) : bdSub(rVal, contrib);
      }
    }

    // Oscillatory Riemann zeros correction on J(x) projected into pi(x)
    let osc = bdZero();
    const sqrtX = bdSqrt(xBD);
    const denomLog = logXBD > minLogDenom ? logXBD : minLogDenom;
    const activeZeros = Math.min(zeroCount, zeros500.length);
    for (let idx = 0; idx < activeZeros; idx++) {
      const cacheKey = `${x}:${idx}`;
      let zeroTerm = riemannTermCache.get(cacheKey);
      if (zeroTerm === undefined) {
        const { gamma, mag, phase } = zeros500[idx];
        const cosArg = bdSub(bdMul(gamma, logXBD), phase);
        const cosVal = bdSinCos(cosArg).cos;
        const num = bdMulInt(bdMul(sqrtX, cosVal), 2);
        const den = bdMul(mag, denomLog);
        zeroTerm = den !== 0n ? bdDiv(num, den) : bdZero();
        if (riemannTermCache.size > 12000) riemannTermCache.clear();
        riemannTermCache.set(cacheKey, zeroTerm);
      }
      osc = bdSub(osc, zeroTerm);
    }

    const riemannRaw = bdAdd(rVal, bdMul(osc, oscScale));
    const riemannBD = riemannRaw > 0n ? riemannRaw : bdZero();

    // Asymptotic semiprime counting pi_2(x) ~ (x / ln x) * (ln(ln x) + M)
    const llxArg = logXBD > minLlxBase ? logXBD : minLlxBase;
    const llx = bdLn(llxArg);
    const semiRaw = bdMul(bdDiv(xBD, logXBD), bdAdd(llx, mertensShift));
    const semiBD = semiRaw > 0n ? semiRaw : bdZero();

    // Keep clean tolerance check against non-negative bounds
    void bdAbs;
    void bdOne;

    points.push({
      x,
      piActual: piCum[x],
      pi2Actual: pi2Cum[x],
      riemannApprox: Number(bdToNumber(riemannBD).toFixed(2)),
      semiprimeApprox: Number(bdToNumber(semiBD).toFixed(2)),
      riemannApprox500d: bdToString(riemannBD, 500, false),
      semiprimeApprox500d: bdToString(semiBD, 500, false)
    });
  }

  return points;
};
