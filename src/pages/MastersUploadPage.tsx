import { useMemo, useState } from "react";
import { uploadMasters, type MasterKind, type MasterUploadResponse } from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { hasPermission } from "../components/RequirePermission";
import { useAuth } from "../context/AuthContext";

const KINDS: { value: MasterKind; label: string; hint: string }[] = [
  { value: "billing-items", label: "Billing items", hint: "Item master (code, title, type, default amount)" },
  { value: "schedule-of-charges", label: "Schedule of charges", hint: "SOC rows bound to a schedule_id" },
  { value: "gst-rates", label: "GST rates", hint: "Rate class → percent / HSN" },
  { value: "payors", label: "Payors", hint: "Insurer Organizations" },
  { value: "vendors", label: "Vendors", hint: "Supply vendor Organizations" },
  { value: "lab-catalog", label: "Lab catalog", hint: "LOINC orderables + billing codes" },
  { value: "imaging-catalog", label: "Imaging catalog", hint: "Imaging orderables + billing codes" },
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

export default function MastersUploadPage() {
  const { session } = useAuth();
  const canWrite = hasPermission(session, "billing:write");
  const [kind, setKind] = useState<MasterKind>("billing-items");
  const [hospitalId, setHospitalId] = useState(session?.hospital_id ?? "atrius-gurugram");
  const [scheduleId, setScheduleId] = useState("soc-cash-op");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MasterUploadResponse | null>(null);
  const [committed, setCommitted] = useState<MasterUploadResponse | null>(null);

  const kindMeta = useMemo(() => KINDS.find((k) => k.value === kind), [kind]);

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
      setError(e instanceof Error ? e.message : String(e));
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
        <p className="muted">Need billing:write to upload masters.</p>
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
            {kindMeta?.hint}
          </p>
          <label>
            Hospital ID
            <input
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              disabled={!canWrite}
            />
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
            placeholder="code,title,..."
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
            <ul className="admit-match-list">
              {preview.errors.map((err) => (
                <li key={`${err.row}-${err.message}`}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="success">No row errors — safe to commit.</p>
          )}
          {preview.resource_ids.length > 0 ? (
            <p className="muted">
              Sample ids: {preview.resource_ids.slice(0, 8).join(", ")}
              {preview.resource_ids.length > 8 ? "…" : ""}
            </p>
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
