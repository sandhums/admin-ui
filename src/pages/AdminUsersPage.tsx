import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAuthzUser,
  listAuthzHospitals,
  listAuthzRoles,
  listAuthzUsers,
  setAuthzUserRoles,
  type AdminRoleSummary,
  type AdminUserSummary,
  type AdminHospitalSummary,
} from "../api/authz";
import { BffError } from "../api/bff";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../context/AuthContext";

function userLabel(user: AdminUserSummary) {
  return user.display_name ?? user.email ?? user.user_id.slice(0, 8);
}

function roleCodesForScope(user: AdminUserSummary, hospitalId: string | null) {
  return user.roles
    .filter((r) => (hospitalId ? r.hospital_id === hospitalId : !r.hospital_id))
    .map((r) => r.code);
}

function formatRoleAssignment(code: string, hospitalId?: string, kind?: string) {
  if (!hospitalId) return code;
  const suffix = kind ? `${kind}: ${hospitalId}` : hospitalId;
  return `${code} @ ${suffix}`;
}

function orgUnitLabel(unit: AdminHospitalSummary): string {
  return `${unit.name} (${unit.kind}: ${unit.id})`;
}

function hospitalsFromUserRoles(users: AdminUserSummary[]): AdminHospitalSummary[] {
  const ids = new Set<string>();
  for (const user of users) {
    for (const role of user.roles) {
      if (role.hospital_id) {
        ids.add(role.hospital_id);
      }
    }
  }
  return [...ids]
    .sort()
    .map((id) => ({ id, name: id, kind: "unknown", active: true }));
}

