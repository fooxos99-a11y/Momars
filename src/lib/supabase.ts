import { createClient } from "@supabase/supabase-js";
import type {
  AccessSession,
  AssessmentType,
  BranchId,
  CourseAssessmentTemplates,
  CourseAssessmentWindows,
  CourseBranchAvailability,
  CourseQuestion,
  CourseRecord,
  DashboardData,
  FinalExamQuestion,
  FinalExamSubmission,
  NotificationRecord,
  RecordEntityType,
  SatisfactionQuestion,
  SatisfactionResponse,
  StudentRecord,
  SubmissionAnswer,
  TaskMode,
  TaskTemplateRecord,
  UserRole,
} from "@/lib/dashboard-store";

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

const getRedirectPathByRole = (role: UserRole, loginCode: string) => {
  if (role === "admin" || role === "male_manager" || role === "female_manager") {
    return "/dashboard";
  }

  if (role === "student") {
    return `/student?login=${encodeURIComponent(loginCode)}`;
  }

  if (role === "reciter") {
    return `/reciter?login=${encodeURIComponent(loginCode)}`;
  }

  return "/trainee";
};

const getManagedBranchByRole = (role: UserRole): BranchId | null => {
  if (role === "male_manager") {
    return "male";
  }

  if (role === "female_manager") {
    return "female";
  }

  return null;
};

const normalizeCourseBranchAvailability = (input?: Partial<Record<BranchId, Partial<CourseBranchAvailability>>>) => ({
  male: {
    pre: input?.male?.pre ?? true,
    post: input?.male?.post ?? true,
    tasks: input?.male?.tasks ?? true,
  },
  female: {
    pre: input?.female?.pre ?? true,
    post: input?.female?.post ?? true,
    tasks: input?.female?.tasks ?? true,
  },
});

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

const normalizeAssessmentNotificationTemplates = (input?: Partial<CourseAssessmentTemplates>): CourseAssessmentTemplates => ({
  pre: input?.pre ?? "",
  post: input?.post ?? "",
  tasks: input?.tasks ?? "",
});

const isMissingColumnError = (error: { message?: string; details?: string; hint?: string; code?: string }, columnName: string) => {
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return error.code === "42703" || text.includes(columnName.toLowerCase());
};

