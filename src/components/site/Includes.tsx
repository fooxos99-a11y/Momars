import { BookMarked, ClipboardList, FileCheck2, GraduationCap, Trophy } from "lucide-react";

type Item = {
  num: string;
  title: string;
  icon: typeof BookMarked;
};

const items: Item[] = [
  { num: "01", title: "لقاءات تدريبية حضورية", icon: GraduationCap },
  { num: "02", title: "مهام أدائية تطبيقية", icon: ClipboardList },
  { num: "03", title: "عرض القرآن", icon: BookMarked },
  { num: "04", title: "اختبارات قبلية وبعدية", icon: FileCheck2 },
  { num: "05", title: "اختبار نهائي", icon: Trophy },
];

const Includes = () => {
  return (
    <section id="includes" className="py-24 gradient-page relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border-2 border-primary" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border-2 border-primary" />
      </div>

      <div className="container relative">
        {/* Heading ribbon */}
        <div className="flex justify-center mb-20">
          <div className="relative inline-flex items-center px-10 py-5 rounded-b-3xl gradient-primary shadow-card">
            <span className="absolute -top-px left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-accent/60" />
            <h2 className="text-2xl md:text-4xl font-extrabold text-primary-foreground tracking-tight">
              ماذا يتضمن البرنامج؟
            </h2>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
          {items.map((it, idx) => (
            <article
              key={it.num}
              className="group relative rounded-3xl bg-background border border-border p-6 text-center shadow-soft hover:shadow-card transition-smooth hover:-translate-y-1"
              style={{
                animationDelay: `${idx * 80}ms`,
              }}
            >
              {/* Number badge */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                <div className="w-14 h-14 rounded-2xl gradient-primary grid place-items-center shadow-card rotate-6 group-hover:rotate-0 transition-smooth">
                  <span className="text-primary-foreground font-extrabold text-lg tabular-nums -rotate-6 group-hover:rotate-0 transition-smooth">
                    {it.num}
                  </span>
                </div>
              </div>

              {/* Icon */}
              <div className="mt-10 mb-4 flex justify-center">
                <div className="w-16 h-16 rounded-full bg-accent-soft grid place-items-center">
                  <it.icon className="size-7 text-primary" />
                </div>
              </div>

              {/* Title */}
              <h3 className="text-base md:text-lg font-bold text-foreground leading-snug">
                {it.title}
              </h3>

              {/* Decorative bottom bar */}
              <div className="mt-4 mx-auto w-10 h-1 rounded-full bg-accent/70 group-hover:w-16 transition-smooth" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Includes;
