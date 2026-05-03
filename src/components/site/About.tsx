import { Check } from "lucide-react";

const goals = [
  "التعرّف على أهمية العلم الشرعي وأهم مسائل العقيدة والطهارة والصلاة",
  "إتقان أساسيات تعليم القرآن الكريم ومبادئ علم التجويد",
  "توظيف الأساليب التربوية المناسبة في التعامل مع الطلاب",
  "استحضار أهمية الرسالة التعليمية والالتزام بها",
  "تطبيق مهارات التواصل والتخطيط في البيئة التعليمية",
  "إدارة الحلقة القرآنية وتنظيمها بكفاءة",
];

const About = () => {
  return (
    <section id="about" className="py-24 gradient-page">
      <div className="container">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-soft text-primary text-sm font-semibold mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            لمحة عن البرنامج
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold leading-tight mb-6">
            برنامج <span className="text-gradient-gold">رخصة ممارس</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            برنامج تأهيلي يُعنى بإعداد معلمي ومعلمات القرآن عبر أربع مجالات رئيسة
            (الشرعي، التعليمي، التربوي، المهاري)، بهدف تأهيلهم لقيادة الحلقة
            القرآنية بكفاءة وفاعلية.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-10">
            يتضمن البرنامج لقاءات تدريبية حضورية ومهام أدائية إضافة إلى عرض
            القرآن، بما يعزز كفاءة المعلم والمعلمة في تعليم القرآن.
          </p>

          <div className="pt-10 border-t border-border">
            <h3 className="text-2xl md:text-3xl font-extrabold mb-8">
              أهداف <span className="text-gradient-gold">البرنامج</span>
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
              {goals.map((g) => (
                <li
                  key={g}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-primary/10 shadow-soft hover:shadow-card transition-smooth"
                >
                  <span className="w-7 h-7 rounded-full bg-primary grid place-items-center shrink-0 mt-0.5">
                    <Check className="size-4 text-primary-foreground" strokeWidth={3} />
                  </span>
                  <span className="text-primary leading-relaxed font-semibold">{g}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
