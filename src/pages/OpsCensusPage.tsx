import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listEncounters, type EncounterSummary } from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../context/AuthContext";

function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore — copy is best-effort in insecure contexts
  }
}

function deskLink(
  path: "/billing" | "/claims",
  enc: EncounterSummary,
): string {
  const qs = new URLSearchParams();
  qs.set("encounterId", enc.encounter_id);
  if (enc.patient_id) qs.set("patientId", enc.patient_id);
  if (enc.hospital_id) qs.set("hospitalId", enc.hospital_id);
  return `${path}?${qs.toString()}`;
}

export default function OpsCensusPage() {
  const { session } = useAuth();
  const [status, setStatus] = useState("in-progress");
  const [classCode, setClassCode] = useState("");
  const [hospitalId, setHospitalId] = useState(session?.hospital_id ?? "");
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (session?.hospital_id && !hospitalId) {
      setHospitalId(session.hospital_id);
    }
  }, [session?.hospital_id, hospitalId]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await listEncounters({
        status: status || undefined,
        class: classCode || undefined,
        hospital_id: hospitalId.trim() || undefined,
        _count: 100,
      });
      setEncounters(res.encounters);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEncounters([]);
    } finally {
      setBusy(false);
    }
  }, [status, classCode, hospitalId]);

  useEffect(() => {
    if (!session?.authenticated) return;
    void load();
  }, [session?.authenticated, load]);

  async function onCopy(label: string, value: string) {
    await copyText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <AdminLayout
      title="Ops census"
      subtitle="Active patients and encounters — copy IDs or open Billing / Claims for end-to-end testing."
    >
      {error ? <p className="error">{error}</p> : null}
      {copied ? <p className="success">Copied {copied}</p> : null}

      <section className="panel">
        <h2>Filters</h2>
        <div className="form grid-2">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="in-progress">in-progress</option>
              <option value="finished">finished</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <label>
            Class
            <select value={classCode} onChange={(e) => setClassCode(e.target.value)}>
              <option value="">All</option>
              <option value="AMB">AMB (OPD)</option>
              <option value="IMP">IMP (IPD)</option>
              <option value="EMER">EMER</option>
            </select>
          </label>
          <label>
            Hospital ID
            <input
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              placeholder="atrius-gurugram (optional)"
            />
          </label>
        </div>
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void load()}>
            {busy ? "Loading…" : "Refresh"}
          </button>
          <span className="muted">{encounters.length} encounter(s)</span>
        </div>
      </section>

      <section className="panel">
        <h2>Encounters</h2>
        {busy && encounters.length === 0 ? <p className="muted">Loading census…</p> : null}
        {!busy && encounters.length === 0 ? (
          <p className="muted">
            No encounters match. Start a visit from OPD front desk or admit from the bed board, then
            refresh.
          </p>
        ) : null}

        {encounters.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>IDs</th>
                  <th>Class / status</th>
                  <th>Location</th>
                  <th>Since</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {encounters.map((enc) => (
                  <tr key={enc.encounter_id}>
                    <td>
                      <strong>{enc.patient_name ?? "Patient"}</strong>
                      {enc.practitioner_id ? (
                        <div className="muted">Dr {enc.practitioner_id}</div>
                      ) : null}
                      {enc.reason ? <div className="muted">{enc.reason}</div> : null}
                    </td>
                    <td>
                      <div className="id-stack">
                        {enc.patient_id ? (
                          <button
                            type="button"
                            className="secondary id-chip"
                            title="Copy patient id"
                            onClick={() => void onCopy("patient id", enc.patient_id!)}
                          >
                            Patient/{enc.patient_id}
                          </button>
                        ) : (
                          <span className="muted">No patient</span>
                        )}
                        <button
                          type="button"
                          className="secondary id-chip"
                          title="Copy encounter id"
                          onClick={() => void onCopy("encounter id", enc.encounter_id)}
                        >
                          Encounter/{enc.encounter_id}
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="badge">{enc.class_code ?? "—"}</span>{" "}
                      <span className="muted">{enc.status}</span>
                    </td>
                    <td>
                      {enc.location_name ?? enc.bed_id ?? "—"}
                      {enc.ward_id ? <div className="muted">Ward {enc.ward_id}</div> : null}
                      {enc.hospital_id ? (
                        <div className="muted">{enc.hospital_id}</div>
                      ) : null}
                    </td>
                    <td>{formatWhen(enc.period_start)}</td>
                    <td>
                      <div className="row actions-tight">
                        <Link className="link-button" to={deskLink("/billing", enc)}>
                          Billing
                        </Link>
                        <Link className="link-button" to={deskLink("/claims", enc)}>
                          Claims
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </AdminLayout>
  );
}
