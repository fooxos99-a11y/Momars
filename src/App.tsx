import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import CoursePage from "./pages/CoursePage.tsx";
import AdminAssessmentPage from "./pages/AdminAssessmentPage.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ReciterPage from "./pages/ReciterPage.tsx";
import StudentPage from "./pages/StudentPage.tsx";
import TasksPage from "./pages/TasksPage.tsx";
import TraineePage from "./pages/TraineePage.tsx";
import { ACCESS_SESSION_SYNC_EVENT, loadAccessSession } from "./lib/dashboard-store.ts";
import { usePushNotifications } from "./hooks/use-push-notifications.tsx";
import { Button } from "@/components/ui/button";

const queryClient = new QueryClient();

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
      <Routes location={location}>
        <Route path="/" element={<Index />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/course/pre" element={<AdminAssessmentPage assessmentType="pre" />} />
        <Route path="/dashboard/course/post" element={<AdminAssessmentPage assessmentType="post" />} />
        <Route path="/dashboard/course/tasks" element={<AdminAssessmentPage assessmentType="tasks" />} />
        <Route path="/reciter" element={<ReciterPage />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/trainee" element={<TraineePage />} />
        <Route path="/course" element={<CoursePage assessmentType="pre" />} />
        <Route path="/course/pre" element={<CoursePage assessmentType="pre" />} />
        <Route path="/course/post" element={<CoursePage assessmentType="post" />} />
        <Route path="/course/tasks" element={<TasksPage />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};

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
