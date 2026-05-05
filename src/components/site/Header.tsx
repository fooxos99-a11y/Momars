import { useEffect, useState } from "react";
import { Menu, User, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  clearAccessSession,
  getActiveCourse,
  getActiveTask,
  getCoursePath,
  getTaskPath,
  getManagedBranchId,
  getRoleLabel,
  getStudentByLoginId,
  isAssessmentEnabledForCourse,
  isFinalExamAvailable,
  loadAccessSession,
  resolveAccessByLoginCode,
  saveAccessSession,
  type AssessmentType,
  useDashboardStore,
  type AccessSession,
} from "@/lib/dashboard-store";
import { resolveAccessByLoginCodeFromDatabase } from "@/lib/supabase";
import { unsubscribeAndRemovePushForLogin } from "@/hooks/use-push-notifications";

const links = [
  { href: "#home", label: "الرئيسية" },
  { href: "#about", label: "عن البرنامج" },
  { href: "#competencies", label: "مجالات وكفايات البرنامج" },
  { href: "#requirements", label: "المتطلبات" },
];

type StudentAssessmentMenuType = AssessmentType | "finalexam";

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [session, setSession] = useState<AccessSession | null>(() => loadAccessSession());
  const navigate = useNavigate();
  const { data, isHydrated } = useDashboardStore();
  const activeCourse = getActiveCourse(data);
  // Use branchId from session directly (saved at login) — avoids depending on data.students being loaded
  const sessionBranchId = session?.role === "student" ? (session.branchId ?? (getStudentByLoginId(data, session.loginCode)?.branchId ?? null)) : null;
  const sessionStudent = session?.role === "student" ? getStudentByLoginId(data, session.loginCode) : null;
  const activeTask = getActiveTask(data, sessionBranchId);

  useEffect(() => {
    const getScrollOffset = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const updateScrolled = () => setScrolled(getScrollOffset() > 20);

    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    window.addEventListener("resize", updateScrolled);

    let observer: IntersectionObserver | null = null;
    const heroSection = document.getElementById("home");

    if (heroSection && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        ([entry]) => {
          const pastTop = getScrollOffset() > 20;
          const heroShifted = entry.boundingClientRect.top <= -24;
          const heroLeavingViewport = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          setScrolled(pastTop || heroShifted || heroLeavingViewport);
        },
        {
          root: null,
          threshold: [0, 1],
          rootMargin: "0px",
        },
      );

      observer.observe(heroSection);
    }

    return () => {
      window.removeEventListener("scroll", updateScrolled);
      window.removeEventListener("resize", updateScrolled);
      observer?.disconnect();
    };
  }, []);

  // Periodic re-render to re-evaluate assessment deadlines every minute
  const [, setAssessmentTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setAssessmentTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleAccess = async () => {
    setLoginLoading(true);

    try {
      const resolved = await resolveAccessByLoginCodeFromDatabase(loginCode);

      if (!resolved) {
        const fallback = resolveAccessByLoginCode(data, loginCode);

        if (!fallback) {
          setLoginError("رقم الدخول غير صحيح.");
          return;
        }

        saveAccessSession(fallback);
        setSession(fallback);
      } else {
        saveAccessSession(resolved);
        setSession(resolved);
      }

      setLoginOpen(false);
      setLoginCode("");
      setLoginError("");
      navigate("/");
    } catch {
      setLoginError("تعذر التحقق من رقم الدخول من قاعدة البيانات.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    if (session?.loginCode) {
      void unsubscribeAndRemovePushForLogin(session.loginCode);
    }
    clearAccessSession();
    setSession(null);
    setProfileOpen(false);
    setAccountMenuOpen(false);
    navigate("/");
  };

  const handleSecondaryAction = () => {
    setAccountMenuOpen(false);
    setProfileOpen(false);
    navigate(secondaryActionPath);
  };

  const handleProfileOpen = () => {
    setAccountMenuOpen(false);
    setProfileOpen(true);
  };

  const handleStudentAssessmentNavigation = (assessmentType: StudentAssessmentMenuType) => {
    if (!session || session.role !== "student") {
      return;
    }

    if (assessmentType === "finalexam") {
      if (!sessionBranchId || !isFinalExamAvailable(data.finalExamSettings[sessionBranchId])) {
        return;
      }

      setAccountMenuOpen(false);
      navigate(`/final-exam?login=${encodeURIComponent(session.loginCode)}`);
      return;
    }

    if (assessmentType === "tasks") {
      if (!isHydrated || !activeTask) return;
      setAccountMenuOpen(false);
      navigate(getTaskPath(activeTask.id) + `&login=${encodeURIComponent(session.loginCode)}`);
      return;
    }

    if (!isHydrated || !activeCourse || !isAssessmentEnabledForCourse(activeCourse, assessmentType, sessionBranchId)) {
      return;
    }

    setAccountMenuOpen(false);
    navigate(`${getCoursePath(assessmentType)}?login=${encodeURIComponent(session.loginCode)}`);
  };

  const roleLabel = session ? getRoleLabel(session.role) : "";

  const secondaryActionLabel = session?.role === "admin" || session?.role === "male_manager" || session?.role === "female_manager" ? "لوحة التحكم" : "البيانات";
  const secondaryActionPath = session?.role === "student"
    ? `/student?login=${encodeURIComponent(session.loginCode)}`
    : session?.redirectPath ?? "/";
  const studentFinalExamEnabled = session?.role === "student" && sessionBranchId
    ? isFinalExamAvailable(data.finalExamSettings[sessionBranchId])
    : false;
  const studentAssessmentItems: Array<{ type: StudentAssessmentMenuType; label: string }> = [
    { type: "pre", label: "الاختبار القبلي" },
    { type: "post", label: "الاختبار البعدي" },
    { type: "tasks", label: "التكليف" },
    { type: "finalexam", label: "الاختبار النهائي" },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-smooth ${
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border shadow-soft"
          : "bg-transparent"
      }`}
    >
      <div className="container flex h-20 items-center gap-4 xl:gap-6">
        {/* Logo */}
        <a href="#home" className="flex shrink-0 items-center gap-2.5 md:gap-3">
          <div className="flex items-center gap-2 md:gap-2.5">
            <img
              src="/شعار-الجمعية.png"
              alt="شعار الجمعية"
              className={`site-logo h-8 w-auto object-contain md:h-9 ${scrolled ? "site-logo-scrolled" : "site-logo-top"}`}
            />
            <img
              src="/اللوقو-شفاف.png"
              alt="شعار برنامج رخصة ممارس"
              className={`site-logo h-8 w-auto object-contain md:h-9 ${scrolled ? "site-logo-scrolled" : "site-logo-top"}`}
            />
          </div>
          <div className={`text-right leading-tight ${scrolled ? "text-foreground" : "text-white"}`}>
            <div className="text-[0.72rem] font-extrabold md:text-[0.9rem]">برنامج رخصة ممارس</div>
          </div>
        </a>

        {/* Desktop nav */}
        <nav className="hidden flex-1 translate-x-9 items-center justify-center gap-2 px-4 lg:flex xl:translate-x-14 xl:gap-3">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`rounded-full px-4 py-2.5 text-sm font-bold transition-smooth xl:px-5 xl:text-base ${
                scrolled ? "text-foreground hover:bg-primary/10 hover:text-primary" : "text-white/95 hover:bg-white/10 hover:text-white"
              }`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="mr-auto flex items-center gap-2 lg:mr-0">
          {session ? (
            <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}
                  aria-label="الحساب"
                >
                  <User className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-2xl border border-border/70 bg-white/95 text-right shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur-sm">
                <DropdownMenuLabel className="text-right">
                  <div className="font-bold">{session.name}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="justify-end text-right" onSelect={handleProfileOpen}>الملف الشخصي</DropdownMenuItem>
                <DropdownMenuItem className="justify-end text-right" onSelect={handleSecondaryAction}>{secondaryActionLabel}</DropdownMenuItem>
                {session.role === "student" && (
                  <>
                    <DropdownMenuSeparator />
                    {studentAssessmentItems.map((item) => (
                      <DropdownMenuItem
                        key={item.type}
                        className="justify-end text-right"
                        disabled={
                          item.type === "finalexam"
                            ? !studentFinalExamEnabled
                            : item.type === "tasks"
                            ? !isHydrated || !activeTask
                            : !isHydrated || !activeCourse || !isAssessmentEnabledForCourse(activeCourse, item.type, sessionBranchId)
                        }
                        onSelect={() => handleStudentAssessmentNavigation(item.type)}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuItem className="justify-end text-right text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={handleLogout}>تسجيل الخروج</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className={scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}
              aria-label="الحساب"
              onClick={() => setLoginOpen(true)}
            >
              <User className="size-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`lg:hidden ${scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}`}
            onClick={() => setOpen((s) => !s)}
            aria-label="القائمة"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {open && (
        <div className="lg:hidden bg-background border-t border-border animate-fade-up">
          <nav className="container py-4 flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-bold text-foreground hover:bg-primary/10"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      )}

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-md overflow-hidden rounded-[2rem] border border-primary/15 bg-white/95 p-0 text-right shadow-[0_28px_80px_rgba(8,65,89,0.18)] backdrop-blur-sm [&>button]:hidden">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-5 top-4 h-px bg-[linear-gradient(90deg,transparent,rgba(16,118,153,0.7),transparent)]" />
              <div className="absolute inset-y-5 right-4 w-px bg-[linear-gradient(180deg,transparent,rgba(16,118,153,0.45),transparent)]" />
              <div className="absolute inset-y-5 left-4 w-px bg-[linear-gradient(180deg,transparent,rgba(16,118,153,0.22),transparent)]" />
              <div className="absolute -top-16 -left-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -bottom-12 -right-6 h-28 w-28 rounded-full bg-accent/10 blur-3xl" />
            </div>

            <div className="relative space-y-4 px-4 py-4">
              <div className="rounded-[1.6rem] border border-primary/15 bg-[linear-gradient(135deg,rgba(8,65,89,0.96),rgba(16,118,153,0.9))] px-4 py-4 text-white shadow-[0_18px_40px_rgba(8,65,89,0.2)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-right">
                    <div className="text-sm text-white/75">الملف الشخصي</div>
                    <div className="mt-2 text-2xl font-extrabold tracking-tight">{session?.name ?? "-"}</div>
                  </div>
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
                    <User className="size-7" />
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-right">
                <div className="rounded-[1.6rem] border border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,249,251,0.92))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <div className="text-sm font-medium text-muted-foreground">نوع الحساب</div>
                  <div className="mt-2 text-xl font-extrabold text-foreground">{roleLabel}</div>
                </div>
                <div className="rounded-[1.6rem] border border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,249,251,0.92))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <div className="text-sm font-medium text-muted-foreground">رقم الدخول</div>
                  <div className="mt-2 text-xl font-extrabold text-foreground">{session?.loginCode ?? "-"}</div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" className="rounded-full border-primary/20 bg-white/80 px-6 hover:bg-primary/5" onClick={() => setProfileOpen(false)}>إغلاق</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-w-md rounded-[1.75rem] bg-white p-0 [&>button]:hidden">
          <DialogHeader className="border-b border-border px-4 pb-2.5 pt-4 text-right">
            <DialogTitle className="text-right text-2xl">تسجيل الدخول</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4 pt-2.5">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">رقم الدخول</label>
              <Input
                value={loginCode}
                onChange={(event) => setLoginCode(event.target.value)}
                disabled={loginLoading}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleAccess();
                  }
                }}
              />
            </div>
            {loginError && <p className="text-sm font-medium text-destructive">{loginError}</p>}
            <Button className="w-full" onClick={() => void handleAccess()} disabled={loginLoading}>
              {loginLoading ? "جاري التحقق..." : "دخول"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default Header;
