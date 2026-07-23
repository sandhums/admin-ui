import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {getSession, formatApiError} from "../api/bff";
import {
  admitPatient,
  dischargePatient,
  getBedBoard,
  getPatient,
  matchPatients,
  type BedBoardEntry,
  type PatientMatchResult,
  type PatientSummary,
} from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { hasPermission } from "../components/RequirePermission";
import { useAuth } from "../context/AuthContext";

const ADMIT_SOURCES = [
  { code: "outp", label: "From OP consult" },
  { code: "emd", label: "From ER" },
  { code: "other", label: "Planned / direct admission" },
] as const;

type AdmitDraft = {
  bed: BedBoardEntry;
  query: string;
  matches: PatientMatchResult[];
  selected: PatientSummary | null;
  admitSource: string;
  reason: string;
  appointmentId: string;
  practitionerId: string;
};

export default function BedBoardPage() {
  const { session } = useAuth();
  const canDischarge = hasPermission(session, "encounter:discharge");
  const canAdmit = hasPermission(session, "encounter:admit");
  const hospitalId = session?.hospital_id?.trim() ?? "";

  const [beds, setBeds] = useState<BedBoardEntry[]>([]);
  const [wardFilter, setWardFilter] = useState("");
  const [accessibleWards, setAccessibleWards] = useState<string[] | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dischargingId, setDischargingId] = useState<string | null>(null);
  const [admitDraft, setAdmitDraft] = useState<AdmitDraft | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getSession()
      .then((s) => {
        setAccessibleWards(s.accessible_wards !== undefined ? s.accessible_wards : null);
        setSessionReady(true);
      })
      .catch(() => {
        setAccessibleWards(null);
        setSessionReady(true);
      });
  }, []);

  const wardRestricted = accessibleWards !== null;
  const noWardAccess = wardRestricted && accessibleWards.length === 0;

  const loadBoard = useCallback(async () => {
    if (!sessionReady) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getBedBoard(wardFilter ? { ward_id: wardFilter } : undefined);
      setBeds(res.beds);
    } catch (err) {
      setError(formatApiError(err));
      // Keep prior beds on scoped ward 403 so the grid does not flash empty; ward
      // picker options come from session.accessible_wards, not bed rows.
      if (!wardRestricted) {
        setBeds([]);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionReady, wardFilter, wardRestricted]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const wards = useMemo(() => {
    if (wardRestricted) {
      return [...accessibleWards].sort();
    }
    const ids = new Set<string>();
    for (const bed of beds) {
      if (bed.ward_id) ids.add(bed.ward_id);
    }
    return [...ids].sort();
  }, [wardRestricted, accessibleWards, beds]);

  const occupied = beds.filter((b) => b.occupied).length;
  const available = beds.length - occupied;

  function openAdmit(bed: BedBoardEntry) {
    setError(null);
    setNotice(null);
    setAdmitDraft({
      bed,
      query: "",
      matches: [],
      selected: null,
      admitSource: "other",
      reason: "",
      appointmentId: "",
      practitionerId: session?.practitioner_id ?? "",
    });
  }

  function closeAdmit() {
    setAdmitDraft(null);
  }

  async function onLookupPatient(e: FormEvent) {
    e.preventDefault();
    if (!admitDraft) return;
    const q = admitDraft.query.trim();
    if (!q) {
      setError("Enter an MRN or patient id to look up.");
      return;
    }
    setLookingUp(true);
    setError(null);
    try {
      if (q.startsWith("pat-") || q.startsWith("Patient/")) {
        const id = q.replace(/^Patient\//, "");
        const patient = await getPatient(id);
        setAdmitDraft({
          ...admitDraft,
          selected: patient,
          matches: [],
        });
        return;
      }
      const res = await matchPatients({ mrn: q });
      if (res.count === 0) {
        setAdmitDraft({ ...admitDraft, matches: [], selected: null });
        setError(`No patient found for “${q}”.`);
        return;
      }
      if (res.count === 1) {
        const m = res.matches[0];
        setAdmitDraft({
          ...admitDraft,
          matches: res.matches,
          selected: {
            patient_id: m.patient_id,
            mrn: m.mrn,
            name: m.name,
          },
        });
        return;
      }
      setAdmitDraft({ ...admitDraft, matches: res.matches, selected: null });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLookingUp(false);
    }
  }

  async function onAdmit(e: FormEvent) {
    e.preventDefault();
    if (!admitDraft?.selected) {
      setError("Look up and select a patient before admitting.");
      return;
    }
    if (!hospitalId) {
      setError("Your session has no hospital_id — cannot admit.");
      return;
    }
    setAdmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await admitPatient({
        patient_id: admitDraft.selected.patient_id,
        bed_id: admitDraft.bed.bed_id,
        hospital_id: hospitalId,
        admit_source: admitDraft.admitSource,
        reason: admitDraft.reason.trim() || undefined,
        appointment_id: admitDraft.appointmentId.trim() || undefined,
        practitioner_id: admitDraft.practitionerId.trim() || undefined,
      });
      const label =
        admitDraft.selected.name ??
        admitDraft.selected.mrn ??
        admitDraft.selected.patient_id;
      setNotice(
        `Admitted ${label} to ${admitDraft.bed.bed_name} (encounter ${res.encounter_id}).`,
      );
      setAdmitDraft(null);
      await loadBoard();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setAdmitting(false);
    }
  }

  async function onDischarge(bed: BedBoardEntry) {
    if (!bed.encounter_id) {
      setError(`Bed ${bed.bed_name} is marked occupied but has no active encounter to discharge.`);
      return;
    }
    const label = bed.patient_name ?? bed.encounter_id;
    if (!window.confirm(`Discharge ${label} from ${bed.bed_name}?`)) {
      return;
    }
    setDischargingId(bed.encounter_id);
    setError(null);
    setNotice(null);
    try {
      await dischargePatient(bed.encounter_id, { discharge_disposition: "home" });
      setNotice(`Discharged ${label}; ${bed.bed_name} is available.`);
      await loadBoard();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setDischargingId(null);
    }
  }

  return (
    <AdminLayout title="Bed board" subtitle="Ward occupancy at a glance">
      <section className="card">
        {!noWardAccess ? (
          <div className="board-toolbar">
            <label>
              Ward
              <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)}>
                <option value="">All wards</option>
                {wards.map((ward) => (
                  <option key={ward} value={ward}>
                    {ward}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary" onClick={() => void loadBoard()} disabled={loading}>
              Refresh
            </button>
          </div>
        ) : null}

        {noWardAccess ? (
          <p className="muted">
            Your scope does not include any inpatient wards (for example, a department-only assignment).
            Bed board is not available — contact an administrator if you need ward access.
          </p>
        ) : null}

        {!noWardAccess ? (
          <div className="board-summary">
            <div className="stat-chip">
              <span className="stat-value">{beds.length}</span>
              <span className="stat-label">Total beds</span>
            </div>
            <div className="stat-chip stat-occupied">
              <span className="stat-value">{occupied}</span>
              <span className="stat-label">Occupied</span>
            </div>
            <div className="stat-chip stat-available">
              <span className="stat-value">{available}</span>
              <span className="stat-label">Available</span>
            </div>
          </div>
        ) : null}

        {!sessionReady || loading ? <p className="muted">Loading bed board…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="muted">{notice}</p> : null}

        {admitDraft ? (
          <div className="admit-panel">
            <header className="admit-panel-header">
              <h2>Admit to {admitDraft.bed.bed_name}</h2>
              <button type="button" className="secondary" onClick={closeAdmit} disabled={admitting}>
                Cancel
              </button>
            </header>
            {admitDraft.bed.ward_id ? (
              <p className="muted">Ward {admitDraft.bed.ward_id}</p>
            ) : null}
            {!hospitalId ? (
              <p className="error">Session hospital is missing — re-login as a campus-scoped user.</p>
            ) : (
              <p className="muted">Hospital {hospitalId}</p>
            )}

            <form className="form" onSubmit={(e) => void onLookupPatient(e)}>
              <label>
                Patient (MRN or id)
                <div className="row">
                  <input
                    value={admitDraft.query}
                    onChange={(e) =>
                      setAdmitDraft({ ...admitDraft, query: e.target.value, selected: null })
                    }
                    placeholder="MRN-… or pat-…"
                    disabled={lookingUp || admitting}
                  />
                  <button type="submit" className="secondary" disabled={lookingUp || admitting}>
                    {lookingUp ? "Looking up…" : "Look up"}
                  </button>
                </div>
              </label>
            </form>

            {admitDraft.matches.length > 1 ? (
              <ul className="admit-match-list">
                {admitDraft.matches.map((m) => (
                  <li key={m.patient_id}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={admitting}
                      onClick={() =>
                        setAdmitDraft({
                          ...admitDraft,
                          selected: {
                            patient_id: m.patient_id,
                            mrn: m.mrn,
                            name: m.name,
                          },
                        })
                      }
                    >
                      {m.name ?? m.patient_id}
                      {m.mrn ? ` · ${m.mrn}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {admitDraft.selected ? (
              <p>
                Selected{" "}
                <strong>
                  {admitDraft.selected.name ?? admitDraft.selected.patient_id}
                </strong>
                {admitDraft.selected.mrn ? ` · ${admitDraft.selected.mrn}` : ""}
                <span className="muted"> ({admitDraft.selected.patient_id})</span>
              </p>
            ) : null}

            <form className="form grid-2" onSubmit={(e) => void onAdmit(e)}>
              <label>
                Admission source
                <select
                  value={admitDraft.admitSource}
                  onChange={(e) => setAdmitDraft({ ...admitDraft, admitSource: e.target.value })}
                  disabled={admitting}
                >
                  {ADMIT_SOURCES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reason (optional)
                <input
                  value={admitDraft.reason}
                  onChange={(e) => setAdmitDraft({ ...admitDraft, reason: e.target.value })}
                  placeholder="e.g. elective cholecystectomy"
                  disabled={admitting}
                />
              </label>
              <label>
                Appointment id (optional)
                <input
                  value={admitDraft.appointmentId}
                  onChange={(e) =>
                    setAdmitDraft({ ...admitDraft, appointmentId: e.target.value })
                  }
                  placeholder="appt-…"
                  disabled={admitting}
                />
              </label>
              <label>
                Practitioner id (optional)
                <input
                  value={admitDraft.practitionerId}
                  onChange={(e) =>
                    setAdmitDraft({ ...admitDraft, practitionerId: e.target.value })
                  }
                  placeholder="dr-…"
                  disabled={admitting}
                />
              </label>
              <div className="row actions">
                <button type="submit" disabled={admitting || !admitDraft.selected || !hospitalId}>
                  {admitting ? "Admitting…" : "Confirm admit"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {!loading && !error && !noWardAccess && beds.length === 0 ? (
          <p className="muted">No beds found. Run hospital seed data to populate wards.</p>
        ) : null}

        {!loading && !noWardAccess && beds.length > 0 ? (
          <div className="bed-grid">
            {beds.map((bed) => (
              <article
                key={bed.bed_id}
                className={`bed-card${bed.occupied ? " occupied" : " vacant"}`}
              >
                <header className="bed-card-header">
                  <strong>{bed.bed_name}</strong>
                  <span className={`bed-status-pill${bed.occupied ? " occupied" : ""}`}>
                    {bed.occupied ? "Occupied" : "Available"}
                  </span>
                </header>
                {bed.ward_id ? <p className="muted">Ward {bed.ward_id}</p> : null}
                {bed.occupied ? (
                  <div className="bed-occupant">
                    <p>{bed.patient_name ?? "Patient assigned"}</p>
                    {bed.operational_status ? (
                      <p className="muted">{bed.operational_status}</p>
                    ) : null}
                    {canDischarge && bed.encounter_id ? (
                      <button
                        type="button"
                        className="secondary"
                        disabled={dischargingId === bed.encounter_id}
                        onClick={() => void onDischarge(bed)}
                      >
                        {dischargingId === bed.encounter_id ? "Discharging…" : "Discharge"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="bed-occupant">
                    <p className="muted">Ready for admission</p>
                    {canAdmit ? (
                      <button
                        type="button"
                        disabled={admitting}
                        onClick={() => openAdmit(bed)}
                      >
                        Admit
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </AdminLayout>
  );
}
