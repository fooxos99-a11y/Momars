import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getCourses, getTasks, useDashboardStore, type AssessmentType, type CourseQuestion, type CourseRecord } from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const fmtPct = (v: number) => `${Math.round(clamp(v))}%`;

const ProgramIndicatorRing = ({
  label,
  progressValue,
  displayValue,
  shouldAnimate,
  suffix = "%",
}: {
  label: string;
  progressValue: number;
  displayValue: number;
  shouldAnimate: boolean;
  suffix?: string;
}) => {
  const gradientId = useId();
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedDisplay, setAnimatedDisplay] = useState(0);
  const safeProgress = clamp(progressValue);
  const safeDisplay = Math.max(0, displayValue);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (!shouldAnimate) {
      setAnimatedProgress(0);
      setAnimatedDisplay(0);
      return;
    }

    let frameId = 0;
    const startedAt = performance.now();
    const duration = 2200;

    const tick = (now: number) => {
      const elapsed = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setAnimatedProgress(safeProgress * eased);
      setAnimatedDisplay(safeDisplay * eased);

      if (elapsed < 1) frameId = requestAnimationFrame(tick);
    };

    setAnimatedProgress(0);
    setAnimatedDisplay(0);
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [safeDisplay, safeProgress, shouldAnimate]);

  const dashOffset = circumference * (1 - animatedProgress / 100);
  const shownValue = `${Math.round(animatedDisplay)}${suffix}`;

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative flex h-40 w-40 items-center justify-center sm:h-44 sm:w-44 lg:h-48 lg:w-48">
        <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.34)_0%,_rgba(64,181,208,0.22)_18%,_rgba(11,103,126,0.22)_38%,_rgba(8,65,89,0.1)_58%,_transparent_76%)] blur-2xl" />
        <svg viewBox="0 0 140 140" className="relative h-full w-full -rotate-90 overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(191 72% 34%)" />
              <stop offset="55%" stopColor="hsl(192 75% 28%)" />
              <stop offset="100%" stopColor="hsl(193 78% 22%)" />
            </linearGradient>
          </defs>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(184, 205, 214, 0.42)" strokeWidth="13" />
          <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="16" opacity="0.42" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="drop-shadow-[0_0_14px_rgba(93,205,227,0.35)]"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-[66%] w-[66%] items-center justify-center rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.96)_0%,_rgba(244,251,253,0.88)_56%,_rgba(233,245,249,0.28)_100%)] shadow-[inset_0_1px_14px_rgba(255,255,255,0.92)] backdrop-blur-sm">
            <span className="font-black leading-none tracking-[-0.04em] text-[#0a4c61] text-[2rem] sm:text-[2.15rem]">
              {shownValue}
            </span>
          </div>
        </div>
      </div>
      <div className={cn("max-w-[11rem] font-extrabold leading-7 text-[#08384a] text-sm sm:text-[0.95rem]")}>{label}</div>
    </div>
  );
};

const isCorrect = (question: CourseQuestion, value: string) => {
  if (question.type === "truefalse") return value.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
  if (question.type === "multiple") return value.trim() === question.correctAnswer.trim();
  return false;
};

const getGrade = (course: CourseRecord, type: AssessmentType, submissions: ReturnType<typeof useDashboardStore>["data"]["submissions"]) => {
  const qKey = type === "pre" ? "preQuestions" : type === "post" ? "postQuestions" : "taskQuestions";
  const questions = course[qKey];
  const qTotal = questions.reduce((s, q) => s + q.points, 0);

  return (submissionId: string) => {
    const sub = submissions.find((s) => s.id === submissionId);
    if (!sub) return { score: 0, total: qTotal };
    const byId = new Map(sub.answers.map((a) => [a.questionId, a]));
    if (typeof sub.manualScore === "number" && Number.isFinite(sub.manualScore) && sub.manualScore >= 0)
      return { score: sub.manualScore, total: Math.max(qTotal, sub.manualScore) };
    const ov = byId.get("__score_override__")?.value;
    if (ov !== undefined) {
      const n = Number(ov);
      if (Number.isFinite(n) && n >= 0) return { score: n, total: Math.max(qTotal, n) };
    }
    const score = questions.reduce((s, q) => {
      const a = byId.get(q.id);
      if (!a || !q.correctAnswer.trim()) return s;
      return isCorrect(q, a.value) ? s + q.points : s;
    }, 0);
    return { score, total: qTotal };
  };
};

const getLatestByLoginId = (
  courseId: string,
  type: AssessmentType,
  submissions: ReturnType<typeof useDashboardStore>["data"]["submissions"],
) => {
  const map = new Map<string, (typeof submissions)[number]>();
  [...submissions]
    .filter((s) => s.courseId === courseId && s.assessmentType === type)
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
    .forEach((s) => map.set(s.loginId, s));
  return map;
};

