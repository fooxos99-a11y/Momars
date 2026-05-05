import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type AssessmentType,
  getActiveCourse,
  getAssessmentQuestions,
  isAssessmentEnabledForCourse,
  getStudentByLoginId,
  loadAccessSession,
  saveAccessSession,
  useDashboardStore,
} from "@/lib/dashboard-store";
import { activatePushFromUserGesture } from "@/hooks/use-push-notifications";
import { cn } from "@/lib/utils";

const MAX_STUDENT_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const assessmentLabels: Record<AssessmentType, string> = {
  pre: "الاختبار القبلي",
  post: "الاختبار البعدي",
  tasks: "التكاليف",
};

interface CoursePageProps {
  assessmentType: AssessmentType;
}

const CoursePage = ({ assessmentType }: CoursePageProps) => {
  const store = useDashboardStore();
  const { data, isHydrated } = store;
  const navigate = useNavigate();
  const activeCourse = getActiveCourse(data);
  const [loginId, setLoginId] = useState("");
  const [studentLoginId, setStudentLoginId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { name: string; type: string; dataUrl: string }>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ name?: string; type?: string; dataUrl: string } | null>(null);
  const [satisfactionAnswers, setSatisfactionAnswers] = useState<Record<string, { ratingValue: number | null; textValue: string }>>({});
  const [satisfactionError, setSatisfactionError] = useState("");
  const [searchParams] = useSearchParams();

  const questions = useMemo(() => {
    if (!activeCourse) {
      return [];
    }

    return getAssessmentQuestions(activeCourse, assessmentType);
  }, [activeCourse, assessmentType]);

  const student = useMemo(() => {
    if (!studentLoginId) {
      return null;
    }

    return getStudentByLoginId(data, studentLoginId);
  }, [data, studentLoginId]);
  const isAssessmentEnabled = isAssessmentEnabledForCourse(activeCourse, assessmentType, student?.branchId);

  const existingSubmission = useMemo(() => {
    if (!activeCourse || !student) {
      return null;
    }

    return data.submissions
      .filter(
        (submission) =>
          submission.courseId === activeCourse.id &&
          submission.assessmentType === assessmentType &&
          submission.loginId === student.loginId,
      )
      .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())[0] ?? null;
  }, [activeCourse, assessmentType, data.submissions, student]);

  const satisfactionQuestions = useMemo(
    () => (activeCourse ? data.satisfactionQuestions.filter((q) => q.courseId === activeCourse.id).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [activeCourse, data.satisfactionQuestions],
  );

  const alreadySubmittedSatisfaction = useMemo(() => {
    if (!activeCourse || !student) return false;
    return satisfactionQuestions.length > 0 && satisfactionQuestions.every((q) =>
      data.satisfactionResponses.some((r) => r.courseId === activeCourse.id && r.questionId === q.id && r.loginCode === student.loginId),
    );
  }, [activeCourse, student, satisfactionQuestions, data.satisfactionResponses]);

  const hasPendingPostSatisfaction = assessmentType === "post" && satisfactionQuestions.length > 0 && !alreadySubmittedSatisfaction;
  const canInteractWithAssessment = Boolean(student) && isAssessmentEnabled && !existingSubmission;
  const canSubmitPostFlow = Boolean(student) && isAssessmentEnabled && (!existingSubmission || hasPendingPostSatisfaction);

  const validateSatisfactionAnswers = () => {
    for (const q of satisfactionQuestions) {
      if (q.isRequired) {
        if (q.type === "rating" && satisfactionAnswers[q.id]?.ratingValue == null) {
          setSatisfactionError("أجب على جميع الأسئلة الإلزامية.");
          return false;
        }
        if (q.type === "text" && !satisfactionAnswers[q.id]?.textValue?.trim()) {
          setSatisfactionError("أجب على جميع الأسئلة الإلزامية.");
          return false;
        }
      }
    }

    setSatisfactionError("");
    return true;
  };

  const submitSatisfactionResponses = async () => {
    if (!activeCourse || !student || satisfactionQuestions.length === 0 || alreadySubmittedSatisfaction) {
      return;
    }

    try {
      await store.submitSatisfactionResponses(
        satisfactionQuestions.map((q) => ({
          courseId: activeCourse.id,
          questionId: q.id,
          loginCode: student.loginId,
          studentName: student.name,
          ratingValue: q.type === "rating" ? (satisfactionAnswers[q.id]?.ratingValue ?? null) : null,
          textValue: q.type === "text" ? (satisfactionAnswers[q.id]?.textValue ?? "") : "",
        })),
      );
    } catch {
      setSatisfactionError("تعذر إرسال الاستبيان. حاول مرة أخرى.");
    }
  };

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const loginFromQuery = searchParams.get("login")?.trim();
    const session = loadAccessSession();
    const loginFromSession = session?.role === "student" ? session.loginCode.trim() : "";
    if (!loginFromSession) {
      if (loginFromQuery) {
        setLoginId(loginFromQuery);
      }
      return;
    }

    const foundStudent = getStudentByLoginId(data, loginFromSession);

    if (foundStudent) {
      setLoginId(foundStudent.loginId);
      setStudentLoginId(foundStudent.loginId);
      setError("");
      setLoginDialogOpen(false);
      saveAccessSession({
        role: "student",
        loginCode: foundStudent.loginId,
        name: foundStudent.name,
        redirectPath: `/student?login=${encodeURIComponent(foundStudent.loginId)}`,
        branchId: foundStudent.branchId,
      });
    } else {
      setLoginDialogOpen(true);
    }
  }, [assessmentType, data, isHydrated, searchParams]);

  useEffect(() => {
    if (!student) {
      setLoginDialogOpen(true);
    }
  }, [student]);

  const handleLogin = () => {
    const trimmed = loginId.trim();

    if (!trimmed) {
      setError("أدخل رقم الدخول.");
      return;
    }

    const foundStudent = getStudentByLoginId(data, trimmed);

    if (!foundStudent) {
      setError("رقم الدخول غير موجود.");
      return;
    }

    setStudentLoginId(foundStudent.loginId);
    setError("");
    setMessage("");
    setLoginDialogOpen(false);
    saveAccessSession({
      role: "student",
      loginCode: foundStudent.loginId,
      name: foundStudent.name,
      redirectPath: `/student?login=${encodeURIComponent(foundStudent.loginId)}`,
      branchId: foundStudent.branchId,
    });

    // Trigger OS push permission prompt immediately after student login click.
    void activatePushFromUserGesture(foundStudent.loginId);
  };

  const handleSubmit = async () => {
    if (!activeCourse) {
      setError("لا توجد دورة مفعلة حاليًا.");
      return;
    }

    if (!isAssessmentEnabled) {
      setError("لا يستطيع الطالب الاختبار الآن.");
      return;
    }

    if (!student) {
      setError("سجّل الدخول أولًا برقم الدخول.");
      return;
    }

    if (existingSubmission && !hasPendingPostSatisfaction) {
      setError("تم إرسال النتيجة مسبقًا، ولا يمكن إعادة الاختبار مرة أخرى.");
      return;
    }

    if (!existingSubmission) {
      for (const question of questions) {
        if (!answers[question.id]?.trim()) {
          setError("أجب عن جميع الأسئلة أولًا.");
          return;
        }
      }
    }

    if (assessmentType === "post" && satisfactionQuestions.length > 0 && !alreadySubmittedSatisfaction && !validateSatisfactionAnswers()) {
      return;
    }

    try {
      if (!existingSubmission) {
        await store.submitAssessment(activeCourse.id, assessmentType, {
          studentName: student.name,
          loginId: student.loginId,
          answers: questions.map((question) => ({
            questionId: question.id,
            value: answers[question.id] ?? "",
            fileName: files[question.id]?.name,
            fileType: files[question.id]?.type,
            fileDataUrl: files[question.id]?.dataUrl,
          })),
        });
      }

      if (assessmentType === "post") {
        await submitSatisfactionResponses();
      }

      setError("");
      setMessage("");
      setAnswers({});
      setFiles({});
      setResetKey((value) => value + 1);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "تعذر إرسال الاختبار.");
    }
  };

  const handleStudentFileSelect = async (questionId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_STUDENT_ATTACHMENT_SIZE) {
      setError("حجم الملف المرفوع كبير جدًا. الحد الأقصى 5 ميجابايت.");
      event.target.value = "";
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("student-file-read-failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");

    if (!dataUrl) {
      setError("تعذر قراءة الملف المرفوع.");
      event.target.value = "";
      return;
    }

    setFiles((current) => ({
      ...current,
      [questionId]: {
        name: file.name,
        type: file.type,
        dataUrl,
      },
    }));
    setError("");
    event.target.value = "";
  };

  if (!isHydrated) {
    return null;
  }

  if (!activeCourse) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_38%),linear-gradient(180deg,#f7fcfb_0%,#eff8f7_100%)]">
        <Dialog open onOpenChange={(open) => {
          if (!open) {
            navigate("/");
          }
        }}>
          <DialogContent className="max-w-xl rounded-[2rem] border-white/80 bg-white/95 p-0 text-right shadow-[0_24px_70px_rgba(8,65,89,0.14)] [&>button]:hidden">
            <div className="space-y-4 px-4 py-5 sm:px-5">
              <div className="space-y-2 text-right">
                <h2 className="text-3xl font-extrabold text-foreground">لا يوجد بيانات حاليًا</h2>
                <p className="text-base leading-8 text-muted-foreground">لا توجد أي دورة مفعلة حاليًا، لذلك لا يمكن عرض الاختبارات الآن.</p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" className="rounded-full px-6" onClick={() => navigate("/")}>إغلاق</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const isLocked = !student;
  const isPreviewImage = previewAttachment?.type?.startsWith("image/") || previewAttachment?.dataUrl.startsWith("data:image/");
  const isPreviewPdf = previewAttachment?.type === "application/pdf" || previewAttachment?.dataUrl.startsWith("data:application/pdf");
  const isPreviewVideo = previewAttachment?.type?.startsWith("video/") || previewAttachment?.dataUrl.startsWith("data:video/");
  const previewPdfSrc = previewAttachment && isPreviewPdf
    ? `${previewAttachment.dataUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`
    : "";

  return (
    <div className="relative min-h-screen overflow-hidden gradient-hero">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[22%] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground/15 animate-slow-spin" />
        <div className="absolute left-1/2 top-[22%] h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground/10 animate-float" />
        <div className="absolute left-1/2 top-[22%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground/10 blur-3xl animate-soft-pulse" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary-deep/55 to-transparent" />
        <div className="absolute -left-16 bottom-20 h-48 w-48 rounded-full border border-white/10" />
        <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full border border-white/10" />
      </div>
      <div className="container relative z-10 px-3 py-4 sm:px-4 sm:py-8 md:py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex justify-start sm:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full border-white/70 bg-white/90 text-primary shadow-[0_10px_30px_rgba(8,65,89,0.12)]"
              onClick={() => navigate("/")}
              aria-label="الرجوع إلى الصفحة الرئيسية"
            >
              <ArrowRight className="size-5" />
            </Button>
          </div>

          <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
            <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto rounded-[1.75rem] border-white/80 bg-white/95 p-4 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden sm:p-6">
              <div className="space-y-4">
                <div className="text-xl font-bold text-foreground">معاينة المرفق</div>

                {previewAttachment && isPreviewImage && (
                  <div className="overflow-hidden rounded-[1.25rem] border border-primary/10 bg-muted/20 p-2">
                    <img src={previewAttachment.dataUrl} alt="معاينة المرفق" className="max-h-[60vh] w-full rounded-[1rem] object-contain sm:max-h-[70vh]" />
                  </div>
                )}

                {previewAttachment && isPreviewPdf && (
                  <div className="overflow-hidden rounded-[1.25rem] border border-primary/10 bg-white">
                    <iframe title="معاينة PDF" src={previewPdfSrc} className="h-[60vh] w-full bg-white sm:h-[70vh]" />
                  </div>
                )}

                {previewAttachment && isPreviewVideo && (
                  <div className="overflow-hidden rounded-[1.25rem] border border-primary/10 bg-black/90 p-2">
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-[60vh] w-full rounded-[1rem] bg-black sm:max-h-[70vh]"
                      src={previewAttachment.dataUrl}
                    />
                  </div>
                )}

                {previewAttachment && !isPreviewImage && !isPreviewPdf && !isPreviewVideo && (
                  <div className="rounded-[1.25rem] border border-primary/10 bg-muted/20 p-5 text-sm text-muted-foreground">
                    هذا النوع لا يدعم المعاينة المباشرة داخل الصفحة.
                  </div>
                )}

                <div className="flex justify-start">
                  <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setPreviewAttachment(null)}>إغلاق</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={loginDialogOpen && isLocked}
            onOpenChange={(open) => {
              if (!isLocked) {
                setLoginDialogOpen(open);
              }
            }}
          >
            <DialogContent
              className="w-[calc(100vw-1.5rem)] max-w-lg rounded-[1.75rem] border-white/80 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden"
              onEscapeKeyDown={(event) => {
                if (isLocked) {
                  event.preventDefault();
                }
              }}
              onPointerDownOutside={(event) => {
                if (isLocked) {
                  event.preventDefault();
                }
              }}
              onInteractOutside={(event) => {
                if (isLocked) {
                  event.preventDefault();
                }
              }}
            >
              <div className="space-y-4 px-4 py-4">
                <div className="space-y-2 text-right">
                  <div className="text-sm text-muted-foreground">دخول الطالب</div>
                  <div className="text-xl font-bold text-foreground sm:text-2xl">أدخل رقم الحساب</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">رقم الحساب</label>
                  <Input value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="رقم الحساب" />
                </div>
                {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                <div className="flex justify-end gap-3">
                  <Button className="w-full sm:w-auto" onClick={handleLogin}>دخول الطالب</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className={cn("transition-smooth", isLocked && "pointer-events-none select-none blur-[2px]")} aria-hidden={isLocked}>
            <div className="mb-6 flex flex-col items-center gap-4 text-center text-white sm:mb-8">
              <img src="/اللوقو-شفاف.png" alt="شعار برنامج رخصة ممارس" className="site-logo site-logo-top h-16 w-auto object-contain sm:h-20" />
              <div className="space-y-3">
                <div className="mx-auto h-1 w-16 rounded-full bg-white/70" />
                <div className="inline-flex max-w-3xl rounded-full border border-white/20 bg-white/10 px-6 py-3 text-xl font-extrabold text-white backdrop-blur-md sm:px-8 sm:text-2xl md:text-3xl">
                  {activeCourse.title}
                </div>
              </div>
            </div>

            <Card className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_70px_rgba(8,65,89,0.16),inset_0_0_0_1px_rgba(16,118,153,0.08)] backdrop-blur-xl">
            <div className="absolute inset-0 rounded-[2rem] border border-primary/10" aria-hidden />
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" aria-hidden />
            <CardContent className="relative space-y-6 px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
              {!isAssessmentEnabled && (
                <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 text-right">
                  <div className="text-base font-extrabold text-amber-800">غير متاح الآن</div>
                  <div className="mt-2 text-sm text-amber-700">هذا القسم لم يتم تفعيله من قبل المشرف، لذلك لا يستطيع الطالب الاختبار الآن.</div>
                </div>
              )}
              {error && <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
              {isAssessmentEnabled && questions.length === 0 && <div className="rounded-3xl border border-dashed border-primary/20 p-5 text-sm text-muted-foreground">لا توجد أسئلة مضافة لهذا القسم بعد.</div>}
              {student && existingSubmission && !hasPendingPostSatisfaction && (
                <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50/95 p-5 text-right shadow-[0_10px_24px_rgba(14,116,144,0.08)]">
                  <div className="text-base font-extrabold text-sky-800">تم الإرسال</div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      className="rounded-full bg-sky-700 px-6 text-white hover:bg-sky-800"
                      onClick={() => navigate("/")}
                    >
                      إغلاق
                    </Button>
                  </div>
                </div>
              )}
              {student && existingSubmission && hasPendingPostSatisfaction && (
                <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50/95 p-5 text-right shadow-[0_10px_24px_rgba(14,116,144,0.08)]">
                  <div className="text-base font-extrabold text-sky-800">تم إرسال الاختبار</div>
                  <div className="mt-2 text-sm font-medium text-sky-700">أكمل الاستبيان ثم اضغط إرسال.</div>
                </div>
              )}
              {canInteractWithAssessment && questions.length > 0 && <div className="text-base font-bold text-foreground sm:text-lg">أجب على الأسئلة التالية:</div>}

              {canInteractWithAssessment && questions.map((question, index) => (
                <div key={`${question.id}-${resetKey}`} className="rounded-[1.75rem] border border-primary/10 bg-[#f6fbfd] p-4 shadow-[0_10px_30px_rgba(8,65,89,0.06)] sm:p-5">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-base font-extrabold leading-8 text-foreground sm:text-lg">{index + 1}. {question.prompt}</div>
                    <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                      {question.allowFile && (
                        <>
                          <label
                            htmlFor={`student-file-${question.id}`}
                            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-primary/20 bg-white px-4 text-sm font-bold text-primary transition-smooth hover:border-primary hover:bg-primary/5"
                          >
                            إرفاق ملف
                          </label>
                          <Input id={`student-file-${question.id}`} type="file" className="hidden" onChange={(event) => void handleStudentFileSelect(question.id, event)} />
                        </>
                      )}
                      {question.attachmentDataUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full rounded-full border-primary/20 bg-white text-primary hover:bg-primary/5 sm:w-auto"
                          onClick={() =>
                            setPreviewAttachment({
                              name: question.attachmentName,
                              type: question.attachmentType,
                              dataUrl: question.attachmentDataUrl ?? "",
                            })
                          }
                        >
                          عرض المحتوى
                        </Button>
                      )}
                    </div>
                  </div>
                  {question.type === "multiple" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {question.options.map((option) => (
                        <label key={option} className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition-smooth", answers[question.id] === option ? "border-primary bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(16,118,153,0.24)]" : "border-primary/15 bg-white text-foreground hover:border-primary/35 hover:bg-primary/5")}>
                          <input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} className="sr-only" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Textarea
                      value={answers[question.id] ?? ""}
                      onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                      placeholder="اكتب إجابتك هنا"
                      className="min-h-32 rounded-2xl border-primary/15 bg-white/95 text-base focus-visible:ring-primary/40"
                    />
                  )}
                  {question.allowFile && files[question.id]?.name && <p className="mt-4 break-all text-xs text-muted-foreground">تم اختيار مرفق للسؤال.</p>}
                </div>
              ))}

              {assessmentType === "post" && student && satisfactionQuestions.length > 0 && !alreadySubmittedSatisfaction && (
                <>
                  <div className="h-px bg-[linear-gradient(90deg,transparent,rgba(16,118,153,0.42),transparent)]" aria-hidden />
                  {satisfactionQuestions.map((question, index) => (
                    <div key={question.id} className="rounded-[1.75rem] border border-primary/10 bg-[#f6fbfd] p-4 shadow-[0_10px_30px_rgba(8,65,89,0.06)] sm:p-5">
                      <div className="mb-3 text-base font-extrabold leading-8 text-foreground">{index + 1}. {question.prompt}{question.isRequired && <span className="mr-1 text-destructive">*</span>}</div>
                      {question.type === "rating" ? (
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: 11 }, (_, i) => i).map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSatisfactionAnswers((current) => ({ ...current, [question.id]: { ratingValue: val, textValue: "" } }))}
                              className={cn(
                                "h-10 w-10 rounded-full border text-sm font-bold transition-smooth",
                                satisfactionAnswers[question.id]?.ratingValue === val
                                  ? "border-primary bg-primary text-white shadow-[0_8px_20px_rgba(16,118,153,0.3)]"
                                  : "border-primary/20 bg-white text-foreground hover:border-primary hover:bg-primary/5",
                              )}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Textarea
                          value={satisfactionAnswers[question.id]?.textValue ?? ""}
                          onChange={(event) => setSatisfactionAnswers((current) => ({ ...current, [question.id]: { ratingValue: null, textValue: event.target.value } }))}
                          placeholder="اكتب رأيك هنا"
                          className="min-h-28 rounded-2xl border-primary/15 bg-white/95 text-base focus-visible:ring-primary/40"
                        />
                      )}
                    </div>
                  ))}
                </>
              )}

              {satisfactionError && <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">{satisfactionError}</p>}

              {canSubmitPostFlow && (questions.length > 0 || hasPendingPostSatisfaction) && (
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button className="w-full rounded-full px-8 py-6 text-base font-extrabold shadow-gold sm:mr-auto sm:w-auto" onClick={() => void handleSubmit()} disabled={!student || !isAssessmentEnabled || (questions.length === 0 && !hasPendingPostSatisfaction)}>إرسال</Button>
                </div>
              )}
            </CardContent>
            </Card>

            {assessmentType === "post" && student && satisfactionQuestions.length > 0 && alreadySubmittedSatisfaction && (
              <div className="mt-6 rounded-[1.75rem] border border-emerald-200 bg-emerald-50/95 px-5 py-4 text-right text-sm font-bold text-emerald-700">
                شكرًا! تم استلام استبيان الرضا.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoursePage;
