import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowRightLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type BranchId, getAssignedStudents, loadAccessSession, saveAccessSession, useDashboardStore } from "@/lib/dashboard-store";
import {
  getReciterAccountByLoginCodeFromDatabase,
  toggleStudentPartInDatabase,
  transferStudentToReciterInDatabase,
} from "@/lib/supabase";
import { cn } from "@/lib/utils";

const parts = Array.from({ length: 30 }, (_, index) => index + 1);

interface PendingTransferStudent {
  id: string;
  name: string;
  branchId: BranchId;
}

const ReciterPage = () => {
  const store = useDashboardStore();
  const { data, isHydrated } = store;
  const [selectedReciterId, setSelectedReciterId] = useState("");
  const [databaseReciter, setDatabaseReciter] = useState<Awaited<ReturnType<typeof getReciterAccountByLoginCodeFromDatabase>>>(null);
  const [databaseError, setDatabaseError] = useState("");
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const [pendingTransferStudent, setPendingTransferStudent] = useState<PendingTransferStudent | null>(null);
  const [targetReciterId, setTargetReciterId] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [assignStudentOpen, setAssignStudentOpen] = useState(false);
  const [studentToAssignId, setStudentToAssignId] = useState("");
  const [assignError, setAssignError] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const loginCodeFromQuery = searchParams.get("login")?.trim().toLowerCase() ?? "";
  const session = loadAccessSession();
  const loginCodeFromSession = session?.role === "reciter" ? session.loginCode.trim().toLowerCase() : "";
  const [sortBy, setSortBy] = useState<"most-read" | "least-read">("most-read");

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!loginCodeFromSession) {
      setDatabaseReciter(null);
      setSelectedReciterId("");
      setDatabaseError("");
      return;
    }

    let cancelled = false;

    const loadReciterFromDatabase = async () => {
      setDatabaseLoading(true);
      setDatabaseError("");

      try {
        const reciterAccount = await getReciterAccountByLoginCodeFromDatabase(loginCodeFromSession);

        if (cancelled) {
          return;
        }

        setDatabaseReciter(reciterAccount);

        if (reciterAccount) {
          saveAccessSession({
            role: "reciter",
            loginCode: reciterAccount.loginCode,
            name: reciterAccount.name,
            redirectPath: `/reciter?login=${encodeURIComponent(reciterAccount.loginCode)}`,
            branchId: reciterAccount.branchId,
          });
          setSelectedReciterId(reciterAccount.id);
        } else {
          const localReciter = data.reciters.find((item) => item.loginCode.trim().toLowerCase() === loginCodeFromSession);
          if (localReciter) {
            setSelectedReciterId(localReciter.id);
          }
        }
      } catch {
        if (!cancelled) {
          setDatabaseError("تعذر تحميل حساب المقرئ من قاعدة البيانات.");
        }
      } finally {
        if (!cancelled) {
          setDatabaseLoading(false);
        }
      }
    };

    void loadReciterFromDatabase();

    return () => {
      cancelled = true;
    };
  }, [data.reciters, isHydrated, loginCodeFromSession]);

  const selectedReciter = databaseReciter
    ? { id: databaseReciter.id, name: databaseReciter.name, loginCode: databaseReciter.loginCode }
    : data.reciters.find((reciter) => reciter.id === selectedReciterId) ?? null;
  const reciterStudents = useMemo(() => {
    const students = databaseReciter
      ? databaseReciter.students
      : selectedReciter && "id" in selectedReciter && !databaseReciter
        ? getAssignedStudents(data, selectedReciter.id)
        : [];

    return students.slice().sort((left, right) => {
      if (sortBy === "most-read") {
        return right.completedParts.length - left.completedParts.length || left.name.localeCompare(right.name, "ar");
      } else {
        return left.completedParts.length - right.completedParts.length || left.name.localeCompare(right.name, "ar");
      }
    });
  }, [databaseReciter, selectedReciter, sortBy, data]);
  const selectedReciterBranchId = useMemo(() => {
    if (!selectedReciter) {
      return null;
    }

    return data.reciters.find((reciter) => reciter.id === selectedReciter.id)?.branchId ?? null;
  }, [data.reciters, selectedReciter]);
  const availableTransferReciters = useMemo(() => {
    if (!pendingTransferStudent || !selectedReciter) {
      return [];
    }

    return data.reciters.filter(
      (reciter) => reciter.id !== selectedReciter.id && reciter.branchId === pendingTransferStudent.branchId,
    );
  }, [data.reciters, pendingTransferStudent, selectedReciter]);
  const availableStudentsToAssign = useMemo(() => {
    if (!selectedReciterBranchId || !selectedReciter) {
      return [];
    }

    return data.students.filter((student) => {
      if (student.branchId !== selectedReciterBranchId) {
        return false;
      }

      return !data.reciters.some((reciter) => reciter.studentIds.includes(student.id));
    });
  }, [data.reciters, data.students, selectedReciter, selectedReciterBranchId]);
  const hasAvailableTransferTarget = (branchId: BranchId, currentReciterId: string) => data.reciters.some(
    (reciter) => reciter.id !== currentReciterId && reciter.branchId === branchId,
  );

  if (!isHydrated) {
    return null;
  }

  if (!loginCodeFromSession) {
    return <Navigate to="/" replace />;
  }

  if (loginCodeFromQuery && loginCodeFromQuery !== loginCodeFromSession) {
    return <Navigate to="/reciter" replace />;
  }

  const resetTransferState = () => {
    setPendingTransferStudent(null);
    setTargetReciterId("");
    setTransferError("");
    setTransferSubmitting(false);
  };

  const resetAssignState = () => {
    setAssignStudentOpen(false);
    setStudentToAssignId("");
    setAssignError("");
    setAssignSubmitting(false);
  };

  const syncTransferredStudentLocally = (studentId: string, nextReciterId: string) => {
    data.reciters
      .filter((reciter) => reciter.studentIds.includes(studentId))
      .forEach((reciter) => {
        store.updateReciter(reciter.id, {
          studentIds: reciter.studentIds.filter((currentStudentId) => currentStudentId !== studentId),
        });
      });

    const targetReciter = data.reciters.find((reciter) => reciter.id === nextReciterId);

    if (targetReciter && !targetReciter.studentIds.includes(studentId)) {
      store.updateReciter(nextReciterId, {
        studentIds: [...targetReciter.studentIds, studentId],
      });
    }
  };

  const handleTogglePart = async (studentId: string, part: number, active: boolean) => {
    if (databaseReciter) {
      try {
        await toggleStudentPartInDatabase({
          studentId,
          reciterId: databaseReciter.id,
          partNumber: part,
          shouldMarkComplete: !active,
        });

        setDatabaseReciter((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            students: current.students
              .map((student) => {
                if (student.id !== studentId) {
                  return student;
                }

                const completedParts = active
                  ? student.completedParts.filter((item) => item !== part)
                  : [...student.completedParts, part].sort((left, right) => left - right);

                return { ...student, completedParts };
              })
              .sort((left, right) => right.completedParts.length - left.completedParts.length || left.name.localeCompare(right.name, "ar")),
          };
        });
      } catch {
        setDatabaseError("تعذر حفظ الأجزاء المقروءة في قاعدة البيانات.");
      }

      return;
    }

    store.toggleStudentPart(studentId, part);
  };

  const handleTransferStudent = async () => {
    if (!pendingTransferStudent) {
      return;
    }

    if (!targetReciterId) {
      setTransferError("اختر المقرئ الذي سيتم النقل إليه.");
      return;
    }

    setTransferSubmitting(true);
    setTransferError("");
    setDatabaseError("");

    try {
      if (databaseReciter) {
        await transferStudentToReciterInDatabase({
          studentId: pendingTransferStudent.id,
          targetReciterId,
        });

        setDatabaseReciter((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            students: current.students.filter((student) => student.id !== pendingTransferStudent.id),
          };
        });
      }

      syncTransferredStudentLocally(pendingTransferStudent.id, targetReciterId);
      resetTransferState();
    } catch {
      setTransferError("تعذر نقل الطالب إلى المقرئ الجديد.");
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleAssignStudent = async () => {
    if (!selectedReciter || !studentToAssignId) {
      setAssignError("اختر طالبًا أولًا.");
      return;
    }

    const studentRecord = data.students.find((student) => student.id === studentToAssignId);

    if (!studentRecord) {
      setAssignError("تعذر العثور على الطالب.");
      return;
    }

    setAssignSubmitting(true);
    setAssignError("");
    setDatabaseError("");

    try {
      if (databaseReciter) {
        await transferStudentToReciterInDatabase({
          studentId: studentToAssignId,
          targetReciterId: selectedReciter.id,
        });

        setDatabaseReciter((current) => {
          if (!current || current.students.some((student) => student.id === studentToAssignId)) {
            return current;
          }

          return {
            ...current,
            students: [
              ...current.students,
              {
                id: studentRecord.id,
                name: studentRecord.name,
                loginId: studentRecord.loginId,
                branchId: studentRecord.branchId,
                note: studentRecord.note,
                completedParts: studentRecord.completedParts,
              },
            ].sort((left, right) => right.completedParts.length - left.completedParts.length || left.name.localeCompare(right.name, "ar")),
          };
        });
      }

      store.assignStudentToReciter(selectedReciter.id, studentToAssignId);
      resetAssignState();
    } catch {
      setAssignError("تعذر إضافة الطالب إلى المقرئ.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_38%),linear-gradient(180deg,#f7fcfb_0%,#eff8f7_100%)] text-foreground">
      <div className="container py-8 md:py-12">
        <div className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-soft backdrop-blur">
          <div className="flex items-center justify-between gap-4 text-right">
            <div className="space-y-3 text-right">
              <h1 className="text-2xl font-black md:text-4xl">لوحة المقرئ</h1>
            </div>
            <Link to="/" className="shrink-0">
              <img src="/اللوقو-شفاف.png" alt="شعار المنصة" className="site-logo site-logo-scrolled h-14 w-auto object-contain" />
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          {databaseLoading && (
            <Card className="border-primary/10 bg-white/90">
              <CardContent className="p-4 text-sm text-muted-foreground">
                جارٍ تحميل حساب المقرئ...
              </CardContent>
            </Card>
          )}

          {databaseError && (
            <Card className="border-destructive/20 bg-white/90">
              <CardContent className="p-4 text-sm text-destructive">
                {databaseError}
              </CardContent>
            </Card>
          )}

          {!databaseLoading && !selectedReciter && (
            <Card className="border-dashed border-primary/20 bg-white/80">
              <CardContent className="p-6 text-sm text-muted-foreground">لا يوجد مقرئ مضاف حتى الآن.</CardContent>
            </Card>
          )}

          {selectedReciter && (
            <div className="space-y-4">
                        {reciterStudents.length > 0 && (
                          <div className="flex items-center justify-end gap-2">
                            <Select value={sortBy} onValueChange={(value) => setSortBy(value as "most-read" | "least-read")}>
                              <SelectTrigger className="w-auto flex-row-reverse px-4 text-right [&>span]:text-right">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="most-read">الأكثر فالأقل قراءة</SelectItem>
                                <SelectItem value="least-read">الأقل فالأكثر قراءة</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

            {selectedReciter && reciterStudents.length === 0 && (
              <Card className="border-dashed border-primary/20 bg-white/80">
                <CardContent className="p-6 text-sm text-muted-foreground">لا يوجد طلاب مرتبطون بهذا المقرئ.</CardContent>
              </Card>
            )}

            {selectedReciter && reciterStudents.map((student) => {
              const hasTransferTarget = hasAvailableTransferTarget(student.branchId, selectedReciter.id);

              return (
                <Card key={student.id} className="border-primary/10 bg-white/90">
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-3 text-right">
                      <div>
                        <button
                          type="button"
                          className="text-right"
                          onClick={() => setPendingTransferStudent({
                            id: student.id,
                            name: student.name,
                            branchId: student.branchId,
                          })}
                          disabled={transferSubmitting || !hasTransferTarget}
                          title={hasTransferTarget ? "نقل الطالب إلى مقرئ آخر" : "لا يوجد مقرئ آخر متاح في نفس الفرع"}
                        >
                          <CardTitle className={cn("text-lg transition-colors", hasTransferTarget ? "cursor-pointer hover:text-primary" : "cursor-not-allowed text-muted-foreground")}>{student.name}</CardTitle>
                        </button>
                        {!hasTransferTarget && <div className="mt-1 text-xs text-muted-foreground">لا يوجد مقرئ آخر متاح في نفس الفرع.</div>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {student.note && (
                      <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4 text-sm text-muted-foreground">
                        {student.note}
                      </div>
                    )}

                    <div className="space-y-3 text-right">
                      <div className="text-sm font-bold text-foreground">المقروء</div>

                      <div className="grid w-fit grid-cols-5 gap-2 sm:grid-cols-6">
                      {parts.map((part) => {
                        const active = student.completedParts.includes(part);

                        return (
                          <button
                            key={part}
                            type="button"
                            onClick={() => void handleTogglePart(student.id, part, active)}
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </div>
      </div>

      <Dialog open={Boolean(pendingTransferStudent)} onOpenChange={(open) => !open && resetTransferState()}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-[1.5rem] border-white/80 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl text-foreground">نقل الطالب</DialogTitle>
            <DialogDescription className="text-right">
              {pendingTransferStudent ? `نقل ${pendingTransferStudent.name} إلى مقرئ آخر مع الاحتفاظ ببياناته وأجزائه المقروءة.` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">المقرئ الجديد</div>
              <Select value={targetReciterId} onValueChange={setTargetReciterId} disabled={transferSubmitting || availableTransferReciters.length === 0}>
                <SelectTrigger className="bg-white text-right [&>span]:w-full [&>span]:text-right">
                  <SelectValue placeholder={availableTransferReciters.length ? "اختر المقرئ" : "لا يوجد مقرئ آخر متاح في نفس الفرع"} />
                </SelectTrigger>
                <SelectContent className="border-border/70 bg-white text-right shadow-lg backdrop-blur-none">
                  {availableTransferReciters.map((reciter) => <SelectItem key={reciter.id} value={reciter.id} className="justify-end pr-8 text-right">{reciter.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {transferError && <p className="text-sm font-medium text-destructive">{transferError}</p>}
          </div>

          <div className="flex justify-end gap-3 border-t border-border/60 px-6 py-5">
            <Button variant="outline" className="rounded-full px-5" onClick={resetTransferState} disabled={transferSubmitting}>إلغاء</Button>
            <Button className="rounded-full px-5" onClick={() => void handleTransferStudent()} disabled={transferSubmitting || availableTransferReciters.length === 0}>
              {transferSubmitting ? "جارٍ النقل..." : "نقل"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignStudentOpen} onOpenChange={(open) => !open && resetAssignState()}>
        <DialogContent className="max-w-md rounded-[1.5rem] border-white/80 bg-white/95 p-0 text-right shadow-[0_24px_60px_rgba(15,23,42,0.08)] [&>button]:hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5 text-right">
            <DialogTitle className="text-right text-xl text-foreground">إضافة طالب للمقرئ</DialogTitle>
            <DialogDescription className="text-right">
              {selectedReciter ? `اختر طالبًا لإضافته إلى ${selectedReciter.name}.` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">الطالب</div>
              <Select value={studentToAssignId} onValueChange={setStudentToAssignId} disabled={assignSubmitting || availableStudentsToAssign.length === 0}>
                <SelectTrigger className="flex-row-reverse text-right [&>span]:text-right">
                  <SelectValue placeholder={availableStudentsToAssign.length ? "اختر الطالب" : "لا يوجد طلاب متاحون في نفس الفرع"} />
                </SelectTrigger>
                <SelectContent>
                  {availableStudentsToAssign.map((student) => <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {assignError && <p className="text-sm font-medium text-destructive">{assignError}</p>}
          </div>

          <div className="flex justify-end gap-3 border-t border-border/60 px-6 py-5">
            <Button variant="outline" className="rounded-full px-5" onClick={resetAssignState} disabled={assignSubmitting}>إلغاء</Button>
            <Button className="rounded-full px-5" onClick={() => void handleAssignStudent()} disabled={assignSubmitting || availableStudentsToAssign.length === 0}>
              {assignSubmitting ? "جارٍ الإضافة..." : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReciterPage;
