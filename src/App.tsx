import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ACCESS_SESSION_SYNC_EVENT, DashboardStoreProvider, loadAccessSession } from "./lib/dashboard-store.ts";
import { usePushNotifications } from "./hooks/use-push-notifications.tsx";
import { Button } from "@/components/ui/button";

const CoursePage = lazy(() => import("./pages/CoursePage.tsx"));
const FinalExamPage = lazy(() => import("./pages/FinalExamPage.tsx"));
const AdminAssessmentPage = lazy(() => import("./pages/AdminAssessmentPage.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const ReciterPage = lazy(() => import("./pages/ReciterPage.tsx"));
const StudentPage = lazy(() => import("./pages/StudentPage.tsx"));
const TasksPage = lazy(() => import("./pages/TasksPage.tsx"));
const TraineePage = lazy(() => import("./pages/TraineePage.tsx"));

const queryClient = new QueryClient();

const withDashboardStore = (element: JSX.Element) => (
  <DashboardStoreProvider>{element}</DashboardStoreProvider>
);

const PushNotificationManager = () => {
  const [session, setSession] = useState(() => loadAccessSession());

  useEffect(() => {
    const syncSession = () => {
      setSession(loadAccessSession());
    };

    window.addEventListener("storage", syncSession);
    window.addEventListener(ACCESS_SESSION_SYNC_EVENT, syncSession as EventListener);

    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener(ACCESS_SESSION_SYNC_EVENT, syncSession as EventListener);
    };
  }, []);

  const loginCode = session?.role === "student" ? session.loginCode : null;
  const { showPrompt, handleAllow, handleDismiss } = usePushNotifications(loginCode);

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-primary/20 bg-white px-5 py-4 shadow-[0_8px_32px_rgba(13,111,143,0.15)]">
      <p className="text-sm font-bold text-foreground">تفعيل الإشعارات</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">هل تريد أن تصلك إشعارات فورية عند وصول تنبيه جديد؟</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" className="rounded-xl" onClick={handleDismiss}>لاحقًا</Button>
        <Button size="sm" className="rounded-xl" onClick={() => void handleAllow()}>موافق</Button>
      </div>
    </div>
  );
};

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-transition">
      <Suspense fallback={<PageLoadingScreen />}>
        <Routes location={location}>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={withDashboardStore(<Dashboard />)} />
          <Route path="/dashboard/course/pre" element={withDashboardStore(<AdminAssessmentPage assessmentType="pre" />)} />
          <Route path="/dashboard/course/post" element={withDashboardStore(<AdminAssessmentPage assessmentType="post" />)} />
          <Route path="/dashboard/course/tasks" element={withDashboardStore(<AdminAssessmentPage assessmentType="tasks" />)} />
          <Route path="/reciter" element={withDashboardStore(<ReciterPage />)} />
          <Route path="/student" element={withDashboardStore(<StudentPage />)} />
          <Route path="/tasks" element={withDashboardStore(<TasksPage />)} />
          <Route path="/trainee" element={withDashboardStore(<TraineePage />)} />
          <Route path="/course" element={withDashboardStore(<CoursePage assessmentType="pre" />)} />
          <Route path="/course/pre" element={withDashboardStore(<CoursePage assessmentType="pre" />)} />
          <Route path="/course/post" element={withDashboardStore(<CoursePage assessmentType="post" />)} />
          <Route path="/course/tasks" element={withDashboardStore(<TasksPage />)} />
          <Route path="/final-exam" element={withDashboardStore(<FinalExamPage />)} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
};

const PageLoadingScreen = () => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[linear-gradient(180deg,#f8fbfb,#eef5f5)]">
    <div className="page-loader" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnimatedRoutes />
        <PushNotificationManager />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
