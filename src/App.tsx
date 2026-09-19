import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TeamProvider } from "@/contexts/TeamContext";
import { MainLayout } from "@/components/layout/MainLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import Families from "./pages/Families";
import Events from "./pages/Events";
import Attendance from "./pages/Attendance";
import Reports from "./pages/Reports";
import FollowUp from "./pages/FollowUp";
import TeamsManagement from "./pages/TeamsManagement";
import AutomationsDashboard from "./pages/automations/AutomationsDashboard";
import CelebrationWishes from "./pages/automations/CelebrationWishes";
import AnalyticsEmail from "./pages/automations/AnalyticsEmail";
import AutomationLogs from "./pages/automations/AutomationLogs";
import NotFound from "./pages/NotFound";

// Face recognition pulls in TensorFlow.js, so it is loaded on demand rather
// than in the main bundle that every page pays for.
const LiveAttendance = lazy(() => import("./pages/LiveAttendance"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
    Loading...
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TeamProvider>
      {/* One provider for the whole app. Radix only coordinates "close the
          others" within a single provider, so nesting one per component let
          several tooltips stay open at once. disableHoverableContent stops a
          tooltip lingering when the pointer drifts onto it. */}
      <TooltipProvider delayDuration={250} skipDelayDuration={500} disableHoverableContent>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/members" element={<Members />} />
              <Route path="/families" element={<Families />} />
              <Route path="/events" element={<Events />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route
                path="/attendance/live"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <LiveAttendance />
                  </Suspense>
                }
              />
              <Route path="/reports" element={<Reports />} />
              <Route path="/follow-up" element={<FollowUp />} />
              <Route path="/teams" element={<TeamsManagement />} />
              <Route path="/automations" element={<AutomationsDashboard />} />
              <Route path="/automations/wishes" element={<CelebrationWishes />} />
              <Route path="/automations/analytics" element={<AnalyticsEmail />} />
              <Route path="/automations/logs" element={<AutomationLogs />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </TeamProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
