import { useEffect, useMemo, useState } from "react";
import {
  listHospitals,
  uploadMasters,
  type HospitalSummary,
  type MasterKind,
  type MasterUploadResponse,
} from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { hasPermission } from "../components/RequirePermission";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../api/bff";

const CSV_TEMPLATES: Record<MasterKind, string> = {
  "billing-items":
    "code,title,item_type,hsn_sac,gst_rate_class,department_id,effective_from\n",
  "schedule-of-charges":
    "code,title,item_type,base_amount_inr,hsn_sac,gst_rate_class,schedule_id,payer_org,bed_category,visit_class,effective_from\n",
  "gst-rates": "hsn_sac,gst_rate_class,effective_from,effective_to\n",
  payors: "code,name,phone,email\n",
  vendors: "code,name,phone,email\n",
  "lab-catalog": "code,display,billing_code\n",
  "imaging-catalog": "code,display,billing_code\n",
  "payer-contracts":
    "payor_org,schedule_id,category,hospital_id,title,effective_from,default_discount_pct,discount_pharmacy_pct,discount_lab_pct,uncontracted_behavior,cash_schedule_id\n",
  packages:
    "package_code,title,schedule_id,payer_org,bed_category,package_amount_inr,included_los_days,included_item_types,excluded_codes,beyond_los_policy,per_day_rate\n",
  "payer-code-maps": "payer_org,payer_code,payer_display,hospital_billing_code\n",
};

