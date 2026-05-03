import SectionHeading from "./SectionHeading";

const partners = [
  { short: "وز", name: "وزارة الموارد البشرية" },
  { short: "هـ", name: "هيئة الأوقاف" },
  { short: "ق", name: "جامعة القصيم" },
  { short: "ر", name: "بنك الراجحي" },
  { short: "س", name: "أرامكو السعودية" },
  { short: "ع", name: "هيئة العمل الخيري" },
];

const Partners = () => {
  const list = [...partners, ...partners];

  return (
    <section className="py-20 gradient-soft">
      <div className="container">
        <SectionHeading
          eyebrow="شركاؤنا في النجاح"
          title={<>شركاؤنا</>}
          description="شريط هادئ وأنيق لعرض شعارات شركائنا الذين نعتز بشراكتهم في طريق الخير."
        />

        <div className="relative overflow-hidden mask-fade">
          <div className="flex gap-6 animate-marquee w-max">
            {list.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-4 bg-card rounded-2xl border border-border shadow-soft px-6 py-5 min-w-[260px]"
              >
                <div className="w-14 h-14 rounded-xl gradient-primary grid place-items-center text-primary-foreground font-bold text-xl shrink-0">
                  {p.short}
                </div>
                <div>
                  <div className="font-bold text-foreground">{p.name}</div>
                  <div className="text-xs text-muted-foreground">شريك استراتيجي</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .mask-fade {
          mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
        }
      `}</style>
    </section>
  );
};

export default Partners;
