import React, { useMemo, useState } from 'react';
import {
  CHRONOS_CLAIM_REGISTRY,
  CmveAlgorithmId,
  CmveClaimTier,
  CmveFullAuditReport,
  runCmveBenchmarkAudit,
  runFullCmveAudit
} from '../lib/cmve';
import { computeUniversalExponentReport } from '../lib/universalExponentEngine';
import { Language } from '../translations';

interface CmveVerificationPanelProps {
  currentN: string;
  currentFactors: string[];
  currentE?: string;
  currentD?: string;
  lang: Language;
  onSyncN?: (n: string) => void;
}

const ALGORITHM_OPTIONS: Array<{ id: CmveAlgorithmId; labelAr: string; labelFr: string }> = [
  { id: 'chronos-unified', labelAr: 'السباق الموحد (SIQS + HGS + CFRAC + ECM)', labelFr: 'Course Unifiée (SIQS + HGS + CFRAC + ECM)' },
  { id: 'siqs-hgs', labelAr: 'الغربال التربيعي SIQS / HGS (مصفوفة 32KB)', labelFr: 'Crible SIQS / HGS (blocs 32 Ko)' },
  { id: 'cfrac', labelAr: 'الكسور المستمرة (CFRAC)', labelFr: 'Fractions continues (CFRAC)' },
  { id: 'ecm', labelAr: 'المنحنيات الإهليلجية Montgomery REDC ECM', labelFr: 'ECM Montgomery REDC' },
  { id: 'wiener', labelAr: 'هجوم Wiener (يتطلب e و d < N^0.25)', labelFr: 'Attaque de Wiener (e, d < N^0.25)' },
  { id: 'boneh-durfee', labelAr: 'هجوم Boneh–Durfee LLL (d < N^0.292)', labelFr: 'Boneh–Durfee LLL (d < N^0.292)' },
  { id: 'coppersmith', labelAr: 'كوبرسميث LLL (يتطلب تقريب جزئي p₀)', labelFr: 'Coppersmith LLL (indice p₀)' },
  { id: 'snfs', labelAr: 'كاشف الصيغ الجبرية SNFS', labelFr: 'Détecteur SNFS algébrique' },
  { id: 'zf-18-19', labelAr: 'مختبر ZF-18 / ZF-19 (فرضية بحثية)', labelFr: 'Labo ZF-18/19 (Hypothèse)' },
  { id: 'psi-factor', labelAr: 'محرك Ψ-Factor (تجريبي + هجين)', labelFr: 'Moteur Ψ-Factor (Expérimental)' },
  { id: 'zeta-spectral', labelAr: 'أصفار زيتا والاستكشاف الطيفي (فرضية)', labelFr: 'Spectre Zêta (Hypothèse)' }
];

const TIER_LABELS: Record<CmveClaimTier, { ar: string; fr: string; colorClass: string }> = {
  PROVEN_THEOREM: { ar: 'نظرية مثبتة رياضياً', fr: 'Théorème prouvé', colorClass: 'text-[#14532D]' },
  VERIFIED_NUMERICAL: { ar: 'تحقق عددي / شهادة دقيقة', fr: 'Vérifié numériquement', colorClass: 'text-[#1E3A8A]' },
  EMPIRICAL_BENCHMARK: { ar: 'قياس تجريبي موثق', fr: 'Mesure empirique', colorClass: 'text-[#0F766E]' },
  UNPROVEN_HYPOTHESIS: { ar: 'فرضية بحثية / إرشاد تجريبي', fr: 'Hypothèse de recherche', colorClass: 'text-[#9A3412]' }
};

