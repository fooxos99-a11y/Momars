import React, { createContext, useContext, useEffect, useState } from "react";
import {
  activateCourseInDatabase,
  addCourseToDatabase,
  addActivityLogToDatabase,
  bulkUpsertSubmissionsToDatabase,
  addNotificationToDatabase,
  addTaskTemplateToDatabase,
  addQuestionToDatabase,
  addStudentToDatabase,
  deleteNotificationFromDatabase,
  deleteTaskTemplateFromDatabase,
  deactivateAllCoursesInDatabase,
  deleteCourseFromDatabase,
  deleteQuestionFromDatabase,
  deleteStudentFromDatabase,
  loadDashboardDataFromDatabase,
  loadActivityLogsFromDatabase,
  resetDashboardDataInDatabase,
  saveReciterToDatabase,
  setManualAttendanceInDatabase,
  submitAssessmentToDatabase,
  toggleStudentPartInDatabase,
  updateTaskTemplateInDatabase,
  updateCourseInDatabase,
  updateCoursesSortOrderInDatabase,
  updateStudentInDatabase,
  addSatisfactionQuestionToDatabase,
  addSatisfactionQuestionsToDatabase,
  deleteSatisfactionQuestionFromDatabase,
  submitSatisfactionResponsesToDatabase,
  addFinalExamQuestionToDatabase,
  deleteFinalExamQuestionFromDatabase,
  toggleFinalExamEnabledInDatabase,
  submitFinalExamToDatabase,
  copyFinalExamQuestionsInDatabase,
  setFinalExamManualScoreInDatabase,
  loadRolePermissionsFromDatabase,
  type RestoreBackupProgressCallback,
  setRolePermissionInDatabase,
  restoreDashboardDataInDatabase,
} from "@/lib/supabase";

export type UserRole = "admin" | "male_manager" | "female_manager" | "student" | "reciter" | "trainee";
export type BranchId = "male" | "female";
export type AssessmentType = "pre" | "post" | "tasks";
export type QuestionType = "multiple" | "text" | "truefalse";
export type RecordEntityType = "course" | "task";
export type TaskMode = "questions" | "document";
export type PermissionKey =
  | "add_student" | "delete_student" | "edit_student"
  | "edit_pre_questions" | "edit_post_questions" | "edit_tasks"
  | "open_pre_exam" | "open_post_exam"
  | "page_notifications" | "page_results" | "page_activity_log"
  | "backup_export" | "backup_import" | "backup_restore"
  | "add_reciter" | "delete_reciter" | "edit_reciter" | "transfer_reciter_student";

export interface CourseBranchAvailability {
  pre: boolean;
  post: boolean;
  tasks: boolean;
}

export interface CourseAssessmentWindows {
  global: Partial<Record<AssessmentType, string>>;
  male: Partial<Record<AssessmentType, string>>;
  female: Partial<Record<AssessmentType, string>>;
}

export interface CourseAssessmentTemplates {
  pre: string;
  post: string;
  tasks: string;
}

export interface RoleDefinition {
  id: UserRole;
  label: string;
}

export interface Branch {
  id: BranchId;
  label: string;
}

export interface StudentRecord {
  id: string;
  name: string;
  loginId: string;
  branchId: BranchId;
  note: string;
  isCertified: boolean;
  completedParts: number[];
  createdAt: string;
}

export interface ReciterRecord {
  id: string;
  name: string;
  loginCode: string;
  branchId: BranchId;
  studentIds: string[];
}

export interface ResolvedAccess {
  role: UserRole;
  redirectPath: string;
  loginCode: string;
  name: string;
  branchId?: BranchId | null;
}

export interface AccessSession {
  role: UserRole;
  redirectPath: string;
  loginCode: string;
  name: string;
  branchId?: BranchId | null;
}

export interface CourseQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  allowFile: boolean;
  points: number;
  correctAnswer: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentDataUrl?: string;
}

export interface CourseRecord {
  id: string;
  title: string;
  entityType: RecordEntityType;
  isActive: boolean;
  isPreEnabled: boolean;
  isPostEnabled: boolean;
  isTasksEnabled: boolean;
  branchAvailability: Record<BranchId, CourseBranchAvailability>;
  assessmentWindows: CourseAssessmentWindows;
  assessmentNotificationTemplates: CourseAssessmentTemplates;
  taskMode: TaskMode | null;
  taskTemplateId: string;
  taskTemplateName: string;
  taskTemplateContent: string;
  youtubeUrl: string;
  sortOrder: number;
  preQuestions: CourseQuestion[];
  postQuestions: CourseQuestion[];
  taskQuestions: CourseQuestion[];
  createdAt: string;
}

