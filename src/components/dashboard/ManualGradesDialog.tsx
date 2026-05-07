import { useEffect, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AssessmentType, BranchId, CourseRecord, CourseSubmission, StudentRecord } from "@/lib/dashboard-store";

export interface ManualGradesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: CourseRecord[];
  students: StudentRecord[];
  submissions: CourseSubmission[];
  defaultCourseId?: string;
  defaultAssessmentType?: AssessmentType;
  onImportClick?: () => void;
  onSave: (
    courseId: string,
    assessmentType: AssessmentType,
    rows: Array<{ studentName: string; loginId: string; score: number | null }>,
  ) => Promise<void>;
}

const assessmentLabels: Record<AssessmentType, string> = {
  pre: "الاختبار القبلي",
  post: "الاختبار البعدي",
  tasks: "المهام الأدائية",
};

export const ManualGradesDialog = ({
  open,
  onOpenChange,
  courses,
  students,
  submissions,
  defaultCourseId = "",
  defaultAssessmentType = "pre",
  onImportClick,
  onSave,
}: ManualGradesDialogProps) => {
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [assessmentType, setAssessmentType] = useState<AssessmentType>(defaultAssessmentType);
  const [branchId, setBranchId] = useState<BranchId>("male");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;
  const isTaskCourse = selectedCourse?.entityType === "task";
  const selectableTypes: AssessmentType[] = isTaskCourse ? ["tasks"] : ["pre", "post"];

  const branchStudents = students.filter((s) => s.branchId === branchId);

  /* sync assessmentType when course changes */
  useEffect(() => {
    if (!selectedCourse) return;
    if (isTaskCourse && assessmentType !== "tasks") setAssessmentType("tasks");
    else if (!isTaskCourse && assessmentType === "tasks") setAssessmentType("pre");
  }, [isTaskCourse, selectedCourse, assessmentType]);

  /* build initial scores from existing submissions whenever course/type/branch changes */
  useEffect(() => {
    if (!courseId) return;
    const initial: Record<string, string> = {};
    for (const student of branchStudents) {
      const sub = submissions.find(
        (s) => s.courseId === courseId && s.assessmentType === assessmentType && s.loginId === student.loginId,
      );
      if (sub) {
        const override = sub.answers.find((a) => a.questionId === "__score_override__")?.value;
        const score =
          typeof sub.manualScore === "number" && Number.isFinite(sub.manualScore)
            ? sub.manualScore
            : override !== undefined && Number.isFinite(Number(override))
              ? Number(override)
              : null;
        initial[student.loginId] = score !== null ? String(score) : "";
      } else {
        initial[student.loginId] = "";
      }
    }
    setScores(initial);
    setError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, assessmentType, branchId]);

  const handleClose = () => {
    if (!saving) onOpenChange(false);
  };

  const handleSave = async () => {
    if (!courseId) { setError("اختر الدورة أولاً."); return; }
    setSaving(true);
    setError("");
    try {
      const rows = branchStudents.map((student) => ({
        studentName: student.name,
        loginId: student.loginId,
        score: isTaskCourse
          ? scores[student.loginId] === "1"
            ? 1
            : null
          : scores[student.loginId] === "" || scores[student.loginId] === undefined
            ? 0
            : Number(scores[student.loginId]),
      }));
      await onSave(courseId, assessmentType, rows);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الدرجات.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex w-[min(98vw,700px)] max-h-[90vh] flex-col rounded-[1.75rem] p-0 text-right [&>button]:hidden">
        <DialogHeader className="flex-shrink-0 border-b border-border/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {onImportClick ? (
              <Button type="button" variant="outline" className="rounded-full px-4" onClick={onImportClick}>
                <FileUp className="size-4" />
                استيراد
              </Button>
            ) : <span />}
            <DialogTitle className="text-xl">تعديل الدرجات يدوياً</DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {/* Selectors */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">الدورة / المهام</label>
              <Select
                value={courseId}
                onValueChange={(v) => {
                  setCourseId(v);
                  const next = courses.find((c) => c.id === v);
                  if (next?.entityType === "task") setAssessmentType("tasks");
                  else setAssessmentType(defaultAssessmentType === "post" ? "post" : "pre");
                }}
              >
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right [&>span]:truncate">
                  <SelectValue placeholder="اختر الدورة" />
                </SelectTrigger>
                <SelectContent className="text-right">
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="justify-end pr-3 text-right">
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isTaskCourse && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">نوع الاختبار</label>
                <Select value={assessmentType} onValueChange={(v) => setAssessmentType(v as AssessmentType)}>
                  <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-right">
                    {selectableTypes.map((t) => (
                      <SelectItem key={t} value={t} className="justify-end pr-3 text-right">
                        {assessmentLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">الفرع</label>
              <Select value={branchId} onValueChange={(v) => setBranchId(v as BranchId)}>
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-right">
                  <SelectItem value="male" className="justify-end pr-3 text-right">معلمين</SelectItem>
                  <SelectItem value="female" className="justify-end pr-3 text-right">معلمات</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {courseId && branchStudents.length === 0 && (
            <div className="rounded-[1rem] border border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              لا يوجد طلاب في هذا الفرع.
            </div>
          )}

          {courseId && branchStudents.length > 0 && (
            <div className="overflow-x-auto rounded-[1.25rem] border border-border/60 bg-white">
              {isTaskCourse && (
                <div className="flex justify-end border-b border-border/60 px-3 py-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full px-4"
                    onClick={() =>
                      setScores((prev) =>
                        Object.fromEntries(
                          branchStudents.map((student) => [student.loginId, prev[student.loginId] === "1" ? "0" : "1"]),
                        ),
                      )
                    }
                  >
                    {branchStudents.every((student) => scores[student.loginId] === "1") ? "إلغاء تنفيذ الكل" : "تنفيذ للكل"}
                  </Button>
                </div>
              )}
              <Table className="min-w-[360px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-right font-bold text-foreground">الاسم</TableHead>
                    <TableHead className="text-right font-bold text-foreground">رقم الدخول</TableHead>
                    <TableHead className="w-28 text-right font-bold text-foreground">{isTaskCourse ? "منفذ" : "الدرجة"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchStudents.map((student) => (
                    <TableRow key={student.loginId}>
                      <TableCell className="text-right font-semibold text-foreground">{student.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{student.loginId}</TableCell>
                      <TableCell>
                        {isTaskCourse ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={scores[student.loginId] === "1"}
                            aria-label={`تحديد تنفيذ ${student.name}`}
                            onClick={() =>
                              setScores((prev) => ({
                                ...prev,
                                [student.loginId]: prev[student.loginId] === "1" ? "0" : "1",
                              }))
                            }
                            className={cn(
                              "relative flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-300 ease-out",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
                              scores[student.loginId] === "1"
                                ? "border-[#138bb0] bg-[linear-gradient(135deg,#0f6f8f_0%,#1498bd_55%,#35b7d7_100%)] shadow-[0_10px_24px_rgba(20,152,189,0.28)]"
                                : "border-[#d6e7ee] bg-[linear-gradient(180deg,#ffffff_0%,#f1f9fc_100%)] shadow-[inset_0_1px_10px_rgba(255,255,255,0.85)] hover:border-[#b7d8e4] hover:bg-[linear-gradient(180deg,#fcfeff_0%,#edf7fb_100%)]",
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none h-2.5 w-2.5 rounded-full transition-all duration-300 ease-out",
                                scores[student.loginId] === "1"
                                  ? "bg-white/30 shadow-[0_0_0_4px_rgba(255,255,255,0.14)]"
                                  : "bg-[#e3f1f6]",
                              )}
                            />
                          </button>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={scores[student.loginId] ?? ""}
                            onChange={(e) =>
                              setScores((prev) => ({ ...prev, [student.loginId]: e.target.value }))
                            }
                            className={cn("h-8 w-24 text-center text-sm", "rounded-lg")}
                            placeholder="0"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between border-t border-border/60 px-4 py-3">
          <Button variant="outline" className="rounded-full px-5" onClick={handleClose} disabled={saving}>
            إلغاء
          </Button>
          <Button
            className="rounded-full px-5"
            onClick={handleSave}
            disabled={saving || !courseId || branchStudents.length === 0}
          >
            {saving ? <><Loader2 className="size-4 animate-spin ml-2" />جارٍ الحفظ...</> : "حفظ"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManualGradesDialog;
