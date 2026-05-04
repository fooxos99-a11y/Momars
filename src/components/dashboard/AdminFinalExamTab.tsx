import React, { useState, useMemo } from "react";
import { Copy, GraduationCap, Link2, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type BranchId, useDashboardStore } from "@/lib/dashboard-store";
import { parseImportedQuestionsFromText } from "@/lib/question-import";

const branchLabels: Record<BranchId, string> = { male: "معلمين", female: "معلمات" };

const emptyForm = {
  prompt: "",
  type: "multiple" as "multiple" | "text" | "truefalse",
  optionsText: "",
  points: "1",
  correctAnswer: "",
  allowFile: "no" as "yes" | "no",
};

interface AdminFinalExamTabProps {
  canEdit?: boolean;
  managedBranchId?: BranchId | null;
}

const AdminFinalExamTab = ({ canEdit = true, managedBranchId = null }: AdminFinalExamTabProps) => {
  const store = useDashboardStore();
  const { data } = store;

  const [branch, setBranch] = useState<BranchId>(managedBranchId ?? "male");
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [splitText, setSplitText] = useState("");
  const [linksOpen, setLinksOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const effectiveBranch = managedBranchId ?? branch;
  const branchQuestions = useMemo(
    () => data.finalExamQuestions.filter((q) => q.branchCode === effectiveBranch).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.finalExamQuestions, effectiveBranch],
  );
  const isEnabled = data.finalExamSettings[effectiveBranch];
  const finalExamLink = typeof window !== "undefined" ? `${window.location.origin}/final-exam` : "/final-exam";

  const resetForm = () => setForm(emptyForm);

  const handleAdd = async () => {
    const prompt = form.prompt.trim();
    if (!prompt) { setFormError("أدخل نص السؤال."); return; }
    const options = form.type === "multiple"
      ? form.optionsText.split("|").map((o) => o.trim()).filter(Boolean)
      : form.type === "truefalse" ? ["صح", "خطأ"] : [];
    if (form.type === "multiple" && options.length < 2) { setFormError("أدخل خيارين على الأقل مفصولين بـ |"); return; }
    const pts = Number(form.points);
    if (!Number.isFinite(pts) || pts < 0) { setFormError("أدخل درجة صحيحة."); return; }
    setFormError("");
    try {
      await store.addFinalExamQuestion(effectiveBranch, { prompt, type: form.type, options, allowFile: form.allowFile === "yes", points: pts, correctAnswer: form.correctAnswer.trim() });
      resetForm();
    } catch (err) { setFormError(err instanceof Error ? err.message : "تعذر إضافة السؤال."); }
  };

  const handleSplit = async () => {
    if (!splitText.trim()) { setFormError("الصق الأسئلة أولاً."); return; }
    const parsed = parseImportedQuestionsFromText(splitText);
    if (!parsed.length) { setFormError("لم يتم التعرف على أسئلة."); return; }
    for (const q of parsed) {
      await store.addFinalExamQuestion(effectiveBranch, { prompt: q.prompt, type: q.type, options: q.options, allowFile: false, points: 1, correctAnswer: "" });
    }
    setSplitText("");
    setFormError(`تم إضافة ${parsed.length} سؤال.`);
  };

  const handleCopyTo = async (to: BranchId) => {
    await store.copyFinalExamQuestions(effectiveBranch, to, false);
    setCopyOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Links Dialog */}
      <Dialog open={linksOpen} onOpenChange={setLinksOpen}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl">رابط الاختبار النهائي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">الرابط ثابت — يُظهر الاختبار حسب فرع الطالب.</p>
            <div className="break-all rounded-[1.25rem] border border-border/60 bg-muted/20 p-4 text-sm">{finalExamLink}</div>
            <Button className="w-full rounded-full" variant="outline" onClick={() => void navigator.clipboard.writeText(finalExamLink)}>
              <Copy className="size-4 ml-2" />
              نسخ الرابط
            </Button>
          </div>
          <div className="flex justify-end border-t border-border/60 px-6 py-4">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setLinksOpen(false)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy Dialog */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl">نسخ الأسئلة إلى</DialogTitle>
          </DialogHeader>
          <p className="px-6 pt-4 text-sm text-muted-foreground">اختر الفرع الذي تريد نسخ أسئلة {branchLabels[effectiveBranch]} إليه.</p>
          <div className="grid grid-cols-2 gap-3 p-6">
            {(["male", "female"] as BranchId[]).map((b) => (
              <button
                key={b}
                type="button"
                disabled={b === effectiveBranch}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 p-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/5",
                  b === effectiveBranch && "cursor-not-allowed opacity-40",
                )}
                onClick={() => void handleCopyTo(b)}
              >
                <GraduationCap className="size-7 text-primary" />
                <div className="text-sm font-bold text-foreground">{branchLabels[b]}</div>
              </button>
            ))}
          </div>
          <div className="flex justify-end border-t border-border/60 px-6 py-4">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setCopyOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Card */}
      {canEdit && (
        <Card className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <CardHeader className="text-right">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-full px-4 gap-1.5" onClick={() => setLinksOpen(true)}>
                  <Link2 className="size-3.5" />
                  الرابط
                </Button>
                <Button variant="outline" size="sm" className="rounded-full px-4 gap-1.5" onClick={() => setCopyOpen(true)}>
                  <Copy className="size-3.5" />
                  نسخ
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {!managedBranchId && (
                  <div className="flex gap-2">
                    {(["male", "female"] as BranchId[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBranch(b)}
                        className={cn(
                          "rounded-full px-4 py-1.5 text-sm font-bold border transition-smooth",
                          b === branch ? "bg-primary text-white border-primary shadow-md shadow-primary/20" : "bg-white text-foreground border-border/60 hover:border-primary/40",
                        )}
                      >
                        {branchLabels[b]}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  size="sm"
                  variant={isEnabled ? "default" : "outline"}
                  className={cn("rounded-full px-5 gap-1.5", isEnabled && "bg-emerald-600 hover:bg-emerald-700")}
                  onClick={() => void store.toggleFinalExamEnabled(effectiveBranch)}
                >
                  <Power className="size-3.5" />
                  {isEnabled ? "مفعّل" : "غير مفعّل"}
                </Button>
                <CardTitle className="text-xl">إدارة الاختبار النهائي</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-right">
            {/* Paste / split */}
            <div className="flex items-start gap-2">
              <textarea
                className="flex-1 min-h-[64px] max-h-32 resize-y rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-right placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="الصق الأسئلة هنا... سيتم تقسيمها تلقائيًا"
                value={splitText}
                onChange={(e) => setSplitText(e.target.value)}
              />
              <Button type="button" size="sm" className="mt-1 h-9 shrink-0 rounded-xl" disabled={!splitText.trim()} onClick={() => void handleSplit()}>
                تقسيم
              </Button>
            </div>

            {/* Individual question form */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-bold text-foreground">السؤال</label>
                <Input value={form.prompt} onChange={(e) => setForm((c) => ({ ...c, prompt: e.target.value }))} placeholder="اكتب السؤال" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">نوع السؤال</label>
                <Select value={form.type} onValueChange={(v) => setForm((c) => ({ ...c, type: v as typeof c.type, optionsText: "", correctAnswer: "" }))}>
                  <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple" className="justify-end pr-3 text-right">اختيار من متعدد</SelectItem>
                    <SelectItem value="truefalse" className="justify-end pr-3 text-right">صح وخطأ</SelectItem>
                    <SelectItem value="text" className="justify-end pr-3 text-right">نص</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">الدرجة</label>
                <Input value={form.points} onChange={(e) => setForm((c) => ({ ...c, points: e.target.value }))} placeholder="1" className="text-right" />
              </div>
              {form.type === "multiple" && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-foreground">الخيارات (مفصولة بـ |)</label>
                  <Input value={form.optionsText} onChange={(e) => setForm((c) => ({ ...c, optionsText: e.target.value }))} placeholder="خيار 1 | خيار 2 | خيار 3" className="text-right" />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">الإجابة الصحيحة</label>
                {form.type === "truefalse" ? (
                  <Select value={form.correctAnswer || "صح"} onValueChange={(v) => setForm((c) => ({ ...c, correctAnswer: v }))}>
                    <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="صح" className="justify-end pr-3 text-right">صح</SelectItem>
                      <SelectItem value="خطأ" className="justify-end pr-3 text-right">خطأ</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.correctAnswer} onChange={(e) => setForm((c) => ({ ...c, correctAnswer: e.target.value }))} placeholder="للدرجات التلقائية" className="text-right" />
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">إرفاق ملف</label>
                <Select value={form.allowFile} onValueChange={(v) => setForm((c) => ({ ...c, allowFile: v as "yes" | "no" }))}>
                  <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no" className="justify-end pr-3 text-right">لا يسمح</SelectItem>
                    <SelectItem value="yes" className="justify-end pr-3 text-right">يسمح</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
            <Button onClick={() => void handleAdd()} className="rounded-full px-5">
              <Plus className="size-4" />
              إضافة سؤال
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Questions Grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {branchQuestions.length === 0 && (
          <Card className="rounded-[1.5rem] border-dashed border-border/70 bg-white/80 md:col-span-2 xl:col-span-3">
            <CardContent className="p-6 text-right text-sm text-muted-foreground">لا توجد أسئلة بعد.</CardContent>
          </Card>
        )}
        {branchQuestions.map((question, index) => (
          <Card key={question.id} className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="flex-1 text-base leading-7 text-right">
                  {index + 1}. {question.prompt}
                </CardTitle>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => void store.deleteFinalExamQuestion(question.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/20 text-primary text-xs">
                  {question.type === "multiple" ? "اختيار متعدد" : question.type === "truefalse" ? "صح / خطأ" : "نص"}
                </Badge>
                <Badge variant="outline" className="border-primary/20 text-primary text-xs">
                  {question.points} {question.points === 1 ? "درجة" : "درجات"}
                </Badge>
                {question.allowFile && <Badge variant="outline" className="text-xs">يسمح برفع ملف</Badge>}
              </div>
              {(question.type === "multiple" || question.type === "truefalse") && question.options.length > 0 && (
                <div className="space-y-1 text-sm">
                  {question.options.map((opt) => (
                    <div
                      key={opt}
                      className={cn("leading-6 text-right", opt.trim() === question.correctAnswer.trim() ? "font-bold text-emerald-700" : "text-foreground/80")}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminFinalExamTab;
