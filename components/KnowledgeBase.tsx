import React from 'react';
import { motion } from 'motion/react';
import { Language, translations } from '../translations';

interface KnowledgeBaseProps {
  lang: Language;
}

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ lang }) => {
  const t = translations[lang];
  const isRTL = lang === 'ar';

  return (
    <div className={`space-y-10 py-4 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Hero Overview */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-xl shadow-xl space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold font-mono">
            Σ
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-white">{t.kbTitle}</h2>
            <p className="text-xs md:text-sm text-slate-400">{t.kbOverview}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-2">
            <h3 className="text-sm font-bold text-amber-400">{t.kbWhy128Hard}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {t.kbWhy128HardText}
            </p>
          </div>

          <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-2">
            <h3 className="text-sm font-bold text-emerald-400">{t.kbInnovationTitle}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {t.kbInnovationText}
            </p>
          </div>
        </div>
      </motion.section>

      {/* Mathematical Methods Comparison */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          {isRTL ? "مقارنة الخوارزميات الرياضية لتحليل العوامل" : "Comparaison des Méthodes Algébriques de Factorisation"}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Method 1: MMFR */}
          <div className="bg-slate-900 border border-cyan-500/30 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-cyan-400 font-bold">1. MMFR (Nouvelle)</span>
              <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
                &gt; 128-bit
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              {isRTL ? "رنين المضاعفات الطيفية" : "Résonance Spectrale de Lehman"}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isRTL 
                ? "يبحث عن مضاعف k يجعل قواسم 4kN قريبة من بعضها، مما يخفض تعقيد المسافة بين الجذور إلى نافذة صغيرة قابلة للفحص السريع."
                : "Recherche un multiplicateur spectral k rapprochant les diviseurs de 4kN pour effondrer la complexité de l'intervalle de recherche quadratique."}
            </p>
            <div className="font-mono text-[11px] text-cyan-300 bg-slate-950 p-2 rounded border border-slate-800">
              t² - 4kN = r² ⟹ gcd(t-r, N)
            </div>
          </div>

          {/* Method 2: Montgomery ECM */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-emerald-400 font-bold">2. Lenstra ECM</span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                128-256 bit
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              {isRTL ? "منحنيات مونتغمري الإهليلجية" : "Courbes Elliptiques Projectives"}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isRTL 
                ? "يستغل عدم انتظام رتبة الزمرة الجبرية للمنحنى الإهليلجي modulo p لاكتشاف قاسم غير تافه عند انهيار الإحداثي المسقط Z."
                : "Exploite l'ordre lisse des groupes de courbes elliptiques modulo p pour extraire un diviseur non trivial dès que Z s'annule."}
            </p>
            <div className="font-mono text-[11px] text-emerald-300 bg-slate-950 p-2 rounded border border-slate-800">
              gcd(Z_k, N) = p
            </div>
          </div>

          {/* Method 3: Pollard's Rho */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400 font-bold">3. Pollard's Rho</span>
              <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800">
                32-64 bit
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              {isRTL ? "خوارزمية مفارقة أعياد الميلاد" : "Paradoxe des Anniversaires"}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isRTL 
                ? "يولد متتالية عشوائية كاذبة x_{i+1} = x_i² + c mod N، ويكشف التقاطع عند O(N^{1/4}) خطوات عبر خوارزمية برينت لتخطي الحلقات."
                : "Engendre une suite pseudo-aléatoire et détecte les collisions de cycles dans les résidus à l'aide de l'accélérateur de Brent."}
            </p>
            <div className="font-mono text-[11px] text-amber-300 bg-slate-950 p-2 rounded border border-slate-800">
              gcd(|x - y|, N) = p
            </div>
          </div>
        </div>
      </motion.section>

      {/* Mathematical Proof & Formulas */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4"
      >
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          {t.kbMathEquations}
        </h3>

        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs md:text-sm text-slate-300 space-y-2">
          <div className="text-cyan-400 font-bold">
            {isRTL ? "1. المتطابقة التربيعية:" : "1. Identité fondamentale :"}
          </div>
          <div>N = p · q &nbsp;⟺&nbsp; 4kN = 4k · p · q</div>
          <div>Soit s = ⌈√(4kN)⌉, on teste t = s, s+1, s+2, ...</div>
          <div>Si t² - 4kN = r² (carré parfait), alors :</div>
          <div className="text-amber-300">
            t² - r² = 4kN &nbsp;⟹&nbsp; (t - r)(t + r) = 4kN
          </div>
          <div>Comme gcd(t - r, N) divise N mais ≠ N (pour k bien choisi),</div>
          <div className="text-emerald-400 font-bold">
            gcd(t - r, N) = p &nbsp;&nbsp;et&nbsp;&nbsp; q = N / p &nbsp;∎
          </div>
        </div>
      </motion.section>
    </div>
  );
};

export default KnowledgeBase;
