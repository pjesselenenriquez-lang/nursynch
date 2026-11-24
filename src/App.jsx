import { useEffect, useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import "./App.css";

const TOKEN_KEY = "nursynch_token";

// Checklist of reasons for visit (CHECKBOXES, pick one or more)
const SERVICES = [
  "Physical Exam", "FTF Consultation", "Online Consultation", "Referral",
  "Minor Procedure", "Dental", "Medical Certificate", "BP", "RBS", "Clearance",
];
// Code (RADIO, pick one)
const CODES = { S: "Student", O: "Outsider" };
// Patient evaluation (RADIO, pick one)
const RATINGS = [[5, "Excellent"], [4, "Very Good"], [3, "Good"], [2, "Fair"], [1, "Poor"]];

// [key, label, format]  format: text | list | code | rating
const FIELDS = [
  ["recordNo", "Record / Control No.", "text"],
  ["date", "Date", "text"],
  ["timeIn", "Time In", "text"],
  ["timeOut", "Time Out", "text"],
  ["code", "Code (S/O)", "code"],
  ["name", "Name", "text"],
  ["college", "College/Department", "text"],
  ["services", "Reason for Visit", "list"],
  ["rating", "Evaluation", "rating"],
  ["comments", "Evaluation Comments", "text"],
];

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const nowTime = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

const blankForm = () => ({ date: today(), timeIn: nowTime(), code: "S", name: "", college: "", services: [] });
const blankOut = (id) => ({ id, timeOut: nowTime(), rating: 0, comments: "" });

const show = (e, k, type) => {
  const v = e[k];
  if (type === "list") return Array.isArray(v) ? v.join(", ") : v ?? "";
  if (type === "code") return v ? v + " – " + (CODES[v] || "") : "";
  if (type === "rating") return Number(v) ? v + " – " + ((RATINGS.find(([n]) => n === Number(v)) || [])[1] || "") : "";
  return v ?? "";
};

async function api(token, method = "GET", body, id) {
  const res = await fetch("/api/entries" + (id ? "?id=" + encodeURIComponent(id) : ""), {
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

const group = { display: "flex", flexWrap: "wrap", gap: "8px 18px" };
const opt = { display: "flex", alignItems: "center", gap: 6, fontWeight: 400 };

export default function App() {
  const [view, setView] = useState("logbook");
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [out, setOut] = useState(null); // time-out + evaluation form

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
        const text = FIELDS.map(([k, , t]) => show(e, k, t)).join(" ").toLowerCase();
        return text.includes(q) && (!filterDate || e.date === filterDate);
      })
      .sort((a, b) => (b.date + " " + b.timeIn).localeCompare(a.date + " " + a.timeIn));
  }, [entries, search, filterDate]);

  const selected = entries.find((e) => e.id === selectedId);
  const todayCount = entries.filter((e) => e.date === today()).length;
  const inside = entries.filter((e) => !e.timeOut).length;
  const rated = entries.filter((e) => Number(e.rating) > 0);
  const avg = rated.length ? (rated.reduce((s, e) => s + Number(e.rating), 0) / rated.length).toFixed(1) : "–";

  // Control No. format: YYYYMMDD-001 (counts per date). Ideally assigned by the server.
  const nextRecordNo = (date) =>
    date.replaceAll("-", "") + "-" + String(entries.filter((e) => e.date === date).length + 1).padStart(3, "0");

  const openForm = () => { setView("logbook"); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setForm(blankForm()); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleService = (s) =>
    setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));
  const goTo = (v) => (v === "new" ? openForm() : setView(v));

  const submit = async (ev) => {
    ev.preventDefault();
    if (form.services.length === 0) { setError("Please tick at least one reason for visit."); return; }
    const body = {
      ...form,
      name: form.name.trim(),
      college: form.college.trim(),
      recordNo: nextRecordNo(form.date),
      timeOut: "", rating: 0, comments: "",
    };
    setSaving(true);
    try {
      const saved = await api(token, "POST", body);
      setEntries((prev) => [saved, ...prev]);
      setSelectedId(saved.id);
      setSearch(""); setFilterDate(""); setError("");
      closeForm();
    } catch (e) { onApiError(e); }
    finally { setSaving(false); }
  };

  const submitOut = async (ev) => {
    ev.preventDefault();
    if (!out.rating) { setError("Please choose an evaluation rating."); return; }
    setSaving(true);
    try {
      const patch = { timeOut: out.timeOut, rating: out.rating, comments: out.comments.trim() };
      const saved = await api(token, "PATCH", patch, out.id);
      setEntries((prev) => prev.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)));
      setError(""); setOut(null);
    } catch (e) { onApiError(e); }
    finally { setSaving(false); }
  };

  const exportCsv = () => {
    const q = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const rows = entries.map((e) => FIELDS.map(([k, , t]) => (t === "list" ? (e[k] || []).join("; ") : e[k])));
    const csv = [FIELDS.map(([k]) => q(k)).join(","), ...rows.map((r) => r.map(q).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "ugnaylunas-entrance-logbook.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const navItems = [["logbook", "Logbook"], ["new", "New Entry"], ["reports", "Reports / Export"], ["about", "About UgnayLunas"]];

  if (!token) {
    return (
      <main className="wrap" style={{ maxWidth: 480, textAlign: "center", marginTop: 80 }}>
        <div className="seal" style={{ margin: "0 auto 16px" }}></div>
        <h2 style={{ color: "var(--purple)", fontFamily: "'EB Garamond',Georgia,serif", fontWeight: 400, margin: 0 }}>UgnayLunas</h2>
        <p className="muted">Sign in with a Google account to open the infirmary entrance logbook.</p>
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
            <p>University Infirmary · Entrance Logbook</p>
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
          <div><h2>UgnayLunas</h2><div className="muted">Infirmary Entrance Logbook</div></div>
        </section>

        {error && <div className="notice" role="alert">{error}</div>}
        {loading && <div className="muted" style={{ marginBottom: 12 }}>Loading entries…</div>}

        <section className="stats">
          <div className="stat"><span>Visits Today</span><strong>{todayCount}</strong></div>
          <div className="stat"><span>Currently Inside (no Time Out)</span><strong>{inside}</strong></div>
          <div className="stat"><span>Average Evaluation (1–5)</span><strong>{avg}</strong></div>
        </section>

        {view === "logbook" && (
          <section className="panel">
            <div className="panelhead">
              <div>
                <h3>Entrance Logbook</h3>
                <div className="muted">Scroll horizontally to view all columns</div>
              </div>
              <span className="muted">MSU–General Santos Infirmary</span>
            </div>

            <div className="toolbar">
              <input className="search" type="search" placeholder="Search name, record no., college..." aria-label="Search logbook entries" value={search} onChange={(e) => setSearch(e.target.value)} />
              <label className="muted" htmlFor="filterDate">Date</label>
              <input id="filterDate" type="date" style={{ width: "auto", minWidth: 145 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
              <button onClick={() => { setSearch(""); setFilterDate(""); }}>Clear</button>
              <button className="primary" onClick={openForm}>+ New Entry</button>
            </div>

            {formOpen && (
              <div className="formarea">
                <h3>Patient Entry (Time In)</h3>
                <p className="form-note">Please fill in your details and tick the reason for your visit. Do not write diagnoses or medical details here. Your Time Out and evaluation are recorded when you leave.</p>
                <form onSubmit={submit}>
                  <div className="grid">
                    <div className="field">
                      <label htmlFor="recordNo">Record / Control No. (automatic)</label>
                      <input id="recordNo" readOnly value={nextRecordNo(form.date)} />
                    </div>
                    <div className="field">
                      <label htmlFor="date">Date</label>
                      <input id="date" type="date" required value={form.date} onChange={(e) => setField("date", e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="timeIn">Time In</label>
                      <input id="timeIn" type="time" required value={form.timeIn} onChange={(e) => setField("timeIn", e.target.value)} />
                    </div>
                    <div className="field">
                      <label id="codeLabel">Code (choose one)</label>
                      <div style={group} role="radiogroup" aria-labelledby="codeLabel">
                        {Object.entries(CODES).map(([c, label]) => (
                          <label key={c} style={opt}>
                            <input type="radio" name="code" style={{ width: "auto" }} checked={form.code === c} onChange={() => setField("code", c)} />
                            {c} – {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="name">Name (type your full name)</label>
                      <input id="name" maxLength={120} required placeholder="Full name" value={form.name} onChange={(e) => setField("name", e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="college">College/Department (type)</label>
                      <input id="college" maxLength={120} required placeholder="e.g., College of Nursing" value={form.college} onChange={(e) => setField("college", e.target.value)} />
                    </div>
                    <div className="field full">
                      <label id="svcLabel">Reason for Visit (tick all that apply)</label>
                      <div style={group} role="group" aria-labelledby="svcLabel">
                        {SERVICES.map((s) => (
                          <label key={s} style={opt}>
                            <input type="checkbox" style={{ width: "auto" }} checked={form.services.includes(s)} onChange={() => toggleService(s)} />
                            {s}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="actions">
                    <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Entry"}</button>
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
                      {FIELDS.map(([k, , t]) => <td key={k}>{show(e, k, t)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && <div className="empty">No entries match your search or date filter.</div>}
            </div>

            <div className="details">
              <h4>{selected ? "Selected Entry" : "Entry Details"}</h4>
              {selected ? (
                <>
                  <p className="muted">
                    {selected.recordNo} · {selected.date} · In {selected.timeIn} · Out {selected.timeOut || "—"}
                  </p>
                  <p>{selected.name} · {selected.college} · {show(selected, "code", "code")}</p>
                  <p>Reason for visit: {show(selected, "services", "list")}</p>
                  <span className={"badge " + (selected.timeOut ? "ok" : "pending")}>{selected.timeOut ? "Completed" : "Inside"}</span>

                  {!selected.timeOut && !(out && out.id === selected.id) && (
                    <div style={{ marginTop: 12 }}>
                      <button className="primary" onClick={() => setOut(blankOut(selected.id))}>Time Out &amp; Evaluate</button>
                    </div>
                  )}

                  {out && out.id === selected.id && (
                    <form onSubmit={submitOut} style={{ marginTop: 14 }}>
                      <div className="grid">
                        <div className="field">
                          <label htmlFor="timeOut">Time Out</label>
                          <input id="timeOut" type="time" required value={out.timeOut} onChange={(e) => setOut({ ...out, timeOut: e.target.value })} />
                        </div>
                        <div className="field full">
                          <label id="rateLabel">Patient Evaluation: How was the service you received? (choose one)</label>
                          <div style={group} role="radiogroup" aria-labelledby="rateLabel">
                            {RATINGS.map(([n, label]) => (
                              <label key={n} style={opt}>
                                <input type="radio" name="rating" style={{ width: "auto" }} checked={out.rating === n} onChange={() => setOut({ ...out, rating: n })} />
                                {n} – {label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="field full">
                          <label htmlFor="comments">Comments or suggestions (optional, type)</label>
                          <textarea id="comments" rows={3} maxLength={500} value={out.comments} onChange={(e) => setOut({ ...out, comments: e.target.value })} />
                        </div>
                      </div>
                      <div className="actions">
                        <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Time Out"}</button>
                        <button type="button" onClick={() => setOut(null)}>Cancel</button>
                      </div>
                    </form>
                  )}

                  {selected.timeOut && (
                    <p className="muted" style={{ marginTop: 10 }}>
                      Evaluation: {show(selected, "rating", "rating") || "None"}{selected.comments ? " · " + selected.comments : ""}
                    </p>
                  )}
                </>
              ) : (
                <div className="muted">Select a row to view details, or to record Time Out and evaluation.</div>
              )}
            </div>
          </section>
        )}

        {view === "reports" && (
          <section className="panel report-panel">
            <h3>Reports and Export</h3>
            <p>Download all loaded entries as a CSV spreadsheet. Open it in Excel or Google Sheets. Use fictional data only.</p>
            <button className="primary" onClick={exportCsv}>Export Logbook to CSV</button>
          </section>
        )}

        {view === "about" && (
          <section className="panel report-panel">
            <h3>About UgnayLunas</h3>
            <p>UgnayLunas is a proposed web-based entrance logbook for the university infirmary. Patients record their own visit: time in, time out, reason for visit, and an evaluation of the service received.</p>
            <p className="muted">This is an academic prototype, not an official MSU system. The text-based university heading is a placeholder and does not reproduce an official seal or wordmark.</p>
          </section>
        )}
      </main>

      <footer className="footer">UgnayLunas · Proposed MSU–General Santos Infirmary entrance logbook · Academic prototype</footer>
    </>
  );
}