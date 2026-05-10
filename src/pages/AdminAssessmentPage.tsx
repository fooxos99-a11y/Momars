import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type AssessmentType,
  type CourseQuestion,
  clearAccessSession,
  isDashboardRole,
  loadAccessSession,
  resolveAccessByLoginCode,
  useDashboardStore,
} from "@/lib/dashboard-store";
import DocumentEditor from "@/components/editor/DocumentEditor";
import { parseImportedQuestionsFromText, type ImportedQuestionDraft } from "@/lib/question-import";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const assessmentLabels: Record<AssessmentType, string> = {
  pre: "الاختبار القبلي",
  post: "الاختبار البعدي",
  tasks: "المهام الأدائية",
};

const stripQuestionOptionLabel = (value: string) => value
  .trim()
  .replace(/^(?:[A-Za-z\u0621-\u064A]|\d{1,2})\s*[-–—.):]\s*/, "")
  .trim();

const splitPastedQuestionOptions = (value: string) => {
  const normalizedValue = value.replace(/\r\n?/g, "\n").trim();

  if (!normalizedValue) {
    return [] as string[];
  }

  const markerPattern = /(^|[\s\n])(?:[A-Za-z\u0621-\u064A]|\d{1,2})\s*[-–—.):]/gm;
  const markers: Array<{ labelStart: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(normalizedValue)) !== null) {
    markers.push({ labelStart: match.index + match[1].length });
  }

  if (markers.length < 2) {
    return [] as string[];
  }

  return markers
    .map((marker, index) => {
      const nextMarkerStart = markers[index + 1]?.labelStart ?? normalizedValue.length;
      return stripQuestionOptionLabel(normalizedValue.slice(marker.labelStart, nextMarkerStart));
    })
    .filter(Boolean);
};

const emptyQuestionForm = {
  prompt: "",
  type: "multiple" as "multiple" | "text" | "truefalse",
  options: ["", ""],
  allowFile: "no" as "yes" | "no",
  points: "1",
  correctAnswer: "",
};

const dashboardCardClass = "rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]";
const dashboardPlainPanelClass = "rounded-[1.25rem] border border-border/60 bg-white";
const dashboardEmptyStateClass = "rounded-[1.25rem] border border-dashed border-border/70 bg-white/70";
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const normalizeAnswer = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ة/g, "ه")
  .replace(/ى/g, "ي")
  .replace(/[.،,؛;!?؟:]+$/g, "")
  .replace(/^[أ-ي]\s*[).\-:]\s*/i, "")
  .trim();

const TEXT_ANSWER_SIMILARITY_THRESHOLD = 0.6;

const normalizeTextForSimilarity = (value: string) =>
  normalizeAnswer(value)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[.,!?;:()\[\]{}\"'`~@#$%^&*_+=<>\\/\-|،؛؟]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const prev = new Array<number>(right.length + 1);
  const curr = new Array<number>(right.length + 1);

  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }

  return prev[right.length];
};

const calculateTextSimilarity = (leftRaw: string, rightRaw: string) => {
  const left = normalizeTextForSimilarity(leftRaw);
  const right = normalizeTextForSimilarity(rightRaw);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const maxLen = Math.max(left.length, right.length);
  const editSimilarity = maxLen > 0 ? 1 - (levenshteinDistance(left, right) / maxLen) : 0;

  const leftWords = new Set(left.split(" ").filter(Boolean));
  const rightWords = new Set(right.split(" ").filter(Boolean));
  const intersectionSize = [...leftWords].filter((word) => rightWords.has(word)).length;
  const unionSize = new Set([...leftWords, ...rightWords]).size;
  const jaccardSimilarity = unionSize > 0 ? intersectionSize / unionSize : 0;

  const containmentSimilarity = left.includes(right) || right.includes(left)
    ? Math.min(left.length, right.length) / Math.max(left.length, right.length)
    : 0;

  return Math.max(editSimilarity, jaccardSimilarity, containmentSimilarity);
};

const isAnswerCorrect = (question: CourseQuestion, answerValue: string) => {
  if (!question.correctAnswer.trim()) return false;

  if (question.type === "text") {
    return calculateTextSimilarity(answerValue, question.correctAnswer) >= TEXT_ANSWER_SIMILARITY_THRESHOLD;
  }

  return normalizeAnswer(answerValue) === normalizeAnswer(question.correctAnswer);
};

