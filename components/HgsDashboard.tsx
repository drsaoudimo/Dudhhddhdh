import React, { useState } from 'react';
import MathFormula from './MathFormula';
import { Language, Translations } from '../translations';
import { bigIntSqrt } from '../mathUtils';

export interface HgsRelationItem {
  index: number;
  x: string;
  X: string;
  Q: string;
  exponents: number[];
}

export interface HgsTreeNode {
  value: string;
  bits?: number;
  isPrime?: boolean;
  role?: string;
  left?: HgsTreeNode;
  right?: HgsTreeNode;
}

export interface HgsCongruenceData {
  X: string;
  Y: string;
  diff: string;
  g1: string;
  g2: string;
  factor1: string;
  factor2: string;
  duration?: number;
}

export interface HgsTraceState {
  stage: 'idle' | 'presieve' | 'building_fb' | 'sieving' | 'linear_algebra' | 'congruence' | 'success' | 'failed';
  stageMessage?: string;
  factorBase: number[];
  factorBaseSize: number;
  polynomial: string;
  smoothCount: number;
  targetSmooth: number;
  scannedCount: number;
  skippedCount: number;
  relations: HgsRelationItem[];
  matrixPreview: number[][];
  matrixDimensions?: { rows: number; cols: number; dependencies: number };
  congruence: HgsCongruenceData | null;
  factorTree: HgsTreeNode | null;
  duration?: number;
}

interface HgsDashboardProps {
  nValue: string;
  lang: Language;
  t: Translations;
  trace: HgsTraceState | null;
  isRunning: boolean;
  onLaunchHgs: (targetN?: string) => void;
  onStopHgs: () => void;
}

