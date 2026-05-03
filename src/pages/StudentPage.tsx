import { useEffect, useMemo, useState } from "react";
import { Eye, Bell, BellOff, BellRing, BookOpen, Database } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type AssessmentType,
  getCourses,
  getActiveTask,
  getAssessmentQuestions,
  getStudentByLoginId,
  loadAccessSession,
  saveAccessSession,
  useDashboardStore,
} from "@/lib/dashboard-store";
import { getStudentAssignedReciterByLoginCodeFromDatabase, type DatabaseStudentReciter } from "@/lib/supabase";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const assessmentLabels: Record<AssessmentType, string> = {
  pre: "الاختبار القبلي",
  post: "الاختبار البعدي",
  tasks: "التكاليف",
};

const parts = Array.from({ length: 30 }, (_, index) => index + 1);

const normalizeAnswer = (value: string) => value.trim().toLowerCase();

const studentMenu = [
  { id: "courses", label: "الدورات", icon: Database },
  { id: "reading", label: "القراءة", icon: BookOpen },
  { id: "notifications", label: "التنبيهات", icon: Bell },
] as const;

const StudentPage = () => {
  const store = useDashboardStore();
  const { data, isHydrated } = store;
  const [searchParams] = useSearchParams();
  const [studentLoginId, setStudentLoginId] = useState("");
  const [studentResolved, setStudentResolved] = useState(false);
  const [studentTab, setStudentTab] = useState<"courses" | "reading" | "notifications">("courses");
  const [detailsSubmissionId, setDetailsSubmissionId] = useState<string | null>(null);
  const [databaseAssignedReciter, setDatabaseAssignedReciter] = useState<DatabaseStudentReciter | null>(null);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const loginFromQuery = searchParams.get("login")?.trim();
    const session = loadAccessSession();
    const loginFromSession = session?.role === "student" ? session.loginCode.trim() : "";
    const resolvedLogin = loginFromQuery || loginFromSession;

    if (!resolvedLogin) {
      setStudentResolved(true);
      return;
    }

    const foundStudent = getStudentByLoginId(data, resolvedLogin);

    if (foundStudent) {
      setStudentLoginId(foundStudent.loginId);
      saveAccessSession({
        role: "student",
        loginCode: foundStudent.loginId,
        name: foundStudent.name,
        redirectPath: `/student?login=${encodeURIComponent(foundStudent.loginId)}`,
        branchId: foundStudent.branchId,
      });
    }

    setStudentResolved(true);
  }, [data, isHydrated, searchParams]);

  useEffect(() => {
    if (!studentLoginId) {
      setDatabaseAssignedReciter(null);
      return;
    }

    let cancelled = false;

    const loadAssignedReciter = async () => {
      try {
        const reciter = await getStudentAssignedReciterByLoginCodeFromDatabase(studentLoginId);

        if (!cancelled) {
          setDatabaseAssignedReciter(reciter);
        }
      } catch {
        if (!cancelled) {
          setDatabaseAssignedReciter(null);
        }
      }
    };

    void loadAssignedReciter();

    return () => {
      cancelled = true;
    };
  }, [studentLoginId]);

  const student = useMemo(() => {
    if (!studentLoginId) {
      return null;
    }

    return getStudentByLoginId(data, studentLoginId);
  }, [data, studentLoginId]);

  const assignedReciter = useMemo(() => {
    if (databaseAssignedReciter) {
      return databaseAssignedReciter;
    }

    if (!student) {
      return null;
    }

    return data.reciters.find((reciter) => reciter.studentIds.includes(student.id)) ?? null;
  }, [data.reciters, databaseAssignedReciter, student]);

  const getSubmissionGrade = (courseId: string, assessmentType: AssessmentType, submissionId: string) => {
    const submission = data.submissions.find((item) => item.id === submissionId);
    const course = data.courses.find((item) => item.id === courseId);
    const questions = course ? getAssessmentQuestions(course, assessmentType) : [];

    if (!submission) {
      return { score: 0, total: questions.reduce((sum, question) => sum + question.points, 0) };
    }

    const answersByQuestionId = new Map(submission.answers.map((answer) => [answer.questionId, answer]));
    const total = questions.reduce((sum, question) => sum + question.points, 0);
    const score = questions.reduce((sum, question) => {
      const answer = answersByQuestionId.get(question.id);

      if (!answer || !question.correctAnswer.trim()) {
        return sum;
      }

      return normalizeAnswer(answer.value) === normalizeAnswer(question.correctAnswer) ? sum + question.points : sum;
    }, 0);

    return { score, total };
  };

  const detailsSubmission = data.submissions.find((submission) => submission.id === detailsSubmissionId) ?? null;

  const courseRows = useMemo(() => {
    if (!student) {
      return [];
    }

    return getCourses(data).map((course) => {
      const rows = (["pre", "post"] as const).map((assessmentType) => {
        const submission = data.submissions
          .filter(
            (item) =>
              item.courseId === course.id &&
              item.assessmentType === assessmentType &&
              item.loginId === student.loginId,
          )
          .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())[0] ?? null;

        const grade = submission ? getSubmissionGrade(course.id, assessmentType, submission.id) : { score: 0, total: course[assessmentType === "pre" ? "preQuestions" : "postQuestions"].reduce((sum, question) => sum + question.points, 0) };

        return {
          assessmentType,
          submissionId: submission?.id ?? null,
          score: grade.score,
          total: grade.total,
        };
      });

      return {
        course,
        rows,
      };
    });
  }, [data, data.submissions, student]);

  const studentNotifications = useMemo(() => {
    if (!student) {
      return [];
    }

    const studentCreatedAt = student.createdAt ? new Date(student.createdAt).getTime() : 0;

    return data.notifications.filter((notification) => {
      // Don't show notifications sent before the student account was created
      if (studentCreatedAt && notification.createdAt) {
        const notifTime = new Date(notification.createdAt).getTime();
        if (notifTime < studentCreatedAt) return false;
      }

      if (notification.targetLoginIds && notification.targetLoginIds.length > 0) {
        return notification.targetLoginIds.includes(student.loginId);
      }

      return !notification.targetBranchId || notification.targetBranchId === student.branchId;
    });
  }, [data.notifications, student]);

  const activeTaskCourseId = useMemo(() => {
    const activeTask = getActiveTask(data, student?.branchId ?? null);
    return activeTask?.id ?? null;
  }, [data, student?.branchId]);

  const { pushPermission, requestPushPermission, isPushRegistered, pushStatusNote } = usePushNotifications(studentLoginId || null);

  if (!isHydrated || !studentResolved) {
    return null;
  }

  if (!student) {
    return <Navigate to="/" replace />;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[linear-gradient(180deg,#f8fbfb,#eef5f5)] text-right text-foreground">
      <div className="flex min-h-screen w-full items-start lg:flex-row">
        <aside className="sticky top-0 hidden h-screen w-[320px] shrink-0 border-l border-white/60 bg-white/95 shadow-[10px_0_35px_rgba(15,23,42,0.04)] lg:block">
          <div className="flex h-full flex-col bg-white">
            <div className="border-b border-border/60 px-4 py-5 text-right">
              <div className="flex w-full items-center justify-start gap-3">
                <img src="/اللوقو-شفاف.png" alt="شعار المنصة" className="site-logo site-logo-scrolled h-14 w-auto object-contain" />
                <div className="text-right">
                  <p className="whitespace-nowrap text-base font-extrabold leading-tight text-foreground">لوحة الطالب</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 text-right">
              <div className="space-y-2">
                {studentMenu.map((item) => {
                  const Icon = item.icon;
                  const active = studentTab === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setStudentTab(item.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-4 py-3 text-[15px] font-medium transition-all duration-300",
                        active
                          ? "bg-primary text-white shadow-lg shadow-primary/20"
                          : "text-foreground hover:bg-primary/5 hover:text-primary",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span>{item.label}</span>
                        <Icon className={cn("size-4", active ? "text-white" : "text-primary/70")} />
                      </div>
                      <span className={cn("h-2.5 w-2.5 rounded-full", active ? "bg-white" : "bg-primary/20")} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-4 text-right md:px-6 lg:px-8 lg:py-8">
          <div className="w-full">
            <div className="mb-4 flex flex-wrap gap-2 lg:hidden">
              {studentMenu.map((item) => {
                const active = studentTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStudentTab(item.id)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-bold transition-smooth",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-primary/10 bg-white text-primary hover:bg-primary/5",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mb-6 flex w-full items-center justify-between rounded-[2rem] border border-white/70 bg-white/90 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="text-right">
                <p className="text-xs font-medium text-muted-foreground">مرحبًا</p>
                <p className="text-sm font-bold text-foreground">{student.name}</p>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[1280px] px-1 md:px-2">
              {studentTab === "courses" && (
                <Card className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                  <CardHeader>
                    <CardTitle className="text-xl">الدورات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible defaultValue={activeTaskCourseId ?? undefined} className="space-y-4">
                      {courseRows.map(({ course, rows }) => (
                        <AccordionItem key={course.id} value={course.id} className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-white px-4">
                          <AccordionTrigger className="text-right text-base font-bold hover:no-underline">{course.title}</AccordionTrigger>
                          <AccordionContent className="space-y-3 pb-4">
                            {rows.map((row) => (
                              <div key={row.assessmentType} className="flex flex-col gap-3 rounded-[1.25rem] border border-primary/10 bg-muted/10 p-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <div className="font-bold text-foreground">{assessmentLabels[row.assessmentType]}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="border-primary/20 text-primary">
                                    {row.score} / {row.total}
                                  </Badge>
                                  {row.submissionId ? (
                                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setDetailsSubmissionId(row.submissionId)}>
                                      <Eye className="size-4" />
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">لم يرسل</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              )}

              {studentTab === "reading" && (
                <div className="space-y-6">
                  <Card className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                    <CardContent className="space-y-5">
                      <div className="rounded-[1.25rem] border border-border/60 bg-muted/20 p-4">
                        <div className="text-sm text-muted-foreground">اسم المقرئ</div>
                        <div className="mt-2 text-lg font-bold text-foreground">{assignedReciter?.name ?? "لا يوجد مقرئ مرتبط"}</div>
                      </div>
                      <div className="rounded-[1.25rem] border border-border/60 bg-white p-4">
                        <div className="mb-4 text-sm font-bold text-foreground">المقروء</div>
                        <div className="grid w-fit grid-cols-5 gap-1.5 sm:grid-cols-6">
                          {parts.map((part) => {
                            const active = student.completedParts.includes(part);

                            return (
                              <div
                                key={part}
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-black leading-none sm:h-8 sm:w-8 sm:text-sm",
                                  active
                                    ? "border-cyan-200/30 bg-[linear-gradient(145deg,#0d7490,#0f3f5c)] text-white shadow-[0_12px_26px_rgba(8,61,93,0.35)]"
                                    : "border-slate-200 bg-white text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.06)]",
                                )}
                              >
                                <span className="leading-none">{part}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {studentTab === "notifications" && (
                <Card className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-xl">التنبيهات</CardTitle>
                      {pushPermission !== "unsupported" && pushPermission !== "denied" && (
                        <Button
                          variant={pushPermission === "granted" && isPushRegistered ? "outline" : "default"}
                          size="sm"
                          className="gap-1.5 rounded-xl text-xs"
                          onClick={() => {
                            void requestPushPermission().then((ok) => {
                              if (ok) {
                                toast({ title: "تم", description: "تم تفعيل إشعارات الجوال بنجاح" });
                              } else {
                                toast({
                                  title: "تعذر تفعيل الإشعارات",
                                  description: pushStatusNote ?? "تم منح الإذن لكن فشل تسجيل الاشتراك. حاول مرة أخرى.",
                                  variant: "destructive",
                                });
                              }
                            });
                          }}
                        >
                          {pushPermission === "granted" && isPushRegistered ? (
                            <><BellRing className="size-3.5" /> إشعارات الجوال مفعّلة</>
                          ) : (
                            <><Bell className="size-3.5" /> تفعيل إشعارات الجوال</>
                          )}
                        </Button>
                      )}
                      {pushPermission === "denied" && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <BellOff className="size-3.5" /> محظورة من إعدادات المتصفح
                        </span>
                      )}
                    </div>
                    {pushStatusNote && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                        {pushStatusNote}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {studentNotifications.length === 0 ? (
                      <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-white/70 p-5 text-sm text-muted-foreground">
                        لا توجد تنبيهات جديدة داخل التطبيق.
                      </div>
                    ) : (
                      studentNotifications.map((notification) => (
                        <div key={notification.id} className="rounded-[1.25rem] border border-border/60 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-right">
                              <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{notification.message}</div>
                            </div>
                            <Badge variant="outline" className="border-primary/20 text-primary">
                              {notification.targetLoginIds && notification.targetLoginIds.length > 0
                                ? `محدد (${notification.targetLoginIds.length})`
                                : notification.targetBranchId ? (notification.targetBranchId === "male" ? "رجالي" : "نسائي") : "عام"}
                            </Badge>
                          </div>
                          <div className="mt-3 text-xs text-muted-foreground">
                            {notification.createdByName ? `${notification.createdByName} - ` : ""}
                            {new Intl.DateTimeFormat("ar-SA", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(notification.createdAt))}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>

      <Dialog open={Boolean(detailsSubmission)} onOpenChange={(open) => !open && setDetailsSubmissionId(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto rounded-[2rem] p-0 [&>button]:hidden">
          <DialogHeader className="border-b border-border px-6 py-5 text-right">
            <DialogTitle className="text-right text-2xl">معاينة النتيجة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6">
            {detailsSubmission && (() => {
              const course = data.courses.find((item) => item.id === detailsSubmission.courseId);
              const questions = course ? getAssessmentQuestions(course, detailsSubmission.assessmentType) : [];
              const answers = new Map(detailsSubmission.answers.map((answer) => [answer.questionId, answer]));
              const grade = getSubmissionGrade(detailsSubmission.courseId, detailsSubmission.assessmentType, detailsSubmission.id);

              return (
                <>
                  <div className="rounded-3xl border border-primary/10 bg-primary/5 p-5">
                    <div className="font-bold text-foreground">النتيجة: {grade.score} / {grade.total}</div>
                  </div>
                  {questions.map((question, index) => {
                    const answer = answers.get(question.id);
                    const isCorrect = question.correctAnswer.trim() && answer
                      ? normalizeAnswer(answer.value) === normalizeAnswer(question.correctAnswer)
                      : false;

                    return (
                      <div key={question.id} className="rounded-3xl border border-primary/10 bg-white p-5">
                        <div className="mb-2 font-bold text-foreground">{index + 1}. {question.prompt} <span className="text-sm font-medium text-muted-foreground">• الدرجة: {question.points}</span></div>
                        {question.correctAnswer && <div className="mb-2 text-sm font-medium text-emerald-700">الإجابة الصحيحة: {question.correctAnswer}</div>}
                        {answer && question.correctAnswer && <div className={cn("mb-3 text-sm font-medium", isCorrect ? "text-emerald-700" : "text-rose-700")}>{isCorrect ? "صحيحة" : "غير صحيحة"}</div>}
                        <div className="text-sm text-muted-foreground">إجابتك: {answer?.value || "لا توجد إجابة"}</div>
                        {answer?.fileName && <div className="mt-2 text-xs text-muted-foreground">يوجد مرفق مرفوع مع هذه الإجابة.</div>}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentPage;
