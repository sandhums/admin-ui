import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAuthzHospitals, type AdminHospitalSummary } from "../api/authz";
import {
  getFoundationConfig,
  updateOrganizationName,
  type FoundationConfig,
} from "../api/his";
import { hasPermission } from "../components/RequirePermission";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../api/bff";

export default function AdminConfigPage() {
  const { session } = useAuth();
  const [hospitals, setHospitals] = useState<AdminHospitalSummary[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [config, setConfig] = useState<FoundationConfig | null>(null);
  const [loadedHospitalId, setLoadedHospitalId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canWrite = hasPermission(session, "config:write");

  const selectedHospital = hospitals.find((h) => h.id === selectedHospitalId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoadingHospitals(true);
    void listAuthzHospitals()
      .then((res) => {
        if (cancelled) return;
        setHospitals(res.hospitals);
        setSelectedHospitalId((current) => {
          if (current && res.hospitals.some((h) => h.id === current)) {
            return current;
          }
          if (session?.hospital_id && res.hospitals.some((h) => h.id === session.hospital_id)) {
            return session.hospital_id;
          }
          return res.hospitals[0]?.id ?? "";
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatApiError(err));
          setHospitals([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHospitals(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.hospital_id]);

  const loadConfig = useCallback(async (hospitalId: string) => {
    if (!hospitalId) {
      setConfig(null);
      setLoadedHospitalId(null);
      return;
    }
    setConfig(null);
    setLoadedHospitalId(null);
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const data = await getFoundationConfig(hospitalId);
      setConfig(data);
      setLoadedHospitalId(hospitalId);
      setOrgName(data.organization.name);
    } catch (e) {
      setError(formatApiError(e));
      setConfig(null);
      setLoadedHospitalId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedHospitalId) return;
    void loadConfig(selectedHospitalId);
  }, [selectedHospitalId, loadConfig]);

  async function onSaveOrganization(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !selectedHospitalId) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await updateOrganizationName(orgName.trim(), selectedHospitalId);
      setFeedback("Organization name saved");
      setConfig((prev) =>
        prev ? { ...prev, organization: { ...prev.organization, name: updated.name } } : prev,
      );
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const bedCount = config?.wards.reduce((sum, ward) => sum + ward.beds.length, 0) ?? 0;
  const showConfig = Boolean(config && loadedHospitalId === selectedHospitalId && selectedHospital);

  return (
    <AdminLayout
      title="Hospital configuration"
      subtitle="Organization foundation — locations, OPD doctors, and services"
    >
      <section className="card config-meta">
        <h2>Signed-in administrator</h2>
        <dl className="config-dl">
          <div>
            <dt>User</dt>
            <dd>{session?.name ?? session?.sub ?? "—"}</dd>
          </div>
          <div>
            <dt>Tenant</dt>
            <dd>{session?.tenant_id ?? config?.tenant_id ?? "—"}</dd>
          </div>
          <div>
            <dt>Authz org ID</dt>
            <dd>{session?.authz_org_id ?? "—"}</dd>
          </div>
          <div>
            <dt>Permissions</dt>
            <dd>
              {session?.permissions?.length
                ? session.permissions.filter((p) => p.startsWith("config:")).join(", ")
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2>Hospital</h2>
        <p className="muted">
          Each facility is a FHIR <code>Organization</code> under the tenant. Select one to view
          its campus, wards, and OPD configuration.
        </p>
        {loadingHospitals ? <p className="muted">Loading hospitals…</p> : null}
        {!loadingHospitals && hospitals.length === 0 ? (
          <p className="muted">
            No hospitals in auth_db. Restart the BFF so migration 004 runs, or seed FHIR foundation
            data.
          </p>
        ) : null}
        {hospitals.length > 0 ? (
          <label className="scope-selector">
            <span>Facility</span>
            <select
              value={selectedHospitalId}
              disabled={loading || saving}
              onChange={(e) => setSelectedHospitalId(e.target.value)}
            >
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name} ({hospital.id})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {loading ? <p className="muted">Loading foundation data…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {config && loadedHospitalId === selectedHospitalId && selectedHospital ? (
        <>
          <section className="card">
            <h2>Organization</h2>
            <p className="muted">
              FHIR Organization resource <code>{config.organization.id}</code>
              {config.organization.active ? null : " · inactive"}
            </p>
            {canWrite ? (
              <form className="config-form" onSubmit={(e) => void onSaveOrganization(e)}>
                <label>
                  Display name
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={saving}
                  />
                </label>
                <button type="submit" disabled={saving || orgName.trim().length === 0}>
                  {saving ? "Saving…" : "Save organization name"}
                </button>
              </form>
            ) : (
              <p>
                <strong>{config.organization.name}</strong>
              </p>
            )}
            {feedback ? <p className="ok">{feedback}</p> : null}
          </section>

          <section className="card">
            <h2>Campus &amp; wards</h2>
            {config.campus ? (
              <p className="muted">
                Campus <strong>{config.campus.name}</strong> (<code>{config.campus.id}</code>)
              </p>
            ) : (
              <p className="muted">No campus location found in FHIR for this hospital.</p>
            )}
            <div className="config-summary-row">
              <span className="stat-chip">
                <span className="stat-value">{config.wards.length}</span>
                <span className="stat-label">Wards</span>
              </span>
              <span className="stat-chip">
                <span className="stat-value">{bedCount}</span>
                <span className="stat-label">Beds</span>
              </span>
            </div>
            {config.wards.length === 0 ? (
              <p className="muted">
                No wards seeded for <code>{selectedHospital.id}</code>. Run{" "}
                <code>seed-hospital-foundation.py</code> against Clinical HFS.
              </p>
            ) : (
              <ul className="config-ward-list">
                {config.wards.map((ward) => (
                  <li key={ward.id}>
                    <strong>{ward.name}</strong> <code>{ward.id}</code>
                    {ward.beds.length > 0 ? (
                      <ul>
                        {ward.beds.map((bed) => (
                          <li key={bed.id}>
                            {bed.name} <span className="muted">({bed.status ?? "unknown"})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No beds under this ward.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p>
              <Link to="/admin/users">Users &amp; roles</Link>
              {" · "}
              <Link to="/admin/roles">Roles &amp; permissions</Link>
              {" · "}
              <Link to="/beds">Open bed board</Link> for live occupancy.
            </p>
          </section>

          <section className="card">
            <h2>Healthcare services</h2>
            {config.healthcare_services.length === 0 ? (
              <p className="muted">No HealthcareService resources found for this hospital.</p>
            ) : (
              <ul className="config-simple-list">
                {config.healthcare_services.map((svc) => (
                  <li key={svc.id}>
                    <strong>{svc.name}</strong> <code>{svc.id}</code>
                    {!svc.active ? <span className="badge muted">inactive</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>OPD booking doctors</h2>
            <p className="muted">
              Practitioners with active schedules at this hospital — used by front desk booking.
            </p>
            {config.opd_doctors.length === 0 ? (
              <p className="muted">No OPD schedules found for this hospital.</p>
            ) : (
              <table className="config-table">
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Practitioner</th>
                    <th>Schedule</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {config.opd_doctors.map((doc) => (
                    <tr key={doc.practitioner_id}>
                      <td>{doc.name}</td>
                      <td>
                        <code>{doc.practitioner_id}</code>
                      </td>
                      <td>
                        <code>{doc.schedule_id}</code>
                      </td>
                      <td>{doc.location_id ? <code>{doc.location_id}</code> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>
              <Link to="/">Front desk booking</Link> uses this list for doctor selection.
            </p>
          </section>
        </>
      ) : null}

      {!loading && !loadingHospitals && selectedHospitalId && !showConfig && !error ? (
        <p className="muted">No foundation data available.</p>
      ) : null}
    </AdminLayout>
  );
}
