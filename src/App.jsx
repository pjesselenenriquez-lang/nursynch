import { useEffect, useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import "./App.css";

const TOKEN_KEY = "nursynch_token";

// Checklist of reasons for visit (CHECKBOXES). Each ticked area is also evaluated at Time Out.
const SERVICES = [
  "Physical Exam", "FTF Consultation", "Online Consultation", "Referral",
  "Minor Procedure", "Dental", "Medical Certificate", "BP", "RBS", "Clearance",
];
// Code (RADIO, pick one)
const CODES = { S: "Student", E: "Employee", D: "Dependent", O: "Outsider" };
// Evaluation scale (RADIO, 1 to 5, one rating per area visited)
const RATINGS = [[5, "Excellent"], [4, "Very Good"], [3, "Good"], [2, "Fair"], [1, "Poor"]];
// Columns only the administrator account can see
const EVAL_KEYS = ["serviceRatings", "rating", "comments"];

// [key, label, format]  format: text | list | code | ratings | rating
const FIELDS = [
  ["recordNo", "Record / Control No.", "text"],
  ["date", "Date", "text"],
  ["timeIn", "Time In", "text"],
  ["timeOut", "Time Out", "text"],
  ["code", "Code (S/E/D/O)", "code"],
  ["name", "Name", "text"],
  ["college", "College/Department", "text"],
  ["services", "Reason for Visit", "list"],
  ["serviceRatings", "Ratings by Area", "ratings"],
  ["rating", "Overall Rating", "rating"],
  ["comments", "Evaluation Comments", "text"],
];

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const nowTime = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const mean = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);

const blankForm = () => ({ date: today(), timeIn: nowTime(), code: "S", name: "", college: "", services: [] });
const blankOut = (entry) => ({
  id: entry.id, timeOut: nowTime(), comments: "",
  ratings: Object.fromEntries((entry.services || []).map((s) => [s, 0])),
});

const show = (e, k, type) => {
  const v = e[k];
  if (type === "list") return Array.isArray(v) ? v.join(", ") : v ?? "";
  if (type === "code") return v ? v + " – " + (CODES[v] || "") : "";
  if (type === "ratings") return v && typeof v === "object" ? Object.entries(v).map(([a, n]) => a + ": " + n).join("; ") : "";
  if (type === "rating") return Number(v) > 0 ? Number(v).toFixed(1) + " / 5" : "";
  return v ?? "";
};

