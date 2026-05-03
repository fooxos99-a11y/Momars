import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionHeading from "./SectionHeading";
import careImg from "@/assets/project-care.jpg";
import quranImg from "@/assets/project-quran.jpg";

const projects = [
  {
    img: careImg,
    title: "مشروع هداية",
    desc: "برنامج متكامل يقدّم الدعم العلمي والروحي للمسلمين الجدد عبر دروس وجلسات مخصصة.",
    options: ["سهم مشروع", "سهمان"],
  },
  {
    img: quranImg,
    title: "مشروع الرعاية الشهرية",
    desc: "اشتراك شهري لدعم استمرارية برامج الجمعية وضمان تواصل الرعاية على مدار العام.",
    options: ["داعم", "داعم رئيسي"],
  },
];

const Projects = () => {
  return (
    <section id="projects" className="py-24 gradient-soft relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />

      <div className="container relative">
        <SectionHeading
          eyebrow="المشاريع"
          title={<>ادعم <span className="text-gradient-gold">مشاريع الجمعية</span></>}
          description="اختر أحد المشاريع الحالية وشارك في دعمه بنفس المرونة المتاحة في فرص التبرع."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {projects.map((p) => (
            <article
              key={p.title}
              className="group bg-card rounded-3xl overflow-hidden shadow-card hover:shadow-elegant transition-smooth flex flex-col md:flex-row border border-border"
            >
              <div className="md:w-2/5 h-56 md:h-auto overflow-hidden">
                <img
                  src={p.img}
                  alt={p.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-110 transition-smooth"
                />
              </div>
              <div className="flex-1 p-6 md:p-8 flex flex-col">
                <h3 className="text-2xl font-bold text-foreground mb-3">{p.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-5 flex-1">{p.desc}</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {p.options.map((o) => (
                    <span key={o} className="px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
                      {o}
                    </span>
                  ))}
                </div>
                <Button variant="default" className="w-fit">
                  ادعم المشروع
                  <ArrowLeft className="size-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;
