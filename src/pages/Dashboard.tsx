import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRightLeft, BarChart3, Bell, BookOpen, Check, ClipboardList, Copy, Database, Download, Eye, FilePen, FileText, FileUp, GraduationCap, Info, LayoutPanelTop, Link2, Maximize2, Menu, Minus, MoreHorizontal, Pencil, Plus, Power, ShieldCheck, SquarePen, Trash2, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DocumentEditor from "@/components/editor/DocumentEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ToastAction } from "@/components/ui/toast";
import AdminTasksTab from "@/components/dashboard/AdminTasksTab";
import AdminFinalExamTab from "@/components/dashboard/AdminFinalExamTab";
import ImportResultsDialog, { type ImportRow } from "@/components/dashboard/ImportResultsDialog";
import ManualGradesDialog from "@/components/dashboard/ManualGradesDialog";
import {
  type AssessmentType,
  type AttendanceRecord,
  type BranchId,
  type CourseQuestion,
  type DashboardData,
  type PermissionKey,
  type StudentRecord,
  getAssessmentAvailabilityDeadline,
  getDefaultAssessmentNotificationTemplate,
  getDefaultFinalExamNotificationTemplate,
  getManagedBranchId,
  getActiveCourse,
  getAssignedStudents,
  getBranchStudents,
  getCourses,
  getCoursePath,
  getCourseLink,
  getTasks,
  getTaskLink,
  getRoleLabel,
  resolveAccessByLoginCode,
  isAssessmentEnabledForCourse,
  isFinalExamAvailable,
  isDashboardRole,
  clearAccessSession,
  loadAccessSession,
  useDashboardStore,
} from "@/lib/dashboard-store";
import { extractQuestionsFromPdf, extractStudentsFromPdf, parseImportedQuestionsFromText } from "@/lib/question-import";
import { loadSpreadsheetRows, loadSpreadsheetSheets } from "@/lib/spreadsheet";
import { addDashboardAccountToDatabase, deleteDashboardAccountFromDatabase, deleteReciterFromDatabase, getDashboardAccountsFromDatabase, saveReciterToDatabase, transferStudentToReciterInDatabase, type DatabaseDashboardAccount } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const sendPushNotification = (title: string, message: string, loginCodes: string[], url?: string) => {
  fetch("/api/send-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, message, loginCodes, url: url || "/" }),
  })
    .then((res) => res.json())
    .then((data: { sent?: number; failed?: number; error?: string }) => {
      if (data.error) {
        toast({ title: "خطأ في الإشعارات", description: data.error, variant: "destructive" });
      } else if ((data.sent ?? 0) === 0) {
        toast({ title: "الإشعارات", description: "لا توجد اشتراكات محفوظة للمستخدمين المحددين" });
      } else {
        toast({ title: "الإشعارات", description: "تم الإرسال بنجاح" });
      }
    })
    .catch(() => {
      toast({ title: "خطأ", description: "تعذر الاتصال بخادم الإشعارات", variant: "destructive" });
    });
};

const parts = Array.from({ length: 30 }, (_, index) => index + 1);

const branchLabels: Record<BranchId, string> = {
  male: "معلمين",
  female: "معلمات",
};

type IndicatorsBranchFilter = BranchId | "all";
type AssessmentOpenBranch = BranchId | "all";

const assessmentLabels: Record<AssessmentType, string> = {
  pre: "الاختبار القبلي",
  post: "الاختبار البعدي",
  tasks: "المهام الأدائية",
};

const BACKUP_RESTORE_PROGRESS_STORAGE_KEY = "momars-backup-restore-progress";

type BackupRestoreProgressState = {
  isActive: boolean;
  percent: number;
  message: string;
  fileName: string;
  startedAt: string;
  updatedAt: string;
};

const formatBackupFileDate = (isoDate: string) => isoDate.slice(0, 19).replace(/[T:]/g, "-");

const createBackupFileName = (isoDate: string, prefix = "نسخة_احتياطية_رخصة_ممارس") => `${prefix}_${formatBackupFileDate(isoDate)}.json`;

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

const emptyStudentForm = {
  name: "",
  loginId: "",
  branchId: "male" as BranchId,
  note: "",
};

const emptyReciterForm = {
  name: "",
  branchId: "male" as BranchId,
  studentIds: [] as string[],
  loginCode: "",
};

const emptyQuestionForm = {
  prompt: "",
  type: "multiple" as "multiple" | "text" | "truefalse",
  optionsText: "",
  allowFile: "no" as "yes" | "no",
  points: "1",
  correctAnswer: "",
};

const emptyQuestionImportMessages = { pre: "", post: "", tasks: "" };
const ALL_COURSE_INDICATORS_ID = "all";

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

const parseQuestionOptions = (value: string) => {
  const pastedOptions = splitPastedQuestionOptions(value);
  const source = pastedOptions.length >= 2 ? pastedOptions.join(" | ") : value;

  return source
    .split("|")
    .map((item) => stripQuestionOptionLabel(item))
    .filter(Boolean);
};

const emptyAdminForm = {
  name: "",
  loginCode: "",
  role: "admin" as const,
};

const emptyNotificationForm = {
  message: "",
  targetBranchId: "all" as "all" | BranchId,
  targetLoginIds: [] as string[],
};

const emptyCourseEditForm = {
  id: null as string | null,
  title: "",
};

type PreviewAttachment = {
  name: string;
  type?: string;
  dataUrl: string;
};

const RECITER_FILTER_ALL_STUDENTS = "all-students";
const RECITER_FILTER_ALL_RECITERS = "all-reciters";
const RECITER_FILTER_CERTIFIED = "certified";
const ALL_SATISFACTION_DELETE_COURSES = "__all_satisfaction_courses__";
const getSatisfactionDeleteQuestionKey = (prompt: string, type: "rating" | "text") => `${type}::${prompt.trim()}`;

const normalizeAnswer = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[\u064B-\u065F\u0670]/g, "")   // strip tashkeel
  .replace(/[أإآ]/g, "ا")                   // normalize alef
  .replace(/ة/g, "ه")                        // normalize taa marbuta
  .replace(/ى/g, "ي")                        // normalize alef maqsoura
  .replace(/[.،,؛;!?؟:]+$/g, "")            // strip trailing punctuation
  .replace(/^[أ-ي]\s*[).\-:]\s*/i, "")      // strip leading letter marker like "ب) " or "أ. "
  .trim();
const TEXT_ANSWER_SIMILARITY_THRESHOLD = 0.6;

const normalizeTextForSimilarity = (value: string) =>
  normalizeAnswer(value)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[.,!?;:()\[\]{}"'`~@#$%^&*_+=<>\\/\-|،؛؟]/g, " ")
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

interface PendingAdminTransfer {
  studentId: string;
  studentName: string;
  branchId: BranchId;
  currentReciterId: string;
}

interface PendingReciterActions {
  reciterId: string;
}

interface PendingAssessmentAvailability {
  courseId: string;
  assessmentType: AssessmentType;
}

interface BulkStudentRow {
  id: string;
  name: string;
  loginId: string;
  branchId: BranchId;
}

const normalizeSpreadsheetCell = (value: unknown) => String(value ?? "").trim();

const normalizeSpreadsheetRow = (row: unknown[] | undefined) => {
  if (!Array.isArray(row)) {
    return [] as string[];
  }

  return Array.from({ length: row.length }, (_, index) => normalizeSpreadsheetCell(row[index]).toLowerCase());
};

// Returns true when a column looks like a sequential row counter (1,2,3... or م,1,2...)
const isSerialColumn = (rows: unknown[][], colIndex: number): boolean => {
  const values = rows
    .map((row) => (Array.isArray(row) ? normalizeSpreadsheetCell(row[colIndex]) : ""))
    .filter(Boolean);
  if (values.length === 0) return false;
  let seq = 0;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isNaN(n) && Number.isFinite(n)) { seq++; }
  }
  return seq / values.length >= 0.8; // 80%+ numeric → serial
};

const parseBulkStudentsFromWorksheet = (rows: unknown[][], defaultBranchId: BranchId) => {
  const firstContentRowIndex = rows.findIndex((row) => Array.isArray(row) && row.some((cell) => normalizeSpreadsheetCell(cell)));

  if (firstContentRowIndex === -1) {
    return [] as BulkStudentRow[];
  }

  const firstContentRow = normalizeSpreadsheetRow(rows[firstContentRowIndex]);
  const headerLooksNamed = firstContentRow.some((cell) => cell.includes("اسم") || cell.includes("name"));
  const isPhoneColumn = (cell: string) => cell.includes("جوال") || cell.includes("هاتف") || cell.includes("تلفون") || cell.includes("phone") || cell.includes("mobile");
  const isLoginColumn = (cell: string) => !isPhoneColumn(cell) && (cell.includes("دخول") || cell.includes("كود") || cell.includes("login") || cell.includes("code") || cell.includes("رقم") || cell.includes("id"));
  const headerLooksLogin = firstContentRow.some(isLoginColumn);
  const headerLooksBranch = firstContentRow.some((cell) => cell.includes("فرع") || cell.includes("branch"));
  const hasHeader = headerLooksNamed || headerLooksLogin || headerLooksBranch;
  const header = hasHeader ? firstContentRow : [];
  const dataRows = rows.slice(hasHeader ? firstContentRowIndex + 1 : firstContentRowIndex);

  let nameColumnIndex: number;
  let loginColumnIndex: number;
  let branchColumnIndex: number;

  if (hasHeader) {
    nameColumnIndex = header.findIndex((cell) => cell.includes("اسم") || cell.includes("name"));
    loginColumnIndex = header.findIndex(isLoginColumn);
    branchColumnIndex = header.findIndex((cell) => cell.includes("فرع") || cell.includes("branch"));
  } else {
    // Auto-detect: skip serial-number columns, first text column = name, first other = loginId
    const totalCols = Math.max(...rows.map((r) => r.length));
    const nonSerialCols: number[] = [];
    for (let c = 0; c < totalCols; c++) {
      if (!isSerialColumn(rows, c)) nonSerialCols.push(c);
    }
    nameColumnIndex = nonSerialCols[0] ?? 0;
    loginColumnIndex = nonSerialCols.length > 1 ? (nonSerialCols[1] ?? -1) : -1;
    branchColumnIndex = nonSerialCols.length > 2 ? (nonSerialCols[2] ?? -1) : -1;
  }

  return dataRows
    .map((row, index) => {
      const name = normalizeSpreadsheetCell(row[nameColumnIndex]);
      const loginId = loginColumnIndex >= 0 ? normalizeSpreadsheetCell(row[loginColumnIndex]) : "";
      const branchText = normalizeSpreadsheetCell(branchColumnIndex >= 0 ? row[branchColumnIndex] : "").toLowerCase();
      const branchId = branchText.includes("نس") || branchText.includes("fem")
        ? "female"
        : branchText.includes("رج") || branchText.includes("male")
          ? "male"
          : defaultBranchId;

      if (!name && !loginId) {
        return null;
      }

      return {
        id: `bulk-student-${index}-${loginId || name || crypto.randomUUID()}`,
        name,
        loginId,
        branchId,
      } satisfies BulkStudentRow;
    })
    .filter((row): row is BulkStudentRow => Boolean(row));
};

const dashboardMenu = [
  { id: "attendance", label: "التحضير", icon: Users, hint: "تحضير الطلاب" },
  { id: "courses", label: "الاختبارات", icon: Database, hint: "المحتوى والروابط" },
  { id: "tasks", label: "المهام الأدائية", icon: Copy, hint: "تكاليف مستقلة" },
  { id: "finalexam", label: "الاختبار النهائي", icon: GraduationCap, hint: "اختبار نهائي لكل فرع" },
  { id: "permissions", label: "الصلاحيات", icon: ShieldCheck, hint: "صلاحيات المسؤولين" },
  { id: "notifications", label: "الإشعارات", icon: Bell, hint: "إرسال التنبيهات" },
  { id: "indicators", label: "المستخدمين", icon: LayoutPanelTop, hint: "إدارة المستخدمين" },
  { id: "satisfaction", label: "استبيان الرضا", icon: ClipboardList, hint: "أسئلة الاستبيان ونتائجه" },
  { id: "results", label: "النتائج", icon: BarChart3, hint: "الحضور والتقييم" },
] as const;

type DashboardMenuTab = typeof dashboardMenu[number]["id"];
type DashboardTab = DashboardMenuTab | "home" | "activity";
const dashboardMenuIds = dashboardMenu.map((item) => item.id) as DashboardMenuTab[];
const isDashboardMenuTab = (value: string): value is DashboardMenuTab => dashboardMenuIds.includes(value as DashboardMenuTab);

const dashboardCardClass = "rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]";
const dashboardMutedPanelClass = "rounded-[1.25rem] border border-border/60 bg-muted/20";
const dashboardPlainPanelClass = "rounded-[1.25rem] border border-border/60 bg-white";
const dashboardEmptyStateClass = "rounded-[1.25rem] border border-dashed border-border/70 bg-white/70";
const FINAL_EXAM_RESULTS_ID = "__final_exam_results__";
const SATISFACTION_ALL_RESULTS_ID = "__all_satisfaction_results__";

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const formatPercent = (value: number) => `${Math.round(clampPercent(value))}%`;

const ProgramIndicatorRing = ({
  label,
  helperText,
  progressValue,
  displayValue,
  suffix = "%",
  size = "default",
  formatDisplay,
}: {
  label: string;
  helperText?: string;
  progressValue: number;
  displayValue: number;
  suffix?: string;
  size?: "default" | "small";
  formatDisplay?: (value: number) => string;
}) => {
  const gradientId = useId();
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedDisplay, setAnimatedDisplay] = useState(0);
  const safeProgress = clampPercent(progressValue);
  const safeDisplay = Math.max(0, displayValue);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      setAnimatedProgress(safeProgress);
      setAnimatedDisplay(safeDisplay);
      return undefined;
    }

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
  const shownValue = formatDisplay ? formatDisplay(animatedDisplay) : `${Math.round(animatedDisplay)}${suffix}`;
  const isSmall = size === "small";

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className={cn("relative flex items-center justify-center", isSmall ? "h-28 w-28 sm:h-32 sm:w-32" : "h-40 w-40 sm:h-44 sm:w-44 lg:h-48 lg:w-48")}>
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
            <span className={cn("font-black leading-none tracking-[-0.04em] text-[#0a4c61]", isSmall ? "text-[1.45rem] sm:text-[1.6rem]" : "text-[2rem] sm:text-[2.15rem]")}>
              {shownValue}
            </span>
          </div>
        </div>
      </div>
      <div className={cn("font-extrabold leading-7 text-[#08384a]", isSmall ? "max-w-[10rem] text-xs sm:text-sm" : "max-w-[11rem] text-sm sm:text-[0.95rem]")}>{label}</div>
      {helperText ? <div className="text-[0.72rem] font-medium text-muted-foreground sm:text-xs">{helperText}</div> : null}
    </div>
  );
};

const getSupabaseErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as { message?: string; details?: string; hint?: string; code?: string };
  const rawMessage = [candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" ").toLowerCase();

  if (rawMessage.includes("row-level security") || rawMessage.includes("violates row-level security policy")) {
    if (rawMessage.includes('table "users"') || rawMessage.includes("table users")) {
      return "تعذر حفظ المشرف لأن جدول المستخدمين محمي بسياسة صلاحيات في Supabase. يلزم إضافة Policy مناسبة أو تنفيذ الإضافة من خلال Backend آمن.";
    }

    return "تعذر تنفيذ العملية بسبب سياسة الصلاحيات في Supabase. تحقق من إعدادات RLS أو نفّذ العملية من خلال Backend آمن.";
  }

  const parts = [candidate.message, candidate.details, candidate.hint].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" - ");
  }

  if (candidate.code) {
    return `${fallback} (code: ${candidate.code})`;
  }

  return fallback;
};

