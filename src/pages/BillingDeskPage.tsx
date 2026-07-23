import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  adjustCharge,
  getPackageCase,
  issueCashInvoice,
  issueCreditNote,
  listBillingItems,
  listEncounterCharges,
  listPatientCoverages,
  postCharge,
  seedDemoTariff,
  voidCharge,
  type BillingItemSummary,
  type ChargeSummary,
  type CoverageSummary,
  type InvoiceSummary,
  type PackageCaseSummary,
} from "../api/his";
import { handleApiError, staffStepUpUrl } from "../api/bff";
import AdminLayout from "../components/AdminLayout";
import { hasPermission } from "../components/RequirePermission";
import { hospitalGstState } from "../constants";
import { useAuth } from "../context/AuthContext";

function setApiError(setError: (msg: string | null) => void, err: unknown) {
  const msg = handleApiError(err, {
    spa: "admin",
    stepUpUrl: (returnTo) => staffStepUpUrl("admin", returnTo),
  });
  if (msg) setError(msg);
}

type PendingAction =
  | { kind: "void"; charges: ChargeSummary[] }
  | { kind: "adjust"; charge: ChargeSummary }
  | { kind: "credit" };

export default function BillingDeskPage() {
  const { session } = useAuth();
  const canWrite = hasPermission(session, "billing:write");
  const [searchParams, setSearchParams] = useSearchParams();
  const [encounterId, setEncounterId] = useState(() => searchParams.get("encounterId") ?? "");
  const [hospitalId, setHospitalId] = useState(
    () => searchParams.get("hospitalId") ?? session?.hospital_id ?? "",
  );
  const patientIdFromUrl = searchParams.get("patientId") ?? "";
  const [hospitalState, setHospitalState] = useState(
    hospitalGstState(session?.hospital_id),
  );
  const [placeOfSupply, setPlaceOfSupply] = useState(
    hospitalGstState(session?.hospital_id),
  );
  const [billingCode, setBillingCode] = useState("OPD-CONSULT");
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<BillingItemSummary[]>([]);
  const [charges, setCharges] = useState<ChargeSummary[]>([]);
  const [coverages, setCoverages] = useState<CoverageSummary[]>([]);
  const [packageCase, setPackageCase] = useState<PackageCaseSummary | null>(null);
  const [lastInvoice, setLastInvoice] = useState<InvoiceSummary | null>(() => {
    const id = searchParams.get("invoiceId");
    return id ? { id, status: "issued" } : null;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustPrice, setAdjustPrice] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [creditReason, setCreditReason] = useState("");

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

  // Keep desk deep-linkable (encounter / hospital / last invoice).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams();
        if (encounterId.trim()) next.set("encounterId", encounterId.trim());
        if (hospitalId.trim()) next.set("hospitalId", hospitalId.trim());
        if (patientIdFromUrl.trim()) next.set("patientId", patientIdFromUrl.trim());
        if (lastInvoice?.id) next.set("invoiceId", lastInvoice.id);
        if (next.toString() === prev.toString()) return prev;
        return next;
      },
      { replace: true },
    );
  }, [encounterId, hospitalId, patientIdFromUrl, lastInvoice?.id, setSearchParams]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await listBillingItems();
      setItems(res.items);
      setBillingCode((prev) => {
        if (res.items.some((i) => i.code === prev)) return prev;
        return res.items[0]?.code ?? prev;
      });
    } catch (e) {
      setApiError(setError, e);
    }
  }, []);

  const loadPayerContext = useCallback(
    async (chargesList: ChargeSummary[]) => {
      const patientId =
        patientIdFromUrl.trim() ||
        chargesList.find((c) => c.patient_id)?.patient_id ||
        "";
      if (patientId) {
        try {
          const list = await listPatientCoverages(patientId);
          setCoverages(list);
        } catch {
          setCoverages([]);
        }
      } else {
        setCoverages([]);
      }
      if (encounterId.trim()) {
        try {
          const pkg = await getPackageCase(encounterId.trim());
          setPackageCase(pkg);
        } catch {
          setPackageCase(null);
        }
      } else {
        setPackageCase(null);
      }
    },
    [encounterId, patientIdFromUrl],
  );

  const loadCharges = useCallback(async () => {
    if (!encounterId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await listEncounterCharges(encounterId.trim());
      setCharges(res.charges);
      setSelected(new Set());
      setPending(null);
      await loadPayerContext(res.charges);
    } catch (e) {
      setApiError(setError, e);
      setCharges([]);
      setCoverages([]);
      setPackageCase(null);
    } finally {
      setBusy(false);
    }
  }, [encounterId, loadPayerContext]);

  useEffect(() => {
    if (!session?.authenticated) return;
    void loadCatalog();
  }, [session?.authenticated, loadCatalog]);

  // Auto-load when opened from Ops census deep-link.
  useEffect(() => {
    if (!session?.authenticated) return;
    if (searchParams.get("encounterId")?.trim()) void loadCharges();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot seed from URL
  }, [session?.authenticated]);

  async function onSeed() {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedDemoTariff(hospitalId || undefined);
      setMessage(`Seeded ${res.created.length} tariff items`);
      await loadCatalog();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  async function onPostCharge() {
    if (!canWrite) return;
    if (!encounterId.trim() || !hospitalId.trim()) {
      setError("Encounter ID and hospital ID are required");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await postCharge({
        encounter_id: encounterId.trim(),
        hospital_id: hospitalId.trim(),
        billing_code: billingCode,
        quantity,
        place_of_supply_state: placeOfSupply,
        hospital_state: hospitalState,
        performer_practitioner_id: session?.practitioner_id ?? undefined,
      });
      setMessage(`Posted charge ${res.charge.id}`);
      await loadCharges();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  function startVoid() {
    if (!canWrite) return;
    const billable = charges.filter((c) => selected.has(c.id) && c.status === "billable");
    if (billable.length === 0) {
      setError("Select one or more billable charges to void");
      return;
    }
    setError(null);
    setPending({ kind: "void", charges: billable });
  }

  async function confirmVoid() {
    if (!canWrite || pending?.kind !== "void") return;
    const billable = pending.charges;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      for (const c of billable) {
        await voidCharge(c.id);
      }
      setMessage(`Voided ${billable.length} charge(s)`);
      setPending(null);
      await loadCharges();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  function startAdjust() {
    if (!canWrite) return;
    const billable = charges.filter(
      (c) => selected.has(c.id) && (c.status === "billable" || c.status === "planned"),
    );
    if (billable.length !== 1) {
      setError("Select exactly one billable/planned charge to adjust");
      return;
    }
    const charge = billable[0];
    setError(null);
    setAdjustReason("");
    setAdjustPrice(charge.unit_price_inr != null ? String(charge.unit_price_inr) : "");
    setAdjustQty(charge.quantity != null ? String(charge.quantity) : "1");
    setPending({ kind: "adjust", charge });
  }

  async function confirmAdjust() {
    if (!canWrite || pending?.kind !== "adjust") return;
    if (!adjustReason.trim()) {
      setError("Adjustment reason is required");
      return;
    }
    const unit_price_inr =
      adjustPrice.trim() !== "" ? Number(adjustPrice) : undefined;
    const nextQty = adjustQty.trim() !== "" ? Number(adjustQty) : undefined;
    if (unit_price_inr != null && !Number.isFinite(unit_price_inr)) {
      setError("Invalid unit price");
      return;
    }
    if (nextQty != null && (!Number.isFinite(nextQty) || nextQty <= 0)) {
      setError("Invalid quantity");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await adjustCharge(pending.charge.id, {
        reason: adjustReason.trim(),
        quantity: nextQty,
        unit_price_inr,
      });
      setMessage(`Adjusted charge ${updated.id}`);
      setPending(null);
      await loadCharges();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  async function onIssueInvoice() {
    if (!canWrite) return;
    if (!encounterId.trim() || !hospitalId.trim()) {
      setError("Encounter ID and hospital ID are required");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const ids = selected.size > 0 ? Array.from(selected) : undefined;
      const res = await issueCashInvoice({
        encounter_id: encounterId.trim(),
        hospital_id: hospitalId.trim(),
        place_of_supply_state: placeOfSupply,
        hospital_state: hospitalState,
        charge_item_ids: ids,
      });
      setLastInvoice(res.invoice);
      const series = res.invoice.invoice_number ?? res.invoice.id;
      const gstin = res.invoice.hospital_gstin
        ? ` · GSTIN ${res.invoice.hospital_gstin}`
        : "";
      setMessage(
        `Invoice ${series}: net ₹${res.invoice.total_net_inr ?? "—"} / gross ₹${res.invoice.total_gross_inr ?? "—"}${gstin}`,
      );
      setSelected(new Set());
      setPending(null);
      await loadCharges();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  function startCredit() {
    if (!canWrite) return;
    if (!lastInvoice || selected.size === 0) {
      setError("Select billed charges and ensure an invoice was issued first");
      return;
    }
    setError(null);
    setCreditReason("");
    setPending({ kind: "credit" });
  }

  async function confirmCredit() {
    if (!canWrite || pending?.kind !== "credit" || !lastInvoice) return;
    if (!creditReason.trim()) {
      setError("Credit note reason is required");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await issueCreditNote({
        encounter_id: encounterId.trim(),
        hospital_id: hospitalId.trim(),
        place_of_supply_state: placeOfSupply,
        hospital_state: hospitalState,
        original_invoice_id: lastInvoice.id,
        charge_item_ids: Array.from(selected),
        reason: creditReason.trim(),
      });
      setMessage(`Credit note ${res.invoice.id} issued`);
      setSelected(new Set());
      setPending(null);
      await loadCharges();
    } catch (e) {
      setApiError(setError, e);
    } finally {
      setBusy(false);
    }
  }

  function toggleCharge(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItem = items.find((i) => i.code === billingCode);
  const primaryCoverage = coverages[0];

  return (
    <AdminLayout
      title="Billing desk"
      subtitle="Post charges on active visits (after start-visit or admit), cash invoices with GST, void/adjust, credit notes. Auto charges also post from those workflows and from lab/imaging results / supply issue."
    >
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      {!canWrite ? (
        <p className="muted">
          Read-only — need <code>billing:write</code> to post charges, issue invoices, or seed
          tariff.
        </p>
      ) : null}

      <section className="panel">
        <h2>Context</h2>
        <p className="muted">
          Pick an active visit from the <Link to="/census">Ops census</Link>
          {patientIdFromUrl ? (
            <>
              {" "}
              · patient <code>{patientIdFromUrl}</code>
            </>
          ) : null}
          .
        </p>
        <label>
          Encounter ID
          <input
            value={encounterId}
            onChange={(e) => setEncounterId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loadCharges();
            }}
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
            placeholder="HR"
          />
        </label>
        <label>
          Place of supply (state)
          <input
            value={placeOfSupply}
            onChange={(e) => setPlaceOfSupply(e.target.value.toUpperCase())}
            placeholder="HR"
          />
        </label>
        <div className="row">
          <button
            type="button"
            disabled={busy || !encounterId.trim()}
            onClick={() => void loadCharges()}
          >
            Load charges
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !canWrite || !import.meta.env.DEV}
            onClick={() => void onSeed()}
            title={import.meta.env.DEV ? undefined : "Demo seed is DEV-only"}
          >
            Seed demo tariff
          </button>
        </div>
        {primaryCoverage ? (
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Coverage payor <code>{primaryCoverage.payor_organization_id ?? "—"}</code>
            {primaryCoverage.contract_id ? (
              <>
                {" "}
                · contract <code>{primaryCoverage.contract_id}</code>
              </>
            ) : null}
            {coverages.length > 1 ? ` · +${coverages.length - 1} more` : ""}
          </p>
        ) : null}
        {packageCase ? (
          <p className="muted">
            Package case <code>{packageCase.package_code ?? packageCase.id}</code>
            {" · "}
            authorized LOS {packageCase.authorized_los_days}d
            {packageCase.status ? ` · ${packageCase.status}` : ""}
            {packageCase.start_date ? ` · since ${packageCase.start_date}` : ""}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Post charge</h2>
        {items.length === 0 ? (
          <p className="muted">No tariff items — seed the demo catalog first.</p>
        ) : null}
        <label>
          Billing item
          <select value={billingCode} onChange={(e) => setBillingCode(e.target.value)}>
            {items.length === 0 && <option value={billingCode}>{billingCode}</option>}
            {items.map((item) => (
              <option key={item.id} value={item.code}>
                {item.code} — {item.title}
                {item.item_type ? ` [${item.item_type}]` : ""}
                {item.base_amount_inr != null ? ` (₹${item.base_amount_inr})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            min={0.01}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        {selectedItem && (
          <p className="muted">
            HSN/SAC {selectedItem.hsn_sac ?? "—"} · GST {selectedItem.gst_rate_class ?? "—"}%
          </p>
        )}
        <button type="button" disabled={busy || !canWrite} onClick={() => void onPostCharge()}>
          Post charge
        </button>
      </section>

      <section className="panel">
        <h2>Charges ({charges.length})</h2>
        {charges.length === 0 ? (
          <p className="muted">No charges loaded for this encounter.</p>
        ) : (
          <ul className="list">
            {charges.map((c) => (
              <li key={c.id}>
                <label className="row">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleCharge(c.id)}
                  />
                  <span>
                    <strong>{c.display ?? c.code ?? c.id}</strong>
                    {c.code ? ` (${c.code})` : ""} · {c.status} · qty {c.quantity ?? 1} · ₹
                    {c.unit_price_inr ?? "—"}
                    {c.tariff_source ? (
                      <>
                        {" "}
                        <span className="badge">{c.tariff_source}</span>
                      </>
                    ) : null}
                    {c.liability ? (
                      <>
                        {" "}
                        <span className="badge">{c.liability}</span>
                      </>
                    ) : null}
                    {c.performer_id ? ` · dr ${c.performer_id}` : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" disabled={busy || !canWrite} onClick={() => void onIssueInvoice()}>
            Issue cash invoice
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !canWrite || selected.size === 0 || pending != null}
            onClick={startVoid}
          >
            Void selected
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !canWrite || selected.size !== 1 || pending != null}
            onClick={startAdjust}
          >
            Adjust selected
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !canWrite || !lastInvoice || selected.size === 0 || pending != null}
            onClick={startCredit}
          >
            Credit note
          </button>
        </div>

        {pending?.kind === "void" ? (
          <div className="billing-action-panel">
            <p>
              Void <strong>{pending.charges.length}</strong> billable charge
              {pending.charges.length === 1 ? "" : "s"}? This cannot be undone from the desk.
            </p>
            <div className="row">
              <button type="button" disabled={busy} onClick={() => void confirmVoid()}>
                {busy ? "Voiding…" : "Confirm void"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {pending?.kind === "adjust" ? (
          <div className="billing-action-panel">
            <h3>Adjust {pending.charge.display ?? pending.charge.code ?? pending.charge.id}</h3>
            <div className="form grid-2">
              <label>
                Reason (required)
                <input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  disabled={busy}
                  placeholder="Price correction / qty change"
                />
              </label>
              <label>
                Unit price INR
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={adjustPrice}
                  onChange={(e) => setAdjustPrice(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min={0.01}
                  step={1}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <div className="row">
              <button
                type="button"
                disabled={busy || !adjustReason.trim()}
                onClick={() => void confirmAdjust()}
              >
                {busy ? "Saving…" : "Apply adjustment"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {pending?.kind === "credit" ? (
          <div className="billing-action-panel">
            <h3>Credit note against {lastInvoice?.invoice_number ?? lastInvoice?.id}</h3>
            <p className="muted">
              {selected.size} selected charge{selected.size === 1 ? "" : "s"} will be credited.
            </p>
            <label>
              Reason (required)
              <input
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                disabled={busy}
                placeholder="Refund / billing error"
              />
            </label>
            <div className="row">
              <button
                type="button"
                disabled={busy || !creditReason.trim()}
                onClick={() => void confirmCredit()}
              >
                {busy ? "Issuing…" : "Issue credit note"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {lastInvoice && (
          <p className="muted">
            Last invoice: <code>{lastInvoice.invoice_number ?? lastInvoice.id}</code>
            {lastInvoice.invoice_number && lastInvoice.id !== lastInvoice.invoice_number ? (
              <>
                {" "}
                (<code>{lastInvoice.id}</code>)
              </>
            ) : null}{" "}
            · ₹{lastInvoice.total_gross_inr ?? "—"} gross
            {lastInvoice.hospital_gstin ? (
              <>
                {" "}
                · GSTIN <code>{lastInvoice.hospital_gstin}</code>
              </>
            ) : null}
          </p>
        )}
      </section>
    </AdminLayout>
  );
}