export const resolveAccessByLoginCodeFromDatabase = async (loginCode: string): Promise<AccessSession | null> => {
  const trimmedCode = loginCode.trim();

  if (!trimmedCode) {
    return null;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("full_name, role, login_code")
    .eq("login_code", trimmedCode)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (user) {
    const role = user.role as UserRole;

    return {
      role,
      loginCode: user.login_code ?? trimmedCode,
      name: user.full_name,
      redirectPath: getRedirectPathByRole(role, user.login_code ?? trimmedCode),
      branchId: getManagedBranchByRole(role),
    };
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("full_name, login_code, branch_id, branches(code)")
    .eq("login_code", trimmedCode)
    .maybeSingle();

  if (studentError) {
    throw studentError;
  }

  if (!student) {
    return null;
  }

  const branchCode = (student.branches as { code?: string } | null)?.code as BranchId | null ?? null;

  return {
    role: "student",
    loginCode: student.login_code,
    name: student.full_name,
    redirectPath: getRedirectPathByRole("student", student.login_code),
    branchId: branchCode,
  };
};

export interface DatabaseReciterStudent {
  id: string;
  name: string;
  loginId: string;
  branchId: BranchId;
  note: string;
  completedParts: number[];
}

export interface DatabaseReciterAccount {
  id: string;
  name: string;
  loginCode: string;
  students: DatabaseReciterStudent[];
}

export interface DatabaseStudentReciter {
  id: string;
  name: string;
  loginCode: string;
}

export interface DatabaseDashboardAccount {
  id: string;
  name: string;
  loginCode: string;
  role: UserRole;
}

const dashboardRoles = [
  { id: "admin" as const, label: "مدير عام" },
  { id: "male_manager" as const, label: "مسؤول الرجال" },
  { id: "female_manager" as const, label: "مسؤول النساء" },
  { id: "student" as const, label: "طالب" },
  { id: "reciter" as const, label: "مقرئ" },
  { id: "trainee" as const, label: "متدرب (معلم)" },
];

const defaultBranches = [
  { id: "male" as const, label: "معلمين" },
  { id: "female" as const, label: "معلمات" },
];

const isTrueFalseOptions = (options: string[]) => {
  if (options.length !== 2) return false;
  const normalized = options.map((option) => option.trim().toLowerCase());
  return (
    (normalized[0] === "صح" && normalized[1] === "خطأ")
    || (normalized[0] === "خطأ" && normalized[1] === "صح")
  );
};

const mapQuestionType = (value: unknown, options: string[]): "multiple" | "text" | "truefalse" => {
  if (value === "text") return "text";
  if (value === "multiple" && isTrueFalseOptions(options)) return "truefalse";
  return "multiple";
};

const getErrorText = (error: { message?: string; details?: string; hint?: string }) =>
  [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

const isMissingFieldError = (error: { message?: string; details?: string; hint?: string; code?: string }, fieldName: string) => {
  const errorText = getErrorText(error);
  const lowerField = fieldName.toLowerCase();

  // PGRST204: PostgREST schema-cache miss; 42703: PostgreSQL undefined_column
  if (error.code === "PGRST204" || error.code === "42703") {
    return true;
  }

  return (
    errorText.includes("could not find the") ||
    errorText.includes("does not exist") ||
    errorText.includes("column") ||
    errorText.includes("undefined_column")
  ) && errorText.includes(lowerField);
};

const isMissingRpcSignatureError = (error: { message?: string; details?: string; hint?: string; code?: string }, functionName: string) => {
  const errorText = getErrorText(error);

  return (error.code === "PGRST202" || errorText.includes("could not find the function")) && errorText.includes(functionName.toLowerCase());
};

const isMissingRelationError = (error: { message?: string; details?: string; hint?: string; code?: string }, relationName: string) => {
  const errorText = getErrorText(error);

  return errorText.includes("relation") && errorText.includes(relationName.toLowerCase()) && errorText.includes("does not exist");
};

const getBranchRecords = async () => {
  const { data, error } = await supabase.from("branches").select("id, code, name");

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const loadDashboardDataFromDatabase = async (): Promise<DashboardData> => {
  const branches = await getBranchRecords();
  const branchCodeById = new Map(branches.map((branch) => [branch.id as string, branch.code as BranchId]));

  // Run all independent queries in parallel to minimize load time
  const [
    studentsResponse,
    studentPartsResult,
    recitersResponse,
    usersResponse,
    reciterStudentsResponse,
    coursesResponse,
    questionsResponse,
    submissionsResponse,
    answersResponse,
    attendanceResponse,
    taskTemplatesResponse,
    notificationsResponse,
    satisfactionResult,
    finalExamData,
    rolePermissions,
  ] = await Promise.all([
    // students with is_certified fallback
    (async () => {
      const r = await supabase.from("students").select("id, full_name, login_code, note, is_certified, branch_id, created_at");
      return (r.error && isMissingFieldError(r.error, "is_certified"))
        ? supabase.from("students").select("id, full_name, login_code, note, branch_id, created_at")
        : r;
    })(),
    // student_parts
    supabase.from("student_parts").select("student_id, part_number"),
    // reciters with branch_id fallback
    (async () => {
      const r = await supabase.from("reciters").select("id, full_name, user_id, branch_id");
      return (r.error && isMissingFieldError(r.error, "branch_id"))
        ? supabase.from("reciters").select("id, full_name, user_id")
        : r;
    })(),
    // users
    supabase.from("users").select("id, full_name, role, login_code").eq("role", "reciter"),
    // reciter_students
    supabase.from("reciter_students").select("reciter_id, student_id"),
    // courses with branch settings fallback
    (async () => {
      const r = await supabase.from("courses").select("id, title, entity_type, task_mode, task_template_id, task_template_name, task_template_content, youtube_url, is_active, is_pre_enabled, is_post_enabled, is_tasks_enabled, male_pre_enabled, female_pre_enabled, male_post_enabled, female_post_enabled, male_tasks_enabled, female_tasks_enabled, assessment_windows, assessment_notification_templates, sort_order, created_at");
      return (r.error && (
        isMissingFieldError(r.error, "male_pre_enabled") ||
        isMissingFieldError(r.error, "female_pre_enabled") ||
        isMissingFieldError(r.error, "male_post_enabled") ||
        isMissingFieldError(r.error, "female_post_enabled") ||
        isMissingFieldError(r.error, "male_tasks_enabled") ||
        isMissingFieldError(r.error, "female_tasks_enabled") ||
        isMissingFieldError(r.error, "assessment_windows") ||
        isMissingFieldError(r.error, "assessment_notification_templates")
      ))
        ? supabase.from("courses").select("id, title, entity_type, task_mode, task_template_id, task_template_name, task_template_content, youtube_url, is_active, is_pre_enabled, is_post_enabled, is_tasks_enabled, sort_order, created_at")
        : r;
    })(),
    // course_questions
    supabase.from("course_questions").select("id, course_id, assessment_type, question_type, prompt, options, allow_file, points, correct_answer, attachment_name, attachment_type, attachment_data_url, sort_order"),
    // course_submissions with manual_score fallback
    (async () => {
      const r = await supabase.from("course_submissions").select("id, course_id, assessment_type, student_name, login_code, manual_score, submitted_at");
      return (r.error && isMissingFieldError(r.error, "manual_score"))
        ? supabase.from("course_submissions").select("id, course_id, assessment_type, student_name, login_code, submitted_at")
        : r;
    })(),
    // course_submission_answers
    supabase.from("course_submission_answers").select("id, submission_id, question_id, answer_text, file_name, file_type, file_data_url"),
    // course_attendance
    supabase.from("course_attendance").select("id, course_id, student_name, login_code, source, created_at"),
    // task_templates
    supabase.from("task_templates").select("id, name, content, created_at"),
    // notifications with target_login_ids fallback
    (async () => {
      const r = await supabase.from("notifications").select("id, title, message, target_branch_code, target_login_ids, created_at, created_by_name, created_by_role");
      return (r.error && isMissingColumnError(r.error, "target_login_ids"))
        ? supabase.from("notifications").select("id, title, message, target_branch_code, created_at, created_by_name, created_by_role")
        : r;
    })(),
    // satisfaction questions + responses (responses depend on questions error check)
    (async () => {
      const qr = await supabase.from("satisfaction_questions").select("id, course_id, prompt, type, is_required, sort_order, created_at").order("sort_order");
      if (qr.error && isMissingFieldError(qr.error, "course_id")) {
        const legacyQr = await supabase.from("satisfaction_questions").select("id, prompt, type, is_required, sort_order, created_at").order("sort_order");
        return { questions: legacyQr, responses: { data: [] as unknown[], error: null }, legacyNoCourseId: true };
      }
      if (isMissingRelationError(qr.error ?? { message: "" }, "satisfaction_questions")) {
        return { questions: qr, responses: { data: [] as unknown[], error: null }, legacyNoCourseId: false };
      }
      const rr = await supabase.from("satisfaction_responses").select("id, course_id, question_id, login_code, student_name, rating_value, text_value, submitted_at");
      return { questions: qr, responses: rr, legacyNoCourseId: false };
    })(),
    // final exam data
    loadFinalExamDataFromDatabase().catch(() => ({
      questions: [] as FinalExamQuestion[],
      submissions: [] as FinalExamSubmission[],
      settings: { male: false, female: false },
    })),
    // role permissions
    loadRolePermissionsFromDatabase().catch(() => ({} as Record<string, Record<string, boolean>>)),
  ]);

  const { data: students, error: studentsError } = studentsResponse;
  if (studentsError) throw studentsError;

  const { data: studentParts, error: studentPartsError } = studentPartsResult;
  if (studentPartsError) throw studentPartsError;

  if (usersResponse.error) throw usersResponse.error;
  if (recitersResponse.error) throw recitersResponse.error;
  if (reciterStudentsResponse.error) throw reciterStudentsResponse.error;
  if (coursesResponse.error) throw coursesResponse.error;
  if (questionsResponse.error) throw questionsResponse.error;
  if (submissionsResponse.error) console.error("[supabase] course_submissions query failed:", submissionsResponse.error);
  if (answersResponse.error) console.error("[supabase] course_submission_answers query failed:", answersResponse.error);
  if (attendanceResponse.error && !isMissingRelationError(attendanceResponse.error, "course_attendance")) console.error("[supabase] course_attendance query failed:", attendanceResponse.error);
  if (taskTemplatesResponse.error) console.error("[supabase] task_templates query failed:", taskTemplatesResponse.error);
  if (notificationsResponse.error && !isMissingRelationError(notificationsResponse.error, "notifications")) console.error("[supabase] notifications query failed:", notificationsResponse.error);

  const satisfactionQuestionsResponse = satisfactionResult.questions;
  const satisfactionResponsesResponse = satisfactionResult.responses;

  const completedPartsByStudentId = new Map<string, number[]>();

  for (const row of studentParts ?? []) {
    const studentId = row.student_id as string;
    const current = completedPartsByStudentId.get(studentId) ?? [];
    current.push(row.part_number as number);
    completedPartsByStudentId.set(studentId, current);
  }

  const normalizedStudents = (students ?? []).map((student) => ({
    id: student.id as string,
    name: student.full_name as string,
    loginId: student.login_code as string,
    branchId: branchCodeById.get(student.branch_id as string) ?? "male",
    note: (student.note as string) ?? "",
    isCertified: Boolean(student.is_certified),
    completedParts: [...(completedPartsByStudentId.get(student.id as string) ?? [])].sort((left, right) => left - right),
    createdAt: (student.created_at as string) ?? new Date().toISOString(),
  }));

  const userById = new Map((usersResponse.data ?? []).map((user) => [user.id as string, user]));
  const studentIdsByReciterId = new Map<string, string[]>();

  for (const row of reciterStudentsResponse.data ?? []) {
    const current = studentIdsByReciterId.get(row.reciter_id as string) ?? [];
    current.push(row.student_id as string);
    studentIdsByReciterId.set(row.reciter_id as string, current);
  }

  const normalizedReciters = (recitersResponse.data ?? []).map((reciter) => {
    const user = userById.get(reciter.user_id as string);
    const studentIds = [...new Set(studentIdsByReciterId.get(reciter.id as string) ?? [])];
    const linkedStudent = normalizedStudents.find((student) => studentIds.includes(student.id));
    const reciterBranchId = "branch_id" in reciter ? (reciter.branch_id as string | null) : null;

    return {
      id: reciter.id as string,
      name: ((user?.full_name as string) || (reciter.full_name as string)) ?? "",
      loginCode: (user?.login_code as string) ?? "",
      branchId: (reciterBranchId ? branchCodeById.get(reciterBranchId) : null) ?? linkedStudent?.branchId ?? "male",
      studentIds,
    };
  });

  const answersBySubmissionId = new Map<string, SubmissionAnswer[]>();

  for (const answer of answersResponse.data ?? []) {
    const current = answersBySubmissionId.get(answer.submission_id as string) ?? [];
    current.push({
      questionId: answer.question_id as string,
      value: (answer.answer_text as string) ?? "",
      fileName: (answer.file_name as string | null) ?? undefined,
      fileType: (answer.file_type as string | null) ?? undefined,
      fileDataUrl: (answer.file_data_url as string | null) ?? undefined,
    });
    answersBySubmissionId.set(answer.submission_id as string, current);
  }

  const questionsByCourseId = new Map<string, { pre: CourseQuestion[]; post: CourseQuestion[]; tasks: CourseQuestion[] }>();

  for (const question of questionsResponse.data ?? []) {
    const courseId = question.course_id as string;
    const current = questionsByCourseId.get(courseId) ?? { pre: [], post: [], tasks: [] };
    const assessmentType = question.assessment_type as AssessmentType;
    const options = Array.isArray(question.options) ? (question.options as string[]) : [];
    current[assessmentType].push({
      id: question.id as string,
      prompt: question.prompt as string,
      type: mapQuestionType(question.question_type, options),
      options,
      allowFile: Boolean(question.allow_file),
      points: Number(question.points) > 0 ? Number(question.points) : 1,
      correctAnswer: (question.correct_answer as string) ?? "",
      attachmentName: (question.attachment_name as string) ?? "",
      attachmentType: (question.attachment_type as string) ?? "",
      attachmentDataUrl: (question.attachment_data_url as string) ?? "",
    });
    questionsByCourseId.set(courseId, current);
  }

  const normalizedCourses = (coursesResponse.data ?? []).map((course) => {
    const groupedQuestions = questionsByCourseId.get(course.id as string) ?? { pre: [], post: [], tasks: [] };

    return {
      id: course.id as string,
      title: course.title as string,
      entityType: ((course.entity_type as RecordEntityType | null) ?? "course") === "task" ? "task" : "course",
      isActive: Boolean(course.is_active),
      isPreEnabled: (course.is_pre_enabled as boolean | null) ?? true,
      isPostEnabled: (course.is_post_enabled as boolean | null) ?? true,
      isTasksEnabled: (course.is_tasks_enabled as boolean | null) ?? true,
      branchAvailability: normalizeCourseBranchAvailability({
        male: {
          pre: ("male_pre_enabled" in course ? (course.male_pre_enabled as boolean | null) : true) ?? true,
          post: ("male_post_enabled" in course ? (course.male_post_enabled as boolean | null) : true) ?? true,
          tasks: ("male_tasks_enabled" in course ? (course.male_tasks_enabled as boolean | null) : true) ?? true,
        },
        female: {
          pre: ("female_pre_enabled" in course ? (course.female_pre_enabled as boolean | null) : true) ?? true,
          post: ("female_post_enabled" in course ? (course.female_post_enabled as boolean | null) : true) ?? true,
          tasks: ("female_tasks_enabled" in course ? (course.female_tasks_enabled as boolean | null) : true) ?? true,
        },
      }),
      assessmentWindows: normalizeAssessmentWindows((course.assessment_windows as CourseAssessmentWindows | null) ?? undefined),
      assessmentNotificationTemplates: normalizeAssessmentNotificationTemplates((course.assessment_notification_templates as CourseAssessmentTemplates | null) ?? undefined),
      taskMode: (course.task_mode as TaskMode | null) ?? null,
      taskTemplateId: (course.task_template_id as string | null) ?? "",
      taskTemplateName: (course.task_template_name as string | null) ?? "",
      taskTemplateContent: (course.task_template_content as string | null) ?? "",
      youtubeUrl: (course.youtube_url as string | null) ?? "",
      sortOrder: (course.sort_order as number | null) ?? 0,
      preQuestions: groupedQuestions.pre,
      postQuestions: groupedQuestions.post,
      taskQuestions: groupedQuestions.tasks,
      createdAt: (course.created_at as string) ?? new Date().toISOString(),
    };
  });

  const normalizedTaskTemplates: TaskTemplateRecord[] = (taskTemplatesResponse.data ?? []).map((template) => ({
    id: template.id as string,
    name: template.name as string,
    content: (template.content as string | null) ?? "",
    createdAt: (template.created_at as string | null) ?? new Date().toISOString(),
  }));

  const normalizedSubmissions = (submissionsResponse.data ?? []).map((submission) => {
    const manualScore = (() => {
      const value = (submission as { manual_score?: unknown }).manual_score;
      if (value === null) return null;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    })();

    const rawAnswers = answersBySubmissionId.get(submission.id as string) ?? [];

    // Keep task executions free of synthetic answers so the UI does not treat them
    // like uploaded responses or show fake document content.
    let answers = rawAnswers;
    if (submission.assessment_type !== "tasks" && typeof manualScore === "number" && Number.isFinite(manualScore) && manualScore >= 0) {
      const withoutOverride = rawAnswers.filter((a) => a.questionId !== "__score_override__");
      answers = [...withoutOverride, { questionId: "__score_override__", value: String(manualScore) }];
    }

    return {
      id: submission.id as string,
      courseId: submission.course_id as string,
      assessmentType: submission.assessment_type as AssessmentType,
      studentName: submission.student_name as string,
      loginId: submission.login_code as string,
      manualScore,
      answers,
      submittedAt: (submission.submitted_at as string) ?? new Date().toISOString(),
    };
  });

  const normalizedAttendance = (attendanceResponse.data ?? []).map((attendance) => ({
    id: attendance.id as string,
    courseId: attendance.course_id as string,
    studentName: attendance.student_name as string,
    loginId: attendance.login_code as string,
    source: (attendance.source as string) === "manual" ? "manual" as const : "post-test" as const,
    createdAt: (attendance.created_at as string) ?? new Date().toISOString(),
  }));

  const normalizedNotifications: NotificationRecord[] = notificationsResponse.error
    ? []
    : (notificationsResponse.data ?? []).map((notification) => ({
        id: notification.id as string,
        title: (notification.title as string | null) ?? "",
        message: (notification.message as string | null) ?? "",
        targetBranchId: (notification.target_branch_code as BranchId | null) ?? null,
        targetLoginIds: Array.isArray((notification as { target_login_ids?: unknown }).target_login_ids)
          ? ((notification as { target_login_ids?: string[] }).target_login_ids ?? []).filter(Boolean)
          : [],
        createdAt: (notification.created_at as string | null) ?? new Date().toISOString(),
        createdByName: (notification.created_by_name as string | null) ?? undefined,
        createdByRole: (notification.created_by_role as UserRole | null) ?? undefined,
      }));

  const normalizedSatisfactionQuestions: SatisfactionQuestion[] = isMissingRelationError(satisfactionQuestionsResponse.error ?? { message: "" }, "satisfaction_questions")
    ? []
    : (satisfactionQuestionsResponse.data ?? []).map((q) => ({
        id: q.id as string,
        courseId: ((q as Record<string, unknown>).course_id as string | null) ?? "",
        prompt: q.prompt as string,
        type: (q.type as string) === "text" ? "text" : "rating",
        isRequired: Boolean(q.is_required),
        sortOrder: (q.sort_order as number) ?? 0,
        createdAt: (q.created_at as string) ?? new Date().toISOString(),
      }));

  const normalizedSatisfactionResponses: SatisfactionResponse[] = (satisfactionResponsesResponse.data ?? []).map((r) => ({
    id: (r as Record<string, unknown>).id as string,
    courseId: (r as Record<string, unknown>).course_id as string,
    questionId: (r as Record<string, unknown>).question_id as string,
    loginCode: (r as Record<string, unknown>).login_code as string,
    studentName: (r as Record<string, unknown>).student_name as string,
    ratingValue: ((r as Record<string, unknown>).rating_value as number | null) ?? null,
    textValue: ((r as Record<string, unknown>).text_value as string | null) ?? "",
    submittedAt: ((r as Record<string, unknown>).submitted_at as string) ?? new Date().toISOString(),
  }));

  return {
    roles: dashboardRoles,
    branches: branches.length > 0
      ? branches.map((branch) => ({ id: branch.code as BranchId, label: branch.name as string }))
      : defaultBranches,
    students: normalizedStudents,
    reciters: normalizedReciters,
    courses: normalizedCourses,
    taskTemplates: normalizedTaskTemplates,
    submissions: normalizedSubmissions,
    attendance: normalizedAttendance,
    notifications: normalizedNotifications,
    satisfactionQuestions: normalizedSatisfactionQuestions,
    satisfactionResponses: normalizedSatisfactionResponses,
    finalExamQuestions: finalExamData.questions,
    finalExamSubmissions: finalExamData.submissions,
    finalExamSettings: finalExamData.settings,
    rolePermissions,
  };
};

export const addStudentToDatabase = async (student: Omit<StudentRecord, "id" | "completedParts" | "createdAt" | "isCertified">) => {
  const { data, error } = await supabase.rpc("create_student_account", {
    student_name: student.name.trim(),
    student_login_code: student.loginId.trim(),
    student_branch_code: student.branchId,
    student_note: student.note,
  });

  if (error) {
    throw error;
  }

  if (typeof data === "string" && data) {
    return data;
  }

  throw new Error("تعذر حفظ الطالب في قاعدة البيانات.");
};

export const addDashboardAccountToDatabase = async (input: { name: string; loginCode: string; role: Extract<UserRole, "admin" | "male_manager" | "female_manager"> }) => {
  const trimmedName = input.name.trim();
  const trimmedLoginCode = input.loginCode.trim();

  if (!trimmedName || !trimmedLoginCode) {
    throw new Error("أدخل الاسم ورقم الدخول.");
  }

  const createDashboardAccountResponse = await supabase.rpc("create_dashboard_account", {
    account_name: trimmedName,
    account_login_code: trimmedLoginCode,
    account_role: input.role,
  });
  const fallbackAdminResponse = createDashboardAccountResponse.error && input.role === "admin" && isMissingRpcSignatureError(createDashboardAccountResponse.error, "create_dashboard_account")
    ? await supabase.rpc("create_admin_account", {
        admin_name: trimmedName,
        admin_login_code: trimmedLoginCode,
      })
    : createDashboardAccountResponse;
  const { error } = fallbackAdminResponse;

  if (error) {
    throw error;
  }
};

export const addAdminToDatabase = async (input: { name: string; loginCode: string }) => addDashboardAccountToDatabase({ ...input, role: "admin" });

export const getDashboardAccountsFromDatabase = async (): Promise<DatabaseDashboardAccount[]> => {
  const listDashboardAccountsResponse = await supabase.rpc("list_dashboard_accounts");
  const fallbackAdminsResponse = listDashboardAccountsResponse.error && isMissingRpcSignatureError(listDashboardAccountsResponse.error, "list_dashboard_accounts")
    ? await supabase.rpc("list_admin_accounts")
    : listDashboardAccountsResponse;
  const { data, error } = fallbackAdminsResponse;

  if (error) {
    throw error;
  }

  return (data ?? []).map((account) => ({
    id: account.id as string,
    name: account.full_name as string,
    loginCode: (account.login_code as string | null) ?? "",
    role: ((account.role as UserRole | null) ?? "admin"),
  }));
};

export const getAdminsFromDatabase = async (): Promise<DatabaseDashboardAccount[]> => getDashboardAccountsFromDatabase();

export const deleteDashboardAccountFromDatabase = async (accountId: string) => {
  const deleteDashboardAccountResponse = await supabase.rpc("delete_dashboard_account", {
    target_account_id: accountId,
  });
  const fallbackAdminResponse = deleteDashboardAccountResponse.error && isMissingRpcSignatureError(deleteDashboardAccountResponse.error, "delete_dashboard_account")
    ? await supabase.rpc("delete_admin_account", {
        target_admin_id: accountId,
      })
    : deleteDashboardAccountResponse;
  const { error } = fallbackAdminResponse;

  if (error) {
    throw error;
  }
};

export const deleteAdminFromDatabase = async (adminId: string) => deleteDashboardAccountFromDatabase(adminId);

export const updateStudentInDatabase = async (studentId: string, updates: Partial<Omit<StudentRecord, "id">>) => {
  const payload: Record<string, unknown> = {};

  if (typeof updates.name === "string") {
    payload.full_name = updates.name;
  }

  if (typeof updates.loginId === "string") {
    payload.login_code = updates.loginId;
  }

  if (typeof updates.note === "string") {
    payload.note = updates.note;
  }

  if (typeof updates.isCertified === "boolean") {
    payload.is_certified = updates.isCertified;
  }

  if (updates.branchId) {
    payload.branch_id = await resolveBranchId(updates.branchId);
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase.from("students").update(payload).eq("id", studentId);

    if (error) {
      throw error;
    }
  }

  if (updates.completedParts) {
    const { error: deleteError } = await supabase.from("student_parts").delete().eq("student_id", studentId);

    if (deleteError) {
      throw deleteError;
    }

    if (updates.completedParts.length > 0) {
      const { error: insertError } = await supabase.from("student_parts").insert(
        updates.completedParts.map((partNumber) => ({ student_id: studentId, part_number: partNumber })),
      );

      if (insertError) {
        throw insertError;
      }
    }
  }
};

export const deleteStudentFromDatabase = async (studentId: string) => {
  const { error } = await supabase.from("students").delete().eq("id", studentId);

  if (error) {
    throw error;
  }
};

export const addCourseToDatabase = async (
  title: string,
  isActive: boolean,
  options?: {
    entityType?: RecordEntityType;
    taskMode?: TaskMode | null;
    taskTemplateId?: string;
    taskTemplateName?: string;
    taskTemplateContent?: string;
    youtubeUrl?: string;
  },
) => {
  if (isActive && options?.entityType !== "task") {
    const { error: resetError } = await supabase.from("courses").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");

    if (resetError) {
      throw resetError;
    }
  }

  const { data, error } = await supabase
    .from("courses")
    .insert({
      title,
      entity_type: options?.entityType ?? "course",
      task_mode: options?.taskMode ?? null,
      task_template_id: options?.taskTemplateId || null,
      task_template_name: options?.taskTemplateName ?? "",
      task_template_content: options?.taskTemplateContent ?? "",
      youtube_url: options?.youtubeUrl ?? "",
      is_active: options?.entityType === "task" ? false : isActive,
      is_pre_enabled: true,
      is_post_enabled: true,
      is_tasks_enabled: false,
    })
    .select("id, entity_type, task_mode, task_template_id, task_template_name, task_template_content, youtube_url, created_at, is_pre_enabled, is_post_enabled, is_tasks_enabled, male_pre_enabled, female_pre_enabled, male_post_enabled, female_post_enabled, male_tasks_enabled, female_tasks_enabled, assessment_windows, assessment_notification_templates")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id as string,
    entityType: ((data.entity_type as RecordEntityType | null) ?? "course") === "task" ? "task" : "course",
    createdAt: (data.created_at as string) ?? new Date().toISOString(),
    isPreEnabled: (data.is_pre_enabled as boolean | null) ?? true,
    isPostEnabled: (data.is_post_enabled as boolean | null) ?? true,
    isTasksEnabled: (data.is_tasks_enabled as boolean | null) ?? true,
    branchAvailability: normalizeCourseBranchAvailability({
      male: {
        pre: (data.male_pre_enabled as boolean | null) ?? true,
        post: (data.male_post_enabled as boolean | null) ?? true,
        tasks: (data.male_tasks_enabled as boolean | null) ?? true,
      },
      female: {
        pre: (data.female_pre_enabled as boolean | null) ?? true,
        post: (data.female_post_enabled as boolean | null) ?? true,
        tasks: (data.female_tasks_enabled as boolean | null) ?? true,
      },
    }),
    assessmentWindows: normalizeAssessmentWindows((data.assessment_windows as CourseAssessmentWindows | null) ?? undefined),
    assessmentNotificationTemplates: normalizeAssessmentNotificationTemplates((data.assessment_notification_templates as CourseAssessmentTemplates | null) ?? undefined),
    taskMode: (data.task_mode as TaskMode | null) ?? null,
    taskTemplateId: (data.task_template_id as string | null) ?? "",
    taskTemplateName: (data.task_template_name as string | null) ?? "",
    taskTemplateContent: (data.task_template_content as string | null) ?? "",
    youtubeUrl: (data.youtube_url as string | null) ?? "",
  };
};

export const updateCourseInDatabase = async (courseId: string, updates: Partial<Omit<CourseRecord, "id" | "createdAt">>) => {
  const payload: Record<string, unknown> = {};

  if (typeof updates.title === "string") {
    payload.title = updates.title;
  }

  if (updates.entityType) {
    payload.entity_type = updates.entityType;
  }

  if (typeof updates.isActive === "boolean") {
    payload.is_active = updates.isActive;
  }

  if (typeof updates.isPreEnabled === "boolean") {
    payload.is_pre_enabled = updates.isPreEnabled;
  }

  if (typeof updates.isPostEnabled === "boolean") {
    payload.is_post_enabled = updates.isPostEnabled;
  }

  if (typeof updates.isTasksEnabled === "boolean") {
    payload.is_tasks_enabled = updates.isTasksEnabled;
  }

  if (updates.branchAvailability) {
    payload.male_pre_enabled = updates.branchAvailability.male.pre;
    payload.female_pre_enabled = updates.branchAvailability.female.pre;
    payload.male_post_enabled = updates.branchAvailability.male.post;
    payload.female_post_enabled = updates.branchAvailability.female.post;
    payload.male_tasks_enabled = updates.branchAvailability.male.tasks;
    payload.female_tasks_enabled = updates.branchAvailability.female.tasks;
  }

  if (updates.assessmentWindows) {
    payload.assessment_windows = updates.assessmentWindows;
  }

  if (updates.assessmentNotificationTemplates) {
    payload.assessment_notification_templates = updates.assessmentNotificationTemplates;
  }

  if (updates.taskMode !== undefined) {
    payload.task_mode = updates.taskMode;
  }

  if (typeof updates.taskTemplateId === "string") {
    payload.task_template_id = updates.taskTemplateId || null;
  }

  if (typeof updates.taskTemplateName === "string") {
    payload.task_template_name = updates.taskTemplateName;
  }

  if (typeof updates.taskTemplateContent === "string") {
    payload.task_template_content = updates.taskTemplateContent;
  }

  if (typeof updates.youtubeUrl === "string") {
    payload.youtube_url = updates.youtubeUrl;
  }

  if (Object.keys(payload).length === 0) {
    return;
  }

  const { error } = await supabase.from("courses").update(payload).eq("id", courseId);

  if (error) {
    throw error;
  }
};

export const deleteCourseFromDatabase = async (courseId: string) => {
  const { error } = await supabase.from("courses").delete().eq("id", courseId);

  if (error) {
    throw error;
  }
};

export const updateCoursesSortOrderInDatabase = async (orderedIds: string[]) => {
  const updates = orderedIds.map((id, index) =>
    supabase.from("courses").update({ sort_order: index }).eq("id", id),
  );
  await Promise.all(updates);
};

export const activateCourseInDatabase = async (courseId: string, settings?: { pre: boolean; post: boolean; tasks: boolean }) => {
  const { error: resetError } = await supabase.from("courses").update({ is_active: false }).neq("id", courseId);

  if (resetError) {
    throw resetError;
  }

  const { error } = await supabase
    .from("courses")
    .update({
      is_active: true,
      ...(settings
        ? {
            is_pre_enabled: settings.pre,
            is_post_enabled: settings.post,
            is_tasks_enabled: settings.tasks,
          }
        : {}),
    })
    .eq("id", courseId);

  if (error) {
    throw error;
  }
};

export const deactivateAllCoursesInDatabase = async () => {
  const { error } = await supabase.from("courses").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    throw error;
  }
};

export const addQuestionToDatabase = async (courseId: string, assessmentType: AssessmentType, question: Omit<CourseQuestion, "id">) => {
  const existingQuestions = await supabase
    .from("course_questions")
    .select("id")
    .eq("course_id", courseId)
    .eq("assessment_type", assessmentType);

  if (existingQuestions.error) {
    throw existingQuestions.error;
  }

  const sortOrder = existingQuestions.data?.length ?? 0;
  const dbQuestionType = question.type === "truefalse" ? "multiple" : question.type;
  const dbOptions = question.type === "truefalse" ? ["صح", "خطأ"] : question.options;
  const { data, error } = await supabase
    .from("course_questions")
    .insert({
      course_id: courseId,
      assessment_type: assessmentType,
      question_type: dbQuestionType,
      prompt: question.prompt,
      options: dbOptions,
      allow_file: question.allowFile,
      points: question.points,
      correct_answer: question.correctAnswer,
      attachment_name: question.attachmentName ?? "",
      attachment_type: question.attachmentType ?? "",
      attachment_data_url: question.attachmentDataUrl ?? "",
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
};

export const deleteQuestionFromDatabase = async (questionId: string) => {
  const { error } = await supabase.from("course_questions").delete().eq("id", questionId);

  if (error) {
    throw error;
  }
};

export const submitAssessmentToDatabase = async (
  courseId: string,
  assessmentType: AssessmentType,
  submission: {
    studentName: string;
    loginId: string;
    answers: SubmissionAnswer[];
  },
) => {
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("login_code", submission.loginId)
    .maybeSingle();

  const { data: existingSubmissions, error: existingSubmissionError } = await supabase
    .from("course_submissions")
    .select("id")
    .eq("course_id", courseId)
    .eq("assessment_type", assessmentType)
    .eq("login_code", submission.loginId)
    .order("submitted_at", { ascending: false })
    .limit(1);

  if (existingSubmissionError) {
    throw existingSubmissionError;
  }

  if ((existingSubmissions?.length ?? 0) > 0) {
    throw new Error("تم إرسال هذا الاختبار مسبقًا، ولا يمكن إعادة الاختبار مرة أخرى.");
  }

  const { data: insertedSubmission, error: submissionError } = await supabase
    .from("course_submissions")
    .insert({
      course_id: courseId,
      assessment_type: assessmentType,
      student_id: (student?.id as string | undefined) ?? null,
      student_name: submission.studentName,
      login_code: submission.loginId,
    })
    .select("id, submitted_at")
    .single();

  if (submissionError) {
    throw submissionError;
  }

  if (submission.answers.length > 0) {
    const { error: answersError } = await supabase.from("course_submission_answers").insert(
      submission.answers
        .filter((answer) => answer.questionId !== "__score_override__")
        .map((answer) => ({
          submission_id: insertedSubmission.id,
          question_id: answer.questionId,
          answer_text: answer.value,
          file_name: answer.fileName ?? null,
          file_type: answer.fileType ?? null,
          file_data_url: answer.fileDataUrl ?? null,
        })),
    );

    if (answersError) {
      throw answersError;
    }
  }

  return {
    id: insertedSubmission.id as string,
    submittedAt: (insertedSubmission.submitted_at as string) ?? new Date().toISOString(),
  };
};

/**
 * Bulk upsert student submissions for a given course+assessmentType.
 * Any existing submission for the same (course, assessmentType, loginCode) is deleted first,
 * then a fresh one is inserted with the provided answers.
 * This allows admins to overwrite previously submitted answers (e.g. when importing from Excel).
 */
export const bulkUpsertSubmissionsToDatabase = async (
  courseId: string,
  assessmentType: AssessmentType,
  submissions: Array<{
    studentName: string;
    loginId: string;
    answers: SubmissionAnswer[];
    manualScore?: number | null;
  }>,
): Promise<Array<{ id: string; submittedAt: string; loginId: string }>> => {
  if (submissions.length === 0) {
    return [];
  }

  const dedupedByLogin = new Map<string, {
    studentName: string;
    loginId: string;
    answers: SubmissionAnswer[];
    manualScore?: number | null;
  }>();

  for (const submission of submissions) {
    dedupedByLogin.set(submission.loginId, submission);
  }

  const normalizedSubmissions = [...dedupedByLogin.values()];
  const loginIds = normalizedSubmissions.map((submission) => submission.loginId);
  const actionableSubmissions = normalizedSubmissions.filter((submission) => {
    const hasManualScore = typeof submission.manualScore === "number" && Number.isFinite(submission.manualScore) && submission.manualScore >= 0;
    const hasAnswers = submission.answers.some((answer) => answer.questionId !== "__score_override__" && Boolean(answer.value?.trim() || answer.fileDataUrl));
    return hasManualScore || hasAnswers;
  });

  /* 1) delete existing submissions for these students in one batch */
  const { data: existingSubmissions, error: existingError } = await supabase
    .from("course_submissions")
    .select("id, login_code")
    .eq("course_id", courseId)
    .eq("assessment_type", assessmentType)
    .in("login_code", loginIds);

  if (existingError) throw existingError;

  const existingIds = (existingSubmissions ?? []).map((submission) => submission.id as string);
  if (existingIds.length > 0) {
    const { error: deleteAnswersError } = await supabase
      .from("course_submission_answers")
      .delete()
      .in("submission_id", existingIds);
    if (deleteAnswersError) throw deleteAnswersError;

    const { error: deleteSubmissionsError } = await supabase
      .from("course_submissions")
      .delete()
      .eq("course_id", courseId)
      .eq("assessment_type", assessmentType)
      .in("login_code", loginIds);
    if (deleteSubmissionsError) throw deleteSubmissionsError;
  }

  if (actionableSubmissions.length === 0) {
    return [];
  }

  /* 2) resolve student ids in one batch */
  const { data: studentRows, error: studentsError } = await supabase
    .from("students")
    .select("id, login_code")
    .in("login_code", actionableSubmissions.map((submission) => submission.loginId));
  if (studentsError) throw studentsError;

  const studentIdByLogin = new Map<string, string>();
  for (const row of studentRows ?? []) {
    studentIdByLogin.set(row.login_code as string, row.id as string);
  }

  /* 3) insert submissions in one batch */
  const submissionsPayload = actionableSubmissions.map((submission) => ({
    course_id: courseId,
    assessment_type: assessmentType,
    student_id: studentIdByLogin.get(submission.loginId) ?? null,
    student_name: submission.studentName,
    login_code: submission.loginId,
    manual_score:
      typeof submission.manualScore === "number" && Number.isFinite(submission.manualScore)
        ? submission.manualScore
        : null,
  }));

  let insertedSubmissionsResponse = await supabase
    .from("course_submissions")
    .insert(submissionsPayload)
    .select("id, submitted_at, login_code");

  if (insertedSubmissionsResponse.error && isMissingFieldError(insertedSubmissionsResponse.error, "manual_score")) {
    insertedSubmissionsResponse = await supabase
      .from("course_submissions")
      .insert(submissionsPayload.map(({ manual_score, ...rest }) => rest))
      .select("id, submitted_at, login_code");
  }

  if (insertedSubmissionsResponse.error) throw insertedSubmissionsResponse.error;
  const insertedSubmissions = insertedSubmissionsResponse.data;

  const insertedByLogin = new Map<string, { id: string; submittedAt: string }>();
  for (const row of insertedSubmissions ?? []) {
    insertedByLogin.set(row.login_code as string, {
      id: row.id as string,
      submittedAt: (row.submitted_at as string) ?? new Date().toISOString(),
    });
  }

  /* 4) insert all answers in one batch */
  const answersToInsert = normalizedSubmissions.flatMap((submission) => {
    const inserted = insertedByLogin.get(submission.loginId);
    if (!inserted) return [];
    // Filter out __score_override__ — it's in-memory only; DB uses manual_score column
    return submission.answers
      .filter((answer) => answer.questionId !== "__score_override__")
      .map((answer) => ({
        submission_id: inserted.id,
        question_id: answer.questionId,
        answer_text: answer.value,
        file_name: answer.fileName ?? null,
        file_type: answer.fileType ?? null,
        file_data_url: answer.fileDataUrl ?? null,
      }));
  });

  if (answersToInsert.length > 0) {
    const { error: insertAnswersError } = await supabase
      .from("course_submission_answers")
      .insert(answersToInsert);
    if (insertAnswersError) throw insertAnswersError;
  }

  return normalizedSubmissions
    .map((submission) => {
      const inserted = insertedByLogin.get(submission.loginId);
      if (!inserted) return null;
      return {
        id: inserted.id,
        submittedAt: inserted.submittedAt,
        loginId: submission.loginId,
      };
    })
    .filter((item): item is { id: string; submittedAt: string; loginId: string } => item !== null);
};

export const setManualAttendanceInDatabase = async (
  courseId: string,
  presentStudents: Array<{ loginId: string; studentName: string; studentId: string | null }>,
) => {
  // Delete all existing attendance records for this course
  const { error: deleteError } = await supabase
    .from("course_attendance")
    .delete()
    .eq("course_id", courseId);
  if (deleteError) throw deleteError;

  if (presentStudents.length === 0) return;

  const { error: insertError } = await supabase
    .from("course_attendance")
    .insert(
      presentStudents.map((student) => ({
        course_id: courseId,
        student_id: student.studentId,
        student_name: student.studentName,
        login_code: student.loginId,
        source: "manual",
      })),
    );
  if (insertError) throw insertError;
};

export const resetDashboardDataInDatabase = async () => {
  const deletionSteps = [
    () => supabase.from("course_attendance").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("course_submission_answers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("course_submissions").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("course_questions").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("task_templates").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("courses").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("student_parts").delete().neq("part_number", 0),
    () => supabase.from("reciter_students").delete().neq("reciter_id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("reciters").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("students").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from("users").delete().eq("role", "reciter"),
  ];

  for (const step of deletionSteps) {
    const { error } = await step();

    if (error) {
      throw error;
    }
  }
};

const resolveBranchId = async (branchCode: BranchId) => {
  const { data, error } = await supabase.rpc("get_branch_id_by_code", {
    branch_code: branchCode,
  });

  if (error) {
    throw error;
  }

  if (typeof data === "string" && data) {
    return data;
  }

  throw new Error(`تعذر تحديد الفرع ${branchCode} من قاعدة البيانات.`);
};

const syncStudentToDatabase = async (student: Pick<StudentRecord, "name" | "loginId" | "branchId" | "note" | "completedParts">) => {
  const branchId = await resolveBranchId(student.branchId);
  const isEmptySingleResult = (message?: string) =>
    typeof message === "string" && message.includes("Cannot coerce the result to a single JSON object") && message.includes("0 rows");

  const { data, error } = await supabase
    .from("students")
    .upsert(
      {
        full_name: student.name,
        login_code: student.loginId,
        branch_id: branchId,
        note: student.note,
      },
      { onConflict: "login_code" },
    )
    .select("id")
    .maybeSingle();

  if (error && !isEmptySingleResult(error.message)) {
    throw error;
  }

  let studentId = data?.id as string | undefined;

  if (!studentId) {
    const { data: existingStudent, error: existingStudentError } = await supabase
      .from("students")
      .select("id")
      .eq("login_code", student.loginId)
      .maybeSingle();

    if (existingStudentError) {
      throw existingStudentError;
    }

    if (!existingStudent?.id) {
      throw new Error("تمت مزامنة الطالب ولكن لم يتم العثور على معرفه في قاعدة البيانات.");
    }

    studentId = existingStudent.id as string;
  }

  const { error: deletePartsError } = await supabase.from("student_parts").delete().eq("student_id", studentId);

  if (deletePartsError) {
    throw deletePartsError;
  }

  if (student.completedParts.length > 0) {
    const { error: insertPartsError } = await supabase.from("student_parts").insert(
      student.completedParts.map((partNumber) => ({
        student_id: studentId,
        part_number: partNumber,
      })),
    );

    if (insertPartsError) {
      throw insertPartsError;
    }
  }

  return studentId;
};

export const saveReciterToDatabase = async (input: {
  currentLoginCode?: string;
  name: string;
  branchId: BranchId;
  loginCode: string;
  linkedStudents: Array<Pick<StudentRecord, "name" | "loginId" | "branchId" | "note" | "completedParts">>;
}) => {
  const nextLoginCode = input.loginCode.trim();
  const currentLoginCode = input.currentLoginCode?.trim();
  const linkedStudentIds = await Promise.all(input.linkedStudents.map((student) => syncStudentToDatabase(student)));
  const nextBranchCode = input.branchId.trim();
  const saveReciterWithBranchResponse = await supabase.rpc("save_reciter_account", {
    current_login_code: currentLoginCode ?? null,
    reciter_name: input.name,
    reciter_login_code: nextLoginCode,
    reciter_branch_code: nextBranchCode,
  });
  const saveReciterResponse = saveReciterWithBranchResponse.error && isMissingRpcSignatureError(saveReciterWithBranchResponse.error, "save_reciter_account")
    ? await supabase.rpc("save_reciter_account", {
        current_login_code: currentLoginCode ?? null,
        reciter_name: input.name,
        reciter_login_code: nextLoginCode,
      })
    : saveReciterWithBranchResponse;
  const { data: reciterId, error: saveReciterError } = saveReciterResponse;

  if (saveReciterError) {
    throw saveReciterError;
  }

  if (typeof reciterId !== "string" || !reciterId) {
    throw new Error("تعذر حفظ حساب المقرئ في قاعدة البيانات.");
  }

  const { error: deleteRelationsError } = await supabase.from("reciter_students").delete().eq("reciter_id", reciterId);

  if (deleteRelationsError) {
    throw deleteRelationsError;
  }

  if (linkedStudentIds.length === 0) {
    return;
  }

  const { error: insertRelationError } = await supabase
    .from("reciter_students")
    .insert(linkedStudentIds.map((studentId) => ({ reciter_id: reciterId, student_id: studentId })));

  if (insertRelationError) {
    throw insertRelationError;
  }
};

export const deleteReciterFromDatabase = async (loginCode: string) => {
  const trimmedCode = loginCode.trim();

  if (!trimmedCode) {
    return;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("login_code", trimmedCode)
    .eq("role", "reciter")
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return;
  }

  const { data: reciter, error: reciterError } = await supabase
    .from("reciters")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (reciterError) {
    throw reciterError;
  }

  if (reciter?.id) {
    const { error: deleteRelationsError } = await supabase.from("reciter_students").delete().eq("reciter_id", reciter.id);

    if (deleteRelationsError) {
      throw deleteRelationsError;
    }

    const { error: deleteReciterError } = await supabase.from("reciters").delete().eq("id", reciter.id);

    if (deleteReciterError) {
      throw deleteReciterError;
    }
  }

  const { error: deleteUserError } = await supabase.from("users").delete().eq("id", user.id);

  if (deleteUserError) {
    throw deleteUserError;
  }
};

export const getReciterAccountByLoginCodeFromDatabase = async (loginCode: string): Promise<DatabaseReciterAccount | null> => {
  const trimmedCode = loginCode.trim();

  if (!trimmedCode) {
    return null;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, full_name, login_code")
    .eq("login_code", trimmedCode)
    .eq("role", "reciter")
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return null;
  }

  const { data: reciter, error: reciterError } = await supabase
    .from("reciters")
    .select("id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (reciterError) {
    throw reciterError;
  }

  if (!reciter) {
    return {
      id: user.id as string,
      name: (user.full_name as string) ?? "",
      loginCode: (user.login_code as string) ?? trimmedCode,
      students: [],
    };
  }

  const { data: branches, error: branchesError } = await supabase.from("branches").select("id, code");

  if (branchesError) {
    throw branchesError;
  }

  const branchCodeById = new Map((branches ?? []).map((branch) => [branch.id as string, branch.code as BranchId]));

  const { data: relations, error: relationsError } = await supabase
    .from("reciter_students")
    .select("student_id")
    .eq("reciter_id", reciter.id);

  if (relationsError) {
    throw relationsError;
  }

  const studentIds = (relations ?? []).map((relation) => relation.student_id as string);

  if (studentIds.length === 0) {
    return {
      id: reciter.id as string,
      name: (reciter.full_name as string) ?? (user.full_name as string) ?? "",
      loginCode: (user.login_code as string) ?? trimmedCode,
      students: [],
    };
  }

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, full_name, login_code, note, branch_id")
    .in("id", studentIds);

  if (studentsError) {
    throw studentsError;
  }

  const { data: parts, error: partsError } = await supabase
    .from("student_parts")
    .select("student_id, part_number")
    .in("student_id", studentIds);

  if (partsError) {
    throw partsError;
  }

  const partsByStudentId = new Map<string, number[]>();

  for (const part of parts ?? []) {
    const studentId = part.student_id as string;
    const current = partsByStudentId.get(studentId) ?? [];
    current.push(part.part_number as number);
    partsByStudentId.set(studentId, current);
  }

  return {
    id: reciter.id as string,
    name: (reciter.full_name as string) ?? (user.full_name as string) ?? "",
    loginCode: (user.login_code as string) ?? trimmedCode,
    students: (students ?? [])
      .map((student) => ({
        id: student.id as string,
        name: student.full_name as string,
        loginId: student.login_code as string,
        branchId: branchCodeById.get(student.branch_id as string) ?? "male",
        note: (student.note as string) ?? "",
        completedParts: [...(partsByStudentId.get(student.id as string) ?? [])].sort((left, right) => left - right),
      }))
      .sort((left, right) => right.completedParts.length - left.completedParts.length || left.name.localeCompare(right.name, "ar")),
  };
};

export const toggleStudentPartInDatabase = async (input: {
  studentId: string;
  reciterId: string;
  partNumber: number;
  shouldMarkComplete: boolean;
}) => {
  if (input.shouldMarkComplete) {
    const { error } = await supabase.from("student_parts").upsert(
      {
        student_id: input.studentId,
        part_number: input.partNumber,
        marked_by_reciter_id: input.reciterId,
      },
      { onConflict: "student_id,part_number" },
    );

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from("student_parts")
    .delete()
    .eq("student_id", input.studentId)
    .eq("part_number", input.partNumber);

  if (error) {
    throw error;
  }
};

export const transferStudentToReciterInDatabase = async (input: {
  studentId: string;
  targetReciterId: string;
}) => {
  const trimmedStudentId = input.studentId.trim();
  const trimmedTargetReciterId = input.targetReciterId.trim();

  if (!trimmedStudentId || !trimmedTargetReciterId) {
    throw new Error("بيانات النقل غير مكتملة.");
  }

  const { error: deleteRelationsError } = await supabase
    .from("reciter_students")
    .delete()
    .eq("student_id", trimmedStudentId);

  if (deleteRelationsError) {
    throw deleteRelationsError;
  }

  const { error: insertRelationError } = await supabase
    .from("reciter_students")
    .insert({ reciter_id: trimmedTargetReciterId, student_id: trimmedStudentId });

  if (insertRelationError) {
    throw insertRelationError;
  }
};

export const getStudentAssignedReciterByLoginCodeFromDatabase = async (loginCode: string): Promise<DatabaseStudentReciter | null> => {
  const trimmedCode = loginCode.trim();

  if (!trimmedCode) {
    return null;
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("login_code", trimmedCode)
    .maybeSingle();

  if (studentError) {
    throw studentError;
  }

  if (!student?.id) {
    return null;
  }

  const { data: relation, error: relationError } = await supabase
    .from("reciter_students")
    .select("reciter_id")
    .eq("student_id", student.id)
    .limit(1)
    .maybeSingle();

  if (relationError) {
    throw relationError;
  }

  if (!relation?.reciter_id) {
    return null;
  }

  const { data: reciter, error: reciterError } = await supabase
    .from("reciters")
    .select("id, full_name, user_id")
    .eq("id", relation.reciter_id)
    .maybeSingle();

  if (reciterError) {
    throw reciterError;
  }

  if (!reciter?.id) {
    return null;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("login_code, full_name")
    .eq("id", reciter.user_id)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  return {
    id: reciter.id as string,
    name: (reciter.full_name as string) ?? (user?.full_name as string) ?? "",
    loginCode: (user?.login_code as string) ?? "",
  };
};

export const addTaskTemplateToDatabase = async (input: { name: string; content: string }) => {
  const { data, error } = await supabase
    .from("task_templates")
    .insert({ name: input.name.trim(), content: input.content })
    .select("id, created_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id as string,
    createdAt: (data.created_at as string | null) ?? new Date().toISOString(),
  };
};

export const updateTaskTemplateInDatabase = async (templateId: string, updates: Partial<Omit<TaskTemplateRecord, "id" | "createdAt">>) => {
  const payload: Record<string, unknown> = {};

  if (typeof updates.name === "string") {
    payload.name = updates.name.trim();
  }

  if (typeof updates.content === "string") {
    payload.content = updates.content;
  }

  if (Object.keys(payload).length === 0) {
    return;
  }

  const { error } = await supabase.from("task_templates").update(payload).eq("id", templateId);

  if (error) {
    throw error;
  }
};

export const deleteTaskTemplateFromDatabase = async (templateId: string) => {
  const { error } = await supabase.from("task_templates").delete().eq("id", templateId);

  if (error) {
    throw error;
  }
};

export const addNotificationToDatabase = async (notification: Omit<NotificationRecord, "id" | "createdAt">) => {
  let response = await supabase
    .from("notifications")
    .insert({
      title: notification.title,
      message: notification.message,
      target_branch_code: notification.targetBranchId,
      target_login_ids: notification.targetLoginIds ?? [],
      created_by_name: notification.createdByName ?? null,
      created_by_role: notification.createdByRole ?? null,
    })
    .select("id, created_at")
    .single();

  if (response.error && isMissingColumnError(response.error, "target_login_ids")) {
    response = await supabase
      .from("notifications")
      .insert({
        title: notification.title,
        message: notification.message,
        target_branch_code: notification.targetBranchId,
        created_by_name: notification.createdByName ?? null,
        created_by_role: notification.createdByRole ?? null,
      })
      .select("id, created_at")
      .single();
  }

  if (response.error) {
    throw response.error;
  }

  return {
    id: response.data.id as string,
    createdAt: (response.data.created_at as string | null) ?? new Date().toISOString(),
  };
};

export const deleteNotificationFromDatabase = async (notificationId: string) => {
  const { error } = await supabase.from("notifications").delete().eq("id", notificationId);

  if (error) {
    throw error;
  }
};

export const addSatisfactionQuestionToDatabase = async (input: { courseId: string; prompt: string; type: "rating" | "text"; isRequired: boolean; sortOrder: number }) => {
  const { data, error } = await supabase
    .from("satisfaction_questions")
    .insert({ course_id: input.courseId, prompt: input.prompt.trim(), type: input.type, is_required: input.isRequired, sort_order: input.sortOrder })
    .select("id, created_at")
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id as string, createdAt: (data.created_at as string | null) ?? new Date().toISOString() };
};

export const deleteSatisfactionQuestionFromDatabase = async (questionId: string) => {
  const { error } = await supabase.from("satisfaction_questions").delete().eq("id", questionId);

  if (error) {
    throw error;
  }
};

export const submitSatisfactionResponsesToDatabase = async (responses: Array<{ courseId: string; questionId: string; loginCode: string; studentName: string; ratingValue: number | null; textValue: string }>) => {
  const rows = responses.map((r) => ({
    course_id: r.courseId,
    question_id: r.questionId,
    login_code: r.loginCode,
    student_name: r.studentName,
    rating_value: r.ratingValue,
    text_value: r.textValue || null,
  }));

  const { data, error } = await supabase
    .from("satisfaction_responses")
    .upsert(rows, { onConflict: "course_id,question_id,login_code" })
    .select("id, course_id, question_id, login_code");

  if (error) {
    throw error;
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    courseId: r.course_id as string,
    questionId: r.question_id as string,
    loginCode: r.login_code as string,
  }));
};

// ── Final Exam ─────────────────────────────────────────────────────────────

export const loadFinalExamDataFromDatabase = async (): Promise<{
  questions: FinalExamQuestion[];
  submissions: FinalExamSubmission[];
  settings: { male: { isEnabled: boolean; closesAt: string | null }; female: { isEnabled: boolean; closesAt: string | null } };
}> => {
  const [settingsRes, questionsRes, submissionsRes, answersRes] = await Promise.all([
    supabase.from("final_exam_settings").select("branch_code, is_enabled, closes_at"),
    supabase.from("final_exam_questions").select("id, branch_code, question_type, prompt, options, allow_file, points, correct_answer, attachment_name, attachment_type, attachment_data_url, sort_order, created_at").order("sort_order"),
    supabase.from("final_exam_submissions").select("id, branch_code, student_name, login_code, manual_score, submitted_at"),
    supabase.from("final_exam_submission_answers").select("id, submission_id, question_id, answer_text, file_name, file_type, file_data_url"),
  ]);

  const settings = {
    male: { isEnabled: false, closesAt: null as string | null },
    female: { isEnabled: false, closesAt: null as string | null },
  };
  for (const row of settingsRes.data ?? []) {
    const code = row.branch_code as string;
    if (code === "male" || code === "female") {
      settings[code] = {
        isEnabled: Boolean(row.is_enabled),
        closesAt: (row.closes_at as string | null) ?? null,
      };
    }
  }

  const questions: FinalExamQuestion[] = (questionsRes.data ?? []).map((q) => {
    const rawOptions = q.options as unknown;
    const options: string[] = Array.isArray(rawOptions) ? (rawOptions as string[]).filter(Boolean) : [];
    const qType = (q.question_type as string) === "text" ? "text" : "multiple";
    const isTrueFalse = qType === "multiple" && options.length === 2 && options.every((o) => o === "صح" || o === "خطأ");
    return {
      id: q.id as string,
      branchCode: (q.branch_code as string) === "female" ? "female" : "male",
      type: isTrueFalse ? "truefalse" : qType,
      prompt: q.prompt as string,
      options,
      allowFile: Boolean(q.allow_file),
      points: (q.points as number) ?? 1,
      correctAnswer: (q.correct_answer as string) ?? "",
      attachmentName: (q.attachment_name as string) ?? "",
      attachmentType: (q.attachment_type as string) ?? "",
      attachmentDataUrl: (q.attachment_data_url as string) ?? "",
      sortOrder: (q.sort_order as number) ?? 0,
      createdAt: (q.created_at as string) ?? new Date().toISOString(),
    };
  });

  const answersBySubmissionId = new Map<string, SubmissionAnswer[]>();
  for (const a of answersRes.data ?? []) {
    const sid = a.submission_id as string;
    const current = answersBySubmissionId.get(sid) ?? [];
    current.push({ questionId: a.question_id as string, value: (a.answer_text as string) ?? "", fileName: (a.file_name as string | null) ?? undefined, fileType: (a.file_type as string | null) ?? undefined, fileDataUrl: (a.file_data_url as string | null) ?? undefined });
    answersBySubmissionId.set(sid, current);
  }

  const submissions: FinalExamSubmission[] = (submissionsRes.data ?? []).map((s) => ({
    id: s.id as string,
    branchCode: (s.branch_code as string) === "female" ? "female" : "male",
    studentName: s.student_name as string,
    loginCode: s.login_code as string,
    manualScore: (s.manual_score as number | null) ?? null,
    answers: answersBySubmissionId.get(s.id as string) ?? [],
    submittedAt: (s.submitted_at as string) ?? new Date().toISOString(),
  }));

  return { questions, submissions, settings };
};

export const addFinalExamQuestionToDatabase = async (branchCode: BranchId, question: { prompt: string; type: "multiple" | "text" | "truefalse"; options: string[]; allowFile: boolean; points: number; correctAnswer: string; sortOrder: number }) => {
  const { data, error } = await supabase
    .from("final_exam_questions")
    .insert({
      branch_code: branchCode,
      question_type: question.type === "truefalse" ? "multiple" : question.type,
      prompt: question.prompt.trim(),
      options: question.type === "truefalse" ? ["صح", "خطأ"] : question.options,
      allow_file: question.allowFile,
      points: question.points,
      correct_answer: question.correctAnswer,
      sort_order: question.sortOrder,
    })
    .select("id, created_at")
    .single();

  if (error) throw error;
  return { id: data.id as string, createdAt: (data.created_at as string) ?? new Date().toISOString() };
};

export const deleteFinalExamQuestionFromDatabase = async (id: string) => {
  const { error } = await supabase.from("final_exam_questions").delete().eq("id", id);
  if (error) throw error;
};

export const toggleFinalExamEnabledInDatabase = async (branchCode: BranchId, isEnabled: boolean, closesAt: string | null) => {
  const { error } = await supabase
    .from("final_exam_settings")
    .upsert({ branch_code: branchCode, is_enabled: isEnabled, closes_at: closesAt }, { onConflict: "branch_code" });
  if (error) throw error;
};

export const submitFinalExamToDatabase = async (submission: { branchCode: BranchId; studentName: string; loginCode: string; answers: SubmissionAnswer[] }) => {
  const { data: existingCheck } = await supabase.from("final_exam_submissions").select("id").eq("login_code", submission.loginCode).maybeSingle();
  if (existingCheck?.id) throw new Error("تم إرسال الاختبار النهائي مسبقًا.");

  const { data: inserted, error: subError } = await supabase
    .from("final_exam_submissions")
    .insert({ branch_code: submission.branchCode, student_name: submission.studentName, login_code: submission.loginCode })
    .select("id, submitted_at")
    .single();
  if (subError) throw subError;

  if (submission.answers.length > 0) {
    const { error: answersError } = await supabase.from("final_exam_submission_answers").insert(
      submission.answers.filter((a) => a.questionId !== "__score_override__").map((a) => ({
        submission_id: inserted.id,
        question_id: a.questionId,
        answer_text: a.value,
        file_name: a.fileName ?? null,
        file_type: a.fileType ?? null,
        file_data_url: a.fileDataUrl ?? null,
      })),
    );
    if (answersError) throw answersError;
  }

  return { id: inserted.id as string, submittedAt: (inserted.submitted_at as string) ?? new Date().toISOString() };
};

export const copyFinalExamQuestionsInDatabase = async (from: BranchId, to: BranchId, move: boolean) => {
  const { data: sourceQuestions, error } = await supabase
    .from("final_exam_questions")
    .select("question_type, prompt, options, allow_file, points, correct_answer, attachment_name, attachment_type, attachment_data_url, sort_order")
    .eq("branch_code", from)
    .order("sort_order");
  if (error) throw error;

  if ((sourceQuestions ?? []).length === 0) return;

  // Delete existing destination questions
  await supabase.from("final_exam_questions").delete().eq("branch_code", to);

  // Insert copies
  const { error: insertError } = await supabase.from("final_exam_questions").insert(
    (sourceQuestions ?? []).map((q) => ({ ...q, branch_code: to })),
  );
  if (insertError) throw insertError;

  if (move) {
    await supabase.from("final_exam_questions").delete().eq("branch_code", from);
  }
};

export const setFinalExamManualScoreInDatabase = async (submissionId: string, score: number | null) => {
  const { error } = await supabase.from("final_exam_submissions").update({ manual_score: score }).eq("id", submissionId);
  if (error) throw error;
};

// ─── Role Permissions ───────────────────────────────────────────────────────

export const loadRolePermissionsFromDatabase = async (): Promise<Record<string, Record<string, boolean>>> => {
  const { data, error } = await supabase.from("role_permissions").select("role, permission_key, is_enabled");
  if (error) { console.warn("[supabase] role_permissions load failed:", error.message); return {}; }
  const result: Record<string, Record<string, boolean>> = { male_manager: {}, female_manager: {} };
  for (const row of data ?? []) {
    if (!result[row.role]) result[row.role] = {};
    result[row.role][row.permission_key] = row.is_enabled;
  }
  return result;
};

export const setRolePermissionInDatabase = async (role: string, key: string, isEnabled: boolean) => {
  const { error } = await supabase.from("role_permissions").upsert({ role, permission_key: key, is_enabled: isEnabled }, { onConflict: "role,permission_key" });
  if (error) throw error;
};

export const savePushSubscription = async (loginCode: string, subscription: PushSubscriptionJSON) => {
  const endpoint = subscription.endpoint ?? "";
  const p256dh = (subscription.keys as Record<string, string> | undefined)?.p256dh ?? "";
  const auth = (subscription.keys as Record<string, string> | undefined)?.auth ?? "";

  if (!endpoint || !p256dh || !auth) {
    return;
  }

  // Keep one device endpoint tied to one login code only.
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .neq("login_code", loginCode);

  await supabase.from("push_subscriptions").upsert(
    { login_code: loginCode, endpoint, p256dh, auth },
    { onConflict: "login_code,endpoint" },
  );
};

export const deletePushSubscription = async (loginCode: string, endpoint: string) => {
  if (!loginCode || !endpoint) {
    return;
  }

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("login_code", loginCode)
    .eq("endpoint", endpoint);
};