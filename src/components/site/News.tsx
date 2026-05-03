import { ArrowLeft, Calendar } from "lucide-react";
import SectionHeading from "./SectionHeading";
import g1 from "@/assets/gallery-1.jpg";
import g3 from "@/assets/gallery-3.jpg";
import g4 from "@/assets/gallery-4.jpg";

const news = [
  {
    img: g4,
    date: "05 أكتوبر 2025",
    title: "حدث دعوي مميز في القصيم",
    desc: "أقامت الجمعية حدثاً دعوياً مميزاً بحضور أكثر من 500 شخص من مختلف الجنسيات للتعرف على الإسلام.",
  },
  {
    img: g3,
    date: "31 ديسمبر 2025",
    title: "ملخص إنجازات الشهر",
    desc: "تقرير شامل عن إنجازات الجمعية خلال الشهر الماضي والبرامج المنفذة بنجاح.",
  },
  {
    img: g1,
    date: "28 ديسمبر 2025",
    title: "تقرير تبصّر في شهر",
    desc: "نتائج مشروع تبصّر للدعوة الإلكترونية والوصول لأكثر من 10,000 شخص حول العالم.",
  },
];

const News = () => {
  return (
    <section id="news" className="py-24 bg-background">
      <div className="container">
        <SectionHeading
          eyebrow="آخر الأخبار"
          title={<>أخبار <span className="text-gradient-gold">الجمعية</span></>}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {news.map((n) => (
            <article
              key={n.title}
              className="group bg-card rounded-3xl overflow-hidden shadow-card hover:shadow-elegant transition-smooth border border-border"
            >
              <div className="h-52 overflow-hidden">
                <img src={n.img} alt={n.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-smooth" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Calendar className="size-3.5" />
                  <span>{n.date}</span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-smooth">
                  {n.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
                  {n.desc}
                </p>
                <a href="#" className="inline-flex items-center gap-1 text-primary font-semibold text-sm hover:gap-2 transition-smooth">
                  اقرأ المزيد
                  <ArrowLeft className="size-4" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default News;
