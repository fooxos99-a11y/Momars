import { CalendarDays, Clock, MapPin } from "lucide-react";

const startDates = [
  { tag: "الرجال", text: "يوم الإثنين 18 / 10 / 1447هـ" },
  { tag: "النساء", text: "يوم السبت 23 / 10 / 1447هـ" },
];

const Duration = () => {
  return (
    <section id="duration" className="py-24 gradient-page relative overflow-hidden">
      <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-primary/5 blur-3xl" aria-hidden />

      <div className="container relative">
        {/* Heading ribbon */}
        <div className="flex justify-center mb-16">
          <div className="relative inline-flex items-center px-10 py-5 rounded-b-3xl gradient-primary shadow-card">
            <span className="absolute -top-px left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-accent/60" />
            <h2 className="text-2xl md:text-4xl font-extrabold text-primary-foreground tracking-tight">
              مدة البرنامج وآلية التنفيذ
            </h2>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          {/* Quick info chips */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
            <div className="flex items-center gap-3 rounded-2xl bg-background border border-border px-4 py-3 shadow-soft">
              <span className="w-10 h-10 rounded-xl gradient-primary grid place-items-center shrink-0">
                <Clock className="size-5 text-primary-foreground" />
              </span>
              <div className="leading-tight">
                <div className="text-xs text-muted-foreground">المدة</div>
                <div className="font-bold text-foreground">ستة أسابيع</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-background border border-border px-4 py-3 shadow-soft">
              <span className="w-10 h-10 rounded-xl gradient-primary grid place-items-center shrink-0">
                <CalendarDays className="size-5 text-primary-foreground" />
              </span>
              <div className="leading-tight">
                <div className="text-xs text-muted-foreground">التكرار</div>
                <div className="font-bold text-foreground">دورتان أسبوعيًا</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-background border border-border px-4 py-3 shadow-soft">
              <span className="w-10 h-10 rounded-xl gradient-primary grid place-items-center shrink-0">
                <MapPin className="size-5 text-primary-foreground" />
              </span>
              <div className="leading-tight">
                <div className="text-xs text-muted-foreground">آلية التنفيذ</div>
                <div className="font-bold text-foreground">حضوريًا</div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-3xl bg-background border border-border p-6 md:p-8 shadow-soft space-y-4 text-foreground leading-loose">
            <p>
              مدة البرنامج ستة أسابيع، بواقع دورتين تدريبيتين أسبوعيًا، يتخللها
              تنفيذ مهام أدائية واختبارات قبلية وبعدية، إضافة إلى عرض القرآن
              واختبار نهائي.
            </p>
            <p>
              يُنفّذ البرنامج حضوريًا، وفق الجدول التدريبي المعتمد لكل من
              المعلمين والمعلمات.
            </p>
          </div>

          {/* Start dates */}
          <div className="mt-12">
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px flex-1 bg-border" />
              <h3 className="text-lg md:text-xl font-bold text-primary px-2">
                بداية البرنامج
              </h3>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-4">
              {startDates.map((d) => (
                <div
                  key={d.tag}
                  className="relative rounded-2xl bg-accent-soft/60 border border-border px-5 py-5 shadow-soft hover:shadow-card transition-smooth"
                >
                  <span className="absolute -top-3 right-4 px-3 py-1 rounded-full gradient-primary text-primary-foreground text-xs font-bold shadow-card">
                    {d.tag}
                  </span>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="shrink-0 w-11 h-11 rounded-xl bg-background grid place-items-center border border-border">
                      <CalendarDays className="size-5 text-primary" />
                    </span>
                    <span className="text-foreground font-semibold leading-relaxed">
                      {d.text}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Duration;