function formatLoadError(err: unknown): string {
  if (err instanceof BffError) {
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

function summarizeUserRoles(user: AdminUserSummary) {
  const orgWide = roleCodesForScope(user, null);
  const byHospital = new Map<string, string[]>();
  for (const role of user.roles) {
    if (!role.hospital_id) continue;
    const list = byHospital.get(role.hospital_id) ?? [];
    list.push(role.code);
    byHospital.set(role.hospital_id, list);
  }
  return { orgWide, byHospital };
}

export default function AdminUsersPage() {
  const { refresh } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [roles, setRoles] = useState<AdminRoleSummary[]>([]);
  const [hospitals, setHospitals] = useState<AdminHospitalSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [scopeHospitalId, setScopeHospitalId] = useState<string | null>(null);
  const [draftRoleCodes, setDraftRoleCodes] = useState<string[]>([]);
  const [previewPermissions, setPreviewPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((u) => u.user_id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const scopeLabel = useMemo(() => {
    if (!scopeHospitalId) return "Organization-wide";
    const unit = hospitals.find((h) => h.id === scopeHospitalId);
    return unit ? orgUnitLabel(unit) : scopeHospitalId;
  }, [scopeHospitalId, hospitals]);

  const hospitalKindById = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of hospitals) {
      map.set(unit.id, unit.kind);
    }
    return map;
  }, [hospitals]);

  const otherScopeRoles = useMemo(() => {
    if (!selectedUser) return [];
    return selectedUser.roles
      .filter((r) =>
        scopeHospitalId ? !r.hospital_id || r.hospital_id !== scopeHospitalId : !!r.hospital_id,
      )
      .map((r) =>
        formatRoleAssignment(r.code, r.hospital_id, hospitalKindById.get(r.hospital_id ?? "")),
      );
  }, [selectedUser, scopeHospitalId, hospitalKindById]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([listAuthzUsers(), listAuthzRoles()]);
      setUsers(usersRes.users);
      setRoles(rolesRes.roles);
      setSelectedUserId((current) => {
        if (current && usersRes.users.some((u) => u.user_id === current)) {
          return current;
        }
        return usersRes.users[0]?.user_id ?? null;
      });

      try {
        const hospitalsRes = await listAuthzHospitals();
        setHospitals(hospitalsRes.hospitals);
      } catch (hospitalErr) {
        const fallback = hospitalsFromUserRoles(usersRes.users);
        setHospitals(fallback);
        if (fallback.length === 0) {
          setError(
            `Could not load org units (${formatLoadError(hospitalErr)}). Restart the BFF after resetting auth_db, then refresh.`,
          );
        } else {
          setFeedback(
            `Org unit list unavailable (${formatLoadError(hospitalErr)}). Using org units from existing role assignments.`,
          );
        }
      }
    } catch (err) {
      setError(formatLoadError(err));
      setUsers([]);
      setRoles([]);
      setHospitals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedUser) {
      setDraftRoleCodes([]);
      setPreviewPermissions([]);
      return;
    }
    setDraftRoleCodes(roleCodesForScope(selectedUser, scopeHospitalId));
    setFeedback(null);
  }, [selectedUser, scopeHospitalId]);

  useEffect(() => {
    if (!selectedUser) {
      setPreviewPermissions([]);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    void getAuthzUser(selectedUser.user_id, { hospitalId: scopeHospitalId })
      .then((user) => {
        if (!cancelled) {
          setPreviewPermissions(user.permissions);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewPermissions(selectedUser.permissions);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUser, scopeHospitalId]);

  function toggleRole(code: string) {
    setDraftRoleCodes((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code].sort(),
    );
  }

  async function onSaveRoles() {
    if (!selectedUser) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await setAuthzUserRoles(selectedUser.user_id, draftRoleCodes, {
        hospitalId: scopeHospitalId,
      });
      setUsers((prev) =>
        prev.map((u) => (u.user_id === result.user.user_id ? result.user : u)),
      );
      setPreviewPermissions(result.user.permissions);
      setFeedback(result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout
      title="Users & roles"
      subtitle="Assign application roles in the authorization database"
    >
      <section className="card config-meta">
        <h2>How this works</h2>
        <ul className="config-simple-list">
          <li>
            Demo staff (<code>frontdesk.demo</code>, <code>dr.demo</code>, etc.) are pre-seeded;
            other users appear after their first sign-in (JIT provisioning from Keycloak).
          </li>
          <li>
            Role changes update <strong>auth_db</strong> only — not Keycloak passwords or realm roles.
          </li>
          <li>
            Choose a scope (organization-wide or an org unit — hospital, department, ward, zone) —
            save replaces roles for that scope only.
          </li>
          <li>Keycloak persona roles (e.g. front desk, doctor) are re-added on the user&apos;s next login.</li>
          <li>The affected user must sign out and sign in again for permissions to refresh.</li>
        </ul>
        <p>
          <Link to="/admin/roles">Roles &amp; permissions</Link>
          {" · "}
          <Link to="/admin">Hospital configuration</Link>
        </p>
      </section>

      {loading ? <p className="muted">Loading users and roles…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {feedback ? <p className="ok">{feedback}</p> : null}

      {!loading && users.length === 0 && !error ? (
        <section className="card">
          <p className="muted">
            No staff users yet. Have <code>frontdesk.demo</code>, <code>dr.demo</code>, etc. sign in
            once, then return here.
          </p>
        </section>
      ) : null}

      {!loading && users.length > 0 ? (
        <div className="admin-users-grid">
          <section className="card">
            <h2>Staff users</h2>
            <table className="config-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const summary = summarizeUserRoles(user);
                  return (
                    <tr
                      key={user.user_id}
                      className={user.user_id === selectedUserId ? "row-selected" : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setSelectedUserId(user.user_id)}
                        >
                          {userLabel(user)}
                        </button>
                        {user.email ? <div className="muted">{user.email}</div> : null}
                      </td>
                      <td>
                        {summary.orgWide.length > 0 ? (
                          <div>Org: {summary.orgWide.join(", ")}</div>
                        ) : (
                          <div className="muted">Org: —</div>
                        )}
                        {[...summary.byHospital.entries()].map(([unitId, codes]) => (
                          <div key={unitId} className="muted">
                            {hospitalKindById.get(unitId)
                              ? `${hospitalKindById.get(unitId)}: ${unitId}`
                              : unitId}
                            : {codes.join(", ")}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {selectedUser ? (
            <section className="card">
              <h2>Edit roles — {userLabel(selectedUser)}</h2>
              {selectedUser.fhir_user ? (
                <p className="muted">
                  FHIR user <code>{selectedUser.fhir_user}</code>
                </p>
              ) : null}

              <label className="scope-selector">
                <span>Org unit scope</span>
                <select
                  value={scopeHospitalId ?? ""}
                  disabled={saving}
                  onChange={(e) =>
                    setScopeHospitalId(e.target.value.length > 0 ? e.target.value : null)
                  }
                >
                  <option value="">Organization-wide</option>
                  {hospitals.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {orgUnitLabel(unit)}
                    </option>
                  ))}
                </select>
              </label>

              {otherScopeRoles.length > 0 ? (
                <p className="muted">
                  Other scopes (not edited here): {otherScopeRoles.join(", ")}
                </p>
              ) : null}

              <div className="role-checklist">
                {roles.map((role) => (
                  <label key={role.role_id} className="inline-check role-check">
                    <input
                      type="checkbox"
                      checked={draftRoleCodes.includes(role.code)}
                      disabled={saving}
                      onChange={() => toggleRole(role.code)}
                    />
                    <span>
                      <strong>{role.name}</strong> <code>{role.code}</code>
                      {role.persona ? <span className="muted"> · persona {role.persona}</span> : null}
                      {role.description ? (
                        <span className="muted"> — {role.description}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>

              <div className="row">
                <button type="button" disabled={saving} onClick={() => void onSaveRoles()}>
                  {saving ? "Saving…" : `Save roles for ${scopeLabel}`}
                </button>
              </div>

              <h3>Effective permissions (preview)</h3>
              <p className="muted">
                Permissions when signed in with scope <strong>{scopeLabel}</strong> (org-wide roles
                plus roles for this org unit).
              </p>
              {previewLoading ? <p className="muted">Loading permission preview…</p> : null}
              {!previewLoading && previewPermissions.length > 0 ? (
                <p className="permission-tags">
                  {previewPermissions.map((perm) => (
                    <code key={perm} className="perm-tag">
                      {perm}
                    </code>
                  ))}
                </p>
              ) : null}
              {!previewLoading && previewPermissions.length === 0 ? (
                <p className="muted">No permissions derived from current roles for this scope.</p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </AdminLayout>
  );
}
