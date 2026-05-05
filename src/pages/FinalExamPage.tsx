import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type BranchId,
  getStudentByLoginId,
  isFinalExamAvailable,
  loadAccessSession,
  saveAccessSession,
  useDashboardStore,
} from "@/lib/dashboard-store";
import { activatePushFromUserGesture } from "@/hooks/use-push-notifications";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const normalizeAnswer = (value: string) => value.trim().toLowerCase();

const isAnswerCorrect = (correct: string, answer: string) =>
  Boolean(correct.trim()) && normalizeAnswer(answer) === normalizeAnswer(correct);

const FinalExamPage = () => {
  const store = useDashboardStore();
  const { data, isHydrated } = store;
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [studentLoginId, setStudentLoginId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { name: string; type: string; dataUrl: string }>>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [resetKey, setResetKey] = useState(0);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ name?: string; type?: string; dataUrl: string } | null>(null);
  const [searchParams] = useSearchParams();

  const student = useMemo(() => {
    if (!studentLoginId) return null;
    return getStudentByLoginId(data, studentLoginId);
  }, [data, studentLoginId]);

  const branchCode: BranchId = student?.branchId ?? "male";

  const questions = useMemo(
    () => data.finalExamQuestions.filter((q) => q.branchCode === branchCode).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.finalExamQuestions, branchCode],
  );

  const branchSetting = data.finalExamSettings[branchCode];
  const isEnabled = student ? isFinalExamAvailable(branchSetting, now) : false;

  const existingSubmission = useMemo(() => {
    if (!student) return null;
    return data.finalExamSubmissions.find((s) => s.loginCode === student.loginId) ?? null;
  }, [data.finalExamSubmissions, student]);

  const canInteract = Boolean(student) && isEnabled && !existingSubmission;

  const getGrade = () => {
    if (!existingSubmission) return { score: 0, total: questions.reduce((s, q) => s + q.points, 0) };
    const total = questions.reduce((s, q) => s + q.points, 0);
    if (typeof existingSubmission.manualScore === "number" && Number.isFinite(existingSubmission.manualScore)) {
      return { score: existingSubmission.manualScore, total: Math.max(total, existingSubmission.manualScore) };
    }
    const ansMap = new Map(existingSubmission.answers.map((a) => [a.questionId, a.value]));
    const scoreOverride = existingSubmission.answers.find((a) => a.questionId === "__score_override__")?.value;
    if (scoreOverride !== undefined) {
      const n = Number(scoreOverride);
      if (Number.isFinite(n) && n >= 0) return { score: n, total: Math.max(total, n) };
    }
    const score = questions.reduce((s, q) => {
      const ans = ansMap.get(q.id) ?? "";
      return q.correctAnswer.trim() && isAnswerCorrect(q.correctAnswer, ans) ? s + q.points : s;
    }, 0);
    return { score, total };
  };

  useEffect(() => {
    if (!isHydrated) return;
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
      saveAccessSession({ role: "student", loginCode: foundStudent.loginId, name: foundStudent.name, redirectPath: `/student?login=${encodeURIComponent(foundStudent.loginId)}`, branchId: foundStudent.branchId });
    }
  }, [data, isHydrated, searchParams]);

  useEffect(() => {
    if (!student) setLoginDialogOpen(true);
  }, [student]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const handleLogin = () => {
    const trimmed = loginId.trim();
    if (!trimmed) { setError("أدخل رقم الدخول."); return; }
    const foundStudent = getStudentByLoginId(data, trimmed);
    if (!foundStudent) { setError("رقم الدخول غير موجود."); return; }
    setStudentLoginId(foundStudent.loginId);
    setError("");
    setLoginDialogOpen(false);
    saveAccessSession({ role: "student", loginCode: foundStudent.loginId, name: foundStudent.name, redirectPath: `/student?login=${encodeURIComponent(foundStudent.loginId)}`, branchId: foundStudent.branchId });
    void activatePushFromUserGesture(foundStudent.loginId);
  };

  const handleSubmit = async () => {
    if (!student || !isEnabled) { setError("الاختبار غير متاح حاليًا."); return; }
    if (existingSubmission) { setError("تم إرسال الاختبار مسبقًا."); return; }
    for (const q of questions) {
      if (!answers[q.id]?.trim()) { setError("أجب عن جميع الأسئلة أولًا."); return; }
    }
    try {
      await store.submitFinalExam({
        branchCode,
        studentName: student.name,
        loginCode: student.loginId,
        answers: questions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? "", fileName: files[q.id]?.name, fileType: files[q.id]?.type, fileDataUrl: files[q.id]?.dataUrl })),
      });
      setError("");
      setAnswers({});
      setFiles({});
      setResetKey((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الاختبار.");
    }
  };

  const handleFileSelect = async (questionId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) { setError("حجم الملف كبير جدًا (الحد 5 ميجابايت)."); event.target.value = ""; return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("file-read-failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) { setError("تعذر قراءة الملف."); event.target.value = ""; return; }
    setFiles((c) => ({ ...c, [questionId]: { name: file.name, type: file.type, dataUrl } }));
    setError("");
    event.target.value = "";
  };

  if (!isHydrated) return null;

  const isLocked = !student;
  const isPreviewImage = previewAttachment?.type?.startsWith("image/") || previewAttachment?.dataUrl.startsWith("data:image/");
  const isPreviewPdf = previewAttachment?.type === "application/pdf" || previewAttachment?.dataUrl.startsWith("data:application/pdf");
  const isPreviewVideo = previewAttachment?.type?.startsWith("video/") || previewAttachment?.dataUrl.startsWith("data:video/");

  return (
    <div className="relative min-h-screen overflow-hidden gradient-hero">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[22%] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground/15 animate-slow-spin" />
        <div className="absolute left-1/2 top-[22%] h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground/10 animate-float" />
        <div className="absolute left-1/2 top-[22%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground/10 blur-3xl animate-soft-pulse" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)", backgroundSize: "28px 28px" }}
          aria-hidden
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary-deep/55 to-transparent" />
      </div>

      <div className="container relative z-10 px-3 py-4 sm:px-4 sm:py-8 md:py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex justify-start sm:hidden">
            <Button type="button" variant="outline" size="icon" className="rounded-full border-white/70 bg-white/90 text-primary" onClick={() => navigate("/")} aria-label="رجوع">
              <ArrowRight className="size-5" />
            </Button>
          </div>

          {/* Attachment preview dialog */}
          <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
            <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto rounded-[1.75rem] border-white/80 bg-white/95 p-4 text-right [&>button]:hidden sm:p-6">
              <div className="space-y-4">
                <div className="text-xl font-bold text-foreground">معاينة المرفق</div>
                {previewAttachment && isPreviewImage && <div className="overflow-hidden rounded-[1.25rem] border border-primary/10 bg-muted/20 p-2"><img src={previewAttachment.dataUrl} alt="مرفق" className="max-h-[60vh] w-full rounded-[1rem] object-contain" /></div>}
                {previewAttachment && isPreviewPdf && <div className="overflow-hidden rounded-[1.25rem] border border-primary/10"><iframe title="PDF" src={`${previewAttachment.dataUrl}#toolbar=0`} className="h-[60vh] w-full bg-white" /></div>}
                {previewAttachment && isPreviewVideo && <div className="overflow-hidden rounded-[1.25rem] border border-primary/10 bg-black/90 p-2"><video controls playsInline preload="metadata" className="max-h-[60vh] w-full rounded-[1rem]" src={previewAttachment.dataUrl} /></div>}
                <div className="flex justify-start"><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setPreviewAttachment(null)}>إغلاق</Button></div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Login dialog */}
          <Dialog open={loginDialogOpen && isLocked} onOpenChange={(open) => { if (!isLocked) setLoginDialogOpen(open); }}>
            <DialogContent
              className="w-[calc(100vw-1.5rem)] max-w-lg rounded-[1.75rem] border-white/80 bg-white/95 p-0 text-right [&>button]:hidden"
              onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}
              onPointerDownOutside={(e) => { if (isLocked) e.preventDefault(); }}
            >
              <div className="space-y-4 px-4 py-4">
                <div className="space-y-2 text-right">
                  <div className="text-sm text-muted-foreground">دخول الطالب</div>
                  <div className="text-xl font-bold text-foreground sm:text-2xl">أدخل رقم الحساب</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">رقم الحساب</label>
                  <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="رقم الحساب" />
                </div>
                {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                <Button className="w-full" onClick={handleLogin}>دخول الطالب</Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className={cn("transition-smooth", isLocked && "pointer-events-none select-none blur-[2px]")} aria-hidden={isLocked}>
            <div className="mb-6 flex flex-col items-center gap-4 text-center text-white sm:mb-8">
              <img src="/اللوقو-شفاف.png" alt="شعار برنامج رخصة ممارس" className="site-logo site-logo-top h-16 w-auto object-contain sm:h-20" />
              <div className="space-y-3">
                <div className="mx-auto h-1 w-16 rounded-full bg-white/70" />
                <div className="inline-flex max-w-3xl rounded-full border border-white/20 bg-white/10 px-6 py-3 text-xl font-extrabold text-white backdrop-blur-md sm:px-8 sm:text-2xl md:text-3xl">
                  الاختبار النهائي
                </div>
              </div>
            </div>

            <Card className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_70px_rgba(8,65,89,0.16),inset_0_0_0_1px_rgba(16,118,153,0.08)] backdrop-blur-xl">
              <div className="absolute inset-0 rounded-[2rem] border border-primary/10" aria-hidden />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" aria-hidden />
              <CardContent className="relative space-y-6 px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
                {!isEnabled && student && (
                  <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 text-right">
                    <div className="text-base font-extrabold text-amber-800">غير متاح الآن</div>
                    <div className="mt-2 text-sm text-amber-700">لم يتم تفعيل الاختبار النهائي لفرعك من قبل المشرف أو انتهت مدة الفتح.</div>
                  </div>
                )}
                {error && !loginDialogOpen && <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
                {isEnabled && questions.length === 0 && <div className="rounded-3xl border border-dashed border-primary/20 p-5 text-sm text-muted-foreground">لا توجد أسئلة مضافة لهذا القسم بعد.</div>}

                {student && existingSubmission && (
                  <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50/95 p-5 text-right shadow-[0_10px_24px_rgba(14,116,144,0.08)]">
                    <div className="text-base font-extrabold text-sky-800">تم الإرسال</div>
                    {(() => { const { score, total } = getGrade(); return <div className="mt-2 text-sm text-sky-700">نتيجتك: {score} / {total}</div>; })()}
                    <div className="mt-4 flex justify-end">
                      <Button type="button" className="rounded-full bg-sky-700 px-6 text-white hover:bg-sky-800" onClick={() => navigate("/")}>إغلاق</Button>
                    </div>
                  </div>
                )}

                {canInteract && questions.length > 0 && <div className="text-base font-bold text-foreground sm:text-lg">أجب على الأسئلة التالية:</div>}

                {canInteract && questions.map((question, index) => (
                  <div key={`${question.id}-${resetKey}`} className="rounded-[1.75rem] border border-primary/10 bg-[#f6fbfd] p-4 shadow-[0_10px_30px_rgba(8,65,89,0.06)] sm:p-5">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-base font-extrabold leading-8 text-foreground sm:text-lg">{index + 1}. {question.prompt}</div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {question.allowFile && (
                          <>
                            <label htmlFor={`file-${question.id}`} className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-primary/20 bg-white px-4 text-sm font-bold text-primary transition-smooth hover:border-primary hover:bg-primary/5">
                              إرفاق ملف
                            </label>
                            <Input id={`file-${question.id}`} type="file" className="hidden" onChange={(e) => void handleFileSelect(question.id, e)} />
                          </>
                        )}
                        {question.attachmentDataUrl && (
                          <Button type="button" variant="outline" className="rounded-full border-primary/20 bg-white text-primary hover:bg-primary/5"
                            onClick={() => setPreviewAttachment({ name: question.attachmentName, type: question.attachmentType, dataUrl: question.attachmentDataUrl })}>
                            عرض المحتوى
                          </Button>
                        )}
                      </div>
                    </div>
                    {question.type === "multiple" || question.type === "truefalse" ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {question.options.map((option) => (
                          <label key={option} className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition-smooth",
                            answers[question.id] === option ? "border-primary bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(16,118,153,0.24)]" : "border-primary/15 bg-white text-foreground hover:border-primary/35 hover:bg-primary/5")}>
                            <input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={(e) => setAnswers((c) => ({ ...c, [question.id]: e.target.value }))} className="sr-only" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <Textarea
                        value={answers[question.id] ?? ""}
                        onChange={(e) => setAnswers((c) => ({ ...c, [question.id]: e.target.value }))}
                        placeholder="اكتب إجابتك هنا"
                        className="min-h-32 rounded-2xl border-primary/15 bg-white/95 text-base focus-visible:ring-primary/40"
                      />
                    )}
                    {question.allowFile && files[question.id]?.name && <p className="mt-4 break-all text-xs text-muted-foreground">تم اختيار مرفق للسؤال.</p>}
                  </div>
                ))}

                {canInteract && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button className="w-full rounded-full px-8 py-6 text-base font-extrabold shadow-gold sm:mr-auto sm:w-auto" onClick={() => void handleSubmit()} disabled={questions.length === 0}>
                      إرسال
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Score display after submission */}
            {student && existingSubmission && questions.length > 0 && (
              <div className="mt-6 space-y-3">
                {questions.map((question, index) => {
                  const answerValue = existingSubmission.answers.find((a) => a.questionId === question.id)?.value ?? "";
                  const isCorrect = question.correctAnswer.trim() ? isAnswerCorrect(question.correctAnswer, answerValue) : null;
                  return (
                    <div key={question.id} className="rounded-[1.75rem] border border-primary/10 bg-white p-4">
                      <div className="mb-2 text-sm font-bold text-foreground">{index + 1}. {question.prompt}</div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={cn("shrink-0", isCorrect === true ? "border-emerald-200 text-emerald-700" : isCorrect === false ? "border-rose-200 text-rose-600" : "border-primary/20 text-primary")}>
                          {answerValue || "—"}
                        </Badge>
                        {isCorrect === false && <span className="text-xs text-muted-foreground">الصحيح: {question.correctAnswer}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalExamPage;
