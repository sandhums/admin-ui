import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  attachCoverage,
  cancelClaim,
  createClaim,
  exportClaimBundle,
  getClaim,
  ingestClaimResponse,
  listEncounterCharges,
  listPatientCoverages,
  requestEligibility,
  type ChargeSummary,
  type ClaimSummary,
  type CoverageSummary,
} from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { hasPermission } from "../components/RequirePermission";
import { hospitalGstState } from "../constants";
import { useAuth } from "../context/AuthContext";
import { handleApiError, staffStepUpUrl } from "../api/bff";

function setApiError(setError: (msg: string | null) => void, err: unknown) {
  const msg = handleApiError(err, {
    spa: "admin",
    stepUpUrl: (returnTo) => staffStepUpUrl("admin", returnTo),
  });
  if (msg) setError(msg);
}


export default function ClaimsDeskPage() {
  const { session } = useAuth();
  const canWrite = hasPermission(session, "billing:write");
  const canSubmitClaims = hasPermission(session, "claims:submit");
  const [searchParams] = useSearchParams();

  const [patientId, setPatientId] = useState(() => searchParams.get("patientId") ?? "");
  const [encounterId, setEncounterId] = useState(() => searchParams.get("encounterId") ?? "");
  const [hospitalId, setHospitalId] = useState(
    () => searchParams.get("hospitalId") ?? session?.hospital_id ?? "",
  );
  const [hospitalState, setHospitalState] = useState(hospitalGstState(session?.hospital_id));
  const [placeOfSupply, setPlaceOfSupply] = useState(hospitalGstState(session?.hospital_id));
  const [payorOrgId, setPayorOrgId] = useState("org-demo-insurer");
  const [payerType, setPayerType] = useState("insurer");
  const [subscriberId, setSubscriberId] = useState("");
  const [coverageId, setCoverageId] = useState("");
  const [packageCode, setPackageCode] = useState("");
  const [authorizedLosDays, setAuthorizedLosDays] = useState("");
  const [claimId, setClaimId] = useState("");

  const [coverages, setCoverages] = useState<CoverageSummary[]>([]);
  const [charges, setCharges] = useState<ChargeSummary[]>([]);
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [lastClaim, setLastClaim] = useState<ClaimSummary | null>(null);
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [claimResponseJson, setClaimResponseJson] = useState(
    '{\n  "resourceType": "ClaimResponse",\n  "outcome": "complete",\n  "status": "active"\n}',
  );
  const [crOutcome, setCrOutcome] = useState("complete");
  const [crStatus, setCrStatus] = useState("active");
  const [crDisposition, setCrDisposition] = useState("");
  const [crPaymentAmount, setCrPaymentAmount] = useState("");
  const [crAdvancedJson, setCrAdvancedJson] = useState(false);
  const [lastClaimResponse, setLastClaimResponse] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session?.hospital_id && !hospitalId) {
      setHospitalId(session.hospital_id);
    }
  }, [session?.hospital_id, hospitalId]);

  useEffect(() => {
    const mapped = hospitalGstState(hospitalId);
    setHospitalState(mapped);
    setPlaceOfSupply(mapped);
  }, [hospitalId]);

  const loadCoverages = useCallback(async () => {
    if (!patientId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const list = await listPatientCoverages(patientId.trim());
      setCoverages(list);
      if (list.length === 1) {
        setCoverageId(list[0].id);
      }
    } catch (e) {
      setApiError(setError, e);
      setCoverages([]);
    } finally {
      setBusy(false);
    }
  }, [patientId]);

  const loadCharges = useCallback(async () => {
    if (!encounterId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await listEncounterCharges(encounterId.trim());
      setCharges(res.charges);
      setSelectedCharges(new Set());
      const fromCharge = res.charges.find((c) => c.patient_id)?.patient_id;
      if (fromCharge && !patientId.trim()) {
        setPatientId(fromCharge);
      }
    } catch (e) {
      setApiError(setError, e);
      setCharges([]);
    } finally {
      setBusy(false);
    }
  }, [encounterId, patientId]);

  // Auto-load when opened from Ops census deep-link (IDs already seeded from URL).
  useEffect(() => {
    if (!session?.authenticated) return;
    if (searchParams.get("patientId")?.trim()) void loadCoverages();
    if (searchParams.get("encounterId")?.trim()) void loadCharges();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot seed from URL
  }, [session?.authenticated]);

  async function onAttachCoverage() {
    if (!canWrite) return;
    if (!patientId.trim() || !payorOrgId.trim()) {
      setError("Patient ID and payor organization are required");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const cov = await attachCoverage({
        patient_id: patientId.trim(),
        payor_organization_id: payorOrgId.trim(),
        subscriber_id: subscriberId.trim() || undefined,
        payer_type_display: payerType,
        hospital_id: hospitalId.trim() || undefined,
      });
      setCoverageId(cov.id);
      setMessage(`Attached coverage ${cov.id}`);
      await loadCoverages();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  async function onEligibility() {
    if (!canWrite) return;
    if (!patientId.trim() || !coverageId.trim() || !hospitalId.trim()) {
      setError("Patient, coverage, and hospital are required for eligibility");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const los = authorizedLosDays.trim() !== "" ? Number(authorizedLosDays) : undefined;
      const res = await requestEligibility({
        patient_id: patientId.trim(),
        hospital_id: hospitalId.trim(),
        coverage_id: coverageId.trim(),
        insurer_organization_id: payorOrgId.trim(),
        package_code: packageCode.trim() || undefined,
        authorized_los_days:
          los != null && Number.isFinite(los) && los > 0 ? Math.floor(los) : undefined,
      });
      setMessage(`Eligibility ${res.status} (request ${res.request_id})`);
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateClaim() {
    if (!canSubmitClaims) return;
    if (!encounterId.trim() || !coverageId.trim() || !hospitalId.trim()) {
      setError("Encounter, coverage, and hospital are required");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const ids =
        selectedCharges.size > 0 ? Array.from(selectedCharges) : undefined;
      const res = await createClaim({
        encounter_id: encounterId.trim(),
        hospital_id: hospitalId.trim(),
        coverage_id: coverageId.trim(),
        insurer_organization_id: payorOrgId.trim(),
        charge_item_ids: ids,
        place_of_supply_state: placeOfSupply,
        hospital_state: hospitalState,
      });
      setLastClaim(res.claim);
      setClaimId(res.claim.id);
      setMessage(
        `Created claim ${res.claim.id}` +
          (res.claim.total_inr != null ? ` · ₹${res.claim.total_inr}` : ""),
      );
      await loadCharges();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    const id = claimId.trim() || lastClaim?.id;
    if (!id) {
      setError("Enter or create a claim id first");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const bundle = await exportClaimBundle(id);
      setExportPreview(JSON.stringify(bundle, null, 2));
      setMessage(`Exported ClaimBundle for ${id}`);
    } catch (e) {
      setApiError(setError, e);
      setExportPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function onIngestClaimResponse() {
    if (!canSubmitClaims) return;
    const id = claimId.trim() || lastClaim?.id;
    if (!id) {
      setError("Enter or create a claim id first");
      return;
    }
    let body: Record<string, unknown>;
    if (crAdvancedJson) {
      try {
        body = JSON.parse(claimResponseJson) as Record<string, unknown>;
      } catch {
        setError("ClaimResponse JSON is invalid");
        return;
      }
    } else {
      body = {
        resourceType: "ClaimResponse",
        status: crStatus,
        outcome: crOutcome,
      };
      if (crDisposition.trim()) body.disposition = crDisposition.trim();
      const amt = Number(crPaymentAmount);
      if (crPaymentAmount.trim() && Number.isFinite(amt)) {
        body.payment = {
          amount: { value: amt, currency: "INR" },
        };
      }
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await ingestClaimResponse(id, body);
      setLastClaimResponse(res);
      setMessage(
        `Ingested ClaimResponse ${String(res.id ?? "?")} for claim ${id} · outcome ${String(res.outcome ?? "—")}`,
      );
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  async function onCancelClaim() {
    if (!canWrite) return;
    const id = claimId.trim() || lastClaim?.id;
    if (!id) {
      setError("Enter a claim id to cancel");
      return;
    }
    if (!window.confirm(`Cancel claim ${id}?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const claim = await cancelClaim(id);
      setLastClaim(claim);
      setMessage(`Cancelled claim ${claim.id} (${claim.status})`);
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  async function onLoadClaim() {
    if (!claimId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const claim = await getClaim(claimId.trim());
      setLastClaim(claim);
      setMessage(`Loaded claim ${claim.id} · ${claim.status}`);
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  function toggleCharge(id: string) {
    setSelectedCharges((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const billable = charges.filter((c) => c.status === "billable");

  return (
    <AdminLayout
      title="Claims desk"
      subtitle="Attach Coverage, check eligibility, create Claim from billable charges, export ClaimBundle for ABDM/NDHM."
    >
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      {!canWrite && !canSubmitClaims ? (
        <p className="muted">
          Read-only — need billing:write (coverage) or claims:submit (claims).
        </p>
      ) : null}
      {canWrite && !canSubmitClaims ? (
        <p className="muted">
          You can manage coverage; claim create / ClaimResponse need claims:submit.
        </p>
      ) : null}

      <section className="panel">
        <h2>Context</h2>
        <p className="muted">
          Pick an active visit from the <Link to="/census">Ops census</Link>.
        </p>
        <div className="form grid-2">
          <label>
            Patient ID
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="pat-…"
            />
          </label>
          <label>
            Encounter ID
            <input
              value={encounterId}
              onChange={(e) => setEncounterId(e.target.value)}
              placeholder="enc-…"
            />
          </label>
          <label>
            Hospital ID
            <input
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              placeholder="atrius-gurugram"
            />
          </label>
          <label>
            Hospital GST state
            <input
              value={hospitalState}
              onChange={(e) => setHospitalState(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Place of supply
            <input
              value={placeOfSupply}
              onChange={(e) => setPlaceOfSupply(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Payor / insurer org
            <input
              value={payorOrgId}
              onChange={(e) => setPayorOrgId(e.target.value)}
              placeholder="org-demo-insurer"
            />
          </label>
          <label>
            Payer type
            <select
              value={payerType}
              onChange={(e) => setPayerType(e.target.value)}
              disabled={!canWrite}
            >
              <option value="govt-scheme">govt-scheme</option>
              <option value="insurer">insurer</option>
              <option value="tpa">tpa</option>
              <option value="corporate">corporate</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            disabled={busy || !patientId.trim()}
            onClick={() => void loadCoverages()}
          >
            Load coverages
          </button>
          <button
            type="button"
            disabled={busy || !encounterId.trim()}
            onClick={() => void loadCharges()}
          >
            Load charges
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Coverage</h2>
        <div className="form grid-2">
          <label>
            Subscriber id (optional)
            <input
              value={subscriberId}
              onChange={(e) => setSubscriberId(e.target.value)}
              placeholder="policy / member number"
              disabled={!canWrite}
            />
          </label>
          <label>
            Package code (eligibility, optional)
            <input
              value={packageCode}
              onChange={(e) => setPackageCode(e.target.value)}
              placeholder="PKG-…"
              disabled={!canWrite}
            />
          </label>
          <label>
            Authorized LOS days (optional)
            <input
              type="number"
              min={1}
              step={1}
              value={authorizedLosDays}
              onChange={(e) => setAuthorizedLosDays(e.target.value)}
              disabled={!canWrite}
            />
          </label>
        </div>
        <div className="row">
          <button type="button" disabled={busy || !canWrite} onClick={() => void onAttachCoverage()}>
            Attach coverage
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !canWrite || !coverageId.trim()}
            onClick={() => void onEligibility()}
          >
            Request eligibility
          </button>
        </div>
        <label>
          Active coverage id
          <input
            value={coverageId}
            onChange={(e) => setCoverageId(e.target.value)}
            placeholder="cov-…"
          />
        </label>
        {coverages.length > 0 ? (
          <ul className="admit-match-list">
            {coverages.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCoverageId(c.id)}
                >
                  {c.id} · {c.status}
                  {c.payor_organization_id ? ` · ${c.payor_organization_id}` : ""}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No coverages loaded for this patient.</p>
        )}
      </section>

      <section className="panel">
        <h2>Billable charges → Claim</h2>
        {billable.length === 0 ? (
          <p className="muted">
            No billable charges on this encounter (already billed charges cannot be claimed here).
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th />
                <th>Id</th>
                <th>Code</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {billable.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedCharges.has(c.id)}
                      onChange={() => toggleCharge(c.id)}
                    />
                  </td>
                  <td>
                    <code>{c.id}</code>
                  </td>
                  <td>{c.display ?? c.code ?? "—"}</td>
                  <td>{c.status}</td>
                  <td>
                    {c.unit_price_inr != null
                      ? `₹${(c.unit_price_inr * (c.quantity ?? 1)).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">
          Leave checkboxes empty to claim all billable lines on the encounter.
        </p>
        <button
          type="button"
          disabled={busy || !canSubmitClaims}
          onClick={() => void onCreateClaim()}
        >
          Create claim
        </button>
      </section>

      <section className="panel">
        <h2>Claim actions</h2>
        <label>
          Claim id
          <input
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            placeholder="claim-…"
          />
        </label>
        <div className="row">
          <button type="button" className="secondary" disabled={busy} onClick={() => void onLoadClaim()}>
            Load
          </button>
          <button type="button" disabled={busy} onClick={() => void onExport()}>
            Export ClaimBundle
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !canWrite}
            onClick={() => void onCancelClaim()}
          >
            Cancel claim
          </button>
        </div>
        {lastClaim ? (
          <p>
            Last claim <code>{lastClaim.id}</code> · {lastClaim.status}
            {lastClaim.total_inr != null ? ` · ₹${lastClaim.total_inr}` : ""}
          </p>
        ) : null}
        {exportPreview ? (
          <pre className="export-preview">{exportPreview}</pre>
        ) : null}
      </section>

      <section className="panel">
        <h2>ClaimResponse ingest</h2>
        <p className="muted">
          Record insurer / ABDM ClaimResponse against a claim. Requires claims:submit.
        </p>
        <div className="form grid-2">
          <label>
            Outcome
            <select
              value={crOutcome}
              onChange={(e) => setCrOutcome(e.target.value)}
              disabled={!canSubmitClaims || busy || crAdvancedJson}
            >
              <option value="queued">queued</option>
              <option value="complete">complete</option>
              <option value="error">error</option>
              <option value="partial">partial</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={crStatus}
              onChange={(e) => setCrStatus(e.target.value)}
              disabled={!canSubmitClaims || busy || crAdvancedJson}
            >
              <option value="active">active</option>
              <option value="cancelled">cancelled</option>
              <option value="draft">draft</option>
              <option value="entered-in-error">entered-in-error</option>
            </select>
          </label>
          <label>
            Disposition (optional)
            <input
              value={crDisposition}
              onChange={(e) => setCrDisposition(e.target.value)}
              disabled={!canSubmitClaims || busy || crAdvancedJson}
              placeholder="Approved / denied reason"
            />
          </label>
          <label>
            Payment amount INR (optional)
            <input
              type="number"
              min={0}
              step={0.01}
              value={crPaymentAmount}
              onChange={(e) => setCrPaymentAmount(e.target.value)}
              disabled={!canSubmitClaims || busy || crAdvancedJson}
            />
          </label>
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={crAdvancedJson}
            onChange={(e) => setCrAdvancedJson(e.target.checked)}
            disabled={!canSubmitClaims || busy}
          />
          <span>Advanced: paste full ClaimResponse JSON</span>
        </label>
        {crAdvancedJson ? (
          <label>
            ClaimResponse JSON
            <textarea
              rows={8}
              value={claimResponseJson}
              onChange={(e) => setClaimResponseJson(e.target.value)}
              disabled={!canSubmitClaims || busy}
            />
          </label>
        ) : null}
        <button
          type="button"
          disabled={busy || !canSubmitClaims}
          onClick={() => void onIngestClaimResponse()}
        >
          Ingest ClaimResponse
        </button>
        {lastClaimResponse ? (
          <pre className="export-preview">
            {JSON.stringify(lastClaimResponse, null, 2)}
          </pre>
        ) : null}
      </section>
    </AdminLayout>
  );
}
