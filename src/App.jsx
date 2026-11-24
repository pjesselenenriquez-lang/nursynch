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
const CODES = { S: "Student", D: "Dependent", E: "Employee", O: "Outsider" };
// Patient evaluation (RADIO, pick one)
const RATINGS = [[5, "Excellent"], [4, "Very Good"], [3, "Good"], [2, "Fair"], [1, "Poor"]];

// [key, label, format]  format: text | list | code | rating
const FIELDS = [
  ["recordNo", "Record / Control No.", "text"],
  ["date", "Date", "text"],
  ["timeIn", "Time In", "text"],
  ["timeOut", "Time Out", "text"],
  ["code", "Code", "code"],
  ["name", "Name", "text"],
  ["college", "College/Department", "text"],
  ["services", "Reason for Visit", "list"],
  ["rating", "Overall Evaluation", "rating"],
  ["serviceRatings", "Service Area Ratings", "object"],
  ["comments", "Evaluation Comments", "text"],
];

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const nowTime = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

const blankForm = () => ({ date: today(), timeIn: nowTime(), code: "S", name: "", college: "", services: [] });
const blankOut = (id, services = []) => ({ id, timeOut: nowTime(), rating: 0, serviceRatings: Object.fromEntries(services.map((service) => [service, 0])), comments: "" });