const ProgramIndicatorRing = ({
  label,
  helperText,
  progressValue,
  displayValue,
}: {
  label: string;
  helperText?: string;
  progressValue: number;
  displayValue: number;
}) => {
  const gradientId = useId();
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedDisplay, setAnimatedDisplay] = useState(0);
  const safeProgress = clampPercent(progressValue);
  const safeDisplay = Math.max(0, displayValue);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    let frameId = 0;
    const startedAt = performance.now();
    const duration = 2200;

    const tick = (now: number) => {
      const elapsed = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setAnimatedProgress(safeProgress * eased);
      setAnimatedDisplay(safeDisplay * eased);

      if (elapsed < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    setAnimatedProgress(0);
    setAnimatedDisplay(0);
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [safeDisplay, safeProgress]);

  const dashOffset = circumference * (1 - animatedProgress / 100);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative flex h-40 w-40 items-center justify-center sm:h-44 sm:w-44">
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
            <span className="text-[2rem] font-black leading-none tracking-[-0.04em] text-[#0a4c61] sm:text-[2.15rem]">
              {`${Math.round(animatedDisplay)}%`}
            </span>
          </div>
        </div>
      </div>
      <div className="max-w-[11rem] text-sm font-extrabold leading-7 text-[#08384a] sm:text-[0.95rem]">{label}</div>
      {helperText ? <div className="text-[0.72rem] font-medium text-muted-foreground sm:text-xs">{helperText}</div> : null}
    </div>
  );
};

interface AdminAssessmentPageProps {
  assessmentType: AssessmentType;
}