export const HgsDashboard: React.FC<HgsDashboardProps> = ({
  nValue,
  lang,
  t,
  trace,
  isRunning,
  onLaunchHgs,
  onStopHgs
}) => {
  const isRTL = lang === 'ar';
  const [copiedP, setCopiedP] = useState(false);
  const [copiedQ, setCopiedQ] = useState(false);

  let nBig = 0n;
  let nBits = 0;
  let sqrtN = 0n;

  try {
    const clean = nValue.replace(/[^0-9]/g, '');
    if (clean) {
      nBig = BigInt(clean);
      nBits = nBig.toString(2).length;
      sqrtN = bigIntSqrt(nBig);
    }
  } catch {}

  const copyToClipboard = (text: string, type: 'p' | 'q') => {
    navigator.clipboard.writeText(text);
    if (type === 'p') {
      setCopiedP(true);
      setTimeout(() => setCopiedP(false), 2000);
    } else {
      setCopiedQ(true);
      setTimeout(() => setCopiedQ(false), 2000);
    }
  };

  const getStageBadgeLabel = (stage?: string) => {
    switch (stage) {
      case 'presieve':
        return isRTL ? 'الفحص التمهيدي والأولية' : 'Pré-crible & primalité';
      case 'building_fb':
        return isRTL ? 'بناء قاعدة العوامل (Legendre)' : 'Base de facteurs (Legendre)';
      case 'sieving':
        return isRTL ? 'غربلة الكتل والمجالات' : 'Crible par blocs & plages';
      case 'linear_algebra':
        return isRTL ? 'حل مصفوفة F₂ الجبرية' : 'Résolution F₂ matricielle';
      case 'congruence':
        return isRTL ? 'تطابق المربعات X² ≡ Y²' : 'Congruence X² ≡ Y²';
      case 'success':
        return isRTL ? 'تم التفكيك بنجاح ✓' : 'Factorisation réussie ✓';
      case 'failed':
        return isRTL ? 'انتهت المحاولة دون انفصال' : 'Non séparé';
      default:
        return isRTL ? 'في وضع الاستعداد' : 'En veille';
    }
  };

  const formatRelationFactors = (exponents: number[], fb: number[]) => {
    if (!exponents || exponents.length === 0 || !fb) return '1';
    const terms: string[] = [];
    if (exponents[0] && exponents[0] > 0) terms.push('-1');
    for (let i = 1; i < exponents.length; i++) {
      const e = exponents[i];
      if (e > 0) {
        terms.push(e === 1 ? `${fb[i]}` : `${fb[i]}^${e}`);
      }
    }
    return terms.join(' × ') || '1';
  };

  const smoothProgress = trace && trace.targetSmooth > 0
    ? Math.min(100, Math.round((trace.smoothCount / trace.targetSmooth) * 100))
    : 0;

  const skippedRatio = trace && (trace.scannedCount + trace.skippedCount) > 0
    ? ((trace.skippedCount / (trace.scannedCount + trace.skippedCount)) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6 text-[#1C1917]" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Hero Header: HGS Command Console */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-[#1E3A8A]">
              <span>HGS · Hybrid Geodesic Sieve</span>
              <span aria-hidden="true">·</span>
              <span className="font-bold">{nBits} {isRTL ? 'بت' : 'bits'}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#14532D] font-bold">X² ≡ Y² (mod N)</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-serif-academic text-[#1C1917]">
              {isRTL ? 'محرك الغربال الهجين الجيوديسي (HGS Engine)' : 'Moteur Crible Géodésique Hybride (HGS)'}
            </h2>
            <p className="text-xs text-[#57534E] max-w-3xl leading-relaxed">
              {isRTL
                ? 'تنفيذ كامل ومفتوح للأعداد الكبيرة بدون قيود خانات؛ يجمع بين كثير الحدود Q(x) = (x + ⌊√N⌋)² - N، وغربلة الكتل والمجالات بتقريب اللوغاريتمات لتجاوز آلاف القيم غير الملساء، وحل مصفوفة التكافؤ F₂ بالجبر الخطي واستخراج العوامل بالتطابق.'
                : 'Moteur géodésique sans limite de chiffres : polynôme Q(x) = (x + ⌊√N⌋)² - N, crible par blocs logarithmique avec filtre Tonelli-Shanks, résolution matricielle F₂ et extraction par congruence.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg text-xs space-y-1 shrink-0">
              <span className="text-[10px] text-[#78716C] uppercase font-bold block">
                {isRTL ? 'المرحلة النشطة' : 'Étape active'}
              </span>
              <span className="font-mono font-bold text-[#1E3A8A] block">
                {getStageBadgeLabel(trace?.stage)}
              </span>
            </div>

            {!isRunning ? (
              <button
                onClick={() => onLaunchHgs()}
                className="py-2.5 px-5 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors shadow-sm"
              >
                {isRTL ? 'تشغيل غربال HGS' : 'Lancer Crible HGS'}
              </button>
            ) : (
              <button
                onClick={onStopHgs}
                className="py-2.5 px-5 rounded-lg text-xs font-bold bg-[#9A3412] hover:bg-[#7C2D12] text-white transition-colors shadow-sm"
              >
                {isRTL ? 'إيقاف الغربال (Cancel)' : 'Arrêter (Cancel)'}
              </button>
            )}
          </div>
        </div>

        {/* Live Progress Bar & Sieve Diagnostics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-[#78716C] uppercase font-bold">
                {isRTL ? 'العلاقات الملساء' : 'Relations lisses'}
              </span>
              <span className="font-bold text-[#1E3A8A]">
                {trace ? `${trace.smoothCount} / ${trace.targetSmooth || 35}` : '0 / 35'}
              </span>
            </div>
            <div className="w-full bg-[#E2DDD2] h-2 rounded-sm overflow-hidden">
              <div
                className="bg-[#1E3A8A] h-2 transition-all duration-300"
                style={{ width: `${smoothProgress}%` }}
              />
            </div>
          </div>

          <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
            <span className="text-[10px] text-[#78716C] uppercase font-bold block mb-1">
              {isRTL ? 'القيم المفحوصة' : 'Candidats testés'}
            </span>
            <span className="text-base font-bold text-[#1C1917] block">
              {trace ? trace.scannedCount.toLocaleString() : '0'}
            </span>
          </div>

          <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
            <span className="text-[10px] text-[#78716C] uppercase font-bold block mb-1">
              {isRTL ? 'تجاوز بدون قسمة' : 'Sauté sans division'}
            </span>
            <span className="text-base font-bold text-[#14532D] block">
              {trace ? `${trace.skippedCount.toLocaleString()} (${skippedRatio}%)` : '0 (0%)'}
            </span>
          </div>

          <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
            <span className="text-[10px] text-[#78716C] uppercase font-bold block mb-1">
              {isRTL ? 'زمن المعالجة' : 'Temps écoulé'}
            </span>
            <span className="text-base font-bold text-[#9A3412] block">
              {trace?.duration ? `${trace.duration} ms` : '0 ms'}
            </span>
          </div>
        </div>

        {/* Mathematical Parameters & Polynomial */}
        <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
            <span className="text-[10px] text-[#78716C] uppercase font-bold block mb-1 font-mono">
              {isRTL ? 'العدد المستهدف (N)' : 'Module Cible (N)'}:
            </span>
            <span className="font-mono text-xs font-bold text-[#1E3A8A] break-all select-all block">
              {nBig.toString()}
            </span>
          </div>

          <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
            <span className="text-[10px] text-[#78716C] uppercase font-bold block mb-1 font-mono">
              {isRTL ? 'الجذر التقريبي ⌊√N⌋' : 'Racine ⌊√N⌋'}:
            </span>
            <span className="font-mono text-xs text-[#57534E] break-all select-all block">
              {sqrtN.toString()}
            </span>
          </div>

          <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
            <span className="text-[10px] text-[#78716C] uppercase font-bold block mb-1 font-mono">
              {isRTL ? 'كثير الحدود Q(x)' : 'Polynôme Q(x)'}:
            </span>
            <span className="font-mono text-xs font-bold text-[#14532D] break-all block">
              {trace?.polynomial || `Q(x) = (x + ⌊√N⌋)² - N`}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Technical Core Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Panel 1: Factor Base */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
            <div>
              <h3 className="text-sm font-bold font-serif-academic text-[#1C1917]">
                {isRTL ? '1. قاعدة العوامل الأولية (Factor Base)' : '1. Base de Facteurs'}
              </h3>
              <p className="text-[11px] text-[#78716C]">
                {isRTL
                  ? 'الأعداد الأولية الصغيرة p التي تحقق أن N يمثل بقية تربيعية لها (N/p)=1 مع تضمين -1'
                  : 'Nombres premiers p avec symbole de Legendre (N/p)=1 et facteur signe -1'}
              </p>
            </div>
            <span className="px-2.5 py-1 bg-[#F4F0E8] border border-[#E2DDD2] rounded text-xs font-mono font-bold text-[#1E3A8A]">
              |FB| = {trace?.factorBaseSize || 0}
            </span>
          </div>

          {trace?.factorBase && trace.factorBase.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1 max-h-44 overflow-y-auto p-2 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono text-xs">
                {trace.factorBase.map((p, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded border text-[11px] ${
                      p === -1
                        ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B] font-bold'
                        : p === 2
                        ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]'
                        : 'bg-white border-[#E2DDD2] text-[#44403C]'
                    }`}
                  >
                    {p}
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-[#78716C] font-mono flex justify-between">
                <span>{isRTL ? 'أصغر أولي: 2' : 'Min prime: 2'}</span>
                <span>{isRTL ? `أكبر أولي: ${trace.factorBase[trace.factorBase.length - 1]}` : `Max prime: ${trace.factorBase[trace.factorBase.length - 1]}`}</span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#78716C] font-mono bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
              {isRunning
                ? (isRTL ? 'جاري بناء وفحص قاعدة العوامل برمز ليجاندر...' : 'Construction de la base en cours...')
                : (isRTL ? 'ستظهر قاعدة العوامل فور بدء تشغيل الغربال' : 'La base apparaîtra au lancement')}
            </div>
          )}
        </div>

        {/* Panel 2: Smooth Relations */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
            <div>
              <h3 className="text-sm font-bold font-serif-academic text-[#1C1917]">
                {isRTL ? '2. العلاقات الملساء المكتشفة (Smooth Relations)' : '2. Relations Lisses'}
              </h3>
              <p className="text-[11px] text-[#78716C]">
                {isRTL
                  ? 'قيم Q(x) التي تحلل بالكامل على قاعدة العوامل وتولد سطور مصفوفة التكافؤ'
                  : 'Valeurs factorisées entièrement sur la base'}
              </p>
            </div>
            <span className="px-2.5 py-1 bg-[#F4F0E8] border border-[#E2DDD2] rounded text-xs font-mono font-bold text-[#14532D]">
              {trace?.relations?.length || 0} / {trace?.targetSmooth || 35}
            </span>
          </div>

          {trace?.relations && trace.relations.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 font-mono text-xs">
              {trace.relations.slice(-8).map((rel) => (
                <div
                  key={rel.index}
                  className="p-2 bg-[#FBF9F5] border border-[#E2DDD2] rounded flex flex-col md:flex-row md:items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-white border border-[#E2DDD2] rounded text-[10px] font-bold text-[#78716C]">
                      #{rel.index}
                    </span>
                    <span className="text-[#1E3A8A] font-bold">x={rel.x}</span>
                    <span className="text-[#78716C]">·</span>
                    <span className="text-[#1C1917] font-bold">Q={rel.Q}</span>
                  </div>
                  <div className="text-[11px] text-[#14532D] break-all">
                    {formatRelationFactors(rel.exponents, trace.factorBase)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#78716C] font-mono bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
              {isRunning
                ? (isRTL ? 'جاري غربلة المجالات واستخلاص العلاقات الملساء...' : 'Extraction des relations en cours...')
                : (isRTL ? 'في انتظار العثور على العلاقات الملساء' : 'En attente de relations')}
            </div>
          )}
        </div>

        {/* Panel 3: F2 Binary Matrix */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
            <div>
              <h3 className="text-sm font-bold font-serif-academic text-[#1C1917]">
                {isRTL ? '3. مصفوفة التكافؤ F₂ وحلها بالجبر الخطي' : '3. Matrice de Parité F₂ & Élimination'}
              </h3>
              <p className="text-[11px] text-[#78716C]">
                {isRTL
                  ? 'مصفوفة أسس العوامل mod 2 لإيجاد التبعيات الخطية ونواة الصفر Nullspace لإنتاج المربع التام'
                  : 'Matrice des exposants mod 2 résolue par élimination de Gauss pour former un carré parfait'}
              </p>
            </div>
            {trace?.matrixDimensions && (
              <span className="px-2.5 py-1 bg-[#F4F0E8] border border-[#E2DDD2] rounded text-xs font-mono font-bold text-[#1E3A8A]">
                {trace.matrixDimensions.rows} × {trace.matrixDimensions.cols}
              </span>
            )}
          </div>

          {trace?.matrixPreview && trace.matrixPreview.length > 0 ? (
            <div className="space-y-2">
              <div className="p-2 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg overflow-x-auto">
                <div className="grid gap-1 font-mono text-[9px] leading-none select-none">
                  {trace.matrixPreview.slice(0, 10).map((row, rIdx) => (
                    <div key={rIdx} className="flex gap-0.5">
                      <span className="text-[#A8A29E] w-6 shrink-0 text-right pr-1">R{rIdx}</span>
                      {row.slice(0, 32).map((val, cIdx) => (
                        <span
                          key={cIdx}
                          className={`w-3.5 h-3.5 flex items-center justify-center font-bold rounded-xs ${
                            val === 1
                              ? 'bg-[#1E3A8A] text-white'
                              : 'bg-white text-[#D6D3D1] border border-[#E2DDD2]'
                          }`}
                        >
                          {val}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-[#78716C] font-mono flex justify-between">
                <span>{isRTL ? 'الصفوف = العلاقات الملساء' : 'Lignes = relations'}</span>
                <span>{isRTL ? 'الأعمدة = عناصر قاعدة العوامل' : 'Colonnes = facteurs'}</span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#78716C] font-mono bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
              {isRunning
                ? (isRTL ? 'جاري بناء مصفوفة التكافؤ F₂ مع كل علاقة ملساء جديدة...' : 'Construction de la matrice...')
                : (isRTL ? 'ستظهر مصفوفة F₂ فور توفر العلاقات' : 'La matrice apparaîtra au crible')}
            </div>
          )}
        </div>

        {/* Panel 4: Congruence of Squares & Factor Recovery */}
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
            <div>
              <h3 className="text-sm font-bold font-serif-academic text-[#1C1917]">
                {isRTL ? '4. تطابق فرق المربعين واستخراج العوامل' : '4. Congruence des Carrés & Facteurs'}
              </h3>
              <p className="text-[11px] text-[#78716C]">
                {isRTL
                  ? 'استخراج القاسم المشترك الأكبر gcd(X ± Y, N) لإنتاج العوامل الأولية غير التافهة'
                  : 'Extraction du facteur non trivial via gcd(X - Y, N) et gcd(X + Y, N)'}
              </p>
            </div>
            <span className="px-2.5 py-1 bg-[#F4F0E8] border border-[#E2DDD2] rounded text-xs font-mono font-bold text-[#14532D]">
              X² ≡ Y² (mod N)
            </span>
          </div>

          {trace?.congruence ? (
            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg space-y-1">
                <div className="flex justify-between items-center text-[#166534] font-bold text-[11px]">
                  <span>{isRTL ? 'تطابق المربعين المحقق:' : 'Congruence vérifiée :'}</span>
                  <span>gcd(X - Y, N) &gt; 1</span>
                </div>
                <div className="text-[11px] text-[#14532D] break-all select-all">
                  X = {trace.congruence.X}
                </div>
                <div className="text-[11px] text-[#14532D] break-all select-all">
                  Y = {trace.congruence.Y}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#78716C] uppercase font-bold">العامل الأول (p)</span>
                    <button
                      onClick={() => copyToClipboard(trace.congruence!.factor1, 'p')}
                      className="text-[10px] text-[#1E3A8A] font-bold hover:underline"
                    >
                      {copiedP ? 'تم النسخ ✓' : 'نسخ'}
                    </button>
                  </div>
                  <span className="font-bold text-[#1E3A8A] text-sm break-all select-all block">
                    {trace.congruence.factor1}
                  </span>
                </div>

                <div className="p-3 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#78716C] uppercase font-bold">العامل الثاني (q)</span>
                    <button
                      onClick={() => copyToClipboard(trace.congruence!.factor2, 'q')}
                      className="text-[10px] text-[#1E3A8A] font-bold hover:underline"
                    >
                      {copiedQ ? 'تم النسخ ✓' : 'نسخ'}
                    </button>
                  </div>
                  <span className="font-bold text-[#14532D] text-sm break-all select-all block">
                    {trace.congruence.factor2}
                  </span>
                </div>
              </div>

              <div className="p-2 bg-[#FBF9F5] border border-[#E2DDD2] rounded text-[11px] text-[#78716C] flex justify-between">
                <span>{isRTL ? 'التحقق الحسابي:' : 'Vérification :'}</span>
                <span className="font-bold text-[#14532D]">
                  p × q === N (مطابق تماماً ✓)
                </span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#78716C] font-mono bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg">
              {isRunning
                ? (isRTL ? 'في انتظار حل مصفوفة F₂ واستخراج تطابق المربعات...' : 'En attente de la congruence...')
                : (isRTL ? 'ستظهر نتائج التطابق والعوامل المستخرجة هنا' : 'Les facteurs apparaîtront ici')}
            </div>
          )}
        </div>
      </div>

      {/* Prime Factor Tree View (عرض مرئي لشجرة العوامل الأولية) */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
          <div>
            <h3 className="text-base font-bold font-serif-academic text-[#1C1917]">
              {isRTL ? 'شجرة العوامل الأولية (Prime Factor Tree)' : 'Arbre des Facteurs Premiers'}
            </h3>
            <p className="text-xs text-[#57534E]">
              {isRTL
                ? 'عرض هيكلي متسلسل لتفكيك العدد الطبيعي N إلى عوامله الأولية مع إثبات ميلر-رابين للأولية'
                : 'Décomposition arborescente du nombre N en facteurs premiers avec preuve Miller-Rabin'}
            </p>
          </div>
          {trace?.congruence && (
            <span className="px-3 py-1 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs font-mono font-bold text-[#166534]">
              {isRTL ? 'التفكيك مكتمل ومؤكد ✓' : 'Décomposition complète ✓'}
            </span>
          )}
        </div>

        {trace?.factorTree ? (
          <div className="p-6 bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl flex flex-col items-center gap-6">
            {/* Root Node: N */}
            <div className="p-4 bg-white border border-[#1E3A8A] rounded-xl shadow-sm text-center max-w-xl w-full">
              <span className="text-[10px] text-[#78716C] uppercase font-mono font-bold block mb-1">
                {isRTL ? 'العدد المركب المدخل (N)' : 'Nombre composite (N)'}
              </span>
              <span className="font-mono text-sm md:text-base font-bold text-[#1C1917] break-all select-all block">
                {trace.factorTree.value}
              </span>
              <span className="mt-1 px-2 py-0.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] rounded text-[10px] font-mono font-bold inline-block">
                {trace.factorTree.bits || nBits} bits
              </span>
            </div>

            {/* Tree Branch Connectors */}
            <div className="w-1/2 flex justify-between items-center relative h-6">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-[#94A3B8]" />
              <div className="absolute top-3 left-1/4 right-1/4 h-0.5 bg-[#94A3B8]" />
              <div className="absolute top-3 left-1/4 w-0.5 h-3 bg-[#94A3B8]" />
              <div className="absolute top-3 right-1/4 w-0.5 h-3 bg-[#94A3B8]" />
            </div>

            {/* Children Nodes: p and q */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
              {/* Left Factor p */}
              {trace.factorTree.left && (
                <div className="p-4 bg-white border border-[#14532D] rounded-xl shadow-sm text-center">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#78716C] uppercase font-mono font-bold">
                      {isRTL ? 'العامل الأولي (p)' : 'Facteur (p)'}
                    </span>
                    <span className="px-2 py-0.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded text-[10px] font-bold">
                      {trace.factorTree.left.isPrime ? (isRTL ? 'أولي مؤكد ✓' : 'Premier certifié ✓') : 'مركب'}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-bold text-[#14532D] break-all select-all block mt-1">
                    {trace.factorTree.left.value}
                  </span>
                  <span className="text-[10px] text-[#78716C] font-mono block mt-1">
                    {trace.factorTree.left.bits} bits · Miller-Rabin Verified
                  </span>
                </div>
              )}

              {/* Right Factor q */}
              {trace.factorTree.right && (
                <div className="p-4 bg-white border border-[#1E3A8A] rounded-xl shadow-sm text-center">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#78716C] uppercase font-mono font-bold">
                      {isRTL ? 'العامل الأولي (q)' : 'Facteur (q)'}
                    </span>
                    <span className="px-2 py-0.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded text-[10px] font-bold">
                      {trace.factorTree.right.isPrime ? (isRTL ? 'أولي مؤكد ✓' : 'Premier certifié ✓') : 'مركب'}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-bold text-[#1E3A8A] break-all select-all block mt-1">
                    {trace.factorTree.right.value}
                  </span>
                  <span className="text-[10px] text-[#78716C] font-mono block mt-1">
                    {trace.factorTree.right.bits} bits · Miller-Rabin Verified
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#78716C] font-mono bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl">
            {isRunning
              ? (isRTL ? 'جاري بناء شجرة العوامل الأولية أثناء معالجة الغربال...' : 'Construction de l\'arbre...')
              : (isRTL ? 'ستظهر شجرة العوامل فور إتمام التفكيك بنجاح' : 'L\'arbre apparaîtra à la factorisation')}
          </div>
        )}
      </div>
    </div>
  );
};

export default HgsDashboard;
