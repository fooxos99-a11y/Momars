import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertCircle, CheckCircle, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AssessmentType, CourseRecord, StudentRecord, SubmissionAnswer } from "@/lib/dashboard-store";

/* ─── types ─────────────────────────────────────────────── */

export interface ImportRow {
  excelName: string;
  matchedStudent: StudentRecord | null;
  excelScore: number | null;
  /** editable by admin before saving */
  manualScore: string;
  answers: SubmissionAnswer[];
  questionMatchCount: number;
}

export interface ImportResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: CourseRecord[];
  students: StudentRecord[];
  defaultCourseId?: string;
  defaultAssessmentType?: AssessmentType;
  onSave: (
    courseId: string,
    assessmentType: AssessmentType,
    rows: ImportRow[],
  ) => Promise<void>;
}

/* ─── helpers ────────────────────────────────────────────── */

const normalizeName = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

const toWesternDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));

const normalizeImportedAnswerValue = (raw: string, question: CourseRecord["preQuestions"][number]) => {
  const value = raw.trim();
  if (!value) return "0";

  if (question.type === "multiple" || question.type === "truefalse") {
    const options = question.options ?? [];

    // Helper: strip leading marker (أ) ب. ج- etc.) and trailing punctuation for comparison
    const normalizeForMatch = (s: string) => s
      .trim()
      .replace(/[\u064B-\u065F\u0670]/g, "")  // strip tashkeel
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[.،,؛;!?؟:]+$/g, "")           // strip trailing punctuation
      .replace(/^[أ-ي]\s*[).\-:]\s*/i, "")     // strip leading marker "ب) "
      .trim()
      .toLowerCase();

    // Try exact or normalized match against options directly
    const directMatch = options.find((opt) => normalizeForMatch(opt) === normalizeForMatch(value));
    if (directMatch) return directMatch;

    const numericToken = toWesternDigits(value).match(/^\s*(\d{1,2})\s*$/)?.[1];
    if (numericToken) {
      const idx = Number(numericToken) - 1;
      if (idx >= 0 && idx < options.length) {
        return options[idx];
      }
    }

    const letterToken = value.toLowerCase().match(/^\s*([a-z])\s*$/)?.[1];
    if (letterToken) {
      const idx = letterToken.charCodeAt(0) - 97;
      if (idx >= 0 && idx < options.length) {
        return options[idx];
      }
    }

    const arabicLetterMap: Record<string, number> = {
      "ا": 0,
      "أ": 0,
      "ب": 1,
      "ج": 2,
      "د": 3,
      "هـ": 4,
      "ه": 4,
      "و": 5,
    };
    const arabicLetterToken = value.match(/^\s*([اأبجدهـو])\s*$/)?.[1];
    if (arabicLetterToken !== undefined) {
      const idx = arabicLetterMap[arabicLetterToken];
      if (idx !== undefined && idx >= 0 && idx < options.length) {
        return options[idx];
      }
    }

    if (question.type === "truefalse") {
      const normalized = value.toLowerCase();
      if (["صح", "صحيح", "true", "t", "yes", "نعم", "1"].includes(normalized)) return "صح";
      if (["خطا", "خطأ", "false", "f", "no", "لا", "0"].includes(normalized)) return "خطأ";
    }

    // Partial/fuzzy match: value starts with option text after normalization
    const fuzzyMatch = options.find((opt) => {
      const nOpt = normalizeForMatch(opt);
      const nVal = normalizeForMatch(value);
      return nOpt && nVal && (nVal.startsWith(nOpt) || nOpt.startsWith(nVal) || nVal.includes(nOpt));
    });
    if (fuzzyMatch) return fuzzyMatch;
  }

  return value;
};

const assessmentLabels: Record<AssessmentType, string> = {
  pre: "الاختبار القبلي",
  post: "الاختبار البعدي",
  tasks: "التكاليف",
};

