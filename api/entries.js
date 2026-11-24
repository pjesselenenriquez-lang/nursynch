import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

// Sheet columns A to K, in this exact order (row 1 of the sheet must hold these headers)
const COLS = ["id", "recordNo", "date", "timeIn", "timeOut", "code", "name", "college", "services", "rating", "comments"];
const SERVICES = [
  "Physical Exam", "FTF Consultation", "Online Consultation", "Referral",
  "Minor Procedure", "Dental", "Medical Certificate", "BP", "RBS", "Clearance",
];
const CODES = ["S", "O", "D"]; // Student, Outsider, Dependent
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TAB = process.env.SHEET_TAB || "Sheet1";
const RANGE = `${TAB}!A2:K`;

const oauth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const sheets = google.sheets({
  version: "v4",
  auth: new google.auth.JWT({
    email: process.env.GOOGLE_SA_EMAIL,
    key: (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  }),
});

async function authorize(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return { status: 401 };
  try {
    const ticket = await oauth.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    const email = p.email?.toLowerCase();
    if (!p.email_verified || !allowed.includes(email)) return { status: 403 };
    return { email };
  } catch {
    return { status: 401 }; // invalid or expired token
  }
}

// Sheet row <-> entry object. "services" is stored as "A; B; C" in one cell.
const toRow = (e) => COLS.map((c) => (c === "services" ? e.services.join("; ") : e[c] ?? ""));
const fromRow = (r) => {
  const o = Object.fromEntries(COLS.map((c, i) => [c, r[i] ?? ""]));
  o.services = String(o.services).split("; ").filter(Boolean);
  o.rating = Number(o.rating) || 0;
  return o;
};

// Current date and time in Manila, from the server clock
function manilaNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// New entry (Time In)
function cleanNew(body = {}) {
  const services = Array.isArray(body.services)
    ? [...new Set(body.services.filter((s) => SERVICES.includes(s)))]
    : [];
  const now = manilaNow();
  const e = {
    date: now.date, // set by the server, cannot be edited by the patient
    timeIn: now.time,
    timeOut: "",
    code: CODES.includes(body.code) ? body.code : null,
    name: String(body.name || "").trim().slice(0, 120),
    college: String(body.college || "").trim().slice(0, 120),
    services,
    rating: "",
    comments: "",
  };
  if (!e.date || !e.timeIn || !e.code || !e.name || !e.college || services.length === 0) return null;
  return e;
}

// Time Out + evaluation
function cleanOut(body = {}) {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return { timeOut: manilaNow().time, rating: String(rating), comments: String(body.comments || "").trim().slice(0, 500) };
}

async function readRows() {
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: RANGE });
  return data.values || [];
}

export default async function handler(req, res) {
  const auth = await authorize(req);
  if (auth.status) return res.status(auth.status).json({ error: "Not authorized" });

  try {
    if (req.method === "GET") {
      return res.json((await readRows()).map(fromRow));
    }

    if (req.method === "POST") {
      const e = cleanNew(req.body);
      if (!e) return res.status(400).json({ error: "Invalid entry" });
      const rows = await readRows();
      const seq = rows.filter((r) => r[2] === e.date).length + 1; // column C = date
      e.id = crypto.randomUUID();
      e.recordNo = e.date.replaceAll("-", "") + "-" + String(seq).padStart(3, "0");
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: RANGE,
        valueInputOption: "RAW", // stored as plain text; never interpreted as formulas
        requestBody: { values: [toRow(e)] },
      });
      return res.json({ ...e, rating: 0 });
    }

    if (req.method === "PATCH") {
      const id = String(req.query.id || "");
      const patch = cleanOut(req.body);
      if (!id || !patch) return res.status(400).json({ error: "Invalid time out" });
      const rows = await readRows();
      const idx = rows.findIndex((r) => r[0] === id);
      if (idx === -1) return res.status(404).json({ error: "Entry not found" });
      const entry = fromRow(rows[idx]);
      if (entry.timeOut) return res.status(409).json({ error: "Already timed out" });
      const updated = { ...entry, ...patch };
      const rowNum = idx + 2; // data starts on sheet row 2
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: `${TAB}!A${rowNum}:K${rowNum}`,
        valueInputOption: "RAW",
        requestBody: { values: [toRow(updated)] },
      });
      return res.json({ ...updated, rating: Number(updated.rating) });
    }

    res.setHeader("Allow", "GET, POST, PATCH").status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}