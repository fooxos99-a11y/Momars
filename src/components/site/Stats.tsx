type Stat = {
  value: string;
  label: string;
};

const stats: Stat[] = [
  { value: "28", label: "ساعة تدريبية" },
  { value: "12", label: "دورة تدريبية" },
  { value: "8", label: "مهام أدائية" },
  { value: "24", label: "اختبار قبلي وبعدي" },
  { value: "✦", label: "عرض القرآن" },
  { value: "✦", label: "الاختبار النهائي" },
];

const Stats = () => {
  return (
    <section className="relative overflow-hidden gradient-page py-24">
      <div className="absolute -top-40 -right-32 w-[28rem] h-[28rem] rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <div className="container relative">
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

        <div className="grid grid-cols-3 md:grid-cols-6 gap-6 md:gap-8 justify-items-center">
          {stats.map((s) => (
            <article key={s.label} className="flex flex-col items-center gap-3 text-center">
              <div className="relative grid h-28 w-28 place-items-center rounded-full border-4 border-primary/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(227,245,249,0.94))] shadow-[0_6px_24px_rgba(13,111,143,0.15)] transition-smooth hover:-translate-y-1 hover:shadow-[0_10px_32px_rgba(13,111,143,0.22)] hover:border-primary/40 md:h-32 md:w-32">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/5 to-transparent" aria-hidden />
                <span className="relative text-3xl font-extrabold leading-none tabular-nums text-primary md:text-4xl">{s.value}</span>
              </div>
              <span className="text-sm font-bold leading-snug text-foreground/80 md:text-[0.95rem]">{s.label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
