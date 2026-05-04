import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  onSave: (
    courseId: string,
    assessmentType: AssessmentType,
    rows: Array<{ studentName: string; loginId: string; score: number }>,
  ) => Promise<void>;
}

const assessmentLabels: Record<AssessmentType, string> = {
  pre: "الاختبار القبلي",
  post: "الاختبار البعدي",
  tasks: "التكاليف",
};

export const ManualGradesDialog = ({
  open,
  onOpenChange,
  courses,
  students,
  submissions,
  defaultCourseId = "",
  defaultAssessmentType = "pre",
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
        score: scores[student.loginId] === "" || scores[student.loginId] === undefined
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
      <DialogContent className="flex w-[min(98vw,700px)] max-h-[90vh] flex-col rounded-[1.5rem] p-0 text-right [&>button]:hidden">
        <DialogHeader className="flex-shrink-0 border-b border-border/60 px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">تعديل الدرجات يدوياً</DialogTitle>
            <Button variant="ghost" size="sm" className="rounded-full px-3" onClick={handleClose} disabled={saving}>
              ✕
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Selectors */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">الدورة / التكليف</label>
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
              <Table className="min-w-[360px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-right font-bold text-foreground">الاسم</TableHead>
                    <TableHead className="text-right font-bold text-foreground">رقم الدخول</TableHead>
                    <TableHead className="w-28 text-right font-bold text-foreground">الدرجة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchStudents.map((student) => (
                    <TableRow key={student.loginId}>
                      <TableCell className="text-right font-semibold text-foreground">{student.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{student.loginId}</TableCell>
                      <TableCell>
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
        <div className="flex-shrink-0 flex items-center justify-between border-t border-border/60 px-6 py-4">
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
