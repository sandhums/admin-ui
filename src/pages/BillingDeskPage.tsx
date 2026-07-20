import { useCallback, useEffect, useState } from "react";
import {
  adjustCharge,
  issueCashInvoice,
  issueCreditNote,
  listBillingItems,
  listEncounterCharges,
  postCharge,
  seedDemoTariff,
  voidCharge,
  type BillingItemSummary,
  type ChargeSummary,
  type InvoiceSummary,
} from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { hospitalGstState } from "../constants";
import { useAuth } from "../context/AuthContext";

export default function BillingDeskPage() {
  const { session } = useAuth();
  const [encounterId, setEncounterId] = useState("");
  const [hospitalId, setHospitalId] = useState(session?.hospital_id ?? "");
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
  const [lastInvoice, setLastInvoice] = useState<InvoiceSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const loadCatalog = useCallback(async () => {
    try {
      const res = await listBillingItems();
      setItems(res.items);
      setBillingCode((prev) => {
        if (res.items.some((i) => i.code === prev)) return prev;
        return res.items[0]?.code ?? prev;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadCharges = useCallback(async () => {
    if (!encounterId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await listEncounterCharges(encounterId.trim());
      setCharges(res.charges);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCharges([]);
    } finally {
      setBusy(false);
    }
  }, [encounterId]);

  useEffect(() => {
    if (!session?.authenticated) return;
    void loadCatalog();
  }, [session?.authenticated, loadCatalog]);

  async function onSeed() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await seedDemoTariff(hospitalId || undefined);
      setMessage(`Seeded ${res.created.length} tariff items`);
      await loadCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPostCharge() {
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onVoidSelected() {
    const billable = charges.filter((c) => selected.has(c.id) && c.status === "billable");
    if (billable.length === 0) {
      setError("Select one or more billable charges to void");
      return;
    }
    if (!window.confirm(`Void ${billable.length} charge(s)?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      for (const c of billable) {
        await voidCharge(c.id);
      }
      setMessage(`Voided ${billable.length} charge(s)`);
      await loadCharges();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAdjustSelected() {
    const billable = charges.filter(
      (c) => selected.has(c.id) && (c.status === "billable" || c.status === "planned"),
    );
    if (billable.length !== 1) {
      setError("Select exactly one billable/planned charge to adjust");
      return;
    }
    const reason = window.prompt("Adjustment reason");
    if (!reason?.trim()) return;
    const priceRaw = window.prompt(
      "New unit price INR (leave blank to keep)",
      billable[0].unit_price_inr != null ? String(billable[0].unit_price_inr) : "",
    );
    const qtyRaw = window.prompt(
      "New quantity (leave blank to keep)",
      billable[0].quantity != null ? String(billable[0].quantity) : "1",
    );
    const unit_price_inr =
      priceRaw != null && priceRaw.trim() !== "" ? Number(priceRaw) : undefined;
    const nextQty = qtyRaw != null && qtyRaw.trim() !== "" ? Number(qtyRaw) : undefined;
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
      const updated = await adjustCharge(billable[0].id, {
        reason: reason.trim(),
        quantity: nextQty,
        unit_price_inr,
      });
      setMessage(`Adjusted charge ${updated.id}`);
      await loadCharges();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onIssueInvoice() {
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
      setMessage(
        `Invoice ${res.invoice.id}: net ₹${res.invoice.total_net_inr ?? "—"} / gross ₹${res.invoice.total_gross_inr ?? "—"}`,
      );
      setSelected(new Set());
      await loadCharges();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreditNote() {
    if (!lastInvoice || selected.size === 0) {
      setError("Select billed charges and ensure an invoice was issued first");
      return;
    }
    const reason = window.prompt("Credit note reason");
    if (!reason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await issueCreditNote({
        encounter_id: encounterId.trim(),
        hospital_id: hospitalId.trim(),
        place_of_supply_state: placeOfSupply,
        hospital_state: hospitalState,
        original_invoice_id: lastInvoice.id,
        charge_item_ids: Array.from(selected),
        reason: reason.trim(),
      });
      setMessage(`Credit note ${res.invoice.id} issued`);
      setSelected(new Set());
      await loadCharges();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  return (
    <AdminLayout
      title="Billing desk"
      subtitle="Post charges on active visits (after start-visit or admit), cash invoices with GST, void/adjust, credit notes. Auto charges also post from those workflows and from lab/imaging results / supply issue."
    >
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <section className="panel">
        <h2>Context</h2>
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
          <button type="button" className="ghost" disabled={busy} onClick={() => void onSeed()}>
            Seed demo tariff
          </button>
        </div>
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
        <button type="button" disabled={busy} onClick={() => void onPostCharge()}>
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
                    {c.performer_id ? ` · dr ${c.performer_id}` : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void onIssueInvoice()}>
            Issue cash invoice
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || selected.size === 0}
            onClick={() => void onVoidSelected()}
          >
            Void selected
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || selected.size !== 1}
            onClick={() => void onAdjustSelected()}
          >
            Adjust selected
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !lastInvoice}
            onClick={() => void onCreditNote()}
          >
            Credit note
          </button>
        </div>
        {lastInvoice && (
          <p className="muted">
            Last invoice: {lastInvoice.id} (₹{lastInvoice.total_gross_inr ?? "—"} gross)
          </p>
        )}
      </section>
    </AdminLayout>
  );
}
