import SectionHeading from "./SectionHeading";
import g1 from "@/assets/gallery-1.jpg";
import g2 from "@/assets/gallery-2.jpg";
import g3 from "@/assets/gallery-3.jpg";
import g4 from "@/assets/gallery-4.jpg";

const items = [
  { img: g1, title: "حفل تكريم المسلمين الجدد" },
  { img: g2, title: "دورة التأسيس العلمي" },
  { img: g4, title: "زيارة ميدانية" },
  { img: g3, title: "توزيع سلال رمضان" },
];

const Gallery = () => {
  return (
    <section id="gallery" className="py-24 bg-background">
      <div className="container">
        <SectionHeading
          eyebrow="معرض الصور"
          title={<>ألبوم <span className="text-gradient-gold">الصور</span></>}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <div
              key={it.title}
              className="group relative aspect-square rounded-3xl overflow-hidden shadow-card hover:shadow-elegant transition-smooth cursor-pointer"
            >
              <img src={it.img} alt={it.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-smooth" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-deep via-primary-deep/30 to-transparent opacity-80 group-hover:opacity-95 transition-smooth" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white translate-y-2 group-hover:translate-y-0 transition-smooth">
                <h3 className="font-bold">{it.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Gallery;
