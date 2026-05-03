import { BookOpenCheck, GraduationCap, HeartHandshake, Sparkles } from "lucide-react";

type Domain = {
  title: string;
  icon: typeof BookOpenCheck;
  items: string[];
};

const domains: Domain[] = [
  {
    title: "كفايات المجال الشرعي",
    icon: BookOpenCheck,
    items: [
      "أهمية العلم الشرعي وأثره في حياة المعلم/ة",
      "أهم مسائل التوحيد والإيمان",
      "أهم مسائل الطهارة",
      "الأحكام العامة للصلاة",
    ],
  },
  {
    title: "كفايات المجال التعليمي",
    icon: GraduationCap,
    items: [
      "مبادئ أحكام التجويد نظريًا وتطبيقيًا",
      "استراتيجيات تعليم القرآن الكريم",
      "مباحث وآداب قرآنية",
    ],
  },
  {
    title: "كفايات المجال التربوي",
    icon: HeartHandshake,
    items: [
      "مدخل في التربية وأهميتها وخصائصها",
      "خصائص المراحل العمرية واحتياجاتها",
      "الأساليب التربوية",
      "بناء القيم وتعزيز السلوك",
      "الصحة النفسية في البيئة التعليمية",
    ],
  },
  {
    title: "كفايات المجال المهاري",
    icon: Sparkles,
    items: [
      "مهارات التواصل الفعال",
      "إدارة الحلقة القرآنية",
      "تكامل شخصية المعلم",
      "مهارات التخطيط",
      "التعامل مع النظام التقني (ناظم)",
      "الدور الاستراتيجي للمعلم والمعلمة",
    ],
  },
];

const Competencies = () => {
  return (
    <section id="competencies" className="py-24 gradient-page relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <div className="container relative">
        {/* Heading ribbon */}
        <div className="flex justify-center mb-16 md:mb-20">
          <div className="relative inline-flex max-w-full items-center justify-center overflow-hidden rounded-t-sm rounded-b-[28px] bg-[linear-gradient(90deg,#0f5771_0%,#167190_48%,#1f86a6_100%)] px-7 py-5 shadow-[0_22px_45px_-28px_rgba(7,53,72,0.9)] before:absolute before:inset-x-10 before:top-0 before:h-1 before:rounded-full before:bg-[#0a485f] sm:px-12 md:px-16 md:py-6">
            <div className="absolute inset-x-3 bottom-0 h-5 rounded-b-[24px] bg-black/10 blur-xl" aria-hidden />
            <h2 className="relative text-center text-[1.85rem] font-black leading-none text-white drop-shadow-[0_3px_0_rgba(11,71,93,0.5)] sm:text-[2.25rem] md:text-[3rem]">
              مجالات وكفايات البرنامج
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {domains.map((d) => (
            <article
              key={d.title}
              className="group relative rounded-3xl bg-accent-soft/40 border border-border p-8 shadow-soft hover:shadow-card transition-smooth"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-border/70">
                <div className="flex items-center gap-3">
                  <span className="w-1 h-8 rounded-full bg-primary" />
                  <h3 className="text-xl md:text-2xl font-bold text-primary">
                    {d.title}
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-2xl gradient-primary grid place-items-center shadow-card shrink-0 group-hover:scale-105 transition-smooth">
                  <d.icon className="size-6 text-primary-foreground" />
                </div>
              </div>

              {/* Items list */}
              <ul className="space-y-3.5">
                {d.items.map((item, idx) => (
                  <li key={item} className="flex items-center gap-3 text-foreground">
                    <span className="shrink-0 w-7 h-7 rounded-md bg-primary/10 text-primary text-xs font-bold grid place-items-center tabular-nums">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm md:text-base leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Competencies;