async function api(token, method = "GET", body, id, qs = "") {
  const url = "/api/entries" + (id ? "?id=" + encodeURIComponent(id) : qs ? "?" + qs : "");
  const res = await fetch(url, {
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

const group = { display: "flex", flexWrap: "wrap", gap: "10px 22px" };
const opt = { display: "flex", alignItems: "center", gap: 8, fontWeight: 400 };

// ---------- Effects, bigger text, minimalist background, login page ----------
const GLITTER_CSS = `
/* bigger text everywhere */
html{font-size:18px}
body{font-size:18px;line-height:1.55}
.brand h1{font-size:30px}
.brand p{font-size:15px}
.nav button{font-size:18px;padding:12px 20px}
.heading h2{font-size:52px}
.muted{font-size:17px}
.stat span{font-size:18px}
.stat strong{font-size:44px}
.panelhead h3,.report-panel h3{font-size:28px}
.formarea h3{font-size:26px}
.form-note,.notice,.report-panel p{font-size:17px}
label{font-size:17px}
input,select,textarea,button{font-size:17px}
th{font-size:16px}
td{font-size:17px}
.details h4{font-size:24px}
.details p{font-size:18px}
.badge{font-size:15px}
.footer{font-size:15px}

/* minimalist, elegant background: clean white fading to a soft grey-lavender */
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:linear-gradient(180deg,#ffffff 0%,#f6f4f8 100%)}
body::after{content:none}

/* login page */
.lg{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:100vh}
.lg-brand{background:linear-gradient(160deg,var(--purple,#6b0f5a),#3f0834);color:#fff;padding:64px 56px;
  display:flex;flex-direction:column;justify-content:center}
.lg-seal{width:92px;height:92px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 6px rgba(255,255,255,.18);margin-bottom:28px}
.lg-brand h1{font-family:'EB Garamond',Georgia,serif;font-weight:400;font-size:38px;line-height:1.2;margin:0 0 8px;color:#fff}
.lg-brand .lg-sub{letter-spacing:.14em;text-transform:uppercase;font-size:15px;opacity:.85;margin:0}
.lg-rule{width:72px;height:3px;background:#f5a623;margin:30px 0}
.lg-brand h3{font-family:'EB Garamond',Georgia,serif;font-weight:400;font-size:34px;margin:0 0 10px;color:#fff}
.lg-tag{font-size:19px;opacity:.9;max-width:440px;margin:0}
.lg-card{display:flex;flex-direction:column;justify-content:center;padding:56px;max-width:540px;width:100%;
  margin:0 auto;box-sizing:border-box}
.lg-card h2{font-family:'EB Garamond',Georgia,serif;font-weight:400;font-size:58px;margin:0 0 6px;color:var(--purple,#6b0f5a)}
.lg-card p{font-size:19px;color:#4b4452;margin:0 0 24px}
.lg-google{display:flex;margin:6px 0 20px}
.lg-link{align-self:flex-start;background:none;border:0;color:var(--purple,#6b0f5a);text-decoration:underline;
  padding:6px 0;cursor:pointer;font-size:18px}
.lg-link:hover:not(:disabled){box-shadow:none;transform:none;color:#3f0834}
.lg-steps{margin:10px 0 0;padding-left:24px;font-size:18px;color:#4b4452;line-height:1.7}
.lg-note{margin-top:30px !important;font-size:16px !important;color:#7a7283 !important;
  border-top:1px solid #e8e3ec;padding-top:18px}
@media(max-width:820px){.lg{grid-template-columns:1fr}.lg-brand{padding:40px 28px}.lg-card{padding:36px 24px}
  .lg-card h2{font-size:46px}}

/* evaluations (administrator only) */
.eval-overall{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin:18px 0 8px}
.eval-overall span{font-size:20px}
.eval-overall strong{font-family:'EB Garamond',Georgia,serif;font-weight:400;font-size:72px;line-height:1;color:var(--purple,#6b0f5a)}
.eval-overall em{font-style:normal;color:#6b6472;font-size:17px}
.eval-row{display:grid;grid-template-columns:minmax(150px,230px) 1fr 70px 120px;align-items:center;gap:16px;
  padding:12px 0;border-bottom:1px solid #eee}
.eval-row .bar{height:12px;background:#ece8ef;border-radius:99px;overflow:hidden}
.eval-row .bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--purple,#6b0f5a),#f5a623)}
.eval-row small{color:#6b6472;font-size:15px}
.eval-comment{border-left:3px solid #f5a623;padding:6px 16px;margin:14px 0}
.eval-comment small{display:block;color:#6b6472;font-size:15px}
@media(max-width:700px){.eval-row{grid-template-columns:1fr 70px}.eval-row .bar,.eval-row small{grid-column:1/-1}}

/* rating rows in the Time Out form */
.rate-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 24px;padding:12px 0;border-bottom:1px solid #eee}
.rate-row b{min-width:200px;font-weight:600;font-size:18px}

/* printing: only the table */
@media print{.nav,.toolbar,.footer,.formarea,.actions,.stats,.heading,.details button{display:none !important}
  body::before{display:none}}

%%OLD_CSS%%`;

function Styles() {
  return <style>{GLITTER_CSS}</style>;
}

export default function App() {
  const [view, setView] = useState("logbook");
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [isAdmin, setIsAdmin] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [onlyInside, setOnlyInside] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [out, setOut] = useState(null); // Time Out + evaluation form
  const [help, setHelp] = useState(false);

  const signOut = (msg = "") => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null); setEntries([]); setIsAdmin(false); setView("logbook"); setError(msg);
  };
  const onApiError = (e) => {
    if (e.status === 401 || e.status === 403) signOut(e.message === "Request failed." ? "Your session expired. Please sign in again." : e.message);
    else setError("Could not reach the logbook. Check your connection and try again.");
  };

  const load = () => {
    if (!token) return;
    setLoading(true);
    api(token).then((rows) => { setEntries(rows); setError(""); }).catch(onApiError).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    load();
    api(token, "GET", undefined, undefined, "me=1").then((r) => setIsAdmin(!!r.isAdmin)).catch(() => setIsAdmin(false));
  }, [token]);

  // Only the administrator account gets the evaluation columns
  const cols = useMemo(() => FIELDS.filter(([k]) => isAdmin || !EVAL_KEYS.includes(k)), [isAdmin]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        const text = cols.map(([k, , t]) => show(e, k, t)).join(" ").toLowerCase();
        return text.includes(q) && (!filterDate || e.date === filterDate) && (!onlyInside || !e.timeOut);
      })
      .sort((a, b) => (b.date + " " + b.timeIn).localeCompare(a.date + " " + a.timeIn));
  }, [entries, search, filterDate, onlyInside, cols]);

  // Rating of each area = average of its ratings. Overall infirmary rating = average of the area averages.
  const areaStats = useMemo(() => {
    const acc = {};
    entries.forEach((e) =>
      Object.entries(e.serviceRatings || {}).forEach(([a, n]) => {
        n = Number(n);
        if (n > 0) (acc[a] = acc[a] || []).push(n);
      })
    );
    const byArea = Object.fromEntries(Object.entries(acc).map(([a, arr]) => [a, { avg: mean(arr), count: arr.length }]));
    const avgs = Object.values(byArea).map((r) => r.avg);
    return { byArea, overall: avgs.length ? mean(avgs) : 0, areasRated: avgs.length };
  }, [entries]);

  const reviews = useMemo(
    () => entries.filter((e) => e.comments).sort((a, b) => (b.date + b.timeIn).localeCompare(a.date + a.timeIn)),
    [entries]
  );

  const selected = entries.find((e) => e.id === selectedId);
  const todayCount = entries.filter((e) => e.date === today()).length;
  const inside = entries.filter((e) => !e.timeOut).length;
  const completed = entries.filter((e) => e.timeOut).length;

  const openForm = () => { setView("logbook"); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setForm(blankForm()); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleService = (s) =>
    setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));
  const goTo = (v) => (v === "new" ? openForm() : setView(v));

  // Control No. format: YYYYMMDD-001 (the server assigns the real one)
  const nextRecordNo = (date) =>
    date.replaceAll("-", "") + "-" + String(entries.filter((e) => e.date === date).length + 1).padStart(3, "0");

  const startOut = (e) => {
    setView("logbook"); setSelectedId(e.id); setOut(blankOut(e));
    setTimeout(() => document.getElementById("details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (form.services.length === 0) { setError("Please tick at least one reason for visit."); return; }
    const body = { ...form, name: form.name.trim(), college: form.college.trim() };
    setSaving(true);
    try {
      const saved = await api(token, "POST", body);
      setEntries((prev) => [saved, ...prev]);
      setSelectedId(saved.id);
      setSearch(""); setFilterDate(""); setOnlyInside(false); setError("");
      closeForm();
    } catch (e) { onApiError(e); }
    finally { setSaving(false); }
  };

  const submitOut = async (ev) => {
    ev.preventDefault();
    if (Object.values(out.ratings).some((n) => !n)) { setError("Please rate every area you visited."); return; }
    setSaving(true);
    try {
      const saved = await api(token, "PATCH", { serviceRatings: out.ratings, comments: out.comments.trim() }, out.id);
      setEntries((prev) => prev.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)));
      setError(""); setOut(null);
    } catch (e) { onApiError(e); }
    finally { setSaving(false); }
  };

  const exportCsv = () => {
    const q = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const cell = (e, k, t) => (t === "list" ? (e[k] || []).join("; ") : t === "ratings" ? show(e, k, t) : e[k]);
    const rows = entries.map((e) => cols.map(([k, , t]) => cell(e, k, t)));
    const csv = [cols.map(([k]) => q(k)).join(","), ...rows.map((r) => r.map(q).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "ugnaylunas-entrance-logbook.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const navItems = [
    ["logbook", "Logbook"], ["new", "New Entry"],
    ...(isAdmin ? [["evals", "Evaluations"]] : []),
    ["reports", "Reports / Export"], ["about", "About UgnayLunas"],
  ];

  // ---------------- Login page ----------------
  if (!token) {
    return (
      <main className="lg">
        <Styles />
        <section className="lg-brand">
          <div className="lg-seal"><div className="seal" aria-label="MSU–General Santos text mark"></div></div>
          <h1>Mindanao State University–General Santos</h1>
          <p className="lg-sub">University Infirmary</p>
          <div className="lg-rule" />
          <h3>Entrance Logbook</h3>
          <p className="lg-tag">A simple, private record of every visit to the infirmary.</p>
        </section>
        <section className="lg-card">
          <h2 className="shine-text">UgnayLunas</h2>
          <p>Welcome. Sign in with your Google account to record your visit.</p>
          {error && <div className="notice" role="alert" style={{ marginBottom: 18 }}>{error}</div>}
          <div className="lg-google">
            <GoogleLogin
              size="large" shape="pill" text="continue_with"
              onSuccess={(r) => { sessionStorage.setItem(TOKEN_KEY, r.credential); setError(""); setToken(r.credential); }}
              onError={() => setError("Google sign-in failed. Please try again.")}
            />
          </div>
          <button className="lg-link" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
            {help ? "Hide instructions" : "How does it work?"}
          </button>
          {help && (
            <ol className="lg-steps">
              <li>Sign in with your Google account.</li>
              <li>Choose <b>+ New Entry</b>, fill in your details and tick the reason for your visit.</li>
              <li>When you leave, press <b>Time Out &amp; Evaluate</b> and rate each area you visited.</li>
            </ol>
          )}
          <p className="lg-note">Your entries can only be seen by your own account. Please do not write diagnoses or medical details in the logbook.</p>
        </section>
      </main>
    );
  }

  // ---------------- Main app ----------------
  return (
    <>
      <Styles />
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
          <div><h2 className="shine-text">UgnayLunas</h2><div className="muted">Infirmary Entrance Logbook</div></div>
        </section>

        {error && <div className="notice" role="alert">{error}</div>}
        {loading && <div className="muted" style={{ marginBottom: 12 }}>Loading entries…</div>}

        <section className="stats">
          <div className="stat"><span>Visits Today</span><strong>{todayCount}</strong></div>
          <div className="stat"><span>Currently Inside (no Time Out)</span><strong>{inside}</strong></div>
          {isAdmin ? (
            <div className="stat"><span>Overall Infirmary Rating (1–5)</span><strong>{areaStats.areasRated ? areaStats.overall.toFixed(2) : "–"}</strong></div>
          ) : (
            <div className="stat"><span>Completed Visits</span><strong>{completed}</strong></div>
          )}
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
              <input id="filterDate" type="date" style={{ width: "auto", minWidth: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
              <button onClick={() => setFilterDate(today())}>Today</button>
              <button className={onlyInside ? "active" : ""} onClick={() => setOnlyInside((v) => !v)} aria-pressed={onlyInside}>Inside only</button>
              <button onClick={() => { setSearch(""); setFilterDate(""); setOnlyInside(false); }}>Clear</button>
              <button onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
              <button onClick={() => window.print()}>Print</button>
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
                      <label htmlFor="date">Date (automatic)</label>
                      <input id="date" type="text" readOnly value={form.date} />
                    </div>
                    <div className="field">
                      <label htmlFor="timeIn">Time In (automatic)</label>
                      <input id="timeIn" type="text" readOnly value={form.timeIn} />
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
                  <tr>
                    {cols.map(([k, label]) => <th key={k} scope="col">{label}</th>)}
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className={e.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(e.id)}>
                      {cols.map(([k, , t]) => <td key={k}>{show(e, k, t)}</td>)}
                      <td>
                        {e.mine && !e.timeOut ? (
                          <button className="primary" onClick={(ev) => { ev.stopPropagation(); startOut(e); }}>Time Out</button>
                        ) : (
                          <span className="muted">{e.timeOut ? "Done" : "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && <div className="empty">No entries match your search or filters.</div>}
            </div>

            <div className="details" id="details">
              <h4>{selected ? "Selected Entry" : "Entry Details"}</h4>
              {selected ? (
                <>
                  <p className="muted">
                    {selected.recordNo} · {selected.date} · In {selected.timeIn} · Out {selected.timeOut || "—"}
                  </p>
                  <p>{selected.name} · {selected.college} · {show(selected, "code", "code")}</p>
                  <p>Reason for visit: {show(selected, "services", "list")}</p>
                  <span className={"badge " + (selected.timeOut ? "ok" : "pending")}>{selected.timeOut ? "Completed" : "Inside"}</span>

                  {!selected.timeOut && selected.mine && !(out && out.id === selected.id) && (
                    <div style={{ marginTop: 14 }}>
                      <button className="primary" onClick={() => startOut(selected)}>Time Out &amp; Evaluate</button>
                    </div>
                  )}

                  {out && out.id === selected.id && (
                    <form onSubmit={submitOut} style={{ marginTop: 16 }}>
                      <div className="grid">
                        <div className="field">
                          <label htmlFor="timeOut">Time Out (automatic)</label>
                          <input id="timeOut" type="text" readOnly value={out.timeOut} />
                        </div>
                      </div>
                      <h4 style={{ marginBottom: 4 }}>Rate each area you visited</h4>
                      <p className="muted" style={{ marginTop: 0 }}>{RATINGS.map(([n, l]) => n + " = " + l).join(" · ")}</p>
                      {Object.keys(out.ratings).map((area) => (
                        <div className="rate-row" key={area} role="radiogroup" aria-label={"Rating for " + area}>
                          <b>{area}</b>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <label key={n} style={opt}>
                              <input type="radio" name={"rate-" + area} style={{ width: "auto" }} checked={out.ratings[area] === n}
                                onChange={() => setOut({ ...out, ratings: { ...out.ratings, [area]: n } })} />
                              {n}
                            </label>
                          ))}
                        </div>
                      ))}
                      <div className="grid" style={{ marginTop: 14 }}>
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

                  {selected.timeOut && isAdmin && (
                    <div style={{ marginTop: 12 }}>
                      <p className="muted">Overall rating: {show(selected, "rating", "rating") || "None"}</p>
                      <p className="muted">By area: {show(selected, "serviceRatings", "ratings") || "None"}</p>
                      {selected.comments && <p className="muted">Comments: {selected.comments}</p>}
                    </div>
                  )}
                  {selected.timeOut && !isAdmin && selected.evaluated && (
                    <p className="muted" style={{ marginTop: 12 }}>Evaluation submitted. Thank you for your feedback!</p>
                  )}
                </>
              ) : (
                <div className="muted">Select a row to view details, or press Time Out to record your Time Out and evaluation.</div>
              )}
            </div>
          </section>
        )}

        {view === "evals" && isAdmin && (
          <section className="panel report-panel">
            <h3>Evaluations</h3>
            <p className="muted">Only this administrator account can see ratings and comments. Each area's rating is the average of its patient ratings, and the overall infirmary rating is the average of all area ratings.</p>
            <div className="eval-overall">
              <span>Overall Infirmary Rating</span>
              <strong>{areaStats.areasRated ? areaStats.overall.toFixed(2) : "–"}</strong>
              <em>/ 5 · average of {areaStats.areasRated} rated area{areaStats.areasRated === 1 ? "" : "s"}</em>
            </div>
            <div>
              {SERVICES.map((area) => {
                const r = areaStats.byArea[area];
                return (
                  <div className="eval-row" key={area}>
                    <span>{area}</span>
                    <div className="bar"><i style={{ width: r ? (r.avg / 5) * 100 + "%" : "0%" }} /></div>
                    <b>{r ? r.avg.toFixed(2) : "–"}</b>
                    <small>{r ? r.count + " rating" + (r.count === 1 ? "" : "s") : "No ratings yet"}</small>
                  </div>
                );
              })}
            </div>
            <h3 style={{ marginTop: 28 }}>Comments &amp; Suggestions</h3>
            {reviews.length === 0 && <p className="muted">No comments yet.</p>}
            {reviews.map((e) => (
              <div className="eval-comment" key={e.id}>
                {e.comments}
                <small>{e.date} · {show(e, "code", "code")} · Overall {show(e, "rating", "rating")}</small>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <button onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>{" "}
              <button onClick={() => window.print()}>Print</button>
            </div>
          </section>
        )}

        {view === "reports" && (
          <section className="panel report-panel">
            <h3>Reports and Export</h3>
            <p>Download all loaded entries as a CSV spreadsheet. Open it in Excel or Google Sheets. Use fictional data only.</p>
            <button className="primary" onClick={exportCsv}>Export Logbook to CSV</button>{" "}
            <button onClick={() => window.print()}>Print Logbook</button>
          </section>
        )}

        {view === "about" && (
          <section className="panel report-panel">
            <h3>About UgnayLunas</h3>
            <p>UgnayLunas is a proposed web-based entrance logbook for the university infirmary. Patients record their own visit: time in, time out, reason for visit, and a rating for each area of the infirmary they used.</p>
            <p className="muted">Each account can only see its own entries, and the evaluations are visible only to the designated administrator account. This is an academic prototype, not an official MSU system. The text-based university heading is a placeholder and does not reproduce an official seal or wordmark.</p>
          </section>
        )}
      </main>

      <footer className="footer">UgnayLunas · Proposed MSU–General Santos Infirmary entrance logbook · Academic prototype</footer>
    </>
  );
}