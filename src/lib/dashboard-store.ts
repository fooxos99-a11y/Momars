import { useEffect, useRef, useState } from "react";
import {
  activateCourseInDatabase,
  addCourseToDatabase,
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
  resetDashboardDataInDatabase,
  saveReciterToDatabase,
  submitAssessmentToDatabase,
  toggleStudentPartInDatabase,
  updateTaskTemplateInDatabase,
  updateCourseInDatabase,
  updateStudentInDatabase,
} from "@/lib/supabase";

export type UserRole = "admin" | "male_manager" | "female_manager" | "student" | "reciter" | "trainee";
export type BranchId = "male" | "female";
export type AssessmentType = "pre" | "post" | "tasks";
export type QuestionType = "multiple" | "text" | "truefalse";
export type RecordEntityType = "course" | "task";
export type TaskMode = "questions" | "document";

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
  source: "post-test";
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
}

const adminAccounts = [
  {
    name: "إبراهيم محمد ابا الخيل",
    loginCode: "1483",
    role: "admin" as const,
  },
];

const STORAGE_KEY = "mmars-dashboard-data";
const ACCESS_STORAGE_KEY = "mmars-access-session";
const DASHBOARD_SYNC_EVENT = "mmars-dashboard-data-sync";
export const ACCESS_SESSION_SYNC_EVENT = "mmars-access-session-sync";
const isBrowser = typeof window !== "undefined";
const createId = () => crypto.randomUUID();

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
    { id: "male", label: "رجالي" },
    { id: "female", label: "نسائي" },
  ],
  students: [],
  reciters: [],
  courses: [],
  taskTemplates: [],
  submissions: [],
  attendance: [],
  notifications: [],
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
      ? input.attendance.map((record) => ({
          ...record,
          source: "post-test",
        }))
      : initialData.attendance,
    notifications: Array.isArray(input?.notifications)
      ? input.notifications
          .map((notification) => ({
            id: notification.id,
            title: notification.title ?? "",
            message: notification.message ?? "",
            targetBranchId: notification.targetBranchId === "female" ? "female" : notification.targetBranchId === "male" ? "male" : null,
            createdAt: notification.createdAt ?? new Date().toISOString(),
            createdByRole: notification.createdByRole,
            createdByName: notification.createdByName,
          }))
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      : initialData.notifications,
  };
};

const loadDashboardData = (): DashboardData => {
  if (!isBrowser) {
    return initialData;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return initialData;
  }

  try {
    return normalizeData(JSON.parse(raw) as Partial<DashboardData>);
  } catch {
    return initialData;
  }
};

const hasDashboardContent = (input: DashboardData) =>
  input.students.length > 0 || input.reciters.length > 0 || input.courses.length > 0 || input.taskTemplates.length > 0 || input.submissions.length > 0 || input.attendance.length > 0 || input.notifications.length > 0;

const persistDashboardData = (nextData: DashboardData, sourceId?: string) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
    window.dispatchEvent(new CustomEvent(DASHBOARD_SYNC_EVENT, { detail: { data: nextData, sourceId } }));
  } catch {
    // localStorage may throw QuotaExceededError for large data (e.g. base64 images); ignore and keep in-memory state.
  }
};

