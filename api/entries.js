import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

const COLS = ["id","date","shift","physicalExam","ftf","online","admissions","referral","death",
  "minorProcedure","dental","medicalCertificate","bp","rbs","clearance","totalPatients",
  "grandTotal","nod","status","notes"];
const NUMERIC = COLS.slice(3, 16);
const SHIFTS = ["Morning", "Afternoon", "Night", "24 Hours"];
const STATUSES = ["Recorded", "For Review"];
const TAB = process.env.SHEET_TAB || "Sheet1";
const RANGE = `${TAB}!A2:T`;

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

function clean(body = {}) {
  const e = {};
  for (const c of NUMERIC) e[c] = String(Math.max(0, Math.floor(Number(body[c]) || 0)));
  e.date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  e.shift = SHIFTS.includes(body.shift) ? body.shift : null;
  e.status = STATUSES.includes(body.status) ? body.status : "Recorded";
  e.nod = String(body.nod || "").trim().slice(0, 120);
  e.notes = String(body.notes || "").trim().slice(0, 1000);
  if (!e.date || !e.shift || !e.nod) return null;
  return e;
}

export default async function handler(req, res) {
  const auth = await authorize(req);
  if (auth.status) return res.status(auth.status).json({ error: "Not authorized" });

  try {
    if (req.method === "GET") {
      const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: RANGE });
      return res.json((data.values || []).map((r) => Object.fromEntries(COLS.map((c, i) => [c, r[i] ?? ""]))));
    }
    if (req.method === "POST") {
      const e = clean(req.body);
      if (!e) return res.status(400).json({ error: "Invalid entry" });
      e.id = crypto.randomUUID();
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: RANGE,
        valueInputOption: "RAW", // stored as plain text; never interpreted as formulas
        requestBody: { values: [COLS.map((c) => e[c])] },
      });
      return res.json(e);
    }
    res.setHeader("Allow", "GET, POST").status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}