export interface TaskTemplateRecord {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

export interface SubmissionAnswer {
  questionId: string;
  value: string;
  fileName?: string;
  fileType?: string;
  fileDataUrl?: string;
}

export interface CourseSubmission {
  id: string;
  courseId: string;
  assessmentType: AssessmentType;
  studentName: string;
  loginId: string;
  answers: SubmissionAnswer[];
  manualScore?: number | null;
  submittedAt: string;
}

export interface AttendanceRecord {
  id: string;
  courseId: string;
  studentName: string;
  loginId: string;
  source: "post-test" | "manual";
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  targetBranchId: BranchId | null;
  targetLoginIds?: string[];
  createdAt: string;
  createdByRole?: UserRole;
  createdByName?: string;
}

export interface ActivityLogRecord {
  id: string;
  action: string;
  target: string;
  status: "نجحت" | "فشلت" | "ألغيت";
  details: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
}

export interface SatisfactionQuestion {
  id: string;
  courseId: string;
  prompt: string;
  type: "rating" | "text";
  isRequired: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface SatisfactionResponse {
  id: string;
  courseId: string;
  questionId: string;
  loginCode: string;
  studentName: string;
  ratingValue: number | null;
  textValue: string;
  submittedAt: string;
}

export interface FinalExamQuestion {
  id: string;
  branchCode: BranchId;
  type: "multiple" | "text" | "truefalse";
  prompt: string;
  options: string[];
  allowFile: boolean;
  points: number;
  correctAnswer: string;
  attachmentName: string;
  attachmentType: string;
  attachmentDataUrl: string;
  sortOrder: number;
  createdAt: string;
}

export interface FinalExamSubmission {
  id: string;
  branchCode: BranchId;
  studentName: string;
  loginCode: string;
  manualScore: number | null | undefined;
  answers: SubmissionAnswer[];
  submittedAt: string;
}

export interface FinalExamBranchSetting {
  isEnabled: boolean;
  closesAt: string | null;
}

export const isFinalExamAvailable = (setting: FinalExamBranchSetting, now = Date.now()) => {
  if (!setting.isEnabled) return false;
  if (!setting.closesAt) return true;
  const closesAt = new Date(setting.closesAt).getTime();
  return Number.isFinite(closesAt) && closesAt > now;
};

export interface DashboardData {
  roles: RoleDefinition[];
  branches: Branch[];
  students: StudentRecord[];
  reciters: ReciterRecord[];
  courses: CourseRecord[];
  taskTemplates: TaskTemplateRecord[];
  submissions: CourseSubmission[];
  attendance: AttendanceRecord[];
  notifications: NotificationRecord[];
  activityLogs: ActivityLogRecord[];
  satisfactionQuestions: SatisfactionQuestion[];
  satisfactionResponses: SatisfactionResponse[];
  finalExamQuestions: FinalExamQuestion[];
  finalExamSubmissions: FinalExamSubmission[];
  finalExamSettings: { male: FinalExamBranchSetting; female: FinalExamBranchSetting };
  rolePermissions: Record<string, Record<string, boolean>>;
}

const adminAccounts = [
  {
    name: "إبراهيم محمد ابا الخيل",
    loginCode: "1483",
    role: "admin" as const,
  },
];

const ACCESS_STORAGE_KEY = "mmars-access-session";
export const ACCESS_SESSION_SYNC_EVENT = "mmars-access-session-sync";
const isBrowser = typeof window !== "undefined";
const createId = () => crypto.randomUUID();
const OPEN_ENDED_ASSESSMENT_WINDOW = "__always_open__";

const defaultCourseBranchAvailability = (): Record<BranchId, CourseBranchAvailability> => ({
  male: { pre: true, post: true, tasks: true },
  female: { pre: true, post: true, tasks: true },
});

export const getDefaultAssessmentNotificationTemplate = (assessmentType: AssessmentType) => {
  if (assessmentType === "pre") {
    return "تم فتح {assessmentLabel} لدورة {courseTitle} لفرع {branchLabel} لمدة {durationMinutes} دقيقة.";
  }

  if (assessmentType === "post") {
    return "تم فتح {assessmentLabel} لدورة {courseTitle} لفرع {branchLabel} لمدة {durationMinutes} دقيقة.";
  }

  return "تم فتح {assessmentLabel} لدورة {courseTitle} لفرع {branchLabel} لمدة {durationMinutes} دقيقة.";
};

const defaultAssessmentWindows = (): CourseAssessmentWindows => ({
  global: {},
  male: {},
  female: {},
});

const defaultAssessmentNotificationTemplates = (): CourseAssessmentTemplates => ({
  pre: getDefaultAssessmentNotificationTemplate("pre"),
  post: getDefaultAssessmentNotificationTemplate("post"),
  tasks: getDefaultAssessmentNotificationTemplate("tasks"),
});

const buildSatisfactionQuestionsForCourse = (
  allQuestions: SatisfactionQuestion[],
  courseId: string,
) => {
  const templateQuestionsByCourse = new Map<string, SatisfactionQuestion[]>();

  allQuestions.forEach((question) => {
    if (question.courseId === courseId) {
      return;
    }

    const current = templateQuestionsByCourse.get(question.courseId) ?? [];
    current.push(question);
    templateQuestionsByCourse.set(question.courseId, current);
  });

  const templateQuestions = [...templateQuestionsByCourse.values()]
    .sort((left, right) => right.length - left.length)[0]
    ?.slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (!templateQuestions || templateQuestions.length === 0) {
    return [] as SatisfactionQuestion[];
  }

  const now = new Date().toISOString();

  return templateQuestions.map((question, index) => ({
    ...question,
    id: createId(),
    courseId,
    sortOrder: index,
    createdAt: now,
  }));
};

const initialData: DashboardData = {
  roles: [
    { id: "admin", label: "مدير عام" },
    { id: "male_manager", label: "مسؤول الرجال" },
    { id: "female_manager", label: "مسؤول النساء" },
    { id: "student", label: "طالب" },
    { id: "reciter", label: "مقرئ" },
    { id: "trainee", label: "متدرب (معلم)" },
  ],
  branches: [
    { id: "male", label: "معلمين" },
    { id: "female", label: "معلمات" },
  ],
  students: [],
  reciters: [],
  courses: [],
  taskTemplates: [],
  submissions: [],
  attendance: [],
  notifications: [],
  activityLogs: [],
  satisfactionQuestions: [],
  satisfactionResponses: [],
  finalExamQuestions: [],
  finalExamSubmissions: [],
  finalExamSettings: {
    male: { isEnabled: false, closesAt: null },
    female: { isEnabled: false, closesAt: null },
  },
  rolePermissions: { male_manager: {}, female_manager: {} },
};

const normalizeQuestion = (question: CourseQuestion): CourseQuestion => ({
  ...question,
  options: [...new Set(question.options ?? [])].filter(Boolean),
  allowFile: Boolean(question.allowFile),
  points: Number.isFinite(question.points) ? Math.max(0, question.points) : 0,
  correctAnswer: question.correctAnswer ?? "",
  attachmentName: question.attachmentName ?? "",
  attachmentType: question.attachmentType ?? "",
  attachmentDataUrl: question.attachmentDataUrl ?? "",
});

const getAssessmentKey = (assessmentType: AssessmentType) => {
  if (assessmentType === "pre") {
    return "preQuestions" as const;
  }

  if (assessmentType === "post") {
    return "postQuestions" as const;
  }

  return "taskQuestions" as const;
};

const normalizeBranchAvailability = (
  input?: Partial<Record<BranchId, Partial<CourseBranchAvailability>>>,
): Record<BranchId, CourseBranchAvailability> => {
  const fallback = defaultCourseBranchAvailability();

  return {
    male: {
      pre: input?.male?.pre ?? fallback.male.pre,
      post: input?.male?.post ?? fallback.male.post,
      tasks: input?.male?.tasks ?? fallback.male.tasks,
    },
    female: {
      pre: input?.female?.pre ?? fallback.female.pre,
      post: input?.female?.post ?? fallback.female.post,
      tasks: input?.female?.tasks ?? fallback.female.tasks,
    },
  };
};

const normalizeAssessmentWindows = (input?: Partial<CourseAssessmentWindows>): CourseAssessmentWindows => ({
  global: {
    pre: input?.global?.pre ?? undefined,
    post: input?.global?.post ?? undefined,
    tasks: input?.global?.tasks ?? undefined,
  },
  male: {
    pre: input?.male?.pre ?? undefined,
    post: input?.male?.post ?? undefined,
    tasks: input?.male?.tasks ?? undefined,
  },
  female: {
    pre: input?.female?.pre ?? undefined,
    post: input?.female?.post ?? undefined,
    tasks: input?.female?.tasks ?? undefined,
  },
});

const normalizeAssessmentNotificationTemplates = (input?: Partial<CourseAssessmentTemplates>): CourseAssessmentTemplates => {
  const fallback = defaultAssessmentNotificationTemplates();

  return {
    pre: input?.pre ?? fallback.pre,
    post: input?.post ?? fallback.post,
    tasks: input?.tasks ?? fallback.tasks,
  };
};

const normalizeData = (input?: Partial<DashboardData>): DashboardData => {
  const students = Array.isArray(input?.students)
    ? input.students.map((student) => ({
        ...student,
        note: student.note ?? "",
        completedParts: [...new Set(student.completedParts ?? [])].sort((left, right) => left - right),
      }))
    : initialData.students;

  return {
    roles: input?.roles?.length ? input.roles : initialData.roles,
    branches: input?.branches?.length ? input.branches : initialData.branches,
    students,
    reciters: Array.isArray(input?.reciters)
      ? input.reciters.map((reciter, index) => {
          const studentIds = [...new Set(reciter.studentIds ?? [])];
          const linkedStudent = students.find((student) => studentIds.includes(student.id));

          return {
            ...reciter,
            loginCode: reciter.loginCode?.trim() || `reciter-${index + 1}`,
            branchId: reciter.branchId === "female" ? "female" : linkedStudent?.branchId ?? "male",
            studentIds,
          };
        })
      : initialData.reciters,
    courses: Array.isArray(input?.courses)
      ? input.courses.map((course) => ({
          ...course,
          entityType: course.entityType === "task" ? "task" : "course",
          isActive: Boolean(course.isActive),
          isPreEnabled: course.isPreEnabled ?? true,
          isPostEnabled: course.isPostEnabled ?? true,
          isTasksEnabled: course.isTasksEnabled ?? false,
          branchAvailability: normalizeBranchAvailability(course.branchAvailability),
          assessmentWindows: normalizeAssessmentWindows(course.assessmentWindows),
          assessmentNotificationTemplates: normalizeAssessmentNotificationTemplates(course.assessmentNotificationTemplates),
          taskMode: course.entityType === "task" ? (course.taskMode === "document" ? "document" : "questions") : null,
          taskTemplateId: course.taskTemplateId ?? "",
          taskTemplateName: course.taskTemplateName ?? "",
          taskTemplateContent: course.taskTemplateContent ?? "",
          youtubeUrl: course.youtubeUrl ?? "",
          sortOrder: course.sortOrder ?? 0,
          createdAt: course.createdAt ?? new Date().toISOString(),
          preQuestions: (course.preQuestions ?? []).map(normalizeQuestion),
          postQuestions: (course.postQuestions ?? []).map(normalizeQuestion),
          taskQuestions: (course.taskQuestions ?? []).map(normalizeQuestion),
        }))
      : initialData.courses,
    taskTemplates: Array.isArray(input?.taskTemplates)
      ? input.taskTemplates.map((template) => ({
          id: template.id,
          name: template.name ?? "",
          content: template.content ?? "",
          createdAt: template.createdAt ?? new Date().toISOString(),
        }))
      : initialData.taskTemplates,
    submissions: Array.isArray(input?.submissions)
      ? input.submissions.map((submission) => ({
          ...submission,
          manualScore:
            typeof submission.manualScore === "number" && Number.isFinite(submission.manualScore)
              ? submission.manualScore
              : submission.manualScore === null
                ? null
                : undefined,
          answers: (submission.answers ?? []).map((answer) => ({
            questionId: answer.questionId,
            value: answer.value ?? "",
            fileName: answer.fileName,
            fileType: answer.fileType,
            fileDataUrl: answer.fileDataUrl,
          })),
        }))
      : initialData.submissions,
    attendance: Array.isArray(input?.attendance)
      ? input.attendance
          .filter((record) => record.source === "manual")
          .map((record) => ({
            ...record,
            source: "manual" as const,
          }))
      : initialData.attendance,
    notifications: Array.isArray(input?.notifications)
      ? input.notifications
          .map((notification) => ({
            id: notification.id,
            title: notification.title ?? "",
            message: notification.message ?? "",
            targetBranchId: (notification.targetBranchId === "female" ? "female" : notification.targetBranchId === "male" ? "male" : null) as BranchId | null,
            createdAt: notification.createdAt ?? new Date().toISOString(),
            createdByRole: notification.createdByRole,
            createdByName: notification.createdByName,
          }))
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      : initialData.notifications,
    activityLogs: Array.isArray(input?.activityLogs)
      ? input.activityLogs
          .map((log) => ({
            id: log.id,
            action: log.action ?? "",
            target: log.target ?? "",
            status: log.status === "فشلت" ? "فشلت" : log.status === "ألغيت" ? "ألغيت" : "نجحت",
            details: log.details ?? "",
            actorName: log.actorName ?? "",
            actorRole: log.actorRole ?? "",
            createdAt: log.createdAt ?? new Date().toISOString(),
          }))
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      : initialData.activityLogs,
    satisfactionQuestions: Array.isArray(input?.satisfactionQuestions)
      ? input.satisfactionQuestions
      : initialData.satisfactionQuestions,
    satisfactionResponses: Array.isArray(input?.satisfactionResponses)
      ? input.satisfactionResponses
      : initialData.satisfactionResponses,
    finalExamQuestions: Array.isArray(input?.finalExamQuestions)
      ? input.finalExamQuestions
      : initialData.finalExamQuestions,
    finalExamSubmissions: Array.isArray(input?.finalExamSubmissions)
      ? input.finalExamSubmissions
      : initialData.finalExamSubmissions,
    finalExamSettings: input?.finalExamSettings
      ? {
          male: {
            isEnabled: Boolean(typeof input.finalExamSettings.male === "boolean" ? input.finalExamSettings.male : input.finalExamSettings.male?.isEnabled),
            closesAt: typeof input.finalExamSettings.male === "object" && input.finalExamSettings.male ? input.finalExamSettings.male.closesAt ?? null : null,
          },
          female: {
            isEnabled: Boolean(typeof input.finalExamSettings.female === "boolean" ? input.finalExamSettings.female : input.finalExamSettings.female?.isEnabled),
            closesAt: typeof input.finalExamSettings.female === "object" && input.finalExamSettings.female ? input.finalExamSettings.female.closesAt ?? null : null,
          },
        }
      : initialData.finalExamSettings,
    rolePermissions: input?.rolePermissions ?? initialData.rolePermissions,
  };
};

const useCreateDashboardStore = () => {
  const [data, setData] = useState<DashboardData>(initialData);
  const [isHydrated, setIsHydrated] = useState(!isBrowser);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromDatabase = async (markHydrated = false) => {
      try {
        const nextData = await loadDashboardDataFromDatabase();

        if (!cancelled) {
          setData(nextData);
          setLoadError(null);
        }
      } catch (err) {
        console.error("[dashboard-store] Failed to load data from database:", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "تعذر الاتصال بقاعدة البيانات.");
        }
      } finally {
        if (!cancelled && markHydrated) {
          setIsHydrated(true);
        }
      }
    };

