import { lazy, Suspense, useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import MainLayout from "./components/layout/MainLayout";
import Onboarding from "./pages/auth/Onboarding";
import LegalPage from "./pages/legal/LegalPage";

const CreatorDashboard = lazy(() => import("./pages/creator/CreatorDashboard"));
const MaterialsPage = lazy(() => import("./pages/creator/MaterialsPage"));
const TopicWorkspace = lazy(() => import("./pages/creator/TopicWorkspace"));
const StyleProfilePage = lazy(() => import("./pages/creator/StyleProfilePage"));
const NoteDetail = lazy(() => import("./pages/editor/NoteDetail"));
const Trash = lazy(() => import("./pages/features/Trash"));

function PageFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        color: "var(--text-secondary)",
      }}
    >
      加载中...
    </div>
  );
}

function App() {
  const { checkAuth, isAuthenticated, isLoading, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading) {
      const isPublic =
        location.pathname.startsWith("/auth") ||
        location.pathname.startsWith("/legal");
      if (!isAuthenticated && !isPublic) {
        navigate("/auth/login");
      } else if (
        isAuthenticated &&
        !user?.onboardingCompletedAt &&
        location.pathname !== "/onboarding" &&
        !location.pathname.startsWith("/legal/")
      ) {
        navigate("/onboarding");
      } else if (
        isAuthenticated &&
        user?.onboardingCompletedAt &&
        (location.pathname.startsWith("/auth") ||
          location.pathname === "/onboarding")
      ) {
        navigate("/");
      }
    }
  }, [
    isAuthenticated,
    isLoading,
    navigate,
    location.pathname,
    user?.onboardingCompletedAt,
  ]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          width: "100vw",
        }}
      >
        加载中...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/register" element={<Register />} />
      <Route path="/legal/terms" element={<LegalPage type="terms" />} />
      <Route path="/legal/privacy" element={<LegalPage type="privacy" />} />
      <Route
        path="/onboarding"
        element={
          isAuthenticated ? <Onboarding /> : <Navigate to="/auth/login" />
        }
      />

      <Route
        path="/"
        element={
          isAuthenticated ? <MainLayout /> : <Navigate to="/auth/login" />
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<PageFallback />}>
              <CreatorDashboard />
            </Suspense>
          }
        />
        <Route
          path="materials"
          element={
            <Suspense fallback={<PageFallback />}>
              <MaterialsPage />
            </Suspense>
          }
        />
        <Route
          path="style-profile"
          element={
            <Suspense fallback={<PageFallback />}>
              <StyleProfilePage />
            </Suspense>
          }
        />
        <Route
          path="n/:id"
          element={
            <Suspense fallback={<PageFallback />}>
              <NoteDetail key={location.pathname} />
            </Suspense>
          }
        />
        <Route
          path="editor/:id"
          element={
            <Suspense fallback={<PageFallback />}>
              <NoteDetail key={location.pathname} />
            </Suspense>
          }
        />
        <Route
          path="trash"
          element={
            <Suspense fallback={<PageFallback />}>
              <Trash />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<PageFallback />}>
              <CreatorDashboard />
            </Suspense>
          }
        />
      </Route>
      <Route
        path="/topics/:id"
        element={
          isAuthenticated ? (
            <Suspense fallback={<PageFallback />}>
              <TopicWorkspace />
            </Suspense>
          ) : (
            <Navigate to="/auth/login" />
          )
        }
      />
    </Routes>
  );
}

export default App;