export const useDashboardStore = () => {
  const [data, setData] = useState<DashboardData>(() => loadDashboardData());
  const [bootstrapData] = useState<DashboardData>(() => loadDashboardData());
  const [isHydrated, setIsHydrated] = useState(!isBrowser);
  const sourceIdRef = useRef(createId());
  const suppressPersistRef = useRef(false);

  useEffect(() => {
    if (suppressPersistRef.current) {
      suppressPersistRef.current = false;
      return;
    }

    persistDashboardData(data, sourceIdRef.current);
  }, [data]);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    const applyExternalData = (nextData: DashboardData) => {
      suppressPersistRef.current = true;
      setData(normalizeData(nextData));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        applyExternalData(JSON.parse(event.newValue) as DashboardData);
      } catch {
        // Ignore malformed storage payloads.
      }
    };

    const handleDashboardSync = (event: Event) => {
      const customEvent = event as CustomEvent<{ data?: DashboardData; sourceId?: string }>;

      if (customEvent.detail?.sourceId === sourceIdRef.current || !customEvent.detail?.data) {
        return;
      }

      applyExternalData(customEvent.detail.data);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(DASHBOARD_SYNC_EVENT, handleDashboardSync as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(DASHBOARD_SYNC_EVENT, handleDashboardSync as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromDatabase = async () => {
      try {
        const nextData = await loadDashboardDataFromDatabase();

        if (!hasDashboardContent(nextData) && hasDashboardContent(bootstrapData)) {
          const studentIdMap = new Map<string, string>();
          const courseIdMap = new Map<string, string>();
          const questionIdMap = new Map<string, string>();

          for (const student of bootstrapData.students) {
            const insertedStudentId = await addStudentToDatabase({
              name: student.name,
              loginId: student.loginId,
              branchId: student.branchId,
              note: student.note,
            });

            studentIdMap.set(student.id, insertedStudentId);

            if (student.completedParts.length > 0) {
              await updateStudentInDatabase(insertedStudentId, { completedParts: student.completedParts });
            }
          }

          for (const course of bootstrapData.courses) {
            const insertedCourse = await addCourseToDatabase(course.title, false, {
              entityType: course.entityType,
              taskMode: course.taskMode,
              taskTemplateId: course.taskTemplateId,
              taskTemplateName: course.taskTemplateName,
              taskTemplateContent: course.taskTemplateContent,
            });
            courseIdMap.set(course.id, insertedCourse.id);

            for (const assessmentType of (course.entityType === "task" ? ["tasks"] : ["pre", "post", "tasks"]) as const) {
              const questions = course[getAssessmentKey(assessmentType)];

              for (const question of questions) {
                const insertedQuestionId = await addQuestionToDatabase(insertedCourse.id, assessmentType, {
                  prompt: question.prompt,
                  type: question.type,
                  options: question.options,
                  allowFile: question.allowFile,
                  points: question.points,
                  correctAnswer: question.correctAnswer,
                });

                questionIdMap.set(question.id, insertedQuestionId);
              }
            }
          }

          for (const template of bootstrapData.taskTemplates) {
            await addTaskTemplateToDatabase({ name: template.name, content: template.content });
          }

          const activeCourse = bootstrapData.courses.find((course) => course.entityType !== "task" && course.isActive);

          if (activeCourse) {
            const mappedCourseId = courseIdMap.get(activeCourse.id);

            if (mappedCourseId) {
              await activateCourseInDatabase(mappedCourseId, {
                pre: activeCourse.isPreEnabled ?? true,
                post: activeCourse.isPostEnabled ?? true,
                tasks: activeCourse.isTasksEnabled ?? true,
              });
            }
          }

          for (const reciter of bootstrapData.reciters) {
            const linkedStudents = bootstrapData.students.filter((student) => reciter.studentIds.includes(student.id));

            await saveReciterToDatabase({
              name: reciter.name,
              branchId: reciter.branchId,
              loginCode: reciter.loginCode,
              linkedStudents: linkedStudents.map((student) => ({
                name: student.name,
                loginId: student.loginId,
                branchId: student.branchId,
                note: student.note,
                completedParts: student.completedParts,
              })),
            });
          }

          for (const submission of bootstrapData.submissions) {
            const mappedCourseId = courseIdMap.get(submission.courseId);

            if (!mappedCourseId) {
              continue;
            }

            await submitAssessmentToDatabase(mappedCourseId, submission.assessmentType, {
              studentName: submission.studentName,
              loginId: submission.loginId,
              answers: submission.answers.map((answer) => ({
                questionId: questionIdMap.get(answer.questionId) ?? answer.questionId,
                value: answer.value,
                fileName: answer.fileName,
                fileType: answer.fileType,
                fileDataUrl: answer.fileDataUrl,
              })),
            });
          }

          const hydratedAfterBootstrap = await loadDashboardDataFromDatabase();

          if (!cancelled) {
            setData(hydratedAfterBootstrap);
          }

          return;
        }

        if (!cancelled) {
          setData(nextData);
        }
      } catch {
        // Keep local storage as fallback when the database is unavailable.
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    void hydrateFromDatabase();

    return () => {
      cancelled = true;
    };
  }, [bootstrapData]);

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

  return {
    data,
    isHydrated,
    addStudent: async (student: Omit<StudentRecord, "id" | "completedParts" | "createdAt">) => {
      const tempStudentId = createId();
      setStudents((students) => [...students, { id: tempStudentId, completedParts: [], createdAt: new Date().toISOString(), ...student }]);

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
    toggleStudentPart: (studentId: string, partNumber: number) => {
      let shouldMarkComplete = false;

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

      void toggleStudentPartInDatabase({
        studentId,
        reciterId: null,
        partNumber,
        shouldMarkComplete,
      }).catch(() => undefined);
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
          isPreEnabled: true,
          isPostEnabled: true,
          isTasksEnabled: false,
          branchAvailability: defaultCourseBranchAvailability(),
          assessmentWindows: defaultAssessmentWindows(),
          assessmentNotificationTemplates: defaultAssessmentNotificationTemplates(),
          taskMode: entityType === "task" ? (options?.taskMode === "document" ? "document" : "questions") : null,
          taskTemplateId: options?.taskTemplateId ?? "",
          taskTemplateName: options?.taskTemplateName ?? "",
          taskTemplateContent: options?.taskTemplateContent ?? "",
          youtubeUrl: options?.youtubeUrl ?? "",
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
                  entityType: insertedCourse.entityType,
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
      } catch (error) {
        setCourses(() => previousCourses);
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

      if (assessmentType === "post") {
        setAttendance((attendance) => {
          const alreadyPrepared = attendance.find((record) => record.courseId === courseId && record.loginId === submission.loginId);

          if (alreadyPrepared) {
            return attendance.map((record) =>
              record.courseId === courseId && record.loginId === submission.loginId
                ? { ...record, studentName: submission.studentName }
                : record,
            );
          }

          return [
            ...attendance,
            {
              id: createId(),
              courseId,
              studentName: submission.studentName,
              loginId: submission.loginId,
              source: "post-test",
              createdAt: new Date().toISOString(),
            },
          ];
        });
      }

      try {
        const insertedSubmission = await submitAssessmentToDatabase(courseId, assessmentType, submission);
        setSubmissions((submissions) =>
          submissions.map((currentSubmission) =>
            currentSubmission.id === tempSubmissionId
              ? { ...currentSubmission, id: insertedSubmission.id, submittedAt: insertedSubmission.submittedAt }
              : currentSubmission,
          ),
        );
      } catch {
        // Keep the locally submitted assessment when database sync is unavailable.
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
      const affectedLoginIds = new Set(submissions.map((s) => s.loginId));

      /* optimistic local update so the dashboard reflects all imported rows immediately */
      setSubmissions((prev) => {
        const filtered = prev.filter(
          (s) => !(s.courseId === courseId && s.assessmentType === assessmentType && affectedLoginIds.has(s.loginId)),
        );
        const now = new Date().toISOString();
        const newSubmissions = submissions.map((sub) => {
          return {
            id: createId(),
            courseId,
            assessmentType,
            studentName: sub.studentName,
            loginId: sub.loginId,
            answers: sub.answers,
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
            const sub = submissions.find((s) => s.loginId === res.loginId)!;
            return {
              id: res.id,
              courseId,
              assessmentType,
              studentName: sub.studentName,
              loginId: sub.loginId,
              answers: sub.answers,
              manualScore: sub.manualScore ?? null,
              submittedAt: res.submittedAt,
            };
          });
          return [...filtered, ...syncedSubmissions];
        });
      } catch {
        // Keep optimistic imported data when remote sync fails.
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
  };
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
  if (!value) {
    return true;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return true;
  }

  return timestamp > Date.now();
};

export const getAssessmentAvailabilityDeadline = (course: CourseRecord | null, assessmentType: AssessmentType, branchId?: BranchId | null) => {
  if (!course) {
    return undefined;
  }

  if (branchId) {
    return course.assessmentWindows[branchId][assessmentType] ?? course.assessmentWindows.global[assessmentType];
  }

  return course.assessmentWindows.global[assessmentType];
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
