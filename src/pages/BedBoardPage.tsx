import { useCallback, useEffect, useMemo, useState } from "react";
import { getSession } from "../api/bff";
import { getBedBoard, type BedBoardEntry } from "../api/his";
import AdminLayout from "../components/AdminLayout";

export default function BedBoardPage() {
  const [beds, setBeds] = useState<BedBoardEntry[]>([]);
  const [wardFilter, setWardFilter] = useState("");
  const [accessibleWards, setAccessibleWards] = useState<string[] | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSession()
      .then((session) => {
        setAccessibleWards(
          session.accessible_wards !== undefined ? session.accessible_wards : null,
        );
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
      setError(err instanceof Error ? err.message : String(err));
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
                  </div>
                ) : (
                  <p className="muted">Ready for admission</p>
                )}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </AdminLayout>
  );
}
