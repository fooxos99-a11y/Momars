import { CalendarCheck, ClipboardCheck, Heart, ScrollText, BookOpen, Users } from "lucide-react";

const requirements = [
  { text: "حضور ما لا يقل عن (10) لقاءات من اللقاءات التدريبية", icon: CalendarCheck },
  { text: "تنفيذ (80%) من المهام الأدائية", icon: ClipboardCheck },
  { text: "اجتياز الاختبار النهائي بنسبة لا تقل عن (70%)", icon: ScrollText },
  { text: "الالتزام بآداب وأخلاقيات تعليم القرآن الكريم", icon: Heart },
];

const recitation = [
  { tag: "الرجال", text: "المعلمون: عرض كامل القرآن", icon: BookOpen },
  { tag: "النساء", text: "المعلمات: عرض (15) جزءًا", icon: BookOpen },
];

const Requirements = () => {
  return (
    <section id="requirements" className="py-24 gradient-page relative overflow-hidden">
      <div className="absolute -top-32 -left-20 w-96 h-96 rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <div className="container relative">
        {/* Heading ribbon */}
        <div className="flex justify-center mb-16 md:mb-20">
          <div className="relative inline-flex max-w-full items-center justify-center overflow-hidden rounded-t-sm rounded-b-[28px] bg-[linear-gradient(90deg,#0f5771_0%,#167190_48%,#1f86a6_100%)] px-7 py-5 shadow-[0_22px_45px_-28px_rgba(7,53,72,0.9)] before:absolute before:inset-x-10 before:top-0 before:h-1 before:rounded-full before:bg-[#0a485f] sm:px-12 md:px-16 md:py-6">
            <div className="absolute inset-x-3 bottom-0 h-5 rounded-b-[24px] bg-black/10 blur-xl" aria-hidden />
            <h2 className="relative text-center text-[1.85rem] font-black leading-none text-white drop-shadow-[0_3px_0_rgba(11,71,93,0.5)] sm:text-[2.25rem] md:text-[3rem]">
              متطلبات الحصول على الرخصة
            </h2>
          </div>
        </div>

        {/* Requirements list */}
        <div className="max-w-3xl mx-auto space-y-4">
          {requirements.map((r, idx) => (
            <div
              key={r.text}
              className="group flex items-center gap-4 rounded-2xl bg-accent-soft/50 border border-border px-5 py-4 shadow-soft hover:shadow-card hover:bg-accent-soft transition-smooth"
            >
              <span className="shrink-0 w-11 h-11 rounded-xl gradient-primary grid place-items-center shadow-card group-hover:scale-105 transition-smooth">
                <r.icon className="size-5 text-primary-foreground" />
              </span>
              <span className="text-foreground font-medium leading-relaxed flex-1">
                {r.text}
              </span>
              <span className="hidden sm:grid shrink-0 w-9 h-9 rounded-lg bg-background text-primary text-xs font-bold place-items-center tabular-nums border border-border">
                {String(idx + 1).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>

        {/* Recitation subsection */}
        <div className="max-w-3xl mx-auto mt-14">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-1.5 h-7 rounded-full bg-accent" />
            <h3 className="text-lg md:text-xl font-bold text-primary">
              إتمام عرض القرآن وفق الآتي:
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recitation.map((r) => (
              <div
                key={r.tag}
                className="relative rounded-2xl bg-accent-soft/50 border border-border px-5 py-5 shadow-soft hover:shadow-card transition-smooth"
              >
                <span className="absolute -top-3 right-4 px-3 py-1 rounded-full gradient-primary text-primary-foreground text-xs font-bold shadow-card">
                  {r.tag}
                </span>
                <div className="flex items-center gap-3 pt-1">
                  <span className="shrink-0 w-10 h-10 rounded-xl bg-background grid place-items-center border border-border">
                    <r.icon className="size-5 text-primary" />
                  </span>
                  <span className="text-foreground font-medium leading-relaxed">
                    {r.text}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Requirements;
