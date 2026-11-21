export type Language = 'ar' | 'fr';

export interface Translations {
  appTitle: string;
  appSubtitle: string;
  langName: string;
  switchLang: string;
  
  // Navigation / Tabs
  tabUnboundedQS: string;
  tabHybrid: string;
  tabZeta: string;
  tabSimulator: string;
  tabAnalyzer: string;
  tabKnowledge: string;

  // Key selector
  keySizeLabel: string;
  customNLabel: string;
  customNPlaceholder: string;
  importPemLabel: string;
  importPemPlaceholder: string;
  generateKeyBtn: string;
  applyCustomN: string;
  importPemBtn: string;
  closeBtn: string;
  bitsLabel: string;
  
  // Strategy selector
  strategyLabel: string;
  stratUnboundedQSTitle: string;
  stratUnboundedQSDesc: string;
  stratHybridTitle: string;
  stratHybridDesc: string;
  stratZetaTitle: string;
  stratZetaDesc: string;
  stratMMFRTitle: string;
  stratMMFRDesc: string;
  stratGleeokTitle: string;
  stratGleeokDesc: string;
  stratEcmTitle: string;
  stratEcmDesc: string;
  stratPollardTitle: string;
  stratPollardDesc: string;
  stratAlgebraicTitle: string;
  stratAlgebraicDesc: string;

  // Actions
  startAttack: string;
  stopAttack: string;
  resetBtn: string;
  copyBtn: string;
  copiedNotice: string;

  // Simulation Status
  statusIdle: string;
  statusRunning: string;
  statusSuccess: string;
  statusFailed: string;
  elapsedTime: string;
  opsRate: string;
  stepsCount: string;
  cpuLabel: string;

  // Results
  factorizationSuccess: string;
  factorP: string;
  factorQ: string;
  proofTitle: string;
  proofValid: string;
  proofInvalid: string;
  methodUsed: string;
  executionDuration: string;

  // Mathematical Analyzer
  analyzerTitle: string;
  analyzerSubtitle: string;
  mathFormulaTitle: string;
  mathFormulaDesc: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  spectralScanTitle: string;
  activeMultiplier: string;
  congruenceTestTitle: string;
  verificationHeader: string;
  targetModulus: string;
  squareRootApprox: string;

  // Hybrid Dashboard Strings
  hybridDashboardTitle: string;
  hybridDashboardSubtitle: string;
  hybridSection1Title: string;
  hybridSection2Title: string;
  hybridSection3Title: string;
  hybridSection4Title: string;
  entropyLabel: string;
  stabilityLabel: string;
  bitDensityLabel: string;
  convergenceLabel: string;
  qualityIndexLabel: string;
  multiplierPriority: string;
  curveAddsLabel: string;
  modMulsLabel: string;
  stage1Name: string;
  stage2Name: string;
  stage3Name: string;
  currentStageLabel: string;

  // Continuous Unbounded QS Dashboard
  qsDashboardTitle: string;
  qsDashboardSubtitle: string;
  primeUnitsTitle: string;
  primeUnitsDesc: string;
  cycleCountLabel: string;
  currentLaneLabel: string;
  laneATitle: string;
  laneBTitle: string;
  laneCTitle: string;
  modularLiftsTitle: string;
  henselDepthTitle: string;
  newtonRate: string;
  decadicDigits: string;
  instantGcdCheck: string;
  maxNLimitLabel: string;
  henselSpeedLabel: string;
  liftStartLabel: string;
  liftMaxLabel: string;
  autoHalfN: string;

  // Chronos v2 Hybrid (SIQS + 1LP + Block Wiedemann + SNFS)
  tabChronos196: string;
  stratChronosTitle: string;
  stratChronosDesc: string;
  chronosDashboardTitle: string;
  chronosDashboardSubtitle: string;
  suyamaSectionTitle: string;
  suyamaTorsion12: string;
  suyamaStage1Label: string;
  suyamaStage2Label: string;
  smoothRelationsFound: string;
  activeSuyamaCurve: string;
  curvesCompleted: string;
  workerPoolTitle: string;
  workerCountLabel: string;
  autoScaledWorkers: string;
  activeWorkersCount: string;
  throughputLabel: string;
  parallelEcmStages: string;
  gf2MatrixTitle: string;
  gf2MatrixSubtitle: string;
  gf2RelationsProgress: string;
  gf2FactorBaseSize: string;
  gf2SolvesAttempted: string;
  gf2BatchRate: string;
  lpPartialsLabel: string;
  lpCollisionsLabel: string;
  wiedemannKrylovLabel: string;
  snfsDetectorTitle: string;
  cadoExporterTitle: string;
  copyCadoConfigBtn: string;
  roleEcmLabel: string;
  roleSiqsLabel: string;

