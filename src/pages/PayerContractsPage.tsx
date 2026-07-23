import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  listPackages,
  listPayerContracts,
  type PackageDefinitionSummary,
  type PayerContractSummary,
} from "../api/his";
import { formatApiError } from "../api/bff";
import AdminLayout from "../components/AdminLayout";

export default function PayerContractsPage() {
  const [hospitalId, setHospitalId] = useState("");
  const [payorOrgId, setPayorOrgId] = useState("");
  const [contracts, setContracts] = useState<PayerContractSummary[]>([]);
  const [selected, setSelected] = useState<PayerContractSummary | null>(null);
  const [packages, setPackages] = useState<PackageDefinitionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContracts = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await listPayerContracts({
        hospital_id: hospitalId.trim() || undefined,
        payor_org_id: payorOrgId.trim() || undefined,
      });
      setContracts(res.contracts ?? []);
      setSelected(null);
      setPackages([]);
    } catch (e) {
      setError(formatApiError(e));
      setContracts([]);
    } finally {
      setBusy(false);
    }
  }, [hospitalId, payorOrgId]);

  const loadPackagesFor = useCallback(async (contract: PayerContractSummary) => {
    setSelected(contract);
    setBusy(true);
    setError(null);
    try {
      const res = await listPackages({
        schedule_id: contract.schedule_id || undefined,
        payer_org_id: contract.payor_org_id || undefined,
      });
      setPackages(res.packages ?? []);
    } catch (e) {
      setError(formatApiError(e));
      setPackages([]);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <AdminLayout
      title="Payer contracts"
      subtitle="Browse contract headers and packages. Uploads go via Masters (payer-contracts / packages / payer-code-maps)."
    >
      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <h2>Filters</h2>
        <p className="muted">
          Read-only browser. To create or update rows, use{" "}
          <Link to="/admin/masters">Masters upload</Link>.
        </p>
        <div className="form grid-2">
          <label>
            Hospital ID (optional)
            <input
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              placeholder="atrius-gurugram"
            />
          </label>
          <label>
            Payor org (optional)
            <input
              value={payorOrgId}
              onChange={(e) => setPayorOrgId(e.target.value)}
              placeholder="org-demo-insurer"
            />
          </label>
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" disabled={busy} onClick={() => void loadContracts()}>
            {busy ? "Loading…" : "List contracts"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Contracts ({contracts.length})</h2>
        {contracts.length === 0 ? (
          <p className="muted">No contracts loaded.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Payor</th>
                <th>Category</th>
                <th>Schedule</th>
                <th>Discount</th>
                <th>Uncontracted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.title || c.id}</strong>
                    <div className="muted">
                      <code>{c.id}</code>
                    </div>
                  </td>
                  <td>{c.payor_org_id ?? "—"}</td>
                  <td>{c.category ?? "—"}</td>
                  <td>
                    <code>{c.schedule_id ?? "—"}</code>
                  </td>
                  <td>{c.default_discount_percent}%</td>
                  <td>{c.uncontracted_behavior}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void loadPackagesFor(c)}
                    >
                      Packages
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected ? (
        <section className="panel">
          <h2>
            Packages for {selected.title || selected.id}
            {selected.schedule_id ? (
              <>
                {" "}
                · schedule <code>{selected.schedule_id}</code>
              </>
            ) : null}
          </h2>
          {packages.length === 0 ? (
            <p className="muted">No packages for this schedule/payor.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Amount</th>
                  <th>LOS</th>
                  <th>Bed</th>
                  <th>Beyond LOS</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <code>{p.package_code}</code>
                    </td>
                    <td>{p.title}</td>
                    <td>₹{p.package_amount_inr}</td>
                    <td>{p.included_los_days}d</td>
                    <td>{p.bed_category ?? "—"}</td>
                    <td>{p.beyond_los_policy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </AdminLayout>
  );
}