    void hydrateFromDatabase(true);

    const refreshIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      void hydrateFromDatabase();
    };

    const intervalId = window.setInterval(refreshIfVisible, 5000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  const setStudents = (updater: (students: StudentRecord[]) => StudentRecord[]) => {
    setData((current) => ({ ...current, students: updater(current.students) }));
  };

  const setReciters = (updater: (reciters: ReciterRecord[]) => ReciterRecord[]) => {
    setData((current) => ({ ...current, reciters: updater(current.reciters) }));
  };

  const setCourses = (updater: (courses: CourseRecord[]) => CourseRecord[]) => {
    setData((current) => ({ ...current, courses: updater(current.courses) }));
  };

  const setTaskTemplates = (updater: (templates: TaskTemplateRecord[]) => TaskTemplateRecord[]) => {
    setData((current) => ({ ...current, taskTemplates: updater(current.taskTemplates) }));
  };

  const setSubmissions = (updater: (submissions: CourseSubmission[]) => CourseSubmission[]) => {
    setData((current) => ({ ...current, submissions: updater(current.submissions) }));
  };

  const setAttendance = (updater: (attendance: AttendanceRecord[]) => AttendanceRecord[]) => {
    setData((current) => ({ ...current, attendance: updater(current.attendance) }));
  };

  const setNotifications = (updater: (notifications: NotificationRecord[]) => NotificationRecord[]) => {
    setData((current) => ({ ...current, notifications: updater(current.notifications) }));
  };

  const setActivityLogs = (updater: (activityLogs: ActivityLogRecord[]) => ActivityLogRecord[]) => {
    setData((current) => ({ ...current, activityLogs: updater(current.activityLogs) }));
  };

  const setSatisfactionQuestions = (updater: (questions: SatisfactionQuestion[]) => SatisfactionQuestion[]) => {
    setData((current) => ({ ...current, satisfactionQuestions: updater(current.satisfactionQuestions) }));
  };

  const setSatisfactionResponses = (updater: (responses: SatisfactionResponse[]) => SatisfactionResponse[]) => {
    setData((current) => ({ ...current, satisfactionResponses: updater(current.satisfactionResponses) }));
  };

  const setFinalExamQuestions = (updater: (questions: FinalExamQuestion[]) => FinalExamQuestion[]) => {
    setData((current) => ({ ...current, finalExamQuestions: updater(current.finalExamQuestions) }));
  };

  const setFinalExamSubmissions = (updater: (submissions: FinalExamSubmission[]) => FinalExamSubmission[]) => {
    setData((current) => ({ ...current, finalExamSubmissions: updater(current.finalExamSubmissions) }));
  };

  const setFinalExamSettings = (updater: (settings: { male: FinalExamBranchSetting; female: FinalExamBranchSetting }) => { male: FinalExamBranchSetting; female: FinalExamBranchSetting }) => {
    setData((current) => ({ ...current, finalExamSettings: updater(current.finalExamSettings) }));
  };

  const setRolePermissions = (updater: (perms: Record<string, Record<string, boolean>>) => Record<string, Record<string, boolean>>) => {
    setData((current) => ({ ...current, rolePermissions: updater(current.rolePermissions) }));
  };

  return {
    data,
    isHydrated,
    loadError,
    addStudent: async (student: Omit<StudentRecord, "id" | "completedParts" | "createdAt" | "isCertified">) => {
      const tempStudentId = createId();
      setStudents((students) => [...students, { id: tempStudentId, completedParts: [], createdAt: new Date().toISOString(), isCertified: false, ...student }]);

      try {
        const studentId = await addStudentToDatabase(student);
        setStudents((students) =>
          students.map((currentStudent) =>
            currentStudent.id === tempStudentId ? { ...currentStudent, id: studentId } : currentStudent,
          ),
        );
        return studentId;
      } catch (error) {
        setStudents((students) => students.filter((currentStudent) => currentStudent.id !== tempStudentId));
        throw error;
      }
    },
    updateStudent: async (studentId: string, updates: Partial<Omit<StudentRecord, "id">>) => {
      const previousStudents = data.students;

      setStudents((students) =>
        students.map((student) =>
          student.id === studentId
            ? {
                ...student,
                ...updates,
                completedParts: [...new Set(updates.completedParts ?? student.completedParts)].sort((left, right) => left - right),
              }
            : student,
        ),
      );

      try {
        await updateStudentInDatabase(studentId, updates);
      } catch (error) {
        setStudents(() => previousStudents);
        throw error;
      }
    },
    toggleCertifiedStudent: async (studentId: string) => {
      const student = data.students.find((s) => s.id === studentId);
      if (!student) return;
      const isCertified = !student.isCertified;
      const previousStudents = data.students;
      setStudents((students) =>
        students.map((s) => s.id === studentId ? { ...s, isCertified } : s),
      );
      try {
        await updateStudentInDatabase(studentId, { isCertified });
      } catch (error) {
        setStudents(() => previousStudents);
        throw error;
      }
    },
    deleteStudent: async (studentId: string) => {
      const previousStudents = data.students;
      const previousReciters = data.reciters;

      setStudents((students) => students.filter((student) => student.id !== studentId));
      setReciters((reciters) =>
        reciters.map((reciter) => ({
          ...reciter,
          studentIds: reciter.studentIds.filter((id) => id !== studentId),
        })),
      );

      try {
        await deleteStudentFromDatabase(studentId);
      } catch (error) {
        setStudents(() => previousStudents);
        setReciters(() => previousReciters);
        throw error;
      }
    },
    addReciter: (reciter: Omit<ReciterRecord, "id">) => {
      setReciters((reciters) => [...reciters, { id: createId(), ...reciter }]);
    },
    updateReciter: (reciterId: string, updates: Partial<Omit<ReciterRecord, "id">>) => {
      setReciters((reciters) =>
        reciters.map((reciter) =>
          reciter.id === reciterId
            ? {
                ...reciter,
                ...updates,
                loginCode: updates.loginCode?.trim() || reciter.loginCode,
                branchId: updates.branchId ?? reciter.branchId,
                studentIds: updates.studentIds ? [...new Set(updates.studentIds)] : reciter.studentIds,
              }
            : reciter,
        ),
      );
    },
    deleteReciter: (reciterId: string) => {
      setReciters((reciters) => reciters.filter((reciter) => reciter.id !== reciterId));
    },
    assignStudentToReciter: (reciterId: string, studentId: string) => {
      setReciters((reciters) =>
        reciters.map((reciter) =>
          reciter.id === reciterId ? { ...reciter, studentIds: [...new Set([...reciter.studentIds, studentId])] } : reciter,
        ),
      );
    },
    unassignStudentFromReciter: (reciterId: string, studentId: string) => {
      setReciters((reciters) =>
        reciters.map((reciter) =>
          reciter.id === reciterId ? { ...reciter, studentIds: reciter.studentIds.filter((id) => id !== studentId) } : reciter,
        ),
      );
    },
    toggleStudentPart: async (studentId: string, partNumber: number) => {
      let shouldMarkComplete = false;
      const previousStudents = data.students;

      setStudents((students) =>
        students.map((student) => {
          if (student.id !== studentId) {
            return student;
          }

          const exists = student.completedParts.includes(partNumber);
          shouldMarkComplete = !exists;
          const completedParts = exists
            ? student.completedParts.filter((part) => part !== partNumber)
            : [...student.completedParts, partNumber].sort((left, right) => left - right);

          return { ...student, completedParts };
        }),
      );

      try {
        await toggleStudentPartInDatabase({
          studentId,
          reciterId: null,
          partNumber,
          shouldMarkComplete,
        });
      } catch (error) {
        setStudents(() => previousStudents);
        throw error;
      }
    },
    addCourse: async (
      title: string,
      options?: {
        entityType?: RecordEntityType;
        taskMode?: TaskMode | null;
        taskTemplateId?: string;
        taskTemplateName?: string;
        taskTemplateContent?: string;
        youtubeUrl?: string;
      },
    ) => {
      const entityType = options?.entityType === "task" ? "task" : "course";
      const isFirstCourse = false;
      const tempCourseId = createId();
      const tempCreatedAt = new Date().toISOString();
      const previousCourses = data.courses;

      setCourses((courses) => [
        ...courses,
        {
          id: tempCourseId,
          title,
          entityType,
          isActive: false,
          isPreEnabled: false,
          isPostEnabled: false,
          isTasksEnabled: false,
          branchAvailability: defaultCourseBranchAvailability(),
          assessmentWindows: defaultAssessmentWindows(),
          assessmentNotificationTemplates: defaultAssessmentNotificationTemplates(),
          taskMode: entityType === "task" ? (options?.taskMode === "document" ? "document" : "questions") : null,
          taskTemplateId: options?.taskTemplateId ?? "",
          taskTemplateName: options?.taskTemplateName ?? "",
          taskTemplateContent: options?.taskTemplateContent ?? "",
          youtubeUrl: options?.youtubeUrl ?? "",
          sortOrder: data.courses.length,
          preQuestions: [],
          postQuestions: [],
          taskQuestions: [],
          createdAt: tempCreatedAt,
        },
      ]);

      try {
        const insertedCourse = await addCourseToDatabase(title, isFirstCourse, {
          entityType,
          taskMode: entityType === "task" ? (options?.taskMode === "document" ? "document" : "questions") : null,
          taskTemplateId: options?.taskTemplateId,
          taskTemplateName: options?.taskTemplateName,
          taskTemplateContent: options?.taskTemplateContent,
          youtubeUrl: options?.youtubeUrl,
        });

        setCourses((courses) =>
          courses.map((course) =>
            course.id === tempCourseId
              ? {
                  ...course,
                  id: insertedCourse.id,
                  entityType: insertedCourse.entityType as RecordEntityType,
                  createdAt: insertedCourse.createdAt,
                  isPreEnabled: insertedCourse.isPreEnabled,
                  isPostEnabled: insertedCourse.isPostEnabled,
                  isTasksEnabled: insertedCourse.isTasksEnabled,
                  branchAvailability: normalizeBranchAvailability(insertedCourse.branchAvailability),
                  assessmentWindows: normalizeAssessmentWindows(insertedCourse.assessmentWindows),
                  assessmentNotificationTemplates: normalizeAssessmentNotificationTemplates(insertedCourse.assessmentNotificationTemplates),
                  taskMode: insertedCourse.taskMode,
                  taskTemplateId: insertedCourse.taskTemplateId,
                  taskTemplateName: insertedCourse.taskTemplateName,
                  taskTemplateContent: insertedCourse.taskTemplateContent,
                  youtubeUrl: insertedCourse.youtubeUrl,
                }
              : course,
          ),
        );

        return insertedCourse.id;
      } catch (error) {
        setCourses(() => previousCourses);
        throw error;
      }
    },
    updateCourse: async (courseId: string, updates: Partial<Omit<CourseRecord, "id" | "createdAt">>) => {
      const previousCourses = data.courses;
      const targetCourse = data.courses.find((course) => course.id === courseId);
      const shouldCloneSatisfactionQuestions = Boolean(
        targetCourse &&
        !targetCourse.isPostEnabled &&
        updates.isPostEnabled === true &&
        !data.satisfactionQuestions.some((question) => question.courseId === courseId),
      );

      setCourses((courses) =>
        courses.map((course) =>
          course.id === courseId
            ? {
                ...course,
                ...updates,
                branchAvailability: normalizeBranchAvailability(updates.branchAvailability ?? course.branchAvailability),
                assessmentWindows: normalizeAssessmentWindows(updates.assessmentWindows ?? course.assessmentWindows),
                assessmentNotificationTemplates: normalizeAssessmentNotificationTemplates(updates.assessmentNotificationTemplates ?? course.assessmentNotificationTemplates),
                preQuestions: (updates.preQuestions ?? course.preQuestions).map(normalizeQuestion),
                postQuestions: (updates.postQuestions ?? course.postQuestions).map(normalizeQuestion),
                taskQuestions: (updates.taskQuestions ?? course.taskQuestions).map(normalizeQuestion),
              }
            : course,
        ),
      );

      try {
        await updateCourseInDatabase(courseId, updates);

        if (shouldCloneSatisfactionQuestions) {
          const clonedQuestions = buildSatisfactionQuestionsForCourse(data.satisfactionQuestions, courseId);

          if (clonedQuestions.length > 0) {
            setSatisfactionQuestions((questions) => [...questions, ...clonedQuestions]);

            try {
              const savedQuestions = await addSatisfactionQuestionsToDatabase(
                clonedQuestions.map((question) => ({
                  courseId: question.courseId,
                  prompt: question.prompt,
                  type: question.type,
                  isRequired: question.isRequired,
                  sortOrder: question.sortOrder,
                })),
              );

              const savedByTempId = new Map(clonedQuestions.map((question, index) => [question.id, savedQuestions[index]]));

              setSatisfactionQuestions((questions) =>
                questions.map((question) => {
                  if (question.courseId !== courseId) {
                    return question;
                  }

                  const saved = savedByTempId.get(question.id);
                  return saved ? { ...question, id: saved.id, createdAt: saved.createdAt } : question;
                }),
              );
            } catch (error) {
              setSatisfactionQuestions((questions) => questions.filter((question) => question.courseId !== courseId));
              throw error;
            }
          }
        }
      } catch (error) {
        setCourses(() => previousCourses);
        throw error;
      }
    },
    reorderCourses: (orderedIds: string[]) => {
      setCourses((courses) =>
        [...courses].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
          .map((c, i) => ({ ...c, sortOrder: i })),
      );
      void updateCoursesSortOrderInDatabase(orderedIds);
    },
    setManualAttendance: async (courseId: string, presentStudents: StudentRecord[]) => {
      const prevAttendance = data.attendance;
      const newRecords: AttendanceRecord[] = presentStudents.map((student) => ({
        id: createId(),
        courseId,
        studentName: student.name,
        loginId: student.loginId,
        source: "manual" as const,
        createdAt: new Date().toISOString(),
      }));
      setAttendance((attendance) => [
        ...attendance.filter((r) => r.courseId !== courseId),
        ...newRecords,
      ]);
      try {
        await setManualAttendanceInDatabase(courseId, presentStudents.map((s) => ({
          loginId: s.loginId,
          studentName: s.name,
          studentId: s.id,
        })));
      } catch (error) {
        setAttendance(() => prevAttendance);
        throw error;
      }
    },
    deleteCourse: async (courseId: string) => {
      const previousCourses = data.courses;
      const previousSubmissions = data.submissions;
      const previousAttendance = data.attendance;

      setCourses((courses) => {
        const remainingCourses = courses.filter((course) => course.id !== courseId);

        if (remainingCourses.length > 0 && !remainingCourses.some((course) => course.isActive)) {
          return remainingCourses.map((course, index) => (index === 0 ? { ...course, isActive: true } : course));
        }

        return remainingCourses;
      });
      setSubmissions((submissions) => submissions.filter((submission) => submission.courseId !== courseId));
      setAttendance((attendance) => attendance.filter((record) => record.courseId !== courseId));

      try {
        await deleteCourseFromDatabase(courseId);
      } catch (error) {
        setCourses(() => previousCourses);
        setSubmissions(() => previousSubmissions);
        setAttendance(() => previousAttendance);
        throw error;
      }
    },
    activateCourse: async (courseId: string, settings?: { pre: boolean; post: boolean; tasks: boolean }) => {
      const previousCourses = data.courses;

      setCourses((courses) =>
        courses.map((course) => ({
          ...course,
          isActive: course.entityType === "task" ? false : course.id === courseId,
          isPreEnabled: course.id === courseId ? (settings?.pre ?? course.isPreEnabled) : course.isPreEnabled,
          isPostEnabled: course.id === courseId ? (settings?.post ?? course.isPostEnabled) : course.isPostEnabled,
          isTasksEnabled: course.id === courseId ? (settings?.tasks ?? course.isTasksEnabled) : course.isTasksEnabled,
        })),
      );

      try {
        await activateCourseInDatabase(courseId, settings);
      } catch (error) {
        setCourses(() => previousCourses);
        throw error;
      }
    },
    deactivateAllCourses: async () => {
      const previousCourses = data.courses;

      setCourses((courses) => courses.map((course) => ({ ...course, isActive: false })));

      try {
        await deactivateAllCoursesInDatabase();
      } catch (error) {
        setCourses(() => previousCourses);
        throw error;
      }
    },
    addQuestion: async (courseId: string, assessmentType: AssessmentType, question: Omit<CourseQuestion, "id">) => {
      const tempQuestionId = createId();

      setCourses((courses) =>
        courses.map((course) => {
          if (course.id !== courseId) {
            return course;
          }

          const key = getAssessmentKey(assessmentType);

          return {
            ...course,
            [key]: [...course[key], normalizeQuestion({ id: tempQuestionId, ...question })],
          };
        }),
      );

      try {
        const questionId = await addQuestionToDatabase(courseId, assessmentType, question);

        setCourses((courses) =>
          courses.map((course) => {
            if (course.id !== courseId) {
              return course;
            }

            const key = getAssessmentKey(assessmentType);

            return {
              ...course,
              [key]: course[key].map((currentQuestion) =>
                currentQuestion.id === tempQuestionId ? { ...currentQuestion, id: questionId } : currentQuestion,
              ),
            };
          }),
        );
      } catch {
        // Keep the locally added question when database sync is unavailable.
      }
    },
    deleteQuestion: (courseId: string, assessmentType: AssessmentType, questionId: string) => {
      setCourses((courses) =>
        courses.map((course) => {
          if (course.id !== courseId) {
            return course;
          }

          const key = getAssessmentKey(assessmentType);
          return { ...course, [key]: course[key].filter((question) => question.id !== questionId) };
        }),
      );

      void deleteQuestionFromDatabase(questionId).catch(() => undefined);
    },
    submitAssessment: async (
      courseId: string,
      assessmentType: AssessmentType,
      submission: Omit<CourseSubmission, "id" | "courseId" | "assessmentType" | "submittedAt">,
    ) => {
      const course = data.courses.find((currentCourse) => currentCourse.id === courseId) ?? null;
      const student = getStudentByLoginId(data, submission.loginId);

      if (!course || (course.entityType !== "task" && !course.isActive) || !isAssessmentEnabledForCourse(course, assessmentType, student?.branchId)) {
        throw new Error("هذا القسم غير متاح حاليًا للطالب.");
      }

      const existingSubmission = data.submissions.find(
        (currentSubmission) =>
          currentSubmission.courseId === courseId &&
          currentSubmission.assessmentType === assessmentType &&
          currentSubmission.loginId === submission.loginId,
      );

      if (existingSubmission) {
        throw new Error("تم إرسال هذا الاختبار مسبقًا، ولا يمكن إعادة الاختبار مرة أخرى.");
      }

      const tempSubmissionId = createId();
      const tempSubmittedAt = new Date().toISOString();
      const previousSubmissions = data.submissions;

      setSubmissions((submissions) => [
        ...submissions,
        {
          id: tempSubmissionId,
          courseId,
          assessmentType,
          studentName: submission.studentName,
          loginId: submission.loginId,
          answers: submission.answers,
          manualScore: null,
          submittedAt: tempSubmittedAt,
        },
      ]);

      try {
        const insertedSubmission = await submitAssessmentToDatabase(courseId, assessmentType, submission);
        setSubmissions((submissions) =>
          submissions.map((currentSubmission) =>
            currentSubmission.id === tempSubmissionId
              ? { ...currentSubmission, id: insertedSubmission.id, submittedAt: insertedSubmission.submittedAt }
              : currentSubmission,
          ),
        );
      } catch (error) {
        setSubmissions(() => previousSubmissions);
        throw error;
      }
    },
    resetData: () => {
      setData(initialData);
      void resetDashboardDataInDatabase().catch(() => undefined);
    },
    bulkImportAssessments: async (
      courseId: string,
      assessmentType: AssessmentType,
      submissions: Array<{
        studentName: string;
        loginId: string;
        answers: SubmissionAnswer[];
        manualScore?: number | null;
      }>,
    ) => {
      const previousSubmissions = data.submissions;
      const affectedLoginIds = new Set(submissions.map((s) => s.loginId));
      const actionableSubmissions = submissions.filter((submission) => {
        const hasManualScore = typeof submission.manualScore === "number" && Number.isFinite(submission.manualScore) && submission.manualScore >= 0;
        const hasAnswers = submission.answers.some((answer) => answer.questionId !== "__score_override__" && Boolean(answer.value?.trim() || answer.fileDataUrl));
        return hasManualScore || hasAnswers;
      });

      /* Helper: embed __score_override__ in answers so the score survives even if
         manualScore field is lost (e.g. column missing, future refetch, revert). */
      const enrichAnswers = (answers: SubmissionAnswer[], manualScore?: number | null): SubmissionAnswer[] => {
        if (assessmentType === "tasks") {
          return answers.filter((a) => a.questionId !== "__score_override__");
        }
        if (typeof manualScore === "number" && Number.isFinite(manualScore) && manualScore >= 0) {
          return [...answers.filter((a) => a.questionId !== "__score_override__"), { questionId: "__score_override__", value: String(manualScore) }];
        }
        return answers;
      };

      /* optimistic local update so the dashboard reflects all imported rows immediately */
      setSubmissions((prev) => {
        const filtered = prev.filter(
          (s) => !(s.courseId === courseId && s.assessmentType === assessmentType && affectedLoginIds.has(s.loginId)),
        );
        const now = new Date().toISOString();
        const newSubmissions = actionableSubmissions.map((sub) => {
          return {
            id: createId(),
            courseId,
            assessmentType,
            studentName: sub.studentName,
            loginId: sub.loginId,
            answers: enrichAnswers(sub.answers, sub.manualScore),
            manualScore: sub.manualScore ?? null,
            submittedAt: now,
          };
        });
        return [...filtered, ...newSubmissions];
      });

      try {
        const inserted = await bulkUpsertSubmissionsToDatabase(courseId, assessmentType, submissions);

        /* replace optimistic IDs with database IDs when sync succeeds */
        setSubmissions((prev) => {
          const filtered = prev.filter(
            (s) => !(s.courseId === courseId && s.assessmentType === assessmentType && affectedLoginIds.has(s.loginId)),
          );
          const syncedSubmissions = inserted.map((res) => {
            const sub = actionableSubmissions.find((s) => s.loginId === res.loginId)!;
            return {
              id: res.id,
              courseId,
              assessmentType,
              studentName: sub.studentName,
              loginId: sub.loginId,
              answers: enrichAnswers(sub.answers, sub.manualScore),
              manualScore: sub.manualScore ?? null,
              submittedAt: res.submittedAt,
            };
          });
          return [...filtered, ...syncedSubmissions];
        });
      } catch (error) {
        setSubmissions(() => previousSubmissions);
        throw error;
      }
    },
    addTaskTemplate: async (name: string, content: string) => {
      const tempTemplateId = createId();
      const tempCreatedAt = new Date().toISOString();
      const previousTemplates = data.taskTemplates;

      setTaskTemplates((templates) => [...templates, { id: tempTemplateId, name, content, createdAt: tempCreatedAt }]);

      try {
        const insertedTemplate = await addTaskTemplateToDatabase({ name, content });
        setTaskTemplates((templates) =>
          templates.map((template) =>
            template.id === tempTemplateId
              ? { ...template, id: insertedTemplate.id, createdAt: insertedTemplate.createdAt }
              : template,
          ),
        );
        return insertedTemplate.id;
      } catch (error) {
        setTaskTemplates(() => previousTemplates);
        throw error;
      }
    },
    updateTaskTemplate: async (templateId: string, updates: Partial<Omit<TaskTemplateRecord, "id" | "createdAt">>) => {
      const previousTemplates = data.taskTemplates;

      setTaskTemplates((templates) =>
        templates.map((template) => (template.id === templateId ? { ...template, ...updates } : template)),
      );

      try {
        await updateTaskTemplateInDatabase(templateId, updates);
      } catch (error) {
        setTaskTemplates(() => previousTemplates);
        throw error;
      }
    },
    deleteTaskTemplate: async (templateId: string) => {
      const previousTemplates = data.taskTemplates;

      setTaskTemplates((templates) => templates.filter((template) => template.id !== templateId));

      try {
        await deleteTaskTemplateFromDatabase(templateId);
      } catch (error) {
        setTaskTemplates(() => previousTemplates);
        throw error;
      }
    },
    addNotification: async (notification: Omit<NotificationRecord, "id" | "createdAt">) => {
      const tempNotificationId = createId();
      const tempCreatedAt = new Date().toISOString();
      const previousNotifications = data.notifications;

      setNotifications((notifications) => [
        {
          id: tempNotificationId,
          createdAt: tempCreatedAt,
          ...notification,
        },
        ...notifications,
      ]);

      try {
        const insertedNotification = await addNotificationToDatabase(notification);
        setNotifications((notifications) =>
          notifications.map((currentNotification) =>
            currentNotification.id === tempNotificationId
              ? {
                  ...currentNotification,
                  id: insertedNotification.id,
                  createdAt: insertedNotification.createdAt,
                }
              : currentNotification,
          ),
        );
      } catch (error) {
        setNotifications(() => previousNotifications);
        throw error;
      }
    },
    deleteNotification: async (notificationId: string) => {
      const previousNotifications = data.notifications;

      setNotifications((notifications) => notifications.filter((notification) => notification.id !== notificationId));

      try {
        await deleteNotificationFromDatabase(notificationId);
      } catch (error) {
        setNotifications(() => previousNotifications);
        throw error;
      }
    },
    addActivityLog: async (input: Omit<ActivityLogRecord, "id" | "createdAt">) => {
      const tempId = createId();
      const createdAt = new Date().toISOString();
      const nextEntry: ActivityLogRecord = { id: tempId, createdAt, ...input };

      setActivityLogs((current) => [nextEntry, ...current].slice(0, 200));

      try {
        const saved = await addActivityLogToDatabase(input);
        setActivityLogs((current) => current.map((item) => item.id === tempId ? saved : item));
      } catch {
        // Keep local log entry even if remote activity log table is unavailable.
      }
    },
    reloadActivityLogs: async () => {
      try {
        const logs = await loadActivityLogsFromDatabase();
        setActivityLogs(() => logs);
      } catch {
        // Keep current activity logs if remote load fails.
      }
    },
    addSatisfactionQuestion: async (question: { prompt: string; type: "rating" | "text"; isRequired: boolean }) => {
      const targetCourses = getCourses(data).filter((course) => course.isPostEnabled);

      if (targetCourses.length === 0) {
        return;
      }

      const now = new Date().toISOString();
      const tempQuestions = targetCourses.map((course) => ({
        id: createId(),
        courseId: course.id,
        prompt: question.prompt,
        type: question.type,
        isRequired: question.isRequired,
        sortOrder: data.satisfactionQuestions.filter((q) => q.courseId === course.id).length,
        createdAt: now,
      }));

      setSatisfactionQuestions((questions) => [...questions, ...tempQuestions]);

      try {
        const savedQuestions = await addSatisfactionQuestionsToDatabase(
          tempQuestions.map((item) => ({
            courseId: item.courseId,
            prompt: item.prompt,
            type: item.type,
            isRequired: item.isRequired,
            sortOrder: item.sortOrder,
          })),
        );

        const savedByCourseId = new Map(savedQuestions.map((item) => [item.courseId, item]));

        setSatisfactionQuestions((questions) =>
          questions.map((q) => {
            const saved = savedByCourseId.get(q.courseId);
            const isTempQuestion = tempQuestions.some((item) => item.id === q.id);

            if (!saved || !isTempQuestion) {
              return q;
            }

            return { ...q, id: saved.id, createdAt: saved.createdAt };
          }),
        );
      } catch (error) {
        const tempIds = new Set<string>(tempQuestions.map((item) => item.id));
        setSatisfactionQuestions((questions) => questions.filter((q) => !tempIds.has(q.id)));
        throw error;
      }
    },
    deleteSatisfactionQuestion: async (questionId: string) => {
      const previousQuestions = data.satisfactionQuestions;
      const previousResponses = data.satisfactionResponses;
      setSatisfactionQuestions((questions) => questions.filter((q) => q.id !== questionId));
      setSatisfactionResponses((responses) => responses.filter((r) => r.questionId !== questionId));
      try {
        await deleteSatisfactionQuestionFromDatabase(questionId);
      } catch (error) {
        setSatisfactionQuestions(() => previousQuestions);
        setSatisfactionResponses(() => previousResponses);
        throw error;
      }
    },
    submitSatisfactionResponses: async (responses: Array<{ courseId: string; questionId: string; loginCode: string; studentName: string; ratingValue: number | null; textValue: string }>) => {
      const now = new Date().toISOString();
      const tempResponses: SatisfactionResponse[] = responses.map((r) => ({
        id: createId(),
        ...r,
        submittedAt: now,
      }));
      setSatisfactionResponses((current) => {
        // Remove any existing responses for same course+question+loginCode then add new
        const keys = new Set(responses.map((r) => `${r.courseId}:${r.questionId}:${r.loginCode}`));
        const filtered = current.filter((r) => !keys.has(`${r.courseId}:${r.questionId}:${r.loginCode}`));
        return [...filtered, ...tempResponses];
      });
      try {
        const saved = await submitSatisfactionResponsesToDatabase(responses);
        setSatisfactionResponses((current) =>
          current.map((r) => {
            const match = saved.find((s) => s.courseId === r.courseId && s.questionId === r.questionId && s.loginCode === r.loginCode);
            return match ? { ...r, id: match.id } : r;
          }),
        );
      } catch (error) {
        setSatisfactionResponses((current) => {
          const keys = new Set(responses.map((r) => `${r.courseId}:${r.questionId}:${r.loginCode}`));
          return current.filter((r) => !keys.has(`${r.courseId}:${r.questionId}:${r.loginCode}`));
        });
        throw error;
      }
    },
    addFinalExamQuestion: async (branchCode: BranchId, question: { prompt: string; type: "multiple" | "text" | "truefalse"; options: string[]; allowFile: boolean; points: number; correctAnswer: string }) => {
      const tempId = createId();
      const sortOrder = data.finalExamQuestions.filter((q) => q.branchCode === branchCode).length;
      const now = new Date().toISOString();
      const tempQ: FinalExamQuestion = { id: tempId, branchCode, ...question, attachmentName: "", attachmentType: "", attachmentDataUrl: "", sortOrder, createdAt: now };
      setFinalExamQuestions((questions) => [...questions, tempQ]);
      try {
        const saved = await addFinalExamQuestionToDatabase(branchCode, { ...question, sortOrder });
        setFinalExamQuestions((questions) => questions.map((q) => q.id === tempId ? { ...q, id: saved.id, createdAt: saved.createdAt } : q));
      } catch (error) {
        setFinalExamQuestions((questions) => questions.filter((q) => q.id !== tempId));
        throw error;
      }
    },
    deleteFinalExamQuestion: async (id: string) => {
      const prev = data.finalExamQuestions;
      setFinalExamQuestions((questions) => questions.filter((q) => q.id !== id));
      try {
        await deleteFinalExamQuestionFromDatabase(id);
      } catch (error) {
        setFinalExamQuestions(() => prev);
        throw error;
      }
    },
    toggleFinalExamEnabled: async (branchCode: BranchId, closesAt: string | null) => {
      const prevSettings = data.finalExamSettings;
      const newVal = closesAt !== null;
      setFinalExamSettings((s) => ({
        ...s,
        [branchCode]: {
          isEnabled: newVal,
          closesAt: newVal ? closesAt : null,
        },
      }));
      try {
        await toggleFinalExamEnabledInDatabase(branchCode, newVal, newVal ? closesAt : null);
      } catch (error) {
        setFinalExamSettings(() => prevSettings);
        throw error;
      }
    },
    submitFinalExam: async (submission: { branchCode: BranchId; studentName: string; loginCode: string; answers: SubmissionAnswer[] }) => {
      const existing = data.finalExamSubmissions.find((s) => s.loginCode === submission.loginCode);
      if (existing) throw new Error("تم إرسال الاختبار النهائي مسبقًا.");
      const tempId = createId();
      const now = new Date().toISOString();
      const temp: FinalExamSubmission = { id: tempId, ...submission, manualScore: null, submittedAt: now };
      const prev = data.finalExamSubmissions;
      setFinalExamSubmissions((s) => [...s, temp]);
      try {
        const saved = await submitFinalExamToDatabase(submission);
        setFinalExamSubmissions((s) => s.map((item) => item.id === tempId ? { ...item, id: saved.id, submittedAt: saved.submittedAt } : item));
      } catch (error) {
        setFinalExamSubmissions(() => prev);
        throw error;
      }
    },
    copyFinalExamQuestions: async (from: BranchId, to: BranchId, move: boolean) => {
      const sourceQuestions = data.finalExamQuestions.filter((q) => q.branchCode === from);
      if (sourceQuestions.length === 0) return;
      const prevQuestions = data.finalExamQuestions;
      const newQuestions: FinalExamQuestion[] = sourceQuestions.map((q) => ({
        ...q,
        id: createId(),
        branchCode: to,
        sortOrder: data.finalExamQuestions.filter((item) => item.branchCode === to).length,
        createdAt: new Date().toISOString(),
      }));
      setFinalExamQuestions((questions) => {
        const withoutTo = questions.filter((q) => q.branchCode !== to);
        const withTo = move ? withoutTo.filter((q) => q.branchCode !== from) : withoutTo;
        return [...withTo, ...newQuestions];
      });
      try {
        await copyFinalExamQuestionsInDatabase(from, to, move);
        // reload from DB to get real IDs
        const reloaded = await (await import("@/lib/supabase")).loadFinalExamDataFromDatabase();
        setFinalExamQuestions(() => reloaded.questions);
      } catch (error) {
        setFinalExamQuestions(() => prevQuestions);
        throw error;
      }
    },
    setFinalExamManualScore: async (submissionId: string, score: number | null) => {
      const prev = data.finalExamSubmissions;
      setFinalExamSubmissions((s) => s.map((item) => item.id === submissionId ? { ...item, manualScore: score } : item));
      try {
        await setFinalExamManualScoreInDatabase(submissionId, score);
      } catch (error) {
        setFinalExamSubmissions(() => prev);
        throw error;
      }
    },
    setRolePermission: async (role: string, key: PermissionKey, isEnabled: boolean) => {
      const prev = data.rolePermissions;
      setRolePermissions((perms) => ({
        ...perms,
        [role]: { ...(perms[role] ?? {}), [key]: isEnabled },
      }));
      try {
        await setRolePermissionInDatabase(role, key, isEnabled);
      } catch (error) {
        setRolePermissions(() => prev);
        throw error;
      }
    },
    restoreBackupData: async (backupData: DashboardData, onProgress?: RestoreBackupProgressCallback) => {
      await restoreDashboardDataInDatabase(backupData, onProgress);
      await hydrateFromDatabase();
    },
  };
};

type DashboardStoreValue = ReturnType<typeof useCreateDashboardStore>;

const DashboardStoreContext = createContext<DashboardStoreValue | null>(null);

export const DashboardStoreProvider = ({ children }: { children: React.ReactNode }) => {
  const store = useCreateDashboardStore();
  return React.createElement(DashboardStoreContext.Provider, { value: store }, children);
};

export const useDashboardStore = (): DashboardStoreValue => {
  const ctx = useContext(DashboardStoreContext);
  if (ctx) return ctx;
  // Fallback: create own instance (used in tests without provider)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCreateDashboardStore();
};

export const getAssignedStudents = (data: DashboardData, reciterId: string) => {
  const reciter = data.reciters.find((item) => item.id === reciterId);

  if (!reciter) {
    return [];
  }

  return data.students
    .filter((student) => reciter.studentIds.includes(student.id))
    .sort((left, right) => right.completedParts.length - left.completedParts.length || left.name.localeCompare(right.name, "ar"));
};

export const getBranchStudents = (data: DashboardData, branchId: BranchId) =>
  data.students.filter((student) => student.branchId === branchId).sort((left, right) => left.name.localeCompare(right.name, "ar"));

export const getCourses = (data: DashboardData) => data.courses.filter((course) => course.entityType !== "task");

export const getTasks = (data: DashboardData) => data.courses.filter((course) => course.entityType === "task");

export const getActiveCourse = (data: DashboardData) => getCourses(data).find((course) => course.isActive) ?? null;

export const getActiveTask = (data: DashboardData, branchId?: BranchId | null) =>
  getTasks(data).find((task) => isAssessmentEnabledForCourse(task, "tasks", branchId ?? null)) ?? null;

const isFutureDateTime = (value?: string) => {
  if (value === OPEN_ENDED_ASSESSMENT_WINDOW) {
    return true;
  }

  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp > Date.now();
};

export const getAssessmentAvailabilityDeadline = (course: CourseRecord | null, assessmentType: AssessmentType, branchId?: BranchId | null) => {
  if (!course) {
    return undefined;
  }

  const normalizeWindowValue = (value?: string) => (value === OPEN_ENDED_ASSESSMENT_WINDOW ? undefined : value);

  if (branchId) {
    return normalizeWindowValue(course.assessmentWindows[branchId][assessmentType] ?? course.assessmentWindows.global[assessmentType]);
  }

  return normalizeWindowValue(course.assessmentWindows.global[assessmentType]);
};

export const getRoleLabel = (role: UserRole) => {
  if (role === "admin") {
    return "مدير عام";
  }

  if (role === "male_manager") {
    return "مسؤول الرجال";
  }

  if (role === "female_manager") {
    return "مسؤول النساء";
  }

  if (role === "student") {
    return "طالب";
  }

  if (role === "reciter") {
    return "مقرئ";
  }

  return "متدرب";
};

export const isDashboardRole = (role: UserRole) => role === "admin" || role === "male_manager" || role === "female_manager";

export const getManagedBranchId = (role: UserRole): BranchId | null => {
  if (role === "male_manager") {
    return "male";
  }

  if (role === "female_manager") {
    return "female";
  }

  return null;
};

export const isAssessmentEnabledForCourse = (course: CourseRecord | null, assessmentType: AssessmentType, branchId?: BranchId | null) => {
  if (!course) {
    return false;
  }

  if (course.entityType === "task") {
    if (assessmentType !== "tasks") {
      return false;
    }

    if (!course.isTasksEnabled) {
      return false;
    }

    // Must have a future global window
    if (!course.assessmentWindows.global.tasks || !isFutureDateTime(course.assessmentWindows.global.tasks)) {
      return false;
    }

    if (!branchId) {
      const maleEnabled = course.branchAvailability.male.tasks && isFutureDateTime(course.assessmentWindows.male.tasks);
      const femaleEnabled = course.branchAvailability.female.tasks && isFutureDateTime(course.assessmentWindows.female.tasks);
      return maleEnabled || femaleEnabled;
    }

    // If branch has its own deadline, check it
    const branchDeadline = course.assessmentWindows[branchId]?.tasks;
    if (branchDeadline && !isFutureDateTime(branchDeadline)) {
      return false;
    }

    return course.branchAvailability[branchId].tasks;
  }

  const globalEnabled = assessmentType === "pre"
    ? course.isPreEnabled
    : assessmentType === "post"
      ? course.isPostEnabled
      : course.isTasksEnabled;

  if (!globalEnabled || !isFutureDateTime(course.assessmentWindows.global[assessmentType])) {
    return false;
  }

  if (!branchId) {
    const maleEnabled = assessmentType === "pre"
      ? course.branchAvailability.male.pre && isFutureDateTime(course.assessmentWindows.male.pre)
      : assessmentType === "post"
        ? course.branchAvailability.male.post && isFutureDateTime(course.assessmentWindows.male.post)
        : course.branchAvailability.male.tasks && isFutureDateTime(course.assessmentWindows.male.tasks);
    const femaleEnabled = assessmentType === "pre"
      ? course.branchAvailability.female.pre && isFutureDateTime(course.assessmentWindows.female.pre)
      : assessmentType === "post"
        ? course.branchAvailability.female.post && isFutureDateTime(course.assessmentWindows.female.post)
        : course.branchAvailability.female.tasks && isFutureDateTime(course.assessmentWindows.female.tasks);
    return maleEnabled || femaleEnabled;
  }

  if (assessmentType === "pre") {
    return course.branchAvailability[branchId].pre && isFutureDateTime(course.assessmentWindows[branchId].pre);
  }

  if (assessmentType === "post") {
    return course.branchAvailability[branchId].post && isFutureDateTime(course.assessmentWindows[branchId].post);
  }

  return course.branchAvailability[branchId].tasks && isFutureDateTime(course.assessmentWindows[branchId].tasks);
};

export const getStudentByLoginId = (data: DashboardData, loginId: string) =>
  data.students.find((student) => student.loginId.trim() === loginId.trim()) ?? null;

export const getReciterByLoginCode = (data: DashboardData, loginCode: string) =>
  data.reciters.find((reciter) => reciter.loginCode.trim().toLowerCase() === loginCode.trim().toLowerCase()) ?? null;

export const getAdminByLoginCode = (loginCode: string) =>
  adminAccounts.find((account) => account.loginCode === loginCode.trim()) ?? null;

export const resolveAccessByLoginCode = (data: DashboardData, loginCode: string): ResolvedAccess | null => {
  const trimmedCode = loginCode.trim();
  const normalizedCode = trimmedCode.toLowerCase();

  if (!trimmedCode) {
    return null;
  }

  const student = getStudentByLoginId(data, trimmedCode);

  if (student) {
    return {
      role: "student",
      redirectPath: `/student?login=${encodeURIComponent(student.loginId)}`,
      loginCode: student.loginId,
      name: student.name,
      branchId: student.branchId,
    };
  }

  const reciter = getReciterByLoginCode(data, trimmedCode);

  if (reciter) {
    return {
      role: "reciter",
      redirectPath: `/reciter?login=${encodeURIComponent(reciter.loginCode)}`,
      loginCode: reciter.loginCode,
      name: reciter.name,
      branchId: reciter.branchId,
    };
  }

  const adminAccount = getAdminByLoginCode(trimmedCode);

  if (adminAccount) {
    return {
      role: adminAccount.role,
      redirectPath: "/dashboard",
      loginCode: adminAccount.loginCode,
      name: adminAccount.name,
      branchId: getManagedBranchId(adminAccount.role),
    };
  }

  if (normalizedCode === "trainee") {
    return {
      role: "trainee",
      redirectPath: "/trainee",
      loginCode: trimmedCode,
      name: "متدرب",
      branchId: null,
    };
  }

  return null;
};

export const getAssessmentQuestions = (course: CourseRecord, assessmentType: AssessmentType) => {
  const key = getAssessmentKey(assessmentType);
  return course[key];
};

export const getCoursePath = (assessmentType: AssessmentType) => {
  if (assessmentType === "pre") {
    return "/course/pre";
  }

  if (assessmentType === "post") {
    return "/course/post";
  }

  return "/tasks";
};

export const getCourseLink = (assessmentType: AssessmentType) =>
  typeof window === "undefined" ? getCoursePath(assessmentType) : `${window.location.origin}${getCoursePath(assessmentType)}`;

export const getTaskPath = (taskId?: string) =>
  taskId ? `/tasks?taskId=${encodeURIComponent(taskId)}` : "/tasks";

export const getTaskLink = (taskId?: string) =>
  typeof window === "undefined" ? getTaskPath(taskId) : `${window.location.origin}${getTaskPath(taskId)}`;

export const loadAccessSession = (): AccessSession | null => {
  if (!isBrowser) {
    return null;
  }

  const raw = window.localStorage.getItem(ACCESS_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as Partial<AccessSession>;

    if (!session.role || !session.redirectPath || !session.loginCode || !session.name) {
      return null;
    }

    return {
      role: session.role,
      redirectPath: session.redirectPath,
      loginCode: session.loginCode,
      name: session.name,
      branchId: session.branchId === "male" || session.branchId === "female" ? session.branchId : null,
    };
  } catch {
    return null;
  }
};

export const saveAccessSession = (session: AccessSession) => {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(ACCESS_SESSION_SYNC_EVENT, { detail: { session } }));
};

export const clearAccessSession = () => {
  if (!isBrowser) {
    return;
  }

  window.localStorage.removeItem(ACCESS_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(ACCESS_SESSION_SYNC_EVENT, { detail: { session: null } }));
};
