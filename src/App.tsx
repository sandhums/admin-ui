import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import AdminConfigPage from "./pages/AdminConfigPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import BedBoardPage from "./pages/BedBoardPage";
import LoginPage from "./pages/LoginPage";
import AuthErrorPage from "./pages/AuthErrorPage";
import OpdWorkflowPage from "./pages/OpdWorkflowPage";
import SchedulingBoardPage from "./pages/SchedulingBoardPage";
import RequireAuth from "./components/RequireAuth";
import RequirePermission from "./components/RequirePermission";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <OpdWorkflowPage />
              </RequireAuth>
            }
          />
          <Route
            path="/scheduling"
            element={
              <RequireAuth>
                <SchedulingBoardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/beds"
            element={
              <RequireAuth>
                <BedBoardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <RequireAuth>
                <RequirePermission permission="user:manage">
                  <AdminRolesPage />
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <RequirePermission permission="user:manage">
                  <AdminUsersPage />
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequirePermission permission="config:read">
                  <AdminConfigPage />
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/error" element={<AuthErrorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
