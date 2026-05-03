import { HandHeart, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionHeading from "./SectionHeading";
import careImg from "@/assets/project-care.jpg";
import quranImg from "@/assets/project-quran.jpg";
import giftImg from "@/assets/project-gift.jpg";

const items = [
  {
    img: careImg,
    title: "كفالة مسلم جديد",
    desc: "ساهم في رعاية مسلم جديد لمدة عام كاملاً يشمل التعليم والمتابعة.",
    options: ["سهم واحد", "سهمان"],
    badge: "الأكثر طلباً",
  },
  {
    img: quranImg,
    title: "الصدقة اليومية",
    desc: "صدقة يومية مستمرة في وجوه الخير ومشاريع الدعوة.",
    options: ["صدقة يومية", "إهداء أجر"],
  },
  {
    img: giftImg,
    title: "مشروع تبصّر",
    desc: "ادعم طباعة وتوزيع المواد التعريفية بالإسلام بلغات متعددة.",
    options: ["دعم الطباعة", "دعم التوزيع"],
  },
];

const Donations = () => {
  return (
    <section id="donate" className="py-24 bg-background">
      <div className="container">
        <SectionHeading
          eyebrow="فرص التبرع"
          title={<>ساهم في دعم <span className="text-gradient-gold">المسلمين الجدد</span></>}
          description="اختر من بين فرص التبرع المتنوعة وكن سبباً في نشر الخير"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((it, i) => (
            <article
              key={it.title}
              className="group relative bg-card rounded-3xl overflow-hidden shadow-card hover:shadow-elegant transition-smooth border border-border"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="relative h-56 overflow-hidden">
                <img
                  src={it.img}
                  alt={it.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-110 transition-smooth"
                />
                {it.badge && (
                  <span className="absolute top-4 right-4 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-bold shadow-gold">
                    {it.badge}
                  </span>
                )}
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold text-foreground mb-2">{it.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                  {it.desc}
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {it.options.map((o) => (
                    <span
                      key={o}
                      className="px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold"
                    >
                      {o}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Plus className="size-4" />
                    أضف للسلة
                  </Button>
                  <Button variant="default" size="sm" className="flex-1">
                    <HandHeart className="size-4" />
                    تبرّع الآن
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Donations;
