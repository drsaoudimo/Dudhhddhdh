export interface Zf18AcceptanceVector {
  id: string;
  titleAr: string;
  N: string;
  p0: string;
  X: string;
  beta: number;
  epsilon: number;
  lattice_m: number;
  lattice_t: number;
  expectedStatus: string[];
  verifyExpectedP?: string;
  verifyExpectedQ?: string;
  descriptionAr: string;
}

export interface Zf19AcceptanceVector {
  id: string;
  titleAr: string;
  N: string;
  factorBaseBound: number;
  expectedStatus: string[];
  verifyExpectedP?: string;
  verifyExpectedQ?: string;
  descriptionAr: string;
}

export interface StagedLevelVector {
  stage: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  labelAr: string;
  bits: number;
  N: string;
  p0?: string;
  X?: string;
  beta?: number;
  latticeM?: number;
  latticeT?: number;
  cfracBound?: number;
  supportsCfrac: boolean;
  supportsCoppersmith: boolean;
  dynamicHintPct?: number;
  notesAr: string;
}

export const STAGED_BENCHMARK_LEVELS: StagedLevelVector[] = [
  {
    stage: 'A',
    labelAr: 'المرحلة A (≤ 32 بت · 27 بت)',
    bits: 27,
    N: '100160063', // verified: 10007 * 10009
    p0: '9984',
    X: '64',
    beta: 0.5,
    latticeM: 3,
    latticeT: 3,
    cfracBound: 220,
    supportsCfrac: true,
    supportsCoppersmith: true,
    notesAr: 'مقارنة كاملة بين ZF-19 (CFRAC) و ZF-18 (LLL) و QS البسيط.'
  },
  {
    stage: 'B',
    labelAr: 'المرحلة B (~56 بت)',
    bits: 56,
    N: '44291863309790189', // verified: 254628713 * 173946853
    p0: '254627840', // delta = 873 < 2048
    X: '2048',
    beta: 0.5,
    latticeM: 3,
    latticeT: 3,
    cfracBound: 950,
    supportsCfrac: true,
    supportsCoppersmith: true,
    notesAr: 'قياس نمو قاعدة العوامل والزمن المتوسط/IQR في CFRAC مقابل LLL.'
  },
  {
    stage: 'C',
    labelAr: 'المرحلة C (~79 بت)',
    bits: 79,
    N: '400273313887401365229001', // verified: 556849901009 * 718817248889
    p0: '556849889280', // (556849901009 >> 14) << 14, delta = 11729 < 16384
    X: '16384',
    beta: 0.5,
    latticeM: 3,
    latticeT: 3,
    cfracBound: 4500,
    supportsCfrac: true,
    supportsCoppersmith: true,
    notesAr: 'اختبار ضغط CFRAC قبل سقف الـ 100 بت ومقارنته مع الغربال التربيعي.'
  },
  {
    stage: 'D',
    labelAr: 'المرحلة D (256 بت · تلميح 60%)',
    bits: 256,
    N: '',
    beta: 0.5,
    latticeM: 3,
    latticeT: 3,
    supportsCfrac: false,
    supportsCoppersmith: true,
    dynamicHintPct: 60,
    notesAr: 'توليد مفتاح 256 بت + تلميح 60% من البتات العليا عبر ZF-18 (خارج نطاق CFRAC الفوري).'
  },
  {
    stage: 'E',
    labelAr: 'المرحلة E (500 بت · تلميح 60%)',
    bits: 500,
    N: '',
    beta: 0.5,
    latticeM: 3,
    latticeT: 3,
    supportsCfrac: false,
    supportsCoppersmith: true,
    dynamicHintPct: 60,
    notesAr: 'هدف 500 بت الرسمي: هجوم Coppersmith-LLL يستخرج x0 في أجزاء من الثانية.'
  },
  {
    stage: 'F',
    labelAr: 'المرحلة F (1024 بت · تلميح 60%)',
    bits: 1024,
    N: '',
    beta: 0.5,
    latticeM: 3,
    latticeT: 3,
    supportsCfrac: false,
    supportsCoppersmith: true,
    dynamicHintPct: 60,
    notesAr: 'هدف 1024 بت الرسمي: شبيكة Howgrave-Graham بأبعاد 7×7 وحساب BigInt دقيق.'
  }
];