const show = (e, k, type) => {
  const v = e[k];
  if (type === "list") return Array.isArray(v) ? v.join(", ") : v ?? "";
  if (type === "code") return v ? v + " – " + (CODES[v] || "") : "";
  if (type === "rating") return Number(v) ? v + " / 5" + (Number.isInteger(Number(v)) ? " – " + ((RATINGS.find(([n]) => n === Number(v)) || [])[1] || "") : "") : "";
  if (type === "object") return v && typeof v === "object" ? Object.entries(v).map(([name, rating]) => `${name}: ${rating}/5`).join("; ") : "";
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

// ---------- Glitter and shine effects (pure CSS animation, no image files needed) ----------
const GLITTER_CSS = `
/* gold bar flowing under the university name */
.top .accent{background-image:linear-gradient(90deg,#f5a623,#fff3b0,#f5a623,#ffd66b,#f5a623);
  background-size:200% 100%;animation:gold-flow 3s linear infinite}
@keyframes gold-flow{to{background-position:-200% 0}}

/* shiny sweep across buttons and stat cards */
button.primary,.stat{position:relative;overflow:hidden}
button.primary::after,.stat::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;pointer-events:none;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);
  transform:skewX(-20deg);animation:sheen 3.5s ease-in-out infinite}
.stat::after{background:linear-gradient(100deg,transparent,rgba(255,215,100,.35),transparent);animation-duration:5s}
@keyframes sheen{0%{left:-60%}60%,100%{left:130%}}

/* shimmering gold highlight moving across the "UgnayLunas" title */
.shine-text{background:linear-gradient(100deg,#6b0f5a 0%,#6b0f5a 40%,#e0a800 50%,#6b0f5a 60%,#6b0f5a 100%);
  background-size:250% 100%;-webkit-background-clip:text;background-clip:text;
  color:transparent !important;-webkit-text-fill-color:transparent;animation:text-shine 4s linear infinite}
@keyframes text-shine{0%{background-position:150% 0}100%{background-position:-150% 0}}

/* clean pastel background with a few subtle gold glitters */
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:
    radial-gradient(circle at 12% 18%,rgba(245,166,35,.5) 0 1px,transparent 2px),
    radial-gradient(circle at 86% 22%,rgba(245,166,35,.42) 0 1px,transparent 2px),
    radial-gradient(circle at 78% 76%,rgba(245,166,35,.4) 0 1px,transparent 2px),
    radial-gradient(circle at 24% 84%,rgba(245,166,35,.38) 0 1px,transparent 2px),
    linear-gradient(180deg,rgba(107,15,90,.04),transparent 260px),
    linear-gradient(135deg,#fbfafc,#f0ecf4)}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:
    radial-gradient(circle at 12% 18%,rgba(255,214,107,.55) 0 2px,transparent 3px),
    radial-gradient(circle at 86% 22%,rgba(255,214,107,.45) 0 2px,transparent 3px),
    radial-gradient(circle at 78% 76%,rgba(255,214,107,.4) 0 2px,transparent 3px)}

/* glowing logo and title */
.seal{animation:seal-glow 3s ease-in-out infinite}
@keyframes seal-glow{0%,100%{filter:drop-shadow(0 0 3px rgba(245,166,35,.45))}50%{filter:drop-shadow(0 0 14px rgba(245,166,35,.95))}}
.shine-text{filter:drop-shadow(0 0 6px rgba(224,168,0,.35))}

/* form fields light up when you click into them */
input:focus,select:focus,textarea:focus{outline:none;border-color:#b04fd0;
  box-shadow:0 0 0 3px rgba(176,79,208,.2),0 0 14px rgba(176,79,208,.45)}
input,select,textarea{transition:box-shadow .25s,border-color .25s}

/* buttons glow on hover; the main buttons also pulse softly */
button{transition:box-shadow .25s,transform .2s}
button:hover:not(:disabled){box-shadow:0 0 14px rgba(176,79,208,.5);transform:translateY(-1px)}
button.primary{animation:pulse-glow 2.6s ease-in-out infinite}
button.primary:hover:not(:disabled){animation:none;box-shadow:0 0 20px rgba(255,200,60,.9),0 0 6px rgba(107,15,90,.6)}
button:disabled{animation:none;box-shadow:none}
.nav button.active{box-shadow:0 0 12px rgba(245,166,35,.45)}
@keyframes pulse-glow{0%,100%{box-shadow:0 0 0 rgba(255,200,60,0)}50%{box-shadow:0 0 16px rgba(255,200,60,.65)}}

/* cards and panels float in, and lift with a glow on hover */
.stat,.panel,.formarea,.notice{animation:rise-in .6s ease both}
.stat:nth-child(2){animation-delay:.1s}
.stat:nth-child(3){animation-delay:.2s}
.stat{transition:box-shadow .3s,transform .3s}
.stat:hover{transform:translateY(-3px);box-shadow:0 6px 22px rgba(107,15,90,.28),0 0 18px rgba(255,213,74,.35)}
@keyframes rise-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* table rows glow when pointed at or selected */
tbody tr{transition:background .2s,box-shadow .2s}
tbody tr:hover{background:rgba(255,213,74,.14);box-shadow:inset 3px 0 0 #f5a623}
tbody tr.selected{background:linear-gradient(90deg,rgba(255,213,74,.28),rgba(197,139,255,.18));box-shadow:inset 3px 0 0 #6b0f5a}

/* status badges glow: green = completed, amber = still inside */
.badge.ok{animation:glow-green 2.6s ease-in-out infinite}
.badge.pending{animation:glow-amber 1.8s ease-in-out infinite}
@keyframes glow-green{0%,100%{box-shadow:0 0 0 rgba(46,160,67,0)}50%{box-shadow:0 0 12px rgba(46,160,67,.7)}}
@keyframes glow-amber{0%,100%{box-shadow:0 0 0 rgba(245,166,35,0)}50%{box-shadow:0 0 14px rgba(245,166,35,.85)}}

/* people who turn off animations in their device settings get a still page */
@media (prefers-reduced-motion:reduce){
  .shine-text,.top .accent,button.primary::after,.stat::after,
  .seal,button.primary,.badge,.stat,.panel,.formarea,.notice{animation:none}
}

/* Larger, more readable type while preserving the existing layout */
body{font-size:17px;line-height:1.6}
body p,body label,body input,body select,body textarea,body button,body td,body th{font-size:1rem}
h1{font-size:clamp(1.45rem,2.4vw,2rem)}
h2{font-size:clamp(2.2rem,4vw,3rem)}
h3{font-size:1.45rem}
h4{font-size:1.2rem}
.muted,.form-note{font-size:.98rem}
button{min-height:42px;padding:10px 15px}
input,select,textarea{min-height:43px;padding:10px 12px}
.stat span{font-size:1rem}.stat strong{font-size:2rem}
th,td{padding:12px 14px}
.quick-actions{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px}
.quick-actions button{background:#fff;border:1px solid rgba(107,15,90,.2);border-radius:12px;color:#6b0f5a;font-weight:600}
.service-rating{padding:14px;margin:10px 0;border:1px solid rgba(107,15,90,.16);border-radius:14px;background:rgba(255,255,255,.7)}
.service-rating strong{display:block;margin-bottom:8px;font-size:1.05rem}
.rating-preview{padding:12px 14px;border-radius:12px;background:rgba(245,166,35,.12)}
.saved-evaluation{padding:12px 16px;border-radius:12px;background:rgba(107,15,90,.05)}
.login-wrap{max-width:100%!important;min-height:75vh;display:flex;align-items:center;justify-content:center}
.login-card{width:min(100%,580px);padding:42px 36px;border:1px solid rgba(107,15,90,.14);border-radius:28px;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(249,244,252,.94));box-shadow:0 22px 70px rgba(67,30,76,.14),0 0 0 8px rgba(255,255,255,.3);position:relative;overflow:hidden}
.login-card:before{content:"";position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#6b0f5a,#d7a928,#f6e7a8,#6b0f5a)}
.login-card h2{margin:0;font-size:clamp(2.7rem,6vw,3.8rem)!important;line-height:1.15}
.login-card .muted{font-size:1.08rem;max-width:390px;margin:14px auto}
.login-welcome{max-width:400px;margin:16px auto;color:#5e5064}
.login-footnote{font-size:.88rem;color:#7c7180;margin-top:26px}

/* Login-only ambient glow: soft purple and MSU-inspired gold, kept minimal */
.login-wrap{position:relative;isolation:isolate;padding:28px 18px 54px}
.login-wrap:before,.login-wrap:after{content:"";position:absolute;z-index:-1;pointer-events:none;border-radius:50%;filter:blur(2px)}
.login-wrap:before{width:300px;height:300px;top:8%;left:calc(50% - 340px);background:radial-gradient(circle,rgba(190,126,230,.19),rgba(190,126,230,0) 70%);animation:login-orbit 8s ease-in-out infinite alternate}
.login-wrap:after{width:330px;height:330px;bottom:0;right:calc(50% - 360px);background:radial-gradient(circle,rgba(245,190,63,.2),rgba(245,190,63,0) 70%);animation:login-orbit 9s ease-in-out infinite alternate-reverse}
@keyframes login-orbit{from{transform:translate3d(0,-8px,0) scale(.94);opacity:.65}to{transform:translate3d(10px,12px,0) scale(1.08);opacity:1}}
.login-card{isolation:isolate;box-shadow:0 22px 70px rgba(67,30,76,.16),0 0 24px rgba(157,91,190,.12),0 0 0 1px rgba(255,255,255,.7);transition:box-shadow .35s,transform .35s}
.login-card:after{content:"";position:absolute;inset:7px;border:1px solid rgba(245,190,63,.13);border-radius:22px;pointer-events:none;z-index:-1}
.login-card:hover{box-shadow:0 26px 78px rgba(67,30,76,.2),0 0 32px rgba(157,91,190,.2),0 0 18px rgba(245,190,63,.13)}
.login-card .seal{position:relative;z-index:1;filter:drop-shadow(0 0 7px rgba(245,166,35,.65)) drop-shadow(0 0 18px rgba(176,79,208,.25));animation:logo-aura 3s ease-in-out infinite}
.login-card .seal:before{content:"";position:absolute;inset:-13px;border:1px solid rgba(245,190,63,.48);border-radius:50%;box-shadow:0 0 10px rgba(245,166,35,.18),inset 0 0 10px rgba(176,79,208,.1);pointer-events:none}
.login-card .seal:after{content:"✦";position:absolute;right:-13px;top:-7px;color:#e2b43c;font-size:16px;text-shadow:0 0 7px rgba(245,166,35,.95);animation:twinkle 2.2s ease-in-out infinite;pointer-events:none}
@keyframes logo-aura{0%,100%{filter:drop-shadow(0 0 5px rgba(245,166,35,.5)) drop-shadow(0 0 12px rgba(176,79,208,.16))}50%{filter:drop-shadow(0 0 11px rgba(245,166,35,.95)) drop-shadow(0 0 22px rgba(176,79,208,.38))}}
@keyframes twinkle{0%,100%{opacity:.55;transform:scale(.85) rotate(0)}50%{opacity:1;transform:scale(1.18) rotate(18deg)}}
.login-card h2{animation:title-aura 3.5s ease-in-out infinite}
@keyframes title-aura{0%,100%{text-shadow:0 0 7px rgba(176,79,208,.1),0 0 12px rgba(245,190,63,.08)}50%{text-shadow:0 0 11px rgba(176,79,208,.24),0 0 20px rgba(245,190,63,.22)}}
.login-card .login-welcome{padding:10px 14px;border-radius:14px;background:linear-gradient(100deg,rgba(176,79,208,.055),rgba(245,190,63,.09),rgba(176,79,208,.055));border:1px solid rgba(107,15,90,.06)}
.login-card [role="button"],.login-card iframe{border-radius:12px}
.login-card button{box-shadow:0 4px 16px rgba(107,15,90,.08)}

.login-wrap{min-height:82vh}
.login-card{width:min(100%,680px);padding:44px clamp(22px,5vw,52px) 34px;background:radial-gradient(ellipse at 50% 0%,rgba(255,248,222,.65),transparent 45%),linear-gradient(145deg,rgba(255,255,255,.98),rgba(250,246,252,.97))}
.login-card:before{height:8px;background-size:220% 100%;animation:gold-flow 4s linear infinite}
.login-tagline{font-family:'EB Garamond',Georgia,serif;font-size:clamp(1.35rem,3vw,1.85rem);font-weight:600;line-height:1.25;color:#6b0f5a;margin:10px 0 8px;text-wrap:balance;text-shadow:0 0 14px rgba(190,126,230,.16)}
.login-instruction{max-width:470px;margin:0 auto!important;line-height:1.65}
.login-welcome{max-width:500px!important;margin:20px auto 18px!important;padding:13px 18px!important;border-radius:15px;background:linear-gradient(100deg,rgba(176,79,208,.07),rgba(245,190,63,.13),rgba(176,79,208,.07));border:1px solid rgba(107,15,90,.1);line-height:1.55}
.login-feature-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0 24px}
.login-feature{display:flex;flex-direction:column;align-items:center;gap:5px;padding:15px 9px;border-radius:16px;border:1px solid rgba(107,15,90,.1);background:rgba(255,255,255,.7);box-shadow:0 6px 18px rgba(107,15,90,.045);transition:transform .25s,box-shadow .25s,border-color .25s}
.login-feature:hover{transform:translateY(-3px);border-color:rgba(245,166,35,.45);box-shadow:0 8px 24px rgba(107,15,90,.1),0 0 16px rgba(245,190,63,.12)}
.login-feature .feature-symbol{font-size:1.6rem;color:#b88716;text-shadow:0 0 12px rgba(245,190,63,.6)}
.login-feature strong{font-size:.98rem;color:#5f1455}
.login-feature small{font-size:.82rem;line-height:1.35;color:#776a7a}
.login-footnote{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:8px;font-size:.86rem!important;margin-top:24px!important}
.login-footnote span{font-size:.7rem;color:#3d9b69;text-shadow:0 0 8px rgba(61,155,105,.4)}
.login-footnote i{font-style:normal;color:#c49a30}
.login-disclaimer{margin-top:9px;font-size:.76rem;color:#948899;letter-spacing:.02em}
.service-rating-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:18px 0}
.service-average-card{padding:18px;border:1px solid rgba(107,15,90,.12);border-radius:16px;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(250,246,252,.92));box-shadow:0 5px 18px rgba(107,15,90,.05)}
.service-average-card .service-name{font-weight:700;color:#5f1455;margin-bottom:8px}
.service-average-card .service-score{font-size:1.8rem;font-weight:700;color:#6b0f5a;line-height:1.2}
.service-average-card .service-count{font-size:.88rem;color:#786c7b;margin-top:5px}
.service-meter{height:8px;background:rgba(107,15,90,.09);border-radius:99px;overflow:hidden;margin-top:12px}
.service-meter span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#6b0f5a,#b77ad4,#e7bf50)}
.service-rating-overview{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:18px 20px;border-radius:16px;background:linear-gradient(110deg,rgba(107,15,90,.07),rgba(245,190,63,.13));border:1px solid rgba(107,15,90,.1)}
.service-rating-overview strong{font-size:1.8rem;color:#6b0f5a}
@media(max-width:600px){.login-feature-row{grid-template-columns:1fr;gap:8px}.login-feature{display:grid;grid-template-columns:34px 1fr;text-align:left;justify-items:start;padding:11px 14px}.login-feature .feature-symbol{grid-row:span 2}.login-feature small{font-size:.8rem}.login-card{padding:34px 20px 26px}}
@media (prefers-reduced-motion:reduce){.login-wrap:before,.login-wrap:after,.login-card .seal,.login-card .seal:after,.login-card h2,.login-card:before,.login-feature{animation:none!important;transition:none!important}}
@media(max-width:600px){.login-card{padding:34px 20px;border-radius:22px}.quick-actions button{flex:1 1 42%}}
@media print{.top nav,.toolbar,.quick-actions,.actions,button{display:none!important}body::before,body::after{display:none!important}}
}`;
function Styles() {
  return <style>{GLITTER_CSS}</style>;
}

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
  // Service-level averages are calculated from every saved, nonzero rating for that service.
  const serviceRatingSummary = SERVICES.map((service) => {
    const values = entries
      .map((entry) => Number(entry.serviceRatings?.[service]))
      .filter((rating) => Number.isFinite(rating) && rating > 0);
    return {
      service,
      count: values.length,
      average: values.length ? values.reduce((sum, rating) => sum + rating, 0) / values.length : null,
    };
  });
  const allServiceRatings = serviceRatingSummary.filter((item) => item.average !== null);
  const overallServiceAverage = allServiceRatings.length
    ? entries.reduce((sum, entry) => sum + Object.values(entry.serviceRatings || {}).map(Number).filter((n) => Number.isFinite(n) && n > 0).reduce((a, b) => a + b, 0), 0) /
      entries.reduce((sum, entry) => sum + Object.values(entry.serviceRatings || {}).map(Number).filter((n) => Number.isFinite(n) && n > 0).length, 0)
    : null;

  // Control No. format: YYYYMMDD-001 (counts per date). Ideally assigned by the server.
  const nextRecordNo = (date) =>
    date.replaceAll("-", "") + "-" + String(entries.filter((e) => e.date === date).length + 1).padStart(3, "0");

  const openForm = () => { setView("logbook"); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setForm(blankForm()); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleService = (s) =>
    setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));
  const goTo = (v) => (v === "new" ? openForm() : setView(v));
  const refreshEntries = async () => {
    if (!token) return;
    setLoading(true);
    try { setEntries(await api(token)); setError(""); }
    catch (e) { onApiError(e); }
    finally { setLoading(false); }
  };
  const showToday = () => { setSearch(""); setFilterDate(today()); setView("logbook"); };
  const clearFilters = () => { setSearch(""); setFilterDate(""); };

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
    const selectedServices = selected?.services || [];
    const currentRatings = out.serviceRatings || {};
    if (selectedServices.some((service) => !Number(currentRatings[service]))) { setError("Please rate every selected service area before saving."); return; }
    setSaving(true);
    try {
      const serviceRatings = out.serviceRatings || {};
      const missingRatings = (selected?.services || []).filter((service) => !Number(serviceRatings[service]));
      if (missingRatings.length) {
        setError("Please rate every service area you selected: " + missingRatings.join(", ") + ".");
        setSaving(false);
        return;
      }
      const ratingValues = Object.values(serviceRatings).map(Number).filter((n) => n > 0);
      const overallRating = ratingValues.length ? Number((ratingValues.reduce((sum, n) => sum + n, 0) / ratingValues.length).toFixed(2)) : 0;
      const patch = { timeOut: out.timeOut, rating: overallRating, serviceRatings, comments: out.comments.trim() };
      const saved = await api(token, "PATCH", patch, out.id);
      setEntries((prev) => prev.map((e) => (e.id === saved.id ? { ...e, ...saved, rating: saved.rating ?? overallRating, serviceRatings: saved.serviceRatings || serviceRatings } : e)));
      setError(""); setOut(null);
    } catch (e) { onApiError(e); }
    finally { setSaving(false); }
  };

  const exportCsv = () => {
    const q = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const rows = entries.map((e) => FIELDS.map(([k, , t]) => (t === "list" ? (e[k] || []).join("; ") : t === "object" ? (e[k] && typeof e[k] === "object" ? Object.entries(e[k]).map(([name, rating]) => `${name}: ${rating}/5`).join("; ") : "") : e[k])));
    const csv = [FIELDS.map(([k]) => q(k)).join(","), ...rows.map((r) => r.map(q).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "ugnaylunas-entrance-logbook.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const navItems = [["logbook", "Logbook"], ["new", "New Entry"], ["service-ratings", "Service Ratings"], ["reports", "Reports / Export"], ["about", "About UgnayLunas"]];

  if (!token) {
    return (
      <main className="wrap login-wrap" style={{ maxWidth: 760, textAlign: "center", marginTop: 28 }}>
        <div className="login-card">
        <Styles />
        <div className="seal" style={{ margin: "0 auto 16px" }}></div>
        <h2 className="shine-text" style={{ color: "var(--purple)", fontFamily: "'EB Garamond',Georgia,serif", fontWeight: 400, margin: 0 }}>UgnayLunas</h2>
        <p className="login-tagline">Welcome to the Infirmary Patient Logbook</p>
        <p className="muted login-instruction">Sign in securely with your authorized Google account to access patient visit records and service evaluations.</p>
        {error && <div className="notice" role="alert">{error}</div>}
        <div className="login-welcome">A welcoming, organized space for recording infirmary visits and improving patient care.</div>
        <div className="login-feature-row" aria-label="Logbook features">
          <div className="login-feature"><span className="feature-symbol">✧</span><strong>Visit Records</strong><small>Clear, organized entries</small></div>
          <div className="login-feature"><span className="feature-symbol">♡</span><strong>Patient Feedback</strong><small>Rate each service area</small></div>
          <div className="login-feature"><span className="feature-symbol">✦</span><strong>Care Improvement</strong><small>Insights from ratings</small></div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
          <GoogleLogin
            onSuccess={(r) => { sessionStorage.setItem(TOKEN_KEY, r.credential); setError(""); setToken(r.credential); }}
            onError={() => setError("Google sign-in failed. Please try again.")}
          />
        </div>
        <div className="login-footnote"><span>●</span> Secure Google sign-in <i>•</i> MSU–General Santos University Infirmary</div>
        <div className="login-disclaimer">UgnayLunas · Academic prototype for infirmary logbook management</div>
        </div>
      </main>
    );
  }

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
          <div className="stat"><span>Overall Infirmary Rating (1–5)</span><strong>{avg}</strong></div>
        </section>
        <div className="quick-actions">
          <button type="button" onClick={refreshEntries} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh Data"}</button>
          <button type="button" onClick={showToday}>Today’s Visits</button>
          <button type="button" onClick={clearFilters}>Clear Filters</button>
          <button type="button" onClick={() => window.print()}>Print Page</button>
        </div>

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
              <button onClick={clearFilters}>Clear</button>
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
                      <button className="primary" onClick={() => setOut(blankOut(selected.id, selected.services || []))}>Time Out &amp; Evaluate</button>
                    </div>
                  )}

                  {out && out.id === selected.id && (
                    <form onSubmit={submitOut} style={{ marginTop: 14 }}>
                      <div className="grid">
                        <div className="field">
                          <label htmlFor="timeOut">Time Out (automatic)</label>
                          <input id="timeOut" type="text" readOnly value={out.timeOut} />
                        </div>
                        <div className="field full">
                          <label>Evaluate each service area you selected</label>
                          <p className="muted">Rate every selected service. The overall infirmary rating is calculated as the average of these ratings.</p>
                          {(selected.services || []).map((service) => (
                            <div className="service-rating" key={service}>
                              <strong>{service}</strong>
                              <div style={group} role="radiogroup" aria-label={`Rating for ${service}`}>
                                {RATINGS.map(([n, label]) => (
                                  <label key={n} style={opt}>
                                    <input type="radio" name={`rating-${service}`} style={{ width: "auto" }} checked={Number(out.serviceRatings?.[service]) === n} onChange={() => setOut({ ...out, serviceRatings: { ...(out.serviceRatings || {}), [service]: n } })} />
                                    {n} – {label}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          <p className="rating-preview"><strong>Calculated overall rating: </strong>{(() => { const values = Object.values(out.serviceRatings || {}).map(Number).filter((n) => n > 0); return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) + " / 5" : "Complete ratings above"; })()}</p>
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
                    <div className="saved-evaluation" style={{ marginTop: 10 }}>
                      <p><strong>Overall infirmary rating:</strong> {show(selected, "rating", "rating") || "None"}</p>
                      {selected.serviceRatings && <ul>{Object.entries(selected.serviceRatings).map(([service, rating]) => <li key={service}>{service}: {rating} / 5</li>)}</ul>}
                      {selected.comments && <p><strong>Comments:</strong> {selected.comments}</p>}
                    </div>
                  )}
                </>
              ) : (
                <div className="muted">Select a row to view details, or to record Time Out and evaluation.</div>
              )}
            </div>
          </section>
        )}

        {view === "service-ratings" && (
          <section className="panel report-panel">
            <h3>Infirmary Service Ratings</h3>
            <p className="muted">Each service area is averaged from its saved patient ratings. Only submitted ratings are included; unrated services are not treated as zero.</p>
            <div className="service-rating-overview">
              <div><div className="muted">Overall average across all rated service areas</div><strong>{overallServiceAverage === null ? "–" : overallServiceAverage.toFixed(2) + " / 5"}</strong></div>
              <div><div className="muted">Service areas with ratings</div><strong>{allServiceRatings.length} <span style={{ fontSize: ".95rem", fontWeight: 500 }}>of {SERVICES.length}</span></strong></div>
              <div><div className="muted">Completed evaluations</div><strong>{entries.filter((entry) => entry.serviceRatings && Object.values(entry.serviceRatings).some((n) => Number(n) > 0)).length}</strong></div>
            </div>
            <div className="service-rating-summary">
              {serviceRatingSummary.map(({ service, count, average }) => (
                <article className="service-average-card" key={service}>
                  <div className="service-name">{service}</div>
                  <div className="service-score">{average === null ? "–" : average.toFixed(2)} <span style={{ fontSize: ".9rem", fontWeight: 500 }}>/ 5</span></div>
                  <div className="service-count">{count} {count === 1 ? "rating" : "ratings"}</div>
                  <div className="service-meter" aria-label={average === null ? "No ratings yet" : `Average rating ${average.toFixed(2)} out of 5`}>
                    <span style={{ width: `${average === null ? 0 : Math.max(0, Math.min(100, average / 5 * 100))}%` }} />
                  </div>
                </article>
              ))}
            </div>
            <p className="muted">Ratings are calculated from the serviceRatings saved on each visit. If this page has no ratings yet, complete a patient's “Time Out & Evaluate” form after rating every service they selected.</p>
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