const CountdownLabel = ({ closesAt }: { closesAt: string }) => {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(closesAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(closesAt).getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [closesAt]);

  if (remaining <= 0) return <span>انتهى الوقت</span>;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}س`);
  parts.push(`${String(m).padStart(2, "0")}د`);
  parts.push(`${String(s).padStart(2, "0")}ث`);
  return <span>يغلق بعد: {parts.join(" ")}</span>;
};

const SortableCourseCard = ({ id, children }: { id: string; children: React.ReactNode }) => {
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

const Dashboard = () => {
  const storedSession = loadAccessSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const store = useDashboardStore();
  const { data, loadError, isHydrated } = store;
  const validatedSession = useMemo(() => {
    if (!storedSession || !isHydrated) {
      return null;
    }

    const resolved = resolveAccessByLoginCode(data, storedSession.loginCode);

    if (!resolved || resolved.role !== storedSession.role || !isDashboardRole(resolved.role)) {
      return null;
    }

    return {
      ...storedSession,
      loginCode: resolved.loginCode,
      name: resolved.name,
      redirectPath: resolved.redirectPath,
      branchId: resolved.branchId ?? null,
    };
  }, [data, isHydrated, storedSession]);

  useEffect(() => {
    if (isHydrated && storedSession && !validatedSession) {
      clearAccessSession();
    }
  }, [isHydrated, storedSession, validatedSession]);

  const session = validatedSession ?? (storedSession && isDashboardRole(storedSession.role)
    ? storedSession
    : { role: "male_manager" as const, loginCode: "", name: "", redirectPath: "/dashboard", branchId: null });
  const managedBranchId = getManagedBranchId(session.role);
  const canManageDashboardAccounts = session.role === "admin";
  const canCreateCourses = session.role === "admin";
  const canEditCourseModels = session.role === "admin";
  const canManageStandaloneTasks = session.role === "admin" || session.role === "male_manager" || session.role === "female_manager";
  const requestedDashboardTab = searchParams.get("tab");
  const dashboardTab: DashboardTab = useMemo(() => {
    if (!requestedDashboardTab || requestedDashboardTab === "home") {
      return "home";
    }

    if (requestedDashboardTab === "activity") {
      return "activity";
    }

    return isDashboardMenuTab(requestedDashboardTab) ? requestedDashboardTab : "home";
  }, [requestedDashboardTab]);
  const setDashboardTab = useCallback((tab: DashboardTab, options?: { replace?: boolean }) => {
    const nextParams = new URLSearchParams(searchParams);

    if (tab === "home") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", tab);
    }

    if (nextParams.toString() === searchParams.toString()) {
      return;
    }

    setSearchParams(nextParams, options);
  }, [searchParams, setSearchParams]);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [studentEntryMode, setStudentEntryMode] = useState<"single" | "bulk">("single");
  const [selectedBranch, setSelectedBranch] = useState<IndicatorsBranchFilter>(managedBranchId ?? "male");
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [bulkStudents, setBulkStudents] = useState<BulkStudentRow[]>([]);
  const [bulkStudentFileName, setBulkStudentFileName] = useState("");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentManagerMode, setStudentManagerMode] = useState(false);
  const [studentManagerEntityType, setStudentManagerEntityType] = useState<"student" | "reciter">("student");
  const [studentPickerBranchId, setStudentPickerBranchId] = useState<BranchId>("male");
  const [studentPickerStudentId, setStudentPickerStudentId] = useState("");
  const [studentPickerReciterId, setStudentPickerReciterId] = useState("");
  const [studentTransferTargetReciterId, setStudentTransferTargetReciterId] = useState("");
  const [partsDialogStudentId, setPartsDialogStudentId] = useState<string | null>(null);
  const [studentError, setStudentError] = useState("");
  const bulkStudentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [adminsOpen, setAdminsOpen] = useState(false);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [adminError, setAdminError] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminsList, setAdminsList] = useState<DatabaseDashboardAccount[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminDeletingId, setAdminDeletingId] = useState<string | null>(null);
  const [notificationForm, setNotificationForm] = useState<typeof emptyNotificationForm>({
    ...emptyNotificationForm,
    targetBranchId: managedBranchId ?? "all",
  });
  const [notificationError, setNotificationError] = useState("");
  const [notificationSubmitting, setNotificationSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [recitersOpen, setRecitersOpen] = useState(false);
  const [reciterBranchFilter, setReciterBranchFilter] = useState<BranchId>(managedBranchId ?? "male");
  const [selectedReciterFilter, setSelectedReciterFilter] = useState(RECITER_FILTER_ALL_STUDENTS);
  const [reciterSortFilter, setReciterSortFilter] = useState<"desc" | "asc">("desc");
  const [reciterForm, setReciterForm] = useState(emptyReciterForm);
  const [editingReciterId, setEditingReciterId] = useState<string | null>(null);
  const [reciterError, setReciterError] = useState("");
  const [reciterSubmitting, setReciterSubmitting] = useState(false);
  const [reciterDeleting, setReciterDeleting] = useState(false);
  const [selectedReciterId, setSelectedReciterId] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseError, setCourseError] = useState("");
  const [courseEditOpen, setCourseEditOpen] = useState(false);
  const [coursesManageOpen, setCoursesManageOpen] = useState(false);
  const [satisfactionCourseId, setSatisfactionCourseId] = useState("");
  const [satisfactionAddDialogOpen, setSatisfactionAddDialogOpen] = useState(false);
  const [satisfactionDeleteDialogOpen, setSatisfactionDeleteDialogOpen] = useState(false);
  const [satisfactionDeleteQuestionKey, setSatisfactionDeleteQuestionKey] = useState("");
  const [satisfactionDeleteCourseId, setSatisfactionDeleteCourseId] = useState(ALL_SATISFACTION_DELETE_COURSES);
  const [satisfactionResultsCourseId, setSatisfactionResultsCourseId] = useState("");
  const [satisfactionPreviewText, setSatisfactionPreviewText] = useState<string | null>(null);
  const satisfactionIndicatorsExportRef = useRef<HTMLDivElement | null>(null);
  const [newSurveyPrompt, setNewSurveyPrompt] = useState("");
  const [newSurveyType, setNewSurveyType] = useState<"rating" | "text">("rating");
  const [newSurveyRequired, setNewSurveyRequired] = useState(true);

  // Final exam state
  const [finalExamManageBranch, setFinalExamManageBranch] = useState<BranchId>(managedBranchId ?? "male");
  const [finalExamCopyOpen, setFinalExamCopyOpen] = useState(false);
  const [finalExamActivationDialogOpen, setFinalExamActivationDialogOpen] = useState(false);
  const [finalExamActivationMinutes, setFinalExamActivationMinutes] = useState("60");
  const [finalExamActivationError, setFinalExamActivationError] = useState("");
  const [finalExamScoreEdit, setFinalExamScoreEdit] = useState<{ submissionId: string; value: string } | null>(null);
  const [courseEditForm, setCourseEditForm] = useState(emptyCourseEditForm);
  const [courseEditError, setCourseEditError] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedCourseAssessment, setSelectedCourseAssessment] = useState<AssessmentType | null>(null);
  const [questionForms, setQuestionForms] = useState({ pre: emptyQuestionForm, post: emptyQuestionForm, tasks: emptyQuestionForm });
  const [questionErrors, setQuestionErrors] = useState({ pre: "", post: "", tasks: "" });
  const [questionImportMessages, setQuestionImportMessages] = useState(emptyQuestionImportMessages);
  const [questionImportTarget, setQuestionImportTarget] = useState<AssessmentType | null>(null);
  const [isImportingQuestions, setIsImportingQuestions] = useState({ pre: false, post: false, tasks: false });
  const [splitText, setSplitText] = useState({ pre: "", post: "", tasks: "" });
  const questionPdfImportInputRef = useRef<HTMLInputElement | null>(null);
  const courseOrderRef = useRef<string[]>([]);
  const [attendanceCourseId, setAttendanceCourseId] = useState("");
  const [attendanceBranchId, setAttendanceBranchId] = useState<BranchId>("male");
  const [attendanceChecked, setAttendanceChecked] = useState<Set<string>>(new Set());
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [pendingAttendanceSave, setPendingAttendanceSave] = useState<{
    courseId: string;
    courseTitle: string;
    isTask: boolean;
    branchLabel: string;
    presentStudents: StudentRecord[];
    previousPresentStudents: StudentRecord[];
    changedCount: number;
  } | null>(null);
  const [attendanceFileError, setAttendanceFileError] = useState("");
  const attendanceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [resultsCourseId, setResultsCourseId] = useState("");
  const [resultsBranchId, setResultsBranchId] = useState<IndicatorsBranchFilter>("male");
  const [resultsType, setResultsType] = useState<"attendance" | AssessmentType>("attendance");
  const [resultsAttendanceFilter, setResultsAttendanceFilter] = useState<"all" | "present" | "absent" | "frequent-absent">("all");
  const [homeBranchFilter, setHomeBranchFilter] = useState<IndicatorsBranchFilter>("all");
  const [homeCourseFilter, setHomeCourseFilter] = useState("all");
  const [indicatorsBranchId, setIndicatorsBranchId] = useState<IndicatorsBranchFilter>("all");
  const [indicatorsSortOrder, setIndicatorsSortOrder] = useState<"alpha" | "overall-desc" | "overall-asc">("overall-desc");
  const [indicatorsCourseId, setIndicatorsCourseId] = useState("all");
  const [courseIndicatorsBranch, setCourseIndicatorsBranch] = useState<IndicatorsBranchFilter>(managedBranchId ?? "all");
  const [courseIndicatorsCourseId, setCourseIndicatorsCourseId] = useState("");
  const [detailsSubmissionId, setDetailsSubmissionId] = useState<string | null>(null);
  const [finalExamDetailsSubmissionId, setFinalExamDetailsSubmissionId] = useState<string | null>(null);
  const [importResultsOpen, setImportResultsOpen] = useState(false);
  const [manualGradesOpen, setManualGradesOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const [courseLinksOpen, setCourseLinksOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [backupImportConfirmOpen, setBackupImportConfirmOpen] = useState(false);
  const [backupRestoreConfirmOpen, setBackupRestoreConfirmOpen] = useState(false);
  const [backupDeleteConfirmOpen, setBackupDeleteConfirmOpen] = useState(false);
  const [backupDeleteRunning, setBackupDeleteRunning] = useState(false);
  const [backupRestoreRunning, setBackupRestoreRunning] = useState(false);
  const [backupRestoreProgress, setBackupRestoreProgress] = useState<BackupRestoreProgressState | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(BACKUP_RESTORE_PROGRESS_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as BackupRestoreProgressState;
      const updatedAt = Date.parse(parsed.updatedAt ?? "");

      if (!parsed?.isActive || Number.isNaN(updatedAt) || Date.now() - updatedAt > 15_000) {
        window.localStorage.removeItem(BACKUP_RESTORE_PROGRESS_STORAGE_KEY);
        return null;
      }

      return parsed;
    } catch {
      window.localStorage.removeItem(BACKUP_RESTORE_PROGRESS_STORAGE_KEY);
      return null;
    }
  });
  const [pendingBackupImportFile, setPendingBackupImportFile] = useState<File | null>(null);
  const [pendingBackupData, setPendingBackupData] = useState<DashboardData | null>(null);
  const [importedBackupSummary, setImportedBackupSummary] = useState<{
    fileName: string;
    exportedAt: string;
    rolesCount: number;
    branchesCount: number;
    studentsCount: number;
    recitersCount: number;
    coursesCount: number;
    taskTemplatesCount: number;
    attendanceCount: number;
    notificationsCount: number;
    submissionsCount: number;
    finalExamQuestionsCount: number;
    finalExamSubmissionsCount: number;
    hasFinalExamSettings: boolean;
    hasRolePermissions: boolean;
    hasIndicators: boolean;
  } | null>(null);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const [notifTemplatesOpen, setNotifTemplatesOpen] = useState(false);
  const [notifTemplatePre, setNotifTemplatePre] = useState("");
  const [notifTemplatePost, setNotifTemplatePost] = useState("");
  const [notifTemplateTasks, setNotifTemplateTasks] = useState("");
  const [notifTemplateFinalExam, setNotifTemplateFinalExam] = useState("");
  const [notifTemplateSaving, setNotifTemplateSaving] = useState(false);
  const [assessmentActionPicker, setAssessmentActionPicker] = useState<{ courseId: string; assessmentType: AssessmentType } | null>(null);
  const [assessmentPickerStep, setAssessmentPickerStep] = useState<"pick" | "timer">("pick");
  const [pendingAssessmentAvailability, setPendingAssessmentAvailability] = useState<PendingAssessmentAvailability | null>(null);
  const [assessmentDurationMinutes, setAssessmentDurationMinutes] = useState("30");
  const [assessmentNoTimeLimit, setAssessmentNoTimeLimit] = useState(false);
  const [assessmentTemplateDraft, setAssessmentTemplateDraft] = useState("");
  const [assessmentTargetBranch, setAssessmentTargetBranch] = useState<AssessmentOpenBranch | null>(null);
  const [assessmentBlockedBranch, setAssessmentBlockedBranch] = useState<BranchId | null>(null);
  const [assessmentRestrictToBranchOnly, setAssessmentRestrictToBranchOnly] = useState(false);
  const [assessmentAvailabilityError, setAssessmentAvailabilityError] = useState("");
  const [assessmentTemplateOpen, setAssessmentTemplateOpen] = useState(false);
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);
  const [crossCourseConflict, setCrossCourseConflict] = useState<{ conflictingCourseId: string; conflictingCourseTitle: string; pendingCourseId: string; pendingType: AssessmentType } | null>(null);
  const [assessmentManageDialog, setAssessmentManageDialog] = useState<{ courseId: string; assessmentType: AssessmentType } | null>(null);
  const [assessmentManageChoice, setAssessmentManageChoice] = useState<string>("");
  const [assessmentManageSubmitting, setAssessmentManageSubmitting] = useState(false);
  const [pendingDeleteStudent, setPendingDeleteStudent] = useState<{ id: string; name: string } | null>(null);
  const [pendingDeleteReciter, setPendingDeleteReciter] = useState<{ id: string; name: string } | null>(null);
  const [pendingDeleteCourse, setPendingDeleteCourse] = useState<{ id: string; name: string } | null>(null);
  const [pendingAdminTransfer, setPendingAdminTransfer] = useState<PendingAdminTransfer | null>(null);
  const [pendingReciterActions, setPendingReciterActions] = useState<PendingReciterActions | null>(null);
  const [adminTransferTargetReciterId, setAdminTransferTargetReciterId] = useState("");
  const [adminTransferError, setAdminTransferError] = useState("");
  const [adminTransferSubmitting, setAdminTransferSubmitting] = useState(false);
  const [allStudentsReciterOrder, setAllStudentsReciterOrder] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (backupRestoreProgress?.isActive) {
      window.localStorage.setItem(BACKUP_RESTORE_PROGRESS_STORAGE_KEY, JSON.stringify(backupRestoreProgress));
      return;
    }

    window.localStorage.removeItem(BACKUP_RESTORE_PROGRESS_STORAGE_KEY);
  }, [backupRestoreProgress]);

  useEffect(() => {
    if (!backupRestoreProgress?.isActive) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [backupRestoreProgress]);

  useEffect(() => {
    if (managedBranchId) {
      setFinalExamManageBranch(managedBranchId);
    }
  }, [managedBranchId]);

  const effectiveFinalExamManageBranch = managedBranchId ?? finalExamManageBranch;
  const finalExamSettings = data.finalExamSettings ?? {
    male: { isEnabled: false, closesAt: null },
    female: { isEnabled: false, closesAt: null },
  };
  const finalExamManageSetting = finalExamSettings[effectiveFinalExamManageBranch];
  const isFinalExamManageEnabled = isFinalExamAvailable(finalExamManageSetting);

  const handleCopyFinalExamQuestionsToBranch = async (to: BranchId) => {
    await store.copyFinalExamQuestions(effectiveFinalExamManageBranch, to, false);
    setFinalExamCopyOpen(false);
  };

  const handleToggleFinalExamAvailability = async () => {
    if (isFinalExamManageEnabled) {
      await store.toggleFinalExamEnabled(effectiveFinalExamManageBranch, null);
      return;
    }

    setFinalExamActivationError("");
    setFinalExamActivationDialogOpen(true);
  };

  const handleActivateFinalExam = async () => {
    const minutes = Number(finalExamActivationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setFinalExamActivationError("أدخل مدة صحيحة بالدقائق.");
      return;
    }

    const closesAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    setFinalExamActivationError("");
    await store.toggleFinalExamEnabled(effectiveFinalExamManageBranch, closesAt);
    const finalExamTemplate = data.finalExamSettings[effectiveFinalExamManageBranch]?.notificationTemplate?.trim() || getDefaultFinalExamNotificationTemplate();
    const finalExamMessage = finalExamTemplate
      .split("{courseTitle}").join("الاختبار النهائي")
      .split("{assessmentLabel}").join("الاختبار النهائي")
      .split("{branchLabel}").join(branchLabels[effectiveFinalExamManageBranch])
      .split("{durationMinutes}").join(String(minutes))
      .split("{durationLabel}").join(formatDurationMinutes(minutes));
    const pushStudents = getBranchStudents(data, effectiveFinalExamManageBranch);
    if (pushStudents.length > 0) {
      sendPushNotification("الاختبار النهائي", finalExamMessage, pushStudents.map((student) => student.loginId), "/final-exam");
    }
    setFinalExamActivationDialogOpen(false);
  };
  const effectiveSelectedBranch = managedBranchId ?? selectedBranch;
  const effectiveReciterBranchFilter = managedBranchId ?? reciterBranchFilter;

  const hasPermission = (key: PermissionKey): boolean => {
    if (session.role === "admin") return true;
    const rolePerms = data.rolePermissions?.[session.role];
    return rolePerms?.[key] === true;
  };

  const canViewActivityLog = hasPermission("page_activity_log");
  const canExportBackup = hasPermission("backup_export");
  const canImportBackup = hasPermission("backup_import");
  const canRestoreBackup = hasPermission("backup_restore");
  const canAccessBackup = canExportBackup || canImportBackup || canRestoreBackup;

  const availableDashboardMenu = dashboardMenu.filter((item) => {
    if (!canManageStandaloneTasks && item.id === "tasks") return false;
    if (session.role !== "admin" && item.id === "permissions") return false;
    if (!hasPermission("page_notifications") && item.id === "notifications") return false;
    if (!hasPermission("page_results") && item.id === "results") return false;
    if (!canViewActivityLog && item.id === "activity") return false;
    return true;
  });
  const secondaryDashboardMenu = availableDashboardMenu.filter((item) => item.id === "permissions" || item.id === "notifications");
  const primaryDashboardMenu = availableDashboardMenu.filter((item) => item.id !== "permissions" && item.id !== "notifications");
  const branchStudents = effectiveSelectedBranch === "all" ? data.students : getBranchStudents(data, effectiveSelectedBranch);
  const studentManagerBranch = managedBranchId ?? studentPickerBranchId;
  const studentManagerStudents = useMemo(
    () => data.students.filter((student) => student.branchId === studentManagerBranch),
    [data.students, studentManagerBranch],
  );
  const studentManagerReciters = useMemo(
    () => data.reciters.filter((reciter) => reciter.branchId === studentManagerBranch),
    [data.reciters, studentManagerBranch],
  );
  const branchReciters = useMemo(
    () => data.reciters.filter((reciter) => reciter.branchId === effectiveReciterBranchFilter),
    [data.reciters, effectiveReciterBranchFilter],
  );
  const indicatorReciters = useMemo(
    () => indicatorsBranchId === "all" ? [] : data.reciters.filter((reciter) => reciter.branchId === indicatorsBranchId),
    [data.reciters, indicatorsBranchId],
  );
  const selectedManagerStudent = editingStudentId
    ? data.students.find((student) => student.id === editingStudentId) ?? null
    : null;
  const selectedManagerStudentReciter = selectedManagerStudent
    ? data.reciters.find((reciter) => reciter.studentIds.includes(selectedManagerStudent.id)) ?? null
    : null;
  const availableStudentTransferReciters = useMemo(() => {
    if (!selectedManagerStudent) {
      return [] as typeof data.reciters;
    }

    return data.reciters.filter(
      (reciter) => reciter.branchId === selectedManagerStudent.branchId && reciter.id !== selectedManagerStudentReciter?.id,
    );
  }, [data.reciters, selectedManagerStudent, selectedManagerStudentReciter]);
  const partsDialogStudent = partsDialogStudentId
    ? data.students.find((student) => student.id === partsDialogStudentId) ?? null
    : null;
  const isAllStudentsReciterView = selectedReciterFilter === RECITER_FILTER_ALL_STUDENTS || selectedReciterFilter === RECITER_FILTER_CERTIFIED;
  const isCertifiedReciterView = selectedReciterFilter === RECITER_FILTER_CERTIFIED;
  const isSpecificReciterView = (
    selectedReciterFilter !== RECITER_FILTER_ALL_STUDENTS &&
    selectedReciterFilter !== RECITER_FILTER_ALL_RECITERS &&
    selectedReciterFilter !== RECITER_FILTER_CERTIFIED
  );
  const showReciterProgressColumn = selectedReciterFilter !== RECITER_FILTER_ALL_RECITERS;
  const filteredReciters = useMemo(
    () => branchReciters
      .filter((reciter) => (
        selectedReciterFilter === RECITER_FILTER_ALL_STUDENTS ||
        selectedReciterFilter === RECITER_FILTER_ALL_RECITERS ||
        selectedReciterFilter === RECITER_FILTER_CERTIFIED ||
        reciter.id === selectedReciterFilter
      ))
      .sort((left, right) => {
        if (selectedReciterFilter === RECITER_FILTER_ALL_RECITERS) {
          return left.name.localeCompare(right.name, "ar");
        }

        const leftPartsCount = data.students
          .filter((student) => left.studentIds.includes(student.id))
          .reduce((sum, student) => sum + student.completedParts.length, 0);
        const rightPartsCount = data.students
          .filter((student) => right.studentIds.includes(student.id))
          .reduce((sum, student) => sum + student.completedParts.length, 0);

        if (leftPartsCount !== rightPartsCount) {
          return reciterSortFilter === "desc" ? rightPartsCount - leftPartsCount : leftPartsCount - rightPartsCount;
        }

        return left.name.localeCompare(right.name, "ar");
      }),
    [branchReciters, data.students, reciterSortFilter, selectedReciterFilter],
  );
  const sortedReciterStudentRows = useMemo(() => {
    if (!isAllStudentsReciterView) {
      return [];
    }

    return branchReciters
      .flatMap((reciter) => data.students
        .filter((student) => reciter.studentIds.includes(student.id))
        .map((student) => ({ student, reciter })))
      .sort((left, right) => {
        const partsDifference = right.student.completedParts.length - left.student.completedParts.length;

        if (partsDifference !== 0) {
          return reciterSortFilter === "desc" ? partsDifference : -partsDifference;
        }

        return left.student.name.localeCompare(right.student.name, "ar");
      });
  }, [branchReciters, data.students, isAllStudentsReciterView, reciterSortFilter]);
  const filteredReciterStudentRows = useMemo(() => {
    if (!isAllStudentsReciterView) {
      return [];
    }

    const base = isCertifiedReciterView
      ? sortedReciterStudentRows.filter(({ student }) => student.isCertified)
      : sortedReciterStudentRows;

    const orderIndex = new Map(allStudentsReciterOrder.map((rowId, index) => [rowId, index]));

    return [...base].sort((left, right) => {
      const leftKey = `${left.reciter.id}:${left.student.id}`;
      const rightKey = `${right.reciter.id}:${right.student.id}`;
      const leftIndex = orderIndex.get(leftKey);
      const rightIndex = orderIndex.get(rightKey);

      if (leftIndex === undefined && rightIndex === undefined) {
        return 0;
      }

      if (leftIndex === undefined) {
        return 1;
      }

      if (rightIndex === undefined) {
        return -1;
      }

      return leftIndex - rightIndex;
    });
  }, [allStudentsReciterOrder, isAllStudentsReciterView, isCertifiedReciterView, sortedReciterStudentRows]);

  useEffect(() => {
    if (!isAllStudentsReciterView) {
      setAllStudentsReciterOrder([]);
      return;
    }

    setAllStudentsReciterOrder(sortedReciterStudentRows.map(({ reciter, student }) => `${reciter.id}:${student.id}`));
  }, [effectiveReciterBranchFilter, isAllStudentsReciterView, reciterSortFilter, selectedReciterFilter]);
  const availableAdminTransferReciters = useMemo(() => {
    if (!pendingAdminTransfer) {
      return [];
    }

    return data.reciters.filter(
      (reciter) => reciter.id !== pendingAdminTransfer.currentReciterId && reciter.branchId === pendingAdminTransfer.branchId,
    );
  }, [data.reciters, pendingAdminTransfer]);
  const hasAvailableTransferTarget = (branchId: BranchId, currentReciterId: string) => data.reciters.some(
    (reciter) => reciter.id !== currentReciterId && reciter.branchId === branchId,
  );
  const selectedReciterActions = useMemo(() => {
    if (!pendingReciterActions) {
      return null;
    }

    const reciter = data.reciters.find((item) => item.id === pendingReciterActions.reciterId) ?? null;

    if (!reciter) {
      return null;
    }

    const linkedStudents = data.students.filter((student) => reciter.studentIds.includes(student.id));
    const primaryLinkedStudent = linkedStudents[0] ?? null;
    const canTransferSingleStudent = Boolean(
      primaryLinkedStudent &&
      linkedStudents.length === 1 &&
      data.reciters.some((item) => item.id !== reciter.id && item.branchId === primaryLinkedStudent.branchId),
    );

    return {
      reciter,
      linkedStudents,
      primaryLinkedStudent,
      canTransferSingleStudent,
    };
  }, [data.reciters, data.students, pendingReciterActions]);
  const availableReciterStudents = useMemo(
    () =>
      getBranchStudents(data, reciterForm.branchId).filter((student) =>
        !data.reciters.some((reciter) => reciter.id !== editingReciterId && reciter.studentIds.includes(student.id)),
      ),
    [data, editingReciterId, reciterForm.branchId],
  );
  const overallTopStudents = useMemo(
    () =>
      [...data.students].sort(
        (left, right) => right.completedParts.length - left.completedParts.length || left.name.localeCompare(right.name, "ar"),
      ),
    [data.students],
  );
  const courseItems = useMemo(() => {
    const courses = getCourses(data);
    return [...courses].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data]);
  const satisfactionCourseItems = useMemo(
    () => courseItems.filter((course) => course.isPostEnabled),
    [courseItems],
  );

  const handleCourseOrderDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIds = courseItems.map((c) => c.id);
    const oldIdx = currentIds.indexOf(String(active.id));
    const newIdx = currentIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(currentIds, oldIdx, newIdx);
    store.reorderCourses(next);
  }, [courseItems, store]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const selectedReciter = data.reciters.find((reciter) => reciter.id === selectedReciterId) ?? data.reciters[0] ?? null;
  const reciterStudents = selectedReciter ? getAssignedStudents(data, selectedReciter.id) : [];
  const selectedCourse = courseItems.find((course) => course.id === selectedCourseId) ?? courseItems[0] ?? null;
  const selectedSatisfactionCourse = satisfactionCourseItems.find((course) => course.id === satisfactionCourseId) ?? satisfactionCourseItems[0] ?? null;
  const selectedSatisfactionQuestions = selectedSatisfactionCourse
    ? (data.satisfactionQuestions ?? [])
        .filter((question) => question.courseId === selectedSatisfactionCourse.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : [];
  const satisfactionDeleteQuestionOptions = useMemo(() => {
    const seenKeys = new Set<string>();

    return [...(data.satisfactionQuestions ?? [])]
      .sort((left, right) => left.prompt.localeCompare(right.prompt, "ar") || left.createdAt.localeCompare(right.createdAt))
      .filter((question) => {
        const key = getSatisfactionDeleteQuestionKey(question.prompt, question.type);

        if (seenKeys.has(key)) {
          return false;
        }

        seenKeys.add(key);
        return true;
      })
      .map((question) => ({
        key: getSatisfactionDeleteQuestionKey(question.prompt, question.type),
        prompt: question.prompt,
      }));
  }, [data.satisfactionQuestions]);
  const satisfactionDeleteMatchingQuestions = useMemo(
    () => (data.satisfactionQuestions ?? []).filter((question) => getSatisfactionDeleteQuestionKey(question.prompt, question.type) === satisfactionDeleteQuestionKey),
    [data.satisfactionQuestions, satisfactionDeleteQuestionKey],
  );
  const satisfactionDeleteCourseOptions = useMemo(() => {
    const seenCourseIds = new Set<string>();

    return satisfactionDeleteMatchingQuestions
      .map((question) => satisfactionCourseItems.find((course) => course.id === question.courseId) ?? null)
      .filter((course): course is NonNullable<typeof course> => Boolean(course))
      .filter((course) => {
        if (seenCourseIds.has(course.id)) {
          return false;
        }

        seenCourseIds.add(course.id);
        return true;
      });
  }, [satisfactionCourseItems, satisfactionDeleteMatchingQuestions]);
  const pendingDeleteStudentRecord = pendingDeleteStudent
    ? data.students.find((item) => item.id === pendingDeleteStudent.id) ?? null
    : null;
  const pendingDeleteStudentLinkedReciters = pendingDeleteStudentRecord
    ? data.reciters.filter((reciter) => reciter.studentIds.includes(pendingDeleteStudentRecord.id))
    : [];
  const handleDeleteSelectedSatisfactionQuestion = useCallback(async () => {
    if (!satisfactionDeleteQuestionKey) {
      return;
    }

    const questionsToDelete = satisfactionDeleteMatchingQuestions.filter((question) => (
      satisfactionDeleteCourseId === ALL_SATISFACTION_DELETE_COURSES || question.courseId === satisfactionDeleteCourseId
    ));

    if (questionsToDelete.length === 0) {
      return;
    }

    const questionIds = questionsToDelete.map((question) => question.id);
    const removedResponsesCount = (data.satisfactionResponses ?? []).filter((item) => questionIds.includes(item.questionId)).length;
    const primaryQuestion = questionsToDelete[0] ?? null;
    const deletedCoursesCount = new Set(questionsToDelete.map((question) => question.courseId)).size;

    try {
      await store.deleteSatisfactionQuestions(questionIds);
      setSatisfactionDeleteDialogOpen(false);
      setSatisfactionDeleteQuestionKey("");
      setSatisfactionDeleteCourseId(ALL_SATISFACTION_DELETE_COURSES);
      showSuccessToast(
        "تم حذف السؤال",
        primaryQuestion
          ? `تم حذف السؤال "${primaryQuestion.prompt}" من ${deletedCoursesCount === 1 ? "دورة واحدة" : `${deletedCoursesCount} دورات`}${removedResponsesCount > 0 ? ` مع إزالة ${removedResponsesCount} استجابة مرتبطة.` : "."}`
          : "تم حذف السؤال بنجاح.",
      );
      appendActivityLog({ action: "حذف سؤال الاستبيان", target: primaryQuestion?.prompt ?? "سؤال استبيان", status: "نجحت", details: removedResponsesCount > 0 ? `تم حذف السؤال من ${deletedCoursesCount} دورات مع إزالة ${removedResponsesCount} استجابة مرتبطة.` : `تم حذف السؤال من ${deletedCoursesCount} دورات بدون استجابات مرتبطة.` });
    } catch {
      showErrorToast("تعذر حذف سؤال الاستبيان.");
      appendActivityLog({ action: "حذف سؤال الاستبيان", target: primaryQuestion?.prompt ?? "سؤال استبيان", status: "فشلت", details: "فشل حذف سؤال الاستبيان." });
    }
  }, [data.satisfactionResponses, satisfactionDeleteCourseId, satisfactionDeleteMatchingQuestions, satisfactionDeleteQuestionKey, store]);

  useEffect(() => {
    if (!satisfactionDeleteQuestionKey) {
      if (satisfactionDeleteCourseId !== ALL_SATISFACTION_DELETE_COURSES) {
        setSatisfactionDeleteCourseId(ALL_SATISFACTION_DELETE_COURSES);
      }
      return;
    }

    if (satisfactionDeleteCourseId === ALL_SATISFACTION_DELETE_COURSES) {
      return;
    }

    if (!satisfactionDeleteCourseOptions.some((course) => course.id === satisfactionDeleteCourseId)) {
      setSatisfactionDeleteCourseId(satisfactionDeleteCourseOptions[0]?.id ?? ALL_SATISFACTION_DELETE_COURSES);
    }
  }, [satisfactionDeleteCourseId, satisfactionDeleteCourseOptions, satisfactionDeleteQuestionKey]);
  const activeCourse = getActiveCourse(data);
  const indicatorStudents = indicatorsBranchId === "all" ? data.students : getBranchStudents(data, indicatorsBranchId);
  const selectedIndicatorsCourse = indicatorsCourseId === "all"
    ? null
    : courseItems.find((course) => course.id === indicatorsCourseId) ?? null;
  const selectedCourseAttendance = selectedCourse
    ? data.attendance.filter((record) => record.courseId === selectedCourse.id)
    : [];
  const pendingDeleteCourseRecord = pendingDeleteCourse
    ? data.courses.find((item) => item.id === pendingDeleteCourse.id) ?? null
    : null;
  const pendingDeleteCourseSubmissionsCount = pendingDeleteCourse
    ? data.submissions.filter((submission) => submission.courseId === pendingDeleteCourse.id).length
    : 0;
  const pendingDeleteCourseAttendanceCount = pendingDeleteCourse
    ? data.attendance.filter((record) => record.courseId === pendingDeleteCourse.id).length
    : 0;
  const pendingDeleteCourseQuestionsCount = pendingDeleteCourseRecord
    ? pendingDeleteCourseRecord.preQuestions.length + pendingDeleteCourseRecord.postQuestions.length + pendingDeleteCourseRecord.taskQuestions.length
    : 0;
  const pendingDeleteReciterRecord = pendingDeleteReciter
    ? data.reciters.find((item) => item.id === pendingDeleteReciter.id) ?? null
    : null;
  const pendingDeleteReciterStudentsCount = pendingDeleteReciterRecord?.studentIds.length ?? 0;
  const selectedCourseSubmissions = selectedCourse
    ? data.submissions.filter((submission) => submission.courseId === selectedCourse.id)
    : [];
  const isResultsFinalExamSelected = resultsCourseId === FINAL_EXAM_RESULTS_ID;
  const resultsCourse = isResultsFinalExamSelected
    ? null
    : [...courseItems, ...getTasks(data).sort((a, b) => a.sortOrder - b.sortOrder)].find((course) => course.id === resultsCourseId) ?? courseItems[0] ?? null;
  const getAssessmentQuestionsForCourse = (courseId: string, assessmentType: AssessmentType) => {
    const course = data.courses.find((item) => item.id === courseId);

    if (!course) {
      return [] as CourseQuestion[];
    }

    if (assessmentType === "pre") {
      return course.preQuestions;
    }

    if (assessmentType === "post") {
      return course.postQuestions;
    }

    return course.taskQuestions;
  };
  const getLatestSubmissionByLoginId = (courseId: string, assessmentType: AssessmentType) => {
    const latestByLoginId = new Map<string, typeof data.submissions[number]>();

    data.submissions
      .filter((submission) => submission.courseId === courseId && submission.assessmentType === assessmentType)
      .slice()
      .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())
      .forEach((submission) => {
        if (!latestByLoginId.has(submission.loginId)) {
          latestByLoginId.set(submission.loginId, submission);
        }
      });

    return latestByLoginId;
  };
  const getSubmissionGrade = (courseId: string, assessmentType: AssessmentType, submissionId: string) => {
    const submission = data.submissions.find((item) => item.id === submissionId);
    const assessmentQuestions = getAssessmentQuestionsForCourse(courseId, assessmentType);
    const questionTotal = assessmentQuestions.reduce((sum, question) => sum + question.points, 0);

    if (!submission) {
      return { score: 0, total: questionTotal };
    }

    const answersByQuestionId = new Map((submission.answers ?? []).map((answer) => [answer.questionId, answer]));

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
  const resultsStudents = resultsCourse
    ? (resultsBranchId === "all" ? data.students : getBranchStudents(data, resultsBranchId))
    : [];
  const resultsAttendance = resultsCourse
    ? data.attendance.filter((record) => record.courseId === resultsCourse.id)
    : [];
  const notificationTargetBranchId: BranchId | null = managedBranchId ?? (notificationForm.targetBranchId === "all" ? null : notificationForm.targetBranchId);
  const notificationStudentsScope = managedBranchId ?? notificationForm.targetBranchId;
  const notificationTargetStudents = useMemo(() => {
    if (notificationStudentsScope === "all") {
      return data.students;
    }

    return data.students.filter((student) => student.branchId === notificationStudentsScope);
  }, [data.students, notificationStudentsScope]);
  const filteredNotifications = useMemo(() => {
    if (managedBranchId) {
      return data.notifications.filter((notification) => !notification.targetBranchId || notification.targetBranchId === managedBranchId);
    }

    if (!notificationTargetBranchId) {
      return data.notifications;
    }

    return data.notifications.filter((notification) => !notification.targetBranchId || notification.targetBranchId === notificationTargetBranchId);
  }, [data.notifications, managedBranchId, notificationTargetBranchId]);
  const allNotificationTargetStudentsSelected = notificationTargetStudents.length > 0
    && notificationTargetStudents.every((student) => notificationForm.targetLoginIds.includes(student.loginId));
  const latestAttendanceByLoginId = useMemo(() => {
    const latestByLoginId = new Map<string, AttendanceRecord>();

    resultsAttendance
      .slice()
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .forEach((record) => {
        if (!latestByLoginId.has(record.loginId)) {
          latestByLoginId.set(record.loginId, record);
        }
      });

    return latestByLoginId;
  }, [resultsAttendance]);
  const presentLoginIds = new Set(resultsAttendance.map((record) => record.loginId));
  const presentStudents = resultsStudents.filter((student) => presentLoginIds.has(student.loginId));
  const absentStudents = resultsStudents.filter((student) => !presentLoginIds.has(student.loginId));

  // Count absences per student across ALL courses (post window expired + no attendance record)
  const studentAbsenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const course of courseItems) {
      if (course.entityType === "task") continue;
      const coursePresent = new Set(
        data.attendance.filter((r) => r.courseId === course.id).map((r) => r.loginId),
      );
      for (const student of data.students) {
        const branchDeadline = course.assessmentWindows[student.branchId]?.post;
        const globalDeadline = course.assessmentWindows.global?.post;
        const postDeadline = branchDeadline ?? globalDeadline;
        if (!postDeadline) continue;
        if (new Date(postDeadline) > new Date()) continue; // window not closed yet
        if (!coursePresent.has(student.loginId)) {
          counts.set(student.loginId, (counts.get(student.loginId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [courseItems, data.attendance, data.students]);

  const frequentAbsentStudents = resultsStudents.filter(
    (student) => (studentAbsenceCounts.get(student.loginId) ?? 0) >= 3,
  );

  const filteredAttendanceStudents = resultsAttendanceFilter === "present"
    ? presentStudents
    : resultsAttendanceFilter === "absent"
      ? absentStudents
      : resultsAttendanceFilter === "frequent-absent"
        ? frequentAbsentStudents
        : resultsStudents;
  const detailsSubmission = data.submissions.find((submission) => submission.id === detailsSubmissionId) ?? null;
  const finalExamDetailsSubmission = data.finalExamSubmissions.find((submission) => submission.id === finalExamDetailsSubmissionId) ?? null;
  const isPreviewImage = previewAttachment?.type?.startsWith("image/") || previewAttachment?.dataUrl.startsWith("data:image/");
  const isPreviewPdf = previewAttachment?.type === "application/pdf" || previewAttachment?.dataUrl.startsWith("data:application/pdf");
  const isPreviewVideo = previewAttachment?.type?.startsWith("video/") || previewAttachment?.dataUrl.startsWith("data:video/");
  const previewPdfSrc = previewAttachment && isPreviewPdf
    ? `${previewAttachment.dataUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`
    : undefined;
  const statisticsCourse = activeCourse ?? courseItems[0] ?? null;

  useEffect(() => {
    if (managedBranchId) {
      setSelectedBranch(managedBranchId);
      setReciterBranchFilter(managedBranchId);
      setStudentForm((current) => ({ ...current, branchId: managedBranchId }));
      setReciterForm((current) => ({ ...current, branchId: managedBranchId }));
    }
  }, [managedBranchId]);

  useEffect(() => {
    const isCurrentTabAvailable = dashboardTab === "home"
      ? true
      : dashboardTab === "activity"
      ? canViewActivityLog
      : availableDashboardMenu.some((item) => item.id === dashboardTab);

    if (!isCurrentTabAvailable) {
      setDashboardTab(availableDashboardMenu[0]?.id ?? "home", { replace: true });
    }
  }, [availableDashboardMenu, canViewActivityLog, dashboardTab, setDashboardTab]);

  useEffect(() => {
    if (courseItems.length === 0) {
      if (courseIndicatorsCourseId) {
        setCourseIndicatorsCourseId("");
      }
      return;
    }

    if (courseIndicatorsCourseId !== ALL_COURSE_INDICATORS_ID && !courseItems.some((course) => course.id === courseIndicatorsCourseId)) {
      setCourseIndicatorsCourseId(courseItems[0].id);
    }
  }, [courseIndicatorsCourseId, courseItems]);

  const loadStudentIntoForm = (studentId: string) => {
    const student = data.students.find((item) => item.id === studentId);

    if (!student) {
      return false;
    }

    if (managedBranchId && student.branchId !== managedBranchId) {
      return false;
    }

    setEditingStudentId(student.id);
    setStudentForm({
      name: student.name,
      loginId: student.loginId,
      branchId: student.branchId,
      note: student.note,
    });
    return true;
  };

  const openStudentEditor = (studentId?: string) => {
    setStudentError("");
    setStudentManagerMode(false);
    setStudentManagerEntityType("student");
    setStudentsOpen(true);

    if (!studentId) {
      setEditingStudentId(null);
      setStudentEntryMode("single");
      setBulkStudents([]);
      setBulkStudentFileName("");
      setStudentForm({ ...emptyStudentForm, branchId: managedBranchId ?? emptyStudentForm.branchId });
      return;
    }

    loadStudentIntoForm(studentId);
  };

  const openStudentManager = () => {
    const initialBranch = managedBranchId ?? (indicatorsBranchId !== "all" ? indicatorsBranchId : "male");
    setStudentError("");
    setStudentManagerMode(true);
    setStudentManagerEntityType("student");
    setStudentsOpen(true);
    setStudentEntryMode("single");
    setBulkStudents([]);
    setBulkStudentFileName("");
    setEditingStudentId(null);
    setEditingReciterId(null);
    setStudentPickerBranchId(initialBranch as BranchId);
    setStudentPickerStudentId("");
    setStudentPickerReciterId("");
    setStudentTransferTargetReciterId("");
    setStudentForm({ ...emptyStudentForm, branchId: initialBranch as BranchId });
  };

  const loadReciterIntoForm = (reciterId: string) => {
    const reciter = data.reciters.find((item) => item.id === reciterId);

    if (!reciter) {
      return false;
    }

    if (managedBranchId && reciter.branchId !== managedBranchId) {
      return false;
    }

    setEditingReciterId(reciter.id);
    setReciterForm({
      name: reciter.name,
      branchId: reciter.branchId,
      studentIds: [...reciter.studentIds],
      loginCode: reciter.loginCode,
    });
    return true;
  };

  const openEntityManager = (entityType: "student" | "reciter", entityId?: string) => {
    const initialBranch = managedBranchId ?? (indicatorsBranchId !== "all" ? indicatorsBranchId : "male");
    setStudentError("");
    setStudentManagerMode(true);
    setStudentManagerEntityType(entityType);
    setStudentsOpen(true);
    setStudentEntryMode("single");
    setBulkStudents([]);
    setBulkStudentFileName("");
    setEditingStudentId(null);
    setEditingReciterId(null);
    setStudentPickerBranchId(initialBranch as BranchId);
    setStudentPickerStudentId("");
    setStudentPickerReciterId("");
    setStudentTransferTargetReciterId("");
    setStudentForm({ ...emptyStudentForm, branchId: initialBranch as BranchId });
    setReciterForm({ ...emptyReciterForm, branchId: initialBranch as BranchId });

    if (!entityId) {
      return;
    }

    if (entityType === "student") {
      setStudentPickerStudentId(entityId);
      loadStudentIntoForm(entityId);
      return;
    }

    setStudentPickerReciterId(entityId);
    loadReciterIntoForm(entityId);
  };

  const openUnifiedCreateDialog = (entityType: "student" | "reciter") => {
    const initialBranch = managedBranchId ?? (indicatorsBranchId !== "all" ? indicatorsBranchId : "male");
    setStudentError("");
    setStudentManagerMode(false);
    setStudentManagerEntityType(entityType);
    setStudentsOpen(true);
    setStudentEntryMode("single");
    setBulkStudents([]);
    setBulkStudentFileName("");
    setEditingStudentId(null);
    setEditingReciterId(null);
    setStudentPickerBranchId(initialBranch as BranchId);
    setStudentPickerStudentId("");
    setStudentPickerReciterId("");
    setStudentTransferTargetReciterId("");
    setStudentForm({ ...emptyStudentForm, branchId: initialBranch as BranchId });
    setReciterForm({ ...emptyReciterForm, branchId: initialBranch as BranchId });
  };

  const resetStudentForm = () => {
    setEditingStudentId(null);
    setEditingReciterId(null);
    setStudentEntryMode("single");
    setBulkStudents([]);
    setBulkStudentFileName("");
    setStudentManagerMode(false);
    setStudentManagerEntityType("student");
    setStudentPickerStudentId("");
    setStudentPickerReciterId("");
    setStudentTransferTargetReciterId("");
    setStudentError("");
    setStudentForm({ ...emptyStudentForm, branchId: managedBranchId ?? emptyStudentForm.branchId });
    setReciterForm({ ...emptyReciterForm, branchId: managedBranchId ?? effectiveReciterBranchFilter });
  };

  const downloadSubmissionAsPdf = async (submission: typeof detailsSubmission, course: typeof data.courses[0] | null) => {
    if (!submission || !course) return;
    
    const htmlContent = submission.answers?.[0]?.value || "<p>لا يوجد محتوى</p>";
    const fileName = `${submission.studentName}/${course.title}.pdf`.replace(/\s+/g, "_");
    
    const element = document.createElement("div");
    element.innerHTML = htmlContent;
    element.style.padding = "20px";
    element.style.fontFamily = "Tajawal, Arial, sans-serif";
    element.style.direction = "rtl";
    
    const opt = {
      margin: 10,
      filename: fileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: "p", unit: "mm", format: "a4" }
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html2pdf = (window as any).html2pdf;
    if (html2pdf) {
      html2pdf().set(opt).from(element).save();
    }
  };

  const handleExportSatisfactionIndicatorsPdf = async (fileLabel: string) => {
    const element = satisfactionIndicatorsExportRef.current;
    if (!element) return;

    const fileName = `مؤشرات_الاستبيان_${fileLabel}`.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
    const opt = {
      margin: 8,
      filename: `${fileName}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { orientation: "p", unit: "mm", format: "a4" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html2pdf = (window as any).html2pdf;
    if (html2pdf) {
      await html2pdf().set(opt).from(element).save();
    }
  };

  const buildBackupPayload = (sourceData: DashboardData, exportedAt: string) => ({
    version: 1,
    exportedAt,
    app: "momars",
    type: "dashboard-backup",
    data: {
      roles: sourceData.roles,
      branches: sourceData.branches,
      students: sourceData.students,
      reciters: sourceData.reciters,
      courses: sourceData.courses,
      taskTemplates: sourceData.taskTemplates,
      attendance: sourceData.attendance,
      notifications: sourceData.notifications,
      submissions: sourceData.submissions,
      satisfactionQuestions: sourceData.satisfactionQuestions ?? [],
      satisfactionResponses: sourceData.satisfactionResponses ?? [],
      finalExamQuestions: sourceData.finalExamQuestions,
      finalExamSubmissions: sourceData.finalExamSubmissions,
      finalExamSettings: sourceData.finalExamSettings,
      rolePermissions: sourceData.rolePermissions,
    },
    indicators: {
      filters: {
        homeBranchFilter,
        homeCourseFilter,
        indicatorsBranchId,
        indicatorsCourseId,
        indicatorsSortOrder,
        courseIndicatorsBranch,
        courseIndicatorsCourseId,
      },
      home: homeMetrics,
      students: indicatorMetrics,
      courseIndicators: courseIndicatorsMetrics,
    },
  });

  const downloadBackupPayload = (payload: ReturnType<typeof buildBackupPayload>, fileName: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getBackupPrimaryRecordsCount = (backup: DashboardData) => (
    backup.students.length
    + backup.reciters.length
    + backup.courses.length
    + backup.taskTemplates.length
    + backup.submissions.length
    + backup.attendance.length
    + backup.notifications.length
    + backup.finalExamQuestions.length
    + backup.finalExamSubmissions.length
  );

  const handleExportBackup = () => {
    if (backupRestoreProgress?.isActive) {
      showErrorToast("الاسترجاع قيد التنفيذ حاليًا. انتظر حتى يكتمل ثم أعد المحاولة.");
      return;
    }

    if (!hasPermission("backup_export")) {
      showErrorToast("ليست لديك صلاحية تصدير النسخة الاحتياطية.");
      return;
    }

    try {
      const exportedAt = new Date().toISOString();
      const backupPayload = buildBackupPayload(data, exportedAt);

      const fileName = createBackupFileName(exportedAt);
      downloadBackupPayload(backupPayload, fileName);

      showSuccessToast("تم تصدير النسخة الاحتياطية", "تم تنزيل ملف JSON يشمل البيانات والمؤشرات الحالية.");
    } catch {}
  };

  const processBackupImportFile = async (file: File) => {
    if (backupRestoreProgress?.isActive) {
      showErrorToast("الاسترجاع قيد التنفيذ حاليًا. انتظر حتى يكتمل ثم أعد المحاولة.");
      return;
    }

    if (!hasPermission("backup_import")) {
      showErrorToast("ليست لديك صلاحية رفع النسخة الاحتياطية.");
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        type?: string;
        exportedAt?: string;
        data?: {
          roles?: unknown[];
          branches?: unknown[];
          students?: unknown[];
          reciters?: unknown[];
          courses?: unknown[];
          taskTemplates?: unknown[];
          attendance?: unknown[];
          notifications?: unknown[];
          submissions?: unknown[];
          satisfactionQuestions?: unknown[];
          satisfactionResponses?: unknown[];
          finalExamQuestions?: unknown[];
          finalExamSubmissions?: unknown[];
          finalExamSettings?: unknown;
          rolePermissions?: unknown;
        };
        indicators?: unknown;
      };

      if (parsed.type !== "dashboard-backup" || !parsed.data || typeof parsed.data !== "object") {
        throw new Error("invalid-backup-structure");
      }

      const normalizedBackupData: DashboardData = {
        roles: Array.isArray(parsed.data?.roles) ? parsed.data.roles as DashboardData["roles"] : data.roles,
        branches: Array.isArray(parsed.data?.branches) ? parsed.data.branches as DashboardData["branches"] : data.branches,
        students: Array.isArray(parsed.data?.students) ? parsed.data.students as DashboardData["students"] : [],
        reciters: Array.isArray(parsed.data?.reciters) ? parsed.data.reciters as DashboardData["reciters"] : [],
        courses: Array.isArray(parsed.data?.courses) ? parsed.data.courses as DashboardData["courses"] : [],
        taskTemplates: Array.isArray(parsed.data?.taskTemplates) ? parsed.data.taskTemplates as DashboardData["taskTemplates"] : [],
        submissions: Array.isArray(parsed.data?.submissions) ? parsed.data.submissions as DashboardData["submissions"] : [],
        attendance: Array.isArray(parsed.data?.attendance) ? parsed.data.attendance as DashboardData["attendance"] : [],
        notifications: Array.isArray(parsed.data?.notifications) ? parsed.data.notifications as DashboardData["notifications"] : [],
        satisfactionQuestions: Array.isArray(parsed.data?.satisfactionQuestions) ? parsed.data.satisfactionQuestions as DashboardData["satisfactionQuestions"] : [],
        satisfactionResponses: Array.isArray(parsed.data?.satisfactionResponses) ? parsed.data.satisfactionResponses as DashboardData["satisfactionResponses"] : [],
        finalExamQuestions: Array.isArray(parsed.data?.finalExamQuestions) ? parsed.data.finalExamQuestions as DashboardData["finalExamQuestions"] : [],
        finalExamSubmissions: Array.isArray(parsed.data?.finalExamSubmissions) ? parsed.data.finalExamSubmissions as DashboardData["finalExamSubmissions"] : [],
        finalExamSettings: (parsed.data?.finalExamSettings as DashboardData["finalExamSettings"] | undefined) ?? { male: { isEnabled: false, closesAt: null }, female: { isEnabled: false, closesAt: null } },
        rolePermissions: (parsed.data?.rolePermissions as DashboardData["rolePermissions"] | undefined) ?? {},
      };

      if (getBackupPrimaryRecordsCount(normalizedBackupData) === 0) {
        throw new Error("empty-backup");
      }

      setPendingBackupData(normalizedBackupData);

      setImportedBackupSummary({
        fileName: file.name,
        exportedAt: parsed.exportedAt ?? "غير معروف",
        rolesCount: parsed.data?.roles?.length ?? 0,
        branchesCount: parsed.data?.branches?.length ?? 0,
        studentsCount: parsed.data?.students?.length ?? 0,
        recitersCount: parsed.data?.reciters?.length ?? 0,
        coursesCount: parsed.data?.courses?.length ?? 0,
        taskTemplatesCount: parsed.data?.taskTemplates?.length ?? 0,
        attendanceCount: parsed.data?.attendance?.length ?? 0,
        notificationsCount: parsed.data?.notifications?.length ?? 0,
        submissionsCount: parsed.data?.submissions?.length ?? 0,
        finalExamQuestionsCount: parsed.data?.finalExamQuestions?.length ?? 0,
        finalExamSubmissionsCount: parsed.data?.finalExamSubmissions?.length ?? 0,
        hasFinalExamSettings: Boolean(parsed.data?.finalExamSettings),
        hasRolePermissions: Boolean(parsed.data?.rolePermissions),
        hasIndicators: Boolean(parsed.indicators),
      });
      showSuccessToast("تم رفع ملف النسخة", "تمت قراءة ملف النسخة الاحتياطية وعرض ملخصه.");
    } catch {
      setPendingBackupData(null);
      setImportedBackupSummary(null);
    }
  };

  const handleRestoreBackup = async () => {
    if (!pendingBackupData || !importedBackupSummary) {
      return;
    }

    if (backupRestoreProgress?.isActive) {
      setBackupDialogOpen(true);
      return;
    }

    if (!hasPermission("backup_restore")) {
      showErrorToast("ليست لديك صلاحية استرجاع النسخة الاحتياطية.");
      return;
    }

    const startedAt = new Date().toISOString();
    setBackupRestoreProgress({
      isActive: true,
      percent: 0,
      message: "بدء الاسترجاع",
      fileName: importedBackupSummary.fileName,
      startedAt,
      updatedAt: startedAt,
    });
    setBackupRestoreRunning(true);
    try {
      const rescueExportedAt = new Date().toISOString();
      const rescueFileName = createBackupFileName(rescueExportedAt, "نسخة_إنقاذ_رخصة_ممارس_قبل_الاسترجاع");
      downloadBackupPayload(buildBackupPayload(data, rescueExportedAt), rescueFileName);

      await store.restoreBackupData(pendingBackupData, (progress) => {
        setBackupRestoreProgress((current) => ({
          isActive: true,
          percent: progress.percent,
          message: progress.message,
          fileName: current?.fileName ?? importedBackupSummary.fileName,
          startedAt: current?.startedAt ?? startedAt,
          updatedAt: new Date().toISOString(),
        }));
      });
      setBackupRestoreConfirmOpen(false);
      setBackupDialogOpen(false);
      setPendingBackupData(null);
      setImportedBackupSummary(null);
      setBackupRestoreProgress(null);
      showSuccessToast("تم استرجاع النسخة", `تم استبدال البيانات الحالية بالنسخة الاحتياطية بنجاح، وتم تنزيل نسخة إنقاذ مسبقة باسم ${rescueFileName}.`);
    } catch {
      setBackupRestoreProgress(null);
    } finally {
      setBackupRestoreRunning(false);
    }
  };

  const handleDeleteCurrentBackupData = async () => {
    if (backupRestoreProgress?.isActive || backupDeleteRunning) {
      return;
    }

    if (!hasPermission("backup_restore")) {
      showErrorToast("ليست لديك صلاحية حذف البيانات الحالية.");
      return;
    }

    setBackupDeleteRunning(true);

    try {
      await store.clearAllData();
      setPendingBackupData(null);
      setImportedBackupSummary(null);
      setPendingBackupImportFile(null);
      setBackupRestoreConfirmOpen(false);
      setBackupDeleteConfirmOpen(false);
      setBackupDialogOpen(false);
      showSuccessToast("تم حذف البيانات الحالية", "تم حذف جميع البيانات الحالية من النظام بنجاح.");
    } catch {
    } finally {
      setBackupDeleteRunning(false);
    }
  };

  const handleBackupImportSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasPermission("backup_import")) {
      event.target.value = "";
      showErrorToast("ليست لديك صلاحية رفع النسخة الاحتياطية.");
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setPendingBackupImportFile(file);
    setBackupImportConfirmOpen(true);
  };

  const applyBranchToBulkStudents = (branchId: BranchId) => {
    setBulkStudents((current) => current.map((row) => ({ ...row, branchId })));
  };

  const handleBulkStudentFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

    if (isPdf) {
      try {
        const existingLoginIds = data.students.map((s) => s.loginId).filter(Boolean);
        const extracted = await extractStudentsFromPdf(file, existingLoginIds);
        if (extracted.length === 0) {
          setStudentError("لم يتم العثور على أسماء داخل ملف PDF.");
          setBulkStudents([]);
          setBulkStudentFileName("");
          event.target.value = "";
          return;
        }
        const parsedRows: BulkStudentRow[] = extracted.map((s, i) => ({
          id: `bulk-student-${i}-${s.loginId || s.name}`,
          name: s.name,
          loginId: s.loginId,
          branchId: managedBranchId ?? "male",
        }));
        setBulkStudents(parsedRows);
        setBulkStudentFileName(file.name);
        setStudentError("");
        setStudentEntryMode("bulk");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "";
        setStudentError(msg ? `تعذر قراءة ملف PDF (${msg}).` : "تعذر قراءة ملف PDF.");
        setBulkStudents([]);
        setBulkStudentFileName("");
      } finally {
        event.target.value = "";
      }
      return;
    }

    try {
      const sheets = await loadSpreadsheetSheets(file);
      let parsedRows: BulkStudentRow[] = [];

      for (const rows of sheets) {
        const candidateRows = parseBulkStudentsFromWorksheet(rows, managedBranchId ?? "male");

        if (candidateRows.length > 0) {
          parsedRows = candidateRows;
          break;
        }
      }

      if (parsedRows.length === 0) {
        setStudentError("لم يتم العثور على صفوف صالحة داخل الملف.");
        setBulkStudents([]);
        setBulkStudentFileName("");
        return;
      }

      setBulkStudents(parsedRows);
      setBulkStudentFileName(file.name);
      setStudentError("");
      setStudentEntryMode("bulk");
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : "";
      const errorMessage = rawErrorMessage.toLowerCase();

      if (errorMessage.includes("password") || errorMessage.includes("encrypted")) {
        setStudentError("الملف محمي بكلمة مرور. احفظه بدون حماية ثم أعد الرفع.");
      } else if (errorMessage.includes("legacy-xls-unsupported")) {
        setStudentError("صيغة .xls القديمة غير مدعومة. احفظ الملف كـ .xlsx أو .csv ثم أعد الرفع.");
      } else {
        setStudentError(rawErrorMessage
          ? `تعذر قراءة ملف الإكسل (${rawErrorMessage}). جرّب حفظه كـ .xlsx أو .csv ثم ارفعه مرة أخرى.`
          : "تعذر قراءة ملف الإكسل. جرّب حفظه كـ .xlsx أو .csv ثم ارفعه مرة أخرى.");
      }

      setBulkStudents([]);
      setBulkStudentFileName("");
    } finally {
      event.target.value = "";
    }
  };

  const handleSaveBulkStudents = async () => {
    const normalizedRows = bulkStudents.map((row) => ({
      ...row,
      name: row.name.trim(),
      loginId: row.loginId.trim(),
      branchId: managedBranchId ?? row.branchId,
    }));

    if (normalizedRows.length === 0) {
      setStudentError("ارفع ملف إكسل أو أدخل صفوفًا صالحة أولًا.");
      return;
    }

    const incompleteNameIndex = normalizedRows.findIndex((row) => !row.name);

    if (incompleteNameIndex >= 0) {
      setStudentError(`أكمل اسم الطالب في الصف ${incompleteNameIndex + 1}.`);
      return;
    }

    const incompleteLoginIndex = normalizedRows.findIndex((row) => !row.loginId);

    if (incompleteLoginIndex >= 0) {
      setStudentError(`أكمل رقم الدخول في الصف ${incompleteLoginIndex + 1}.`);
      return;
    }

    const seenLoginIds = new Set<string>();

    for (const [index, row] of normalizedRows.entries()) {
      if (!row.loginId) continue;
      const normalizedLoginId = row.loginId.toLowerCase();

      if (seenLoginIds.has(normalizedLoginId)) {
        setStudentError(`رقم الدخول مكرر داخل الملف في الصف ${index + 1}.`);
        return;
      }

      seenLoginIds.add(normalizedLoginId);

      if (data.students.some((student) => student.loginId.toLowerCase() === normalizedLoginId)) {
        setStudentError(`رقم الدخول ${row.loginId} مستخدم مسبقًا.`);
        return;
      }
    }

    try {
      for (const row of normalizedRows) {
        await store.addStudent({
          name: row.name,
          loginId: row.loginId,
          branchId: row.branchId,
          note: "",
        });
      }

      resetStudentForm();
      setStudentsOpen(false);
    } catch (error) {
      setStudentError(getSupabaseErrorMessage(error, "تعذر حفظ بعض الطلاب من ملف الإكسل."));
    }
  };

  const resetAdminForm = () => {
    setAdminForm({ ...emptyAdminForm });
    setAdminError("");
    setAdminSubmitting(false);
  };

  const resetNotificationForm = () => {
    setNotificationForm({ ...emptyNotificationForm, targetBranchId: managedBranchId ?? "all" });
    setNotificationError("");
    setNotificationSubmitting(false);
  };

  const loadAdmins = async () => {
    setAdminsLoading(true);

    try {
      const admins = await getDashboardAccountsFromDatabase();
      setAdminsList(admins);
    } catch (error) {
      setAdminError(getSupabaseErrorMessage(error, "تعذر تحميل المشرفين."));
    } finally {
      setAdminsLoading(false);
    }
  };

  const handleOpenAdmins = async () => {
    if (!canManageDashboardAccounts) {
      return;
    }

    resetAdminForm();
    await loadAdmins();
    setAdminsOpen(true);
  };

  useEffect(() => {
    if (!notificationTargetBranchId) {
      setNotificationForm((current) => ({ ...current, targetLoginIds: [] }));
      return;
    }

    setNotificationForm((current) => {
      const nextLoginIds = notificationTargetStudents.map((student) => student.loginId);
      const currentSelectedInBranch = current.targetLoginIds.filter((loginId) => nextLoginIds.includes(loginId));

      if (currentSelectedInBranch.length > 0) {
        return { ...current, targetLoginIds: currentSelectedInBranch };
      }

      return { ...current, targetLoginIds: nextLoginIds };
    });
  }, [notificationTargetBranchId, notificationTargetStudents]);

  const handleSaveNotification = async () => {
    const trimmedMessage = notificationForm.message.trim();

    if (!trimmedMessage) {
      setNotificationError("أدخل نص الشعار أولًا.");
      return;
    }

    if (notificationTargetBranchId && notificationTargetStudents.length > 0 && notificationForm.targetLoginIds.length === 0) {
      setNotificationError("حدد طالبًا واحدًا على الأقل أو استخدم تحديد الكل.");
      return;
    }

    setNotificationSubmitting(true);
    setNotificationError("");

    const normalizedTargetLoginIds = notificationTargetBranchId && notificationTargetStudents.length > 0 && notificationForm.targetLoginIds.length < notificationTargetStudents.length
      ? notificationForm.targetLoginIds
      : [];

    // Resolve actual push recipients: specific selection, branch-all, or global-all
    const pushTargetLoginCodes = normalizedTargetLoginIds.length > 0
      ? normalizedTargetLoginIds
      : notificationTargetStudents.map((s) => s.loginId);

    try {
      await store.addNotification({
        title: "إشعار",
        message: trimmedMessage,
        targetBranchId: notificationTargetBranchId,
        targetLoginIds: normalizedTargetLoginIds,
        createdByName: session.name,
        createdByRole: session.role,
      });
      sendPushNotification("إشعار", trimmedMessage, pushTargetLoginCodes);
      resetNotificationForm();
    } catch (error) {
      setNotificationError(getSupabaseErrorMessage(error, "تعذر إرسال الإشعار داخل التطبيق."));
      setNotificationSubmitting(false);
    }
  };

  const openReciterEditor = (reciterId?: string) => {
    setReciterError("");
    setRecitersOpen(true);

    if (!reciterId) {
      setEditingReciterId(null);
      setReciterForm({ ...emptyReciterForm, branchId: managedBranchId ?? effectiveReciterBranchFilter });
      return;
    }

    const reciter = data.reciters.find((item) => item.id === reciterId);

    if (!reciter) {
      return;
    }

    if (managedBranchId && reciter.branchId !== managedBranchId) {
      return;
    }

    setEditingReciterId(reciter.id);
    setReciterForm({
      name: reciter.name,
      branchId: reciter.branchId,
      studentIds: [...reciter.studentIds],
      loginCode: reciter.loginCode,
    });
  };

  const resetReciterForm = () => {
    setEditingReciterId(null);
    setReciterError("");
    setReciterForm({ ...emptyReciterForm, branchId: managedBranchId ?? effectiveReciterBranchFilter });
  };

  const handleSaveStudent = async () => {
    const trimmedName = studentForm.name.trim();
    const trimmedLoginId = studentForm.loginId.trim();

    if (!trimmedName || !trimmedLoginId) {
      setStudentError("أدخل اسم الطالب ورقم الدخول.");
      return;
    }

    const duplicate = data.students.find((student) => student.loginId === trimmedLoginId && student.id !== editingStudentId);

    if (duplicate) {
      setStudentError("رقم الدخول مستخدم لطالب آخر. الطالب يضاف مرة واحدة فقط.");
      return;
    }

    if (managedBranchId && studentForm.branchId !== managedBranchId) {
      setStudentError("يمكنك إدارة طلاب فرعك فقط.");
      return;
    }

    if (editingStudentId) {
      try {
        await store.updateStudent(editingStudentId, {
          name: trimmedName,
          loginId: trimmedLoginId,
          branchId: studentForm.branchId,
          note: studentForm.note.trim(),
        });
        resetStudentForm();
        setStudentsOpen(false);
      } catch (error) {
        setStudentError(getSupabaseErrorMessage(error, "تعذر تعديل بيانات الطالب في قاعدة البيانات."));
      }
    } else {
      try {
        await store.addStudent({
          name: trimmedName,
          loginId: trimmedLoginId,
          branchId: studentForm.branchId,
          note: studentForm.note.trim(),
        });
        resetStudentForm();
        setStudentsOpen(false);
      } catch (error) {
        setStudentError(getSupabaseErrorMessage(error, "تعذر حفظ الطالب في قاعدة البيانات."));
      }
    }
  };

  const handleDeleteStudent = (studentId: string) => {
    const student = data.students.find((item) => item.id === studentId);

    if (!student) {
      return;
    }

    setPendingDeleteStudent({ id: student.id, name: student.name });
  };

  const confirmDeleteStudent = async () => {
    if (!pendingDeleteStudent) {
      return;
    }

    try {
      await store.deleteStudent(pendingDeleteStudent.id);
      if (editingStudentId === pendingDeleteStudent.id) {
        resetStudentForm();
      }
      showSuccessToast("تم حذف الطالب", `تم حذف ${pendingDeleteStudent.name} من قائمة الطلاب بنجاح.`);
      appendActivityLog({ action: "حذف طالب", target: pendingDeleteStudent.name, status: "نجحت", details: "تم حذف الطالب من النظام." });
      setPendingDeleteStudent(null);
    } catch (error) {
      setStudentError(getSupabaseErrorMessage(error, "تعذر حذف الطالب من قاعدة البيانات."));
      showErrorToast("تعذر حذف الطالب من قاعدة البيانات.");
      appendActivityLog({ action: "حذف طالب", target: pendingDeleteStudent.name, status: "فشلت", details: "فشل حذف الطالب من قاعدة البيانات." });
    }
  };

  const handleSaveReciter = async () => {
    const trimmedName = reciterForm.name.trim();
    const trimmedLoginCode = reciterForm.loginCode.trim();
    const selectedStudentIds = [...new Set(reciterForm.studentIds)];

    if (!trimmedName || !trimmedLoginCode) {
      setReciterError("أكمل اسم المقرئ والفرع ورقم الدخول.");
      return;
    }

    const duplicateReciterCode = data.reciters.find(
      (reciter) => reciter.loginCode === trimmedLoginCode && reciter.id !== editingReciterId,
    );

    if (duplicateReciterCode) {
      setReciterError("رقم دخول المقرئ مستخدم مسبقًا.");
      return;
    }

    const selectedStudents = selectedStudentIds
      .map((studentId) => data.students.find((student) => student.id === studentId) ?? null)
      .filter((student): student is NonNullable<typeof student> => Boolean(student));

    if (selectedStudents.length !== selectedStudentIds.length || selectedStudents.some((student) => student.branchId !== reciterForm.branchId)) {
      setReciterError("اختر الطلاب من نفس الفرع المحدد.");
      return;
    }

    if (managedBranchId && reciterForm.branchId !== managedBranchId) {
      setReciterError("يمكنك إدارة مقرئي فرعك فقط.");
      return;
    }

    const duplicateLinkedStudent = data.reciters.find((reciter) =>
      reciter.id !== editingReciterId && selectedStudentIds.some((studentId) => reciter.studentIds.includes(studentId)),
    );

    if (duplicateLinkedStudent) {
      setReciterError("أحد الطلاب المختارين مرتبط بمقرئ آخر بالفعل.");
      return;
    }

    const reciterPayload = {
      name: trimmedName,
      branchId: reciterForm.branchId,
      studentIds: selectedStudentIds,
      loginCode: trimmedLoginCode,
    };

    const currentReciter = editingReciterId
      ? data.reciters.find((reciter) => reciter.id === editingReciterId) ?? null
      : null;

    setReciterSubmitting(true);

    try {
      await saveReciterToDatabase({
        currentLoginCode: currentReciter?.loginCode,
        name: trimmedName,
        branchId: reciterForm.branchId,
        loginCode: trimmedLoginCode,
        linkedStudents: selectedStudents.map((student) => ({
          name: student.name,
          loginId: student.loginId,
          branchId: student.branchId,
          note: student.note,
          completedParts: student.completedParts,
        })),
      });

      if (editingReciterId) {
        store.updateReciter(editingReciterId, reciterPayload);
      } else {
        store.addReciter(reciterPayload);
      }

      resetReciterForm();
      setRecitersOpen(false);
    } catch (error) {
      setReciterError(getSupabaseErrorMessage(error, "تعذر حفظ المقرئ في قاعدة البيانات."));
    } finally {
      setReciterSubmitting(false);
    }
  };

  const handleSaveAdmin = async () => {
    const trimmedName = adminForm.name.trim();
    const trimmedLoginCode = adminForm.loginCode.trim();

    if (!trimmedName || !trimmedLoginCode) {
      setAdminError("أدخل اسم المشرف ورقم الدخول.");
      return;
    }

    setAdminSubmitting(true);
    setAdminError("");

    try {
      await addDashboardAccountToDatabase({
        name: trimmedName,
        loginCode: trimmedLoginCode,
        role: adminForm.role,
      });

      resetAdminForm();
      await loadAdmins();
    } catch (error) {
      setAdminError(getSupabaseErrorMessage(error, "تعذر حفظ الحساب الإشرافي في قاعدة البيانات."));
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    const admin = adminsList.find((item) => item.id === adminId);

    if (!admin || admin.loginCode === session?.loginCode) {
      return;
    }

    setAdminDeletingId(adminId);
    setAdminError("");

    try {
      await deleteDashboardAccountFromDatabase(adminId);
      await loadAdmins();
    } catch (error) {
      setAdminError(getSupabaseErrorMessage(error, "تعذر حذف الحساب الإشرافي من قاعدة البيانات."));
    } finally {
      setAdminDeletingId(null);
    }
  };

  const handleToggleCourseActivation = async (courseId: string) => {
    if (!canCreateCourses) {
      return;
    }

    const course = data.courses.find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    setCourseError("");

    if (course.isActive) {
      try {
        await store.deactivateAllCourses();
      } catch (error) {
        setCourseError(getSupabaseErrorMessage(error, "تعذر تحديث حالة الدورة في قاعدة البيانات."));
      }
      return;
    }

    try {
      await store.activateCourse(course.id);
    } catch (error) {
      setCourseError(getSupabaseErrorMessage(error, "تعذر تحديث حالة الدورة في قاعدة البيانات."));
    }
  };

  const resetAssessmentAvailabilityDialog = () => {
    setPendingAssessmentAvailability(null);
    setAssessmentDurationMinutes("30");
    setAssessmentNoTimeLimit(false);
    setAssessmentTemplateDraft("");
    setAssessmentTargetBranch(null);
    setAssessmentBlockedBranch(null);
    setAssessmentRestrictToBranchOnly(false);
    setAssessmentAvailabilityError("");
    setAssessmentTemplateOpen(false);
  };

  const handleOpenAssessmentAvailabilityDialog = (courseId: string, assessmentType: AssessmentType) => {
    const course = data.courses.find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    setPendingAssessmentAvailability({ courseId, assessmentType });
    setAssessmentDurationMinutes("30");
    setAssessmentTargetBranch(managedBranchId ?? "all");
    setAssessmentBlockedBranch(null);
    setAssessmentRestrictToBranchOnly(false);
    setAssessmentTemplateDraft(
      course.assessmentNotificationTemplates[assessmentType] || getDefaultAssessmentNotificationTemplate(assessmentType),
    );
    setAssessmentAvailabilityError("");
    setAssessmentTemplateOpen(false);
  };

  const getAssessmentManageOptions = (course: CourseRecord, assessmentType: AssessmentType) => {
    const maleActive = isAssessmentEnabledForCourse(course, assessmentType, "male");
    const femaleActive = isAssessmentEnabledForCourse(course, assessmentType, "female");

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
        { value: "open_female", label: "بدء اختبار معلمات" },
        { value: "open_all", label: "بدء اختبار الكل" },
      ];
    }

    if (femaleActive) {
      return [
        { value: "close_female", label: "إغلاق معلمات" },
        { value: "open_male", label: "بدء اختبار معلمين" },
        { value: "open_all", label: "بدء اختبار الكل" },
      ];
    }

    return [
      { value: "open_all", label: "بدء اختبار الكل" },
      { value: "open_male", label: "بدء اختبار معلمين" },
      { value: "open_female", label: "بدء اختبار معلمات" },
    ];
  };

  const handleOpenAssessmentManageDialog = (courseId: string, assessmentType: AssessmentType) => {
    const course = data.courses.find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    const options = getAssessmentManageOptions(course, assessmentType);
    setAssessmentManageChoice(options[0]?.value ?? "");
    setAssessmentManageDialog({ courseId, assessmentType });
  };

  const handleConfirmAssessmentAvailability = async (): Promise<boolean> => {
    if (!pendingAssessmentAvailability) {
      return false;
    }

    const course = data.courses.find((item) => item.id === pendingAssessmentAvailability.courseId);

    if (!course) {
      return false;
    }

    const duration = Number(assessmentDurationMinutes);

    if (!assessmentNoTimeLimit && (!Number.isFinite(duration) || duration <= 0)) {
      setAssessmentAvailabilityError("أدخل مدة صحيحة بالدقائق.");
      return false;
    }

    const targetBranchId = assessmentTargetBranch;
    if (!targetBranchId) {
      setAssessmentAvailabilityError("اختر فرعًا.");
      return false;
    }

    // Check for cross-course conflict
    const conflictCourse = data.courses.find((c) =>
      c.id !== course.id &&
      c.entityType !== "task" &&
      c.isActive &&
      isAssessmentEnabledForCourse(c, pendingAssessmentAvailability.assessmentType, managedBranchId),
    );
    if (conflictCourse && !crossCourseConflict) {
      setCrossCourseConflict({
        conflictingCourseId: conflictCourse.id,
        conflictingCourseTitle: conflictCourse.title,
        pendingCourseId: course.id,
        pendingType: pendingAssessmentAvailability.assessmentType,
      });
      return false;
    }

    // Close the conflicting course's assessment before opening the new one
    if (crossCourseConflict) {
      const conflictCourseData = data.courses.find((c) => c.id === crossCourseConflict.conflictingCourseId);
      if (conflictCourseData) {
        const atype = crossCourseConflict.pendingType;
        const flagKey = atype === "pre" ? "isPreEnabled" : atype === "post" ? "isPostEnabled" : "isTasksEnabled";
        await store.updateCourse(conflictCourseData.id, {
          [flagKey]: false,
          assessmentWindows: {
            ...conflictCourseData.assessmentWindows,
            global: { ...conflictCourseData.assessmentWindows.global, [atype]: undefined },
          },
        } as never);
      }
    }
    setCrossCourseConflict(null);

    const closesAt = assessmentNoTimeLimit ? undefined : new Date(Date.now() + duration * 60 * 1000).toISOString();
    const windowValue = assessmentNoTimeLimit ? "__always_open__" : closesAt;
    const branchLabel = targetBranchId === "all" ? "جميع الفروع" : branchLabels[targetBranchId];
    const assessmentLabel = assessmentLabels[pendingAssessmentAvailability.assessmentType];
    const template = assessmentTemplateDraft.trim() || getDefaultAssessmentNotificationTemplate(pendingAssessmentAvailability.assessmentType);
    const message = template
      .split("{courseTitle}").join(course.title)
      .split("{assessmentLabel}").join(assessmentLabel)
      .split("{branchLabel}").join(branchLabel)
      .split("{durationMinutes}").join(assessmentNoTimeLimit ? "غير محدودة" : String(duration))
      .split("{durationLabel}").join(assessmentNoTimeLimit ? "غير محدودة" : formatDurationMinutes(duration));

    setAssessmentSubmitting(true);

    try {
      // Keep the other branch as-is; activation is additive per branch.
      const globalWindowKey = pendingAssessmentAvailability.assessmentType;
      const existingGlobalWindow = course.assessmentWindows.global[globalWindowKey];
      const nextGlobalWindow = assessmentNoTimeLimit
        ? "__always_open__"
        : (!existingGlobalWindow || new Date(existingGlobalWindow) < new Date(closesAt!))
          ? closesAt
          : existingGlobalWindow;
      const targetBranches: BranchId[] = targetBranchId === "all" ? ["male", "female"] : [targetBranchId];
      const branchAvailabilityUpdate = { ...course.branchAvailability };
      targetBranches.forEach((branchId) => {
        branchAvailabilityUpdate[branchId] = {
          ...course.branchAvailability[branchId],
          [pendingAssessmentAvailability.assessmentType]: true,
        };
      });
      const assessmentWindowsUpdate = {
        ...course.assessmentWindows,
        global: { ...course.assessmentWindows.global, [globalWindowKey]: nextGlobalWindow },
      };
      targetBranches.forEach((branchId) => {
        assessmentWindowsUpdate[branchId] = {
          ...course.assessmentWindows[branchId],
          [pendingAssessmentAvailability.assessmentType]: windowValue,
        };
      });
      await store.updateCourse(course.id, {
          // Ensure global flag is true
          ...(pendingAssessmentAvailability.assessmentType === "pre" ? { isPreEnabled: true } :
              pendingAssessmentAvailability.assessmentType === "post" ? { isPostEnabled: true } :
              { isTasksEnabled: true }),
          branchAvailability: branchAvailabilityUpdate,
          assessmentWindows: assessmentWindowsUpdate,
          assessmentNotificationTemplates: {
            ...course.assessmentNotificationTemplates,
            [pendingAssessmentAvailability.assessmentType]: template,
          },
        } as never);

      if (!course.isActive) {
        await store.activateCourse(course.id);
      }

      const pushStudents = targetBranchId === "all" ? data.students : getBranchStudents(data, targetBranchId);
      sendPushNotification(`${assessmentLabel} - ${course.title}`, message, pushStudents.map((s) => s.loginId),
        pendingAssessmentAvailability.assessmentType === "pre" ? "/course/pre" :
        pendingAssessmentAvailability.assessmentType === "post" ? "/course/post" :
        "/tasks"
      );
      resetAssessmentAvailabilityDialog();
      return true;
    } catch (error) {
      setAssessmentAvailabilityError(getSupabaseErrorMessage(error, "تعذر فتح الاختبار بالمؤقت المحدد."));
      return false;
    } finally {
      setAssessmentSubmitting(false);
    }
  };

  const handleToggleAssessmentAvailability = async (courseId: string, assessmentType: AssessmentType, targetBranch?: AssessmentOpenBranch) => {
    const course = data.courses.find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    setCourseError("");

    try {
      const resolvedBranchTarget = managedBranchId ?? targetBranch ?? "all";

      if (resolvedBranchTarget !== "all") {
        const otherBranch: BranchId = resolvedBranchTarget === "male" ? "female" : "male";
        const otherBranchActive = isAssessmentEnabledForCourse(course, assessmentType, otherBranch);

        await store.updateCourse(courseId, {
          ...(assessmentType === "pre"
            ? { isPreEnabled: otherBranchActive }
            : assessmentType === "post"
              ? { isPostEnabled: otherBranchActive }
              : { isTasksEnabled: otherBranchActive }),
          branchAvailability: {
            ...course.branchAvailability,
            [resolvedBranchTarget]: {
              ...course.branchAvailability[resolvedBranchTarget],
              [assessmentType]: false,
            },
          },
          assessmentWindows: {
            ...course.assessmentWindows,
            global: {
              ...course.assessmentWindows.global,
              [assessmentType]: otherBranchActive ? course.assessmentWindows.global[assessmentType] : undefined,
            },
            [resolvedBranchTarget]: {
              ...course.assessmentWindows[resolvedBranchTarget],
              [assessmentType]: undefined,
            },
          },
        });
        return;
      }

      if (assessmentType === "pre") {
        await store.updateCourse(courseId, {
          isPreEnabled: false,
          assessmentWindows: {
            ...course.assessmentWindows,
            global: { ...course.assessmentWindows.global, pre: undefined },
            male: { ...course.assessmentWindows.male, pre: undefined },
            female: { ...course.assessmentWindows.female, pre: undefined },
          },
        });
        return;
      }

      if (assessmentType === "post") {
        await store.updateCourse(courseId, {
          isPostEnabled: false,
          assessmentWindows: {
            ...course.assessmentWindows,
            global: { ...course.assessmentWindows.global, post: undefined },
            male: { ...course.assessmentWindows.male, post: undefined },
            female: { ...course.assessmentWindows.female, post: undefined },
          },
        });
        return;
      }

      await store.updateCourse(courseId, {
        isTasksEnabled: false,
        branchAvailability: {
          ...course.branchAvailability,
          male: { ...course.branchAvailability.male, tasks: false },
          female: { ...course.branchAvailability.female, tasks: false },
        },
        assessmentWindows: {
          ...course.assessmentWindows,
          global: { ...course.assessmentWindows.global, tasks: undefined },
          male: { ...course.assessmentWindows.male, tasks: undefined },
          female: { ...course.assessmentWindows.female, tasks: undefined },
        },
      });
    } catch (error) {
      setCourseError(getSupabaseErrorMessage(error, "تعذر تحديث حالة القسم في قاعدة البيانات."));
    }
  };

  const handleActivateCourseSelect = async (courseId: string) => {
    if (!canCreateCourses) {
      return;
    }

    if (!courseId) {
      return;
    }

    setCourseError("");

    try {
      await store.activateCourse(courseId);
    } catch (error) {
      setCourseError(getSupabaseErrorMessage(error, "تعذر تحديث حالة الدورة في قاعدة البيانات."));
    }
  };

  const handleOpenAssessmentModel = (courseId: string, assessmentType: AssessmentType) => {
    navigate(`/dashboard/course/${assessmentType}?courseId=${courseId}`);
  };

  const handleDeleteReciter = (reciterId: string) => {
    const reciter = data.reciters.find((item) => item.id === reciterId);

    if (!reciter) {
      return;
    }

    setPendingDeleteReciter({ id: reciter.id, name: reciter.name });
  };

  const handleDeleteCourse = (courseId: string) => {
    if (!canCreateCourses) {
      return;
    }

    const course = data.courses.find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    setPendingDeleteCourse({ id: course.id, name: course.title });
  };

  const handleAddCourse = async () => {
    if (!canCreateCourses) {
      return;
    }

    const normalizedTitle = courseTitle.trim();

    if (!normalizedTitle) {
      setCourseError("اكتب اسم الدورة.");
      return;
    }

    setCourseError("");

    try {
      await store.addCourse(normalizedTitle);
      setCourseTitle("");
      showSuccessToast("تمت إضافة الدورة", `تمت إضافة دورة ${normalizedTitle} بنجاح.`);
      appendActivityLog({ action: "إضافة دورة", target: normalizedTitle, status: "نجحت", details: "تمت إضافة دورة جديدة إلى النظام." });
    } catch (error) {
      setCourseError(getSupabaseErrorMessage(error, "تعذر إضافة الدورة إلى قاعدة البيانات."));
      appendActivityLog({ action: "إضافة دورة", target: normalizedTitle, status: "فشلت", details: "فشل إنشاء دورة جديدة في النظام." });
    }
  };

  const handleEditCourse = (courseId: string, title: string) => {
    if (!canCreateCourses) {
      return;
    }

    setCourseEditError("");
    setCourseEditForm({ id: courseId, title });
    setCourseEditOpen(true);
  };

  const handleSaveEditedCourse = async () => {
    if (!canCreateCourses || !courseEditForm.id) {
      return;
    }

    const normalizedTitle = courseEditForm.title.trim();

    if (!normalizedTitle) {
      setCourseEditError("اكتب اسم الدورة.");
      return;
    }

    setCourseEditError("");

    try {
      await store.updateCourse(courseEditForm.id, { title: normalizedTitle });
      setCourseEditOpen(false);
      setCourseEditForm(emptyCourseEditForm);
      showSuccessToast("تم تعديل الدورة", `تم تحديث اسم الدورة إلى ${normalizedTitle}.`);
      appendActivityLog({ action: "تعديل دورة", target: normalizedTitle, status: "نجحت", details: "تم تحديث اسم الدورة بنجاح." });
    } catch (error) {
      setCourseEditError(getSupabaseErrorMessage(error, "تعذر تعديل اسم الدورة في قاعدة البيانات."));
      appendActivityLog({ action: "تعديل دورة", target: normalizedTitle, status: "فشلت", details: "فشل تحديث اسم الدورة." });
    }
  };

  const confirmDeleteCourse = async () => {
    if (!pendingDeleteCourse) {
      return;
    }

    try {
      await store.deleteCourse(pendingDeleteCourse.id);

      if (selectedCourseId === pendingDeleteCourse.id) {
        setSelectedCourseId("");
        setSelectedCourseAssessment(null);
      }

      showSuccessToast("تم حذف الدورة", `تم حذف الدورة ${pendingDeleteCourse.name} وما يرتبط بها بنجاح.`);
      appendActivityLog({ action: "حذف دورة", target: pendingDeleteCourse.name, status: "نجحت", details: "تم حذف الدورة وكل بياناتها المرتبطة من النظام." });
      setPendingDeleteCourse(null);
    } catch (error) {
      setCourseError(getSupabaseErrorMessage(error, "تعذر حذف الدورة من قاعدة البيانات."));
      showErrorToast("تعذر حذف الدورة من قاعدة البيانات.");
      appendActivityLog({ action: "حذف دورة", target: pendingDeleteCourse.name, status: "فشلت", details: "فشل حذف الدورة من قاعدة البيانات." });
    }
  };

  const confirmDeleteReciter = async () => {
    if (!pendingDeleteReciter) {
      return;
    }

    const reciter = data.reciters.find((item) => item.id === pendingDeleteReciter.id);

    setReciterDeleting(true);

    try {
      if (reciter) {
        await deleteReciterFromDatabase(reciter.loginCode);
      }
      store.deleteReciter(pendingDeleteReciter.id);
      if (editingReciterId === pendingDeleteReciter.id) {
        resetReciterForm();
      }
      if (selectedReciterId === pendingDeleteReciter.id) {
        setSelectedReciterId("");
      }
      showSuccessToast("تم حذف المقرئ", `تم حذف ${pendingDeleteReciter.name} من قائمة المقرئين بنجاح.`);
      appendActivityLog({ action: "حذف مقرئ", target: pendingDeleteReciter.name, status: "نجحت", details: "تم حذف المقرئ من النظام." });
      setPendingDeleteReciter(null);
    } catch (error) {
      setReciterError(getSupabaseErrorMessage(error, "تعذر حذف المقرئ من قاعدة البيانات."));
      showErrorToast("تعذر حذف المقرئ من قاعدة البيانات.");
      appendActivityLog({ action: "حذف مقرئ", target: pendingDeleteReciter.name, status: "فشلت", details: "فشل حذف المقرئ من قاعدة البيانات." });
    } finally {
      setReciterDeleting(false);
    }
  };

  const handleUndoAttendanceSave = async (courseId: string, previousPresentStudents: StudentRecord[], isTask: boolean) => {
    try {
      await store.setManualAttendance(courseId, previousPresentStudents);
      showSuccessToast(isTask ? "تم التراجع عن حفظ المهام" : "تم التراجع عن حفظ التحضير", "تمت استعادة الحالة السابقة بنجاح.");
      appendActivityLog({ action: isTask ? "تراجع عن حفظ المهام" : "تراجع عن حفظ التحضير", target: courseId, status: "نجحت", details: "تمت استعادة الحالة السابقة بنجاح." });
    } catch {
      showErrorToast(isTask ? "تعذر التراجع عن حفظ المهام." : "تعذر التراجع عن حفظ التحضير.");
      appendActivityLog({ action: isTask ? "تراجع عن حفظ المهام" : "تراجع عن حفظ التحضير", target: courseId, status: "فشلت", details: "فشل التراجع عن الحالة السابقة." });
    }
  };

  const handleSaveFinalExamManualScore = async (submissionId: string, score: number, previousScore: number | null, studentName: string) => {
    try {
      await store.setFinalExamManualScore(submissionId, score);
      setFinalExamScoreEdit(null);
      showSuccessToast(
        "تم حفظ الدرجة",
        `تم تحديث درجة ${studentName} بنجاح.`,
        <ToastAction altText="تراجع" onClick={() => void store.setFinalExamManualScore(submissionId, previousScore)}>
          تراجع
        </ToastAction>,
      );
      appendActivityLog({ action: "تعديل درجة النهائي", target: studentName, status: "نجحت", details: `تم تحديث الدرجة اليدوية إلى ${score}.` });
    } catch {
      showErrorToast("تعذر حفظ الدرجة اليدوية.");
      appendActivityLog({ action: "تعديل درجة النهائي", target: studentName, status: "فشلت", details: "فشل حفظ الدرجة اليدوية." });
    }
  };

  const confirmAttendanceSave = async () => {
    if (!pendingAttendanceSave) {
      return;
    }

    setAttendanceSaving(true);
    try {
      await store.setManualAttendance(pendingAttendanceSave.courseId, pendingAttendanceSave.presentStudents);
      showSuccessToast(
        pendingAttendanceSave.isTask ? "تم حفظ المهام" : "تم حفظ التحضير",
        `${pendingAttendanceSave.isTask ? "تم تحديث حالة التنفيذ" : "تم تحديث الحضور"} لدورة ${pendingAttendanceSave.courseTitle}.`,
        <ToastAction
          altText="تراجع"
          onClick={() => void handleUndoAttendanceSave(pendingAttendanceSave.courseId, pendingAttendanceSave.previousPresentStudents, pendingAttendanceSave.isTask)}
        >
          تراجع
        </ToastAction>,
      );
      appendActivityLog({ action: pendingAttendanceSave.isTask ? "حفظ المهام" : "حفظ التحضير", target: pendingAttendanceSave.courseTitle, status: "نجحت", details: `عدد التغييرات المطبقة: ${pendingAttendanceSave.changedCount}.` });
      setPendingAttendanceSave(null);
    } catch {
      showErrorToast(pendingAttendanceSave.isTask ? "تعذر حفظ المهام." : "تعذر حفظ التحضير.");
      appendActivityLog({ action: pendingAttendanceSave.isTask ? "حفظ المهام" : "حفظ التحضير", target: pendingAttendanceSave.courseTitle, status: "فشلت", details: "فشل حفظ الحالة الجديدة." });
    } finally {
      setAttendanceSaving(false);
    }
  };

  const resetAdminTransferState = () => {
    setPendingAdminTransfer(null);
    setAdminTransferTargetReciterId("");
    setAdminTransferError("");
    setAdminTransferSubmitting(false);
  };

  const resetReciterActionsState = () => {
    setPendingReciterActions(null);
  };

  const openAdminTransferDialog = (input: PendingAdminTransfer) => {
    setPendingAdminTransfer(input);
    setAdminTransferTargetReciterId("");
    setAdminTransferError("");
  };

  const handleOpenReciterActions = (reciterId: string) => {
    setPendingReciterActions({ reciterId });
  };

  const handleTransferFromReciterActions = () => {
    if (!selectedReciterActions?.primaryLinkedStudent) {
      return;
    }

    openAdminTransferDialog({
      studentId: selectedReciterActions.primaryLinkedStudent.id,
      studentName: selectedReciterActions.primaryLinkedStudent.name,
      branchId: selectedReciterActions.primaryLinkedStudent.branchId,
      currentReciterId: selectedReciterActions.reciter.id,
    });
    resetReciterActionsState();
  };

  const handleEditFromReciterActions = () => {
    if (!selectedReciterActions) {
      return;
    }

    openEntityManager("reciter", selectedReciterActions.reciter.id);
    resetReciterActionsState();
  };

  const handleDeleteFromReciterActions = () => {
    if (!selectedReciterActions) {
      return;
    }

    handleDeleteReciter(selectedReciterActions.reciter.id);
    resetReciterActionsState();
  };

  const syncTransferredStudentLocally = (studentId: string, sourceReciterId: string, targetReciterId: string) => {
    const sourceReciter = data.reciters.find((reciter) => reciter.id === sourceReciterId);

    if (sourceReciter) {
      store.updateReciter(sourceReciterId, {
        studentIds: sourceReciter.studentIds.filter((currentStudentId) => currentStudentId !== studentId),
      });
    }

    const targetReciter = data.reciters.find((reciter) => reciter.id === targetReciterId);

    if (targetReciter && !targetReciter.studentIds.includes(studentId)) {
      store.updateReciter(targetReciterId, {
        studentIds: [...targetReciter.studentIds, studentId],
      });
    }
  };

  const handleAdminTransferStudent = async () => {
    if (!pendingAdminTransfer) {
      return;
    }

    if (!adminTransferTargetReciterId) {
      setAdminTransferError("اختر المقرئ الذي سيتم النقل إليه.");
      return;
    }

    setAdminTransferSubmitting(true);
    setAdminTransferError("");

    try {
      await transferStudentToReciterInDatabase(
        pendingAdminTransfer.studentId,
        pendingAdminTransfer.currentReciterId,
        adminTransferTargetReciterId,
      );
      syncTransferredStudentLocally(
        pendingAdminTransfer.studentId,
        pendingAdminTransfer.currentReciterId,
        adminTransferTargetReciterId,
      );
      showSuccessToast("تم نقل الطالب", `تم نقل ${pendingAdminTransfer.studentName} بنجاح.`);
      appendActivityLog({
        action: "نقل طالب",
        target: pendingAdminTransfer.studentName,
        status: "نجحت",
        details: "تم نقل الطالب إلى مقرئ آخر بنجاح.",
      });
      resetAdminTransferState();
    } catch (error) {
      setAdminTransferError(getSupabaseErrorMessage(error, "تعذر نقل الطالب إلى المقرئ المحدد."));
      appendActivityLog({
        action: "نقل طالب",
        target: pendingAdminTransfer.studentName,
        status: "فشلت",
        details: "فشل نقل الطالب إلى المقرئ المحدد.",
      });
    } finally {
      setAdminTransferSubmitting(false);
    }
  };

  const resultsRows = useMemo(() => {
    if (!resultsCourse || !resultsType) {
      return [] as Array<{
        studentId: string;
        studentName: string;
        loginId: string;
        submissionId: string | null;
        score: number;
        total: number;
        hasViewableAnswers: boolean;
      }>;
    }

    return resultsStudents.map((student) => {
      const submission = data.submissions
        .filter(
          (item) => item.courseId === resultsCourse.id && item.assessmentType === resultsType && item.loginId === student.loginId,
        )
        .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())[0] ?? null;

      const grade = submission
        ? getSubmissionGrade(resultsCourse.id, resultsType, submission.id)
        : { score: 0, total: getAssessmentQuestionsForCourse(resultsCourse.id, resultsType).reduce((sum, question) => sum + question.points, 0) };

      return {
        studentId: student.id,
        studentName: student.name,
        loginId: student.loginId,
        submissionId: submission?.id ?? null,
        score: grade.score,
        total: grade.total,
        hasViewableAnswers: submission
          ? (submission.answers ?? []).some((answer) => answer.questionId !== "__score_override__")
          : false,
      };
    });
  }, [data.submissions, resultsCourse, resultsStudents, resultsType]);

  const statistics = useMemo(() => {
    const totalStudents = data.students.length;
    const completedThirtyStudents = data.students.filter((student) => student.completedParts.length >= 30).length;
    const memorizationAverage = totalStudents
      ? data.students.reduce((sum, student) => sum + (student.completedParts.length / 30) * 100, 0) / totalStudents
      : 0;

    if (!statisticsCourse) {
      return {
        totalStudents,
        attendanceRate: 0,
        completedThirtyStudents,
        memorizationAverage,
        preAverage: 0,
        postAverage: 0,
      };
    }

    const courseAttendanceLoginIds = new Set(
      data.attendance.filter((record) => record.courseId === statisticsCourse.id).map((record) => record.loginId),
    );
    const attendanceRate = totalStudents ? (courseAttendanceLoginIds.size / totalStudents) * 100 : 0;

    const getAverageForAssessment = (assessmentType: AssessmentType) => {
      const submissions = data.submissions.filter(
        (submission) => submission.courseId === statisticsCourse.id && submission.assessmentType === assessmentType,
      );

      if (submissions.length === 0) {
        return 0;
      }

      const latestByStudent = new Map<string, typeof submissions[number]>();

      submissions
        .slice()
        .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())
        .forEach((submission) => {
          if (!latestByStudent.has(submission.loginId)) {
            latestByStudent.set(submission.loginId, submission);
          }
        });

      const latestSubmissions = [...latestByStudent.values()];

      if (latestSubmissions.length === 0) {
        return 0;
      }

      return latestSubmissions.reduce((sum, submission) => {
        const grade = getSubmissionGrade(statisticsCourse.id, assessmentType, submission.id);
        const ratio = grade.total > 0 ? (grade.score / grade.total) * 100 : 0;
        return sum + ratio;
      }, 0) / latestSubmissions.length;
    };

    return {
      totalStudents,
      attendanceRate,
      completedThirtyStudents,
      memorizationAverage,
      preAverage: getAverageForAssessment("pre"),
      postAverage: getAverageForAssessment("post"),
    };
  }, [activeCourse, data.attendance, data.students, data.submissions, statisticsCourse]);

  const reciterByStudentId = useMemo(() => {
    const entries = data.reciters.flatMap((reciter) => reciter.studentIds.map((studentId) => [studentId, reciter] as const));
    return new Map(entries);
  }, [data.reciters]);

  const indicatorMetrics = useMemo(() => {
    const totalStudents = indicatorStudents.length;
    const totalPossibleParts = totalStudents * 30;
    const completedPartsCount = indicatorStudents.reduce((sum, student) => sum + student.completedParts.length, 0);
    const completedThirtyStudents = indicatorStudents.filter((student) => student.isCertified).length;
    const branchLoginIds = new Set(indicatorStudents.map((student) => student.loginId));
    
    // Use indicatorsCourseId directly instead of looking it up in courseItems
    // This ensures we get the correct course even if it's not in the filtered list
    const selectedCourseIds = indicatorsCourseId === "all" 
      ? courseItems.map((course) => course.id)
      : courseItems.some((c) => c.id === indicatorsCourseId)
        ? [indicatorsCourseId]
        : courseItems.map((course) => course.id); // fallback to all courses if selected course doesn't exist
    
    const standaloneTaskIds = getTasks(data).map((task) => task.id);
    const taskCourseIds = indicatorsCourseId === "all"
      ? [...new Set([...selectedCourseIds, ...standaloneTaskIds])]
      : [indicatorsCourseId];

    const getAssessmentIndicatorDetails = (assessmentType: AssessmentType) => {
      const totalAssessmentSlots = totalStudents * selectedCourseIds.length;
      const testedStudentsCount = selectedCourseIds.reduce((count, courseId) => {
        const latestByLoginId = getLatestSubmissionByLoginId(courseId, assessmentType);
        return count + [...latestByLoginId.keys()].filter((loginId) => branchLoginIds.has(loginId)).length;
      }, 0);

      const completionPercent = totalAssessmentSlots > 0
        ? clampPercent((testedStudentsCount / totalAssessmentSlots) * 100)
        : 0;

      return {
        testedStudentsCount,
        correctAnswersCount: 0,
        correctAnswersPercent: completionPercent,
      };
    };

    const getAttendancePercent = (loginId: string) => {
      if (selectedCourseIds.length === 0) {
        return 0;
      }

      const attendedCoursesCount = new Set(
        data.attendance
          .filter((record) => selectedCourseIds.includes(record.courseId) && record.loginId === loginId)
          .map((record) => record.courseId),
      ).size;

      return clampPercent((attendedCoursesCount / selectedCourseIds.length) * 100);
    };

    const getAssessmentPercent = (assessmentType: AssessmentType, loginId: string) => {
      if (selectedCourseIds.length === 0) {
        return 0;
      }

      const completedAssessmentsCount = selectedCourseIds.reduce((count, courseId) => {
        const submission = getLatestSubmissionByLoginId(courseId, assessmentType).get(loginId);

        return submission ? count + 1 : count;
      }, 0);

      return clampPercent((completedAssessmentsCount / selectedCourseIds.length) * 100);
    };

    const getTaskSubmissionPercent = (loginId: string) => {
      if (taskCourseIds.length === 0) {
        return 0;
      }

      const submittedTasksCount = taskCourseIds.reduce((count, courseId) => {
        const submission = getLatestSubmissionByLoginId(courseId, "tasks").get(loginId);
        return submission ? count + 1 : count;
      }, 0);

      return clampPercent((submittedTasksCount / taskCourseIds.length) * 100);
    };

    const preAssessmentDetails = getAssessmentIndicatorDetails("pre");
    const postAssessmentDetails = getAssessmentIndicatorDetails("post");
    const preAverage = preAssessmentDetails.correctAnswersPercent;
    const postAverage = postAssessmentDetails.correctAnswersPercent;
    const tasksSubmittedSlots = taskCourseIds.reduce((count, courseId) => {
      const latestByLoginId = getLatestSubmissionByLoginId(courseId, "tasks");
      return count + [...latestByLoginId.keys()].filter((loginId) => branchLoginIds.has(loginId)).length;
    }, 0);
    const tasksSubmittedStudentsCount = new Set(
      taskCourseIds.flatMap((courseId) => [...getLatestSubmissionByLoginId(courseId, "tasks").keys()].filter((loginId) => branchLoginIds.has(loginId))),
    ).size;
    const tasksAverage = totalStudents > 0 && taskCourseIds.length > 0
      ? (tasksSubmittedSlots / (totalStudents * taskCourseIds.length)) * 100
      : 0;
    const attendanceAverage = totalStudents > 0
      ? indicatorStudents.reduce((sum, student) => sum + getAttendancePercent(student.loginId), 0) / totalStudents
      : 0;

    const studentRows = indicatorStudents
      .map((student) => {
        const memorizationPercent = clampPercent((student.completedParts.length / 30) * 100);
        const attendancePercent = getAttendancePercent(student.loginId);
        const prePercent = getAssessmentPercent("pre", student.loginId);
        const postPercent = getAssessmentPercent("post", student.loginId);
        const tasksPercent = getTaskSubmissionPercent(student.loginId);
        const overallPercent = (memorizationPercent + attendancePercent + prePercent + postPercent + tasksPercent) / 5;
        const reciter = reciterByStudentId.get(student.id) ?? null;

        return {
          id: student.id,
          name: student.name,
          loginId: student.loginId,
          reciterName: reciter?.name ?? "غير مرتبط",
          memorizationPercent,
          attendancePercent,
          prePercent,
          postPercent,
          tasksPercent,
          overallPercent,
        };
      })
      .sort((left, right) => {
        if (indicatorsSortOrder === "alpha") {
          return left.name.localeCompare(right.name, "ar");
        }

        if (indicatorsSortOrder === "overall-asc") {
          return left.overallPercent - right.overallPercent || left.name.localeCompare(right.name, "ar");
        }

        return right.overallPercent - left.overallPercent || left.name.localeCompare(right.name, "ar");
      });

    return {
      totalStudents,
      completedPartsCount,
      completedThirtyStudents,
      tasksSubmittedStudentsCount,
      summary: {
        memorization: totalPossibleParts > 0 ? (completedPartsCount / totalPossibleParts) * 100 : 0,
        attendance: attendanceAverage,
        pre: preAverage,
        post: postAverage,
        tasks: tasksAverage,
      },
      assessments: {
        pre: preAssessmentDetails,
        post: postAssessmentDetails,
      },
      studentRows,
    };
  }, [courseItems, data.attendance, data.courses, data.submissions, indicatorStudents, reciterByStudentId, indicatorsCourseId, indicatorsBranchId, indicatorsSortOrder]);

  const courseIndicatorsMetrics = useMemo(() => {
    if (!courseIndicatorsCourseId) return null;
    const isAllCoursesSelected = courseIndicatorsCourseId === ALL_COURSE_INDICATORS_ID;
    const selectedCourses = isAllCoursesSelected
      ? courseItems
      : courseItems.filter((course) => course.id === courseIndicatorsCourseId);
    if (selectedCourses.length === 0) return null;

    const branchStudents = courseIndicatorsBranch === "all"
      ? data.students
      : getBranchStudents(data, courseIndicatorsBranch);
    const branchLoginIds = new Set(branchStudents.map((s) => s.loginId));

    const calcAssessment = (type: AssessmentType) => {
      const byParticipationKey = new Map<string, number>();
      let totalPct = 0;
      let count = 0;

      selectedCourses.forEach((course) => {
        const latestByLoginId = getLatestSubmissionByLoginId(course.id, type);
        [...latestByLoginId.values()].forEach((submission) => {
          if (!branchLoginIds.has(submission.loginId)) return;
          const grade = getSubmissionGrade(course.id, type, submission.id);
          if (grade.total <= 0 || grade.score < 1) return;
          const pct = (grade.score / grade.total) * 100;
          const participationKey = `${course.id}:${submission.loginId}`;
          byParticipationKey.set(participationKey, pct);
          totalPct += pct;
          count += 1;
        });
      });

      return {
        avg: count > 0 ? totalPct / count : 0,
        count,
        byParticipationKey,
      };
    };

    const pre = calcAssessment("pre");
    const post = calcAssessment("post");

    // Rise: for all-courses mode, each (student + course) pair counts independently.
    const bothParticipationKeys = [...pre.byParticipationKey.keys()].filter((key) => post.byParticipationKey.has(key));
    const bothCount = bothParticipationKeys.length;
    let rise = 0;
    if (bothCount > 0) {
      const preAvgBoth = bothParticipationKeys.reduce((sum, key) => sum + (pre.byParticipationKey.get(key) ?? 0), 0) / bothCount;
      const postAvgBoth = bothParticipationKeys.reduce((sum, key) => sum + (post.byParticipationKey.get(key) ?? 0), 0) / bothCount;
      rise = Math.max(-100, Math.min(100, postAvgBoth - preAvgBoth));
    }

    const attendanceEntries = data.attendance.filter((record) => selectedCourses.some((course) => course.id === record.courseId) && branchLoginIds.has(record.loginId));
    const attendedParticipationKeys = new Set(attendanceEntries.map((record) => `${record.courseId}:${record.loginId}`));
    const attendanceBaseCount = isAllCoursesSelected ? branchStudents.length * selectedCourses.length : branchStudents.length;
    const attendance = attendanceBaseCount > 0 ? (attendedParticipationKeys.size / attendanceBaseCount) * 100 : 0;

    // Per-student rows for export
    const studentRows = isAllCoursesSelected
      ? selectedCourses.flatMap((course) => {
        const preLatest = getLatestSubmissionByLoginId(course.id, "pre");
        const postLatest = getLatestSubmissionByLoginId(course.id, "post");
        return branchStudents.map((student) => {
          const preSub = preLatest.get(student.loginId);
          const postSub = postLatest.get(student.loginId);
          const preGrade = preSub ? getSubmissionGrade(course.id, "pre", preSub.id) : null;
          const postGrade = postSub ? getSubmissionGrade(course.id, "post", postSub.id) : null;
          const prePct = preGrade && preGrade.total > 0 ? Math.round((preGrade.score / preGrade.total) * 100) : null;
          const postPct = postGrade && postGrade.total > 0 ? Math.round((postGrade.score / postGrade.total) * 100) : null;
          return {
            name: student.name,
            loginId: student.loginId,
            prePct,
            postPct,
            diff: prePct !== null && postPct !== null ? postPct - prePct : null,
            attended: attendedParticipationKeys.has(`${course.id}:${student.loginId}`),
          };
        }).filter((row) => row.prePct !== null || row.postPct !== null || row.attended);
      })
      : branchStudents.map((student) => {
        const course = selectedCourses[0];
        const preLatest = getLatestSubmissionByLoginId(course.id, "pre");
        const postLatest = getLatestSubmissionByLoginId(course.id, "post");
        const preSub = preLatest.get(student.loginId);
        const postSub = postLatest.get(student.loginId);
        const preGrade = preSub ? getSubmissionGrade(course.id, "pre", preSub.id) : null;
        const postGrade = postSub ? getSubmissionGrade(course.id, "post", postSub.id) : null;
        const prePct = preGrade && preGrade.total > 0 ? Math.round((preGrade.score / preGrade.total) * 100) : null;
        const postPct = postGrade && postGrade.total > 0 ? Math.round((postGrade.score / postGrade.total) * 100) : null;
        return {
          name: student.name,
          loginId: student.loginId,
          prePct,
          postPct,
          diff: prePct !== null && postPct !== null ? postPct - prePct : null,
          attended: attendedParticipationKeys.has(`${course.id}:${student.loginId}`),
        };
      });

    return {
      pre: pre.avg,
      preCount: pre.count,
      post: post.avg,
      postCount: post.count,
      rise,
      bothCount,
      attendance,
      attendanceCount: attendedParticipationKeys.size,
      totalStudents: isAllCoursesSelected ? branchStudents.length * selectedCourses.length : branchStudents.length,
      courseName: isAllCoursesSelected ? "جميع الدورات" : selectedCourses[0].title,
      studentRows,
    };
  }, [courseItems, courseIndicatorsCourseId, courseIndicatorsBranch, data.attendance, data.courses, data.submissions, data.students]);

  const homeMetrics = useMemo(() => {
    const students = homeBranchFilter === "all" ? data.students : getBranchStudents(data, homeBranchFilter);
    const branchLoginIds = new Set(students.map((s) => s.loginId));
    const totalStudents = students.length;
    const courseIds = courseItems.map((c) => c.id);

    const calcAssessment = (type: AssessmentType) => {
      const testedSet = new Set<string>();
      let totalPct = 0;
      courseIds.forEach((courseId) => {
        const latestMap = getLatestSubmissionByLoginId(courseId, type);
        [...latestMap.values()].forEach((sub) => {
          if (branchLoginIds.has(sub.loginId) && !testedSet.has(sub.loginId)) {
            testedSet.add(sub.loginId);
            const grade = getSubmissionGrade(courseId, type, sub.id);
            if (grade.total > 0) totalPct += (grade.score / grade.total) * 100;
          }
        });
      });
      const count = testedSet.size;
      const avg = count > 0 ? clampPercent(totalPct / count) : 0;
      return { count, avg, loginIds: testedSet };
    };

    const pre = calcAssessment("pre");
    const post = calcAssessment("post");
    const bothCount = [...pre.loginIds].filter((id) => post.loginIds.has(id)).length;
    const rise = Math.max(-100, Math.min(100, post.avg - pre.avg));

    const taskIds = [...courseIds, ...getTasks(data).map((t) => t.id)];
    const tasksTestedSet = new Set<string>();
    taskIds.forEach((courseId) => {
      const latestMap = getLatestSubmissionByLoginId(courseId, "tasks");
      [...latestMap.values()].forEach((sub) => {
        if (branchLoginIds.has(sub.loginId)) tasksTestedSet.add(sub.loginId);
      });
    });

    const attendedCourseStudentPairs = new Set(
      data.attendance
        .filter((r) => courseIds.includes(r.courseId) && branchLoginIds.has(r.loginId))
        .map((r) => `${r.courseId}:${r.loginId}`),
    );
    const totalAttendanceSlots = totalStudents * courseIds.length;
    const attendanceRate = totalAttendanceSlots > 0
      ? clampPercent((attendedCourseStudentPairs.size / totalAttendanceSlots) * 100)
      : 0;

    const courseBreakdown = courseItems.map((course) => {
      const preSubs = [...getLatestSubmissionByLoginId(course.id, "pre").values()].filter((s) => branchLoginIds.has(s.loginId));
      const postSubs = [...getLatestSubmissionByLoginId(course.id, "post").values()].filter((s) => branchLoginIds.has(s.loginId));
      const attended = new Set(data.attendance.filter((r) => r.courseId === course.id && branchLoginIds.has(r.loginId)).map((r) => r.loginId)).size;
      const calcAvg = (subs: typeof preSubs, type: AssessmentType) => {
        if (subs.length === 0) return 0;
        return clampPercent(subs.reduce((sum, s) => {
          const g = getSubmissionGrade(course.id, type, s.id);
          return sum + (g.total > 0 ? (g.score / g.total) * 100 : 0);
        }, 0) / subs.length);
      };
      return {
        id: course.id,
        title: course.title,
        preCount: preSubs.length,
        preAvg: calcAvg(preSubs, "pre"),
        postCount: postSubs.length,
        postAvg: calcAvg(postSubs, "post"),
        attendanceCount: attended,
      };
    });

    const memorizationCount = students.reduce((sum, s) => sum + s.completedParts.length, 0);
    const completed30Count = students.filter((s) => s.isCertified).length;

    return { totalStudents, pre, post, bothCount, rise, tasksCount: tasksTestedSet.size, attendanceCount: attendedCourseStudentPairs.size, attendanceRate, courseBreakdown, memorizationCount, completed30Count };
  }, [homeBranchFilter, data.students, data.submissions, data.attendance, data.courses, courseItems]);

  const adminName = session.name;
  const activeMenuItem = dashboardTab === "home"
    ? { id: "home", label: "الرئيسية" }
    : dashboardTab === "activity"
    ? { id: "activity", label: "سجل النشاط" }
    : availableDashboardMenu.find((item) => item.id === dashboardTab) ?? availableDashboardMenu[0];
  const appendActivityLog = (entry: { action: string; target: string; status: "نجحت" | "فشلت" | "ألغيت"; details: string }) => {
    void store.addActivityLog({
      ...entry,
      actorName: adminName || "مستخدم النظام",
      actorRole: getRoleLabel(session.role),
    });
  };
  const showSuccessToast = (title: string, description: string, action?: React.ReactElement<typeof ToastAction>) => {
    toast({ title, description, action });
  };
  const showErrorToast = (description: string) => {
    toast({ title: "تعذر تنفيذ العملية", description, variant: "destructive" });
  };
  const formatAttendanceTime = (value?: string) => {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };
  const backupComparisonRows = useMemo(() => {
    if (!pendingBackupData) {
      return [] as Array<{ label: string; current: number; backup: number; diff: number }>;
    }

    const currentCompletedParts = data.students.reduce((sum, student) => sum + student.completedParts.length, 0);
    const backupCompletedParts = pendingBackupData.students.reduce((sum, student) => sum + student.completedParts.length, 0);

    return [
      { label: "الطلاب", current: data.students.length, backup: pendingBackupData.students.length, diff: pendingBackupData.students.length - data.students.length },
      { label: "الأجزاء المحفوظة", current: currentCompletedParts, backup: backupCompletedParts, diff: backupCompletedParts - currentCompletedParts },
      { label: "المقرئون", current: data.reciters.length, backup: pendingBackupData.reciters.length, diff: pendingBackupData.reciters.length - data.reciters.length },
      { label: "الدورات", current: data.courses.length, backup: pendingBackupData.courses.length, diff: pendingBackupData.courses.length - data.courses.length },
      { label: "قوالب المهام", current: data.taskTemplates.length, backup: pendingBackupData.taskTemplates.length, diff: pendingBackupData.taskTemplates.length - data.taskTemplates.length },
      { label: "الحضور", current: data.attendance.length, backup: pendingBackupData.attendance.length, diff: pendingBackupData.attendance.length - data.attendance.length },
      { label: "الإشعارات", current: data.notifications.length, backup: pendingBackupData.notifications.length, diff: pendingBackupData.notifications.length - data.notifications.length },
      { label: "النتائج", current: data.submissions.length, backup: pendingBackupData.submissions.length, diff: pendingBackupData.submissions.length - data.submissions.length },
      { label: "أسئلة الاستبيان", current: data.satisfactionQuestions.length, backup: pendingBackupData.satisfactionQuestions.length, diff: pendingBackupData.satisfactionQuestions.length - data.satisfactionQuestions.length },
      { label: "ردود الاستبيان", current: data.satisfactionResponses.length, backup: pendingBackupData.satisfactionResponses.length, diff: pendingBackupData.satisfactionResponses.length - data.satisfactionResponses.length },
      { label: "أسئلة النهائي", current: data.finalExamQuestions.length, backup: pendingBackupData.finalExamQuestions.length, diff: pendingBackupData.finalExamQuestions.length - data.finalExamQuestions.length },
      { label: "نتائج النهائي", current: data.finalExamSubmissions.length, backup: pendingBackupData.finalExamSubmissions.length, diff: pendingBackupData.finalExamSubmissions.length - data.finalExamSubmissions.length },
    ];
  }, [data.attendance.length, data.courses.length, data.finalExamQuestions.length, data.finalExamSubmissions.length, data.notifications.length, data.reciters.length, data.satisfactionQuestions.length, data.satisfactionResponses.length, data.students, data.submissions.length, data.taskTemplates.length, pendingBackupData]);

  const handleGoToDashboardHome = (isMobile = false) => {
    setDashboardTab("home");
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  const renderDashboardNavigation = (isMobile = false) => (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-border/60 px-4 py-5 text-right">
        <div
          role="link"
          tabIndex={0}
          onClick={() => handleGoToDashboardHome(isMobile)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleGoToDashboardHome(isMobile);
            }
          }}
          className="flex w-full cursor-pointer items-center justify-start gap-3 rounded-2xl outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <img src="/اللوقو-شفاف.png" alt="شعار المنصة" className="site-logo site-logo-scrolled h-12 w-auto object-contain" />
          <div className="text-right">
            <p className="whitespace-nowrap text-base font-extrabold leading-tight text-foreground">لوحة التحكم</p>
          </div>
        </div>
      </div>

      <div className={cn("flex-1 overflow-y-auto px-4 py-5 text-right", isMobile && "pb-8")}>
        <div className="space-y-2">
          {primaryDashboardMenu.map((item) => {
            const Icon = item.icon;
            const active = dashboardTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDashboardTab(item.id);
                  if (isMobile) {
                    setMobileMenuOpen(false);
                  }
                }}
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
        {(secondaryDashboardMenu.length > 0 || canViewActivityLog || canAccessBackup) && (
          <div className="mt-4 border-t border-border/60 pt-4 space-y-2">
            {secondaryDashboardMenu.map((item) => {
              const Icon = item.icon;
              const active = dashboardTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDashboardTab(item.id);
                    if (isMobile) {
                      setMobileMenuOpen(false);
                    }
                  }}
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
            {canViewActivityLog && (
              <button
                type="button"
                onClick={() => {
                  setDashboardTab("activity");
                  if (isMobile) {
                    setMobileMenuOpen(false);
                  }
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-4 py-3 text-[15px] font-medium transition-all duration-300",
                  dashboardTab === "activity"
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "text-foreground hover:bg-primary/5 hover:text-primary",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span>سجل النشاط</span>
                  <ClipboardList className={cn("size-4", dashboardTab === "activity" ? "text-white" : "text-primary/70")} />
                </div>
                <span className={cn("h-2.5 w-2.5 rounded-full", dashboardTab === "activity" ? "bg-white" : "bg-primary/20")} />
              </button>
            )}

            {canAccessBackup && (
            <button
              type="button"
              onClick={() => {
                setBackupDialogOpen(true);
                if (isMobile) {
                  setMobileMenuOpen(false);
                }
              }}
              className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-[15px] font-medium text-foreground transition-all duration-300 hover:bg-primary/5 hover:text-primary"
            >
              <div className="flex items-center gap-2.5">
                <span>النسخة الاحتياطية</span>
                <Database className="size-4 text-primary/70" />
              </div>
              <span className="h-2.5 w-2.5 rounded-full bg-primary/20" />
            </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const openCourseTemplatesDialog = () => {
    const course = activeCourse;
    setNotifTemplatePre(course?.assessmentNotificationTemplates.pre || getDefaultAssessmentNotificationTemplate("pre"));
    setNotifTemplatePost(course?.assessmentNotificationTemplates.post || getDefaultAssessmentNotificationTemplate("post"));
    setNotifTemplateTasks(course?.assessmentNotificationTemplates.tasks || getDefaultAssessmentNotificationTemplate("tasks"));
    setNotifTemplateFinalExam(data.finalExamSettings[effectiveFinalExamManageBranch]?.notificationTemplate || getDefaultFinalExamNotificationTemplate());
    setNotifTemplatesOpen(true);
  };
  const hasDashboardHeaderActions = dashboardTab === "home" || (dashboardTab === "finalexam" && canCreateCourses);

  const renderDashboardHeaderActions = (isMobile = false) => {
    const actionClassName = isMobile
      ? "h-12 w-full justify-between rounded-[1.1rem] border border-border/60 bg-white px-4 text-right font-bold text-foreground hover:bg-primary/5"
      : "rounded-full px-4 sm:px-5";
    const destructiveActionClassName = isMobile
      ? "h-12 w-full justify-between rounded-[1.1rem] border border-destructive/25 bg-white px-4 text-right font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
      : "rounded-full border-destructive/25 px-4 text-destructive hover:bg-destructive/10 hover:text-destructive sm:px-5";

    const handleAction = (callback: () => void) => {
      if (isMobile) {
        setMobileActionsOpen(false);
      }
      callback();
    };

    return (
      <>
        {dashboardTab === "home" && (
          <Button variant="outline" className={actionClassName} onClick={() => handleAction(() => setCourseLinksOpen(true))}>
            <span>الروابط</span>
            <Link2 className="size-4" />
          </Button>
        )}
        {dashboardTab === "finalexam" && canCreateCourses && (
          <>
            <Button variant="outline" className={actionClassName} onClick={() => handleAction(() => setFinalExamCopyOpen(true))}>
              <span>نسخ</span>
              <Copy className="size-4" />
            </Button>
            <Button
              variant="outline"
              className={cn(
                actionClassName,
                isFinalExamManageEnabled && "border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
              )}
              onClick={() => {
                if (isMobile) {
                  setMobileActionsOpen(false);
                }
                void handleToggleFinalExamAvailability();
              }}
            >
              <span>{isFinalExamManageEnabled ? "إيقاف" : "تفعيل"}</span>
              <Power className="size-4" />
            </Button>
          </>
        )}
        {dashboardTab === "home" && canManageDashboardAccounts && (
          <Button variant="outline" className={actionClassName} onClick={() => handleAction(() => void handleOpenAdmins())} aria-label="الإشراف" disabled={adminsLoading}>
            <span>{adminsLoading ? "جارٍ التحميل..." : "الإشراف"}</span>
            <ShieldCheck className="size-4" />
          </Button>
        )}
        {dashboardTab === "home" && canCreateCourses && (
          <Button variant="outline" className={actionClassName} onClick={() => handleAction(() => setCoursesManageOpen(true))}>
            <span>الدورات</span>
            <BookOpen className="size-4" />
          </Button>
        )}
        {dashboardTab === "home" && (
          <Button variant="outline" className={actionClassName} aria-label="قوالب الإشعارات" onClick={() => handleAction(openCourseTemplatesDialog)}>
            <span>قوالب الإشعارات</span>
            <FilePen className="size-4" />
          </Button>
        )}
      </>
    );
  };

  const renderPartGrid = (studentId: string, completedParts: number[]) => (
    <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="grid w-fit min-w-max grid-cols-5 gap-2 sm:grid-cols-6">
        {parts.map((part) => {
          const active = completedParts.includes(part);

          return (
            <button
              key={part}
              type="button"
              onClick={() => void store.toggleStudentPart(studentId, part)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-black leading-none transition-smooth sm:h-11 sm:w-11 sm:text-base",
                active
                  ? "border-cyan-200/30 bg-[linear-gradient(145deg,#0d7490,#0f3f5c)] text-white shadow-[0_12px_26px_rgba(8,61,93,0.35)] hover:brightness-110"
                  : "border-slate-200 bg-white text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.06)] hover:border-cyan-300 hover:text-primary hover:shadow-[0_10px_24px_rgba(14,116,144,0.12)]",
              )}
            >
              <span className="leading-none">{part}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!storedSession) {
    return <Navigate to="/" replace />;
  }

  if (!isHydrated) {
    return null;
  }

  if (!validatedSession) {
    return <Navigate to="/" replace />;
  }

  return (
    <div dir="rtl" className="h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fbfb,#eef5f5)] text-right text-foreground">
      <div className="flex h-full w-full items-start lg:flex-row">
        <aside className="sticky top-0 hidden h-screen w-[320px] shrink-0 border-l border-white/60 bg-white/95 shadow-[10px_0_35px_rgba(15,23,42,0.04)] lg:block">
          {renderDashboardNavigation()}
        </aside>

        <main className="h-screen min-w-0 flex-1 overflow-y-auto px-4 py-4 text-right md:px-6 lg:px-8 lg:py-8">
          <div className="w-full">
            {loadError && (
              <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm font-medium text-destructive">
                ⚠️ تعذر الاتصال بقاعدة البيانات: {loadError}
              </div>
            )}
            <div className="mb-6 rounded-[2rem] border border-white/70 bg-white/90 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="hidden text-right lg:block">
                <p className="text-xs font-medium text-muted-foreground">مرحبًا</p>
                <p className="text-sm font-bold text-foreground">{adminName}</p>
              </div>
              <div className="flex items-center justify-between gap-3 lg:hidden">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-full" aria-label="فتح قائمة لوحة التحكم">
                      <Menu className="size-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[320px] max-w-[88vw] border-l border-white/60 bg-white/95 p-0 text-right shadow-[10px_0_35px_rgba(15,23,42,0.08)] [&>button]:hidden">
                    <SheetTitle className="sr-only">قائمة لوحة التحكم</SheetTitle>
                    {renderDashboardNavigation(true)}
                  </SheetContent>
                </Sheet>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => handleGoToDashboardHome()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleGoToDashboardHome();
                    }
                  }}
                  className="min-w-0 flex-1 cursor-pointer text-right outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <p className="text-xs font-medium text-muted-foreground">لوحة التحكم</p>
                  <p className="truncate text-sm font-extrabold text-foreground">{activeMenuItem.label}</p>
                </div>
                {hasDashboardHeaderActions && (
                  <Sheet open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="icon" className="rounded-full" aria-label="إجراءات الصفحة الحالية">
                        <MoreHorizontal className="size-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-[2rem] border border-white/70 bg-white/95 px-4 pb-8 pt-6 text-right shadow-[0_-18px_50px_rgba(15,23,42,0.08)] [&>button]:hidden">
                      <SheetTitle className="sr-only">إجراءات الصفحة الحالية</SheetTitle>
                      <div className="mt-4 space-y-3">
                        {renderDashboardHeaderActions(true)}
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </div>
              <div className="hidden w-full flex-wrap items-center justify-start gap-2 sm:gap-3 lg:flex lg:w-auto lg:flex-nowrap lg:justify-end">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-full lg:hidden" aria-label="فتح قائمة لوحة التحكم">
                      <Menu className="size-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[320px] max-w-[88vw] border-l border-white/60 bg-white/95 p-0 text-right shadow-[10px_0_35px_rgba(15,23,42,0.08)] [&>button]:hidden">
                    <SheetTitle className="sr-only">قائمة لوحة التحكم</SheetTitle>
                    {renderDashboardNavigation(true)}
                  </SheetContent>
                </Sheet>
                {renderDashboardHeaderActions()}
              </div>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[1280px] overflow-x-hidden px-1 md:px-2">
              <div className="space-y-6">

        {dashboardTab === "home" && (
          <div className="space-y-5" dir="rtl">
            <div className="mx-auto w-full max-w-[1120px] space-y-5">

            {/* ─── Filters + section title ─────────────────────────────────── */}
            <div className={cn(dashboardCardClass, "rounded-[1.75rem] px-5 py-5") }>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="text-right">
                  <h3 className="text-[0.95rem] font-bold text-foreground">المؤشرات الإجمالية</h3>
                </div>
                <div className="w-full md:w-auto md:min-w-[140px]">
                  <Select value={homeBranchFilter} onValueChange={(value) => setHomeBranchFilter(value as IndicatorsBranchFilter)}>
                    <SelectTrigger className="h-11 w-full flex-row-reverse justify-between rounded-full border-primary/30 bg-white px-4 text-right shadow-sm [&>span]:text-right">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-right">
                      <SelectItem value="all" className="justify-end pr-3 text-right">الكل</SelectItem>
                      <SelectItem value="male" className="justify-end pr-3 text-right">المعلمون</SelectItem>
                      <SelectItem value="female" className="justify-end pr-3 text-right">المعلمات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ─── Circular KPI indicators ─────────────────────────────────── */}
            {(() => {
              const T = homeMetrics.totalStudents;
              const homeIndicators = [
                {
                  key: "memorization",
                  label: "مجموع الأجزاء المقروءة",
                  value: 100,
                  displayValue: homeMetrics.memorizationCount,
                  suffix: "",
                },
                {
                  key: "attendance",
                  label: "الحضور",
                  value: homeMetrics.attendanceRate,
                  displayValue: homeMetrics.attendanceRate,
                  suffix: "%",
                },
                {
                  key: "pre",
                  label: "الاختبار القبلي",
                  value: homeMetrics.pre.avg,
                  displayValue: homeMetrics.pre.avg,
                  suffix: "%",
                },
                {
                  key: "post",
                  label: "الاختبار البعدي",
                  value: homeMetrics.post.avg,
                  displayValue: homeMetrics.post.avg,
                  suffix: "%",
                },
                {
                  key: "tasks",
                  label: "المهام الأدائية",
                  value: T > 0 ? clampPercent((homeMetrics.tasksCount / T) * 100) : 0,
                  displayValue: T > 0 ? clampPercent((homeMetrics.tasksCount / T) * 100) : 0,
                  suffix: "%",
                },
                {
                  key: "completed30",
                  label: "الطلاب الذين أنهوا 30 جزءًا",
                  value: 100,
                  displayValue: homeMetrics.completed30Count,
                  suffix: "",
                },
              ];
              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10">
                  {homeIndicators.map((ind) => (
                    <ProgramIndicatorRing
                      key={ind.key}
                      label={ind.label}
                      progressValue={ind.value}
                      displayValue={ind.displayValue}
                      suffix={ind.suffix}
                    />
                  ))}
                </div>
              );
            })()}

            </div>


          </div>
        )}

        {dashboardTab === "activity" && (
          <div className="space-y-5" dir="rtl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[0.95rem] font-bold text-foreground">سجل النشاط</h3>
              </div>
              <Button variant="outline" className="rounded-full" onClick={() => void store.reloadActivityLogs()}>
                تحديث السجل
              </Button>
            </div>

            {data.activityLogs.length === 0 ? (
              <div className={cn(dashboardMutedPanelClass, "rounded-[1.5rem] border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground")}>
                لا توجد عمليات مسجلة حتى الآن.
              </div>
            ) : (
              <div className="grid gap-3">
                {data.activityLogs.map((entry) => (
                  <div key={entry.id} className={cn(dashboardMutedPanelClass, "rounded-[1.35rem] p-4")}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1 text-right">
                        <div className="text-sm font-bold text-foreground">{entry.action}</div>
                        <div className="text-sm text-muted-foreground">{entry.target}</div>
                      </div>
                      <Badge variant={entry.status === "نجحت" ? "default" : entry.status === "ألغيت" ? "secondary" : "destructive"} className="rounded-full px-3 py-1 text-xs">
                        {entry.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>المنفذ: {entry.actorName}</div>
                      <div>الدور: {entry.actorRole}</div>
                      <div>الوقت: {formatAttendanceTime(entry.createdAt)}</div>
                      <div>التفاصيل: {entry.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dashboardTab === "students" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-nowrap">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button className="gap-2 rounded-full px-4 sm:px-5" variant="outline" onClick={() => setImportResultsOpen(true)}>
                        <FileUp className="size-4" />
                        استيراد
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="rounded-xl px-3 py-1.5 text-sm">
                      استيراد نتائج من Excel
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button className="gap-2 rounded-full px-4 sm:px-5" variant="outline" onClick={() => setManualGradesOpen(true)}>
                  <Pencil className="size-4" />
                  تعديل الدرجات
                </Button>
                {hasPermission("add_student") && (
                  <Button className="rounded-full px-4 sm:px-5" onClick={() => openStudentEditor()}>
                    <Plus className="size-4" />
                    إضافة
                  </Button>
                )}
              </div>
            </div>

            <Card className={dashboardCardClass}>
              <CardHeader className="space-y-4 text-right">
                <div className="w-full max-w-[220px] space-y-2 text-right">
                    <div className="text-sm font-medium text-muted-foreground">الفرع</div>
                    {managedBranchId ? (
                      <div className="rounded-[0.9rem] border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                        {branchLabels[managedBranchId]}
                      </div>
                    ) : (
                      <Select value={selectedBranch} onValueChange={(value) => setSelectedBranch(value as IndicatorsBranchFilter)}>
                        <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">جميع الفروع</SelectItem>
                          {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                </div>
              </CardHeader>
              <CardContent>
                {branchStudents.length === 0 ? (
                  <div className={cn(dashboardEmptyStateClass, "p-6 text-sm text-muted-foreground")}>
                    {effectiveSelectedBranch === "all" ? "لا يوجد طلاب في جميع الفروع بعد." : `لا يوجد طلاب في فرع ${branchLabels[effectiveSelectedBranch]} بعد.`}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[1.25rem] border border-border/60 bg-white">
                    <Table className="min-w-[480px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-right">اسم الطالب/ة</TableHead>
                          <TableHead className="text-right">رقم الدخول</TableHead>
                          <TableHead className="w-[120px] text-right">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branchStudents.map((student) => (
                          <TableRow key={student.id}>
                            <TableCell className="text-right font-semibold text-foreground">{student.name}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{student.loginId}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                {hasPermission("edit_student") && (
                                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => openStudentEditor(student.id)}>
                                    <Pencil className="size-4" />
                                  </Button>
                                )}
                                {hasPermission("delete_student") && (
                                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-destructive" onClick={() => handleDeleteStudent(student.id)}>
                                    <Trash2 className="size-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {dashboardTab === "reciters" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-right">
                <h2 className="text-xl font-bold text-foreground">الإقراء</h2>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-label="توضيح تعديل بيانات المقرئ والطالب"
                    >
                      <AlertCircle className="size-5" aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    className="max-w-72 rounded-2xl border-primary/15 bg-white px-4 py-3 text-right text-base font-semibold leading-relaxed text-primary shadow-[0_20px_45px_rgba(14,116,144,0.14)]"
                  >
                    اضغط على اسم المقرئ/الطالب لتعديل البيانات
                  </PopoverContent>
                </Popover>
                {hasPermission("add_reciter") && (
                  <Button className="rounded-full px-4 sm:px-5" onClick={() => openReciterEditor()}>
                    <Plus className="size-4" />
                    إضافة
                  </Button>
                )}
              </div>
            </div>

            <Card className={dashboardCardClass}>
              <CardHeader className="space-y-4 text-right">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2 text-right">
                    <div className="text-sm font-medium text-muted-foreground">الفرع</div>
                    {managedBranchId ? (
                      <div className="rounded-[0.9rem] border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                        {branchLabels[managedBranchId]}
                      </div>
                    ) : (
                      <Select
                        value={reciterBranchFilter}
                        onValueChange={(value) => {
                          setReciterBranchFilter(value as BranchId);
                          setSelectedReciterFilter(RECITER_FILTER_ALL_STUDENTS);
                        }}
                      >
                        <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="text-sm font-medium text-muted-foreground">العرض</div>
                    <Select value={selectedReciterFilter} onValueChange={setSelectedReciterFilter}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                        <SelectValue placeholder="جميع الطلاب" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RECITER_FILTER_ALL_STUDENTS}>جميع الطلاب</SelectItem>
                        <SelectItem value={RECITER_FILTER_ALL_RECITERS}>جميع المقرئين</SelectItem>
                        <SelectItem value={RECITER_FILTER_CERTIFIED}>المجازون</SelectItem>
                        {branchReciters.map((reciter) => <SelectItem key={reciter.id} value={reciter.id}>{reciter.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {isAllStudentsReciterView && (
                    <div className="space-y-2 text-right">
                      <div className="text-sm font-medium text-muted-foreground">الفلتر</div>
                      <Select value={reciterSortFilter} onValueChange={(value) => setReciterSortFilter(value as "desc" | "asc")}>
                        <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">الأكثر فالأقل</SelectItem>
                          <SelectItem value="asc">الأقل فالأكثر</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {(isAllStudentsReciterView ? filteredReciterStudentRows.length === 0 : filteredReciters.length === 0) ? (
                  <div className={cn(dashboardEmptyStateClass, "p-6 text-sm text-muted-foreground")}>
                    {isAllStudentsReciterView
                      ? `لا يوجد طلاب مرتبطون بمقرئين في فرع ${branchLabels[effectiveReciterBranchFilter]} بعد.`
                      : `لا يوجد مقرئون في فرع ${branchLabels[effectiveReciterBranchFilter]} بعد.`}
                  </div>
                ) : (
                  <>
                    {isAllStudentsReciterView && (
                      <div className="grid gap-4 md:hidden">
                        {filteredReciterStudentRows.map(({ student, reciter }) => {
                          const hasTransferTarget = hasAvailableTransferTarget(student.branchId, reciter.id);

                          return (
                            <Card key={`${reciter.id}-${student.id}`} className={dashboardCardClass}>
                              <CardContent className="space-y-4 p-4">
                                <div className="text-right">
                                  {hasTransferTarget ? (
                                    <button
                                      type="button"
                                      className="font-bold text-foreground hover:text-primary hover:underline cursor-pointer"
                                      onClick={() => openAdminTransferDialog({
                                        studentId: student.id,
                                        studentName: student.name,
                                        branchId: student.branchId,
                                        currentReciterId: reciter.id,
                                      })}
                                    >
                                      {student.name}
                                    </button>
                                  ) : (
                                    <div className="font-bold text-foreground">{student.name}</div>
                                  )}
                                  <span
                                    className={cn(
                                      "mt-1 inline-flex min-h-6 min-w-[56px] items-center justify-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                                      student.isCertified ? "bg-green-100 text-green-700" : "invisible",
                                    )}
                                  >
                                    مجاز
                                  </span>
                                  <div className="text-xs text-muted-foreground">المقرئ الحالي: {reciter.name}</div>
                                  {!hasTransferTarget && <div className="mt-1 text-xs text-muted-foreground">لا يوجد مقرئ آخر متاح في نفس الفرع.</div>}
                                </div>
                                <div className="space-y-3 text-right">
                                  <div className="text-sm font-bold text-foreground">المقروء</div>
                                  <div className="flex justify-end">
                                    {renderPartGrid(student.id, student.completedParts)}
                                  </div>
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      className={cn(
                                        "inline-flex h-10 min-w-[98px] items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors",
                                        student.isCertified
                                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                                          : "border border-border text-muted-foreground hover:border-green-500 hover:text-green-700",
                                      )}
                                      onClick={() => store.toggleCertifiedStudent(student.id)}
                                    >
                                      {student.isCertified ? "مجاز" : "اعتماد"}
                                    </button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}

                    <div className={cn("overflow-x-auto rounded-[1.25rem] border border-border/60 bg-white", isAllStudentsReciterView && "hidden md:block")}>
                      <Table className={isAllStudentsReciterView ? "min-w-[900px]" : isSpecificReciterView ? "min-w-[760px]" : showReciterProgressColumn ? "min-w-[980px]" : "min-w-[720px]"}>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          {isAllStudentsReciterView ? (
                            <>
                              <TableHead className="text-right">الطالب</TableHead>
                              <TableHead className="text-center">المقروء</TableHead>
                              <TableHead className="text-center">الاعتماد</TableHead>
                            </>
                          ) : isSpecificReciterView ? (
                            <>
                              <TableHead className="text-right">اسم المقرئ</TableHead>
                              <TableHead className="text-center">المقروء</TableHead>
                            </>
                          ) : (
                            <>
                              <TableHead className="text-right">اسم المقرئ</TableHead>
                              <TableHead className="text-right">الطلاب المرتبطون</TableHead>
                              {showReciterProgressColumn && <TableHead className="text-center">المقروء</TableHead>}
                              <TableHead className="text-right">رقم الدخول</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isAllStudentsReciterView ? filteredReciterStudentRows.map(({ student, reciter }) => {
                          const hasTransferTarget = hasAvailableTransferTarget(student.branchId, reciter.id);

                          return (
                            <TableRow key={`${reciter.id}-${student.id}`}>
                              <TableCell className="text-right align-top">
                                <div className="space-y-3 text-right">
                                  <div className="space-y-1 text-right">
                                    {hasTransferTarget ? (
                                      <button
                                        type="button"
                                        className="font-semibold text-foreground hover:text-primary hover:underline cursor-pointer"
                                        onClick={() => openAdminTransferDialog({
                                          studentId: student.id,
                                          studentName: student.name,
                                          branchId: student.branchId,
                                          currentReciterId: reciter.id,
                                        })}
                                      >
                                        {student.name}
                                      </button>
                                    ) : (
                                      <div className="font-semibold text-foreground">{student.name}</div>
                                    )}
                                    <span
                                      className={cn(
                                        "inline-flex min-h-6 min-w-[56px] items-center justify-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                                        student.isCertified ? "bg-green-100 text-green-700" : "invisible",
                                      )}
                                    >
                                      مجاز
                                    </span>
                                  {!hasTransferTarget && <div className="text-[11px] text-muted-foreground">لا يوجد مقرئ آخر متاح في نفس الفرع</div>}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{reciter.name}</div>
                                </div>
                              </TableCell>
                              <TableCell className="min-w-[320px] text-center align-top">
                                <div className="flex flex-col items-center gap-3">
                                  {renderPartGrid(student.id, student.completedParts)}
                                </div>
                              </TableCell>
                              <TableCell className="text-center align-middle">
                                <button
                                  type="button"
                                  className={cn(
                                    "inline-flex h-10 min-w-[98px] items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors",
                                    student.isCertified
                                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                                      : "border border-border text-muted-foreground hover:border-green-500 hover:text-green-700",
                                  )}
                                  onClick={() => store.toggleCertifiedStudent(student.id)}
                                >
                                  {student.isCertified ? "مجاز" : "اعتماد"}
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        }) : filteredReciters.map((reciter) => {
                          const linkedStudents = data.students.filter((student) => reciter.studentIds.includes(student.id));

                          return (
                            <TableRow key={reciter.id}>
                              <TableCell className="align-top text-right">
                                <div className="space-y-3">
                                  <button
                                    type="button"
                                    className="w-fit text-right font-semibold text-foreground transition-smooth hover:text-primary"
                                    onClick={() => handleOpenReciterActions(reciter.id)}
                                  >
                                    {reciter.name}
                                  </button>
                                </div>
                              </TableCell>
                              {!isSpecificReciterView && (
                                <TableCell className="text-right text-muted-foreground">
                                  {linkedStudents.length > 0 ? (
                                    <div className="space-y-2">
                                      {linkedStudents.map((student) => (
                                        <div key={student.id} className="font-medium text-foreground">{student.name}</div>
                                      ))}
                                    </div>
                                  ) : "-"}
                                </TableCell>
                              )}
                              {showReciterProgressColumn && (
                                <TableCell className="min-w-[360px] text-center align-top">
                                  <div className="flex justify-center">
                                    {linkedStudents.length > 0 ? (
                                      <div className="space-y-3">
                                        {linkedStudents.map((student) => (
                                          <div key={student.id} className="space-y-2">
                                            {linkedStudents.length > 1 && <div className="text-sm font-medium text-muted-foreground">{student.name}</div>}
                                            <div className="flex justify-center">
                                              {renderPartGrid(student.id, student.completedParts)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">-</span>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              {!isSpecificReciterView && <TableCell className="text-right text-muted-foreground">{reciter.loginCode}</TableCell>}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {dashboardTab === "notifications" && (
          <div className="space-y-6">
            <div className="text-right">
              <h2 className="text-xl font-bold text-foreground">الإشعارات</h2>
            </div>

            <Card className={dashboardCardClass}>
              <CardHeader className="space-y-4 text-right">
                <div className="grid gap-4 md:grid-cols-2 md:items-start">
                  <div className="space-y-2 text-right">
                    <div className="text-sm font-medium text-muted-foreground">الفرع</div>
                    {managedBranchId ? (
                      <div className="rounded-[0.9rem] border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                        {branchLabels[managedBranchId]}
                      </div>
                    ) : (
                      <Select value={notificationForm.targetBranchId} onValueChange={(value) => setNotificationForm((current) => ({ ...current, targetBranchId: value as "all" | BranchId, targetLoginIds: [] }))}>
                        <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">جميع الفروع</SelectItem>
                          {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="text-sm font-medium text-muted-foreground">نص الشعار</div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Textarea
                        value={notificationForm.message}
                        onChange={(event) => setNotificationForm((current) => ({ ...current, message: event.target.value }))}
                        placeholder="اكتب الشعار الذي تريد إرساله للطلاب"
                        className="min-h-10 flex-1 resize-none"
                        rows={1}
                      />
                      {(notificationTargetBranchId || notificationForm.targetBranchId === "all") && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full shrink-0 sm:w-auto"
                          onClick={() => setNotificationForm((current) => ({
                            ...current,
                            targetLoginIds: allNotificationTargetStudentsSelected ? [] : notificationTargetStudents.map((student) => student.loginId),
                          }))}
                        >
                          {allNotificationTargetStudentsSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(notificationTargetBranchId || notificationForm.targetBranchId === "all") && (
                  <div className="space-y-3 rounded-[1.25rem] border border-border/60 bg-white p-4">
                    <div className="space-y-2 rounded-[1rem] border border-border/60 p-3">
                      {notificationTargetStudents.map((student) => {
                        const isChecked = notificationForm.targetLoginIds.includes(student.loginId);

                        return (
                          <label key={student.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[0.9rem] border border-border/50 bg-muted/10 px-3 py-2">
                            <div className="text-right font-medium text-foreground">{student.name}</div>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={isChecked}
                              onClick={() => setNotificationForm((current) => ({
                                ...current,
                                targetLoginIds: isChecked
                                  ? current.targetLoginIds.filter((loginId) => loginId !== student.loginId)
                                  : [...current.targetLoginIds, student.loginId],
                              }))}
                              className={cn(
                                "h-5 w-5 shrink-0 rounded-full border transition-smooth",
                                isChecked
                                  ? "border-primary bg-primary"
                                  : "border-primary bg-white",
                              )}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleSaveNotification} disabled={notificationSubmitting} className="rounded-full px-5">
                    {notificationSubmitting ? "جارٍ الإرسال..." : "إرسال"}
                  </Button>
                </div>

                {notificationError && <p className="text-sm font-medium text-destructive">{notificationError}</p>}

              </CardContent>
            </Card>
          </div>
        )}

        {dashboardTab === "tasks" && <AdminTasksTab canEdit={canCreateCourses} managedBranchId={managedBranchId} />}

        {dashboardTab === "attendance" && (() => {
          const allCourses = [...courseItems, ...getTasks(data).sort((a, b) => a.sortOrder - b.sortOrder)];
          const effectiveBranchId: BranchId = managedBranchId ?? attendanceBranchId;
          const branchStudents = getBranchStudents(data, effectiveBranchId).sort((a, b) => a.name.localeCompare(b.name, "ar"));
          const selectedCourseForAttendance = allCourses.find((c) => c.id === attendanceCourseId) ?? allCourses[0] ?? null;

          const presentForCourse = new Set(
            data.attendance
              .filter((r) => r.courseId === (selectedCourseForAttendance?.id ?? ""))
              .map((r) => r.loginId),
          );

          const displayChecked = attendanceCourseId === (selectedCourseForAttendance?.id ?? "")
            ? attendanceChecked
            : presentForCourse;

          const handleCourseChange = (courseId: string) => {
            setAttendanceCourseId(courseId);
            setAttendanceFileError("");
            setAttendanceChecked(new Set(
              data.attendance.filter((r) => r.courseId === courseId).map((r) => r.loginId),
            ));
          };

          const handleToggle = (loginId: string) => {
            setAttendanceCourseId(selectedCourseForAttendance?.id ?? "");
            const next = new Set(displayChecked);
            if (next.has(loginId)) next.delete(loginId); else next.add(loginId);
            setAttendanceChecked(next);
          };

          const isAllSelected = branchStudents.length > 0 && branchStudents.every((s) => displayChecked.has(s.loginId));

          const handleToggleAll = () => {
            const courseId = selectedCourseForAttendance?.id ?? "";
            setAttendanceCourseId(courseId);
            if (isAllSelected) {
              setAttendanceChecked(new Set());
            } else {
              setAttendanceChecked(new Set(branchStudents.map((s) => s.loginId)));
            }
          };

          const handleSave = () => {
            if (!selectedCourseForAttendance) return;
            const presentStudents = branchStudents.filter((s) => displayChecked.has(s.loginId));
            const previousPresentStudents = [...new Set(
              data.attendance
                .filter((record) => record.courseId === selectedCourseForAttendance.id)
                .map((record) => record.loginId),
            )]
              .map((loginId) => data.students.find((student) => student.loginId === loginId) ?? null)
              .filter((student): student is StudentRecord => Boolean(student));
            const previousLoginIds = new Set(previousPresentStudents.map((student) => student.loginId));
            const nextLoginIds = new Set(presentStudents.map((student) => student.loginId));
            const unchangedCount = [...previousLoginIds].filter((loginId) => nextLoginIds.has(loginId)).length;
            const changedCount = new Set([...previousLoginIds, ...nextLoginIds]).size - unchangedCount;

            setPendingAttendanceSave({
              courseId: selectedCourseForAttendance.id,
              courseTitle: selectedCourseForAttendance.title,
              isTask,
              branchLabel: managedBranchId ? branchLabels[managedBranchId] : attendanceBranchId === "male" ? "معلمين" : "معلمات",
              presentStudents,
              previousPresentStudents,
              changedCount,
            });
          };

          const handleAttendanceFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setAttendanceFileError("");

            try {
              const rows = await loadSpreadsheetRows(file);

              if (rows.length === 0) {
                setAttendanceFileError("تعذر العثور على ورقة داخل ملف الإكسل.");
                return;
              }

              // collect all non-empty cells as candidate login IDs / names
              // Detect header row
              const normalizeCell = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
              const firstRow = (rows[0] ?? []).map(normalizeCell);
              const isLoginCol = (h: string) => h.includes("دخول") || h.includes("كود") || h.includes("login") || h.includes("code") || h.includes("رقم");
              const isNameCol = (h: string) => h.includes("اسم") || h.includes("name");
              const hasHeader = firstRow.some(isLoginCol) || firstRow.some(isNameCol);
              const header = hasHeader ? firstRow : [];
              const dataRows = rows.slice(hasHeader ? 1 : 0);

              let loginColIdx = hasHeader ? header.findIndex(isLoginCol) : -1;
              let nameColIdx = hasHeader ? header.findIndex(isNameCol) : -1;

              if (!hasHeader) {
                // auto-detect: pick columns with most filled cells
                const colCounts = new Map<number, number>();
                for (const row of dataRows) {
                  (row as unknown[]).forEach((cell, ci) => {
                    if (normalizeCell(cell)) colCounts.set(ci, (colCounts.get(ci) ?? 0) + 1);
                  });
                }
                const sorted = [...colCounts.entries()].sort((a, b) => b[1] - a[1]);
                if (sorted.length > 0) nameColIdx = sorted[0][0];
                if (sorted.length > 1) loginColIdx = sorted[1][0];
              }

              // Build lookup maps from the branch students
              const loginMap = new Map(branchStudents.map((s) => [s.loginId.trim(), s.loginId]));
              const nameMap = new Map(branchStudents.map((s) => [
                s.name.trim().replace(/\s+/g, " "),
                s.loginId,
              ]));

              const matched = new Set<string>();
              const unmatched: string[] = [];

              for (const row of dataRows) {
                const r = row as unknown[];
                const rawLogin = loginColIdx >= 0 ? normalizeCell(r[loginColIdx]) : "";
                const rawName = nameColIdx >= 0 ? normalizeCell(r[nameColIdx]) : "";

                let resolvedLoginId: string | undefined;
                if (rawLogin) resolvedLoginId = loginMap.get(rawLogin);
                if (!resolvedLoginId && rawName) resolvedLoginId = nameMap.get(rawName);
                // fuzzy: try matching name substring
                if (!resolvedLoginId && rawName) {
                  for (const [sName, sLogin] of nameMap) {
                    if (sName.includes(rawName) || rawName.includes(sName)) {
                      resolvedLoginId = sLogin;
                      break;
                    }
                  }
                }

                if (resolvedLoginId) {
                  matched.add(resolvedLoginId);
                } else if (rawLogin || rawName) {
                  unmatched.push(rawLogin || rawName);
                }
              }

              if (matched.size === 0) {
                setAttendanceFileError("لم يتم التعرف على أي طالب من الملف. تأكد من وجود عمود رقم الدخول أو الاسم.");
                return;
              }

              setAttendanceChecked(matched);
              const msg = unmatched.length > 0
                ? `تم تحضير ${matched.size} طالب. لم يُتعرف على: ${unmatched.slice(0, 5).join("، ")}${unmatched.length > 5 ? ` +${unmatched.length - 5}` : ""}`
                : `تم ${isTask ? "تحديد" : "تحضير"} ${matched.size} طالب من الملف.`;
              toast({ title: "تم قراءة الملف", description: msg });
              setAttendanceFileError("");
            } catch (error) {
              const message = error instanceof Error ? error.message.toLowerCase() : "";
              if (message.includes("legacy-xls-unsupported")) {
                setAttendanceFileError("صيغة .xls القديمة غير مدعومة. احفظ الملف كـ .xlsx أو .csv.");
              } else {
                setAttendanceFileError("تعذر قراءة الملف. جرّب حفظه كـ .xlsx أو .csv.");
              }
            }
          };

          const isTask = selectedCourseForAttendance?.entityType === "task";
          const presentLabel = isTask ? "منفذ" : "حاضر";

          if (!attendanceCourseId && selectedCourseForAttendance) {
            // initialise on first render without state update during render
          }

          return (
            <div className="space-y-5">
              <input
                ref={attendanceFileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleAttendanceFileSelect}
              />
              <Card className={dashboardCardClass}>
                <CardHeader>
                  <CardTitle className="text-xl">التحضير</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={cn("grid gap-4", managedBranchId ? "md:grid-cols-[minmax(0,1fr)_7rem]" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]")}>
                    {!managedBranchId && (
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-foreground">الفرع</label>
                        <Select value={attendanceBranchId} onValueChange={(v) => setAttendanceBranchId(v as BranchId)}>
                          <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                          <SelectContent className="text-right">
                            <SelectItem value="male" className="justify-end pr-3 text-right">معلمين</SelectItem>
                            <SelectItem value="female" className="justify-end pr-3 text-right">معلمات</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-foreground">الدورة / المهام</label>
                      <div className="flex items-center gap-2">
                        <div className="w-full">
                          <Select
                            value={attendanceCourseId || (selectedCourseForAttendance?.id ?? "")}
                            onValueChange={handleCourseChange}
                          >
                            <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue placeholder="اختر الدورة" /></SelectTrigger>
                            <SelectContent className="text-right">
                              {courseItems.map((c) => <SelectItem key={c.id} value={c.id} className="justify-end pr-3 text-right">{c.title}</SelectItem>)}
                              {getTasks(data).sort((a, b) => a.sortOrder - b.sortOrder).map((t) => <SelectItem key={t.id} value={t.id} className="justify-end pr-3 text-right">تكليف: {t.title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {branchStudents.length > 0 && (
                          <button
                            type="button"
                            aria-label={isAllSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                            aria-pressed={isAllSelected}
                            className={cn(
                              "shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors md:hidden",
                              isAllSelected ? "border-primary bg-primary" : "border-primary/70 bg-transparent",
                            )}
                            onClick={handleToggleAll}
                          />
                        )}
                      </div>
                    </div>
                    {branchStudents.length > 0 && (
                      <div className="hidden md:flex md:flex-col md:justify-end md:space-y-2">
                        <div className="h-6" aria-hidden="true" />
                        <div className="flex h-10 w-28 items-center justify-center translate-x-2">
                          <button
                            type="button"
                            aria-label={isAllSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                            aria-pressed={isAllSelected}
                            className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                              isAllSelected ? "border-primary bg-primary" : "border-primary/70 bg-transparent",
                            )}
                            onClick={handleToggleAll}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedCourseForAttendance && (
                    <>
                      <Separator />
                      {attendanceFileError && (
                        <p className="text-sm font-medium text-destructive">{attendanceFileError}</p>
                      )}

                      {branchStudents.length === 0 ? (
                        <div className={cn(dashboardEmptyStateClass, "p-5 text-sm text-muted-foreground")}>لا يوجد طلاب في هذا الفرع.</div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-3 md:hidden">
                            {branchStudents.map((student) => {
                              const checked = displayChecked.has(student.loginId);
                              const alreadyDone = isTask && (
                                data.submissions.some((s) => s.courseId === selectedCourseForAttendance.id && s.assessmentType === "tasks" && s.loginId === student.loginId) ||
                                data.attendance.some((r) => r.courseId === selectedCourseForAttendance.id && r.loginId === student.loginId)
                              );

                              return (
                                <button
                                  key={student.id}
                                  type="button"
                                  className="w-full rounded-[1.25rem] border border-border/60 bg-white p-4 text-right shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition-colors hover:border-primary/30 hover:bg-primary/5"
                                  onClick={() => handleToggle(student.loginId)}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 text-right">
                                      <div className="font-bold text-foreground">{student.name}</div>
                                      <div className="text-xs text-muted-foreground">رقم الدخول: {student.loginId}</div>
                                      {isTask && (
                                        <div className={cn("text-xs font-bold", alreadyDone ? "text-emerald-700" : "text-rose-600")}>
                                          {alreadyDone ? "منفذ" : "غير منفذ"}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col items-center gap-2 shrink-0">
                                      <span className="text-xs font-medium text-muted-foreground">{presentLabel}</span>
                                      <span
                                        className={cn(
                                          "inline-flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                                          checked ? "border-primary bg-primary" : "border-primary/70 bg-transparent",
                                        )}
                                        aria-hidden="true"
                                      />
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          <div className="hidden overflow-hidden rounded-[1.25rem] border border-border/60 bg-white md:block">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-right">الاسم</TableHead>
                                  <TableHead className="text-right">رقم الدخول</TableHead>
                                  {isTask && <TableHead className="text-right">الحالة</TableHead>}
                                  <TableHead className="w-28 text-center">{presentLabel}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {branchStudents.map((student) => {
                                  const checked = displayChecked.has(student.loginId);
                                  const alreadyDone = isTask && (
                                    data.submissions.some((s) => s.courseId === selectedCourseForAttendance.id && s.assessmentType === "tasks" && s.loginId === student.loginId) ||
                                    data.attendance.some((r) => r.courseId === selectedCourseForAttendance.id && r.loginId === student.loginId)
                                  );
                                  return (
                                    <TableRow
                                      key={student.id}
                                      className="cursor-pointer hover:bg-muted/30"
                                      onClick={() => handleToggle(student.loginId)}
                                    >
                                      <TableCell className="font-medium">{student.name}</TableCell>
                                      <TableCell className="text-muted-foreground">{student.loginId}</TableCell>
                                      {isTask && (
                                        <TableCell className={cn("text-xs font-medium", alreadyDone ? "text-emerald-700" : "text-rose-600")}>
                                          {alreadyDone ? "منفذ" : "غير منفذ"}
                                        </TableCell>
                                      )}
                                      <TableCell className="text-center align-middle">
                                        <button
                                          type="button"
                                          role="checkbox"
                                          aria-checked={checked}
                                          aria-label={`${presentLabel} ${student.name}`}
                                          className={cn(
                                            "inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                                            checked ? "border-primary bg-primary" : "border-primary/70 bg-transparent",
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggle(student.loginId);
                                          }}
                                        />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button className="w-full sm:w-auto" onClick={() => void handleSave()} disabled={attendanceSaving}>
                          {attendanceSaving ? "جاري الحفظ..." : isTask ? "حفظ المهام" : "حفظ التحضير"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {dashboardTab === "indicators" && (
          <div className="space-y-6">
                  <div className="flex items-center justify-end gap-2">
                    {(hasPermission("edit_student") || hasPermission("delete_student") || hasPermission("edit_reciter") || hasPermission("delete_reciter")) && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="group relative overflow-visible rounded-full"
                        onClick={() => openEntityManager("student")}
                        aria-label="إدارة البيانات"
                      >
                        <Pencil className="size-4" />
                        <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/20 bg-white px-3 py-1.5 text-xs font-bold text-primary opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                          تعديل البيانات
                        </span>
                      </Button>
                    )}
                    {(hasPermission("add_student") || hasPermission("add_reciter")) && (
                      <Button
                        size="icon"
                        className="group relative overflow-visible rounded-full"
                        onClick={() => openUnifiedCreateDialog(hasPermission("add_student") ? "student" : "reciter")}
                        aria-label="إضافة"
                      >
                        <Plus className="size-5" />
                        <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/20 bg-white px-3 py-1.5 text-xs font-bold text-primary opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                          إضافة
                        </span>
                      </Button>
                    )}
                  </div>

                  <div className="grid w-full gap-4 md:max-w-2xl md:grid-cols-2">
                    <div className="space-y-2 text-right">
                      <div className="text-sm font-medium text-muted-foreground">الفرع</div>
                      <Select value={indicatorsBranchId} onValueChange={(value) => setIndicatorsBranchId(value as IndicatorsBranchFilter)}>
                        <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">جميع الفروع</SelectItem>
                          {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 text-right">
                      <div className="text-sm font-medium text-muted-foreground">الفلتر</div>
                      <Select value={indicatorsSortOrder} onValueChange={(value) => setIndicatorsSortOrder(value as "alpha" | "overall-desc" | "overall-asc") }>
                        <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alpha">الترتيب الأبجدي أ-ي</SelectItem>
                          <SelectItem value="overall-desc">الأعلى فالأقل إنجازًا</SelectItem>
                          <SelectItem value="overall-asc">الأقل فالأعلى إنجازًا</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {indicatorMetrics.totalStudents === 0 ? (
                    <div className={cn(dashboardEmptyStateClass, "p-6 text-sm text-muted-foreground")}>
                      {indicatorsBranchId === "all" ? "لا يوجد طلاب في جميع الفروع بعد." : `لا يوجد طلاب في فرع ${branchLabels[indicatorsBranchId]} بعد.`}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {indicatorMetrics.studentRows.length === 0 ? (
                        <div className={cn(dashboardEmptyStateClass, "p-6 text-sm text-muted-foreground")}>
                          لا يوجد طلاب لعرض مؤشراتهم في الدورة المختارة.
                        </div>
                      ) : (
                        indicatorMetrics.studentRows.map((student) => {
                          const itemMetrics = [
                            { label: "الأجزاء", value: student.memorizationPercent },
                            { label: "الحضور", value: student.attendancePercent },
                            { label: "القبلي", value: student.prePercent },
                            { label: "البعدي", value: student.postPercent },
                            { label: "المهام الأدائية", value: student.tasksPercent },
                            { label: "الإجمالي", value: student.overallPercent },
                          ];

                          return (
                            <Card key={student.id} className={dashboardCardClass}>
                              <CardContent className="space-y-5 p-5">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-foreground">{student.name}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">المقرئ: {student.reciterName}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">رقم الدخول: {student.loginId}</div>
                                  </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {itemMetrics.map((metric) => (
                                    metric.label === "الأجزاء" ? (
                                      <button
                                        key={metric.label}
                                        type="button"
                                        className="space-y-2 rounded-[1.1rem] border border-border/60 bg-white p-4 text-right transition-colors hover:border-primary/30 hover:bg-primary/5"
                                        onClick={() => setPartsDialogStudentId(student.id)}
                                      >
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                          <span className="font-medium text-muted-foreground">{metric.label}</span>
                                          <span className="font-bold text-foreground">{formatPercent(metric.value)}</span>
                                        </div>
                                        <Progress value={clampPercent(metric.value)} className="h-2.5 bg-muted" />
                                      </button>
                                    ) : (
                                      <div key={metric.label} className="space-y-2 rounded-[1.1rem] border border-border/60 bg-white p-4">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                          <span className="font-medium text-muted-foreground">{metric.label}</span>
                                          <span className="font-bold text-foreground">{formatPercent(metric.value)}</span>
                                        </div>
                                        <Progress value={clampPercent(metric.value)} className="h-2.5 bg-muted" />
                                      </div>
                                    )
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  )}

            {indicatorsBranchId !== "all" && (
              <Card className={dashboardCardClass}>
                <CardHeader className="text-right">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {hasPermission("add_reciter") && (
                        <Button className="gap-2 rounded-full px-4 sm:px-5" variant="outline" onClick={() => openUnifiedCreateDialog("reciter")}>
                          <Plus className="size-4" />
                          إضافة مقرئ
                        </Button>
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-xl">المقرئون</CardTitle>
                      <CardDescription>جميع المقرئين في الفرع المحدد.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {indicatorReciters.length === 0 ? (
                    <div className={cn(dashboardEmptyStateClass, "p-6 text-sm text-muted-foreground")}>
                      لا يوجد مقرئون في هذا الفرع بعد.
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {indicatorReciters.map((reciter) => {
                        const linkedStudents = data.students.filter((student) => reciter.studentIds.includes(student.id));

                        return (
                          <Card key={reciter.id} className={dashboardPlainPanelClass}>
                            <CardContent className="space-y-4 p-4 text-right">
                              <div className="flex items-start justify-between gap-3">
                                <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => openEntityManager("reciter", reciter.id)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <div>
                                  <div className="font-bold text-foreground">{reciter.name}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">رقم الدخول: {reciter.loginCode}</div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="text-sm font-medium text-muted-foreground">الطلاب المرتبطون</div>
                                {linkedStudents.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">لا يوجد طلاب مرتبطون.</div>
                                ) : (
                                  <div className="flex flex-wrap justify-end gap-2">
                                    {linkedStudents.map((student) => (
                                      <span key={student.id} className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-xs font-medium text-foreground">
                                        {student.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {dashboardTab === "reader" && (
          <div className="grid gap-6 xl:grid-cols-[0.33fr_0.67fr]">
            <Card className={dashboardCardClass}>
              <CardHeader><CardDescription>اختر حساب المقرئ</CardDescription><CardTitle className="text-xl">حساب المقرئ</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedReciter?.id ?? ""} onValueChange={setSelectedReciterId}>
                  <SelectTrigger><SelectValue placeholder="اختر مقرئًا" /></SelectTrigger>
                  <SelectContent>{data.reciters.map((reciter) => <SelectItem key={reciter.id} value={reciter.id}>{reciter.name}</SelectItem>)}</SelectContent>
                </Select>
                <div className={cn(dashboardMutedPanelClass, "p-4 text-sm leading-7 text-muted-foreground")}>في هذا الحساب يظهر الطلاب المرتبطون بالمقرئ فقط، مع تحديد الأجزاء المقروءة وترتيب تلقائي من الأكثر حفظًا إلى الأقل.</div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {!selectedReciter && <Card className={dashboardEmptyStateClass}><CardContent className="p-6 text-sm text-muted-foreground">أضف مقرئًا ثم اختره لعرض طلابه.</CardContent></Card>}
              {selectedReciter && reciterStudents.length === 0 && <Card className={dashboardEmptyStateClass}><CardContent className="p-6 text-sm text-muted-foreground">لا يوجد طلاب مرتبطون بالمقرئ الحالي.</CardContent></Card>}
              {selectedReciter && reciterStudents.map((student, index) => (
                <Card key={student.id} className={dashboardCardClass}>
                  <CardHeader className="space-y-1 text-right">
                    <div><CardDescription>الترتيب #{index + 1}</CardDescription><CardTitle className="text-lg">{student.name}</CardTitle></div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {student.note && <div className={cn(dashboardMutedPanelClass, "p-4 text-sm text-muted-foreground")}>{student.note}</div>}
                    <div className="space-y-3 text-right">
                      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-bold text-foreground">المقروء</div>
                          <div className="text-xs text-muted-foreground">{branchLabels[student.branchId]}</div>
                        </div>
                        <div className="text-lg font-black text-primary">{student.completedParts.length} / 30</div>
                      </div>
                      {renderPartGrid(student.id, student.completedParts)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {dashboardTab === "permissions" && (() => {
          const permissionGroups: Array<{ label: string; permissions: Array<{ key: PermissionKey; label: string }> }> = [
            {
              label: "الطلاب",
              permissions: [
                { key: "add_student", label: "إضافة طالب" },
                { key: "delete_student", label: "حذف طالب" },
                { key: "edit_student", label: "تعديل بيانات طالب" },
              ],
            },
            {
              label: "الاختبارات",
              permissions: [
                { key: "edit_pre_questions", label: "تعديل أسئلة الاختبار القبلي" },
                { key: "edit_post_questions", label: "تعديل أسئلة الاختبار البعدي" },
                { key: "edit_tasks", label: "تعديل المهام الأدائية" },
                { key: "open_pre_exam", label: "فتح الاختبار القبلي" },
                { key: "open_post_exam", label: "فتح الاختبار البعدي" },
              ],
            },
            {
              label: "الإقراء",
              permissions: [
                { key: "add_reciter", label: "إضافة مقرئ" },
                { key: "delete_reciter", label: "حذف مقرئ" },
                { key: "edit_reciter", label: "تعديل بيانات مقرئ" },
                { key: "transfer_reciter_student", label: "نقل الطالب المرتبط بمقرئ" },
              ],
            },
            {
              label: "الصفحات",
              permissions: [
                { key: "page_notifications", label: "صفحة الإشعارات" },
                { key: "page_results", label: "صفحة النتائج" },
              ],
            },
            {
              label: "سجل النشاط والنسخة الاحتياطية",
              permissions: [
                { key: "page_activity_log", label: "صفحة سجل النشاط" },
                { key: "backup_export", label: "تصدير نسخة احتياطية" },
                { key: "backup_import", label: "رفع نسخة احتياطية" },
                { key: "backup_restore", label: "استرجاع نسخة احتياطية" },
              ],
            },
          ];

          return (
            <div className="grid gap-6 md:grid-cols-2">
              {(["male_manager", "female_manager"] as const).map((role) => (
                <Card key={role} className={dashboardCardClass}>
                  <CardHeader>
                    <CardDescription>إدارة الصلاحيات</CardDescription>
                    <CardTitle className="text-xl">{role === "male_manager" ? "مسؤول المعلمين" : "مسؤول المعلمات"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 pb-5">
                    {permissionGroups.map((group) => (
                      <div key={group.label}>
                        <div className="pt-4 pb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{group.label}</div>
                        {group.permissions.map((perm) => {
                          const isEnabled = data.rolePermissions?.[role]?.[perm.key] === true;
                          return (
                            <div key={perm.key} className="flex items-center justify-between border-b border-border/40 py-3 last:border-0">
                              <span className={cn("text-sm font-medium", !isEnabled && "text-muted-foreground")}>{perm.label}</span>
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(v) => void store.setRolePermission(role, perm.key, v)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}

        {dashboardTab === "satisfaction" && (() => {
          const courseResponses = selectedSatisfactionCourse
            ? (data.satisfactionResponses ?? []).filter((r) => r.courseId === selectedSatisfactionCourse.id)
            : [];
          const ratingIndicators = selectedSatisfactionQuestions
            .filter((q) => q.type === "rating")
            .map((q) => {
              const values = courseResponses
                .filter((r) => r.questionId === q.id && r.ratingValue != null)
                .map((r) => r.ratingValue as number);
              const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
              return { question: q, average, count: values.length };
            });
          const toRatingPercent = (value: number | null) => (value == null ? 0 : clampPercent(value * 10));
          return (
            <div className="space-y-6" dir="rtl">

              {/* ─── Manage questions ────────────────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="w-full sm:w-72">
                    <Select value={selectedSatisfactionCourse?.id ?? ""} onValueChange={setSatisfactionCourseId}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                        <SelectValue placeholder="اختر الدورة" />
                      </SelectTrigger>
                      <SelectContent>
                        {satisfactionCourseItems.map((course) => (
                          <SelectItem key={course.id} value={course.id} className="justify-end pr-3 text-right">
                            {course.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="group relative overflow-visible rounded-full border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        const initialQuestion = selectedSatisfactionQuestions[0] ?? data.satisfactionQuestions[0] ?? null;
                        setSatisfactionDeleteQuestionKey(initialQuestion ? getSatisfactionDeleteQuestionKey(initialQuestion.prompt, initialQuestion.type) : "");
                        setSatisfactionDeleteCourseId(selectedSatisfactionCourse?.id ?? ALL_SATISFACTION_DELETE_COURSES);
                        setSatisfactionDeleteDialogOpen(true);
                      }}
                      aria-label="حذف"
                    >
                      <Trash2 className="size-4" />
                      <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-destructive/20 bg-white px-3 py-1.5 text-xs font-bold text-destructive opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                        حذف
                      </span>
                    </Button>
                    <Button
                      size="icon"
                      className="group relative overflow-visible rounded-full"
                      disabled={!selectedSatisfactionCourse}
                      onClick={() => setSatisfactionAddDialogOpen(true)}
                      aria-label="إضافة"
                    >
                      <Plus className="size-4" />
                      <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/20 bg-white px-3 py-1.5 text-xs font-bold text-primary opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                        إضافة
                      </span>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[0.95rem] font-bold text-foreground">مؤشرات الاستبيان</h3>
                {!selectedSatisfactionCourse ? (
                  <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-white/70 p-6 text-center text-sm text-muted-foreground">
                    اختر دورة لعرض المؤشرات.
                  </div>
                ) : ratingIndicators.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-white/70 p-6 text-center text-sm text-muted-foreground">
                    لا توجد أسئلة تقييم في هذه الدورة بعد.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10">
                    {ratingIndicators.map(({ question, average, count }) => {
                      const percentValue = toRatingPercent(average);
                      return (
                        <ProgramIndicatorRing
                          key={question.id}
                          label={question.prompt}
                          helperText={`${count} إجابة`}
                          progressValue={percentValue}
                          displayValue={percentValue}
                          formatDisplay={formatPercent}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <Dialog open={satisfactionAddDialogOpen} onOpenChange={(open) => {
          setSatisfactionAddDialogOpen(open);
          if (!open) {
            setNewSurveyPrompt("");
            setNewSurveyType("rating");
            setNewSurveyRequired(true);
          }
        }}>
          <DialogContent className="max-w-xl rounded-[1.75rem] text-right [&>button]:hidden" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-right text-xl">إضافة سؤال جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {satisfactionCourseItems.length > 0 ? "سيتم إضافة هذا السؤال تلقائيًا لجميع الاختبارات البعدية في الدورات." : "لا توجد دورات تحتوي على اختبار بعدي بعد."}
              </div>
              <Input
                value={newSurveyPrompt}
                onChange={(e) => setNewSurveyPrompt(e.target.value)}
                placeholder="نص السؤال"
                className="text-right"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSurveyPrompt.trim() && satisfactionCourseItems.length > 0) {
                    void store.addSatisfactionQuestion({ prompt: newSurveyPrompt.trim(), type: newSurveyType, isRequired: newSurveyRequired });
                    setSatisfactionAddDialogOpen(false);
                    setNewSurveyPrompt("");
                    setNewSurveyType("rating");
                    setNewSurveyRequired(true);
                  }
                }}
              />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="sm:w-56">
                  <Select value={newSurveyType} onValueChange={(v) => setNewSurveyType(v as "rating" | "text")}>
                    <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rating" className="justify-end pr-3 text-right">تقييم (0-10)</SelectItem>
                      <SelectItem value="text" className="justify-end pr-3 text-right">نص حر</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground select-none">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={newSurveyRequired}
                    id="survey-required-dialog"
                    onClick={() => setNewSurveyRequired((current) => !current)}
                    className={cn(
                      "h-5 w-5 shrink-0 rounded-full border transition-smooth",
                      newSurveyRequired
                        ? "border-primary bg-primary"
                        : "border-primary bg-white",
                    )}
                  />
                  <span>إلزامي</span>
                </label>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setSatisfactionAddDialogOpen(false)}>إلغاء</Button>
                <Button
                  disabled={!newSurveyPrompt.trim() || satisfactionCourseItems.length === 0}
                  onClick={async () => {
                    if (!newSurveyPrompt.trim() || satisfactionCourseItems.length === 0) return;
                    await store.addSatisfactionQuestion({ prompt: newSurveyPrompt.trim(), type: newSurveyType, isRequired: newSurveyRequired });
                    setSatisfactionAddDialogOpen(false);
                    setNewSurveyPrompt("");
                    setNewSurveyType("rating");
                    setNewSurveyRequired(true);
                  }}
                >
                  إضافة
                </Button>
              </div>
            </div>
            </DialogContent>
          </Dialog>

        <Dialog open={satisfactionDeleteDialogOpen} onOpenChange={(open) => {
          setSatisfactionDeleteDialogOpen(open);
          if (!open) {
            setSatisfactionDeleteQuestionKey("");
            setSatisfactionDeleteCourseId(ALL_SATISFACTION_DELETE_COURSES);
          }
        }}>
          <DialogContent className="max-w-xl rounded-[1.75rem] text-right [&>button]:hidden" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-right text-xl">حذف سؤال من الاستبيان</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-bold text-foreground">اختر السؤال</div>
                <Select value={satisfactionDeleteQuestionKey} onValueChange={setSatisfactionDeleteQuestionKey}>
                  <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                    <SelectValue placeholder="اختر السؤال" />
                  </SelectTrigger>
                  <SelectContent>
                    {satisfactionDeleteQuestionOptions.map((question) => (
                      <SelectItem key={question.key} value={question.key} className="justify-end pr-3 text-right">
                        {question.prompt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-bold text-foreground">اختر الدورة</div>
                <Select value={satisfactionDeleteCourseId} onValueChange={setSatisfactionDeleteCourseId} disabled={!satisfactionDeleteQuestionKey}>
                  <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                    <SelectValue placeholder="اختر الدورة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SATISFACTION_DELETE_COURSES} className="justify-end pr-3 text-right">جميع الدورات</SelectItem>
                    {satisfactionDeleteCourseOptions.map((course) => (
                      <SelectItem key={course.id} value={course.id} className="justify-end pr-3 text-right">
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setSatisfactionDeleteDialogOpen(false)}>إلغاء</Button>
                <Button variant="destructive" disabled={!satisfactionDeleteQuestionKey} onClick={() => void handleDeleteSelectedSatisfactionQuestion()}>
                  حذف السؤال
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Preview text dialog */}
        <Dialog open={satisfactionPreviewText != null} onOpenChange={(open) => { if (!open) setSatisfactionPreviewText(null); }}>
          <DialogContent className="max-w-lg rounded-[1.75rem] text-right [&>button]:hidden" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-right text-lg">{satisfactionPreviewText?.split("\n\n")[0]}</DialogTitle>
            </DialogHeader>
            <div className="whitespace-pre-wrap rounded-[1.25rem] border border-border/60 bg-muted/20 p-4 text-sm text-foreground leading-relaxed">
              {satisfactionPreviewText?.split("\n\n").slice(1).join("\n\n")}
            </div>
          </DialogContent>
        </Dialog>

        {dashboardTab === "finalexam" && (
          <AdminFinalExamTab
            canEdit={canCreateCourses}
            managedBranchId={managedBranchId}
            selectedBranch={finalExamManageBranch}
            onBranchChange={setFinalExamManageBranch}
          />
        )}

        {dashboardTab === "courses" && (
          <div className="space-y-6">

            <div className="space-y-4">              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCourseOrderDragEnd}>
                <SortableContext items={courseItems.map((c) => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {courseItems.length === 0 && <Card className={cn(dashboardEmptyStateClass, "md:col-span-2 lg:col-span-3")}><CardContent className="p-6 text-sm text-muted-foreground">لا توجد دورات بعد.</CardContent></Card>}
                    {courseItems.map((course) => (
                      <SortableCourseCard key={course.id} id={course.id}>
                    <Card className={dashboardCardClass}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-right">
                          <CardTitle className="min-h-[4rem] text-lg leading-8">{course.title}</CardTitle>
                        </div>
                        <div className="flex justify-start gap-1.5">
                          {canCreateCourses && (
                            <>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-foreground">
                                    <Pencil className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="min-w-[10rem] rounded-2xl bg-white text-right">
                                  <DropdownMenuItem className="justify-end text-right" onSelect={() => handleEditCourse(course.id, course.title)}>
                                    تعديل الاسم
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="justify-end text-right" onSelect={() => handleOpenAssessmentModel(course.id, "pre")}>
                                    عرض الأسئلة
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive" onClick={() => handleDeleteCourse(course.id)}>
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {([
                          {
                            type: "pre" as const,
                            label: "الاختبار القبلي",
                            active: managedBranchId ? isAssessmentEnabledForCourse(course, "pre", managedBranchId) : isAssessmentEnabledForCourse(course, "pre"),
                          },
                          {
                            type: "post" as const,
                            label: "الاختبار البعدي",
                            active: managedBranchId ? isAssessmentEnabledForCourse(course, "post", managedBranchId) : isAssessmentEnabledForCourse(course, "post"),
                          },
                        ]).map((item) => (
                          (() => {
                            const isOpen = course.isActive && item.active;
                            const closesAt = getAssessmentAvailabilityDeadline(course, item.type, managedBranchId);

                            return (
                          <button
                            key={item.type}
                            type="button"
                            onClick={() => {
                              const permKey: PermissionKey = item.type === "pre" ? "open_pre_exam" : "open_post_exam";
                              if (!hasPermission(permKey)) return;
                              const isOpen = course.isActive && item.active;
                              if (isOpen) {
                                if (managedBranchId) {
                                  void handleToggleAssessmentAvailability(course.id, item.type, managedBranchId);
                                } else {
                                  handleOpenAssessmentManageDialog(course.id, item.type);
                                }
                              } else {
                                handleOpenAssessmentAvailabilityDialog(course.id, item.type);
                                setAssessmentPickerStep("timer");
                                setAssessmentActionPicker({ courseId: course.id, assessmentType: item.type });
                              }
                            }}
                            className={cn(
                              "block rounded-[1rem] border p-3 text-center text-sm font-bold transition-smooth",
                              isOpen
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                : "border-border/70 bg-muted/30 text-muted-foreground hover:border-primary/25 hover:text-primary",
                            )}
                          >

                            <div>{item.label}</div>
                            {isOpen && closesAt && <div className="mt-1 text-[11px] font-medium"><CountdownLabel closesAt={closesAt} /></div>}
                          </button>
                            );
                          })()
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  </SortableCourseCard>
                ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {courseItems.length > 0 && (
              <Card className={dashboardCardClass}>
                <CardHeader className="text-right">
                  <CardTitle className="text-xl">مؤشرات الدورات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-foreground">الدورة</label>
                      <Select value={courseIndicatorsCourseId} onValueChange={setCourseIndicatorsCourseId}>
                        <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                          <SelectValue placeholder="اختر الدورة" />
                        </SelectTrigger>
                        <SelectContent className="text-right">
                          <SelectItem value={ALL_COURSE_INDICATORS_ID} className="justify-end pr-3 text-right">
                            جميع الدورات
                          </SelectItem>
                          {courseItems.map((course) => (
                            <SelectItem key={course.id} value={course.id} className="justify-end pr-3 text-right">
                              {course.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-foreground">الفرع</label>
                      {managedBranchId ? (
                        <div className="flex h-10 items-center rounded-2xl border border-border/60 bg-muted/20 px-4 text-sm font-medium text-foreground">
                          {branchLabels[managedBranchId]}
                        </div>
                      ) : (
                        <Select value={courseIndicatorsBranch} onValueChange={(value) => setCourseIndicatorsBranch(value as IndicatorsBranchFilter)}>
                          <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="text-right">
                            <SelectItem value="all" className="justify-end pr-3 text-right">الكل</SelectItem>
                            <SelectItem value="male" className="justify-end pr-3 text-right">معلمين</SelectItem>
                            <SelectItem value="female" className="justify-end pr-3 text-right">معلمات</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>

                  {courseIndicatorsMetrics && (
                    <div className="flex flex-col items-center justify-center gap-6 rounded-[1.5rem] border border-border/60 bg-muted/10 px-4 py-6 lg:flex-row lg:gap-8">
                      <ProgramIndicatorRing
                        label="الاختبار القبلي"
                        helperText={`${courseIndicatorsMetrics.preCount} طالب`}
                        progressValue={courseIndicatorsMetrics.pre}
                        displayValue={courseIndicatorsMetrics.pre}
                      />

                      <div
                        className={cn(
                          "flex items-center gap-2 px-1 py-1 text-center",
                          courseIndicatorsMetrics.rise >= 0
                            ? "text-emerald-600"
                            : "text-rose-600",
                        )}
                      >
                        <span className="text-xl font-black">
                          {Math.abs(Math.round(courseIndicatorsMetrics.rise))}%
                        </span>
                        {courseIndicatorsMetrics.rise >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                      </div>

                      <ProgramIndicatorRing
                        label="الاختبار البعدي"
                        helperText={`${courseIndicatorsMetrics.postCount} طالب`}
                        progressValue={courseIndicatorsMetrics.post}
                        displayValue={courseIndicatorsMetrics.post}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedCourse && selectedCourseAssessment && (
              <div className="grid gap-6 xl:grid-cols-[0.7fr_0.3fr]">
                <div className="space-y-6">
                  {(() => {
                    const assessmentType = selectedCourseAssessment;
                    const form = questionForms[assessmentType];
                    const questions = assessmentType === "pre" ? selectedCourse.preQuestions : assessmentType === "post" ? selectedCourse.postQuestions : selectedCourse.taskQuestions;

                    return (
                      <Card className={dashboardCardClass}>
                        <CardHeader>
                          <CardDescription>المرحلة 5</CardDescription>
                          <CardTitle className="text-xl">{assessmentLabels[assessmentType]} - {selectedCourse.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                          <input ref={questionPdfImportInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handleQuestionPdfImport(event)} />
                          <div className="flex justify-end rounded-[1.25rem] border border-dashed border-border/70 bg-muted/20 p-4">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 shrink-0 rounded-2xl"
                              onClick={() => {
                                setQuestionImportTarget(assessmentType);
                                questionPdfImportInputRef.current?.click();
                              }}
                              disabled={!canEditCourseModels || isImportingQuestions[assessmentType]}
                            >
                              <FileUp className="size-4" />
                              {isImportingQuestions[assessmentType] ? "جارٍ التفريغ..." : "تفريغ الأسئلة"}
                            </Button>
                          </div>

                          {/* Split paste area */}
                          <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-muted/20 p-4 space-y-3">
                            <label className="text-sm font-bold text-foreground">تقسيم الأسئلة</label>
                            <div className="flex gap-2">
                              <Textarea
                                value={splitText[assessmentType]}
                                onChange={(e) => setSplitText((c) => ({ ...c, [assessmentType]: e.target.value }))}
                                placeholder={"الصق الأسئلة هنا... سيتم تقسيمها تلقائياً\n\nمثال:\n١. ما هو...\nأ. خيار 1\nب. خيار 2"}
                                className="min-h-[100px] flex-1 text-sm"
                                disabled={!canEditCourseModels}
                              />
                              <Button
                                type="button"
                                className="h-auto rounded-2xl px-4 self-stretch"
                                onClick={() => handleSplitQuestions(assessmentType)}
                                disabled={!canEditCourseModels || !splitText[assessmentType].trim()}
                              >
                                تقسيم
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-bold text-foreground">السؤال</label>
                              <Textarea value={form.prompt} onChange={(event) => setQuestionForms((current) => ({ ...current, [assessmentType]: { ...current[assessmentType], prompt: event.target.value } }))} placeholder="اكتب السؤال" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground">نوع السؤال</label>
                              <Select value={form.type} onValueChange={(value) => {
                                const newType = value as "multiple" | "text" | "truefalse";
                                setQuestionForms((current) => ({
                                  ...current,
                                  [assessmentType]: {
                                    ...current[assessmentType],
                                    type: newType,
                                    points: newType === "truefalse" ? "1" : current[assessmentType].points,
                                    correctAnswer: newType === "truefalse" ? "صح" : current[assessmentType].correctAnswer,
                                  },
                                }));
                              }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="multiple">اختيار من متعدد</SelectItem>
                                  <SelectItem value="truefalse">صح وخطأ</SelectItem>
                                  <SelectItem value="text">نص</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground">إرفاق ملف</label>
                              <Select value={form.allowFile} onValueChange={(value) => setQuestionForms((current) => ({ ...current, [assessmentType]: { ...current[assessmentType], allowFile: value as "yes" | "no" } }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="yes">يسمح</SelectItem>
                                  <SelectItem value="no">لا يسمح</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground">درجة السؤال</label>
                              <Input value={form.points} onChange={(event) => setQuestionForms((current) => ({ ...current, [assessmentType]: { ...current[assessmentType], points: event.target.value } }))} placeholder="1" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground">الإجابة الصحيحة</label>
                              {form.type === "truefalse" ? (
                                <Select value={form.correctAnswer} onValueChange={(v) => setQuestionForms((c) => ({ ...c, [assessmentType]: { ...c[assessmentType], correctAnswer: v } }))}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="صح">صح</SelectItem>
                                    <SelectItem value="خطأ">خطأ</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input value={form.correctAnswer} onChange={(event) => setQuestionForms((current) => ({ ...current, [assessmentType]: { ...current[assessmentType], correctAnswer: event.target.value } }))} placeholder="للدرجات التلقائية" />
                              )}
                            </div>
                            {form.type === "multiple" && (
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-bold text-foreground">الخيارات</label>
                                <Input
                                  value={form.optionsText}
                                  onChange={(event) => setQuestionForms((current) => ({ ...current, [assessmentType]: { ...current[assessmentType], optionsText: event.target.value } }))}
                                  onPaste={(event) => {
                                    const pastedValue = event.clipboardData.getData("text");
                                    const pastedOptions = splitPastedQuestionOptions(pastedValue);

                                    if (pastedOptions.length < 2) {
                                      return;
                                    }

                                    event.preventDefault();
                                    setQuestionForms((current) => {
                                      const currentValue = current[assessmentType].optionsText.trim();
                                      const normalizedOptions = pastedOptions.join(" | ");

                                      return {
                                        ...current,
                                        [assessmentType]: {
                                          ...current[assessmentType],
                                          optionsText: currentValue ? `${currentValue} | ${normalizedOptions}` : normalizedOptions,
                                        },
                                      };
                                    });
                                  }}
                                  placeholder="خيار 1 | خيار 2 | خيار 3"
                                />
                              </div>
                            )}
                          </div>
                          {questionErrors[assessmentType] && <p className="text-sm font-medium text-destructive">{questionErrors[assessmentType]}</p>}
                          {questionImportMessages[assessmentType] && <p className="text-sm font-medium text-emerald-700">{questionImportMessages[assessmentType]}</p>}
                          {hasPermission(assessmentType === "pre" ? "edit_pre_questions" : assessmentType === "post" ? "edit_post_questions" : "edit_tasks") && (
                          <Button onClick={() => handleAddQuestion(assessmentType)}>حفظ في هذه الدورة فقط</Button>
                          )}
                          <Separator />
                          {renderQuestionsList(assessmentType, questions)}
                        </CardContent>
                      </Card>
                    );
                  })()}
                </div>

                <div className="space-y-6">
                  <Card className={dashboardCardClass}>
                    <CardHeader><CardDescription>الرابط الثابت</CardDescription><CardTitle className="text-xl">الدورة المفعلة فقط</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <p>يبقى الرابط ثابتًا، لكنه يعرض فقط الدورة المفعلة حاليًا للطالب.</p>
                      <div className="space-y-2">
                        <div className={cn(dashboardMutedPanelClass, "p-4")}>قبلي: {getCourseLink("pre")}</div>
                        <div className={cn(dashboardMutedPanelClass, "p-4")}>بعدي: {getCourseLink("post")}</div>
                      </div>
                      <div className="grid gap-2">
                        <Button variant="outline" onClick={() => handleCopyCourseLink("pre")}>نسخ رابط القبلي</Button>
                        <Button variant="outline" onClick={() => handleCopyCourseLink("post")}>نسخ رابط البعدي</Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10 bg-white/90">
                    <CardHeader><CardDescription>التحضير</CardDescription><CardTitle className="text-xl">حضور الاختبار البعدي</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {selectedCourseAttendance.length === 0 && <div className="rounded-3xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">لا يوجد تحضير بعد.</div>}
                      {selectedCourseAttendance.map((record) => (
                        <div key={record.id} className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
                          <div className="font-bold text-foreground">{record.studentName}</div>
                          <div className="text-xs text-muted-foreground">رقم الدخول: {record.loginId}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/10 bg-white/90">
                    <CardHeader><CardDescription>الإجابات</CardDescription><CardTitle className="text-xl">آخر الإرسالات</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {selectedCourseSubmissions.length === 0 && <div className="rounded-3xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">لا توجد إجابات حتى الآن.</div>}
                      {selectedCourseSubmissions.slice().reverse().slice(0, 6).map((submission) => (
                        <div key={submission.id} className="rounded-3xl border border-primary/10 bg-white p-4">
                          <div className="mb-1 font-bold text-foreground">{submission.studentName}</div>
                          <div className="text-xs text-muted-foreground">{assessmentLabels[submission.assessmentType]} - {submission.loginId}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {dashboardTab === "results" && (
          <div className="space-y-6">
            <Card className="border-primary/10 bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl text-right">لوحة النتائج</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">القسم</label>
                    <Select value={isResultsFinalExamSelected ? FINAL_EXAM_RESULTS_ID : resultsCourse?.id ?? ""} onValueChange={(v) => {
                      if (v === FINAL_EXAM_RESULTS_ID) {
                        setResultsCourseId(v);
                        return;
                      }

                      const isTask = getTasks(data).some((t) => t.id === v);
                      setResultsCourseId(v);
                      if (isTask) setResultsType("tasks");
                      else if (resultsType === "tasks") setResultsType("attendance");
                    }}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                      <SelectContent className="text-right">
                        {courseItems.length > 0 && courseItems.map((course) => <SelectItem key={course.id} value={course.id} className="justify-end pr-3 text-right">{course.title}</SelectItem>)}
                        {getTasks(data).length > 0 && [...getTasks(data)].sort((a, b) => a.sortOrder - b.sortOrder).map((task) => <SelectItem key={task.id} value={task.id} className="justify-end pr-3 text-right">تكليف: {task.title}</SelectItem>)}
                        <SelectItem value={FINAL_EXAM_RESULTS_ID} className="justify-end pr-3 text-right">الاختبار النهائي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">الفرع</label>
                    <Select value={resultsBranchId} onValueChange={(value) => setResultsBranchId(value as IndicatorsBranchFilter)}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-right">
                        <SelectItem value="all" className="justify-end pr-3 text-right">جميع الفروع</SelectItem>
                        {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id} className="justify-end pr-3 text-right">{branch.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {!isResultsFinalExamSelected && resultsCourse?.entityType !== "task" && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">نوع البيانات</label>
                    <Select value={resultsType} onValueChange={(value) => setResultsType(value as "attendance" | AssessmentType)}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-right">
                        <SelectItem value="attendance" className="justify-end pr-3 text-right">التحضير</SelectItem>
                        <SelectItem value="pre" className="justify-end pr-3 text-right">الاختبار القبلي</SelectItem>
                        <SelectItem value="post" className="justify-end pr-3 text-right">الاختبار البعدي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  {resultsCourse && resultsType === "attendance" && resultsCourse.entityType !== "task" && (
                    <div className="space-y-2 md:col-span-2 lg:col-span-1">
                      <label className="text-sm font-bold text-foreground">الطلاب</label>
                      <Select value={resultsAttendanceFilter} onValueChange={(value) => setResultsAttendanceFilter(value as "all" | "present" | "absent" | "frequent-absent") }>
                        <SelectTrigger className="min-h-12 flex-row-reverse rounded-2xl border-primary/20 bg-primary/[0.03] text-right shadow-sm [&>span]:line-clamp-1 [&>span]:text-right"><SelectValue /></SelectTrigger>
                        <SelectContent className="text-right">
                          <SelectItem value="all" className="justify-end pr-3 text-right">جميع الطلاب</SelectItem>
                          <SelectItem value="present" className="justify-end pr-3 text-right">الحاضرين</SelectItem>
                          <SelectItem value="absent" className="justify-end pr-3 text-right">الغائبين</SelectItem>
                          <SelectItem value="frequent-absent" className="justify-end pr-3 text-right">غائبين 3 مرات فأكثر</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {!resultsCourse && !isResultsFinalExamSelected && (
              <Card className="border-dashed border-primary/20 bg-white/80">
                <CardContent className="p-6 text-sm text-muted-foreground">أنشئ دورة أولًا لعرض النتائج.</CardContent>
              </Card>
            )}

            {resultsCourse && resultsType === "attendance" && resultsCourse.entityType !== "task" && (
              <Card className="border-primary/10 bg-white/90">
                <CardContent className="space-y-3">
                  {filteredAttendanceStudents.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">
                      {resultsAttendanceFilter === "present"
                        ? "لا يوجد طلاب حاضرون حتى الآن."
                        : resultsAttendanceFilter === "absent"
                          ? "لا يوجد طلاب غائبون."
                          : resultsAttendanceFilter === "frequent-absent"
                            ? "لا يوجد طلاب غائبون 3 مرات فأكثر."
                            : resultsBranchId === "all"
                              ? "لا يوجد طلاب في جميع الفروع."
                              : "لا يوجد طلاب في هذا الفرع."}
                    </div>
                  )}

                  {filteredAttendanceStudents.map((student) => {
                    const isPresent = presentLoginIds.has(student.loginId);

                    return (
                      <div key={student.id} className="flex flex-col gap-3 rounded-[1.25rem] border border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.9)_100%)] px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:flex-row sm:items-start sm:justify-between sm:border-0 sm:bg-transparent sm:px-0 sm:py-2 sm:shadow-none last:border-b-0">
                        <div className="min-w-0 text-right">
                          <div className="truncate font-bold text-black">{student.name}</div>
                          <div className="text-xs text-muted-foreground">{student.loginId}</div>
                        </div>
                        <div className={cn("self-start rounded-full px-3 py-1 text-sm font-medium", isPresent ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                          {isPresent ? "حاضر" : "غائب"}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {resultsCourse && resultsType !== "attendance" && (
              <Card className="border-primary/10 bg-white/90">
                <CardHeader>
                  <CardDescription>{resultsCourse.title}</CardDescription>
                  <CardTitle className="text-xl">{resultsCourse.entityType === "task" ? `المهمة الأدائية - ${resultsBranchId === "all" ? "جميع الفروع" : branchLabels[resultsBranchId]}` : `${assessmentLabels[resultsType]} - ${resultsBranchId === "all" ? "جميع الفروع" : branchLabels[resultsBranchId]}`}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resultsRows.length === 0 && <div className="rounded-3xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">{resultsBranchId === "all" ? "لا يوجد طلاب في جميع الفروع." : "لا يوجد طلاب في هذا الفرع."}</div>}
                  {resultsRows.map((row) => {
                    const isTaskResult = resultsCourse.entityType === "task";
                    const isCompletedTask = isTaskResult && row.score > 0;

                    return (
                    <div key={row.studentId} className="flex flex-col gap-3 rounded-[1.35rem] border border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.96)_100%)] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] md:flex-row md:items-center md:justify-between md:shadow-none">
                      <button type="button" className="min-w-0 text-right" disabled={!row.hasViewableAnswers} onClick={() => row.hasViewableAnswers && row.submissionId && setDetailsSubmissionId(row.submissionId)}>
                        <div className="truncate font-bold text-foreground">{row.studentName}</div>
                        <div className="text-xs text-muted-foreground">{row.loginId}</div>
                      </button>
                      <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:w-auto md:flex-nowrap md:justify-start">
                        {isTaskResult ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "justify-center gap-1.5 rounded-full px-3 py-2 sm:py-1",
                              isCompletedTask
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-border/60 bg-muted/30 text-muted-foreground",
                            )}
                          >
                            {isCompletedTask ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
                            {isCompletedTask ? "منفذ" : "غير منفذ"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="justify-center border-primary/20 px-3 py-2 text-primary sm:py-1">
                            {row.score} / {row.total}
                          </Badge>
                        )}
                        {row.hasViewableAnswers && row.submissionId ? (
                          <Button variant="outline" className="h-10 w-full rounded-xl sm:h-9 sm:w-9 sm:px-0" onClick={() => setDetailsSubmissionId(row.submissionId)} aria-label={`عرض إجابات ${row.studentName}`}>
                            <Eye className="size-4 sm:mx-auto" />
                            <span className="sm:hidden">عرض الإجابة</span>
                          </Button>
                        ) : (
                          <span className="rounded-xl bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">{isTaskResult ? "لا توجد إجابة" : "لم يرسل"}</span>
                        )}
                      </div>
                    </div>
                  )})}
                </CardContent>
              </Card>
            )}

            {isResultsFinalExamSelected && (() => {
              const feBranch = managedBranchId ?? (resultsBranchId === "all" ? "male" : resultsBranchId);
              const feQuestions = (data.finalExamQuestions ?? []).filter((q) => q.branchCode === feBranch);
              const feTotal = feQuestions.reduce((sum, q) => sum + q.points, 0);
              const feSubs = (data.finalExamSubmissions ?? []).filter((s) => s.branchCode === feBranch);
              return (
                <Card className="border-primary/10 bg-white/90">
                  <CardContent className="space-y-3">
                    {feSubs.length === 0 && <div className="rounded-3xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">لا توجد إجابات بعد.</div>}
                    {feSubs.map((sub) => {
                      const score = typeof sub.manualScore === "number" ? sub.manualScore : null;
                      const hasViewableAnswers = (sub.answers ?? []).some((answer) => answer.questionId !== "__score_override__");
                      return (
                          <div key={sub.id} className="flex flex-col gap-3 rounded-[1.35rem] border border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.96)_100%)] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] md:flex-row md:items-center md:justify-between md:shadow-none">
                          <button type="button" className="min-w-0 text-right" disabled={!hasViewableAnswers} onClick={() => hasViewableAnswers && setFinalExamDetailsSubmissionId(sub.id)}>
                            <div className="truncate font-bold text-foreground">{sub.studentName}</div>
                            <div className="text-xs text-muted-foreground">{sub.loginCode} · {new Date(sub.submittedAt).toLocaleDateString("ar-SA")}</div>
                          </button>
                          <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:w-auto md:flex-nowrap md:justify-start">
                            {finalExamScoreEdit?.submissionId === sub.id ? (
                              <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
                                <Input className="h-8 w-20 rounded-xl text-center" value={finalExamScoreEdit.value} onChange={(e) => setFinalExamScoreEdit((c) => c ? { ...c, value: e.target.value } : null)} />
                                <Button size="sm" className="rounded-xl h-8" onClick={() => {
                                  if (!finalExamScoreEdit) return;
                                  const n = Number(finalExamScoreEdit.value);
                                  if (!Number.isFinite(n) || n < 0) return;
                                  void handleSaveFinalExamManualScore(sub.id, n, score, sub.studentName);
                                }}>حفظ</Button>
                                <Button size="sm" variant="ghost" className="rounded-xl h-8" onClick={() => setFinalExamScoreEdit(null)}>إلغاء</Button>
                              </div>
                            ) : (
                              <>
                                <Badge variant="outline" className="justify-center border-primary/20 px-3 py-2 text-primary sm:py-1">{score != null ? `${score} / ${feTotal}` : `— / ${feTotal}`}</Badge>
                                <Button variant="outline" size="sm" className="h-10 rounded-xl sm:h-8" onClick={() => setFinalExamScoreEdit({ submissionId: sub.id, value: score != null ? String(score) : "" })}>
                                  <Pencil className="size-3.5" />
                                </Button>
                                {hasViewableAnswers ? (
                                  <Button variant="outline" className="h-10 w-full rounded-xl sm:h-9 sm:w-9 sm:px-0" onClick={() => setFinalExamDetailsSubmissionId(sub.id)} aria-label={`عرض إجابات ${sub.studentName}`}>
                                    <Eye className="size-4 sm:mx-auto" />
                                    <span className="sm:hidden">عرض الإجابة</span>
                                  </Button>
                                ) : (
                                  <span className="rounded-xl bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">لا توجد إجابة</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        )}

              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={Boolean(assessmentActionPicker)} onOpenChange={(open) => { if (!open) { setAssessmentActionPicker(null); setAssessmentPickerStep("pick"); resetAssessmentAvailabilityDialog(); } }}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          {assessmentPickerStep === "timer" && (
            <>
              <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
                <DialogTitle className="text-right text-xl">مؤقت فتح الاختبار</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 p-4">
                {!managedBranchId && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">الفرع</label>
                    <Select value={assessmentTargetBranch ?? "all"} onValueChange={(v) => setAssessmentTargetBranch(v as AssessmentOpenBranch)}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {!assessmentRestrictToBranchOnly && <SelectItem value="all" className="justify-end pr-3 text-right">الكل</SelectItem>}
                        {assessmentBlockedBranch !== "male" && <SelectItem value="male" className="justify-end pr-3 text-right">معلمين</SelectItem>}
                        {assessmentBlockedBranch !== "female" && <SelectItem value="female" className="justify-end pr-3 text-right">معلمات</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">المدة بالدقائق</label>
                  <Input
                    value={assessmentDurationMinutes}
                    onChange={(event) => setAssessmentDurationMinutes(event.target.value)}
                    placeholder="مثال: 30"
                    disabled={assessmentNoTimeLimit}
                  />
                </div>
                <label className="flex cursor-pointer items-center justify-start gap-2 text-sm">
                  <span
                    onClick={() => setAssessmentNoTimeLimit((v) => !v)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${assessmentNoTimeLimit ? "border-primary bg-primary" : "border-border bg-white"}`}
                  >
                    {assessmentNoTimeLimit && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <input
                    type="checkbox"
                    checked={assessmentNoTimeLimit}
                    onChange={(e) => setAssessmentNoTimeLimit(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="font-medium text-foreground">بدون مهلة (مفتوح حتى الإغلاق اليدوي)</span>
                </label>
                {assessmentAvailabilityError && <p className="text-sm font-medium text-destructive">{assessmentAvailabilityError}</p>}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" disabled={assessmentSubmitting} onClick={() => setAssessmentActionPicker(null)}>إلغاء</Button>
                  <Button
                    disabled={assessmentSubmitting}
                    onClick={async () => {
                      const opened = await handleConfirmAssessmentAvailability();
                      if (opened) {
                        setAssessmentActionPicker(null);
                      }
                    }}
                  >
                    {assessmentSubmitting ? "جارٍ الفتح..." : "فتح"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(crossCourseConflict)} onOpenChange={(open) => { if (!open) setCrossCourseConflict(null); }}>
        <AlertDialogContent className="rounded-[1.75rem] text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right">تنبيه: اختبار مفتوح في دورة أخرى</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {crossCourseConflict && (
                <>
                  <span className="font-bold text-foreground">{assessmentLabels[crossCourseConflict.pendingType]}</span>
                  {" مفتوح حاليًا في دورة "}
                  <span className="font-bold text-foreground">"{crossCourseConflict.conflictingCourseTitle}"</span>
                  {". سيتم إيقافه تلقائيًا عند فتح الاختبار الجديد. هل تريد المتابعة؟"}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={async () => {
                const opened = await handleConfirmAssessmentAvailability();
                if (opened) {
                  setAssessmentActionPicker(null);
                }
              }}
            >
              {assessmentSubmitting ? "جارٍ الفتح..." : "متابعة"}
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => setCrossCourseConflict(null)}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(assessmentManageDialog)} onOpenChange={(open) => { if (!open) { setAssessmentManageDialog(null); setAssessmentManageChoice(""); } }}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <DialogTitle className="text-right text-xl">إدارة حالة الاختبار</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">الإجراء</label>
              <Select value={assessmentManageChoice} onValueChange={setAssessmentManageChoice}>
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(() => {
                    if (!assessmentManageDialog) {
                      return null;
                    }

                    const course = data.courses.find((item) => item.id === assessmentManageDialog.courseId);
                    if (!course) {
                      return null;
                    }

                    return getAssessmentManageOptions(course, assessmentManageDialog.assessmentType).map((option) => (
                      <SelectItem key={option.value} value={option.value} className="justify-end pr-3 text-right">{option.label}</SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" disabled={assessmentManageSubmitting} onClick={() => setAssessmentManageDialog(null)}>إلغاء</Button>
              <Button
                disabled={!assessmentManageChoice || assessmentManageSubmitting}
                onClick={async () => {
                  if (!assessmentManageDialog || !assessmentManageChoice) return;

                  if (assessmentManageChoice.startsWith("close_")) {
                    const branch = assessmentManageChoice === "close_all"
                      ? "all"
                      : (assessmentManageChoice.replace("close_", "") as AssessmentOpenBranch);
                    setAssessmentManageSubmitting(true);
                    try {
                      await handleToggleAssessmentAvailability(assessmentManageDialog.courseId, assessmentManageDialog.assessmentType, branch);
                      setAssessmentManageDialog(null);
                    } finally {
                      setAssessmentManageSubmitting(false);
                    }
                    return;
                  }

                  const branch = assessmentManageChoice === "open_all"
                    ? "all"
                    : (assessmentManageChoice.replace("open_", "") as AssessmentOpenBranch);
                  handleOpenAssessmentAvailabilityDialog(assessmentManageDialog.courseId, assessmentManageDialog.assessmentType);
                  setAssessmentTargetBranch(branch);
                  setAssessmentPickerStep("timer");
                  setAssessmentActionPicker({ courseId: assessmentManageDialog.courseId, assessmentType: assessmentManageDialog.assessmentType });
                  setAssessmentManageDialog(null);
                }}
              >
                {assessmentManageSubmitting ? "جارٍ التنفيذ..." : "متابعة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImportResultsDialog
        open={importResultsOpen}
        onOpenChange={setImportResultsOpen}
        courses={[...courseItems, ...getTasks(data).sort((a, b) => a.sortOrder - b.sortOrder)]}
        students={data.students}
        defaultCourseId={resultsCourse?.id ?? (indicatorsCourseId !== "all" ? indicatorsCourseId : "")}
        defaultAssessmentType={resultsType !== "attendance" ? resultsType : "pre"}
        onSave={async (cId, aType, rows) => {
          await store.bulkImportAssessments(
            cId,
            aType,
            rows
              .filter((r) => r.matchedStudent)
              .map((r) => ({
                studentName: r.matchedStudent!.name,
                loginId: r.matchedStudent!.loginId,
                answers: r.answers,
                manualScore:
                  r.manualScore === null || r.manualScore === undefined || r.manualScore === ""
                    ? null
                    : Number(r.manualScore),
              })),
          );
        }}
      />

      <ManualGradesDialog
        open={manualGradesOpen}
        onOpenChange={setManualGradesOpen}
        courses={[...courseItems, ...getTasks(data).sort((a, b) => a.sortOrder - b.sortOrder)]}
        students={data.students}
        submissions={data.submissions}
        defaultCourseId={resultsCourse?.id ?? (indicatorsCourseId !== "all" ? indicatorsCourseId : "")}
        defaultAssessmentType={resultsType !== "attendance" ? resultsType : "pre"}
        onImportClick={() => setImportResultsOpen(true)}
        onSave={async (cId, aType, rows) => {
          await store.bulkImportAssessments(
            cId,
            aType,
            rows.map((r) => ({
              studentName: r.studentName,
              loginId: r.loginId,
              answers: aType === "tasks" ? [] : [{ questionId: "__score_override__", value: String(r.score ?? 0) }],
              manualScore: r.score,
            })),
          );
        }}
      />

      <Dialog open={studentsOpen} onOpenChange={(open) => {
        setStudentsOpen(open);
        if (!open) {
          resetStudentForm();
        }
      }}>
        <DialogContent className="max-w-xl rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <div className="flex items-center justify-between gap-3">
              {!studentManagerMode && studentManagerEntityType === "student" && !editingStudentId ? (
                <DialogTitle className="text-left text-xl">إضافة طالب/ة</DialogTitle>
              ) : studentManagerMode ? (
                <DialogTitle className="text-right text-xl">إدارة البيانات</DialogTitle>
              ) : <span />}
              {!studentManagerMode && studentManagerEntityType === "student" && !editingStudentId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full px-3 text-xs"
                  onClick={() => bulkStudentFileInputRef.current?.click()}
                >
                  إضافة جماعية
                </Button>
              ) : studentManagerMode ? (
                <Button type="button" variant="outline" className="rounded-full px-4" onClick={() => setManualGradesOpen(true)}>
                  <Pencil className="size-4" />
                  تعديل الدرجات
                </Button>
              ) : (
                <DialogTitle className="text-right text-xl">{studentManagerMode ? "إدارة البيانات" : studentManagerEntityType === "reciter" ? (editingReciterId ? "تعديل المقرئ" : "إضافة مقرئ") : editingStudentId ? "تعديل بيانات الطالب/ة" : "إضافة طالب/ة"}</DialogTitle>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">اختر النوع</label>
              <Select value={studentManagerEntityType} onValueChange={(value) => {
                const entityType = value as "student" | "reciter";
                setStudentManagerEntityType(entityType);
                setEditingStudentId(null);
                setEditingReciterId(null);
                setStudentPickerStudentId("");
                setStudentPickerReciterId("");
                setStudentTransferTargetReciterId("");
                setStudentForm({ ...emptyStudentForm, branchId: studentManagerBranch });
                setReciterForm({ ...emptyReciterForm, branchId: studentManagerBranch });
              }}>
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                <SelectContent className="text-right">
                  <SelectItem value="student" className="justify-end pr-3 text-right">طالب</SelectItem>
                  <SelectItem value="reciter" className="justify-end pr-3 text-right">مقرئ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!studentManagerMode && studentManagerEntityType === "student" && !editingStudentId && (
              <div className="hidden">
                <input
                  ref={bulkStudentFileInputRef}
                  type="file"
                  accept=".xlsx,.csv,.pdf"
                  onChange={handleBulkStudentFileSelect}
                  className="hidden"
                />
              </div>
            )}

            {studentManagerMode && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">اختر الفرع</label>
                  {managedBranchId ? (
                    <div className="rounded-[0.9rem] border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                      {branchLabels[managedBranchId]}
                    </div>
                  ) : (
                    <Select value={studentPickerBranchId} onValueChange={(value) => {
                      setStudentPickerBranchId(value as BranchId);
                      setStudentPickerStudentId("");
                      setStudentPickerReciterId("");
                      setEditingStudentId(null);
                      setEditingReciterId(null);
                      setStudentTransferTargetReciterId("");
                      setStudentForm({ ...emptyStudentForm, branchId: value as BranchId });
                      setReciterForm({ ...emptyReciterForm, branchId: value as BranchId });
                    }}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-right">
                        {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id} className="justify-end pr-3 text-right">{branch.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">{studentManagerEntityType === "student" ? "اختر الطالب/ة" : "اختر المقرئ"}</label>
                  {studentManagerEntityType === "student" ? (
                    <Select value={studentPickerStudentId} onValueChange={(value) => {
                      setStudentPickerStudentId(value);
                      setStudentTransferTargetReciterId("");
                      if (!loadStudentIntoForm(value)) {
                        setEditingStudentId(null);
                      }
                    }}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue placeholder="اختر الطالب/ة" /></SelectTrigger>
                      <SelectContent className="text-right">
                        {studentManagerStudents.map((student) => <SelectItem key={student.id} value={student.id} className="justify-end pr-3 text-right">{student.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={studentPickerReciterId} onValueChange={(value) => {
                      setStudentPickerReciterId(value);
                      if (!loadReciterIntoForm(value)) {
                        setEditingReciterId(null);
                      }
                    }}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue placeholder="اختر المقرئ" /></SelectTrigger>
                      <SelectContent className="text-right">
                        {studentManagerReciters.map((reciter) => <SelectItem key={reciter.id} value={reciter.id} className="justify-end pr-3 text-right">{reciter.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            )}

            {studentManagerMode && studentManagerEntityType === "student" && !editingStudentId ? (
              <div className="rounded-[1rem] border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                اختر الفرع ثم اختر الطالب/ة لعرض بياناته وتعديلها.
              </div>
            ) : studentManagerMode && studentManagerEntityType === "reciter" && !editingReciterId ? (
              <div className="rounded-[1rem] border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                اختر الفرع ثم اختر المقرئ لعرض بياناته وتعديلها.
              </div>
            ) : studentManagerEntityType === "student" && (studentEntryMode === "single" || editingStudentId) ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">اسم الطالب/ة</label>
                  <Input value={studentForm.name} onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} placeholder="اسم الطالب/ة" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">اختر الفرع</label>
                  {managedBranchId ? (
                    <div className="rounded-[0.9rem] border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                      {branchLabels[managedBranchId]}
                    </div>
                  ) : (
                    <Select value={studentForm.branchId} onValueChange={(value) => setStudentForm((current) => ({ ...current, branchId: value as BranchId }))}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-right">
                        {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id} className="justify-end pr-3 text-right">{branch.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">رقم الدخول</label>
                  <Input value={studentForm.loginId} onChange={(event) => setStudentForm((current) => ({ ...current, loginId: event.target.value }))} placeholder="رقم الدخول" />
                </div>
                {studentManagerMode && editingStudentId && (
                  <div className="space-y-2 rounded-[1rem] border border-border/60 bg-muted/20 p-3">
                    <div className="text-sm font-bold text-foreground">نقل الطالب</div>
                    <div className="text-xs text-muted-foreground">المقرئ الحالي: {selectedManagerStudentReciter?.name ?? "غير مرتبط"}</div>
                    {selectedManagerStudentReciter ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Select value={studentTransferTargetReciterId} onValueChange={setStudentTransferTargetReciterId}>
                          <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue placeholder={availableStudentTransferReciters.length ? "اختر المقرئ" : "لا يوجد مقرئ آخر متاح"} /></SelectTrigger>
                          <SelectContent className="text-right">
                            {availableStudentTransferReciters.map((reciter) => <SelectItem key={reciter.id} value={reciter.id} className="justify-end pr-3 text-right">{reciter.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" className="rounded-full px-5" onClick={() => void handleTransferStudentFromManager()} disabled={availableStudentTransferReciters.length === 0}>
                          نقل الطالب
                        </Button>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">الطالب غير مرتبط بمقرئ حاليًا.</div>
                    )}
                  </div>
                )}
              </>
            ) : studentManagerEntityType === "student" ? (
              <>
                {bulkStudentFileName && <div className="text-xs text-muted-foreground">الملف الحالي: {bulkStudentFileName}</div>}

                {!managedBranchId && bulkStudents.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">تطبيق الفرع على جميع الصفوف</label>
                    <Select onValueChange={(value) => applyBranchToBulkStudents(value as BranchId)}>
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue placeholder="اختر فرعًا لتطبيقه على الجميع" /></SelectTrigger>
                      <SelectContent className="text-right">
                        {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id} className="justify-end pr-3 text-right">{branch.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">المعاينة</label>
                  <div className="max-h-[320px] overflow-auto rounded-[1rem] border border-border/60 bg-white p-3">
                    {bulkStudents.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">ارفع الملف لتظهر الصفوف هنا.</div>
                    ) : (
                      <div className="space-y-3">
                        {bulkStudents.map((row, index) => (
                          <div key={row.id} className="grid gap-3 rounded-[1rem] border border-border/60 bg-muted/10 p-3 md:grid-cols-[1fr_220px_180px]">
                            <Input
                              value={row.name}
                              onChange={(event) => setBulkStudents((current) => current.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))}
                              placeholder={`اسم الطالب ${index + 1}`}
                            />
                            <Input
                              value={row.loginId}
                              onChange={(event) => setBulkStudents((current) => current.map((item) => item.id === row.id ? { ...item, loginId: event.target.value } : item))}
                              placeholder="رقم الدخول"
                            />
                            {managedBranchId ? (
                              <div className="rounded-[0.9rem] border border-border/60 bg-white px-3 py-2 text-sm font-medium text-foreground">
                                {branchLabels[managedBranchId]}
                              </div>
                            ) : (
                              <Select value={row.branchId} onValueChange={(value) => setBulkStudents((current) => current.map((item) => item.id === row.id ? { ...item, branchId: value as BranchId } : item))}>
                                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                                <SelectContent className="text-right">
                                  {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id} className="justify-end pr-3 text-right">{branch.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">اسم المقرئ</div>
                  <Input value={reciterForm.name} onChange={(event) => setReciterForm((current) => ({ ...current, name: event.target.value }))} placeholder="اسم المقرئ" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">الفرع</div>
                  {managedBranchId ? (
                    <div className="rounded-[0.9rem] border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                      {branchLabels[managedBranchId]}
                    </div>
                  ) : (
                    <Select
                      value={reciterForm.branchId}
                      onValueChange={(value) => setReciterForm((current) => ({ ...current, branchId: value as BranchId, studentIds: [] }))}
                    >
                      <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-right">
                        {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id} className="justify-end pr-3 text-right">{branch.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">الطلاب المرتبطون (اختياري)</div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-white p-3">
                    {availableReciterStudents.length > 0 ? (
                      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                        {availableReciterStudents.map((student) => {
                          const checked = reciterForm.studentIds.includes(student.id);

                          return (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() => {
                                setReciterForm((current) => ({
                                  ...current,
                                  studentIds: checked
                                    ? current.studentIds.filter((currentStudentId) => currentStudentId !== student.id)
                                    : [...new Set([...current.studentIds, student.id])],
                                }));
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-right transition-smooth",
                                checked
                                  ? "border-primary/35 bg-primary/10"
                                  : "border-border/60 bg-muted/10 hover:border-primary/25 hover:bg-primary/5",
                              )}
                            >
                              <div className="text-sm font-medium text-foreground">{student.name}</div>
                              <span
                                className={cn(
                                  "flex h-5 w-5 shrink-0 rounded-full border-2 transition-colors",
                                  checked ? "border-primary bg-primary" : "border-primary/70 bg-transparent",
                                )}
                                aria-hidden="true"
                              />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-3 text-sm text-muted-foreground">لا يوجد طلاب متاحون</div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">رقم الدخول</div>
                  <Input value={reciterForm.loginCode} onChange={(event) => setReciterForm((current) => ({ ...current, loginCode: event.target.value }))} placeholder="رقم الدخول" />
                </div>
              </>
            )}

            {studentError && <p className="text-sm font-medium text-destructive">{studentError}</p>}
            {studentManagerEntityType === "reciter" && reciterError && <p className="text-sm font-medium text-destructive">{reciterError}</p>}
            <div className="flex justify-end gap-3">
              {studentManagerMode && studentManagerEntityType === "student" && editingStudentId && hasPermission("delete_student") && (
                <Button variant="destructive" onClick={() => {
                  handleDeleteStudent(editingStudentId);
                  setStudentsOpen(false);
                }}>
                  حذف الطالب/ة
                </Button>
              )}
              {studentManagerMode && studentManagerEntityType === "reciter" && editingReciterId && hasPermission("delete_reciter") && (
                <Button variant="destructive" onClick={() => {
                  handleDeleteReciter(editingReciterId);
                  setStudentsOpen(false);
                }}>
                  حذف المقرئ
                </Button>
              )}
              <Button variant="outline" onClick={() => { resetStudentForm(); setStudentsOpen(false); }}>إلغاء</Button>
              <Button
                onClick={studentManagerEntityType === "reciter" ? handleSaveReciter : studentEntryMode === "bulk" && !editingStudentId ? handleSaveBulkStudents : handleSaveStudent}
                disabled={studentManagerMode && ((studentManagerEntityType === "student" && !editingStudentId) || (studentManagerEntityType === "reciter" && !editingReciterId))}
              >
                {studentManagerMode || editingStudentId || editingReciterId ? "حفظ التعديل" : studentManagerEntityType === "student" && studentEntryMode === "bulk" ? "حفظ جماعي" : "إضافة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={adminsOpen} onOpenChange={(open) => {
        setAdminsOpen(open);
        if (!open) {
          resetAdminForm();
          setAdminDeletingId(null);
        }
      }}>
        <DialogContent className="max-w-md rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_20px_50px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <DialogTitle className="text-right text-xl text-foreground">الإشراف</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 py-3">
            <div className="space-y-2">
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-[1.15rem] border border-border/60 bg-white p-2.5">
                {adminsLoading ? (
                  <div className="py-3 text-sm text-muted-foreground">جارٍ تحميل المشرفين...</div>
                ) : adminsList.length > 0 ? (
                  adminsList.map((admin) => {
                    const isCurrentAdmin = admin.loginCode === session?.loginCode;

                    return (
                      <div key={admin.id} className="flex items-center justify-between rounded-[1rem] border border-border/60 bg-muted/10 px-2.5 py-2">
                        <div className="text-right">
                          <div className="text-sm font-medium text-foreground">{admin.name}</div>
                          <div className="text-xs text-muted-foreground">{getRoleLabel(admin.role)} - {admin.loginCode}</div>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-xl text-destructive"
                          onClick={() => handleDeleteAdmin(admin.id)}
                          disabled={isCurrentAdmin || adminDeletingId === admin.id}
                          title={isCurrentAdmin ? "لا يمكن حذف الحساب الحالي" : "حذف الحساب"}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-3 text-sm text-muted-foreground">لا توجد حسابات إشرافية حالياً</div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">المسمى</div>
              <Select value={adminForm.role} onValueChange={(value) => setAdminForm((current) => ({ ...current, role: value as typeof emptyAdminForm.role }))}>
                <SelectTrigger className="flex-row-reverse bg-white text-right [&>span]:w-full [&>span]:text-right"><SelectValue /></SelectTrigger>
                <SelectContent className="border-border/70 bg-white text-right shadow-lg backdrop-blur-none">
                  <SelectItem value="admin" className="justify-end pr-8 text-right">مدير عام</SelectItem>
                  <SelectItem value="male_manager" className="justify-end pr-8 text-right">مشرف</SelectItem>
                  <SelectItem value="female_manager" className="justify-end pr-8 text-right">مشرفة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">الاسم</div>
              <Input value={adminForm.name} onChange={(event) => setAdminForm((current) => ({ ...current, name: event.target.value }))} placeholder="الاسم" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">رقم الدخول</div>
              <Input value={adminForm.loginCode} onChange={(event) => setAdminForm((current) => ({ ...current, loginCode: event.target.value }))} placeholder="رقم الدخول" />
            </div>
            {adminError && <p className="text-sm font-medium text-destructive">{adminError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t border-border/60 px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setAdminsOpen(false)} disabled={adminSubmitting}>إلغاء</Button>
            <Button className="rounded-full px-5" onClick={handleSaveAdmin} disabled={adminSubmitting}>{adminSubmitting ? "جارٍ الحفظ..." : "إضافة"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={coursesManageOpen} onOpenChange={setCoursesManageOpen}>
        <DialogContent className="max-w-md overflow-hidden rounded-[1.75rem] border border-primary/15 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(8,65,89,0.12)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-3 py-3 text-right">
            <DialogTitle className="text-right text-xl font-bold text-foreground">إدارة الدورات</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <Input
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleAddCourse()}
                placeholder="اسم الدورة"
                className="flex-1 text-right"
              />
              <Button onClick={handleAddCourse} className="shrink-0 rounded-full px-5">
                <Plus className="size-4" />
                إضافة
              </Button>
            </div>
            {courseError && <p className="text-sm font-medium text-destructive">{courseError}</p>}
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-[1.1rem] border border-border/50 bg-muted/10 p-1.5">
              {courseItems.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">لا توجد دورات بعد.</p>
              )}
              {courseItems.map((course) => (
                <div key={course.id} className="flex items-center gap-3 rounded-[1rem] border border-border/60 bg-white px-3 py-2.5">
                  <span className="flex-1 truncate text-left text-sm font-medium text-foreground">{course.title}</span>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={() => handleEditCourse(course.id, course.title)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-destructive" onClick={() => handleDeleteCourse(course.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 px-3 py-2.5">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setCoursesManageOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={courseEditOpen} onOpenChange={(open) => {
        setCourseEditOpen(open);
        if (!open) {
          setCourseEditForm(emptyCourseEditForm);
          setCourseEditError("");
        }
      }}>
        <DialogContent className="max-w-lg overflow-hidden rounded-[1.75rem] border border-primary/20 bg-white/95 p-0 text-right shadow-[0_28px_80px_rgba(8,65,89,0.16)] backdrop-blur-sm [&>button]:hidden">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-12 -left-8 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -bottom-10 -right-6 h-24 w-24 rounded-full bg-accent/10 blur-3xl" />
            </div>

            <DialogHeader className="relative border-b border-border/60 px-4 py-3 text-right">
              <DialogTitle className="text-right text-2xl text-foreground">تعديل اسم الدورة</DialogTitle>
            </DialogHeader>

            <div className="relative space-y-3 px-4 py-3">
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">اسم الدورة</div>
                <Input
                  value={courseEditForm.title}
                  onChange={(event) => setCourseEditForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="اسم الدورة"
                  className="rounded-2xl border-primary/15 bg-white/90 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSaveEditedCourse();
                    }
                  }}
                />
              </div>
              {courseEditError && <p className="text-sm font-medium text-destructive">{courseEditError}</p>}
            </div>

            <div className="relative flex justify-end gap-3 border-t border-border/60 px-4 py-3">
              <Button
                variant="outline"
                className="rounded-full border-primary/20 bg-white/80 px-5 hover:bg-primary/5"
                onClick={() => {
                  setCourseEditOpen(false);
                  setCourseEditForm(emptyCourseEditForm);
                  setCourseEditError("");
                }}
              >
                إلغاء
              </Button>
              <Button className="rounded-full px-5" onClick={handleSaveEditedCourse}>حفظ</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsSubmission)} onOpenChange={(open) => !open && setDetailsSubmissionId(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto rounded-[1.75rem] p-0 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 [&::-webkit-scrollbar-track]:bg-transparent [&>button]:hidden">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3 text-right">
            <div className="flex-1">
              <DialogTitle className="text-right text-2xl">
                <span className="inline-flex items-center gap-2">
                  <FileText className="size-5 text-primary" aria-hidden="true" />
                  <span>:الإجابة</span>
                </span>
              </DialogTitle>
            </div>
            {detailsSubmission && (() => {
              const submissionCourse = data.courses.find((course) => course.id === detailsSubmission.courseId) ?? null;
              const isDocumentTaskSubmission = detailsSubmission.assessmentType === "tasks" && submissionCourse?.taskMode === "document";
              
              return (
                isDocumentTaskSubmission && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 ml-2"
                    aria-label="تحميل PDF"
                    title="تحميل PDF"
                    onClick={() => downloadSubmissionAsPdf(detailsSubmission, submissionCourse)}
                  >
                    <Download className="size-4" />
                  </Button>
                )
              );
            })()}
          </DialogHeader>
          <div className="space-y-3 p-4">
            {detailsSubmission && (() => {
              const questions = getAssessmentQuestionsForCourse(detailsSubmission.courseId, detailsSubmission.assessmentType);
              const realAnswers = (detailsSubmission.answers ?? []).filter((answer) => answer.questionId !== "__score_override__");
              const answers = new Map(realAnswers.map((answer) => [answer.questionId, answer]));
              const submissionCourse = data.courses.find((course) => course.id === detailsSubmission.courseId) ?? null;
              const isDocumentTaskSubmission = detailsSubmission.assessmentType === "tasks" && submissionCourse?.taskMode === "document";
              const documentTaskAnswer = realAnswers[0];

              return (
                <>
                  {isDocumentTaskSubmission && documentTaskAnswer ? (
                    <div className="rounded-3xl border border-primary/10 bg-white p-4">
                      <DocumentEditor value={documentTaskAnswer.value || "<p>لا يوجد محتوى</p>"} editable={false} />
                    </div>
                  ) : (
                    questions.map((question, index) => {
                      const answer = answers.get(question.id);
                      const isCorrect = question.correctAnswer.trim() && answer
                        ? isAnswerCorrect(question, answer.value)
                        : false;

                      return (
                        <div key={question.id} className="rounded-3xl border border-primary/10 bg-white p-4">
                          <div className="mb-2 font-bold text-foreground">{index + 1}. {question.prompt} <span className="text-sm font-medium text-muted-foreground">• الدرجة: {question.points}</span></div>
                          {question.correctAnswer && <div className="mb-2 text-sm font-medium text-emerald-700">الإجابة الصحيحة: {question.correctAnswer}</div>}
                          {answer && question.correctAnswer && <div className={cn("mb-3 text-sm font-medium", isCorrect ? "text-emerald-700" : "text-rose-700")}>{isCorrect ? "صحيحة" : "غير صحيحة"}</div>}
                          <div className="text-sm text-muted-foreground">إجابة الطالب: {answer?.value || "لا توجد إجابة"}</div>
                          {answer?.fileName && (
                            <div className="mt-3 rounded-2xl border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
                              <div className="mb-3 font-medium text-foreground">الملف المرفق: {answer.fileName}</div>
                              {answer.fileDataUrl ? (
                                answer.fileType?.startsWith("image/") || answer.fileDataUrl.startsWith("data:image/") ? (
                                  <button
                                    type="button"
                                    className="group relative block w-full overflow-hidden rounded-2xl border border-border/60 bg-white text-right"
                                    onClick={() => setPreviewAttachment({
                                      name: answer.fileName ?? "مرفق",
                                      type: answer.fileType,
                                      dataUrl: answer.fileDataUrl!,
                                    })}
                                  >
                                    <img
                                      src={answer.fileDataUrl}
                                      alt={answer.fileName}
                                      className="max-h-80 w-full object-contain bg-white transition duration-200 group-hover:scale-[1.01]"
                                    />
                                    <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white">
                                      <Maximize2 className="size-3.5" aria-hidden="true" />
                                      تكبير
                                    </span>
                                  </button>
                                ) : answer.fileType === "application/pdf" || answer.fileDataUrl.startsWith("data:application/pdf") ? (
                                  <button
                                    type="button"
                                    className="group relative block w-full overflow-hidden rounded-2xl border border-border/60 bg-white text-right"
                                    onClick={() => setPreviewAttachment({
                                      name: answer.fileName ?? "مرفق",
                                      type: answer.fileType,
                                      dataUrl: answer.fileDataUrl!,
                                    })}
                                  >
                                    <iframe
                                      src={`${answer.fileDataUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                      title={answer.fileName}
                                      className="h-96 w-full bg-white"
                                    />
                                    <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white">
                                      <Maximize2 className="size-3.5" aria-hidden="true" />
                                      تكبير
                                    </span>
                                  </button>
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-border/60 bg-white px-3 py-4 text-center text-muted-foreground">
                                    هذا النوع من الملفات لا يدعم المعاينة داخل النافذة.
                                  </div>
                                )
                              ) : (
                                <span>{answer.fileName}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </>
              );
            })()}
          </div>
          <div className="flex justify-end border-t border-border px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setDetailsSubmissionId(null)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(finalExamDetailsSubmission)} onOpenChange={(open) => !open && setFinalExamDetailsSubmissionId(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto rounded-[1.75rem] p-0 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 [&::-webkit-scrollbar-track]:bg-transparent [&>button]:hidden">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3 text-right">
            <div className="flex-1">
              <DialogTitle className="text-right text-2xl">
                <span className="inline-flex items-center gap-2">
                  <FileText className="size-5 text-primary" aria-hidden="true" />
                  <span>:إجابات الاختبار النهائي</span>
                </span>
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3 p-4">
            {finalExamDetailsSubmission && (() => {
              const questions = (data.finalExamQuestions ?? [])
                .filter((question) => question.branchCode === finalExamDetailsSubmission.branchCode)
                .sort((left, right) => left.sortOrder - right.sortOrder);
              const answers = new Map((finalExamDetailsSubmission.answers ?? []).map((answer) => [answer.questionId, answer]));

              return questions.map((question, index) => {
                const answer = answers.get(question.id);
                const isCorrect = question.correctAnswer.trim() && answer
                  ? isAnswerCorrect(question as CourseQuestion, answer.value)
                  : false;

                return (
                  <div key={question.id} className="rounded-3xl border border-primary/10 bg-white p-4">
                    <div className="mb-2 font-bold text-foreground">{index + 1}. {question.prompt} <span className="text-sm font-medium text-muted-foreground">• الدرجة: {question.points}</span></div>
                    {question.correctAnswer && <div className="mb-2 text-sm font-medium text-emerald-700">الإجابة الصحيحة: {question.correctAnswer}</div>}
                    {answer && question.correctAnswer && <div className={cn("mb-3 text-sm font-medium", isCorrect ? "text-emerald-700" : "text-rose-700")}>{isCorrect ? "صحيحة" : "غير صحيحة"}</div>}
                    <div className="text-sm text-muted-foreground">إجابة الطالب: {answer?.value || "لا توجد إجابة"}</div>
                    {answer?.fileName && (
                      <div className="mt-3 rounded-2xl border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
                        <div className="mb-3 font-medium text-foreground">الملف المرفق: {answer.fileName}</div>
                        {answer.fileDataUrl ? (
                          answer.fileType?.startsWith("image/") || answer.fileDataUrl.startsWith("data:image/") ? (
                            <button
                              type="button"
                              className="group relative block w-full overflow-hidden rounded-2xl border border-border/60 bg-white text-right"
                              onClick={() => setPreviewAttachment({
                                name: answer.fileName ?? "مرفق",
                                type: answer.fileType,
                                dataUrl: answer.fileDataUrl!,
                              })}
                            >
                              <img
                                src={answer.fileDataUrl}
                                alt={answer.fileName}
                                className="max-h-80 w-full object-contain bg-white transition duration-200 group-hover:scale-[1.01]"
                              />
                              <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white">
                                <Maximize2 className="size-3.5" aria-hidden="true" />
                                تكبير
                              </span>
                            </button>
                          ) : answer.fileType === "application/pdf" || answer.fileDataUrl.startsWith("data:application/pdf") ? (
                            <button
                              type="button"
                              className="group relative block w-full overflow-hidden rounded-2xl border border-border/60 bg-white text-right"
                              onClick={() => setPreviewAttachment({
                                name: answer.fileName ?? "مرفق",
                                type: answer.fileType,
                                dataUrl: answer.fileDataUrl!,
                              })}
                            >
                              <iframe
                                src={`${answer.fileDataUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                title={answer.fileName}
                                className="h-96 w-full bg-white"
                              />
                              <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white">
                                <Maximize2 className="size-3.5" aria-hidden="true" />
                                تكبير
                              </span>
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-border/60 bg-white px-3 py-4 text-center text-muted-foreground">
                              هذا النوع من الملفات لا يدعم المعاينة داخل النافذة.
                            </div>
                          )
                        ) : (
                          <span>{answer.fileName}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <div className="flex justify-end border-t border-border px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setFinalExamDetailsSubmissionId(null)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="h-screen w-screen max-w-none translate-x-[-50%] translate-y-[-50%] rounded-none border-0 bg-slate-950 p-0 shadow-none [&>button]:hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-white">
              <div className="min-w-0 text-right">
                <div className="truncate text-lg font-bold">{previewAttachment?.name ?? "معاينة المرفق"}</div>
                <div className="text-xs text-white/70">اضغط خارج النافذة أو على زر الإغلاق للعودة</div>
              </div>
              <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setPreviewAttachment(null)}>
                إغلاق
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
              {previewAttachment && isPreviewImage && (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.name}
                  className="h-full max-h-full w-full max-w-full object-contain"
                />
              )}

              {previewAttachment && isPreviewPdf && previewPdfSrc && (
                <iframe
                  title={previewAttachment.name}
                  src={previewPdfSrc}
                  className="h-full w-full rounded-xl bg-white"
                />
              )}

              {previewAttachment && isPreviewVideo && (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full rounded-xl bg-black object-contain"
                  src={previewAttachment.dataUrl}
                />
              )}

              {previewAttachment && !isPreviewImage && !isPreviewPdf && !isPreviewVideo && (
                <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-white/80">
                  هذا النوع من الملفات لا يدعم المعاينة بملء الشاشة.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notifTemplatesOpen} onOpenChange={setNotifTemplatesOpen}>
        <DialogContent className="max-w-xl rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-right text-xl text-foreground">قوالب الإشعارات</DialogTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="rounded-full p-1 text-[#0e7490] hover:bg-[#0e7490]/10 transition-colors" aria-label="المتغيرات المتاحة">
                    <Info className="size-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-72 rounded-2xl border border-border/60 bg-white p-3 text-right shadow-lg">
                  <p className="mb-2 text-xs font-bold text-foreground">المتغيرات المتاحة</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">اسم الدورة</span>
                      <span className="font-mono text-xs text-primary">{'{courseTitle}'}</span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">نوع الاختبار (قبلي / بعدي / تكليف / نهائي)</span>
                      <span className="font-mono text-xs text-primary">{'{assessmentLabel}'}</span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">اسم الفرع</span>
                      <span className="font-mono text-xs text-primary">{'{branchLabel}'}</span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">مدة الاختبار (دقيقة)</span>
                      <span className="font-mono text-xs text-primary">{'{durationMinutes}'}</span>
                    </li>
                  </ul>
                </PopoverContent>
              </Popover>
            </div>
          </DialogHeader>
          <div className="space-y-3 px-4 py-3">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">قالب الاختبار القبلي</label>
              <Textarea value={notifTemplatePre} onChange={(e) => setNotifTemplatePre(e.target.value)} className="min-h-24 text-right" dir="rtl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">قالب الاختبار البعدي</label>
              <Textarea value={notifTemplatePost} onChange={(e) => setNotifTemplatePost(e.target.value)} className="min-h-24 text-right" dir="rtl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">قالب المهمة الأدائية</label>
              <Textarea value={notifTemplateTasks} onChange={(e) => setNotifTemplateTasks(e.target.value)} className="min-h-24 text-right" dir="rtl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">قالب الاختبار النهائي</label>
              <Textarea value={notifTemplateFinalExam} onChange={(e) => setNotifTemplateFinalExam(e.target.value)} className="min-h-24 text-right" dir="rtl" />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-border/60 px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setNotifTemplatesOpen(false)}>إلغاء</Button>
            <Button className="rounded-full px-5" disabled={notifTemplateSaving} onClick={async () => {
              setNotifTemplateSaving(true);
              try {
                if (activeCourse) {
                  await store.updateCourse(activeCourse.id, {
                    assessmentNotificationTemplates: {
                      ...activeCourse.assessmentNotificationTemplates,
                      pre: notifTemplatePre,
                      post: notifTemplatePost,
                      tasks: notifTemplateTasks,
                    },
                  } as never);
                }
                if (managedBranchId) {
                  await store.updateFinalExamNotificationTemplate(managedBranchId, notifTemplateFinalExam);
                } else {
                  await Promise.all([
                    store.updateFinalExamNotificationTemplate("male", notifTemplateFinalExam),
                    store.updateFinalExamNotificationTemplate("female", notifTemplateFinalExam),
                  ]);
                }
                setNotifTemplatesOpen(false);
              } finally {
                setNotifTemplateSaving(false);
              }
            }}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={courseLinksOpen} onOpenChange={setCourseLinksOpen}>
        <DialogContent className="max-w-lg rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-3 py-2.5 text-right">
            <DialogTitle className="text-right text-xl text-foreground">الروابط</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 px-3 py-2.5 text-right">
            <div className={cn(dashboardMutedPanelClass, "space-y-1.5 p-2.5")}>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">رابط الاختبارات القبلية</div>
                <div className="break-all text-sm text-muted-foreground">{getCourseLink("pre")}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleCopyCourseLink("pre")}><Copy className="size-4" />نسخ الرابط</Button>
            </div>
            <div className={cn(dashboardMutedPanelClass, "space-y-1.5 p-2.5")}>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">رابط الاختبارات البعدية</div>
                <div className="break-all text-sm text-muted-foreground">{getCourseLink("post")}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleCopyCourseLink("post")}><Copy className="size-4" />نسخ الرابط</Button>
            </div>
            <div className={cn(dashboardMutedPanelClass, "space-y-1.5 p-2.5")}>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">رابط المهام الأدائية</div>
                <div className="break-all text-sm text-muted-foreground">{getTaskLink()}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(getTaskLink())}><Copy className="size-4" />نسخ الرابط</Button>
            </div>
            <div className={cn(dashboardMutedPanelClass, "space-y-1.5 p-2.5")}>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">رابط الاختبار النهائي</div>
                <div className="break-all text-sm text-muted-foreground">{typeof window !== "undefined" ? `${window.location.origin}/final-exam` : "/final-exam"}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(typeof window !== "undefined" ? `${window.location.origin}/final-exam` : "/final-exam")}><Copy className="size-4" />نسخ الرابط</Button>
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 px-3 py-2.5">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setCourseLinksOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-hidden rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-3 py-2.5 text-right">
            <DialogTitle className="text-right text-xl text-foreground">النسخة الاحتياطية</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-3 py-3 text-right">
            {backupRestoreProgress?.isActive ? (
              <div className={cn(dashboardMutedPanelClass, "space-y-4 rounded-[1.25rem] p-4")}>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-foreground">الرجاء عدم الخروج من النافذة</div>
                  <div className="text-xs text-muted-foreground break-all">{backupRestoreProgress.fileName}</div>
                </div>
                <Progress value={backupRestoreProgress.percent} className="h-3 bg-primary/10" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{backupRestoreProgress.message}</span>
                  <span className="font-bold text-primary">{backupRestoreProgress.percent}%</span>
                </div>
              </div>
            ) : (
              <>
            <div className="flex flex-col gap-2">
              <Button className="h-11 rounded-2xl" onClick={handleExportBackup} disabled={!canExportBackup}>
                <Download className="size-4" />
                تحميل
              </Button>
              <Button variant="outline" className="h-11 rounded-2xl" onClick={() => backupImportInputRef.current?.click()} disabled={!canImportBackup}>
                <FileUp className="size-4" />
                رفع
              </Button>
              <Button variant="destructive" className="h-11 rounded-2xl" onClick={() => setBackupDeleteConfirmOpen(true)} disabled={!canRestoreBackup || backupDeleteRunning}>
                <Trash2 className="size-4" />
                حذف
              </Button>
              <input ref={backupImportInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleBackupImportSelect} />
            </div>

            {importedBackupSummary ? (
              <div className="space-y-3">
                <div className={cn(dashboardMutedPanelClass, "space-y-2 rounded-[1.25rem] p-3") }>
                  <div className="flex items-start justify-between gap-2">
                    <span className="pt-1 text-sm font-bold text-foreground">آخر ملف مرفوع</span>
                    <div className="max-h-20 max-w-[70%] overflow-y-auto rounded-xl bg-white px-3 py-2 text-xs text-muted-foreground break-all">
                      {importedBackupSummary.fileName}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">تاريخ التصدير: {importedBackupSummary.exportedAt}</div>
                  <div className="max-h-56 overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-white px-3 py-2">الأدوار: {importedBackupSummary.rolesCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">الفروع: {importedBackupSummary.branchesCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">طلاب: {importedBackupSummary.studentsCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">مقرئون: {importedBackupSummary.recitersCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">دورات: {importedBackupSummary.coursesCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">قوالب مهام: {importedBackupSummary.taskTemplatesCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">حضور: {importedBackupSummary.attendanceCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">إشعارات: {importedBackupSummary.notificationsCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">نتائج: {importedBackupSummary.submissionsCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">أسئلة النهائي: {importedBackupSummary.finalExamQuestionsCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">نتائج النهائي: {importedBackupSummary.finalExamSubmissionsCount}</div>
                    <div className="rounded-xl bg-white px-3 py-2">إعدادات النهائي: {importedBackupSummary.hasFinalExamSettings ? "موجودة" : "غير موجودة"}</div>
                    <div className="rounded-xl bg-white px-3 py-2">الصلاحيات: {importedBackupSummary.hasRolePermissions ? "موجودة" : "غير موجودة"}</div>
                    <div className="rounded-xl bg-white px-3 py-2">مؤشرات: {importedBackupSummary.hasIndicators ? "موجودة" : "غير موجودة"}</div>
                    </div>
                  </div>
                </div>

                {backupComparisonRows.length > 0 && (
                  <div className={cn(dashboardMutedPanelClass, "space-y-3 rounded-[1.25rem] p-3") }>
                    <div className="text-sm font-bold text-foreground">مقارنة قبل الاسترجاع</div>
                    <div className="max-h-72 overflow-y-auto pr-1">
                      <div className="grid gap-2">
                      {backupComparisonRows.map((row) => (
                        <div key={row.label} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                          <div className="font-medium text-foreground">{row.label}</div>
                          <div className="text-muted-foreground">الحالي: {row.current}</div>
                          <div className="text-muted-foreground">النسخة: {row.backup}</div>
                          <div className={cn(row.diff === 0 ? "text-muted-foreground" : row.diff > 0 ? "text-emerald-700" : "text-destructive")}>{row.diff > 0 ? `+${row.diff}` : row.diff}</div>
                        </div>
                      ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
              </>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-border/60 px-3 py-2.5">
            {!backupRestoreProgress?.isActive && importedBackupSummary && backupComparisonRows.length > 0 && (
              <Button className="rounded-full px-5" onClick={() => setBackupRestoreConfirmOpen(true)} disabled={!canRestoreBackup}>
                استرجاع
              </Button>
            )}
            <Button variant="outline" className="rounded-full px-5" onClick={() => setBackupDialogOpen(false)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={backupImportConfirmOpen} onOpenChange={setBackupImportConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <AlertDialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <AlertDialogTitle className="text-right text-lg text-foreground">تأكيد رفع النسخة</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm leading-6 text-muted-foreground">
              {pendingBackupImportFile
                ? `تم اختيار الملف ${pendingBackupImportFile.name}. هل أنت متأكد من متابعة قراءة هذا الملف؟`
                : "هل أنت متأكد من متابعة رفع ملف النسخة الاحتياطية؟"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-start gap-2 px-4 py-3 sm:justify-start sm:space-x-0">
            <AlertDialogAction
              className="rounded-full px-4"
              onClick={() => {
                const file = pendingBackupImportFile;
                setBackupImportConfirmOpen(false);
                setPendingBackupImportFile(null);
                if (file) {
                  void processBackupImportFile(file);
                }
              }}
            >
              نعم، متابعة
            </AlertDialogAction>
            <AlertDialogCancel
              className="mt-0 rounded-full px-4"
              onClick={() => setPendingBackupImportFile(null)}
            >
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={backupRestoreConfirmOpen} onOpenChange={setBackupRestoreConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <AlertDialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <AlertDialogTitle className="text-right text-lg text-foreground">تأكيد الاسترجاع</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm leading-6 text-muted-foreground">
              سيتم استبدال البيانات الحالية في النظام بالكامل بمحتوى النسخة المرفوعة. أي عنصر غير موجود داخل النسخة سيتم حذفه من قاعدة البيانات الحالية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-start gap-2 px-4 py-3 sm:justify-start sm:space-x-0">
            <AlertDialogAction className="rounded-full bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleRestoreBackup()}>
              {backupRestoreRunning ? "جارٍ الاسترجاع..." : "نعم، استرجع"}
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 rounded-full px-4">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={backupDeleteConfirmOpen} onOpenChange={setBackupDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <AlertDialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <AlertDialogTitle className="text-right text-lg text-foreground">تأكيد حذف البيانات الحالية</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm leading-6 text-muted-foreground">
              سيتم حذف جميع البيانات الحالية من النظام بالكامل، بما في ذلك الطلاب والدورات والنتائج والحضور وسجل النشاط. استخدم هذا الخيار فقط إذا كنت تريد بدء حالة فارغة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-start gap-2 px-4 py-3 sm:justify-start sm:space-x-0">
            <AlertDialogAction className="rounded-full bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDeleteCurrentBackupData()}>
              {backupDeleteRunning ? "جارٍ الحذف..." : "نعم، احذف"}
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 rounded-full px-4" disabled={backupDeleteRunning}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={finalExamCopyOpen} onOpenChange={setFinalExamCopyOpen}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl">نسخ الأسئلة إلى</DialogTitle>
          </DialogHeader>
          <p className="px-4 pt-3 text-sm text-muted-foreground">اختر الفرع الذي تريد نسخ أسئلة {branchLabels[effectiveFinalExamManageBranch]} إليه.</p>
          <div className="grid grid-cols-2 gap-2.5 p-4">
            {(["male", "female"] as BranchId[]).map((branchId) => (
              <button
                key={branchId}
                type="button"
                disabled={branchId === effectiveFinalExamManageBranch}
                className={cn(
                  "flex flex-col items-center gap-2.5 rounded-[1.25rem] border border-border/70 bg-muted/20 p-3.5 text-center transition-colors hover:border-primary/40 hover:bg-primary/5",
                  branchId === effectiveFinalExamManageBranch && "cursor-not-allowed opacity-40",
                )}
                onClick={() => void handleCopyFinalExamQuestionsToBranch(branchId)}
              >
                <GraduationCap className="size-7 text-primary" />
                <div className="text-sm font-bold text-foreground">{branchLabels[branchId]}</div>
              </button>
            ))}
          </div>
          <div className="flex justify-end border-t border-border/60 px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setFinalExamCopyOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={finalExamActivationDialogOpen} onOpenChange={setFinalExamActivationDialogOpen}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <DialogTitle className="text-right text-xl">تفعيل الاختبار النهائي</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 py-3">
            <p className="text-sm text-muted-foreground">حدد مدة فتح الاختبار لفرع {branchLabels[effectiveFinalExamManageBranch]} فقط.</p>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">المدة بالدقائق</label>
              <Input value={finalExamActivationMinutes} onChange={(e) => setFinalExamActivationMinutes(e.target.value)} placeholder="60" className="h-11 rounded-2xl text-right" />
            </div>
            {finalExamActivationError && <p className="text-sm font-medium text-destructive">{finalExamActivationError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t border-border/60 px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setFinalExamActivationDialogOpen(false)}>إلغاء</Button>
            <Button className="rounded-full px-5" onClick={() => void handleActivateFinalExam()}>تفعيل</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(partsDialogStudent)} onOpenChange={(open) => !open && setPartsDialogStudentId(null)}>
        <DialogContent className="max-w-2xl rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <DialogTitle className="text-right text-xl">{partsDialogStudent ? `أجزاء ${partsDialogStudent.name}` : "الأجزاء"}</DialogTitle>
          </DialogHeader>
          {partsDialogStudent && (
            <div className="space-y-4 p-4">
              <div className="text-sm text-muted-foreground">اضغط على الجزء لتحديده أو إلغائه.</div>
              <div className="flex justify-center">
                {renderPartGrid(partsDialogStudent.id, partsDialogStudent.completedParts)}
              </div>
              <div className="flex justify-end gap-3 border-t border-border/60 pt-4">
                <Button variant="outline" className="rounded-full px-5" onClick={() => setPartsDialogStudentId(null)}>
                  إغلاق
                </Button>
                <Button
                  className="rounded-full px-5"
                  variant={partsDialogStudent.isCertified ? "outline" : "default"}
                  onClick={() => store.toggleCertifiedStudent(partsDialogStudent.id)}
                >
                  {partsDialogStudent.isCertified ? "مجاز" : "اعتماد مجاز"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={recitersOpen} onOpenChange={(open) => {
        setRecitersOpen(open);
        if (!open) {
          resetReciterForm();
        }
      }}>
        <DialogContent className="max-w-lg rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <DialogTitle className="text-right text-xl text-foreground">{editingReciterId ? "تعديل المقرئ" : "إضافة مقرئ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 py-3">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">اسم المقرئ</div>
              <Input value={reciterForm.name} onChange={(event) => setReciterForm((current) => ({ ...current, name: event.target.value }))} placeholder="اسم المقرئ" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">الفرع</div>
              {managedBranchId ? (
                <div className="rounded-[0.9rem] border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
                  {branchLabels[managedBranchId]}
                </div>
              ) : (
                <Select
                  value={reciterForm.branchId}
                  onValueChange={(value) => setReciterForm((current) => ({ ...current, branchId: value as BranchId, studentIds: [] }))}
                >
                  <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">الطلاب المرتبطون (اختياري)</div>
              <div className="rounded-[1.25rem] border border-border/60 bg-white p-3">
                {availableReciterStudents.length > 0 ? (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {availableReciterStudents.map((student) => {
                      const checked = reciterForm.studentIds.includes(student.id);

                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setReciterForm((current) => ({
                              ...current,
                              studentIds: checked
                                ? current.studentIds.filter((currentStudentId) => currentStudentId !== student.id)
                                : [...new Set([...current.studentIds, student.id])],
                            }));
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-right transition-smooth",
                            checked
                              ? "border-primary/35 bg-primary/10"
                              : "border-border/60 bg-muted/10 hover:border-primary/25 hover:bg-primary/5",
                          )}
                        >
                          <div className="text-sm font-medium text-foreground">{student.name}</div>
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 rounded-full border-2 transition-colors",
                              checked ? "border-primary bg-primary" : "border-primary/70 bg-transparent",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-3 text-sm text-muted-foreground">لا يوجد طلاب متاحون</div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">رقم الدخول</div>
              <Input value={reciterForm.loginCode} onChange={(event) => setReciterForm((current) => ({ ...current, loginCode: event.target.value }))} placeholder="رقم الدخول" />
            </div>
            {reciterError && <p className="text-sm font-medium text-destructive">{reciterError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t border-border/60 px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setRecitersOpen(false)} disabled={reciterSubmitting}>إلغاء</Button>
            <Button className="rounded-full px-5" onClick={handleSaveReciter} disabled={reciterSubmitting}>{reciterSubmitting ? "جارٍ الحفظ..." : editingReciterId ? "حفظ" : "إضافة"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedReciterActions)} onOpenChange={(open) => !open && resetReciterActionsState()}>
        <DialogContent className="max-w-md rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <DialogTitle className="text-right text-xl text-foreground">إجراءات المقرئ</DialogTitle>
            <DialogDescription className="text-right">
              {selectedReciterActions ? `اختر الإجراء المناسب للمقرئ ${selectedReciterActions.reciter.name}.` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 px-4 py-3">
            {hasPermission("transfer_reciter_student") && (
            <Button
              variant="outline"
              className="w-full justify-center rounded-full px-5"
              onClick={handleTransferFromReciterActions}
              disabled={!selectedReciterActions?.canTransferSingleStudent || adminTransferSubmitting}
              title={
                !selectedReciterActions?.primaryLinkedStudent
                  ? "لا يوجد طلاب مرتبطون"
                  : selectedReciterActions.linkedStudents.length !== 1
                    ? "يتاح النقل من هذا الخيار عند ربط طالب واحد فقط"
                    : !selectedReciterActions.canTransferSingleStudent
                      ? "لا يوجد مقرئ آخر متاح في نفس الفرع"
                      : "نقل الطالب إلى مقرئ آخر"
              }
            >
              <ArrowRightLeft className="size-4" />
              نقل الطالب المرتبط
            </Button>
            )}
            {hasPermission("edit_reciter") && (
            <Button variant="outline" className="w-full justify-center rounded-full px-5" onClick={handleEditFromReciterActions}>
              <Pencil className="size-4" />
              تعديل المقرئ
            </Button>
            )}
            {hasPermission("delete_reciter") && (
            <Button variant="outline" className="w-full justify-center rounded-full px-5 text-destructive hover:text-destructive" onClick={handleDeleteFromReciterActions}>
              <Trash2 className="size-4" />
              حذف المقرئ
            </Button>
            )}
          </div>

          <div className="flex justify-end border-t border-border/60 px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={resetReciterActionsState}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingAdminTransfer)} onOpenChange={(open) => !open && resetAdminTransferState()}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <DialogTitle className="text-right text-xl text-foreground">نقل الطالب</DialogTitle>
            <DialogDescription className="sr-only"></DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-3">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">المقرئ الجديد</div>
              <Select
                value={adminTransferTargetReciterId}
                onValueChange={setAdminTransferTargetReciterId}
                disabled={adminTransferSubmitting || availableAdminTransferReciters.length === 0}
              >
                <SelectTrigger className="flex-row-reverse bg-white text-right [&>span]:w-full [&>span]:text-right">
                  <SelectValue placeholder={availableAdminTransferReciters.length ? "اختر المقرئ" : "لا يوجد مقرئ آخر متاح في نفس الفرع"} />
                </SelectTrigger>
                <SelectContent className="border-border/70 bg-white text-right shadow-lg backdrop-blur-none">
                  {availableAdminTransferReciters.map((reciter) => <SelectItem key={reciter.id} value={reciter.id} className="justify-end pr-8 text-right">{reciter.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {adminTransferError && <p className="text-sm font-medium text-destructive">{adminTransferError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t border-border/60 px-4 py-3">
            <Button variant="outline" className="rounded-full px-5" onClick={resetAdminTransferState} disabled={adminTransferSubmitting}>إلغاء</Button>
            <Button className="rounded-full px-5" onClick={() => void handleAdminTransferStudent()} disabled={adminTransferSubmitting || availableAdminTransferReciters.length === 0}>
              {adminTransferSubmitting ? "جارٍ النقل..." : "نقل"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteStudent)} onOpenChange={(open) => !open && setPendingDeleteStudent(null)}>
        <AlertDialogContent className="max-w-sm rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <AlertDialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <AlertDialogTitle className="text-right text-lg text-foreground">تأكيد حذف الطالب</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm leading-6 text-muted-foreground">
              {pendingDeleteStudent
                ? `سيتم حذف ${pendingDeleteStudent.name} نهائيًا من القائمة${pendingDeleteStudentLinkedReciters.length > 0 ? ` وإزالته من ${pendingDeleteStudentLinkedReciters.length} ${pendingDeleteStudentLinkedReciters.length === 1 ? "مقرئ مرتبط" : "روابط مقرئين"}` : ""}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-start gap-2 px-4 py-3 sm:justify-start sm:space-x-0">
            <AlertDialogAction className="rounded-full bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteStudent}>
              حذف
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 rounded-full px-4">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDeleteCourse)} onOpenChange={(open) => !open && setPendingDeleteCourse(null)}>
        <AlertDialogContent className="max-w-sm overflow-hidden rounded-[1.75rem] border border-primary/20 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(8,65,89,0.14)] backdrop-blur-sm">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-10 -left-6 h-24 w-24 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -bottom-10 -right-6 h-24 w-24 rounded-full bg-destructive/10 blur-3xl" />
            </div>
            <AlertDialogHeader className="relative border-b border-border/60 px-4 py-3 text-right">
              <AlertDialogTitle className="text-right text-xl text-foreground">تأكيد حذف الدورة</AlertDialogTitle>
              <AlertDialogDescription className="text-right text-sm leading-6 text-muted-foreground">
                {pendingDeleteCourse ? `سيتم حذف الدورة ${pendingDeleteCourse.name} نهائيًا مع ${pendingDeleteCourseQuestionsCount} سؤال و${pendingDeleteCourseSubmissionsCount} نتيجة و${pendingDeleteCourseAttendanceCount} سجل حضور مرتبط.` : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="relative justify-start gap-2 px-4 py-3 sm:justify-start sm:space-x-0">
              <AlertDialogAction className="rounded-full bg-destructive px-5 text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteCourse}>
                حذف الدورة
              </AlertDialogAction>
              <AlertDialogCancel className="mt-0 rounded-full border-primary/15 px-5">إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDeleteReciter)} onOpenChange={(open) => !open && setPendingDeleteReciter(null)}>
        <AlertDialogContent className="max-w-sm rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <AlertDialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <AlertDialogTitle className="text-right text-lg text-foreground">تأكيد حذف المقرئ</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm leading-6 text-muted-foreground">
              {pendingDeleteReciter ? `سيتم حذف ${pendingDeleteReciter.name} نهائيًا من القائمة${pendingDeleteReciterStudentsCount > 0 ? ` مع فك ارتباط ${pendingDeleteReciterStudentsCount} ${pendingDeleteReciterStudentsCount === 1 ? "طالب" : "طلاب"}` : ""}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-start gap-2 px-4 py-3 sm:justify-start sm:space-x-0">
            <AlertDialogAction className="rounded-full bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteReciter}>
              {reciterDeleting ? "جارٍ الحذف..." : "حذف"}
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 rounded-full px-4">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingAttendanceSave)} onOpenChange={(open) => !open && setPendingAttendanceSave(null)}>
        <AlertDialogContent className="max-w-sm rounded-[1.75rem] border-primary/20 bg-white/95 p-0 text-right shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <AlertDialogHeader className="border-b border-border/60 px-4 py-3 text-right">
            <AlertDialogTitle className="text-right text-lg text-foreground">تأكيد {pendingAttendanceSave?.isTask ? "حفظ المهام" : "حفظ التحضير"}</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm leading-6 text-muted-foreground">
              {pendingAttendanceSave
                ? `${pendingAttendanceSave.isTask ? "سيتم تحديث حالة التنفيذ" : "سيتم تحديث الحضور"} في ${pendingAttendanceSave.courseTitle} لفرع ${pendingAttendanceSave.branchLabel}. الحاضرون/المنفذون الآن: ${pendingAttendanceSave.presentStudents.length}، والتغييرات المكتشفة: ${pendingAttendanceSave.changedCount}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-start gap-2 px-4 py-3 sm:justify-start sm:space-x-0">
            <AlertDialogAction className="rounded-full px-4" onClick={() => void confirmAttendanceSave()}>
              تأكيد الحفظ
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 rounded-full px-4">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Dashboard;