export const CmveVerificationPanel: React.FC<CmveVerificationPanelProps> = ({
  currentN,
  currentFactors,
  currentE,
  currentD,
  lang,
  onSyncN
}) => {
  const isRTL = lang === 'ar';

  const [nInput, setNInput] = useState<string>(currentN || '340282366920938462614824380041128836353');
  const [factorsInput, setFactorsInput] = useState<string>(
    currentFactors.length > 0 ? currentFactors.join(', ') : '18446744073709551557, 18446744073709551629'
  );
  const [algorithmId, setAlgorithmId] = useState<CmveAlgorithmId>('chronos-unified');
  const [eInput, setEInput] = useState<string>(currentE && currentE !== '???' ? currentE : '');
  const [dInput, setDInput] = useState<string>(currentD && currentD !== '???' ? currentD : '');
  const [p0Input, setP0Input] = useState<string>('');
  const [congX, setCongX] = useState<string>('');
  const [congY, setCongY] = useState<string>('');
  const [bypassCache, setBypassCache] = useState<boolean>(true);
  const [auditReport, setAuditReport] = useState<CmveFullAuditReport | null>(null);
  const [benchmarkOnlyReport, setBenchmarkOnlyReport] = useState<CmveFullAuditReport['stage3Benchmark'] | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  React.useEffect(() => {
    if (currentN) setNInput(currentN);
  }, [currentN]);

  React.useEffect(() => {
    if (currentFactors.length > 0) {
      setFactorsInput(currentFactors.join(', '));
    }
  }, [currentFactors.join(',')]);

  const provenanceComparison = useMemo(() => {
    const clean = nInput.replace(/[^0-9]/g, '');
    if (!clean) return null;
    try {
      const withCache = computeUniversalExponentReport(clean, 'standard', 0.258, undefined, undefined, {
        ignoreCache: false
      });
      const withoutCache = computeUniversalExponentReport(clean, 'standard', 0.258, undefined, undefined, {
        ignoreCache: true
      });
      return { withCache, withoutCache };
    } catch {
      return null;
    }
  }, [nInput]);

  const handleRunFullAudit = (includeBenchmarks: boolean) => {
    const cleanN = nInput.replace(/[^0-9]/g, '');
    if (!cleanN) return;
    if (onSyncN && cleanN !== currentN) {
      onSyncN(cleanN);
    }
    const factorsList = factorsInput
      .split(/[\s,×*x]+/)
      .map(s => s.replace(/[^0-9]/g, ''))
      .filter(Boolean);

    const report = runFullCmveAudit({
      n: cleanN,
      claimedFactors: factorsList,
      algorithmId,
      includeBenchmarks,
      publicExponentE: eInput || undefined,
      privateExponentD: dInput || undefined,
      partialPrimeP0: p0Input || undefined,
      congruenceX: congX || undefined,
      congruenceY: congY || undefined
    });
    setAuditReport(report);
    if (report.stage3Benchmark) {
      setBenchmarkOnlyReport(report.stage3Benchmark);
    }
  };

  const handleRunStage3Only = () => {
    const res = runCmveBenchmarkAudit();
    setBenchmarkOnlyReport(res);
  };

  const handleCopyJson = () => {
    const payload = auditReport || benchmarkOnlyReport;
    if (!payload) return;
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1800);
  };

  return (
    <div className="space-y-6 text-[#1C1917]" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header & Chronos v5 3-Layer Epistemic Architecture */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#1E3A8A]">
              <span>CMVE · Chronos Mathematical Verification Engine</span>
              <span aria-hidden="true">·</span>
              <span>{isRTL ? 'إطار التحقق العلمي من 4 مراحل' : 'Audit scientifique en 4 étapes'}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-serif-academic text-[#1C1917]">
              {isRTL
                ? 'محرك التحقق الرياضي المستقل والشهادات الأولية (Chronos v5)'
                : 'Moteur de Vérification Mathématique & Certificats de Primalité'}
            </h2>
            <p className="text-sm text-[#57534E] max-w-4xl leading-relaxed">
              {isRTL
                ? 'يفصل هذا المختبر بصرامة بين الحقائق الرياضية المثبتة والقياسات التجريبية والفرضيات البحثية؛ يتحقق من جداء العوامل، يصدر شهادات أولية حتمية (≤64 بت وبوكلينغتون) أو Baillie-PSW صريحة، يقارن Markowitz مقابل Block Wiedemann، ويعيد التحقق بتجاوز كامل للذاكرة المخبأة.'
                : 'Sépare rigoureusement théorèmes prouvés, mesures empiriques et hypothèses expérimentales : certificats de primalité, audit GF(2) Markowitz vs Block Wiedemann et reproduction indépendante sans cache.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => handleRunFullAudit(true)}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] hover:bg-[#172554] text-white transition-colors whitespace-nowrap"
            >
              {isRTL ? 'تشغيل التدقيق العلمي الكامل (4 مراحل)' : 'Lancer Audit Complet (4 étapes)'}
            </button>
            <button
              onClick={handleRunStage3Only}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#F4F0E8] border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1C1917] transition-colors whitespace-nowrap"
            >
              {isRTL ? 'قياس GF(2) و REDC وزيتا فقط' : 'Benchmark GF(2) & Zêta'}
            </button>
          </div>
        </div>

        {/* 3-Layer Architecture Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-1.5">
            <div className="text-xs font-mono font-bold text-[#14532D]">
              {isRTL ? 'الطبقة 1 · الحساب الدقيق والشهادات' : 'Couche 1 · Arithmétique & Certificats'}
            </div>
            <div className="text-xs text-[#57534E] leading-relaxed">
              {isRTL
                ? 'SIQS / HGS بمصفوفات مجزأة 32KB، وECM بمضاعفة Montgomery REDC، وشهادات أولية قابلة للتحقق المستقل، وكشف أصل λ(N).'
                : 'SIQS/HGS par blocs 32 Ko, ECM Montgomery REDC, certificats de primalité et traçabilité exacte de λ(N).'}
            </div>
          </div>
          <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-1.5">
            <div className="text-xs font-mono font-bold text-[#1E3A8A]">
              {isRTL ? 'الطبقة 2 · الجبر الخطي GF(2)' : 'Couche 2 · Algèbre Linéaire GF(2)'}
            </div>
            <div className="text-xs text-[#57534E] leading-relaxed">
              {isRTL
                ? 'حذف Markowitz المتناثر + الإزالة المنقولة popcnt للنوى ≤ 8000 صف، وBlock Wiedemann Krylov للنوى الأكبر مع مقارنة قياس مزدوجة.'
                : 'Élimination Markowitz + popcnt transposé (≤8000 lignes) et Block Wiedemann Krylov au-delà avec comparaison directe.'}
            </div>
          </div>
          <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-1.5">
            <div className="text-xs font-mono font-bold text-[#9A3412]">
              {isRTL ? 'الطبقة 3 · الطيف التحليلي وحدود الخطأ' : 'Couche 3 · Laboratoire Spectral & Bornes'}
            </div>
            <div className="text-xs text-[#57534E] leading-relaxed">
              {isRTL
                ? 'عزل واضح لوحدات ZF-15..19 وΨ-Factor كفرضيات استكشافية مع قياس خطأ البتر R(x) مقابل π(x) الحقيقية.'
                : 'Isolation explicite de ZF-15..19 et Ψ-Factor comme hypothèses avec mesure de l’erreur de troncature R(x) vs π(x).'}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive CMVE Input & Provenance Audit Console */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
          <h3 className="text-sm font-bold font-serif-academic text-[#1C1917]">
            {isRTL ? 'مدخلات التحقق المستقل وفحص مصدر λ(N)' : 'Paramètres de Vérification & Provenance de λ(N)'}
          </h3>
          {provenanceComparison && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
              <span className="text-[#57534E]">
                {isRTL ? 'مع الكاش:' : 'Avec cache :'} <strong className="text-[#1C1917]">{provenanceComparison.withCache.provenance}</strong>
              </span>
              <span aria-hidden="true" className="text-[#A89F8D]">·</span>
              <span className="text-[#57534E]">
                {isRTL ? 'بتجاوز الكاش:' : 'Sans cache :'} <strong className="text-[#1E3A8A]">{provenanceComparison.withoutCache.provenance}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#57534E] block">
              {isRTL ? 'العدد المستهدف (N)' : 'Module cible (N)'}
            </label>
            <textarea
              dir="ltr"
              rows={2}
              value={nInput}
              onChange={(e) => setNInput(e.target.value)}
              className="w-full p-2.5 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#57534E] block">
              {isRTL ? 'العوامل المراد إثباتها (مفصولة بفاصلة)' : 'Facteurs revendiqués (séparés par virgule)'}
            </label>
            <textarea
              dir="ltr"
              rows={2}
              value={factorsInput}
              onChange={(e) => setFactorsInput(e.target.value)}
              placeholder="p, q"
              className="w-full p-2.5 bg-[#FBF9F5] border border-[#E2DDD2] rounded-lg font-mono-tabular text-xs text-[#1C1917] focus:outline-none focus:border-[#1E3A8A] resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-[#57534E] block">
              {isRTL ? 'الخوارزمية الخاضعة للتدقيق' : 'Algorithme audité'}
            </label>
            <select
              value={algorithmId}
              onChange={(e) => setAlgorithmId(e.target.value as CmveAlgorithmId)}
              className="w-full px-2.5 py-2 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] text-xs text-[#1C1917]"
            >
              {ALGORITHM_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {isRTL ? opt.labelAr : opt.labelFr}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-[#57534E] block">e (اختياري)</label>
            <input
              dir="ltr"
              type="text"
              value={eInput}
              onChange={(e) => setEInput(e.target.value)}
              placeholder="65537"
              className="w-full px-2.5 py-2 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] font-mono-tabular text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-[#57534E] block">d أو p₀ (اختياري)</label>
            <input
              dir="ltr"
              type="text"
              value={algorithmId === 'coppersmith' ? p0Input : dInput}
              onChange={(e) => (algorithmId === 'coppersmith' ? setP0Input(e.target.value) : setDInput(e.target.value))}
              placeholder={algorithmId === 'coppersmith' ? 'p0 partial hint' : 'private key d'}
              className="w-full px-2.5 py-2 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] font-mono-tabular text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-[#57534E] block">تطابق X, Y (اختياري)</label>
            <div className="grid grid-cols-2 gap-1.5" dir="ltr">
              <input
                type="text"
                value={congX}
                onChange={(e) => setCongX(e.target.value)}
                placeholder="X"
                className="w-full px-2 py-2 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] font-mono-tabular text-xs"
              />
              <input
                type="text"
                value={congY}
                onChange={(e) => setCongY(e.target.value)}
                placeholder="Y"
                className="w-full px-2 py-2 rounded-lg bg-[#FBF9F5] border border-[#E2DDD2] font-mono-tabular text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-[#1C1917] font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={bypassCache}
              onChange={(e) => setBypassCache(e.target.checked)}
              className="accent-[#1E3A8A] w-3.5 h-3.5"
            />
            <span>
              {isRTL
                ? 'تجاوز GLOBAL_FACTOR_CACHE قسراً في المرحلة 4 لإثبات الاستقلالية عن القيم المخبأة'
                : 'Forcer le contournement de GLOBAL_FACTOR_CACHE à l’étape 4'}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRunFullAudit(false)}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#14532D] hover:bg-[#052E16] text-white transition-colors"
            >
              {isRTL ? 'تحقق فوري (الشهادات + التطابق + الاستقلالية)' : 'Vérification Rapide (Certificats + Reproduction)'}
            </button>
            {(auditReport || benchmarkOnlyReport) && (
              <button
                onClick={handleCopyJson}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-white border border-[#E2DDD2] hover:border-[#1E3A8A] text-[#1E3A8A]"
              >
                {copiedJson ? (isRTL ? '✓ تم نسخ التقرير' : '✓ Copié') : (isRTL ? 'تصدير JSON للتدقيق' : 'Exporter JSON')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4-Stage CMVE Results */}
      {auditReport && (
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2DDD2] pb-3">
            <div>
              <div className="text-xs font-mono text-[#57534E]">
                {auditReport.nBits} bits · {auditReport.environment.runtime} · {auditReport.environment.hardwareConcurrency} cores
              </div>
              <h3 className="text-base font-bold font-serif-academic text-[#1C1917]">
                {isRTL ? 'نتائج مراحل التحقق الأربع (CMVE Audit Report)' : 'Résultats des 4 Étapes CMVE'}
              </h3>
            </div>
            <div
              className={`text-xs font-mono font-bold ${
                auditReport.overallVerdict === 'VERIFIED'
                  ? 'text-[#14532D]'
                  : auditReport.overallVerdict === 'PARTIAL_PROBABILISTIC'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#9A3412]'
              }`}
            >
              {auditReport.overallVerdict === 'VERIFIED'
                ? '✓ VERIFIED (DETERMINISTIC PROOFS)'
                : auditReport.overallVerdict === 'PARTIAL_PROBABILISTIC'
                ? '● VERIFIED ARITHMETIC (PROBABILISTIC >64b BPSW OR SPECIALIZED SCOPE)'
                : '✖ VERIFICATION FAILED'}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Stage 1: Theoretical */}
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-[#1C1917]">1. التحقق النظري والنطاق</span>
                <span className={auditReport.stage1Theoretical.passed ? 'text-[#14532D] font-bold' : 'text-[#9A3412] font-bold'}>
                  {auditReport.stage1Theoretical.passed ? 'PASS' : 'PRECONDITION FAIL'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-[#57534E]" dir="ltr">
                Category: {auditReport.stage1Theoretical.category} · {auditReport.stage1Theoretical.complexityClass}
              </div>
              <div className="space-y-1.5">
                {auditReport.stage1Theoretical.checks.map((chk, idx) => (
                  <div key={idx} className="bg-white p-2.5 rounded border border-[#E2DDD2] text-xs space-y-0.5">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="font-bold text-[#1C1917]">{chk.name}</span>
                      <span className={chk.passed ? 'text-[#14532D] font-bold' : 'text-[#9A3412] font-bold'}>
                        {chk.passed ? '✓ OK' : '✖ FAIL'}
                      </span>
                    </div>
                    <div className="text-[#57534E]">{isRTL ? chk.detailAr : chk.detailEn}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage 2: Numerical & Primality Certificates */}
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-[#1C1917]">2. التحقق العددي وشهادات الأولية</span>
                <span className={auditReport.stage2Numerical.passed ? 'text-[#14532D] font-bold' : 'text-[#9A3412] font-bold'}>
                  {auditReport.stage2Numerical.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="text-xs text-[#57534E]">
                {isRTL ? auditReport.stage2Numerical.summaryAr : auditReport.stage2Numerical.summaryEn}
              </div>
              <div className="space-y-2">
                {auditReport.stage2Numerical.factorCertificates.map((fc, idx) => (
                  <div key={idx} className="bg-white p-2.5 rounded border border-[#E2DDD2] text-xs space-y-1" dir="ltr">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono-tabular">
                      <span className="font-bold text-[#1E3A8A] break-all">
                        p_{idx + 1} = {fc.factor}{fc.power > 1 ? `^${fc.power}` : ''} ({fc.cert.nBits}b)
                      </span>
                      <span className={`font-bold ${fc.cert.isProvenDeterministic ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                        {fc.cert.strength}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#57534E]" dir={isRTL ? 'rtl' : 'ltr'}>
                      {isRTL ? fc.cert.summaryAr : fc.cert.summaryEn}
                    </div>
                    <div className="text-[10px] font-mono text-[#57534E]">
                      Recheck: {fc.independentRecheck.valid ? 'VALID' : 'INVALID'} · {fc.independentRecheck.checksPerformed} modular checks · {fc.independentRecheck.reason}
                    </div>
                    {fc.cert.pocklingtonProof && (
                      <div className="text-[10px] font-mono text-[#14532D]">
                        Pocklington: F &gt; √N ({fc.cert.pocklingtonProof.witnesses.length} witnesses verified on N−1)
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {auditReport.stage2Numerical.exponentAudit && (
                <div className="bg-white p-2.5 rounded border border-[#E2DDD2] text-[11px] font-mono-tabular space-y-0.5" dir="ltr">
                  <div>
                    a^λ(N) ≡ 1 (mod N):{' '}
                    <strong className={auditReport.stage2Numerical.exponentAudit.lambdaOrderVerified ? 'text-[#14532D]' : 'text-[#9A3412]'}>
                      {String(auditReport.stage2Numerical.exponentAudit.lambdaOrderVerified)}
                    </strong>{' '}
                    ({auditReport.stage2Numerical.exponentAudit.checkedBases} bases)
                  </div>
                  <div className="break-all text-[#57534E]">λ(N) = {auditReport.stage2Numerical.exponentAudit.lambdaN}</div>
                </div>
              )}
            </div>
          </div>

          {/* Stage 4: Independent Cache-Bypassed Reproduction */}
          <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span className="font-bold text-[#1C1917]">4. إعادة الإنتاج المستقلة (بتجاوز الكاش GLOBAL_FACTOR_CACHE)</span>
              <span className={auditReport.stage4Reproduction.passed ? 'text-[#14532D] font-bold' : 'text-[#9A3412] font-bold'}>
                {auditReport.stage4Reproduction.passed ? 'INDEPENDENTLY VERIFIED' : 'MISMATCH'} · {auditReport.stage4Reproduction.elapsedMs} ms
              </span>
            </div>
            <div className="text-xs text-[#57534E]">
              {isRTL ? auditReport.stage4Reproduction.noteAr : auditReport.stage4Reproduction.noteEn}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono-tabular" dir="ltr">
              <div className="bg-white p-2 rounded border border-[#E2DDD2]">
                <span className="text-[#57534E] block">Cache-Free λ(N) Provenance</span>
                <strong className="text-[#1E3A8A]">{auditReport.stage4Reproduction.universalExpReportCacheBypassed.provenance}</strong>
              </div>
              <div className="bg-white p-2 rounded border border-[#E2DDD2]">
                <span className="text-[#57534E] block">Independent Kernel</span>
                <strong className="text-[#1C1917]">{auditReport.stage4Reproduction.independentMethod}</strong>
              </div>
              <div className="bg-white p-2 rounded border border-[#E2DDD2]">
                <span className="text-[#57534E] block">Matches Claimed Factors</span>
                <strong className={auditReport.stage4Reproduction.matchesClaimedFactors ? 'text-[#14532D]' : 'text-[#9A3412]'}>
                  {String(auditReport.stage4Reproduction.matchesClaimedFactors)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 3 Benchmark: Markowitz popcnt vs Block Wiedemann + REDC + Zeta Truncation Error */}
      {benchmarkOnlyReport && (
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DDD2] pb-3">
            <h3 className="text-base font-bold font-serif-academic text-[#1C1917]">
              {isRTL
                ? 'المرحلة 3 · قياس GF(2) الفعلي (Markowitz popcnt مقابل Block Wiedemann) وحدود خطأ زيتا'
                : 'Étape 3 · Benchmark GF(2) (Markowitz popcnt vs Block Wiedemann) & Erreur Zêta'}
            </h3>
            <span className="text-xs font-mono-tabular text-[#14532D] font-bold" dir="ltr">
              Matrix {benchmarkOnlyReport.gf2Comparison.matrixRows}×{benchmarkOnlyReport.gf2Comparison.matrixCols}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs font-mono-tabular" dir="ltr">
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-1">
              <div className="text-[11px] text-[#57534E] font-bold">Markowitz + Transposed popcnt</div>
              <div className="text-lg font-bold text-[#14532D]">{benchmarkOnlyReport.gf2Comparison.markowitzCoreMs} ms</div>
              <div className="text-[11px] text-[#57534E]">
                method={benchmarkOnlyReport.gf2Comparison.markowitzMethod} · deps={benchmarkOnlyReport.gf2Comparison.markowitzDepsTested} · solved={String(benchmarkOnlyReport.gf2Comparison.markowitzFactorFound)}
              </div>
            </div>
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-1">
              <div className="text-[11px] text-[#57534E] font-bold">Block Wiedemann (Krylov + BM)</div>
              <div className="text-lg font-bold text-[#1E3A8A]">{benchmarkOnlyReport.gf2Comparison.blockWiedemannMs} ms</div>
              <div className="text-[11px] text-[#57534E]">
                method={benchmarkOnlyReport.gf2Comparison.blockWiedemannMethod} · krylov={benchmarkOnlyReport.gf2Comparison.blockWiedemannKrylovSteps} · solved={String(benchmarkOnlyReport.gf2Comparison.blockWiedemannFactorFound)}
              </div>
            </div>
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-1">
              <div className="text-[11px] text-[#57534E] font-bold">Montgomery-REDC vs Naive ({benchmarkOnlyReport.redcBenchmark.nBits}b)</div>
              <div className="text-lg font-bold text-[#9A3412]">
                {benchmarkOnlyReport.redcBenchmark.speedupPct >= 0
                  ? `+${benchmarkOnlyReport.redcBenchmark.speedupPct}%`
                  : `${benchmarkOnlyReport.redcBenchmark.speedupPct}%`}
              </div>
              <div className="text-[11px] text-[#57534E]">
                REDC={benchmarkOnlyReport.redcBenchmark.redcNsPerMul} ns · Naive={benchmarkOnlyReport.redcBenchmark.naiveNsPerMul} ns · {(benchmarkOnlyReport.redcBenchmark.opsPerSec / 1e6).toFixed(2)}M ops/s
              </div>
            </div>
          </div>

          <p className="text-xs text-[#57534E]">{benchmarkOnlyReport.gf2Comparison.auditNoteAr}</p>

          <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg" dir="ltr">
            <table className="w-full text-left text-xs font-mono-tabular">
              <thead className="bg-[#F4F0E8] text-[#1C1917] border-b border-[#E2DDD2]">
                <tr>
                  <th className="p-2.5">Zeta Zeros (K_γ)</th>
                  <th className="p-2.5">RMSE vs π(x) [10..300]</th>
                  <th className="p-2.5">Max |R_K(x) - π(x)|</th>
                  <th className="p-2.5">π(300) Actual</th>
                  <th className="p-2.5">R_K(300) Approx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE5DA]">
                {benchmarkOnlyReport.zetaTruncationAudit.zerosCompared.map((row) => (
                  <tr key={row.kZeros}>
                    <td className="p-2.5 font-bold text-[#1E3A8A]">{row.kZeros} zeros</td>
                    <td className="p-2.5 font-bold text-[#14532D]">{row.rmseVsPi}</td>
                    <td className="p-2.5 text-[#9A3412]">{row.maxAbsError}</td>
                    <td className="p-2.5">{row.piActualAtMaxX}</td>
                    <td className="p-2.5">{row.riemannApproxAtMaxX}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] font-mono text-[#57534E]" dir="ltr">
            Bound: {benchmarkOnlyReport.zetaTruncationAudit.errorBoundFormula}
          </div>
        </div>
      )}

      {/* Scientific Epistemic Claim Registry (Proven vs Empirical vs Hypothesis) */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 space-y-4">
        <div className="border-b border-[#E2DDD2] pb-3 space-y-1">
          <h3 className="text-base font-bold font-serif-academic text-[#1C1917]">
            {isRTL
              ? 'سجل التصنيف العلمي لوحدات Chronos (المثبت رياضياً مقابل التجريبي والفرضيات)'
              : 'Registre Épistémique Chronos (Prouvé vs Empirique vs Hypothèses)'}
          </h3>
          <p className="text-xs text-[#57534E]">
            {isRTL
              ? 'تمييز إلزامي يمنع الخلط بين النظريات الخوارزمية المثبتة وبين فرضيات الترتيب الطيفي أو شروط الهجمات المتخصصة.'
              : 'Classification stricte distinguant les algorithmes généraux prouvés des hypothèses heuristiques et attaques spécialisées.'}
          </p>
        </div>

        <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[#F4F0E8] text-[#1C1917] font-mono border-b border-[#E2DDD2]">
              <tr>
                <th className="p-3 text-right">{isRTL ? 'المكوّن الخوارزمي' : 'Composant'}</th>
                <th className="p-3 text-right">{isRTL ? 'التصنيف العلمي' : 'Statut'}</th>
                <th className="p-3 text-right">{isRTL ? 'النطاق والضمان الرياضي' : 'Portée mathématique'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE5DA]">
              {CHRONOS_CLAIM_REGISTRY.map(item => {
                const tInfo = TIER_LABELS[item.tier];
                return (
                  <tr key={item.id}>
                    <td className="p-3 font-bold text-[#1C1917]">
                      {isRTL ? item.componentNameAr : item.componentNameEn}
                    </td>
                    <td className={`p-3 font-mono font-bold ${tInfo.colorClass}`}>
                      {isRTL ? tInfo.ar : tInfo.fr}
                    </td>
                    <td className="p-3 text-[#57534E]">
                      <div>{isRTL ? item.statusAr : item.statusEn}</div>
                      <div className="text-[11px] font-mono text-[#78716C] mt-0.5" dir="ltr">
                        {item.mathematicalScope}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CmveVerificationPanel;