const detectAssessmentTypeFromFileName = (fileName: string): AssessmentType | null => {
  const normalized = normalizeName(fileName.replace(/\.(xlsx|xls)$/i, ""));

  if (/\b(pre|qabli|qabli)\b/i.test(fileName) || normalized.includes("قبلي")) return "pre";
  if (/\b(post|baadi|ba\W?di)\b/i.test(fileName) || normalized.includes("بعدي")) return "post";
  if (/\b(task|assignment)\b/i.test(fileName) || normalized.includes("تكليف") || normalized.includes("واجب")) return "tasks";

  return null;
};

type ImportQuestion = CourseRecord["preQuestions"][number];

const normalizeQuestionHeader = (value: string) => {
  const normalized = normalizeName(value);
  return normalized
    .replace(/^(?:السؤال|سؤال|س|question|q)\s*/i, "")
    .replace(/^[-_.:()\s]+/, "")
    .replace(/^\d{1,3}\s*[-_.:)\s]+/, "")
    .trim();
};

const parseQuestionIndexFromHeader = (value: string): number | null => {
  const normalized = toWesternDigits(value);
  const direct = normalized.match(/^\s*(?:س(?:ؤال)?|q(?:uestion)?)?\s*(\d{1,3})\s*(?:$|[-_.:()\s])/i);
  if (direct?.[1]) {
    const index = Number(direct[1]) - 1;
    return index >= 0 ? index : null;
  }
  return null;
};

const buildQuestionColumnMap = (
  headers: string[],
  questions: ImportQuestion[],
  nameCol: string,
  scoreCol: string | null,
) => {
  const map = new Map<string, string>();
  const usedQuestionIds = new Set<string>();

  for (const header of headers) {
    if (header === nameCol || header === scoreCol) continue;

    const indexed = parseQuestionIndexFromHeader(header);
    if (indexed !== null && questions[indexed] && !usedQuestionIds.has(questions[indexed].id)) {
      map.set(header, questions[indexed].id);
      usedQuestionIds.add(questions[indexed].id);
      continue;
    }

    const hNorm = normalizeQuestionHeader(header);
    if (!hNorm) continue;

    const candidate = questions.find((q) => {
      if (usedQuestionIds.has(q.id)) return false;
      const qNorm = normalizeQuestionHeader(q.prompt);
      if (!qNorm) return false;

      const prefixWindow = 18;
      return (
        qNorm === hNorm ||
        qNorm.startsWith(hNorm.slice(0, prefixWindow)) ||
        hNorm.startsWith(qNorm.slice(0, prefixWindow)) ||
        (hNorm.length >= 10 && qNorm.includes(hNorm)) ||
        (qNorm.length >= 10 && hNorm.includes(qNorm))
      );
    });

    if (candidate) {
      map.set(header, candidate.id);
      usedQuestionIds.add(candidate.id);
    }
  }

  return map;
};

/* ─── component ──────────────────────────────────────────── */

