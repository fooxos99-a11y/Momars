import { BookOpen, ClipboardCheck, GraduationCap, ListChecks, ScrollText, Trophy } from "lucide-react";

type Stat = {
  icon: typeof BookOpen;
  value: string;
  label: string;
};

const stats: Stat[] = [
  { icon: GraduationCap, value: "28", label: "ساعة تدريبية" },
  { icon: BookOpen, value: "12", label: "دورة تدريبية" },
  { icon: ListChecks, value: "8", label: "مهام أدائية" },
  { icon: ClipboardCheck, value: "24", label: "اختبار قبلي وبعدي" },
  { icon: ScrollText, value: "✦", label: "عرض القرآن" },
  { icon: Trophy, value: "✦", label: "الاختبار النهائي" },
];

const Stats = () => {
  return (
    <section className="relative overflow-hidden gradient-page py-24">
      {/* Decorative blobs */}
      <div className="absolute -top-40 -right-32 w-[28rem] h-[28rem] rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--accent)) 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
        aria-hidden
      />

      <div className="container relative">
        {/* Heading */}
        <div className="text-center mb-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-accent-soft px-4 py-1.5 text-xs font-bold tracking-wide text-primary shadow-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>نظرة سريعة</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-foreground">
            لمحة عن <span className="text-gradient-gold">البرنامج</span>
          </h2>
          <div className="mx-auto mt-5 h-1 w-20 rounded-full bg-accent" />
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-5">
          {stats.map((s) => {
            return (
              <article
                key={s.label}
                className="group relative overflow-hidden rounded-[1.85rem] border border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(227,245,249,0.94))] p-5 text-center shadow-card transition-smooth hover:-translate-y-1.5 hover:shadow-elegant md:p-6"
              >
                <div className="absolute inset-x-4 top-0 h-1 rounded-b-full gradient-primary opacity-90" aria-hidden />
                <div className="absolute -left-10 -top-10 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-smooth group-hover:scale-110" aria-hidden />
                <div className="absolute -bottom-12 -right-8 h-28 w-28 rounded-full border border-primary/10" aria-hidden />

                {/* Icon */}
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[1.35rem] gradient-primary shadow-gold transition-smooth group-hover:scale-105 group-hover:rotate-3">
                  <s.icon className="size-7 text-primary-foreground" />
                </div>

                {/* Value */}
                <div className="mb-2 text-4xl font-extrabold leading-none tabular-nums text-primary md:text-5xl">
                  {s.value}
                </div>

                {/* Divider */}
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-primary/35 transition-smooth group-hover:w-14 group-hover:bg-primary/60" />

                {/* Label */}
                <div className="text-sm font-bold leading-snug text-foreground/85 md:text-[0.95rem]">
                  {s.label}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Stats;