const INDICATORS = [
  {
    key: "memorization",
    label: "مجموع الأجزاء المقروءة",
  },
  {
    key: "pre",
    label: "الاختبارات القبلية",
  },
  {
    key: "post",
    label: "الاختبارات البعدية",
  },
  {
    key: "attendance",
    label: "الحضور",
  },
  {
    key: "tasks",
    label: "المهام الأدائية",
  },
  {
    key: "completed30",
    label: "الطلاب الذين أنهوا 30 جزءًا",
  },
] as const;

const Stats = () => {
  const { data } = useDashboardStore();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [shouldAnimateIndicators, setShouldAnimateIndicators] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;

    if (!section || shouldAnimateIndicators) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }

        setShouldAnimateIndicators(true);
        observer.disconnect();
      },
      {
        threshold: 0.05,
      },
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, [shouldAnimateIndicators]);

  const metrics = useMemo(() => {
    const students = data.students;
    const totalStudents = students.length;
    if (totalStudents === 0) return null;
    const manualAttendance = (data.attendance ?? []).filter((record) => record.source === "manual");

    const loginIds = new Set(students.map((s) => s.loginId));
    const courses = getCourses(data).sort((a, b) => a.sortOrder - b.sortOrder);
    const tasks = getTasks(data);
    const courseIds = courses.map((c) => c.id);
    const allTaskIds = [...courseIds, ...tasks.map((t) => t.id)];

    // Memorization
    const completedPartsCount = students.reduce((s, st) => s + st.completedParts.length, 0);
    const totalPossibleParts = totalStudents * 30;
    const memorization = totalPossibleParts > 0 ? (completedPartsCount / totalPossibleParts) * 100 : 0;
    const completed30 = students.filter((s) => s.isCertified).length;

    // Assessment averages
    const calcAssessmentAvg = (type: AssessmentType, ids: string[]) => {
      let totalPct = 0;
      let count = 0;
      ids.forEach((courseId) => {
        const course = data.courses.find((c) => c.id === courseId);
        if (!course) return;
        const gradeFn = getGrade(course, type, data.submissions);
        const latest = getLatestByLoginId(courseId, type, data.submissions);
        [...latest.values()].forEach((sub) => {
          if (!loginIds.has(sub.loginId)) return;
          const g = gradeFn(sub.id);
          if (g.total > 0) { totalPct += (g.score / g.total) * 100; count++; }
        });
      });
      return count > 0 ? clamp(totalPct / count) : 0;
    };

    const pre = calcAssessmentAvg("pre", courseIds);
    const post = calcAssessmentAvg("post", courseIds);

    // Tasks completion
    const tasksSubmitted = new Set<string>();
    allTaskIds.forEach((id) => {
      getLatestByLoginId(id, "tasks", data.submissions).forEach((sub) => {
        if (loginIds.has(sub.loginId)) tasksSubmitted.add(sub.loginId);
      });
    });
    const tasksAvg = (tasksSubmitted.size / totalStudents) * 100;

    // Attendance
    const attendedLoginIds = new Set(
      manualAttendance.filter((r) => courseIds.includes(r.courseId) && loginIds.has(r.loginId)).map((r) => r.loginId),
    );
    const attendance = (attendedLoginIds.size / totalStudents) * 100;

    return { memorization, completedPartsCount, pre, post, attendance, tasks: tasksAvg, completed30, totalStudents };
  }, [data]);

  const values: Record<string, { value: number; display: string }> = metrics
    ? {
        memorization: { value: 100, display: String(metrics.completedPartsCount) },
        pre: { value: metrics.pre, display: fmtPct(metrics.pre) },
        post: { value: metrics.post, display: fmtPct(metrics.post) },
        attendance: { value: metrics.attendance, display: fmtPct(metrics.attendance) },
        tasks: { value: metrics.tasks, display: fmtPct(metrics.tasks) },
        completed30: {
          value: 100,
          display: String(metrics.completed30),
        },
      }
    : Object.fromEntries(
        INDICATORS.map((i) => [
          i.key,
          {
            value: 0,
            display: i.key === "memorization" || i.key === "completed30" ? "0" : "0%",
          },
        ]),
      );

  return (
    <section ref={sectionRef} className="relative overflow-hidden gradient-page py-24">
      <div className="absolute -top-40 -right-32 w-[28rem] h-[28rem] rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <div className="container relative">
        <div className="text-center mb-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-accent-soft px-4 py-1.5 text-xs font-bold tracking-wide text-primary shadow-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>نظرة سريعة</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-foreground">
            مؤشرات <span className="text-gradient-gold">البرنامج</span>
          </h2>
          <div className="mx-auto mt-5 h-1 w-20 rounded-full bg-accent" />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-6 xl:gap-x-6 xl:gap-y-10">
          {INDICATORS.map((ind) => {
            const { value, display } = values[ind.key];
            return (
              <ProgramIndicatorRing
                key={ind.key}
                label={ind.label}
                progressValue={value}
                displayValue={ind.key === "memorization" || ind.key === "completed30" ? Number(display) || 0 : value}
                shouldAnimate={shouldAnimateIndicators}
                suffix={ind.key === "memorization" || ind.key === "completed30" ? "" : "%"}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Stats;

