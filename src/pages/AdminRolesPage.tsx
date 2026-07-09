import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAuthzPermissions,
  listAuthzRoles,
  setAuthzRolePermissions,
  type AdminPermissionSummary,
  type AdminRoleSummary,
} from "../api/authz";
import { BffError } from "../api/bff";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../context/AuthContext";

function formatLoadError(err: unknown): string {
  if (err instanceof BffError) {
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export default function AdminRolesPage() {
  const { refresh } = useAuth();
  const [roles, setRoles] = useState<AdminRoleSummary[]>([]);
  const [permissions, setPermissions] = useState<AdminPermissionSummary[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftPermissionCodes, setDraftPermissionCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => roles.find((r) => r.role_id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const [rolesRes, permissionsRes] = await Promise.all([
        listAuthzRoles(),
        listAuthzPermissions(),
      ]);
      setRoles(rolesRes.roles);
      setPermissions(permissionsRes.permissions);
      setSelectedRoleId((current) => {
        if (current && rolesRes.roles.some((r) => r.role_id === current)) {
          return current;
        }
        return rolesRes.roles[0]?.role_id ?? null;
      });
    } catch (err) {
      setError(formatLoadError(err));
      setRoles([]);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedRole) {
      setDraftPermissionCodes([]);
      return;
    }
    setDraftPermissionCodes([...selectedRole.permissions].sort());
    setFeedback(null);
  }, [selectedRole]);

  function togglePermission(code: string) {
    setDraftPermissionCodes((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code].sort(),
    );
  }

  async function onSavePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await setAuthzRolePermissions(selectedRole.role_id, draftPermissionCodes);
      setRoles((prev) =>
        prev.map((r) => (r.role_id === result.role.role_id ? result.role : r)),
      );
      setFeedback(result.message);
      await refresh();
    } catch (err) {
      setError(formatLoadError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout
      title="Roles & permissions"
      subtitle="Edit which permissions each application role grants in auth_db"
    >
      <section className="card config-meta">
        <h2>How this works</h2>
        <ul className="config-simple-list">
          <li>
            Permissions define what actions a user can perform (e.g. <code>appointment:book</code>).
          </li>
          <li>
            Roles bundle permissions. Users inherit permissions from all roles assigned to them.
          </li>
          <li>
            Saving replaces the full permission set for the selected role in <strong>auth_db</strong>.
          </li>
          <li>
            Users with this role must sign out and sign in again for permission changes to apply.
          </li>
        </ul>
        <p>
          <Link to="/admin/users">User role assignments</Link>
          {" · "}
          <Link to="/admin">Hospital configuration</Link>
        </p>
      </section>

      {loading ? <p className="muted">Loading roles and permissions…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {feedback ? <p className="ok">{feedback}</p> : null}

      {!loading && roles.length > 0 ? (
        <div className="admin-users-grid">
          <section className="card">
            <h2>Application roles</h2>
            <table className="config-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Permissions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr
                    key={role.role_id}
                    className={role.role_id === selectedRoleId ? "row-selected" : undefined}
                  >
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setSelectedRoleId(role.role_id)}
                      >
                        {role.name}
                      </button>
                      <div className="muted">
                        <code>{role.code}</code>
                        {role.persona ? ` · persona ${role.persona}` : null}
                      </div>
                    </td>
                    <td>
                      {role.permissions.length > 0 ? role.permissions.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {selectedRole ? (
            <section className="card">
              <h2>Edit permissions — {selectedRole.name}</h2>
              {selectedRole.description ? (
                <p className="muted">{selectedRole.description}</p>
              ) : null}

              <div className="role-checklist">
                {permissions.map((permission) => (
                  <label key={permission.permission_id} className="inline-check role-check">
                    <input
                      type="checkbox"
                      checked={draftPermissionCodes.includes(permission.code)}
                      disabled={saving}
                      onChange={() => togglePermission(permission.code)}
                    />
                    <span>
                      <strong>
                        <code>{permission.code}</code>
                      </strong>
                      <span className="muted"> — {permission.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="row">
                <button type="button" disabled={saving} onClick={() => void onSavePermissions()}>
                  {saving ? "Saving…" : `Save permissions for ${selectedRole.code}`}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </AdminLayout>
  );
}