export const ImportResultsDialog = ({
  open,
  onOpenChange,
  courses,
  students,
  defaultCourseId = "",
  defaultAssessmentType = "pre",
  onSave,
}: ImportResultsDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [courseId, setCourseId] = useState(defaultCourseId);
  const [resolvedAssessmentType, setResolvedAssessmentType] = useState<AssessmentType>(defaultAssessmentType);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importAssessmentType, setImportAssessmentType] = useState<AssessmentType | null>(null);
  const [importQuestionCount, setImportQuestionCount] = useState(0);
  const [error, setError] = useState("");

  /* derived */
  const filteredCourses = courses;
  const filteredStudents = students;
  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;
  const isTaskCourse = selectedCourse?.entityType === "task";
  const selectableAssessmentTypes: AssessmentType[] = isTaskCourse ? ["tasks"] : ["pre", "post"];
  const questions = selectedCourse
    ? resolvedAssessmentType === "pre"
      ? selectedCourse.preQuestions
      : resolvedAssessmentType === "post"
        ? selectedCourse.postQuestions
        : selectedCourse.taskQuestions
    : [];

  useEffect(() => {
    if (!selectedCourse) return;
    if (selectedCourse.entityType === "task" && resolvedAssessmentType !== "tasks") {
      setResolvedAssessmentType("tasks");
      return;
    }
    if (selectedCourse.entityType !== "task" && resolvedAssessmentType === "tasks") {
      setResolvedAssessmentType(defaultAssessmentType === "post" ? "post" : "pre");
    }
  }, [defaultAssessmentType, resolvedAssessmentType, selectedCourse]);

  /* ── reset ──────────────────────────────────────────────── */
  const resetImport = () => {
    setImportRows([]);
    setImportAssessmentType(null);
    setImportQuestionCount(0);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resolveQuestionsForAssessment = (course: CourseRecord, type: AssessmentType) => {
    if (type === "pre") return course.preQuestions;
    if (type === "post") return course.postQuestions;
    return course.taskQuestions;
  };

  /* ── parse Excel ─────────────────────────────────────────── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!courseId) {
      setError("اختر الدورة أولاً.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImporting(true);
    setError("");
    setImportRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });

      if (rawRows.length === 0) {
        setError("الملف فارغ أو لا يحتوي على بيانات.");
        return;
      }

      const headers = Object.keys(rawRows[0]);

      /* find name column — pick the candidate with the most non-empty values */
      const nameCandidates = [
        headers.find((h) => h.trim() === "الاسم1"),
        headers.find((h) => h.trim() === "الاسم2"),
        headers.find((h) => h.trim() === "الاسم"),
        headers.find((h) => /اسم/i.test(h) && h.trim() !== "الاسم"),
        headers.find((h) => /^\s*name\s*$/i.test(h)),
        headers.find((h) => /student.?name|full.?name/i.test(h)),
      ].filter((h): h is string => !!h);

      const nameCol = nameCandidates.length === 0
        ? null
        : nameCandidates.reduce((best, col) => {
            const filled = rawRows.filter((r) => String(r[col] ?? "").trim()).length;
            const bestFilled = rawRows.filter((r) => String(r[best] ?? "").trim()).length;
            return filled > bestFilled ? col : best;
          });

      /* find total score column */
      const scoreCol =
        headers.find((h) => h.trim() === "إجمالي النقاط") ??
        headers.find((h) => /إجمالي|النقاط|الدرجة|المجموع/i.test(h)) ??
        headers.find((h) => /^\s*score\s*$/i.test(h)) ??
        headers.find((h) => /\bscore\b|\bpoints\b|\btotal\b/i.test(h)) ??
        null;

      if (!nameCol) {
        const columnList = headers.slice(0, 10).join(" | ");
        setError(
          `لم يتم العثور على عمود اسم الطالب. الأعمدة الموجودة في الملف: ${columnList}`,
        );
        return;
      }

      const fileNameAssessmentType = detectAssessmentTypeFromFileName(file.name);

      const candidates = (selectedCourse?.entityType === "task" ? ["tasks"] : ["pre", "post"]) as AssessmentType[];
      const preferredType = (
        fileNameAssessmentType && candidates.includes(fileNameAssessmentType)
          ? fileNameAssessmentType
          : (candidates.includes(resolvedAssessmentType) ? resolvedAssessmentType : candidates[0])
      ) as AssessmentType;

      const candidateMaps = candidates.map((type) => {
        const candidateQuestions = selectedCourse ? resolveQuestionsForAssessment(selectedCourse, type) : [];
        const map = buildQuestionColumnMap(headers, candidateQuestions, nameCol, scoreCol);
        return { type, map, questions: candidateQuestions };
      });

      candidateMaps.sort((a, b) => {
        if (b.map.size !== a.map.size) return b.map.size - a.map.size;
        if (a.type === preferredType) return -1;
        if (b.type === preferredType) return 1;
        return 0;
      });

      const best = candidateMaps[0];
      const effectiveAssessmentType = best.type;
      const effectiveQuestions = best.questions;
      const questionColMap = best.map;

      setResolvedAssessmentType(effectiveAssessmentType);
      setImportAssessmentType(effectiveAssessmentType);
      setImportQuestionCount(effectiveQuestions.length);

      /* build rows */
      const rows: ImportRow[] = rawRows
        .filter((row) => String(row[nameCol] ?? "").trim())
        .map((row) => {
          const excelName = String(row[nameCol] ?? "").trim();
          // Handle "10 / 10" format (Google Forms) — extract the first number only
          const rawScoreStr = scoreCol ? String(row[scoreCol]).trim() : "";
          const rawScoreMatch = rawScoreStr.match(/(\d+(?:\.\d+)?)/)
          const rawScore = rawScoreMatch ? Number(rawScoreMatch[1]) : NaN;
          const excelScore = Number.isFinite(rawScore) && rawScore >= 0 ? rawScore : null;

          /* match student */
          const normExcel = normalizeName(excelName);
          const matchedStudent =
            students.find((s) => normalizeName(s.name) === normExcel) ?? null;

          /* collect answers: if missing/blank => 0 */
          
          // Pre-scan: find any semicolon-separated cell that may contain multiple true/false answers
          // (Google Forms exports all true/false answers in a single cell separated by ";")
          const truefalseAnswerMap = new Map<string, string>(); // questionId -> "صح"|"خطأ"
          for (const [header] of questionColMap.entries()) {
            const headerQuestion = effectiveQuestions.find((q) => {
              const matchedH = [...questionColMap.entries()].find(([, qId]) => qId === q.id)?.[0];
              return matchedH === header;
            });
            if (!headerQuestion) continue;
            
            const directValue = String(row[header] ?? "").trim();
            // Check if this column has semicolons indicating multiple answers
            if (directValue.includes(";") || directValue.includes("؛")) {
              const parts = directValue.split(/[;؛]/).map((p) => p.trim()).filter(Boolean);
              if (parts.length >= 2) {
                // Get all unmatched truefalse questions
                const truefalseQuestions = effectiveQuestions.filter((q) => q.type === "truefalse");
                if (truefalseQuestions.length >= 2) {
                  // Match each part to the most similar question by comparing text
                  for (const part of parts) {
                    const partNorm = normalizeName(part);
                    let bestMatch: typeof effectiveQuestions[0] | null = null;
                    let bestScore = 0;
                    for (const q of truefalseQuestions) {
                      if (truefalseAnswerMap.has(q.id)) continue;
                      const qNorm = normalizeName(q.prompt);
                      // Calculate overlap: how many words from question appear in the part
                      const qWords = qNorm.split(" ").filter((w) => w.length > 2);
                      const matchingWords = qWords.filter((w) => partNorm.includes(w));
                      const score = qWords.length > 0 ? matchingWords.length / qWords.length : 0;
                      if (score > bestScore) {
                        bestScore = score;
                        bestMatch = q;
                      }
                    }
                    if (bestMatch && bestScore >= 0.3) {
                      // Part contains the question text = صح (it was selected/checked)
                      truefalseAnswerMap.set(bestMatch.id, "صح");
                    }
                  }
                  // Any unmatched truefalse question that wasn't selected = خطأ
                  for (const q of truefalseQuestions) {
                    if (!truefalseAnswerMap.has(q.id)) {
                      truefalseAnswerMap.set(q.id, "خطأ");
                    }
                  }
                }
              }
            }
          }
          
          const answers: SubmissionAnswer[] = effectiveQuestions.map((question) => {
            // If we have a pre-resolved truefalse answer, use it
            if (question.type === "truefalse" && truefalseAnswerMap.has(question.id)) {
              return { questionId: question.id, value: truefalseAnswerMap.get(question.id)! };
            }
            
            const matchedHeader = [...questionColMap.entries()].find(([, qId]) => qId === question.id)?.[0];
            
            let rawValue = "";
            if (matchedHeader) {
              // Try the direct column first
              const directValue = String(row[matchedHeader] ?? "").trim();
              
              // Skip semicolon-separated cells for individual questions (already handled above)
              if (!directValue.includes(";") && !directValue.includes("؛")) {
                rawValue = directValue;
              }
              
              // If the direct value is empty or a number (like 0), try the "remarks/notes" column
              // (which is 2 columns after the answer column in Google Forms export format)
              if (!rawValue || /^\d+$/.test(rawValue)) {
                const colIndex = headers.indexOf(matchedHeader);
                if (colIndex >= 0 && colIndex + 2 < headers.length) {
                  const remarksHeader = headers[colIndex + 2];
                  const remarksValue = String(row[remarksHeader] ?? "").trim();
                  // If remarks column has a meaningful answer (not just empty or a number), use it
                  if (remarksValue && !(/^\d+$/.test(remarksValue)) && !remarksValue.includes(";")) {
                    rawValue = remarksValue;
                  }
                }
              }
              
              // If still empty, use the direct value
              if (!rawValue) {
                rawValue = directValue;
              }
            }
            
            return {
              questionId: question.id,
              value: normalizeImportedAnswerValue(rawValue, question),
            };
          });

          // Count truefalse questions resolved via semicolon splitting as matched too
          const truefalseMatchedCount = truefalseAnswerMap.size;
          const directMatchedCount = questionColMap.size;
          const totalMatchedCount = directMatchedCount + truefalseMatchedCount;

          return {
            excelName,
            matchedStudent,
            excelScore,
            manualScore: excelScore !== null ? String(excelScore) : "",
            answers,
            questionMatchCount: totalMatchedCount,
          };
        });

      if (rows.length === 0) {
        const columnList = headers.slice(0, 10).join(" | ");
        setError(
          `لم يتم العثور على أي سجلات. تأكد من أن عمود الاسم ('${nameCol}') يحتوي على بيانات. الأعمدة: ${columnList}`,
        );
        return;
      }

      setImportRows(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`تعذر قراءة الملف: ${msg}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── save ────────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!courseId || importRows.length === 0) return;
    const validRows = importRows.filter((r) => r.matchedStudent);
    if (validRows.length === 0) {
      setError("لا يوجد طلاب مطابقون للحفظ.");
      return;
    }

    const assessmentTypeForSave = importAssessmentType ?? resolvedAssessmentType;
    const questionsForSave = selectedCourse ? resolveQuestionsForAssessment(selectedCourse, assessmentTypeForSave) : questions;

    const existingLoginIds = new Set(validRows.map((r) => r.matchedStudent!.loginId));
    const autoZeroRows: ImportRow[] = filteredStudents
      .filter((student) => !existingLoginIds.has(student.loginId))
      .map((student) => ({
        excelName: student.name,
        matchedStudent: student,
        excelScore: 0,
        manualScore: "0",
        answers: questionsForSave.map((question) => ({ questionId: question.id, value: "0" })),
        questionMatchCount: questionsForSave.length,
      }));

    const rowsToSave = [...validRows, ...autoZeroRows];

    setSaving(true);
    setError("");
    try {
      await onSave(courseId, assessmentTypeForSave, rowsToSave);
      onOpenChange(false);
      resetImport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ النتائج.");
    } finally {
      setSaving(false);
    }
  };

  /* ── counts ──────────────────────────────────────────────── */
  const matchedCount = importRows.filter((r) => r.matchedStudent).length;
  const unmatchedCount = importRows.filter((r) => !r.matchedStudent).length;
  const totalStudentsCount = filteredStudents.length;
  const autoZeroCount = Math.max(0, totalStudentsCount - matchedCount);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!saving) {
          onOpenChange(o);
          if (!o) resetImport();
        }
      }}
    >
      <DialogContent className="flex w-[min(98vw,1100px)] max-h-[92vh] flex-col rounded-[1.5rem] p-0 text-right [&>button]:hidden">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 border-b border-border/60 px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">تعديل البيانات</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full px-3"
              onClick={() => { onOpenChange(false); resetImport(); }}
              disabled={saving}
            >
              ✕
            </Button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Selectors */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">الدورة / المهام</label>
              <Select
                value={courseId}
                onValueChange={(v) => {
                  setCourseId(v);
                  const nextCourse = courses.find((c) => c.id === v);
                  if (nextCourse?.entityType === "task") {
                    setResolvedAssessmentType("tasks");
                  } else {
                    setResolvedAssessmentType(defaultAssessmentType === "post" ? "post" : "pre");
                  }
                  resetImport();
                }}
              >
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right [&>span]:truncate">
                  <SelectValue placeholder="اختر الدورة" />
                </SelectTrigger>
                <SelectContent className="text-right">
                  {filteredCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="justify-end pr-3 text-right">
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">نوع التقييم</label>
              <Select
                value={resolvedAssessmentType}
                onValueChange={(v) => {
                  setResolvedAssessmentType(v as AssessmentType);
                  resetImport();
                }}
                disabled={!selectedCourse}
              >
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-right">
                  {selectableAssessmentTypes.map((type) => (
                    <SelectItem key={type} value={type} className="justify-end pr-3 text-right">
                      {assessmentLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Upload button */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
            <Button
              variant="outline"
              onClick={() => {
                if (!courseId) { setError("اختر الدورة أولاً."); return; }
                fileInputRef.current?.click();
              }}
              disabled={importing || saving}
              className="rounded-full px-5"
            >
              {importing
                ? <Loader2 className="size-4 ml-2 animate-spin" />
                : <Upload className="size-4 ml-2" />}
              رفع ملف Excel
            </Button>

            {importing && (
              <span className="text-sm text-muted-foreground">جاري تحليل الملف…</span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Summary badges */}
          {importRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle className="size-4" /> مطابق: {matchedCount}
              </span>
              {unmatchedCount > 0 && (
                <span className="flex items-center gap-1 text-amber-700">
                  <AlertCircle className="size-4" /> غير مطابق: {unmatchedCount}
                </span>
              )}
              <span className="text-muted-foreground">من أصل {importRows.length} سجل في الملف</span>
            </div>
          )}

          {/* Preview table */}
          {importRows.length > 0 && (
            <div className="overflow-hidden rounded-[1.25rem] border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-bold">الاسم في الملف</TableHead>
                    <TableHead className="text-right font-bold">الطالب المطابق</TableHead>
                    <TableHead className="text-right font-bold">درجة الملف</TableHead>
                    <TableHead className="text-right font-bold">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.map((row, idx) => (
                    <TableRow
                      key={idx}
                      className={cn(!row.matchedStudent && "bg-amber-50/50 opacity-70")}
                    >
                      <TableCell className="text-right">{row.excelName}</TableCell>
                      <TableCell className="text-right">
                        {row.matchedStudent ? (
                          <div>
                            <div className="font-medium text-foreground">{row.matchedStudent.name}</div>
                            <div className="text-xs text-muted-foreground">{row.matchedStudent.loginId}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">لم يتم التعرف</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.matchedStudent ? (
                          <Input
                            type="number"
                            min="0"
                            value={row.manualScore}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^\d*\.?\d*$/.test(val)) {
                                setImportRows((prev) =>
                                  prev.map((r, i) => i === idx ? { ...r, manualScore: val } : r),
                                );
                              }
                            }}
                            className="h-8 w-24 rounded-xl text-center text-sm"
                            placeholder="0"
                          />
                        ) : (
                          row.excelScore !== null ? (
                            <Badge variant="outline" className="border-border text-muted-foreground">
                              {row.excelScore}
                            </Badge>
                          ) : "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.matchedStudent ? (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                            <CheckCircle className="mr-1 size-3" /> مطابق
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">
                            <AlertCircle className="mr-1 size-3" /> غير مطابق
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Footer */}
        {matchedCount > 0 && (
          <div className="flex flex-shrink-0 items-center justify-end border-t border-border/60 px-6 py-4">
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-full px-6"
            >
              {saving && <Loader2 className="ml-2 size-4 animate-spin" />}
              حفظ النتائج
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* tiny helper to display matched column count in summary */
function questionColMap_count_display(rows: ImportRow[]) {
  return rows[0]?.questionMatchCount ?? 0;
}

export default ImportResultsDialog;
