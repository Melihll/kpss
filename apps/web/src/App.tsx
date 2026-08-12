import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";

const AppShell = lazy(() => import("./components/layout/AppShell").then((module) => ({ default: module.AppShell })));
const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const WeekPage = lazy(() => import("./pages/WeekPage").then((module) => ({ default: module.WeekPage })));
const RoadmapPage = lazy(() => import("./pages/RoadmapPage").then((module) => ({ default: module.RoadmapPage })));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage").then((module) => ({ default: module.ResourcesPage })));
const ProgressPage = lazy(() => import("./pages/ProgressPage").then((module) => ({ default: module.ProgressPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage").then((module) => ({ default: module.OnboardingPage })));

function RouteFallback() {
  return <main className="route-fallback" aria-label="Sayfa yükleniyor"><span /><span /><div /></main>;
}

export function App() {
  return <Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="week" element={<WeekPage />} />
        <Route path="roadmap" element={<RoadmapPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;
}
