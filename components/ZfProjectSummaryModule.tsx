import React, { useState } from 'react';
import MathFormula from './MathFormula';

export const ZfProjectSummaryModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'foundational' | 'exact' | 'modular' | 'rank' | 'hybrid' | 'spectral' | 'matrix'>('overview');

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 md:p-8 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2DDD2] pb-5">
          <div className="space-y-1">
            <div className="text-xs font-mono text-[#1E3A8A]">
              المَلْخَص العلمي والأرشيف المنهجي لمشروع ZF · الإصدارات 1 إلى 17
            </div>
            <h2 className="text-2xl md:text-3xl font-bold font-serif-academic text-[#1C1917]">
              ZF — Zeta Factorization / نمذجة وتحليل الأعداد شبه الأولية
            </h2>
            <p className="text-sm text-[#57534E] leading-relaxed max-w-4xl">
              توثيق علمي صارم يميّز بين المراحل التأسيسية، والحقائق الجبرية المثبتة، والفرضيات الخوارزمية للتنبؤ برتبة العامل والبصمات الطيفية للمصفوفات.
            </p>
          </div>
          <div className="bg-[#F4F0E8] px-4 py-3 rounded-lg border border-[#E2DDD2] text-xs font-mono text-[#1E3A8A] shrink-0 text-center">
            <div>المعادلة المرجعية الأساسية</div>
            <div className="font-bold text-sm mt-0.5">N = p · q , &nbsp; p ≤ q</div>
          </div>
        </div>

        {/* Quick Navigation sub-tabs */}
        <div className="flex flex-wrap gap-1.5 pt-2">
          {[
            { id: 'overview', label: '1. نظرة عامة والهدف' },
            { id: 'foundational', label: '2. المراحل ZF-1 إلى ZF-11' },
            { id: 'exact', label: '3. ZF-12 و ZF-13 (التحديث التزايدي)' },
            { id: 'modular', label: '4. ZF-14 (بصمة البواقي)' },
            { id: 'rank', label: '5. ZF-15 (رتبة العامل وزيتا)' },
            { id: 'hybrid', label: '6. ZF-16 (الدمج مع Pollard-Brent)' },
            { id: 'spectral', label: '7. ZF-17 (التحليل الطيفي)' },
            { id: 'matrix', label: '8. جدول الإثباتات والمسارات' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-[#F4F0E8] hover:bg-[#EAE5DA] text-[#1C1917] border border-[#E2DDD2]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Panels */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-6 md:p-8 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              الهدف العام لمشروع ZF
            </h3>
            <p className="text-sm text-[#57534E] leading-relaxed">
              تطوير محرك رياضي وحاسوبي لاستخراج العاملين الأوليين لعدد شبه أولي <MathFormula tex="N = p \cdot q" className="mx-1" />، مع محاولة الاستفادة من العلاقات المرتبطة بدالة زيتا لريمان، ودّ الأعداد الأولية، والمصفوفات، والحساب الموديولي، ثم دمج هذه الأفكار مع خوارزميات التحليل المعروفة.
            </p>
            <div className="bg-[#FBF9F5] p-5 rounded-lg border border-[#E2DDD2] space-y-3">
              <h4 className="text-xs font-bold font-mono text-[#1E3A8A] uppercase">منهجية المراجعة والتصحيح العلمي</h4>
              <p className="text-xs text-[#57534E] leading-relaxed">
                يتم التمييز بدقة تامة بين:
              </p>
              <ul className="list-disc list-inside text-xs text-[#57534E] space-y-1 pl-2">
                <li><strong>الحقائق الجبرية والتحتية المثبتة:</strong> مثل صيغ التحديث التزايدي في ZF-12 و ZF-13.</li>
                <li><strong>الفرضيات والتجارب الاحتمالية:</strong> مثل تقدير رتبة العامل عبر دالة زيتا والتقريبات الأولية (ZF-15) والبصمات الطيفية للمصفوفات (ZF-17).</li>
                <li><strong>التجنب الحاسم:</strong> عدم اختراع أسماء أو معادلات غير موثقة للإصدارات الأولى التي لا تتوفر تفاصيلها الأصلية.</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'foundational' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              أولاً: المراحل التأسيسية ZF-1 إلى ZF-11 (توثيق جزئي)
            </h3>
            <p className="text-sm text-[#57534E] leading-relaxed">
              لا تتوفر تفاصيل موثوقة وكاملة لكل إصدار على حدة من ZF-1 إلى ZF-11، ولذلك لا يصح نسبة نظرية أو معادلة محددة دون الرجوع إلى النصوص الأصلية. ومع ذلك، يمكن تحديد المحاور الرئيسية التي تشكلت وظهرت في التطور اللاحق للمشروع:
            </p>

            <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#F4F0E8] text-[#1C1917] font-mono border-b border-[#E2DDD2]">
                  <tr>
                    <th className="p-3">المحور الأساسي</th>
                    <th className="p-3">الفكرة الرياضية والهدف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2DDD2]">
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">التحليل المباشر</td>
                    <td className="p-3 text-[#57534E]">البحث عن العوامل القاسمية <MathFormula tex="p \le \sqrt{N}" className="mx-1" />.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">نظرية الأعداد</td>
                    <td className="p-3 text-[#57534E]">دراسة خصائص الأعداد الأولية وتوزّعها وقواسمها.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">دالة زيتا</td>
                    <td className="p-3 text-[#57534E]">محاولة ربط توزيع الأوليات (عبر أصفار زيتا ودالة J) بتحليل الأعداد شبه الأولية.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">مبرهنة Lehman</td>
                    <td className="p-3 text-[#57534E]">استخدام شروط جبرية وعددية لتقليص فضاء البحث التربيعي.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">الحساب الموديولي</td>
                    <td className="p-3 text-[#57534E]">استبعاد المرشحين الذين لا يحققون شروط البواقي المطلوبة.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">الجذور التربيعية</td>
                    <td className="p-3 text-[#57534E]">استغلال الفروق بين المربعات والمتباينات لتقريب الجذر.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">المصفوفات</td>
                    <td className="p-3 text-[#57534E]">تمثيل العلاقات العددية والمتطابقات في صورة مصفوفية.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-xs text-[#9A3412] italic">
              * ملحوظة منهجية: هذه محاور ظهرت في المشروع، وليست ادعاءً بأن كل محور كان إصداراً مستقلاً بعينه. يتطلب الأمر تقارير ZF-1 إلى ZF-11 الأصلية لملء التسلسل التاريخي بدقة.
            </div>
          </div>
        )}

        {activeTab === 'exact' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              ثانياً وثالثاً: ZF-12 و ZF-13 (التحديث التزايدي الدقيق وتصفية البواقي)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#FBF9F5] p-5 rounded-lg border border-[#E2DDD2] space-y-3">
                <div className="text-xs font-mono font-bold text-[#1E3A8A]">ZF-12: Incremental Exact Outer Root</div>
                <p className="text-xs text-[#57534E] leading-relaxed">
                  تحويل الحسابات المتكررة إلى تحديثات تزايدية دون إعادة حساب الجذر التربيعي في كل خطوة:
                </p>
                <div className="bg-white p-3 rounded border border-[#E2DDD2] text-center font-mono text-xs">
                  <MathFormula tex="A_k = \left\lfloor\sqrt{4kN}\right\rceil" />
                </div>
                <p className="text-xs text-[#57534E]">مع الهوية الأساسية والتحديث التزايدي:</p>
                <div className="bg-white p-3 rounded border border-[#E2DDD2] text-center font-mono text-xs">
                  <MathFormula tex="D(k, t+1) = D(k, t) + 2A_k + 2t + 1" />
                </div>
              </div>

              <div className="bg-[#FBF9F5] p-5 rounded-lg border border-[#E2DDD2] space-y-3">
                <div className="text-xs font-mono font-bold text-[#14532D]">ZF-13: Incremental Exact Candidate Evaluation</div>
                <p className="text-xs text-[#57534E] leading-relaxed">
                  تقليل تكلفة اختبار المرشحين عبر تحديث البواقي الموديولية مباشرة:
                </p>
                <div className="bg-white p-3 rounded border border-[#E2DDD2] text-center font-mono text-xs">
                  <MathFormula tex="R_m(k, t+1) = (R_m(k, t) + 2A_k + 2t + 1) \bmod m" />
                </div>
                <p className="text-xs text-[#57534E]">
                  <strong>النتيجة:</strong> ZF-13.1-Lazy أظهر تحسناً تجريبياً في الحالات المختبرة، بينما لم يثبت ZF-13.2 تفوقاً زمنياً عاماً.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'modular' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              رابعاً: ZF-14 — Modular Residue Fingerprint
            </h3>
            <p className="text-sm text-[#57534E] leading-relaxed">
              دراسة متجه البواقي للمرشحين عبر عدة موديولات:
            </p>
            <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] text-center font-mono text-xs">
              <MathFormula tex="V_N(x) = \left( x^2 \bmod m_1, \ldots, x^2 \bmod m_k \right)" />
            </div>
            <div className="bg-[#FFFBEB] border border-[#FDE68A] p-4 rounded-lg space-y-2">
              <div className="text-xs font-bold text-[#92400E]">المشكلة الرياضية والتصحيح:</div>
              <p className="text-xs text-[#78350F] leading-relaxed">
                مع موديولات أولية فيما بينها، فإن مبرهنة الباقي الصيني (CRT) تجعل متجه البواقي مكافئاً لمعلومة الباقي <MathFormula tex="\bmod \prod m_i" className="mx-1" />. إذن المتجه ليس مصدراً مستقلاً لمعلومات جديدة عن العامل، رغم إمكانية استخدامه لتنظيم الجداول أو القفزات.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'rank' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              خامساً: ZF-15 — Prime Rank / دالة عدّ الأوليات
            </h3>
            <p className="text-sm text-[#57534E] leading-relaxed">
              الانتقال من اختبار المرشحين إلى محاولة توقع رتبة العامل في تسلسل الأعداد الأولية:
            </p>
            <div className="bg-[#FBF9F5] p-5 rounded-lg border border-[#E2DDD2] space-y-4">
              <div className="text-center font-mono text-xs">
                <MathFormula tex="r = \pi(p), \quad s = \pi(q) \implies N = P(r)P(s)" />
              </div>
              <p className="text-xs text-[#57534E] leading-relaxed">
                استُخدمت الصيغة الصريحة لدالة زيتا وجسر ريمان عبر دالة <MathFormula tex="J(x)" /> وعلاقة موبيوس لاستنتاج تقديرات <MathFormula tex="\pi(x)" />.
              </p>
              <div className="bg-[#FFF1F2] border border-[#FECDD3] p-4 rounded-lg space-y-2">
                <div className="text-xs font-bold text-[#9F1239]">التصحيح الرياضي الهام:</div>
                <p className="text-xs text-[#881337] leading-relaxed">
                  المعادلة تحوي مجهولين ولا يمكن تحديد العاملين منها مباشرة. كما أن تقدير <MathFormula tex="r_0 \approx \pi(\sqrt{N})" /> لا يضمن قرب رتبة العامل الأصغر إذا كان العددان غير متوازنين. نطاقات الخطأ الواسعة مثل <MathFormula tex="r_0 \pm 100000" /> هي فرضيات تجريبية وليست حوداً مضمونة.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'hybrid' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              سادساً: ZF-16 — Hybrid Rank-Rho (دمج التنبؤ بالتحليل الاحتمالي)
            </h3>
            <p className="text-sm text-[#57534E] leading-relaxed">
              دمج تقدير رتبة العامل مع خوارزمية Pollard–Brent وتوليد المسارات المتعددة:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
                <div className="text-xs font-mono font-bold text-[#1E3A8A]">ZF-16.1: Adaptive Pollard-Brent</div>
                <p className="text-xs text-[#57534E]">
                  استخدام دالة التكرار <MathFormula tex="f(x) = x^2 + c \bmod N" /> وتجميع الفروق <MathFormula tex="q = \prod |x - y_i| \bmod N" /> لحساب <MathFormula tex="d = \gcd(q, N)" />.
                </p>
              </div>
              <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
                <div className="text-xs font-mono font-bold text-[#14532D]">ZF-16.2: Modular-Guided Seeds</div>
                <p className="text-xs text-[#57534E]">
                  اشتقاق البذور والثوابت عبر بصمة موديولية SHA-256. (التصحيح: طريقة حتمية لاختيار البذور وليس استخراجاً لمعلومات العامل من البواقي).
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'spectral' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              سابعاً: ZF-17 — Spectral Matrix Factorization (فرضية بحثية)
            </h3>
            <p className="text-sm text-[#57534E] leading-relaxed">
              إدخال البنية الطيفية للمصفوفات عبر تحليل القيم المفردة <MathFormula tex="A = U \Sigma V^T" /> والإنتروبيا الطيفية ورقم الشرط <MathFormula tex="\kappa(A)" /> لإنتاج بصمات طيفية.
            </p>
            <div className="bg-[#FBF9F5] p-5 rounded-lg border border-[#E2DDD2] space-y-3">
              <div className="text-xs font-mono font-bold text-[#9A3412]">الانتقال المنهجي المقصور في ZF-17:</div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono bg-white p-3 rounded border border-[#E2DDD2]">
                <span className="text-[#57534E]">Spectral Hash ⟶ Rho Seeds</span>
                <span className="text-[#1E3A8A] font-bold">إلى</span>
                <span className="text-[#14532D] font-bold">Spectral Features ⟶ Candidate Probability Ranking</span>
              </div>
              <p className="text-xs text-[#57534E]">
                أي إنتاج ترتيب احتمالي للمرشحين بناءً على إشارة طيفية قابلة للاختبار، بدلاً من مجرد بذور عشوائية حتمية.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-serif-academic text-[#1C1917] border-b border-[#E2DDD2] pb-3">
              ثامناً وتاسعاً وعاشراً: خريطة الإثباتات والمسارات الثلاثة
            </h3>

            <div className="overflow-x-auto border border-[#E2DDD2] rounded-lg">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#F4F0E8] text-[#1C1917] font-mono border-b border-[#E2DDD2]">
                  <tr>
                    <th className="p-3">الفكرة أو المكون</th>
                    <th className="p-3">التقييم الحالي والإثبات العلمي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2DDD2]">
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">التحديث التزايدي (ZF-12)</td>
                    <td className="p-3 text-[#14532D] font-semibold">صحيح جبرياً في الصيغ المدققة (خط أساس دقيق).</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">التصفية الموديولية (ZF-13)</td>
                    <td className="p-3 text-[#57534E]">صحيحة ضمن شروطها، مع تحسن تجريبي محدود (Lazy).</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">بصمة البواقي (ZF-14)</td>
                    <td className="p-3 text-[#9A3412]">لا تضيف تلقائياً معلومات مستقلة جديدة عن العوامل.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">رتبة العامل وزيتا (ZF-15)</td>
                    <td className="p-3 text-[#57534E]">علاقة صحيحة، لكن التنبؤ الدقيق غير مثبت عملياً.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">دمج Pollard–Brent (ZF-16)</td>
                    <td className="p-3 text-[#57534E]">تنفيذ تجريبي، والتفوق الزمني العام غير مثبت.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-[#1E3A8A]">البصمة الطيفية (ZF-17)</td>
                    <td className="p-3 text-[#9A3412]">فرضية بحثية لم تثبت قدرتها بعد على التنبؤ بالعوامل بكفاءة.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
                <div className="text-xs font-bold text-[#1E3A8A]">المسار الأول: Exact Engine</div>
                <div className="font-mono text-[11px] text-[#1C1917]">Lehman + Incremental + Filtering</div>
                <p className="text-xs text-[#57534E]">الهدف: تقليل العمليات مع الحفاظ على اكتمال البحث.</p>
              </div>
              <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
                <div className="text-xs font-bold text-[#14532D]">المسار الثاني: Prime Rank</div>
                <div className="font-mono text-[11px] text-[#1C1917]">π(x) + Li(x) + ζ(s)</div>
                <p className="text-xs text-[#57534E]">الهدف: تقدير موقع العامل في تسلسل الأوليات.</p>
              </div>
              <div className="bg-[#FBF9F5] p-4 rounded-lg border border-[#E2DDD2] space-y-2">
                <div className="text-xs font-bold text-[#9A3412]">المسار الثالث: Spectral Ranking</div>
                <div className="font-mono text-[11px] text-[#1C1917]">A_i ⟶ Σ_i ⟶ S_N(d)</div>
                <p className="text-xs text-[#57534E]">الهدف: ترتيب احتمالي للمرشحين بإشارة طيفية.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZfProjectSummaryModule;
