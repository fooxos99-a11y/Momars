import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardStore, type DashboardData } from "@/lib/dashboard-store";

vi.mock("@/lib/supabase", () => ({
  activateCourseInDatabase: vi.fn(async () => undefined),
  addCourseToDatabase: vi.fn(async () => ({
    id: "course-1",
    entityType: "course",
    createdAt: new Date().toISOString(),
    isPreEnabled: true,
    isPostEnabled: true,
    isTasksEnabled: true,
    branchAvailability: {
      male: { pre: true, post: true, tasks: true },
      female: { pre: true, post: true, tasks: true },
    },
    assessmentWindows: { global: {}, male: {}, female: {} },
    assessmentNotificationTemplates: { pre: "", post: "", tasks: "" },
    taskMode: null,
    taskTemplateId: "",
    taskTemplateName: "",
    taskTemplateContent: "",
  })),
  addNotificationToDatabase: vi.fn(async () => ({ id: "notification-1", createdAt: new Date().toISOString() })),
  addQuestionToDatabase: vi.fn(async () => "question-1"),
  addStudentToDatabase: vi.fn(async () => "student-1"),
  addTaskTemplateToDatabase: vi.fn(async () => ({ id: "template-1", createdAt: new Date().toISOString() })),
  deactivateAllCoursesInDatabase: vi.fn(async () => undefined),
  deleteCourseFromDatabase: vi.fn(async () => undefined),
  deleteNotificationFromDatabase: vi.fn(async () => undefined),
  deleteQuestionFromDatabase: vi.fn(async () => undefined),
  deleteStudentFromDatabase: vi.fn(async () => undefined),
  deleteTaskTemplateFromDatabase: vi.fn(async () => undefined),
  loadDashboardDataFromDatabase: vi.fn(async () => seedData),
  resetDashboardDataInDatabase: vi.fn(async () => undefined),
  saveReciterToDatabase: vi.fn(async () => undefined),
  submitAssessmentToDatabase: vi.fn(async () => ({ id: "submission-db-1", submittedAt: new Date().toISOString() })),
  toggleStudentPartInDatabase: vi.fn(async () => undefined),
  updateCourseInDatabase: vi.fn(async () => undefined),
  updateStudentInDatabase: vi.fn(async () => undefined),
  updateTaskTemplateInDatabase: vi.fn(async () => undefined),
}));

const seedData: DashboardData = {
  roles: [
    { id: "admin", label: "مدير عام" },
    { id: "student", label: "طالب" },
  ],
  branches: [
    { id: "male", label: "معلمين" },
    { id: "female", label: "معلمات" },
  ],
  students: [
    {
      id: "student-1",
      name: "طالب تجريبي",
      loginId: "1001",
      branchId: "male",
      note: "",
      completedParts: [],
    },
  ],
  reciters: [],
  courses: [
    {
      id: "course-1",
      title: "دورة اختبار",
      entityType: "course",
      isActive: true,
      isPreEnabled: true,
      isPostEnabled: true,
      isTasksEnabled: true,
      branchAvailability: {
        male: { pre: true, post: true, tasks: true },
        female: { pre: true, post: true, tasks: true },
      },
      assessmentWindows: { global: {}, male: {}, female: {} },
      assessmentNotificationTemplates: { pre: "", post: "", tasks: "" },
      taskMode: null,
      taskTemplateId: "",
      taskTemplateName: "",
      taskTemplateContent: "",
      preQuestions: [],
      postQuestions: [
        {
          id: "question-1",
          prompt: "سؤال بعدي",
          type: "text",
          options: [],
          allowFile: false,
          points: 1,
          correctAnswer: "",
        },
      ],
      taskQuestions: [],
      createdAt: new Date().toISOString(),
    },
  ],
  taskTemplates: [],
  submissions: [],
  attendance: [],
  notifications: [],
};

describe("post attendance", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does not create attendance when the post-test is submitted", async () => {
    const { result } = renderHook(() => useDashboardStore());

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true);
    });

    await act(async () => {
      await result.current.submitAssessment("course-1", "post", {
        studentName: "طالب تجريبي",
        loginId: "1001",
        answers: [{ questionId: "question-1", value: "إجابة" }],
      });
    });

    await waitFor(() => {
      expect(result.current.data.submissions).toHaveLength(1);
    });

    expect(result.current.data.attendance).toHaveLength(0);
  });
});