import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import ReciterPage from "@/pages/ReciterPage";
import type { DashboardData } from "@/lib/dashboard-store";

const seedData: DashboardData = {
  roles: [
    { id: "admin", label: "مدير عام" },
    { id: "reciter", label: "مقرئ" },
    { id: "student", label: "طالب" },
  ],
  branches: [
    { id: "male", label: "معلمين" },
    { id: "female", label: "معلمات" },
  ],
  students: [
    {
      id: "student-1",
      name: "طالب منقول",
      loginId: "3001",
      branchId: "male",
      note: "",
      completedParts: [1, 2],
    },
  ],
  reciters: [
    {
      id: "reciter-1",
      name: "مقرئ أول",
      loginCode: "r1",
      branchId: "male",
      studentIds: ["student-1"],
    },
    {
      id: "reciter-2",
      name: "مقرئ ثان",
      loginCode: "r2",
      branchId: "male",
      studentIds: [],
    },
  ],
  courses: [],
  taskTemplates: [],
  submissions: [],
  attendance: [],
  notifications: [],
};

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
  getReciterAccountByLoginCodeFromDatabase: vi.fn(async () => ({
    id: "reciter-1",
    name: "مقرئ أول",
    loginCode: "r1",
    branchId: "male",
    students: [
      {
        id: "student-1",
        name: "طالب منقول",
        loginId: "3001",
        branchId: "male",
        note: "",
        completedParts: [1, 2],
      },
    ],
  })),
  loadDashboardDataFromDatabase: vi.fn(async () => seedData),
  resetDashboardDataInDatabase: vi.fn(async () => undefined),
  submitAssessmentToDatabase: vi.fn(async () => ({ id: "submission-db-1", submittedAt: new Date().toISOString() })),
  toggleStudentPartInDatabase: vi.fn(async () => undefined),
  updateCourseInDatabase: vi.fn(async () => undefined),
  updateStudentInDatabase: vi.fn(async () => undefined),
  updateTaskTemplateInDatabase: vi.fn(async () => undefined),
}));

describe("reciter transfer ui", () => {
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

  it("opens the transfer dialog from the dashboard reciters tab", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /الإقراء/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /طالب منقول/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /طالب منقول/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("نقل الطالب")).toBeInTheDocument();
    });
  });

  it("shows a transfer button in the reciter page and opens the transfer dialog", async () => {
    window.localStorage.setItem(
      "mmars-access-session",
      JSON.stringify({
        role: "reciter",
        redirectPath: "/reciter?login=r1",
        loginCode: "r1",
        name: "مقرئ أول",
        branchId: "male",
      }),
    );

    render(
      <MemoryRouter initialEntries={["/reciter?login=r1"]}>
        <Routes>
          <Route path="/reciter" element={<ReciterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /طالب منقول/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /طالب منقول/i }));

    await waitFor(() => {
      expect(screen.getByText("نقل الطالب")).toBeInTheDocument();
    });
  });
});