export const ZF18_ACCEPTANCE_VECTORS: Zf18AcceptanceVector[] = [
  {
    id: 'ZF18-T1',
    titleAr: 'اختبار عدد صغير صحيح التلميح',
    N: '1022117',
    p0: '1008',
    X: '16',
    beta: 0.5,
    epsilon: 0.02,
    lattice_m: 2,
    lattice_t: 2,
    expectedStatus: ['FACTORS_VERIFIED'],
    verifyExpectedP: '1009',
    verifyExpectedQ: '1013',
    descriptionAr: 'N = 1009 × 1013، مع p0 = 1008 و |x| < 16 لاستخراج x0 = 1.'
  },
  {
    id: 'ZF18-T2',
    titleAr: 'اختبار عدد متوسط بتغيير العامل المجهول',
    N: '100160063',
    p0: '9984',
    X: '64',
    beta: 0.5,
    epsilon: 0.02,
    lattice_m: 3,
    lattice_t: 3,
    expectedStatus: ['FACTORS_VERIFIED'],
    verifyExpectedP: '10007',
    verifyExpectedQ: '10009',
    descriptionAr: 'N = 10007 × 10009، قناع البتات العليا p0 = 9984 (x0 = 23 < 64) دون تسريب العامل.'
  },
  {
    id: 'ZF18-T3',
    titleAr: 'رفض تلميح غير كافٍ (فوق الحد النظري)',
    N: '100160063',
    p0: '8192',
    X: '4096',
    beta: 0.5,
    epsilon: 0.02,
    lattice_m: 2,
    lattice_t: 2,
    expectedStatus: ['INSUFFICIENT_HINT', 'ROOT_NOT_FOUND'],
    descriptionAr: 'X = 4096 > N^0.25 ≈ 100: يجب رفض الحالة كـ INSUFFICIENT_HINT أو ROOT_NOT_FOUND وليس PRIME.'
  },
  {
    id: 'ZF18-T4',
    titleAr: 'رفض تلميح خاطئ (p0 بعيد عن p)',
    N: '1022117',
    p0: '900',
    X: '16',
    beta: 0.5,
    epsilon: 0.02,
    lattice_m: 2,
    lattice_t: 2,
    expectedStatus: ['ROOT_NOT_FOUND', 'INVALID_CANDIDATE'],
    descriptionAr: 'p0 = 900 مع |x| < 16 لا يضم العامل 1009؛ يجب عدم قبول أي مرشح زائف.'
  },
  {
    id: 'ZF18-T5',
    titleAr: 'اختبار عوامل غير متوازنة (β < 0.5)',
    N: '10493027', // 1009 * 10399 -> p ≈ N^0.427 < 0.5
    p0: '992',
    X: '32',
    beta: 0.42,
    epsilon: 0.02,
    lattice_m: 3,
    lattice_t: 3,
    expectedStatus: ['FACTORS_VERIFIED', 'INSUFFICIENT_HINT', 'ROOT_NOT_FOUND'],
    verifyExpectedP: '1009',
    verifyExpectedQ: '10399',
    descriptionAr: 'N = 1009 × 10399 (β ≈ 0.427) لقياس أثر انخفاض β على حد الجذر N^(β²).'
  }
];

export const ZF19_ACCEPTANCE_VECTORS: Zf19AcceptanceVector[] = [
  {
    id: 'ZF19-T1',
    titleAr: 'التفكيك القياسي للعدد 8,051',
    N: '8051',
    factorBaseBound: 45,
    expectedStatus: ['FACTORS_VERIFIED'],
    verifyExpectedP: '83',
    verifyExpectedQ: '97',
    descriptionAr: 'N = 83 × 97: التحقق من توسع √N، الهوية الجبرية، جمع العلاقات، وحل GF(2).'
  },
  {
    id: 'ZF19-T2',
    titleAr: 'التدقيق اليدوي للعدد 10,403',
    N: '10403',
    factorBaseBound: 55,
    expectedStatus: ['FACTORS_VERIFIED'],
    verifyExpectedP: '101',
    verifyExpectedQ: '103',
    descriptionAr: 'N = 101 × 103: عدد مضبوط لتدقيق متجهات الأسس وإشارة (-1)^(k+1)Q_(k+1).'
  },
  {
    id: 'ZF19-T3',
    titleAr: 'اختبار توسيع Factor Base على 100,160,063',
    N: '100160063',
    factorBaseBound: 220,
    expectedStatus: ['FACTORS_VERIFIED'],
    verifyExpectedP: '10007',
    verifyExpectedQ: '10009',
    descriptionAr: 'N = 10007 × 10009: قياس نمو قاعدة العوامل وعدد التبعيات.'
  },
  {
    id: 'ZF19-T4',
    titleAr: 'التعرف المسبق على المربع الكامل 10,201',
    N: '10201',
    factorBaseBound: 45,
    expectedStatus: ['PERFECT_SQUARE'],
    verifyExpectedP: '101',
    verifyExpectedQ: '101',
    descriptionAr: 'N = 101²: يجب إرجاع PERFECT_SQUARE قبل تشغيل توسع الكسور المستمرة.'
  },
  {
    id: 'ZF19-T5',
    titleAr: 'عدم إعلان عوامل زائفة للعدد الأولي 7,919',
    N: '7919',
    factorBaseBound: 45,
    expectedStatus: ['NO_FACTOR_FOUND'],
    descriptionAr: 'عدد أولي: يرجع NO_FACTOR_FOUND دون تحويلها لإثبات أولية داخل CFRAC.'
  }
];

