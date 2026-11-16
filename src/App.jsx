import { useEffect, useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import "./App.css";

const TOKEN_KEY = "nursynch_token";

const FIELDS = [
  ["date", "Date", "text"], ["shift", "Shift", "text"],
  ["physicalExam", "Physical Exam", "number"], ["ftf", "FTF Consultation", "number"],
  ["online", "Online Consultation", "number"], ["admissions", "Admissions OR", "number"],
  ["referral", "Referral", "number"], ["death", "Death", "number"],
  ["minorProcedure", "Minor Procedure", "number"], ["dental", "Dental", "number"],
  ["medicalCertificate", "Medical Certificate", "number"], ["bp", "BP", "number"],
  ["rbs", "RBS", "number"], ["clearance", "Clearance", "number"],
  ["totalPatients", "Total # of Patients", "number"], ["grandTotal", "Grand Total", "number"],
  ["nod", "NOD (Nurse on Duty)", "text"],
];
const NUMBER_FIELDS = FIELDS.filter(([k, , t]) => t === "number");
const SHIFTS = ["Morning", "Afternoon", "Night", "24 Hours"];

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const blankForm = () => ({
  date: today(), shift: "Morning", nod: "", status: "Recorded", notes: "",
  ...Object.fromEntries(NUMBER_FIELDS.map(([k]) => [k, 0])),
});

async function api(token, method = "GET", body) {
  const res = await fetch("/api/entries", {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(res.status === 403 ? "This Google account is not on the allowed list." : "Request failed.");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export default function App() {
  const [view, setView] = useState("logbook");
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [grouped, setGrouped] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  const signOut = (msg = "") => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null); setEntries([]); setError(msg);
  };
  const onApiError = (e) => {
    if (e.status === 401 || e.status === 403) signOut(e.message === "Request failed." ? "Your session expired. Please sign in again." : e.message);
    else setError("Could not reach the logbook. Check your connection and try again.");
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api(token).then((rows) => { setEntries(rows); setError(""); }).catch(onApiError).finally(() => setLoading(false));
  }, [token]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        const text = FIELDS.map(([k]) => e[k] ?? "").join(" ").toLowerCase();
        return text.includes(q) && (!filterDate || e.date === filterDate);
      })
      .sort((a, b) =>
        grouped
          ? a.shift.localeCompare(b.shift) || b.date.localeCompare(a.date)
          : (b.date + " " + b.shift).localeCompare(a.date + " " + a.shift)
      );
  }, [entries, search, filterDate, grouped]);

  const selected = entries.find((e) => e.id === selectedId);
  const totalPatients = entries.reduce((s, e) => s + (Number(e.totalPatients) || 0), 0);
  const recorded = entries.filter((e) => e.status === "Recorded").length;

  const goTo = (v) => {
    setView(v);
    if (v === "new") { setView("logbook"); setFormOpen(true); }
  };
  const openForm = () => { setView("logbook"); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setForm(blankForm()); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (ev) => {
    ev.preventDefault();
    const body = { ...form, nod: form.nod.trim(), notes: form.notes.trim() };
    NUMBER_FIELDS.forEach(([k]) => { body[k] = String(Math.max(0, Number(body[k]) || 0)); });
    setSaving(true);
    try {
      const saved = await api(token, "POST", body);
      setEntries((prev) => [saved, ...prev]);
      setSelectedId(saved.id);
      setSearch(""); setFilterDate("");
      setError("");
      closeForm();
    } catch (e) { onApiError(e); }
    finally { setSaving(false); }
  };

  const exportCsv = () => {
    const cols = [...FIELDS.map(([k]) => k), "status", "notes"];
    const q = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const csv = [cols.map(q).join(","), ...entries.map((e) => cols.map((k) => q(e[k])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "nursynch-daily-logbook.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const navItems = [["logbook", "Logbook"], ["new", "New Entry"], ["reports", "Reports / Export"], ["about", "About UgnayLunas"]];

  if (!token) {
    return (
      <main className="wrap" style={{ maxWidth: 480, textAlign: "center", marginTop: 80 }}>
        <div className="seal" style={{ margin: "0 auto 16px" }}></div>
        <h2 style={{ color: "var(--purple)", fontFamily: "'EB Garamond',Georgia,serif", fontWeight: 400, margin: 0 }}>UgnayLunas</h2>
        <p className="muted">Sign in with an authorized Google account to open the infirmary logbook.</p>
        {error && <div className="notice" role="alert">{error}</div>}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <GoogleLogin
            onSuccess={(r) => { sessionStorage.setItem(TOKEN_KEY, r.credential); setError(""); setToken(r.credential); }}
            onError={() => setError("Google sign-in failed. Please try again.")}
          />
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <div className="seal" aria-label="MSU–General Santos text mark"></div>
          <div>
            <h1>Mindanao State University–General Santos</h1>
            <p>University Infirmary · Nursing Services Logbook</p>
            <div className="accent" />
          </div>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map(([id, label]) => (
            <button key={id} className={view === id || (id === "new" && formOpen && view === "logbook") ? "active" : ""} onClick={() => goTo(id)}>
              {label}
            </button>
          ))}
          <button style={{ marginLeft: "auto" }} onClick={() => signOut()}>Sign out</button>
        </nav>
      </header>

      <main className="wrap">
        <section className="heading">
          <div><h2>UgnayLunas</h2><div className="muted">Nursing Services Synchronization System</div></div>
        </section>

        {error && <div className="notice" role="alert">{error}</div>}
        {loading && <div className="muted" style={{ marginBottom: 12 }}>Loading entries…</div>}

        <section className="stats">
          <div className="stat"><span>Logbook Entries</span><strong>{entries.length}</strong></div>
          <div className="stat"><span>Total Patients (all entries)</span><strong>{totalPatients}</strong></div>
          <div className="stat"><span>Recorded Entries</span><strong>{recorded}</strong></div>
        </section>

        {view === "logbook" && (
          <section className="panel">
            <div className="panelhead">
              <div>
                <h3>Nursing Services Daily Logbook</h3>
                <div className="muted">Scroll horizontally to view all logbook columns</div>
              </div>
              <span className="muted">MSU–General Santos Infirmary</span>
            </div>

            <div className="toolbar">
              <button className={!grouped ? "active" : ""} onClick={() => setGrouped(false)}>Flat View</button>
              <button className={grouped ? "active" : ""} onClick={() => setGrouped(true)}>Group by Shift</button>
              <input className="search" type="search" placeholder="Search date, shift, NOD..." aria-label="Search logbook entries" value={search} onChange={(e) => setSearch(e.target.value)} />
              <label className="muted" htmlFor="filterDate">Date</label>
              <input id="filterDate" type="date" style={{ width: "auto", minWidth: 145 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
              <button onClick={() => { setSearch(""); setFilterDate(""); }}>Clear</button>
              <button className="primary" onClick={openForm}>+ New Entry</button>
            </div>

            {formOpen && (
              <div className="formarea">
                <h3>Create Daily Logbook Entry</h3>
                <p className="form-note">Enter the daily counts for the selected date and shift. Counts are recorded exactly as entered; totals are not automatically calculated because service categories may overlap.</p>
                <form onSubmit={submit}>
                  <div className="grid">
                    <div className="field">
                      <label htmlFor="date">Date</label>
                      <input id="date" type="date" required autoFocus value={form.date} onChange={(e) => setField("date", e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="shift">Shift</label>
                      <select id="shift" value={form.shift} onChange={(e) => setField("shift", e.target.value)}>
                        {SHIFTS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    {NUMBER_FIELDS.map(([k, label]) => (
                      <div className="field" key={k}>
                        <label htmlFor={k}>{label}</label>
                        <input id={k} type="number" min="0" step="1" required value={form[k]} onChange={(e) => setField(k, e.target.value)} />
                      </div>
                    ))}
                    <div className="field">
                      <label htmlFor="nod">NOD (Nurse on Duty)</label>
                      <input id="nod" maxLength={120} required placeholder="Nurse on duty" value={form.nod} onChange={(e) => setField("nod", e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="status">Entry Status</label>
                      <select id="status" value={form.status} onChange={(e) => setField("status", e.target.value)}>
                        <option>Recorded</option><option>For Review</option>
                      </select>
                    </div>
                    <div className="field full">
                      <label htmlFor="notes">Notes (optional; no patient-identifying information)</label>
                      <textarea id="notes" rows={3} maxLength={1000} placeholder="General operational notes, if needed" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
                    </div>
                  </div>
                  <div className="actions">
                    <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Logbook Entry"}</button>
                    <button type="button" onClick={closeForm}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <div className="tablewrap">
              <table>
                <thead>
                  <tr>{FIELDS.map(([k, label]) => <th key={k} scope="col">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className={e.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(e.id)}>
                      {FIELDS.map(([k, , type]) => (
                        <td key={k} className={type === "number" ? "number-cell" : ""}>{e[k] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && <div className="empty">No entries match your search or date filter.</div>}
            </div>

            <div className="details">
              <h4>{selected ? "Selected Logbook Entry" : "Entry Details"}</h4>
              {selected ? (
                <>
                  <p className="muted">{selected.date} · {selected.shift} shift · NOD: {selected.nod} · Status: {selected.status}</p>
                  <p>Notes: {selected.notes || "None provided"}</p>
                  <span className={"badge " + (selected.status === "Recorded" ? "ok" : "pending")}>{selected.status}</span>
                </>
              ) : (
                <div className="muted">Select a row to view its details.</div>
              )}
            </div>
          </section>
        )}

        {view === "reports" && (
          <section className="panel report-panel">
            <h3>Reports and Export</h3>
            <p>Download the entries currently saved in this browser as a CSV spreadsheet. Open it in Excel or Google Sheets. Use fictional data only.</p>
            <button className="primary" onClick={exportCsv}>Export Logbook to CSV</button>
          </section>
        )}

        {view === "about" && (
          <section className="panel report-panel">
            <h3>About UgnayLunas</h3>
            <p>UgnayLunas (Nursing Services Synchronization System) is a proposed web-based daily logbook for recording infirmary service counts by date and shift, with a format intended to support nursing documentation and administrative review.</p>
            <p className="muted">This is an academic prototype, not an official MSU system. The text-based university heading is a placeholder and does not reproduce an official seal or wordmark.</p>
          </section>
        )}
      </main>

      <footer className="footer">UgnayLunas · Proposed MSU–General Santos Infirmary system · Academic prototype</footer>
    </>
  );
}