const KINDS: { value: MasterKind; label: string; hint: string }[] = [
  { value: "billing-items", label: "Billing items", hint: "Item master (code, title, type, default amount)" },
  { value: "schedule-of-charges", label: "Schedule of charges", hint: "SOC rows bound to a schedule_id" },
  { value: "gst-rates", label: "GST rates", hint: "Rate class → percent / HSN" },
  { value: "payors", label: "Payors", hint: "Insurer Organizations" },
  { value: "vendors", label: "Vendors", hint: "Supply vendor Organizations" },
  { value: "lab-catalog", label: "Lab catalog", hint: "LOINC orderables + billing codes" },
  { value: "imaging-catalog", label: "Imaging catalog", hint: "Imaging orderables + billing codes" },
  {
    value: "payer-contracts",
    label: "Payer contracts",
    hint: "Contract headers (payor, schedule, discounts, uncontracted behavior)",
  },
  {
    value: "packages",
    label: "Packages",
    hint: "Package definitions (LOS, included types, beyond-LOS policy)",
  },
  {
    value: "payer-code-maps",
    label: "Payer code maps",
    hint: "Payer terminology → hospital billing codes",
  },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const b64 = result.includes(",") ? result.split(",", 2)[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function downloadTemplate(kind: MasterKind) {
  const blob = new Blob([CSV_TEMPLATES[kind]], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MastersUploadPage() {
  const { session } = useAuth();
  const canWrite =
    hasPermission(session, "billing:write") || hasPermission(session, "tariff:write");
  const [kind, setKind] = useState<MasterKind>("billing-items");
  const [hospitals, setHospitals] = useState<HospitalSummary[]>([]);
  const [hospitalId, setHospitalId] = useState(session?.hospital_id ?? "");
  const [scheduleId, setScheduleId] = useState("soc-cash-op");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MasterUploadResponse | null>(null);
  const [committed, setCommitted] = useState<MasterUploadResponse | null>(null);

  const kindMeta = useMemo(() => KINDS.find((k) => k.value === kind), [kind]);

  useEffect(() => {
    let cancelled = false;
    void listHospitals()
      .then((res) => {
        if (cancelled) return;
        setHospitals(res.hospitals ?? []);
        setHospitalId((prev) => {
          if (prev) return prev;
          return session?.hospital_id ?? res.hospitals?.[0]?.id ?? "";
        });
      })
      .catch(() => {
        /* keep free-text fallback via session hospital */
      });
    return () => {
      cancelled = true;
    };
  }, [session?.hospital_id]);

  async function runUpload(dryRun: boolean) {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    if (dryRun) {
      setPreview(null);
      setCommitted(null);
    }
    try {
      let csv: string | undefined;
      let xlsx_base64: string | undefined;
      if (file) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          xlsx_base64 = await fileToBase64(file);
        } else {
          csv = await file.text();
        }
      } else if (csvText.trim()) {
        csv = csvText;
      } else {
        setError("Choose a CSV/XLSX file or paste CSV text");
        setBusy(false);
        return;
      }
      const res = await uploadMasters({
        kind,
        dry_run: dryRun,
        csv,
        xlsx_base64,
        hospital_id: hospitalId.trim() || undefined,
        schedule_id: scheduleId.trim() || undefined,
      });
      if (dryRun) setPreview(res);
      else setCommitted(res);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      title="Masters upload"
      subtitle="Dry-run CSV/XLSX masters, then commit to Clinical HFS. CLI escape hatch: scripts/upload-masters.py"
    >
      {error ? <p className="error">{error}</p> : null}
      {!canWrite ? (
        <p className="muted">Need billing:write or tariff:write to upload masters.</p>
      ) : null}

      <section className="panel">
        <h2>1. Kind</h2>
        <div className="form grid-2">
          <label>
            Master kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MasterKind)}
              disabled={!canWrite}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ alignSelf: "end" }}>
            {kindMeta?.hint}{" "}
            <button
              type="button"
              className="ghost"
              disabled={!canWrite}
              onClick={() => downloadTemplate(kind)}
            >
              Download CSV template
            </button>
          </p>
          <label>
            Hospital
            {hospitals.length > 0 ? (
              <select
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                disabled={!canWrite}
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name ?? h.id}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                disabled={!canWrite}
                placeholder="atrius-gurugram"
              />
            )}
          </label>
          <label>
            Schedule ID (SOC / items)
            <input
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
              disabled={!canWrite}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>2. Upload</h2>
        <label>
          CSV or XLSX file
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            disabled={!canWrite || busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setCommitted(null);
            }}
          />
        </label>
        <label>
          Or paste CSV
          <textarea
            rows={8}
            value={csvText}
            disabled={!canWrite || busy}
            onChange={(e) => {
              setCsvText(e.target.value);
              setFile(null);
              setPreview(null);
              setCommitted(null);
            }}
            placeholder={CSV_TEMPLATES[kind].trim()}
          />
        </label>
        <div className="row">
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => void runUpload(true)}
          >
            Dry-run preview
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!canWrite || busy || !preview || preview.rejected > 0}
            onClick={() => void runUpload(false)}
            title={
              preview && preview.rejected > 0
                ? "Fix row errors before commit"
                : "Write accepted rows to HFS"
            }
          >
            Commit
          </button>
        </div>
      </section>

      {preview ? (
        <section className="panel">
          <h2>3. Dry-run result</h2>
          <p>
            Accepted <strong>{preview.accepted}</strong> · Rejected{" "}
            <strong>{preview.rejected}</strong>
            {preview.dry_run ? " (dry-run)" : ""}
          </p>
          {preview.errors.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors.map((err) => (
                  <tr key={`${err.row}-${err.message}`}>
                    <td>{err.row}</td>
                    <td>{err.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="success">No row errors — safe to commit.</p>
          )}
          {preview.resource_ids.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Would write / sample id</th>
                </tr>
              </thead>
              <tbody>
                {preview.resource_ids.slice(0, 20).map((id, i) => (
                  <tr key={id}>
                    <td>{i + 1}</td>
                    <td>
                      <code>{id}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {preview.resource_ids.length > 20 ? (
            <p className="muted">…and {preview.resource_ids.length - 20} more</p>
          ) : null}
        </section>
      ) : null}

      {committed ? (
        <section className="panel">
          <h2>Committed</h2>
          <p className="success">
            Wrote {committed.accepted} resources
            {committed.rejected ? ` · ${committed.rejected} skipped` : ""}.
          </p>
        </section>
      ) : null}
    </AdminLayout>
  );
}
