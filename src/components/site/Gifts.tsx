import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionHeading from "./SectionHeading";
import giftImg from "@/assets/project-gift.jpg";
import quranImg from "@/assets/project-quran.jpg";

const gifts = [
  {
    img: quranImg,
    title: "إهداء صدقة جارية",
    desc: "بطاقة إهداء أنيقة لصدقة جارية باسم من تحب.",
    options: ["إهداء عام", "إهداء مميز"],
    cta: "أهدِ الآن",
  },
  {
    img: giftImg,
    title: "إهداء مشروع خيري",
    desc: "إهداء مشاركة في مشروع خيري بصورة مخصصة وبيانات واضحة.",
    options: ["سهم إهداء", "سهمان"],
    cta: "أرسل الإهداء",
  },
];

const Gifts = () => {
  return (
    <section id="gifts" className="py-24 bg-background">
      <div className="container">
        <SectionHeading
          eyebrow="الإهداءات"
          title={<>قدّم <span className="text-gradient-gold">إهداءً مباركًا</span></>}
          description="اختر بطاقة الإهداء المناسبة، واكتب من وإلى، وسنجهّز بطاقة باسم الشخص المُهدى له."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {gifts.map((g) => (
            <article
              key={g.title}
              className="group relative rounded-3xl overflow-hidden shadow-card hover:shadow-elegant transition-smooth"
            >
              <img src={g.img} alt={g.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-smooth" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-deep via-primary-deep/70 to-primary-deep/20" />

              <div className="relative p-8 min-h-[380px] flex flex-col justify-end text-white">
                <span className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-bold mb-4 shadow-gold">
                  <Gift className="size-3.5" />
                  إهداء
                </span>
                <h3 className="text-2xl font-bold mb-2">{g.title}</h3>
                <p className="text-white/85 mb-5">{g.desc}</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {g.options.map((o) => (
                    <span key={o} className="px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-xs font-semibold border border-white/20">
                      {o}
                    </span>
                  ))}
                </div>
                <Button variant="hero" className="w-fit">
                  {g.cta}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Gifts;