const AdminAssessmentPage = ({ assessmentType }: AdminAssessmentPageProps) => {
  const storedSession = loadAccessSession();

  const store = useDashboardStore();
  const { data, isHydrated } = store;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("courseId")?.trim() ?? "";
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [questionForms, setQuestionForms] = useState<typeof emptyQuestionForm[]>([emptyQuestionForm]);
  const [questionErrors, setQuestionErrors] = useState<string[]>("".split(""));
  const [pasteText, setPasteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [templateDraft, setTemplateDraft] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const backDashboardTab = assessmentType === "tasks" ? "tasks" : "courses";

  const session = useMemo(() => {
    if (!storedSession || !isHydrated) {
      return null;
    }

    const resolved = resolveAccessByLoginCode(data, storedSession.loginCode);

    if (!resolved || resolved.role !== storedSession.role || !isDashboardRole(resolved.role)) {
      return null;
    }

    return storedSession;
  }, [data, isHydrated, storedSession]);

  useEffect(() => {
    if (isHydrated && storedSession && !session) {
      clearAccessSession();
    }
  }, [isHydrated, session, storedSession]);

  if (!storedSession) {
    return <Navigate to="/" replace />;
  }

  if (!isHydrated) {
    return null;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  const canEditQuestions = session.role === "admin";

  const selectedCourse = useMemo(
    () => data.courses.find((course) => course.id === courseId) ?? null,
    [courseId, data.courses],
  );

  useEffect(() => {
    if (selectedCourse?.taskMode === "document") {
      setTemplateDraft(selectedCourse.taskTemplateContent ?? "");
    }
  }, [selectedCourse?.id, selectedCourse?.taskMode, selectedCourse?.taskTemplateContent]);

  const questions = useMemo(() => {
    if (!selectedCourse) {
      return [] as CourseQuestion[];
    }

    if (assessmentType === "pre") {
      return selectedCourse.preQuestions;
    }

    if (assessmentType === "post") {
      return selectedCourse.postQuestions;
    }

    return selectedCourse.taskQuestions;
  }, [assessmentType, selectedCourse]);

  const assessmentIndicators = useMemo(() => {
    if (!selectedCourse) {
      return {
        pre: { average: 0, count: 0 },
        post: { average: 0, count: 0 },
      };
    }

    const getAssessmentQuestionsForCourse = (type: AssessmentType) => {
      if (type === "pre") {
        return selectedCourse.preQuestions;
      }

      if (type === "post") {
        return selectedCourse.postQuestions;
      }

      return selectedCourse.taskQuestions;
    };

    const getSubmissionGrade = (type: AssessmentType, submissionId: string) => {
      const submission = data.submissions.find((item) => item.id === submissionId);
      const assessmentQuestions = getAssessmentQuestionsForCourse(type);
      const questionTotal = assessmentQuestions.reduce((sum, question) => sum + question.points, 0);

      if (!submission) {
        return { score: 0, total: questionTotal };
      }

      const answersByQuestionId = new Map(submission.answers.map((answer) => [answer.questionId, answer]));

      if (typeof submission.manualScore === "number" && Number.isFinite(submission.manualScore) && submission.manualScore >= 0) {
        return { score: submission.manualScore, total: Math.max(questionTotal, submission.manualScore) };
      }

      const scoreOverride = answersByQuestionId.get("__score_override__")?.value;
      if (scoreOverride !== undefined) {
        const numericScore = Number(scoreOverride);
        if (Number.isFinite(numericScore) && numericScore >= 0) {
          return { score: numericScore, total: Math.max(questionTotal, numericScore) };
        }
      }

      const score = assessmentQuestions.reduce((sum, question) => {
        const answer = answersByQuestionId.get(question.id);

        if (!answer || !question.correctAnswer.trim()) {
          return sum;
        }

        return isAnswerCorrect(question, answer.value) ? sum + question.points : sum;
      }, 0);

      return { score, total: questionTotal };
    };

    const getAverage = (type: Extract<AssessmentType, "pre" | "post">) => {
      const latestByLoginId = new Map<string, (typeof data.submissions)[number]>();

      data.submissions
        .filter((submission) => submission.courseId === selectedCourse.id && submission.assessmentType === type)
        .slice()
        .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())
        .forEach((submission) => {
          if (!latestByLoginId.has(submission.loginId)) {
            latestByLoginId.set(submission.loginId, submission);
          }
        });

      const submissions = [...latestByLoginId.values()];
      if (submissions.length === 0) {
        return { average: 0, count: 0 };
      }

      const totalPercent = submissions.reduce((sum, submission) => {
        const grade = getSubmissionGrade(type, submission.id);
        return sum + (grade.total > 0 ? (grade.score / grade.total) * 100 : 0);
      }, 0);

      return {
        average: clampPercent(totalPercent / submissions.length),
        count: submissions.length,
      };
    };

    return {
      pre: getAverage("pre"),
      post: getAverage("post"),
    };
  }, [data.submissions, selectedCourse]);

  const resetQuestionForm = () => {
    setQuestionForms([emptyQuestionForm]);
    setQuestionErrors([]);
  };

  const updateForm = (index: number, patch: Partial<typeof emptyQuestionForm>) => {
    setQuestionForms((current) => current.map((form, i) => i === index ? { ...form, ...patch } : form));
  };

  const clearFormError = (index: number) => {
    setQuestionErrors((current) => current.map((err, i) => i === index ? "" : err));
  };

  const handleCreateDialogChange = (open: boolean) => {
    setIsCreateDialogOpen(open);

    if (!open) {
      resetQuestionForm();
    }
  };

  const handleQuestionTypeChange = (formIndex: number, type: "multiple" | "text" | "truefalse") => {
    setQuestionForms((current) => current.map((form, i) => {
      if (i !== formIndex) return form;
      return {
        ...form,
        type,
        options:
          type === "multiple"
            ? (form.options.length > 1 ? form.options : ["", ""])
            : type === "truefalse"
              ? ["صح", "خطأ"]
              : ["", ""],
        points: type === "truefalse" ? "1" : form.points,
        correctAnswer:
          type === "multiple"
            ? form.correctAnswer
            : type === "truefalse"
              ? (form.correctAnswer === "صح" || form.correctAnswer === "خطأ" ? form.correctAnswer : "صح")
              : "",
      };
    }));
    clearFormError(formIndex);
  };

  const handleOptionChange = (formIndex: number, optionIndex: number, value: string) => {
    setQuestionForms((current) => current.map((form, i) => {
      if (i !== formIndex) return form;
      const nextOptions = form.options.map((opt, j) => j === optionIndex ? value : opt);
      const sanitized = nextOptions.map((o) => o.trim()).filter(Boolean);
      return { ...form, options: nextOptions, correctAnswer: sanitized.includes(form.correctAnswer) ? form.correctAnswer : "" };
    }));
  };

  const handleAddOptionField = (formIndex: number) => {
    setQuestionForms((current) => current.map((form, i) => i === formIndex ? { ...form, options: [...form.options, ""] } : form));
  };

  const handleOptionPaste = (formIndex: number, optionIndex: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedOptions = splitPastedQuestionOptions(event.clipboardData.getData("text"));
    if (pastedOptions.length < 2) return;
    event.preventDefault();
    setQuestionForms((current) => current.map((form, i) => {
      if (i !== formIndex) return form;
      const nextOptions = [...form.options];
      while (nextOptions.length < optionIndex + pastedOptions.length) nextOptions.push("");
      pastedOptions.forEach((opt, offset) => { nextOptions[optionIndex + offset] = opt; });
      const sanitized = nextOptions.map((o) => o.trim()).filter(Boolean);
      return { ...form, options: nextOptions, correctAnswer: sanitized.includes(form.correctAnswer) ? form.correctAnswer : "" };
    }));
  };

  const mapImportedDraftToForm = (
    draft: ImportedQuestionDraft,
    defaultPoints: number,
    preferredType: typeof emptyQuestionForm.type,
  ) => {
    // Determine effective type:
    // - If preferred type is "multiple", keep it (user explicitly chose multiple-choice)
    // - If preferred type is "truefalse" but draft is "text", use "truefalse"
    // - Otherwise use draft type
    const effectiveType = 
      preferredType === "multiple"
        ? "multiple"
        : preferredType === "truefalse" && draft.type === "text"
          ? "truefalse"
          : draft.type;

    return {
      ...emptyQuestionForm,
      prompt: draft.prompt,
      type: effectiveType,
      options: effectiveType === "truefalse" ? ["صح", "خطأ"] : (draft.options.length >= 2 ? draft.options : ["", ""]),
      points: String(defaultPoints),
      correctAnswer: effectiveType === "truefalse" ? "صح" : "",
    };
  };



  const handlePasteImport = () => {
    const text = pasteText.trim();
    if (!text) return;
    const rawPoints = Number(questionForms[0]?.points ?? "1");
    const defaultPoints = Number.isFinite(rawPoints) && rawPoints >= 0 ? rawPoints : 1;
    const preferredType = questionForms[0]?.type ?? "multiple";
    const imported = parseImportedQuestionsFromText(text);
    if (!imported.length) return;
    const newForms = imported.map((q: ImportedQuestionDraft) => mapImportedDraftToForm(q, defaultPoints, preferredType));
    setQuestionForms(newForms);
    setQuestionErrors(newForms.map(() => ""));
    setPasteText("");
  };

  const handleSaveAllQuestions = async () => {
    if (!selectedCourse || isSaving) return;

    let hasError = false;
    const newErrors = questionForms.map((form) => {
      const prompt = form.prompt.trim();
      if (!prompt) { hasError = true; return "أدخل السؤال."; }
      const options = form.type === "multiple"
        ? form.options.map((o) => o.trim()).filter(Boolean)
        : form.type === "truefalse"
          ? ["صح", "خطأ"]
          : [];
      if (form.type === "multiple" && options.length < 2) { hasError = true; return "أدخل خيارين على الأقل."; }
      if ((form.type === "multiple" || form.type === "truefalse") && !form.correctAnswer.trim()) { hasError = true; return "اختر الإجابة الصحيحة."; }
      const pts = Number(form.points);
      if (!Number.isFinite(pts) || pts < 0) { hasError = true; return "أدخل درجة صحيحة."; }
      return "";
    });

    if (hasError) {
      setQuestionErrors(newErrors);
      return;
    }

    setIsSaving(true);
    try {
      for (const form of questionForms) {
        const options = form.type === "multiple"
          ? form.options.map((o) => o.trim()).filter(Boolean)
          : form.type === "truefalse"
            ? ["صح", "خطأ"]
            : [];
        await store.addQuestion(selectedCourse.id, assessmentType, {
          prompt: form.prompt.trim(),
          type: form.type,
          options,
          allowFile: form.allowFile === "yes",
          points: Number(form.points),
          correctAnswer: form.correctAnswer.trim(),
        });
      }
      handleCreateDialogChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddQuestionSlot = () => {
    setQuestionForms((current) => [...current, emptyQuestionForm]);
    setQuestionErrors((current) => [...current, ""]);
  };

  const handleRemoveQuestionSlot = (index: number) => {
    if (questionForms.length <= 1) return;
    setQuestionForms((current) => current.filter((_, i) => i !== index));
    setQuestionErrors((current) => current.filter((_, i) => i !== index));
  };

  const renderQuestionFormCard = (form: typeof emptyQuestionForm, formIndex: number) => {
    const availableAnswers = form.options.map((o) => o.trim()).filter(Boolean);
    const formError = questionErrors[formIndex] ?? "";

    return (
      <div key={formIndex} className="rounded-[1.25rem] border border-border/60 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-muted-foreground">السؤال {formIndex + 1}</span>
          {questionForms.length > 1 && (
            <button
              type="button"
              aria-label="حذف السؤال"
              className="text-destructive hover:text-destructive/80 transition-colors"
              onClick={() => handleRemoveQuestionSlot(formIndex)}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={form.type === "truefalse" ? "default" : "outline"}
            size="sm"
            className={cn("flex-1 rounded-full", form.type === "truefalse" ? "!text-white" : "")}
            onClick={() => handleQuestionTypeChange(formIndex, "truefalse")}
          >صح وخطأ</Button>
          <Button
            type="button"
            variant={form.type === "text" ? "default" : "outline"}
            size="sm"
            className={cn("flex-1 rounded-full", form.type === "text" ? "!text-white" : "")}
            onClick={() => handleQuestionTypeChange(formIndex, "text")}
          >نصي</Button>
          <Button
            type="button"
            variant={form.type === "multiple" ? "default" : "outline"}
            size="sm"
            className={cn("flex-1 rounded-full", form.type === "multiple" ? "!text-white" : "")}
            onClick={() => handleQuestionTypeChange(formIndex, "multiple")}
          >خيارات</Button>
        </div>

        <div>
          <div className="mb-2 text-sm font-bold text-slate-900">السؤال</div>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center">
            <Input
              value={form.prompt}
              onChange={(e) => { updateForm(formIndex, { prompt: e.target.value }); clearFormError(formIndex); }}
              placeholder="اكتب السؤال"
              className="h-11 rounded-2xl text-right"
            />
          </div>
        </div>

        {form.type === "multiple" && (
          <div className="space-y-2">
            <div className="text-sm font-bold text-slate-900">الخيارات</div>
            <div className="grid gap-2 md:grid-cols-2">
              {form.options.map((option, optIdx) => {
                const isLast = optIdx === form.options.length - 1;
                return (
                  <div key={`f${formIndex}-opt${optIdx}`} className={isLast ? "flex gap-1" : undefined}>
                    <Input
                      value={option}
                      onChange={(e) => handleOptionChange(formIndex, optIdx, e.target.value)}
                      onPaste={(e) => handleOptionPaste(formIndex, optIdx, e)}
                      placeholder={`الخيار ${optIdx + 1}`}
                      className="h-11 flex-1 rounded-2xl text-right"
                    />
                    {isLast && (
                      <button
                        type="button"
                        aria-label="إضافة خيار"
                        className="flex h-11 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 text-primary transition-colors hover:bg-primary/5 hover:text-primary"
                        onClick={() => handleAddOptionField(formIndex)}
                      >
                        <Plus className="size-4" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {form.type === "truefalse" && (
          <div className="space-y-2">
            <div className="text-sm font-bold text-slate-900">الخيارات</div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input value="صح" readOnly className="h-11 rounded-2xl text-right bg-muted/40" />
              <Input value="خطأ" readOnly className="h-11 rounded-2xl text-right bg-muted/40" />
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-900">الدرجة</label>
            <Input value={form.points} onChange={(e) => updateForm(formIndex, { points: e.target.value })} placeholder="1" className="h-11 rounded-2xl text-right" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-900">الإجابة الصحيحة</label>
            {form.type === "multiple" ? (
              <Select value={form.correctAnswer} onValueChange={(v) => updateForm(formIndex, { correctAnswer: v })}>
                <SelectTrigger className="h-11 flex-row-reverse rounded-2xl text-right [&>span]:text-right"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{availableAnswers.map((opt) => <SelectItem key={opt} value={opt} className="justify-end pr-3 text-right">{opt}</SelectItem>)}</SelectContent>
              </Select>
            ) : form.type === "truefalse" ? (
              <Select value={form.correctAnswer || "صح"} onValueChange={(v) => updateForm(formIndex, { correctAnswer: v })}>
                <SelectTrigger className="h-11 flex-row-reverse rounded-2xl text-right [&>span]:text-right"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="صح" className="justify-end pr-3 text-right">صح</SelectItem>
                  <SelectItem value="خطأ" className="justify-end pr-3 text-right">خطأ</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.correctAnswer} onChange={(e) => updateForm(formIndex, { correctAnswer: e.target.value })} placeholder="اكتب الإجابة" className="h-11 rounded-2xl text-right" />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-900">إرفاق ملف</label>
            <Select value={form.allowFile} onValueChange={(v: "yes" | "no") => updateForm(formIndex, { allowFile: v })}>
              <SelectTrigger className="h-11 flex-row-reverse rounded-2xl text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes" className="justify-end pr-3 text-right">يسمح</SelectItem>
                <SelectItem value="no" className="justify-end pr-3 text-right">لا يسمح</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
      </div>
    );
  };

  const renderCreateQuestionDialog = () => (
    <>
    <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
      <DialogContent className="flex h-[90vh] w-[min(95vw,780px)] flex-col rounded-[1.75rem] border-primary/20 bg-white p-0 text-right shadow-[0_24px_70px_rgba(15,23,42,0.14)] [&>button]:hidden">

        {/* Header */}
        <div className="shrink-0 border-b border-border/60 px-4 py-3">
          <div className="flex flex-row-reverse items-center justify-end gap-2 text-right">
            <Plus className="size-4 text-primary" strokeWidth={2.5} />
            <span className="text-base font-bold text-foreground">إضافة أسئلة</span>
          </div>
        </div>

        {/* Paste import area */}
        <div className="shrink-0 border-b border-border/60 px-4 py-2.5 flex gap-2 items-start">
          <textarea
            className="flex-1 min-h-[64px] max-h-32 resize-y rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-right placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="الصق الأسئلة هنا... سيتم تقسيمها تلقائيًا"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (!text.trim()) return;
              e.preventDefault();
              setPasteText(text);
              const rawPoints = Number(questionForms[0]?.points ?? "1");
              const defaultPoints = Number.isFinite(rawPoints) && rawPoints >= 0 ? rawPoints : 1;
              const preferredType = questionForms[0]?.type ?? "multiple";
              const imported = parseImportedQuestionsFromText(text);
              if (!imported.length) { setPasteText(text); return; }
              const newForms = imported.map((q: ImportedQuestionDraft) => mapImportedDraftToForm(q, defaultPoints, preferredType));
              setQuestionForms(newForms);
              setQuestionErrors(newForms.map(() => ""));
              setPasteText("");
            }}
          />
          <Button
            type="button"
            size="sm"
            className="mt-1 h-9 shrink-0 rounded-xl"
            disabled={!pasteText.trim()}
            onClick={handlePasteImport}
          >
            تقسيم
          </Button>
        </div>

        {/* Scrollable question list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {questionForms.map((form, index) => renderQuestionFormCard(form, index))}

          <button
            type="button"
            onClick={handleAddQuestionSlot}
            className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-primary/40 py-3 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            إضافة سؤال
          </button>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border/60 px-4 py-3">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" onClick={() => handleCreateDialogChange(false)}>إلغاء</Button>
            <Button type="button" onClick={() => void handleSaveAllQuestions()} disabled={!canEditQuestions || isSaving}>
              {isSaving ? "جارٍ الحفظ..." : `حفظ ${questionForms.length > 1 ? `(${questionForms.length} أسئلة)` : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );

  const renderQuestionsList = () => (
    <div className="space-y-3">
      {questions.length === 0 && (
        <div className={cn(dashboardEmptyStateClass, "p-4 text-sm text-muted-foreground")}>لا توجد أسئلة بعد.</div>
      )}
      <Accordion type="single" collapsible className="space-y-3">
        {questions.map((question, index) => (
          <AccordionItem key={question.id} value={question.id} className={cn(dashboardPlainPanelClass, "overflow-hidden border-b-0 px-4") }>
            <div className="flex items-start justify-between gap-3 py-4">
              <AccordionTrigger className="flex-1 py-0 pr-1 text-right font-bold text-foreground hover:no-underline [&>svg]:-translate-y-0.5 [&>svg]:shrink-0">
                <div className="w-full text-right">{index + 1}. {question.prompt} <span className="text-sm font-medium text-muted-foreground">• الدرجة: {question.points}</span></div>
              </AccordionTrigger>
              {selectedCourse && canEditQuestions && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 h-9 w-9 shrink-0 rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => store.deleteQuestion(selectedCourse.id, assessmentType, question.id)}
                  aria-label={`حذف السؤال ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <AccordionContent className="pb-4 pt-0">
              <div className="space-y-4 border-t border-border/60 pt-4">
                {question.type === "multiple" ? (
                  <div className="space-y-2 text-sm text-foreground">
                    {question.options.map((option) => {
                      const isCorrect = option.trim() === question.correctAnswer.trim();

                      return (
                        <div key={option} className={cn("leading-7", isCorrect ? "font-bold text-emerald-700" : "text-foreground")}>{option}</div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm font-medium leading-7 text-emerald-700">{question.correctAnswer || "لا توجد إجابة محددة"}</div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );

  if (!selectedCourse) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_38%),linear-gradient(180deg,#f7fcfb_0%,#eff8f7_100%)]">
        <div className="container py-16">
          <Card className="mx-auto max-w-3xl border-primary/10 bg-white/90">
            <CardHeader className="text-right">
              <CardTitle className="text-2xl">الدورة غير موجودة</CardTitle>
              <CardDescription>ارجع إلى لوحة التحكم واختر دورة من بطاقاتها.</CardDescription>
            </CardHeader>
            <CardContent className="text-right">
              <Button asChild variant="outline"><Link to="/dashboard">العودة إلى لوحة المشرف</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_38%),linear-gradient(180deg,#f7fcfb_0%,#eff8f7_100%)] text-foreground">
      <div className="container py-8 md:py-12">
        <div className="mb-4 flex justify-start md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => navigate(`/dashboard?tab=${backDashboardTab}`)}
            aria-label={assessmentType === "tasks" ? "الرجوع إلى صفحة إدارة المهام" : "الرجوع إلى صفحة الاختبارات"}
          >
            <ArrowRight className="size-5" />
          </Button>
        </div>

        {assessmentType !== "tasks" && (
          <div className="mb-6 space-y-6">
            <div className="flex flex-wrap gap-3">
              {(["pre", "post"] as AssessmentType[]).map((type) => (
                <Button
                  key={type}
                  asChild
                  variant={type === assessmentType ? "default" : "outline"}
                  className={type === assessmentType ? "!text-white hover:!text-white focus:!text-white active:!text-white visited:!text-white" : "text-foreground hover:text-foreground"}
                  style={type === assessmentType ? { color: "#ffffff", WebkitTextFillColor: "#ffffff" } : undefined}
                >
                  <Link to={`/dashboard/course/${type}?courseId=${selectedCourse.id}`} style={type === assessmentType ? { color: "#ffffff", WebkitTextFillColor: "#ffffff" } : undefined}>
                    <span style={type === assessmentType ? { color: "#ffffff", WebkitTextFillColor: "#ffffff" } : undefined}>{assessmentLabels[type]}</span>
                  </Link>
                </Button>
              ))}
            </div>

          </div>
        )}

        {renderCreateQuestionDialog()}

        {assessmentType === "tasks" && selectedCourse.taskMode === "document" ? (
          <div className="grid gap-6">
            <Card className={dashboardCardClass}>
              <CardHeader className="text-right">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {canEditQuestions && (
                    <Button
                      className="sm:order-2"
                      disabled={templateSaving}
                      onClick={async () => {
                        if (!selectedCourse) return;
                        setTemplateSaving(true);
                        try {
                          await store.updateCourse(selectedCourse.id, { taskTemplateContent: templateDraft } as never);
                          toast.success("تم حفظ القالب بنجاح");
                        } catch (saveErr) {
                          toast.error(saveErr instanceof Error ? saveErr.message : "تعذّر حفظ القالب، حاول مرة أخرى");
                        } finally {
                          setTemplateSaving(false);
                        }
                      }}
                    >
                      {templateSaving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
                    </Button>
                  )}
                  <div className="sm:order-1">
                    <CardTitle className="text-xl">محتوى نموذج المهمة الأدائية</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <DocumentEditor
                  value={templateDraft}
                  onChange={canEditQuestions ? setTemplateDraft : undefined}
                  editable={canEditQuestions}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-6">
            <Card className={dashboardCardClass}>
              <CardHeader className="text-right">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {canEditQuestions ? (
                    <Button size="icon" className="rounded-full sm:order-2 sm:translate-x-2" onClick={() => setIsCreateDialogOpen(true)}>
                      <Plus className="size-4" />
                    </Button>
                  ) : null}
                  <div className="sm:order-1">
                    <CardTitle className="text-xl">أسئلة النموذج</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderQuestionsList()}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAssessmentPage;
