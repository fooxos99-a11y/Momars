import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import type { DashboardData } from "@/lib/dashboard-store";

vi.mock("@/lib/supabase", () => ({
  addDashboardAccountToDatabase: vi.fn(async () => ({ id: "admin-1", createdAt: new Date().toISOString() })),
  deleteDashboardAccountFromDatabase: vi.fn(async () => undefined),
  deleteReciterFromDatabase: vi.fn(async () => undefined),
  getDashboardAccountsFromDatabase: vi.fn(async () => []),
  saveReciterToDatabase: vi.fn(async () => undefined),
  transferStudentToReciterInDatabase: vi.fn(async () => undefined),
  activateCourseInDatabase: vi.fn(async () => undefined),
  addCourseToDatabase: vi.fn(async () => ({ id: "course-1", createdAt: new Date().toISOString() })),
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
      name: "طالب النتائج",
      loginId: "2001",
      branchId: "male",
      note: "",
      completedParts: [],
    },
  ],
  reciters: [],
  courses: [
    {
      id: "course-1",
      title: "دورة نتائج",
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
      postQuestions: [],
      taskQuestions: [],
      createdAt: new Date().toISOString(),
    },
  ],
  taskTemplates: [],
  submissions: [],
  attendance: [
    {
      id: "attendance-1",
      courseId: "course-1",
      studentName: "طالب النتائج",
      loginId: "2001",
      source: "post-test",
      createdAt: new Date().toISOString(),
    },
  ],
  notifications: [],
};

describe("dashboard results attendance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "mmars-access-session",
      JSON.stringify({
        role: "admin",
        redirectPath: "/dashboard",
        loginCode: "1483",
        name: "مدير عام",
        branchId: null,
      }),
    );
  });

  it("shows post attendance records as present in the results page", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /النتائج/i }));

    await waitFor(() => {
      expect(screen.getByText("الحاضرين: 1")).toBeInTheDocument();
    });

    expect(screen.getByText("طالب النتائج")).toBeInTheDocument();
    expect(screen.getByText("حاضر")).toBeInTheDocument();
  });
});