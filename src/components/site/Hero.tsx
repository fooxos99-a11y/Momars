import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Hero = () => {
  return (
    <section
      id="home"
      className="relative min-h-[100svh] flex items-center overflow-hidden gradient-hero"
    >
      <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground/15 animate-slow-spin" aria-hidden />
      <div className="absolute left-1/2 top-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground/10 animate-float" aria-hidden />
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground/10 blur-3xl animate-soft-pulse" aria-hidden />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden
      />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary-deep/55 to-transparent" aria-hidden />

      <div className="container relative z-10 py-32 lg:py-0">
        <div className="mx-auto max-w-4xl text-center text-white animate-fade-up">
            <div className="mx-auto mb-6 flex items-center justify-center gap-5">
              <img
                src="/اللوقو-شفاف.png"
                alt="شعار برنامج رخصة ممارس"
                className="site-logo site-logo-top h-20 w-auto object-contain sm:h-24 md:h-28"
              />
              <img
                src="/شعار-الجمعية.png"
                alt="شعار الجمعية"
                className="mt-2 h-20 w-auto object-contain sm:h-24 md:h-28"
              />
            </div>
            <div className="mx-auto mb-8 h-1 w-24 rounded-full bg-primary-foreground/70" />
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.15] mb-6 drop-shadow-sm">
              برنامج رخصة ممارس
            </h1>

            <p className="text-base md:text-xl text-white/80 leading-loose max-w-3xl mx-auto mb-10">
              برنامج تأهيلي يُعنى بإعداد معلمي ومعلمات القرآن عبر أربع مجالات
              رئيسة (الشرعي، التعليمي، التربوي، المهاري)، بهدف تأهيلهم لقيادة
              الحلقة القرآنية بكفاءة وفاعلية.
            </p>

            <div className="flex justify-center">
              <Button size="lg" variant="heroOutline" asChild>
                <a href="#about">
                  تعرّف على البرنامج
                  <ArrowLeft className="size-5" />
                </a>
              </Button>
            </div>
        </div>
      </div>

      {/* Bottom fade into next section */}
      <div
        className="absolute bottom-0 inset-x-0 h-24"
        style={{ background: "linear-gradient(to top, hsl(var(--page-surface-top)) 0%, transparent 100%)" }}
      />
    </section>
  );
};

export default Hero;
