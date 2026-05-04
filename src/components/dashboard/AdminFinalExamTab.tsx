import React, { useState, useMemo } from "react";
import { Copy, GraduationCap, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { type BranchId, isFinalExamAvailable, useDashboardStore } from "@/lib/dashboard-store";
import { parseImportedQuestionsFromText } from "@/lib/question-import";

const branchLabels: Record<BranchId, string> = { male: "معلمين", female: "معلمات" };

const formatDateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ar", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(date);
};

const emptyForm = {
  prompt: "",
  type: "multiple" as "multiple" | "text" | "truefalse",
  options: ["", ""],
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
  const [copyOpen, setCopyOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activationDialogOpen, setActivationDialogOpen] = useState(false);
  const [activationMinutes, setActivationMinutes] = useState("60");
  const [activationError, setActivationError] = useState("");
  const [forms, setForms] = useState([emptyForm]);
  const [formErrors, setFormErrors] = useState<string[]>([""]);
  const [pasteText, setPasteText] = useState("");
  const [formError, setFormError] = useState("");

  const effectiveBranch = managedBranchId ?? branch;
  const branchQuestions = useMemo(
    () => data.finalExamQuestions.filter((q) => q.branchCode === effectiveBranch).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.finalExamQuestions, effectiveBranch],
  );
  const branchSetting = data.finalExamSettings[effectiveBranch];
  const isEnabled = isFinalExamAvailable(branchSetting);
  const closesAtLabel = formatDateTime(branchSetting.closesAt);

  const resetForms = () => { setForms([emptyForm]); setFormErrors([""]); setPasteText(""); setFormError(""); };

  const updateForm = (i: number, patch: Partial<typeof emptyForm>) =>
    setForms((cur) => cur.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const clearErr = (i: number) =>
    setFormErrors((cur) => cur.map((e, idx) => (idx === i ? "" : e)));

  const handleTypeChange = (i: number, type: typeof emptyForm.type) => {
    updateForm(i, {
      type,
      options: type === "truefalse" ? ["صح", "خطأ"] : ["", ""],
      correctAnswer: type === "truefalse" ? "صح" : "",
    });
    clearErr(i);
  };

  const handleOptionChange = (fi: number, oi: number, val: string) => {
    setForms((cur) => cur.map((f, i) => {
      if (i !== fi) return f;
      const opts = f.options.map((o, j) => (j === oi ? val : o));
      return { ...f, options: opts, correctAnswer: opts.map((o) => o.trim()).filter(Boolean).includes(f.correctAnswer) ? f.correctAnswer : "" };
    }));
  };

  const applyParsed = (text: string) => {
    const parsed = parseImportedQuestionsFromText(text);
    if (!parsed.length) return false;
    const newForms = parsed.map((q) => ({
      ...emptyForm,
      prompt: q.prompt,
      type: q.type as typeof emptyForm.type,
      options: q.type === "truefalse" ? ["صح", "خطأ"] : q.options.length >= 2 ? q.options : ["", ""],
      correctAnswer: q.type === "truefalse" ? "صح" : "",
    }));
    setForms(newForms);
    setFormErrors(newForms.map(() => ""));
    return true;
  };

  const handleSaveQuestions = async () => {
    let hasErr = false;
    const errs = forms.map((f) => {
      if (!f.prompt.trim()) { hasErr = true; return "أدخل نص السؤال."; }
      if (f.type === "multiple") {
        const opts = f.options.map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) { hasErr = true; return "أدخل خيارين على الأقل."; }
      }
      const pts = Number(f.points);
      if (!Number.isFinite(pts) || pts < 0) { hasErr = true; return "أدخل درجة صحيحة."; }
      return "";
    });
    if (hasErr) { setFormErrors(errs); return; }
    setFormError("");
    try {
      for (const f of forms) {
        const opts = f.type === "multiple"
          ? f.options.map((o) => o.trim()).filter(Boolean)
          : f.type === "truefalse" ? ["صح", "خطأ"] : [];
        await store.addFinalExamQuestion(effectiveBranch, {
          prompt: f.prompt.trim(),
          type: f.type,
          options: opts,
          allowFile: f.allowFile === "yes",
          points: Number(f.points),
          correctAnswer: f.correctAnswer.trim(),
        });
      }
      resetForms();
      setAddDialogOpen(false);
    } catch (err) { setFormError(err instanceof Error ? err.message : "تعذر إضافة السؤال."); }
  };

  const handleCopyTo = async (to: BranchId) => {
    await store.copyFinalExamQuestions(effectiveBranch, to, false);
    setCopyOpen(false);
  };

  const handleToggleAvailability = async () => {
    if (isEnabled) {
      await store.toggleFinalExamEnabled(effectiveBranch, null);
      return;
    }
    setActivationError("");
    setActivationDialogOpen(true);
  };

  const handleActivate = async () => {
    const minutes = Number(activationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setActivationError("أدخل مدة صحيحة بالدقائق.");
      return;
    }
    const closesAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    setActivationError("");
    await store.toggleFinalExamEnabled(effectiveBranch, closesAt);
    setActivationDialogOpen(false);
  };

  const renderFormCard = (f: typeof emptyForm, fi: number) => {
    const availableAnswers = f.options.map((o) => o.trim()).filter(Boolean);
    const err = formErrors[fi] ?? "";
    return (
      <div key={fi} className="rounded-[1.25rem] border border-border/60 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-muted-foreground">السؤال {fi + 1}</span>
          {forms.length > 1 && (
            <button type="button" onClick={() => { setForms((c) => c.filter((_, i) => i !== fi)); setFormErrors((c) => c.filter((_, i) => i !== fi)); }}
              className="text-destructive hover:text-destructive/80 transition-colors">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(["text", "multiple", "truefalse"] as const).map((t) => (
            <Button key={t} type="button" size="sm" variant={f.type === t ? "default" : "outline"}
              className={cn("flex-1 rounded-full", f.type === t ? "!text-white" : "")}
              onClick={() => handleTypeChange(fi, t)}>
              {t === "text" ? "نصي" : t === "multiple" ? "خيارات" : "صح وخطأ"}
            </Button>
          ))}
        </div>
        <div>
          <div className="mb-2 text-sm font-bold text-foreground">السؤال</div>
          <Input value={f.prompt} onChange={(e) => { updateForm(fi, { prompt: e.target.value }); clearErr(fi); }} placeholder="اكتب السؤال" className="h-11 rounded-2xl text-right" />
        </div>
        {f.type === "multiple" && (
          <div className="space-y-2">
            <div className="text-sm font-bold text-foreground">الخيارات</div>
            <div className="grid gap-2 md:grid-cols-2">
              {f.options.map((opt, oi) => {
                const isLast = oi === f.options.length - 1;
                return (
                  <div key={oi} className={isLast ? "flex gap-1" : undefined}>
                    <Input value={opt} onChange={(e) => handleOptionChange(fi, oi, e.target.value)} placeholder={`الخيار ${oi + 1}`} className="h-11 flex-1 rounded-2xl text-right" />
                    {isLast && (
                      <button type="button" onClick={() => updateForm(fi, { options: [...f.options, ""] })}
                        className="flex h-11 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 text-primary transition-colors hover:bg-primary/5">
                        <Plus className="size-4" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {f.type === "truefalse" && (
          <div className="space-y-2">
            <div className="text-sm font-bold text-foreground">الخيارات</div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input value="صح" readOnly className="h-11 rounded-2xl text-right bg-muted/40" />
              <Input value="خطأ" readOnly className="h-11 rounded-2xl text-right bg-muted/40" />
            </div>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground">الدرجة</label>
            <Input value={f.points} onChange={(e) => updateForm(fi, { points: e.target.value })} placeholder="1" className="h-11 rounded-2xl text-right" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground">الإجابة الصحيحة</label>
            {f.type === "multiple" ? (
              <Select value={f.correctAnswer} onValueChange={(v) => updateForm(fi, { correctAnswer: v })}>
                <SelectTrigger className="h-11 flex-row-reverse rounded-2xl text-right [&>span]:text-right"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{availableAnswers.map((o) => <SelectItem key={o} value={o} className="justify-end pr-3 text-right">{o}</SelectItem>)}</SelectContent>
              </Select>
            ) : f.type === "truefalse" ? (
              <Select value={f.correctAnswer || "صح"} onValueChange={(v) => updateForm(fi, { correctAnswer: v })}>
                <SelectTrigger className="h-11 flex-row-reverse rounded-2xl text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="صح" className="justify-end pr-3 text-right">صح</SelectItem>
                  <SelectItem value="خطأ" className="justify-end pr-3 text-right">خطأ</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input value={f.correctAnswer} onChange={(e) => updateForm(fi, { correctAnswer: e.target.value })} placeholder="اكتب الإجابة" className="h-11 rounded-2xl text-right" />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground">إرفاق ملف</label>
            <Select value={f.allowFile} onValueChange={(v: "yes" | "no") => updateForm(fi, { allowFile: v })}>
              <SelectTrigger className="h-11 flex-row-reverse rounded-2xl text-right [&>span]:text-right"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes" className="justify-end pr-3 text-right">يسمح</SelectItem>
                <SelectItem value="no" className="justify-end pr-3 text-right">لا يسمح</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {err && <p className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Copy Dialog */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl">نسخ الأسئلة إلى</DialogTitle>
          </DialogHeader>
          <p className="px-6 pt-4 text-sm text-muted-foreground">اختر الفرع الذي تريد نسخ أسئلة {branchLabels[effectiveBranch]} إليه.</p>
          <div className="grid grid-cols-2 gap-3 p-6">
            {(["male", "female"] as BranchId[]).map((b) => (
              <button key={b} type="button" disabled={b === effectiveBranch}
                className={cn("flex flex-col items-center gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 p-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/5", b === effectiveBranch && "cursor-not-allowed opacity-40")}
                onClick={() => void handleCopyTo(b)}>
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

      <Dialog open={activationDialogOpen} onOpenChange={setActivationDialogOpen}>
        <DialogContent className="max-w-sm rounded-[1.75rem] p-0 text-right [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl">تفعيل الاختبار النهائي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-muted-foreground">حدد مدة فتح الاختبار لفرع {branchLabels[effectiveBranch]} فقط.</p>
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">المدة بالدقائق</label>
              <Input value={activationMinutes} onChange={(e) => setActivationMinutes(e.target.value)} placeholder="60" className="h-11 rounded-2xl text-right" />
            </div>
            {activationError && <p className="text-sm font-medium text-destructive">{activationError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t border-border/60 px-6 py-4">
            <Button variant="outline" className="rounded-full px-5" onClick={() => setActivationDialogOpen(false)}>إلغاء</Button>
            <Button className="rounded-full px-5" onClick={() => void handleActivate()}>تفعيل</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Questions Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForms(); }}>
        <DialogContent className="flex h-[90vh] w-[min(95vw,780px)] flex-col rounded-[1.5rem] border-white/80 bg-white p-0 text-right shadow-[0_24px_70px_rgba(15,23,42,0.14)] [&>button]:hidden">
          <div className="shrink-0 border-b border-border/60 px-5 py-4">
            <span className="text-base font-bold text-foreground">إضافة أسئلة — {branchLabels[effectiveBranch]}</span>
          </div>
          <div className="shrink-0 border-b border-border/60 px-5 py-3 flex gap-2 items-start">
            <textarea
              className="flex-1 min-h-[64px] max-h-32 resize-y rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-right placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="الصق الأسئلة هنا... سيتم تقسيمها تلقائيا"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!text.trim()) return;
                e.preventDefault();
                if (!applyParsed(text)) setPasteText(text);
                else setPasteText("");
              }}
            />
            <Button type="button" size="sm" className="mt-1 h-9 shrink-0 rounded-xl" disabled={!pasteText.trim()} onClick={() => { applyParsed(pasteText); setPasteText(""); }}>تقسيم</Button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {forms.map((f, i) => renderFormCard(f, i))}
            <button type="button" onClick={() => { setForms((c) => [...c, emptyForm]); setFormErrors((c) => [...c, ""]); }}
              className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-primary/40 py-3 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5">
              <Plus className="size-4" strokeWidth={2.5} />
              إضافة سؤال
            </button>
          </div>
          {formError && <p className="shrink-0 px-5 text-sm font-medium text-destructive">{formError}</p>}
          <div className="shrink-0 border-t border-border/60 px-5 py-4">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
              <Button type="button" variant="outline" onClick={() => { setAddDialogOpen(false); resetForms(); }}>إلغاء</Button>
              <Button type="button" onClick={() => void handleSaveQuestions()}>حفظ {forms.length > 1 ? `(${forms.length} أسئلة)` : ""}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Management Card */}
      {canEdit && (
        <Card className="rounded-[1.5rem] border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <CardHeader className="text-right">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-full px-4 gap-1.5" onClick={() => setCopyOpen(true)}>
                  <Copy className="size-3.5" />
                  نسخ
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!managedBranchId && (
                  <div className="flex gap-2">
                    {(["male", "female"] as BranchId[]).map((b) => (
                      <button key={b} type="button" onClick={() => setBranch(b)}
                        className={cn("rounded-full px-4 py-1.5 text-sm font-bold border transition-smooth",
                          b === branch ? "bg-primary text-white border-primary shadow-md shadow-primary/20" : "bg-white text-foreground border-border/60 hover:border-primary/40")}>
                        {branchLabels[b]}
                      </button>
                    ))}
                  </div>
                )}
                <Button size="sm" variant={isEnabled ? "default" : "outline"}
                  className={cn("rounded-full px-5 gap-1.5", isEnabled && "bg-emerald-600 hover:bg-emerald-700")}
                  onClick={() => void handleToggleAvailability()}>
                  <Power className="size-3.5" />
                  {isEnabled ? "إيقاف" : "تفعيل"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-right">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border/60 bg-muted/20 px-4 py-3">
              <div className="text-sm text-muted-foreground">
                {isEnabled && closesAtLabel ? `مفتوح حتى ${closesAtLabel}` : "الأسئلة والتفعيل مرتبطان بالفرع المحدد فقط."}
              </div>
              <Button onClick={() => setAddDialogOpen(true)} className="rounded-full px-5">
              <Plus className="size-4" />
              إضافة سؤال
              </Button>
            </div>
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
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => void store.deleteFinalExamQuestion(question.id)}>
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
                <Accordion type="single" collapsible>
                  <AccordionItem value="opts" className="border-0">
                    <AccordionTrigger className="py-1 text-xs font-medium text-muted-foreground hover:no-underline">الخيارات</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1 text-sm">
                        {question.options.map((opt) => (
                          <div key={opt} className={cn("leading-6 text-right", opt.trim() === question.correctAnswer.trim() ? "font-bold text-emerald-700" : "text-foreground/80")}>{opt}</div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminFinalExamTab;