  // v4 Safe FALLBACK_MEDIAN_PRIOR & Empirical Benchmark
  v4FallbackTitle: string;
  v4FallbackSubtitle: string;
  sieveModeLabel: string;
  sieveModeV4Btn: string;
  sieveModeVanillaBtn: string;
  tRejectedLabel: string;
  empiricalBenchTitle: string;
  empiricalSpeedupLabel: string;
  relPerSecLabel: string;

  // Knowledge Base
  kbTitle: string;
  kbOverview: string;
  kbWhy128Hard: string;
  kbWhy128HardText: string;
  kbInnovationTitle: string;
  kbInnovationText: string;
  kbMathEquations: string;
}

export const translations: Record<Language, Translations> = {
  ar: {
    appTitle: "مختبر تحليل التشفير وعوامل RSA",
    appSubtitle: "نظام الرنين الهجين ثلاثي المراحل (Gleeok-MMFR) للأعداد > 128 بت",
    langName: "العربية",
    switchLang: "Passer au Français",

    tabUnboundedQS: "المنخل التربيعي وتقليص mod 10⁶ (غير محدود)",
    tabHybrid: "لوحة التحكم الهجينة (Gleeok-MMFR)",
    tabZeta: "رنين زيتا الطيفي (Zeta Zeros)",
    tabSimulator: "محاكي التحليل المباشر",
    tabAnalyzer: "المحلل الرياضي التفاعلي",
    tabKnowledge: "الموسوعة والنظرية الرياضية",

    keySizeLabel: "حجم المفتاح (بت)",
    customNLabel: "إدخال معامل مخصص (N)",
    customNPlaceholder: "أدخل عدد مركب N بأي حجم (مثال: > 128 بت حتى 1024 بت)",
    importPemLabel: "استيراد مفتاح RSA (PEM)",
    importPemPlaceholder: "-----BEGIN RSA PUBLIC KEY-----\n...",
    generateKeyBtn: "توليد مفتاح RSA جديد",
    applyCustomN: "تطبيق المعامل",
    importPemBtn: "استيراد المفتاح",
    closeBtn: "إلغاء",
    bitsLabel: "بت",

    strategyLabel: "الخوارزمية الرياضية",
    stratUnboundedQSTitle: "المنخل التربيعي المستمر وتقليص mod 10⁶ (غير محدود)",
    stratUnboundedQSDesc: "محرك تنافسي مستمر بلا حدود يدمج نظرية استرجاع آحاد العوامل مع المنخل التربيعي المهيكل ومنحنيات مونتغمري المتصاعدة",
    stratHybridTitle: "رنين هجين مع غليووك (Gleeok-MMFR)",
    stratHybridDesc: "نظام هجين ثلاثي المراحل: توجيه المضاعفات ببصمة الإنتروبيا والتباديل + مسح البواقي + منحنيات مونتغمري",
    stratZetaTitle: "أصفار دالة زيتا لريمان (Zeta Spectral Resonance - حتى 1024 بت)",
    stratZetaDesc: "صيغة ريمان الصريحة وموجات الرنين التوافقية لأصفار زيتا غير التافهة لاستخراج القواسم والعوامل لأي عدد ضخم",
    stratMMFRTitle: "الرنين متعدد المضاعفات (MMFR)",
    stratMMFRDesc: "ابتكار رياضي جديد للأعداد > 128 بت يدمج رنين ليمان مع فحص المربعات والـ ECM المسرع",
    stratGleeokTitle: "مصفوفة غليووك الجبرية (Gleeok)",
    stratGleeokDesc: "تحويلات جبرية على الشبكات والتباديل العشوائية",
    stratEcmTitle: "منحنيات إهليلجية (ECM)",
    stratEcmDesc: "طريقة لينسترا باستخدام ضرب النقاط على منحنيات إهليلجية عشوائية",
    stratPollardTitle: "بولارد رو (Pollard's Rho)",
    stratPollardDesc: "خوارزمية البحث عن الدورات في فضاء الاحتمالات لمفارقة أعياد الميلاد",
    stratAlgebraicTitle: "محددات المصفوفات المتعددة",
    stratAlgebraicDesc: "فحص القواسم المشتركة عبر محددات مصفوفات التشويش الجبري",

    startAttack: "بدء التحليل الهجين",
    stopAttack: "إيقاف العملية",
    resetBtn: "إعادة تعيين",
    copyBtn: "نسخ",
    copiedNotice: "تم النسخ بنجاح!",

    statusIdle: "جاهز لبدء التحليل",
    statusRunning: "جاري الحساب والتنقيب الرياضي...",
    statusSuccess: "تم العثور على العوامل الأولية بنجاح!",
    statusFailed: "توقفت العملية دون العثور على قاسم",
    elapsedTime: "الوقت المستغرق",
    opsRate: "سرعة الفحص",
    stepsCount: "الخطوات المنجزة",
    cpuLabel: "نشاط النواة",

    factorizationSuccess: "تم تفكيك المعامل N وإيجاد القواسم p و q!",
    factorP: "العامل الأولي الأول (p)",
    factorQ: "العامل الأولي الثاني (q)",
    proofTitle: "البرهان والتحقق الرياضي",
    proofValid: "صحيح ومطابق: p × q = N بدقة متناهية",
    proofInvalid: "غير متطابق مع المعامل",
    methodUsed: "الخوارزمية المستخدمة",
    executionDuration: "مدة التنفيذ الإجمالية",

    analyzerTitle: "المحلل الرياضي المفصل (خطوة بخطوة)",
    analyzerSubtitle: "تتبع مسار اشتقاق المتطابقات التربيعية ورنين المضاعفات المعيارية",
    mathFormulaTitle: "المتطابقة الرياضية الأساسية",
    mathFormulaDesc: "البحث عن أزواج الأعداد الصحيحة (t, r) التي تحقق المتطابقة: t² - 4kN = r²، مما يتيح التفكيك: (t - r)(t + r) = 4kN ومن ثم gcd(t - r, N) = p.",
    step1Title: "1. المسح الطيفي للمضاعفات (k)",
    step1Desc: "اختبار متتالية من المضاعفات الفردية k لتقريب المسافة الجبرية بين قواسم 4kN.",
    step2Title: "2. تقريب الجذر الصحيح السريع",
    step2Desc: "حساب s = ⌈√(4kN)⌉ باستخدام خوارزمية نيوتن-رافسون للأعداد الضخمة (BigInt Newton-Raphson).",
    step3Title: "3. اختبار البواقي ومطابقة المربعات التامة",
    step3Desc: "فحص ما إذا كان R(t) = t² - 4kN مربعاً كاملاً مع استبعاد 85% من غير المربعات عبر الفحص السريع mod 64.",
    spectralScanTitle: "مؤشر الرنين للمضاعف النشط",
    activeMultiplier: "المضاعف الحالي k",
    congruenceTestTitle: "جدول التطابقات والبواقي الأخيرة",
    verificationHeader: "الإثبات الجبري للمعامل المستهدف",
    targetModulus: "المعامل المستهدف N",
    squareRootApprox: "الجذر التربيعي التقريبي ⌊√N⌋",

    hybridDashboardTitle: "مركز القيادة الموحد للخوارزمية الهجينة (Gleeok-MMFR)",
    hybridDashboardSubtitle: "تكامل مباشر بين الرنين الطيفي وبصمة التباديل الهيكلية لغليووك ومحرك المنحنيات",
    hybridSection1Title: "1. رنين المضاعفات الموجهة بالأولوية",
    hybridSection2Title: "2. البصمة الهيكلية وإنتروبيا Gleeok",
    hybridSection3Title: "3. محرك منحنيات مونتغمري الإهليلجية",
    hybridSection4Title: "4. مراقب الأداء والنشاط الحسابي",
    entropyLabel: "مؤشر الإنتروبيا",
    stabilityLabel: "معامل الاستقرار",
    bitDensityLabel: "كثافة البتات",
    convergenceLabel: "معدل التقارب",
    qualityIndexLabel: "مؤشر الجودة الكلي",
    multiplierPriority: "أولوية المضاعف",
    curveAddsLabel: "عمليات جمع المنحنيات",
    modMulsLabel: "الضرب المعياري",
    stage1Name: "المرحلة 1: البصمة الهيكلية لـ Gleeok",
    stage2Name: "المرحلة 2: مسح رنين ليمان-فيرما الموجه",
    stage3Name: "المرحلة 3: منحنيات مونتغمري ذات الأولوية القصوى",
    currentStageLabel: "المرحلة النشطة الحالية",

    qsDashboardTitle: "محرك المنخل التربيعي المهيكل وتقليص mod 10⁶ (غير محدود)",
    qsDashboardSubtitle: "بحث تنافسي متعدد المسارات يدمج نظرية استرجاع آحاد العوامل مع المنخل التربيعي ومنحنيات مونتغمري",
    primeUnitsTitle: "نظرية استرجاع آحاد العوامل (Prime Units Reconstruction)",
    primeUnitsDesc: "تحديد آحاد العوامل الأولية p و q من خانة آحاد N mod 10 والامتداد المعياري حتى mod 10⁶",
    cycleCountLabel: "حلقة البحث التنافسي المستمر",
    currentLaneLabel: "المسار التنافسي النشط",
    laneATitle: "المسار A: استرجاع الآحاد (Hensel Lift mod 10⁶)",
    laneBTitle: "المسار B: المنخل التربيعي ورنين المضاعفات (QS)",
    laneCTitle: "المسار C: منحنيات مونتغمري المتصاعدة (ECM)",
    modularLiftsTitle: "فروع الرفع المعياري المجهزة",
    henselDepthTitle: "عمق الرفع العشاري التكيفي (Hensel Lift mod 10ⁿ)",
    newtonRate: "معدل تقارب نيوتن التربيعي (O(log n) Doubling)",
    decadicDigits: "الخانات العشرية المستخرجة لحظياً",
    instantGcdCheck: "فحص القاسم المشترك اللحظي (Instant GCD)",
    maxNLimitLabel: "أقصى حد (نصف طول N بالخانات)",
    henselSpeedLabel: "سرعة الحسابات المعكوسة لنيوتن",
    liftStartLabel: "بداية من (الرفع المعياري المبدئي)",
    liftMaxLabel: "أقصى حد (نصف طول N بالخانات)",
    autoHalfN: "تلقائي: نصف طول N بالخانات الكاملة",

    tabChronos196: "محرك Chronos v2 الهجين (SIQS + Wiedemann + SNFS)",
    stratChronosTitle: "خوارزمية Chronos v2 (SIQS + 1LP + Block Wiedemann + ECM)",
    stratChronosDesc: "محرك هجين متطور يجمع منخل SIQS ذي التهيئة الذاتية مع علاقات العامل الأولي الكبير 1LP وحل Block Wiedemann النادر وتوزيع 10% ECM / 90% SIQS",
    chronosDashboardTitle: "مركز قيادة Chronos v2 الهجين للأعداد الكبيرة",
    chronosDashboardSubtitle: "منخل SIQS اللوغاريتمي مع دمج 1LP وحل Block Wiedemann O(k²) وكاشف الأشكال الخاصة SNFS",
    suyamaSectionTitle: "1. وحدة استطلاع سوياما التوائية (10% ECM Farm)",
    suyamaTorsion12: "زمرة التواء Z/12Z مع إيقاف مبكر للمرحلة الأولى (Early Abort) لاصطياد العوامل < 10³⁵",
    suyamaStage1Label: "المرحلة الأولى (B₁ Scalar Multiplication)",
    suyamaStage2Label: "المرحلة الثانية (BSGS Polynomial Steps [B₁, B₂])",
    smoothRelationsFound: "العلاقات الكاملة المدمجة",
    activeSuyamaCurve: "منحنى سوياما النشط",
    curvesCompleted: "المنحنيات المنجزة",
    workerPoolTitle: "توزيع خيوط المعالجة المتخصصة (10% ECM · 90% SIQS)",
    workerCountLabel: "عدد خيوط المعالجة المتزامنة",
    autoScaledWorkers: "تكيفي حسب حجم البتات (SIQS ≤220b · ECM غير محدود >220b)",
    activeWorkersCount: "خيوط نشطة",
    throughputLabel: "معدل الإنجاز المتوازي",
    parallelEcmStages: "تقسيم صارم للأدوار دون هدر حسابي (تم إزالة CFRAC)",
    gf2MatrixTitle: "منخل SIQS اللوغاريتمي وحل Block Wiedemann النادر",
    gf2MatrixSubtitle: "غربلة Uint8Array مع Batch GCD ودمج تصادمات 1LP وحل المصفوفة النادرة عبر Krylov + Berlekamp–Massey",
    gf2RelationsProgress: "العلاقات الصالحة / المطلوبة",
    gf2FactorBaseSize: "قاعدة QR المفلترة (Legendre = +1)",
    gf2SolvesAttempted: "تمريرات Block Wiedemann",
    gf2BatchRate: "O(k²) ذاكرة خطية NNZ",
    lpPartialsLabel: "علاقات جزئية مخزنة (1LP)",
    lpCollisionsLabel: "علاقات كاملة من تصادم 1LP",
    wiedemannKrylovLabel: "أبعاد المصفوفة النادرة / خطوات Krylov",
    snfsDetectorTitle: "كاشف الصيغ الخاصة SNFS ومولد إعدادات Cado-NFS",
    cadoExporterTitle: "ملف بارامترات Cado-NFS المحسوب تلقائياً",
    copyCadoConfigBtn: "نسخ إعدادات Cado-NFS",
    roleEcmLabel: "ECM-Suyama (10%)",
    roleSiqsLabel: "SIQS Siever (90%)",

    v4FallbackTitle: "مُخصِّص v4 الآمن (FALLBACK_MEDIAN_PRIOR) وتدقيق رفض المصفوفة T",
    v4FallbackSubtitle: "توجيه نوافذ SIQS عبر وسيط الصفوف s_i وأولوية الإشارة النظيفة M_corrected[2] مع رفض T غير المستقرة (الهدف: تسريع تجريبي 1.5× – 2.2×)",
    sieveModeLabel: "وضع تخصيص الغربال",
    sieveModeV4Btn: "v4 الموزون (s_i × p_j)",
    sieveModeVanillaBtn: "المرجع الأساسي (Vanilla)",
    tRejectedLabel: "رفض المصفوفة T (Overfitting)",
    empiricalBenchTitle: "مقياس التسريع التجريبي (Baseline مقابل v4)",
    empiricalSpeedupLabel: "نسبة التسريع المقاسة",
    relPerSecLabel: "معدل العلاقات / ثانية",

    kbTitle: "الموسوعة العلمية: تحليل الأعداد الكبيرة",
    kbOverview: "نظرة عامة على أمان خوارزمية RSA وعوامل الأعداد المركبة",
    kbWhy128Hard: "لماذا يُعتبر تحليل الأعداد الأكبر من 128 بت صعباً للغاية؟",
    kbWhy128HardText: "العدد المكون من 128 بت يمتلك قيمة تتجاوز 3.4 × 10³⁸. إذا استخدمنا طريقة القسمة التجريبية التقليدية، فإن جذر هذا العدد يتطلب فحص حوالي 1.8 × 10¹⁹ عدداً أولياً، وهو ما يستغرق مئات السنين على أقوى المعالجات! لذلك يلزم ابتكار طرق رياضية ذكية تتجاوز المسح الخطي.",
    kbInnovationTitle: "طريقتنا الهجينة الجديدة: Gleeok-MMFR",
    kbInnovationText: "تبتكر هذه الطريقة دمجاً ذكياً ثلاثي المراحل: تقوم خوارزمية Gleeok بتحليل بنية بتات N وحساب الإنتروبيا والتباديل لترتيب المضاعفات k حسب أعلى رنين متوقع، ثم تنشط شبكة فحص المتطابقات التربيعية وتراكم البواقي، وصولاً إلى منحنيات مونتغمري المسقطة للأعداد المعقدة.",
    kbMathEquations: "المعادلات الرياضية والاشتقاق الجبري الكامل"
  },
  fr: {
    appTitle: "Laboratoire de Factorisation & Cryptographie RSA",
    appSubtitle: "Système Hybride Tri-Phasé (Gleeok-MMFR) pour Entiers > 128 bits",
    langName: "Français",
    switchLang: "التبديل إلى العربية",

    tabUnboundedQS: "Crible QS & Mod 10⁶ (Sans Limites)",
    tabHybrid: "Tableau de Bord Hybride (Gleeok-MMFR)",
    tabZeta: "Résonance Zêta (Zéros de Zêta)",
    tabSimulator: "Simulateur en Temps Réel",
    tabAnalyzer: "Analyseur Mathématique Interactif",
    tabKnowledge: "Théorie & Encyclopédie",

    keySizeLabel: "Taille de clé (bits)",
    customNLabel: "Entrer un module personnalisé (N)",
    customNPlaceholder: "Entrez un entier composé N (ex: > 128 bits jusqu'à 1024 bits)",
    importPemLabel: "Importer une clé RSA (PEM)",
    importPemPlaceholder: "-----BEGIN RSA PUBLIC KEY-----\n...",
    generateKeyBtn: "Générer une nouvelle clé RSA",
    applyCustomN: "Appliquer le module N",
    importPemBtn: "Importer la clé",
    closeBtn: "Fermer",
    bitsLabel: "bits",

    strategyLabel: "Méthode Mathématique",
    stratUnboundedQSTitle: "Crible QS Continu & mod 10⁶ (Sans Limites)",
    stratUnboundedQSDesc: "Moteur compétitif continu multi-voies combinant la reconstruction des unités premières avec le crible quadratique structuré et ECM infini",
    stratHybridTitle: "Hybride Gleeok-MMFR",
    stratHybridDesc: "Système tri-phasé : orientation des multiplicateurs par entropie Gleeok + crible de résidus + courbes de Montgomery",
    stratZetaTitle: "Zéros de la Fonction Zêta de Riemann (jusqu'à 1024 bits)",
    stratZetaDesc: "Formule explicite de Riemann et résonance spectrale harmonique des zéros non triviaux pour factoriser tout grand entier",
    stratMMFRTitle: "Résonance Multi-Multiplicateurs (MMFR)",
    stratMMFRDesc: "Méthode novatrice pour > 128 bits combinant résonance spectrale de Lehman, crible quadratique et ECM accéléré",
    stratGleeokTitle: "Matrice Algébrique Gleeok",
    stratGleeokDesc: "Transformations algébriques sur réseaux et permutations pseudo-aléatoires",
    stratEcmTitle: "Courbes Elliptiques (ECM)",
    stratEcmDesc: "Factorisation de Lenstra via multiplication projective sur courbes de Montgomery",
    stratPollardTitle: "Pollard Rho",
    stratPollardDesc: "Détection de cycles dans l'espace des congruences par paradoxe des anniversaires",
    stratAlgebraicTitle: "Déterminants Matriciels",
    stratAlgebraicDesc: "Recherche de diviseurs communs par déterminants de matrices perturbées",

    startAttack: "Lancer la Factorisation Hybride",
    stopAttack: "Arrêter l'opération",
    resetBtn: "Réinitialiser",
    copyBtn: "Copier",
    copiedNotice: "Copié avec succès !",

    statusIdle: "Prêt pour le calcul",
    statusRunning: "Calcul mathématique en cours...",
    statusSuccess: "Facteurs premiers identifiés avec succès !",
    statusFailed: "Processus interrompu sans facteur trouvé",
    elapsedTime: "Temps écoulé",
    opsRate: "Vitesse de test",
    stepsCount: "Étapes effectuées",
    cpuLabel: "Activité Thread",

    factorizationSuccess: "Module N factorisé avec succès : facteurs p et q trouvés !",
    factorP: "Premier facteur (p)",
    factorQ: "Deuxième facteur (q)",
    proofTitle: "Vérification & Preuve Mathématique",
    proofValid: "Égalité vérifiée : p × q = N sans erreur résiduelle",
    proofInvalid: "Produit non conforme au module",
    methodUsed: "Méthode appliquée",
    executionDuration: "Durée d'exécution totale",

    analyzerTitle: "Analyseur Mathématique Pas à Pas",
    analyzerSubtitle: "Traçabilité des congruences quadratiques et résonance des multiplicateurs",
    mathFormulaTitle: "Fondement Algébrique : Différence de Carrés",
    mathFormulaDesc: "Recherche de couples d'entiers (t, r) satisfaisant t² - 4kN = r², permettant la décomposition (t - r)(t + r) = 4kN, d'où pgcd(t - r, N) = p.",
    step1Title: "1. Balayage Spectral des Multiplicateurs (k)",
    step1Desc: "Test d'une série de multiplicateurs impairs k pour rapprocher la distance algébrique entre facteurs de 4kN.",
    step2Title: "2. Approximation de Racine Entière Rapide",
    step2Desc: "Calcul de s = ⌈√(4kN)⌉ via l'algorithme de Newton-Raphson pour BigInt en O(log bits).",
    step3Title: "3. Test des Carrés & Filtrage Modulaire",
    step3Desc: "Vérification si R(t) = t² - 4kN est un carré parfait, avec rejet immédiat de 85% des non-carrés via mod 64.",
    spectralScanTitle: "Indicateur de Résonance du Multiplicateur k",
    activeMultiplier: "Multiplicateur Actif k",
    congruenceTestTitle: "Tableau des Dernières Congruences & Résidus",
    verificationHeader: "Preuve Algébrique du Module Cible",
    targetModulus: "Module Cible N",
    squareRootApprox: "Racine Carrée Entière ⌊√N⌋",

    hybridDashboardTitle: "Centre de Commande Hybride (Gleeok-MMFR)",
    hybridDashboardSubtitle: "Synergie en temps réel entre résonance spectrale, empreinte structurelle Gleeok et courbes elliptiques",
    hybridSection1Title: "1. Résonance des Multiplicateurs Priorisés",
    hybridSection2Title: "2. Empreinte Structurelle & Entropie Gleeok",
    hybridSection3Title: "3. Moteur de Courbes Projectives de Montgomery",
    hybridSection4Title: "4. Moniteur d'Activité & Performance CPU",
    entropyLabel: "Indice d'Entropie",
    stabilityLabel: "Stabilité Structurelle",
    bitDensityLabel: "Densité de Bits",
    convergenceLabel: "Taux de Convergence",
    qualityIndexLabel: "Score Global de Qualité",
    multiplierPriority: "Priorité du multiplicateur",
    curveAddsLabel: "Additions de Courbes",
    modMulsLabel: "Multiplications Modulaires",
    stage1Name: "Phase 1 : Empreinte structurelle Gleeok",
    stage2Name: "Phase 2 : Crible spectral guidé de Lehman-Fermat",
    stage3Name: "Phase 3 : Hyper-courbes projectives de Montgomery",
    currentStageLabel: "Phase active actuelle",

    qsDashboardTitle: "Crible Quadratique Structuré & Réduction mod 10⁶ (Sans Limites)",
    qsDashboardSubtitle: "Recherche compétitive continue multi-voies combinant la reconstruction d'unités avec le crible quadratique et ECM",
    primeUnitsTitle: "Théorie de Reconstruction des Unités Premières (Prime Units)",
    primeUnitsDesc: "Identification des unités de p et q depuis N mod 10 et extension modulaire jusqu'à mod 10⁶",
    cycleCountLabel: "Cycle de Recherche Compétitive Continue",
    currentLaneLabel: "Voie Compétitive Active",
    laneATitle: "Voie A : Élévation modulaire (Hensel Lift mod 10⁶)",
    laneBTitle: "Voie B : Crible Quadratique & Résidus (QS)",
    laneCTitle: "Voie C : Hyper-courbes de Montgomery (ECM)",
    modularLiftsTitle: "Branches d'élévation modulaire actives",
    henselDepthTitle: "Profondeur de Levée 10-adique Adaptative (mod 10ⁿ)",
    newtonRate: "Taux de Convergence Quadratique de Newton O(log n)",
    decadicDigits: "Chiffres Décadiques Extraits en Temps Réel",
    instantGcdCheck: "Test GCD Instantané",
    maxNLimitLabel: "Limite Maximale (Moitié de la taille de N)",
    henselSpeedLabel: "Vitesse d'Inversion Newtonienne",
    liftStartLabel: "Commencer à (Élévation modulaire initiale)",
    liftMaxLabel: "Limite max (Moitié de la taille de N)",
    autoHalfN: "Auto : Moitié complète des chiffres de N",

    tabChronos196: "Moteur Chronos v2 (SIQS + Wiedemann + SNFS)",
    stratChronosTitle: "Algorithme Chronos v2 (SIQS + 1LP + Block Wiedemann)",
    stratChronosDesc: "Moteur hybride v2 : crible SIQS auto-initialisé, variation 1-Grand-Premier (1LP), solveur creux Block Wiedemann et ferme spécialisée 10% ECM / 90% SIQS",
    chronosDashboardTitle: "Centre de Commande Chronos v2 pour Grands Modules",
    chronosDashboardSubtitle: "Crible logarithmique SIQS, appariement 1LP, algèbre linéaire creuse O(k²) et détecteur SNFS",
    suyamaSectionTitle: "1. Unité de Reconnaissance Suyama ECM (10% Ferme)",
    suyamaTorsion12: "Torsion Z/12Z prouvée avec arrêt anticipé Stage 1 pour facteurs asymétriques < 10³⁵",
    suyamaStage1Label: "Étape 1 (Multiplication scalaire B₁)",
    suyamaStage2Label: "Étape 2 (Pas de bébé / Pas de géant BSGS [B₁, B₂])",
    smoothRelationsFound: "Relations complètes fusionnées",
    activeSuyamaCurve: "Courbe de Suyama active",
    curvesCompleted: "Courbes achevées",
    workerPoolTitle: "Pool de Threads Spécialisés (10% ECM · 90% SIQS)",
    workerCountLabel: "Nombre de threads simultanés",
    autoScaledWorkers: "Adaptatif par taille (SIQS ≤220b · ECM illimité >220b)",
    activeWorkersCount: "threads actifs",
    throughputLabel: "Débit parallèle",
    parallelEcmStages: "Allocation stricte des rôles sans gaspillage (CFRAC supprimé)",
    gf2MatrixTitle: "Crible Logarithmique SIQS & Solveur Creux Block Wiedemann",
    gf2MatrixSubtitle: "Soustraction Uint8Array + Batch GCD + Collisions 1LP + Krylov-Berlekamp-Massey en GF(2)",
    gf2RelationsProgress: "Relations valides / Requises",
    gf2FactorBaseSize: "Base QR filtrée (Legendre = +1)",
    gf2SolvesAttempted: "Passes Block Wiedemann",
    gf2BatchRate: "Complexité O(k²) · Mémoire NNZ",
    lpPartialsLabel: "Partielles stockées (1LP)",
    lpCollisionsLabel: "Collisions 1LP résolues",
    wiedemannKrylovLabel: "Noyau creux / Étapes Krylov",
    snfsDetectorTitle: "Détecteur de Forme Spéciale SNFS & Export Cado-NFS",
    cadoExporterTitle: "Profil de Paramètres Cado-NFS Calculé",
    copyCadoConfigBtn: "Copier Config Cado-NFS",
    roleEcmLabel: "ECM-Suyama (10%)",
    roleSiqsLabel: "Crible SIQS (90%)",

    v4FallbackTitle: "Allocateur Sûr v4 (FALLBACK_MEDIAN_PRIOR) & Audit de Rejet T",
    v4FallbackSubtitle: "Pondération SIQS par médiane s_i et prior propre M_corrected[2] avec rejet strict de T (gain attendu : 1.5× – 2.2×)",
    sieveModeLabel: "Mode d'Allocation du Crible",
    sieveModeV4Btn: "v4 Pondéré (s_i × p_j)",
    sieveModeVanillaBtn: "Référence Uniforme (Vanilla)",
    tRejectedLabel: "Matrice T Rejetée (Surapprentissage)",
    empiricalBenchTitle: "Comparateur Empirique (Vanilla vs v4)",
    empiricalSpeedupLabel: "Accélération Mesurée",
    relPerSecLabel: "Relations / seconde",

    kbTitle: "Encyclopédie : Factorisation des Grands Entiers",
    kbOverview: "Sécurité du cryptosystème RSA et décomposition des entiers composites",
    kbWhy128Hard: "Pourquoi la factorisation au-delà de 128 bits est-elle si complexe ?",
    kbWhy128HardText: "Un entier de 128 bits dépasse 3,4 × 10³⁸. Sa racine carrée avoisine 1,8 × 10¹⁹. Une division naïve par force brute nécessiterait des centaines d'années de calcul même sur supercalculateur ! Il est donc indispensable d'exploiter la structure algébrique des congruences.",
    kbInnovationTitle: "Notre Méthode Hybride : Gleeok-MMFR",
    kbInnovationText: "Cette méthode introduit un moteur tri-phasé : Gleeok analyse l'empreinte structurelle et l'entropie des bits pour ordonner intelligemment les multiplicateurs spectraux k, optimisant la découverte de résidus carrés et déclenchant les courbes de Montgomery si nécessaire.",
    kbMathEquations: "Équations Mathématiques & Dérivation Formelle"
  }
};
