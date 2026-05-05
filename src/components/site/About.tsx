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
            <ul className="grid grid-cols-1 gap-4 text-right md:grid-cols-2 md:gap-5">
              {goals.map((g) => (
                <li
                  key={g}
                  className="rounded-[1.7rem] border border-primary/15 bg-white/90 px-6 py-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition-smooth hover:border-primary/25"
                >
                  <p className="text-base font-bold leading-8 text-[#0a4c61] md:text-[1.02rem]">{g}</p>
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
