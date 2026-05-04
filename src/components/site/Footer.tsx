import { Mail, MapPin, Phone } from "lucide-react";

const quickLinks = [
  { href: "#home", label: "الرئيسية" },
  { href: "#about", label: "عن البرنامج" },
  { href: "#competencies", label: "مجالات وكفايات البرنامج" },
  { href: "#requirements", label: "المتطلبات" },
];

const legalLinks = [
  { href: "#", label: "سياسة الخصوصية" },
  { href: "#", label: "الشروط والأحكام" },
];

const Footer = () => {
  return (
    <footer className="border-t border-border/60 bg-white pt-20 pb-8 text-foreground">
      <div className="container mb-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <img src="/اللوقو-شفاف.png" alt="شعار برنامج رخصة ممارس" className="site-logo site-logo-scrolled h-12 w-auto object-contain shadow-gold" />
            <div className="leading-tight">
              <div className="font-bold">برنامج رخصة ممارس</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            برنامج تأهيلي يُعنى بإعداد معلمي ومعلمات القرآن عبر أربع مجالات رئيسة (الشرعي، التعليمي، التربوي، المهاري)، بهدف تأهيلهم لقيادة الحلقة القرآنية بكفاءة وفاعلية
          </p>
        </div>

        {/* Links */}
        <div>
          <h4 className="mb-4 font-bold text-foreground">روابط سريعة</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="transition-smooth hover:text-primary">{link.label}</a>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h4 className="mb-4 font-bold text-foreground">تواصل معنا</h4>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-3">
              <MapPin className="size-4 shrink-0 text-foreground" />
              <span>القصيم، المملكة العربية السعودية</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="size-4 shrink-0 text-foreground" />
              <span dir="ltr">+966 50 000 0000</span>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h4 className="mb-4 font-bold text-foreground">الأنظمة والسياسات</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="transition-smooth hover:text-primary">{link.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="container relative flex items-center justify-between border-t border-border/60 pt-6 text-xs text-muted-foreground">
        <div>© {new Date().getFullYear()} برنامج رخصة ممارس. جميع الحقوق محفوظة.</div>
        <div className="absolute left-1/2 -translate-x-1/2 text-[11px] sm:text-xs">
          تم التطوير بواسطة{" "}
          <a
            href="https://wa.me/966539599222"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-primary transition-smooth hover:text-primary/80"
          >
            WJ
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
