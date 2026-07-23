import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listEncounters,
  listHospitals,
  type EncounterSummary,
  type HospitalSummary,
} from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../api/bff";
import { DEFAULT_HOSPITALS, campusForHospital } from "../constants";

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

/** Accept Organization hospital ids or demo campus Location ids. */
function normalizeHospitalFilter(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "all") return "";
  if (trimmed === "campus-gurugram") return "atrius-gurugram";
  if (trimmed === "campus-goa") return "atrius-goa";
  return trimmed;
}

function pickHospitalId(
  current: string,
  hospitals: HospitalSummary[],
  sessionHospitalId?: string | null,
): string {
  if (current === "all") return "all";
  if (current && hospitals.some((h) => h.id === current)) return current;
  if (sessionHospitalId && hospitals.some((h) => h.id === sessionHospitalId)) {
    return sessionHospitalId;
  }
  return hospitals[0]?.id ?? "all";
}

export default function OpsCensusPage() {
  const { session } = useAuth();
  const [status, setStatus] = useState("in-progress");
  const [classCode, setClassCode] = useState("");
  const [hospitals, setHospitals] = useState<HospitalSummary[]>([]);
  const [hospitalId, setHospitalId] = useState(session?.hospital_id ?? "");
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [hospitalsLoading, setHospitalsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHospitalsLoading(true);
    void listHospitals()
      .then((res) => {
        if (cancelled) return;
        const list =
          res.hospitals.length > 0
            ? res.hospitals
            : DEFAULT_HOSPITALS.map((h) => ({ ...h }));
        setHospitals(list);
        setHospitalId((current) => pickHospitalId(current, list, session?.hospital_id));
      })
      .catch(() => {
        if (cancelled) return;
        const list = DEFAULT_HOSPITALS.map((h) => ({ ...h }));
        setHospitals(list);
        setHospitalId((current) => pickHospitalId(current, list, session?.hospital_id));
      })
      .finally(() => {
        if (!cancelled) setHospitalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.hospital_id]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // `all` is sent explicitly so HIS clears session X-Hospital-ID scoping.
      const scopedHospital =
        !hospitalId || hospitalId === "all" ? "all" : normalizeHospitalFilter(hospitalId);
      const res = await listEncounters({
        status: status || undefined,
        class: classCode || undefined,
        hospital_id: scopedHospital || undefined,
        _count: 100,
      });
      setEncounters(Array.isArray(res.encounters) ? res.encounters : []);
    } catch (e) {
      setError(formatApiError(e));
      setEncounters([]);
    } finally {
      setBusy(false);
    }
  }, [status, classCode, hospitalId]);

  useEffect(() => {
    if (!session?.authenticated || hospitalsLoading) return;
    void load();
  }, [session?.authenticated, hospitalsLoading, load]);

  async function onCopy(label: string, value: string) {
    await copyText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  }

  const filterSummary = [
    `status=${status || "in-progress"}`,
    classCode ? `class=${classCode}` : "class=all",
    hospitalId && hospitalId !== "all"
      ? `hospital=${normalizeHospitalFilter(hospitalId) || hospitalId}`
      : "hospital=all",
  ].join(" · ");

  return (
    <AdminLayout
      title="Ops census"
      subtitle="Active patients and encounters — copy IDs or open Billing / Claims for end-to-end testing."
    >
      {error ? <p className="error">{error}</p> : null}
      {copied ? <p className="success">Copied {copied}</p> : null}

      <section className="card">
        <h2>Filters</h2>
        <div className="board-toolbar">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
              <option value="in-progress">in-progress</option>
              <option value="finished">finished</option>
              <option value="cancelled">cancelled</option>
              <option value="all">all statuses</option>
            </select>
          </label>
          <label>
            Class
            <select value={classCode} onChange={(e) => setClassCode(e.target.value)} disabled={busy}>
              <option value="">All</option>
              <option value="AMB">AMB (OPD)</option>
              <option value="IMP">IMP (IPD)</option>
              <option value="EMER">EMER</option>
            </select>
          </label>
          <label>
            Hospital
            <select
              value={hospitalId}
              disabled={busy || hospitalsLoading || hospitals.length === 0}
              onChange={(e) => setHospitalId(e.target.value)}
            >
              <option value="all">All hospitals</option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name} ({hospital.id})
                </option>
              ))}
            </select>
          </label>
        </div>
        {hospitalId && hospitalId !== "all" ? (
          <p className="muted">
            Campus map: <code>{campusForHospital(hospitalId) ?? "—"}</code>
          </p>
        ) : null}
        <div className="row">
          <button type="button" disabled={busy || hospitalsLoading} onClick={() => void load()}>
            {busy ? "Loading…" : "Refresh"}
          </button>
          <span className="muted">{encounters.length} encounter(s)</span>
        </div>
      </section>

      <section className="card">
        <h2>Encounters</h2>
        {busy && encounters.length === 0 ? <p className="muted">Loading census…</p> : null}
        {!busy && encounters.length === 0 ? (
          <p className="muted">
            No encounters match ({filterSummary}). Try <strong>all statuses</strong>, clear class,
            or pick the hospital where visits were started (Gurugram demo data is{" "}
            <code>atrius-gurugram</code>). Start a visit from OPD front desk or admit from the bed
            board, then refresh.
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
