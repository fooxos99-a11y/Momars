import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ListChecks, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocumentEditor from "@/components/editor/DocumentEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getAssessmentAvailabilityDeadline, getDefaultAssessmentNotificationTemplate, getTasks, isAssessmentEnabledForCourse, type BranchId, type CourseQuestion, type QuestionType, type TaskMode, useDashboardStore } from "@/lib/dashboard-store";
import { getDocumentPreviewText, hasMeaningfulDocumentContent } from "@/lib/document-content";
import { parseImportedQuestionsFromText, type ImportedQuestionDraft } from "@/lib/question-import";

const branchLabels: Record<BranchId, string> = { male: "معلمين", female: "معلمات" };
type TaskOpenBranch = BranchId | "all";

const formatDurationMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0 دقيقة";
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "ساعة" : `${hours} ساعات`;
  }

  return `${minutes} دقيقة`;
};

const sendPushNotification = (title: string, message: string, loginCodes: string[], url = "/") => {
  void fetch("/api/send-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, message, loginCodes, url }),
  }).catch(() => undefined);
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
  if (remaining === 0) return <span>انتهى الوقت</span>;
  return <span>يغلق بعد: {parts.join(" ")}</span>;
};

const hiddenDocumentQuestion = {
  prompt: "محتوى المهمة الأدائية",
  type: "text" as const,
  options: [],
  allowFile: false,
  points: 0,
  correctAnswer: "",
};

const emptyQuestionForm = {
  prompt: "",
  type: "multiple" as QuestionType,
  options: ["", ""],
  allowFile: "no" as "yes" | "no",
  points: "1",
  correctAnswer: "",
  attachmentName: "",
  attachmentType: "",
  attachmentDataUrl: "",
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

interface AdminTasksTabProps {
  canEdit?: boolean;
  managedBranchId?: BranchId | null;
}

import React from "react";

const SortableTaskCard = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.85 : 1 }}
      className={isDragging ? "cursor-grabbing" : "cursor-grab"}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

