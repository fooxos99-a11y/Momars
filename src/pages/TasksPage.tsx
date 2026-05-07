import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DocumentEditor from "@/components/editor/DocumentEditor";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { activatePushFromUserGesture } from "@/hooks/use-push-notifications";
import { hasMeaningfulDocumentContent } from "@/lib/document-content";
import { cn } from "@/lib/utils";
import {
  getAssessmentAvailabilityDeadline,
  getActiveTask,
  getStudentByLoginId,
  getTasks,
  isAssessmentEnabledForCourse,
  loadAccessSession,
  saveAccessSession,
  useDashboardStore,
} from "@/lib/dashboard-store";

const extractFirstUrl = (value: string): string | null => {
  const direct = value.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (direct) return direct;

  const href = value.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  if (href) return href;

  const bareYoutube = value.match(/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>]+/i)?.[0];
  if (bareYoutube) return bareYoutube;

  return null;
};

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
};

const getYoutubeEmbedUrl = (raw: string): string | null => {
  const source = normalizeUrl(extractFirstUrl(raw) ?? raw);
  if (!source) return null;

  try {
    const parsed = new URL(source);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let videoId: string | null = null;

    if (host === "youtu.be") {
      videoId = parsed.pathname.slice(1).split("?")[0];
    } else if (host.endsWith("youtube.com")) {
      videoId = parsed.searchParams.get("v");
      if (!videoId) {
        const embedMatch = parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);
        if (embedMatch) videoId = embedMatch[1];
      }
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0` : null;
  } catch {
    return null;
  }
};

const TaskCountdownLabel = ({ closesAt }: { closesAt: string }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, new Date(closesAt).getTime() - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}س`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}د`);
  parts.push(`${seconds}ث`);
  if (remaining === 0) return <span className="text-destructive">انتهى وقت المهمة الأدائية</span>;
  return <span>يغلق بعد: {parts.join(" ")}</span>;
};

const TasksPage = () => {
  const store = useDashboardStore();
  const { data, isHydrated } = store;
  const tasks = useMemo(() => getTasks(data), [data]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [studentLoginId, setStudentLoginId] = useState("");
  const [studentResolved, setStudentResolved] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { name: string; type: string; dataUrl: string }>>({});
  const [error, setError] = useState("");
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [detailsSubmissionId, setDetailsSubmissionId] = useState<string | null>(null);

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
      setStudentResolved(true);
      return;
    }

    const foundStudent = getStudentByLoginId(data, loginFromSession);

    if (foundStudent) {
      setLoginId(foundStudent.loginId);
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
    const requestedTaskId = searchParams.get("taskId")?.trim() ?? "";

    if (requestedTaskId && tasks.some((task) => task.id === requestedTaskId)) {
      setSelectedTaskId(requestedTaskId);
      return;
    }

    setSelectedTaskId(tasks[0]?.id ?? "");
  }, [searchParams, tasks]);

  const student = useMemo(() => {
    if (!studentLoginId) {
      return null;
    }

    return getStudentByLoginId(data, studentLoginId);
  }, [data, studentLoginId]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const documentQuestion = selectedTask?.taskQuestions[0] ?? null;

  const existingSubmission = useMemo(() => {
    if (!selectedTask || !student) {
      return null;
    }

    return data.submissions
      .filter((submission) => submission.courseId === selectedTask.id && submission.assessmentType === "tasks" && submission.loginId === student.loginId)
      .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())[0] ?? null;
  }, [data.submissions, selectedTask, student]);

  const detailsSubmission = data.submissions.find((submission) => submission.id === detailsSubmissionId) ?? null;
  const detailsTask = tasks.find((task) => task.id === detailsSubmission?.courseId) ?? null;

  useEffect(() => {
    if (!existingSubmission) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      navigate("/");
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [existingSubmission, navigate]);

  useEffect(() => {
    if (!student) {
      setLoginDialogOpen(true);
    }
  }, [student]);

  const initialAnswers = useMemo<Record<string, string>>(() => {
    if (!selectedTask) {
      return {};
    }

    if (selectedTask.taskMode === "document") {
      const question = selectedTask.taskQuestions[0];
      if (!question) {
        return {};
      }
      const existingAnswer = existingSubmission?.answers.find((answer) => answer.questionId === question.id)?.value;
      return { [question.id]: existingAnswer ?? selectedTask.taskTemplateContent ?? "" };
    }

    return Object.fromEntries(selectedTask.taskQuestions.map((question) => [question.id, ""]));
  }, [existingSubmission?.id, selectedTask]);

  useEffect(() => {
    setAnswers(initialAnswers);
    setFiles({});
  }, [initialAnswers, selectedTask?.id]);

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
    setLoginDialogOpen(false);

    // Trigger OS push permission prompt immediately after student login click.
    void activatePushFromUserGesture(foundStudent.loginId);
  };

  const handleFileSelect = async (questionId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("task-file-read-failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");

    if (!dataUrl) {
      setError("تعذر قراءة الملف.");
      event.target.value = "";
      return;
    }

    setFiles((current) => ({
      ...current,
      [questionId]: { name: file.name, type: file.type, dataUrl },
    }));
  };

  const handleReset = () => {
    if (!selectedTask || existingSubmission) {
      return;
    }

    setAnswers(initialAnswers);
    setFiles({});
    setError("");
  };

  const handleSubmit = async () => {
    if (!selectedTask || !student) {
      setError("سجّل الدخول أولًا.");
      return;
    }

    if (existingSubmission) {
      setError("تم إرسال هذه المهمة الأدائية مسبقًا.");
      return;
    }

    if (selectedTask.taskMode === "document") {
      if (!documentQuestion || !hasMeaningfulDocumentContent(answers[documentQuestion.id] ?? "")) {
        setError("اكتب محتوى المهمة الأدائية أولًا.");
        return;
      }
    } else {
      for (const question of selectedTask.taskQuestions) {
        if (!answers[question.id]?.trim()) {
          setError("أجب عن جميع الأسئلة أولًا.");
          return;
        }
      }
    }

    try {
      await store.submitAssessment(selectedTask.id, "tasks", {
        studentName: student.name,
        loginId: student.loginId,
        answers: (selectedTask.taskMode === "document" ? [documentQuestion].filter(Boolean) : selectedTask.taskQuestions).map((question) => ({
          questionId: question!.id,
          value: answers[question!.id] ?? "",
          fileName: files[question!.id]?.name,
          fileType: files[question!.id]?.type,
          fileDataUrl: files[question!.id]?.dataUrl,
        })),
      });

      setError("");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "تعذر إرسال المهمة الأدائية.");
    }
  };

  if (!isHydrated || !studentResolved) {
    return null;
  }

  if (!studentResolved) {
    return <Navigate to="/" replace />;
  }

  // If no active task exists at all, show an empty state
  const activeTask = getActiveTask(data, student?.branchId ?? null);
  if (!activeTask) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_38%),linear-gradient(180deg,#f7fcfb_0%,#eff8f7_100%)]">
        <Dialog open onOpenChange={(open) => { if (!open) navigate("/"); }}>
          <DialogContent className="max-w-xl rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_70px_rgba(8,65,89,0.14)] [&>button]:hidden">
            <div className="space-y-4 px-4 py-5 sm:px-5">
              <div className="space-y-2 text-right">
                <h2 className="text-3xl font-extrabold text-foreground">لا يوجد تكليف حاليًا</h2>
                <p className="text-base leading-8 text-muted-foreground">لم يتم تفعيل أي تكليف في الوقت الحالي.</p>
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
  const taskIsEnabled = isAssessmentEnabledForCourse(selectedTask, "tasks", student?.branchId ?? null);
  const isDisabled = Boolean(existingSubmission) || !taskIsEnabled;

  return (
    <div className="relative min-h-screen overflow-hidden gradient-hero">
      {/* Background decorations — identical to CoursePage */}
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
        <div className="absolute -left-16 bottom-20 h-48 w-48 rounded-full border border-white/10" />
        <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full border border-white/10" />
      </div>

      <div className="container relative z-10 px-3 py-4 sm:px-4 sm:py-8 md:py-12">
        <div className="mx-auto max-w-4xl">

          {/* Login dialog — cannot be dismissed without signing in */}
          <Dialog
            open={loginDialogOpen && isLocked}
            onOpenChange={(open) => { if (!isLocked) setLoginDialogOpen(open); }}
          >
            <DialogContent
              className="w-[calc(100vw-2rem)] max-w-[20rem] gap-0 rounded-[1.75rem] border-2 border-primary/35 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-0 [&>button]:hidden"
              onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}
              onPointerDownOutside={(e) => { if (isLocked) e.preventDefault(); }}
              onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }}
            >
              <div className="space-y-4 px-5 py-5">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">رقم الدخول</label>
                  <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} />
                </div>
                {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                <div className="flex justify-end gap-3">
                  <Button className="w-full sm:w-auto" onClick={handleLogin}>دخول</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Details submission dialog */}
          <Dialog open={Boolean(detailsSubmission)} onOpenChange={(open) => !open && setDetailsSubmissionId(null)}>
            <DialogContent className="max-w-3xl rounded-[1.75rem] p-0 text-right [&>button]:hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-border/40 px-4 pb-2.5 pt-3.5 flex-shrink-0">
                <Button variant="ghost" size="sm" className="rounded-full px-4" onClick={() => setDetailsSubmissionId(null)}>إغلاق ✕</Button>
                <div className="text-xl font-bold text-foreground">تفاصيل الإرسال</div>
              </div>
              <div className="overflow-y-auto flex-1 space-y-3 p-4">
                {detailsSubmission?.answers.map((answer, index) => (
                  <div key={`${answer.questionId}-${index}`} className="rounded-[1rem] border border-border/60 bg-muted/10 p-3">
                    {detailsTask?.taskMode === "document" ? (
                      <DocumentEditor value={answer.value || "<p>لا يوجد محتوى</p>"} editable={false} />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">{answer.value || "لا يوجد محتوى"}</div>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* Main content — blurred when locked */}
          <div className={cn("transition-smooth", isLocked && "pointer-events-none select-none blur-[2px]")} aria-hidden={isLocked}>

            {/* Title header */}
            <div className="mb-6 flex flex-col items-center gap-4 text-center text-white sm:mb-8">
              <img src="/اللوقو-شفاف.png" alt="شعار برنامج رخصة ممارس" className="site-logo site-logo-top h-16 w-auto object-contain sm:h-20" />
              <div className="space-y-3">
                <div className="mx-auto h-1 w-16 rounded-full bg-white/70" />
                <div className="inline-flex max-w-3xl rounded-full border border-white/20 bg-white/10 px-6 py-3 text-xl font-extrabold text-white backdrop-blur-md sm:px-8 sm:text-2xl md:text-3xl">
                  {selectedTask?.title ?? "المهمة الأدائية"}
                </div>
                {selectedTask && (
                  <div className="text-sm font-medium text-white/80">
                    {(() => {
                      if (existingSubmission) return "تم الإرسال";
                      const deadline = getAssessmentAvailabilityDeadline(selectedTask, "tasks", student?.branchId ?? null);
                      if (taskIsEnabled && deadline) return <TaskCountdownLabel closesAt={deadline} />;
                      return "يمكنك إرسال المهمة الأدائية مرة واحدة";
                    })()}
                  </div>
                )}
                {!existingSubmission && taskIsEnabled && selectedTask?.taskMode === "document" && (
                  <div className="mx-auto mt-1 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/95 backdrop-blur-sm sm:hidden">
                    اجعل الشاشة أفقية لرؤية جميع الأدوات
                  </div>
                )}
              </div>
            </div>

            {/* Task card */}
            {selectedTask && !existingSubmission ? (
              <Card className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_70px_rgba(8,65,89,0.16),inset_0_0_0_1px_rgba(16,118,153,0.08)] backdrop-blur-xl">
                <div className="absolute inset-0 rounded-[2rem] border border-primary/10" aria-hidden />
                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" aria-hidden />
                <CardContent className="relative space-y-6 px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6" dir="rtl">

                  {!taskIsEnabled && !existingSubmission && !student && (
                    <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 text-right">
                      <div className="text-base font-extrabold text-amber-800">غير متاح الآن</div>
                      <div className="mt-2 text-sm text-amber-700">هذه المهمة الأدائية لم يتم تفعيلها من قبل المشرف حاليًا.</div>
                    </div>
                  )}

                  {!existingSubmission && selectedTask.taskMode === "document" && (
                    <div className="space-y-2">
                      {(() => {
                        const embedUrl = getYoutubeEmbedUrl(
                          selectedTask.youtubeUrl?.trim()
                            ? selectedTask.youtubeUrl
                            : (selectedTask.taskTemplateContent ?? ""),
                        );
                        return embedUrl ? (
                          <div className="overflow-hidden rounded-[1.5rem] border border-primary/10 bg-black">
                            <iframe
                              src={embedUrl}
                              className="aspect-video w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                              allowFullScreen
                              title="مقطع المهمة الأدائية"
                            />
                          </div>
                        ) : null;
                      })()}
                      <DocumentEditor
                        value={documentQuestion ? (answers[documentQuestion.id] ?? "") : ""}
                        onChange={(nextValue) => documentQuestion && setAnswers((current) => ({ ...current, [documentQuestion.id]: nextValue }))}
                        editable={!isDisabled && Boolean(student)}
                        allowImageEditing={false}
                      />
                    </div>
                  )}

                  {!existingSubmission && selectedTask.taskMode !== "document" && selectedTask.taskQuestions.map((question, index) => (
                    <div key={question.id} className="rounded-[1.75rem] border border-primary/10 bg-[#f6fbfd] p-4 shadow-[0_10px_30px_rgba(8,65,89,0.06)] sm:p-5">
                      <div className="mb-3 text-base font-extrabold leading-8 text-foreground sm:text-lg">{index + 1}. {question.prompt}</div>
                      <Textarea
                        value={answers[question.id] ?? ""}
                        onChange={(e) => setAnswers((c) => ({ ...c, [question.id]: e.target.value }))}
                        disabled={isDisabled}
                        placeholder="اكتب إجابتك هنا"
                        className="min-h-32 rounded-2xl border-primary/15 bg-white/95 text-base focus-visible:ring-primary/40"
                      />
                      {question.allowFile && (
                        <div className="mt-3 space-y-1">
                          <Input type="file" onChange={(e) => void handleFileSelect(question.id, e)} disabled={isDisabled} />
                          {files[question.id]?.name && <div className="text-xs text-muted-foreground">{files[question.id].name}</div>}
                        </div>
                      )}
                    </div>
                  ))}

                  {error && <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">{error}</p>}

                  {!existingSubmission && taskIsEnabled && (
                    <div className="pt-2">
                      <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-full px-8 py-6 text-base font-extrabold sm:w-auto"
                        onClick={handleReset}
                        disabled={isDisabled || !student}
                      >
                        إعادة تعيين
                      </Button>
                      <Button
                        className="w-full rounded-full px-8 py-6 text-base font-extrabold shadow-gold sm:mr-auto sm:w-auto"
                        onClick={() => void handleSubmit()}
                        disabled={isDisabled || !student}
                      >
                        إرسال المهمة الأدائية
                      </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : !selectedTask ? (
              <Card className="rounded-[2rem] border border-white/80 bg-white/95">
                <CardContent className="p-6 text-sm text-muted-foreground">لا توجد تكاليف متاحة.</CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