const AdminTasksTab = ({ canEdit = true, managedBranchId = null }: AdminTasksTabProps) => {
  const store = useDashboardStore();
  const { data } = store;
  const navigate = useNavigate();
  const tasks = useMemo(() => [...getTasks(data)].sort((a, b) => a.sortOrder - b.sortOrder), [data]);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<{ id: string; title: string } | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const visibleTasks = useMemo(() => tasks.filter((task) => task.id !== deletingTaskId), [tasks, deletingTaskId]);
  const [taskPickerCourseId, setTaskPickerCourseId] = useState<string | null>(null);
  const [taskDurationMinutes, setTaskDurationMinutes] = useState("30");
  const [taskTimerBranch, setTaskTimerBranch] = useState<TaskOpenBranch | null>(managedBranchId ?? "all");
  const [taskSkipBranchConflict, setTaskSkipBranchConflict] = useState(false);
  const [taskTimerError, setTaskTimerError] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskBranchConflict, setTaskBranchConflict] = useState<{ activeBranch: BranchId; pendingBranch: BranchId } | null>(null);
  const [taskManageDialog, setTaskManageDialog] = useState<{ taskId: string } | null>(null);
  const [taskManageChoice, setTaskManageChoice] = useState("");
  const [taskManageSubmitting, setTaskManageSubmitting] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMode, setTaskMode] = useState<TaskMode | null>(null);
  const [taskPoints, setTaskPoints] = useState("0");
  const [documentSubMode, setDocumentSubMode] = useState<"template" | "task">("task");
  const [selectedTemplateId, setSelectedTemplateId] = useState("new");
  const [templateName, setTemplateName] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [taskDocumentContent, setTaskDocumentContent] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<Omit<CourseQuestion, "id">[]>([]);
  const [isCreateQuestionDialogOpen, setIsCreateQuestionDialogOpen] = useState(false);
  const [questionForms, setQuestionForms] = useState<typeof emptyQuestionForm[]>([emptyQuestionForm]);
  const [questionErrors, setQuestionErrors] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleTaskDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = visibleTasks.map((t) => t.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    store.reorderCourses(arrayMove(ids, oldIdx, newIdx));
  }, [visibleTasks, store]);

  const handleConfirmDeleteTask = useCallback(async () => {
    if (!pendingDeleteTask) return;

    const { id } = pendingDeleteTask;
    setDeletingTaskId(id);
    setPendingDeleteTask(null);
    setError("");

    try {
      await store.deleteCourse(id);
      setDeletingTaskId((current) => (current === id ? null : current));
    } catch (deleteError) {
      setDeletingTaskId(null);
      setError(deleteError instanceof Error ? deleteError.message : "تعذر حذف المهمة الأدائية.");
    }
  }, [pendingDeleteTask, store]);

  const selectedTemplate = data.taskTemplates.find((template) => template.id === selectedTemplateId) ?? null;

  const resetQuestionForm = () => {
    setQuestionForms([emptyQuestionForm]);
    setQuestionErrors([]);
    setPasteText("");
  };

  const handleCreateQuestionDialogChange = (open: boolean) => {
    setIsCreateQuestionDialogOpen(open);

    if (!open) {
      resetQuestionForm();
    }
  };

  const updateForm = (index: number, patch: Partial<typeof emptyQuestionForm>) => {
    setQuestionForms((current) => current.map((form, i) => (i === index ? { ...form, ...patch } : form)));
  };

  const clearFormError = (index: number) => {
    setQuestionErrors((current) => current.map((err, i) => (i === index ? "" : err)));
  };

  const handleQuestionTypeChange = (formIndex: number, type: QuestionType) => {
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
      const nextOptions = form.options.map((option, j) => (j === optionIndex ? value : option));
      const sanitizedOptions = nextOptions.map((option) => option.trim()).filter(Boolean);
      return {
        ...form,
        options: nextOptions,
        correctAnswer: sanitizedOptions.includes(form.correctAnswer) ? form.correctAnswer : "",
      };
    }));
  };

  const handleAddOptionField = (formIndex: number) => {
    setQuestionForms((current) => current.map((form, i) => (
      i === formIndex ? { ...form, options: [...form.options, ""] } : form
    )));
  };

  const handleOptionPaste = (formIndex: number, optionIndex: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedOptions = splitPastedQuestionOptions(event.clipboardData.getData("text"));
    if (pastedOptions.length < 2) return;
    event.preventDefault();

    setQuestionForms((current) => current.map((form, i) => {
      if (i !== formIndex) return form;
      const nextOptions = [...form.options];
      while (nextOptions.length < optionIndex + pastedOptions.length) nextOptions.push("");
      pastedOptions.forEach((option, optionOffset) => {
        nextOptions[optionIndex + optionOffset] = option;
      });
      const sanitizedOptions = nextOptions.map((option) => option.trim()).filter(Boolean);
      return {
        ...form,
        options: nextOptions,
        correctAnswer: sanitizedOptions.includes(form.correctAnswer) ? form.correctAnswer : "",
      };
    }));
  };

  const mapImportedDraftToForm = (
    draft: ImportedQuestionDraft,
    defaultPoints: number,
    preferredType: QuestionType,
  ) => {
    const effectiveType = preferredType === "truefalse" && draft.type === "text" ? "truefalse" : draft.type;
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

    const newForms = imported.map((q) => mapImportedDraftToForm(q, defaultPoints, preferredType));
    setQuestionForms(newForms);
    setQuestionErrors(newForms.map(() => ""));
    setPasteText("");
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

  const handleAddDraftQuestion = () => {
    let hasError = false;
    const newErrors = questionForms.map((form) => {
      const prompt = form.prompt.trim();
      if (!prompt) { hasError = true; return "أدخل السؤال."; }

      const options = form.type === "multiple"
        ? form.options.map((item) => item.trim()).filter(Boolean)
        : form.type === "truefalse"
          ? ["صح", "خطأ"]
          : [];

      if (form.type === "multiple" && options.length < 2) { hasError = true; return "أدخل خيارين على الأقل."; }
      if ((form.type === "multiple" || form.type === "truefalse") && !form.correctAnswer.trim()) { hasError = true; return "اختر الإجابة الصحيحة."; }
      const points = Number(form.points);
      if (!Number.isFinite(points) || points < 0) { hasError = true; return "أدخل درجة صحيحة."; }
      return "";
    });

    if (hasError) {
      setQuestionErrors(newErrors);
      return;
    }

    const newDraftQuestions = questionForms.map((form) => {
      const options = form.type === "multiple"
        ? form.options.map((item) => item.trim()).filter(Boolean)
        : form.type === "truefalse"
          ? ["صح", "خطأ"]
          : [];

      return {
        prompt: form.prompt.trim(),
        type: form.type,
        options,
        allowFile: form.allowFile === "yes",
        points: Number(form.points),
        correctAnswer: form.correctAnswer.trim(),
        attachmentName: form.attachmentName,
        attachmentType: form.attachmentType,
        attachmentDataUrl: form.attachmentDataUrl,
      } as Omit<CourseQuestion, "id">;
    });

    setDraftQuestions((current) => [...current, ...newDraftQuestions]);
    handleCreateQuestionDialogChange(false);
  };

  const handleTemplateSelect = (value: string) => {
    setSelectedTemplateId(value);

    if (value === "new") {
      setTaskDocumentContent("");
      return;
    }

    const template = data.taskTemplates.find((item) => item.id === value);

    if (template) {
      setTemplateName(template.name);
      setTemplateContent(template.content);
      setTaskDocumentContent(template.content);
    }
  };

  const handleOpenTaskPicker = (taskId: string) => {
    setTaskPickerCourseId(taskId);
    setTaskDurationMinutes("30");
    setTaskTimerBranch(managedBranchId ?? "all");
    setTaskSkipBranchConflict(false);
    setTaskTimerError("");
  };

  const getTaskManageOptions = (task: ReturnType<typeof getTasks>[number]) => {
    const maleActive = isAssessmentEnabledForCourse(task, "tasks", "male");
    const femaleActive = isAssessmentEnabledForCourse(task, "tasks", "female");

    if (managedBranchId) {
      return maleActive || femaleActive
        ? [{ value: `close_${managedBranchId}`, label: `إغلاق ${branchLabels[managedBranchId]}` }]
        : [];
    }

    if (maleActive && femaleActive) {
      return [
        { value: "close_all", label: "إغلاق الكل" },
        { value: "close_male", label: "إغلاق معلمين" },
        { value: "close_female", label: "إغلاق معلمات" },
      ];
    }

    if (maleActive) {
      return [
        { value: "close_male", label: "إغلاق معلمين" },
        { value: "open_female", label: "بدء معلمات" },
        { value: "open_all", label: "بدء الكل" },
      ];
    }

    if (femaleActive) {
      return [
        { value: "close_female", label: "إغلاق معلمات" },
        { value: "open_male", label: "بدء معلمين" },
        { value: "open_all", label: "بدء الكل" },
      ];
    }

    return [
      { value: "open_all", label: "بدء الكل" },
      { value: "open_male", label: "بدء معلمين" },
      { value: "open_female", label: "بدء معلمات" },
    ];
  };

  const handleOpenTaskManageDialog = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const options = getTaskManageOptions(task);
    setTaskManageChoice(options[0]?.value ?? "");
    setTaskManageDialog({ taskId });
  };

  const handleConfirmTaskTimer = async (skipBranchConflictCheck = false): Promise<boolean> => {
    if (!taskPickerCourseId) return false;
    const course = data.courses.find((c) => c.id === taskPickerCourseId);
    if (!course) return false;

    const shouldBypassBranchConflict = skipBranchConflictCheck || taskSkipBranchConflict;

    const duration = Number(taskDurationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      setTaskTimerError("أدخل مدة صحيحة بالدقائق.");
      return false;
    }

    const targetBranch = taskTimerBranch;
    if (!targetBranch) {
      setTaskTimerError("اختر فرعًا.");
      return false;
    }

    if (targetBranch !== "all") {
      const otherBranch = targetBranch === "male" ? "female" : "male";
      const otherBranchActive = course.isTasksEnabled && isAssessmentEnabledForCourse(course, "tasks", otherBranch);
      if (otherBranchActive && !shouldBypassBranchConflict && !managedBranchId) {
        setTaskBranchConflict({ activeBranch: otherBranch, pendingBranch: targetBranch });
        return false;
      }
    }
    setTaskBranchConflict(null);

    const targetBranches: BranchId[] = targetBranch === "all" ? ["male", "female"] : [targetBranch];
    const otherBranches = (["male", "female"] as BranchId[]).filter((branchId) => !targetBranches.includes(branchId));

    setTaskSubmitting(true);

    const closesAt = new Date(Date.now() + duration * 60 * 1000).toISOString();

    // Collect other currently active tasks BEFORE any state changes
    const otherActiveTasks = tasks.filter(
      (t) => t.id !== taskPickerCourseId && t.isTasksEnabled,
    );

    // Activate the selected task FIRST and await it.
    // This ensures its optimistic update is applied before any deactivation rollback
    // can capture previousCourses — preventing deactivation failures from undoing this activation.
    const existingGlobalTaskWindow = course.assessmentWindows.global.tasks;
    const nextGlobalTaskWindow = !existingGlobalTaskWindow || new Date(existingGlobalTaskWindow) < new Date(closesAt)
      ? closesAt
      : existingGlobalTaskWindow;
    const branchAvailabilityUpdate = { ...course.branchAvailability };
    const assessmentWindowsUpdate = {
      ...course.assessmentWindows,
      global: { ...course.assessmentWindows.global, tasks: nextGlobalTaskWindow },
    };

    targetBranches.forEach((branchId) => {
      branchAvailabilityUpdate[branchId] = { ...course.branchAvailability[branchId], tasks: true };
      assessmentWindowsUpdate[branchId] = { ...course.assessmentWindows[branchId], tasks: closesAt };
    });
    otherBranches.forEach((branchId) => {
      assessmentWindowsUpdate[branchId] = {
        ...course.assessmentWindows[branchId],
        tasks: targetBranch === "all"
          ? closesAt
          : (skipBranchConflictCheck && isAssessmentEnabledForCourse(course, "tasks", branchId)
            ? course.assessmentWindows[branchId].tasks
            : undefined),
      };
      if (targetBranch === "all") {
        branchAvailabilityUpdate[branchId] = { ...course.branchAvailability[branchId], tasks: true };
      } else if (!(skipBranchConflictCheck && isAssessmentEnabledForCourse(course, "tasks", branchId))) {
        branchAvailabilityUpdate[branchId] = { ...course.branchAvailability[branchId], tasks: false };
      }
    });

    try {
      await store.updateCourse(course.id, {
        isTasksEnabled: true,
        branchAvailability: branchAvailabilityUpdate,
        assessmentWindows: assessmentWindowsUpdate,
      } as never);

      // Deactivate any other currently active tasks AFTER activation is committed.
      // Their previousCourses snapshot now includes the activated task, so any
      // rollback on failure will not undo the activation above.
      void Promise.all(
        otherActiveTasks.map((t) =>
          store.updateCourse(t.id, {
            isTasksEnabled: false,
            assessmentWindows: {
              ...t.assessmentWindows,
              global: { ...t.assessmentWindows.global, tasks: undefined },
              male: { ...t.assessmentWindows.male, tasks: undefined },
              female: { ...t.assessmentWindows.female, tasks: undefined },
            },
          } as never).catch(() => undefined),
        ),
      );

      const targetLoginCodes = data.students
        .filter((student) => targetBranch === "all" || student.branchId === targetBranch)
        .map((student) => student.loginId);
      const branchLabel = targetBranch === "all" ? "جميع الفروع" : branchLabels[targetBranch];
      const template = course.assessmentNotificationTemplates.tasks || getDefaultAssessmentNotificationTemplate("tasks");
      const message = template
        .replaceAll("{courseTitle}", course.title)
        .replaceAll("{assessmentLabel}", "المهمة الأدائية")
        .replaceAll("{branchLabel}", branchLabel)
        .replaceAll("{durationMinutes}", String(duration))
        .replaceAll("{durationLabel}", formatDurationMinutes(duration));
      sendPushNotification(`المهمة الأدائية - ${course.title}`, message, targetLoginCodes, "/tasks");
      setTaskPickerCourseId(null);
      return true;
    } catch (error) {
      setTaskTimerError(error instanceof Error ? error.message : "تعذر فتح المهمة الأدائية.");
      return false;
    } finally {
      setTaskSkipBranchConflict(false);
      setTaskSubmitting(false);
    }
  };

  const handleDeactivateTask = async (taskId: string, branchId?: BranchId) => {
    const course = data.courses.find((c) => c.id === taskId);
    if (!course) return;

    if (branchId) {
      const remainingBranch: BranchId = branchId === "male" ? "female" : "male";
      const remainingBranchActive = isAssessmentEnabledForCourse(course, "tasks", remainingBranch);
      await store.updateCourse(taskId, {
        isTasksEnabled: remainingBranchActive,
        branchAvailability: {
          ...course.branchAvailability,
          [branchId]: { ...course.branchAvailability[branchId], tasks: false },
        },
        assessmentWindows: {
          ...course.assessmentWindows,
          global: {
            ...course.assessmentWindows.global,
            tasks: remainingBranchActive ? course.assessmentWindows.global.tasks : undefined,
          },
          [branchId]: { ...course.assessmentWindows[branchId], tasks: undefined },
        },
      } as never);
      return;
    }

    await store.updateCourse(taskId, {
      isTasksEnabled: false,
      assessmentWindows: {
        ...course.assessmentWindows,
        global: { ...course.assessmentWindows.global, tasks: undefined },
        male: { ...course.assessmentWindows.male, tasks: undefined },
        female: { ...course.assessmentWindows.female, tasks: undefined },
      },
    } as never);
  };

  const resetForm = () => {
    setTaskTitle("");
    setTaskMode(null);
    setTaskPoints("0");
    setDocumentSubMode("task");
    setSelectedTemplateId("new");
    setTemplateName("");
    setTemplateContent("");
    setTaskDocumentContent("");
    setYoutubeUrl("");
    setDraftQuestions([]);
    resetQuestionForm();
    setError("");
  };

  const handleSaveTemplate = async () => {
    const name = (taskTitle.trim() || templateName.trim());
    const content = templateContent;

    if (!name || !hasMeaningfulDocumentContent(content)) {
      setError("أدخل اسم القالب ومحتواه.");
      return;
    }

    setSubmitting(true);

    try {
      if (selectedTemplate && selectedTemplateId !== "new") {
        await store.updateTaskTemplate(selectedTemplate.id, { name, content });
      } else {
        const templateId = await store.addTaskTemplate(name, content);
        setSelectedTemplateId(templateId);
        setTaskDocumentContent(content);
        setDocumentSubMode("task");
      }
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ القالب.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectTaskCreationMode = (mode: TaskMode) => {
    setTaskMode(mode);
    setError("");

    if (mode === "questions") {
      handleCreateQuestionDialogChange(true);
      return;
    }

    setDocumentSubMode("task");
    setSelectedTemplateId("new");
    setTemplateName("");
    setTemplateContent("");
    setTaskDocumentContent("");
    setYoutubeUrl("");
    handleCreateQuestionDialogChange(false);
  };

  const handleCreateTask = async () => {
    const title = taskTitle.trim();

    if (!title) {
      setError("أدخل اسم المهمة الأدائية.");
      return;
    }

    if (!taskMode) {
      setError("اختر طريقة إنشاء المهمة الأدائية من زر الإضافة.");
      return;
    }

    if (taskMode === "questions" && draftQuestions.length === 0) {
      setError("أضف سؤالًا واحدًا على الأقل قبل حفظ المهمة الأدائية.");
      return;
    }

    if (taskMode === "document" && documentSubMode === "task" && !hasMeaningfulDocumentContent(taskDocumentContent)) {
      setError("أدخل محتوى المهمة الأدائية أولًا.");
      return;
    }

    setSubmitting(true);

    const resolvedTemplateName = documentSubMode === "task" ? (selectedTemplate?.name ?? "") : templateName.trim();
    const resolvedTemplateContent = documentSubMode === "task" ? taskDocumentContent : templateContent;

    try {
      const taskId = await store.addCourse(title, {
        entityType: "task",
        taskMode,
        taskTemplateId: documentSubMode === "task" ? (selectedTemplate?.id ?? "") : "",
        taskTemplateName: resolvedTemplateName,
        taskTemplateContent: resolvedTemplateContent,
        youtubeUrl: taskMode === "document" ? youtubeUrl.trim() : "",
      });

      if (taskMode === "document") {
        const points = Number(taskPoints) || 0;
        await store.addQuestion(taskId, "tasks", { ...hiddenDocumentQuestion, points });
      } else {
        for (const question of draftQuestions) {
          await store.addQuestion(taskId, "tasks", question);
        }
      }

      resetForm();
      navigate("/dashboard");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "تعذر إنشاء المهمة الأدائية.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderCreateQuestionDialog = () => {
    const renderQuestionFormCard = (form: typeof emptyQuestionForm, formIndex: number) => {
      const availableAnswers = form.options.map((option) => option.trim()).filter(Boolean);
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
            <Button type="button" variant={form.type === "text" ? "default" : "outline"} size="sm"
              className={cn("flex-1 rounded-full", form.type === "text" ? "!text-white" : "")}
              onClick={() => handleQuestionTypeChange(formIndex, "text")}>نصي</Button>
            <Button type="button" variant={form.type === "multiple" ? "default" : "outline"} size="sm"
              className={cn("flex-1 rounded-full", form.type === "multiple" ? "!text-white" : "")}
              onClick={() => handleQuestionTypeChange(formIndex, "multiple")}>خيارات</Button>
            <Button type="button" variant={form.type === "truefalse" ? "default" : "outline"} size="sm"
              className={cn("flex-1 rounded-full", form.type === "truefalse" ? "!text-white" : "")}
              onClick={() => handleQuestionTypeChange(formIndex, "truefalse")}>صح وخطأ</Button>
          </div>

          <div>
            <div className="mb-2 text-sm font-bold text-slate-900">السؤال</div>
            <Input
              value={form.prompt}
              onChange={(e) => { updateForm(formIndex, { prompt: e.target.value }); clearFormError(formIndex); }}
              placeholder="اكتب السؤال"
              className="h-11 rounded-2xl text-right"
            />
          </div>

          {form.type === "multiple" && (
            <div className="space-y-2">
              <div className="text-sm font-bold text-slate-900">الخيارات</div>
              <div className="grid gap-2 md:grid-cols-2">
                {form.options.map((option, index) => {
                  const isLast = index === form.options.length - 1;
                  return (
                    <div key={`task-opt-${formIndex}-${index}`} className={isLast ? "flex gap-1" : undefined}>
                      <Input
                        value={option}
                        onChange={(e) => handleOptionChange(formIndex, index, e.target.value)}
                        onPaste={(e) => handleOptionPaste(formIndex, index, e)}
                        placeholder={`الخيار ${index + 1}`}
                        className="h-11 flex-1 rounded-2xl text-right"
                      />
                      {isLast && (
                        <button type="button" aria-label="إضافة خيار"
                          className="flex h-11 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 text-primary transition-colors hover:bg-primary/5"
                          onClick={() => handleAddOptionField(formIndex)}>
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

    return (
      <Dialog open={isCreateQuestionDialogOpen} onOpenChange={handleCreateQuestionDialogChange}>
        <DialogContent className="flex h-[90vh] w-[min(95vw,780px)] flex-col rounded-[1.75rem] border-primary/20 bg-white p-0 text-right shadow-[0_24px_70px_rgba(15,23,42,0.14)] [&>button]:hidden">
          <div className="shrink-0 border-b border-border/60 px-4 py-3">
            <div className="flex flex-row-reverse items-center justify-end gap-2 text-right">
              <Plus className="size-4 text-primary" strokeWidth={2.5} />
              <span className="text-base font-bold text-foreground">إضافة أسئلة</span>
            </div>
          </div>

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
                const newForms = imported.map((q) => mapImportedDraftToForm(q, defaultPoints, preferredType));
                setQuestionForms(newForms);
                setQuestionErrors(newForms.map(() => ""));
                setPasteText("");
              }}
            />
            <Button type="button" size="sm" className="mt-1 h-9 shrink-0 rounded-xl" disabled={!pasteText.trim()} onClick={handlePasteImport}>
              تقسيم
            </Button>
          </div>

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

          <div className="shrink-0 border-t border-border/60 px-4 py-3">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
              <Button type="button" variant="outline" onClick={() => handleCreateQuestionDialogChange(false)}>إلغاء</Button>
              <Button type="button" onClick={handleAddDraftQuestion}>حفظ {questionForms.length > 1 ? `(${questionForms.length} أسئلة)` : ""}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderDraftQuestionsList = () => (
    <div className="space-y-3">
      {draftQuestions.length === 0 && (
        <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-white/70 p-4 text-sm text-muted-foreground">لا توجد أسئلة بعد.</div>
      )}
      <Accordion type="single" collapsible className="space-y-3">
        {draftQuestions.map((question, index) => (
          <AccordionItem key={`${question.prompt}-${index + 1}`} value={`${index + 1}`} className="overflow-hidden rounded-[1.25rem] border border-border/60 bg-white px-4">
            <div className="flex items-start justify-between gap-3 py-4">
              <AccordionTrigger className="flex-1 py-0 pr-1 text-right font-bold text-foreground hover:no-underline [&>svg]:-translate-y-0.5 [&>svg]:shrink-0">
                <div className="w-full text-right">{index + 1}. {question.prompt} <span className="text-sm font-medium text-muted-foreground">• الدرجة: {question.points}</span></div>
              </AccordionTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="mt-0.5 h-9 w-9 shrink-0 rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setDraftQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}
                aria-label={`حذف السؤال ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <AccordionContent className="pb-4 pt-0">
              <div className="space-y-4 border-t border-border/60 pt-4">
                {question.type === "multiple" || question.type === "truefalse" ? (
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

  return (
    <div className="space-y-6">
      {canEdit && renderCreateQuestionDialog()}

      <Dialog open={Boolean(taskPickerCourseId)} onOpenChange={(open) => { if (!open) { setTaskPickerCourseId(null); setTaskTimerError(""); } }}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <>
            <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
              <DialogTitle className="text-right text-xl">مؤقت فتح المهمة الأدائية</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 p-6">
              {!managedBranchId && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">الفرع</label>
                  <Select value={taskTimerBranch ?? "all"} onValueChange={(v) => setTaskTimerBranch(v as TaskOpenBranch)}>
                    <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="justify-end pr-3 text-right">الكل</SelectItem>
                      <SelectItem value="male" className="justify-end pr-3 text-right">معلمين</SelectItem>
                      <SelectItem value="female" className="justify-end pr-3 text-right">معلمات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">المدة بالدقائق</label>
                <Input value={taskDurationMinutes} onChange={(e) => setTaskDurationMinutes(e.target.value)} placeholder="مثال: 30" />
              </div>
              {taskTimerError && <p className="text-sm font-medium text-destructive">{taskTimerError}</p>}
              <div className="flex justify-end gap-3">
                <Button variant="outline" disabled={taskSubmitting} onClick={() => setTaskPickerCourseId(null)}>إلغاء</Button>
                <Button disabled={taskSubmitting} onClick={() => void handleConfirmTaskTimer()}>
                  {taskSubmitting ? "جارٍ الفتح..." : "فتح"}
                </Button>
              </div>
            </div>
          </>
        </DialogContent>
      </Dialog>

      {canEdit && <Card className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <CardHeader className="text-right">
          <CardTitle className="text-xl">إدارة المهام الأدائية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-right">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row-reverse xl:items-end">
              <div className="flex shrink-0 xl:self-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      className="group relative overflow-visible rounded-full"
                      aria-label="إضافة"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[10rem] rounded-2xl bg-white text-right">
                    <DropdownMenuItem className="justify-end text-right" onSelect={() => handleSelectTaskCreationMode("questions")}>أسئلة</DropdownMenuItem>
                    <DropdownMenuItem className="justify-end text-right" onSelect={() => handleSelectTaskCreationMode("document")}>وورد</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className={cn(
              "grid gap-4 xl:flex-1",
              taskMode === "document"
                ? "xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)_minmax(0,1.05fr)_130px]"
                : taskMode === "questions"
                  ? "xl:grid-cols-[minmax(0,1.55fr)_130px]"
                  : "xl:grid-cols-[minmax(0,1.55fr)]",
            )}>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">
                {taskMode === "document" && documentSubMode === "template" ? "اسم القالب" : "اسم المهمة الأدائية"}
              </label>
              <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="bg-white text-right" />
            </div>

            {taskMode === "questions" && (
              <div className="space-y-2 xl:max-w-[130px]">
                <label className="block text-sm font-bold text-foreground">الدرجة</label>
                <Input type="number" min="0" step="1" value={taskPoints} onChange={(e) => setTaskPoints(e.target.value)} placeholder="الدرجة" className="bg-white text-right" />
              </div>
            )}
            {taskMode === "document" && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">الوضع الحالي</label>
                <Select value={documentSubMode} onValueChange={(v) => setDocumentSubMode(v as "template" | "task")}>
                  <SelectTrigger className="flex-row-reverse bg-white text-right [&>span]:text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="template" className="justify-end pr-3 text-right">إنشاء قالب</SelectItem>
                    <SelectItem value="task" className="justify-end pr-3 text-right">إنشاء مهمة أدائية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {taskMode === "document" && (
              <div className={cn("space-y-2", documentSubMode !== "task" && "opacity-0 pointer-events-none")}>
                <label className="text-sm font-bold text-foreground">اختر قالبًا</label>
                <div className="flex items-center gap-2">
                  <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="flex-row-reverse bg-white text-right [&>span]:text-right">
                      <SelectValue placeholder="اختر قالبًا من القوالب المحفوظة" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.taskTemplates.length === 0 && (
                        <SelectItem value="__none" disabled className="justify-end pr-3 text-right text-muted-foreground">لا توجد قوالب محفوظة بعد</SelectItem>
                      )}
                      {data.taskTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id} className="justify-end pr-3 text-right">{template.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate && documentSubMode === "task" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      title="حذف القالب"
                      onClick={() => {
                        void store.deleteTaskTemplate(selectedTemplate.id);
                        setSelectedTemplateId("new");
                        setTemplateName("");
                        setTemplateContent("");
                        setTaskDocumentContent("");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            {taskMode === "document" && (
              <div className={cn("space-y-2 xl:max-w-[130px]", documentSubMode !== "task" && "opacity-0 pointer-events-none")}>
                <label className="block text-sm font-bold text-foreground">الدرجة</label>
                <Input type="number" min="0" step="1" value={taskPoints} onChange={(e) => setTaskPoints(e.target.value)} placeholder="الدرجة" className="bg-white text-right" />
              </div>
            )}
              </div>
            </div>
          </div>

          {taskMode === "document" && documentSubMode === "template" && (
            <div className="space-y-4 rounded-[1.4rem] border border-border/60 bg-slate-50/80 p-4 md:p-5">
              <DocumentEditor value={templateContent} onChange={setTemplateContent} />
            </div>
          )}

          {taskMode === "document" && documentSubMode === "task" && (
            <div className="space-y-4 rounded-[1.4rem] border border-border/60 bg-slate-50/80 p-4 md:p-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">رابط مقطع يوتيوب (اختياري)</label>
                <Input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="bg-white text-right placeholder:text-right"
                />
              </div>
              <DocumentEditor value={taskDocumentContent} onChange={setTaskDocumentContent} />
            </div>
          )}

          {taskMode === "questions" && (
            <div className="space-y-3 rounded-[1.4rem] border border-border/60 bg-slate-50/80 p-4 md:p-5">
              {renderDraftQuestionsList()}
            </div>
          )}

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          {taskMode === "document" ? (
            <div className="flex flex-wrap justify-end gap-2">
              {documentSubMode === "template" && (
                <Button type="button" onClick={() => void handleSaveTemplate()} disabled={submitting} className="rounded-full px-5">
                  حفظ القالب
                </Button>
              )}
              {documentSubMode === "task" && (
                <Button type="button" onClick={() => void handleCreateTask()} disabled={submitting} className="rounded-full px-5">
                  حفظ
                </Button>
              )}
            </div>
          ) : taskMode === "questions" ? (
            <Button onClick={() => void handleCreateTask()} disabled={submitting} className="rounded-full px-5">
              حفظ
            </Button>
          ) : null}
        </CardContent>
      </Card>}

      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
        <SortableContext items={visibleTasks.map((t) => t.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleTasks.length === 0 && (
              <Card className="rounded-[1.5rem] border-dashed border-border/70 bg-white/80 md:col-span-2 xl:col-span-3">
                <CardContent className="p-6 text-right text-sm text-muted-foreground">لا توجد مهام أدائية بعد.</CardContent>
              </Card>
            )}

            {visibleTasks.map((task) => {
              const isActive = isAssessmentEnabledForCourse(task, "tasks", managedBranchId);
              const deadline = getAssessmentAvailabilityDeadline(task, "tasks", managedBranchId);

              return (
              <SortableTaskCard key={task.id} id={task.id}>
              <Card className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-right">
                      <CardTitle className="min-h-[4rem] text-lg leading-8">{task.title}</CardTitle>
                    </div>
                    <div className="flex justify-start gap-1.5">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-xl text-destructive"
                          disabled={deletingTaskId === task.id}
                          onClick={() => setPendingDeleteTask({ id: task.id, title: task.title })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          handleOpenTaskManageDialog(task.id);
                        } else {
                          handleOpenTaskPicker(task.id);
                        }
                      }}
                      className={cn(
                        "rounded-[1rem] border p-3 text-center text-sm font-bold transition-smooth",
                        isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          : "border-border/70 bg-muted/30 text-muted-foreground hover:border-primary/25 hover:text-primary",
                      )}
                    >
                      <div>بدء</div>
                      {isActive && deadline && (
                        <div className="mt-1 text-[11px] font-medium"><TaskCountdownLabel closesAt={deadline} /></div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/course/tasks?courseId=${task.id}`)}
                      className="rounded-[1rem] border border-border/70 bg-muted/30 p-3 text-center text-sm font-bold text-muted-foreground transition-smooth hover:border-primary/25 hover:text-primary"
                    >
                      <div>عرض المهمة</div>
                    </button>
                  </div>
                </CardContent>
              </Card>
              </SortableTaskCard>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={Boolean(taskManageDialog)} onOpenChange={(open) => { if (!open) { setTaskManageDialog(null); setTaskManageChoice(""); } }}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl">إدارة حالة المهمة الأدائية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">الإجراء</label>
              <Select value={taskManageChoice} onValueChange={setTaskManageChoice}>
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(() => {
                    if (!taskManageDialog) return null;
                    const task = tasks.find((item) => item.id === taskManageDialog.taskId);
                    if (!task) return null;

                    return getTaskManageOptions(task).map((option) => (
                      <SelectItem key={option.value} value={option.value} className="justify-end pr-3 text-right">{option.label}</SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" disabled={taskManageSubmitting} onClick={() => setTaskManageDialog(null)}>إلغاء</Button>
              <Button
                disabled={!taskManageChoice || taskManageSubmitting}
                onClick={async () => {
                  if (!taskManageDialog || !taskManageChoice) return;

                  if (taskManageChoice.startsWith("close_")) {
                    const branch = taskManageChoice === "close_all"
                      ? undefined
                      : (taskManageChoice.replace("close_", "") as BranchId);
                    setTaskManageSubmitting(true);
                    try {
                      await handleDeactivateTask(taskManageDialog.taskId, branch);
                      setTaskManageDialog(null);
                    } finally {
                      setTaskManageSubmitting(false);
                    }
                    return;
                  }

                  const branch = taskManageChoice === "open_all"
                    ? "all"
                    : (taskManageChoice.replace("open_", "") as TaskOpenBranch);
                  handleOpenTaskPicker(taskManageDialog.taskId);
                  setTaskTimerBranch(branch);
                  setTaskSkipBranchConflict(true);
                  setTaskManageDialog(null);
                }}
              >
                {taskManageSubmitting ? "جارٍ التنفيذ..." : "متابعة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteTask)} onOpenChange={(open) => { if (!open) setPendingDeleteTask(null); }}>
        <AlertDialogContent className="rounded-[1.75rem] text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right">تأكيد حذف المهمة الأدائية</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {pendingDeleteTask ? <>سيتم حذف <span className="font-bold text-foreground">{pendingDeleteTask.title}</span> نهائيًا.</> : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => void handleConfirmDeleteTask()}>
              حذف
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => setPendingDeleteTask(null)}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(taskBranchConflict)} onOpenChange={(open) => { if (!open) setTaskBranchConflict(null); }}>
        <AlertDialogContent className="rounded-[1.75rem] text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right">تنبيه: فرع نشط</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {taskBranchConflict && (
                <>
                  {"الفرع "}
                  <span className="font-bold text-foreground">{branchLabels[taskBranchConflict.activeBranch]}</span>
                  {" مفتوح حالياً. هل تريد أيضًا تفعيل الفرع "}
                  <span className="font-bold text-foreground">{branchLabels[taskBranchConflict.pendingBranch]}</span>
                  {"؟"}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => void handleConfirmTaskTimer(true)}>
              تفعيل {taskBranchConflict ? `الفرع ${branchLabels[taskBranchConflict.pendingBranch]}` : ""}
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => setTaskBranchConflict(null)}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminTasksTab;
