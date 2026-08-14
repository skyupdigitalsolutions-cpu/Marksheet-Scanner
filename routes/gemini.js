/**
 * routes/gemini.js  — v3
 *
 * ROOT CAUSES of "Could not detect any rows":
 * 1. Gemini sometimes wraps JSON in ```json ... ``` even when told not to → stripJson was not
 *    aggressive enough, JSON.parse threw, catch returned 500, app showed generic error
 * 2. Gemini sometimes returns partial JSON or trailing commas → need lenient extraction
 * 3. Prompt was too prescriptive with pipe characters ("row" | "column") which
 *    Gemini sometimes echoes literally in the JSON string → invalid JSON
 * 4. No retry on transient Gemini errors
 * 5. mimeType was passed from req.file.mimetype which can be undefined/wrong
 *    for some Android camera outputs — always force image/jpeg
 * 6. Image was not being pre-processed (too dark/angled images fail) — added
 *    advice to prompt to handle low-quality images gracefully
 */

const express = require('express');
const multer  = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const authMW  = require('../middleware/auth');
const { requireAccess, consumeOneCredit } = require('../middleware/checkAccess');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Use flash for everything — it's faster AND more reliable for structured output
const MODEL = 'gemini-2.0-flash';

router.use(authMW);
// Admin restrictions + scan-credit paywall — blocked/out-of-credit users get
// a 402 before we spend anything calling Gemini.
router.use(requireAccess);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toImagePart(buffer) {
    // Always send as JPEG — avoids mime-type issues from Android camera
    return {
        inlineData: {
            data: buffer.toString('base64'),
            mimeType: 'image/jpeg'
        }
    };
}

/**
 * Robustly extract the first valid JSON object or array from a string.
 * Handles: ```json fences, leading text, trailing text, partial responses.
 */
function extractJson(raw) {
    if (!raw) throw new Error('Empty response from Gemini');

    // Strip markdown fences
    let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Try direct parse first
    try { return JSON.parse(text); } catch (_) {}

    // Find first { or [ and last } or ]
    const objStart = text.indexOf('{');
    const arrStart = text.indexOf('[');
    let start = -1;

    if (objStart === -1 && arrStart === -1) throw new Error('No JSON found in response');
    if (objStart === -1) start = arrStart;
    else if (arrStart === -1) start = objStart;
    else start = Math.min(objStart, arrStart);

    const isObj = text[start] === '{';
    const end   = isObj ? text.lastIndexOf('}') : text.lastIndexOf(']');
    if (end === -1) throw new Error('Incomplete JSON in response');

    const slice = text.slice(start, end + 1);
    try { return JSON.parse(slice); } catch (e) {
        // Last resort: remove trailing commas which Gemini sometimes adds
        const cleaned = slice
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']');
        return JSON.parse(cleaned);
    }
}

/** Call Gemini with up to 2 retries on transient errors */
async function callGemini(prompt, imageBuffer, retries = 2) {
    const model = genAI.getGenerativeModel({ model: MODEL });
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const result = await model.generateContent([prompt, toImagePart(imageBuffer)]);
            return result.response.text();
        } catch (e) {
            lastErr = e;
            if (i < retries) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        }
    }
    throw lastErr;
}

// ── POST /api/gemini/detect-fields ───────────────────────────────────────────
// Fast: detect column names + orientation only
router.post('/detect-fields', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });

        const prompt = `Analyse this scanned document image (could be a cash book, ledger, register, marksheet, or any table).

Your job: detect the table structure ONLY — do NOT extract data rows yet.

Step 1: Determine orientation
  - ROW-WISE: column headers run across the top, and each ROW is one record (most cash books, ledgers, registers)
  - COLUMN-WISE: field labels run down the left side, and each COLUMN is one record (some marksheets)

Step 2: List every column/field name you can see in the header row (or left label column).

Step 3: For each field, guess the data type from these options: text, number, date, amount

Even if the image is slightly blurry or angled, do your best. Never return an empty columns array — if unsure, use generic names like "Column 1", "Column 2".

Respond with ONLY this JSON (no explanation, no markdown):
{
  "orientation": "row",
  "confidence": 85,
  "columns": [
    { "name": "Date", "type": "date", "sample": "08-01-2026" },
    { "name": "Particulars", "type": "text", "sample": "Nagamma Gouda" }
  ],
  "tableTitle": "CASH BOOK",
  "language": "English"
}`;

        const raw    = await callGemini(prompt, req.file.buffer);
        const parsed = extractJson(raw);

        // Guarantee columns is always an array
        if (!parsed.columns || !Array.isArray(parsed.columns)) parsed.columns = [];
        if (!parsed.orientation) parsed.orientation = 'row';

        await consumeOneCredit(req.user._id);
        res.json({ success: true, data: parsed });

    } catch (err) {
        console.error('/detect-fields error:', err.message);
        res.status(500).json({
            success: false,
            message: `Detection failed: ${err.message}. Try a clearer photo.`
        });
    }
});

// ── POST /api/gemini/scan ─────────────────────────────────────────────────────
// Schema-driven extraction using known columns
router.post('/scan', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });

        let fields = [], orientation = 'row';
        try {
            fields      = JSON.parse(req.body.fields || '[]');
            orientation = req.body.orientation || 'row';
        } catch (_) {}

        const fieldList = fields.length
            ? fields.map((f, i) => `  ${i + 1}. "${f.name || f}" — type: ${f.type || 'text'}`).join('\n')
            : '  Extract whatever columns you can see';

        const orientDesc = orientation === 'column'
            ? 'COLUMN-WISE: field labels are on the LEFT, each column going rightward is one record'
            : 'ROW-WISE: column headers are on TOP, each row going downward is one record';

        const prompt = `You are extracting data from a scanned document image.

TABLE ORIENTATION: ${orientDesc}

FIELDS TO EXTRACT:
${fieldList}

RULES:
1. Extract EVERY data row visible (skip header row, skip total/summary rows — put those in summaryRows).
2. If a cell is empty or illegible, use null — never skip the field key.
3. For "amount" fields: return as a plain number (remove ₹, commas, spaces). Example: "1,82,500.00" → 182500
4. For "date" fields: format as DD-MM-YYYY.
5. For "number" fields: return as a number, not a string.
6. For "text" fields: keep original spelling.
7. Even if image is slightly blurry, extract what you can — do not return empty rows array.

Respond with ONLY this JSON (no explanation, no markdown):
{
  "orientation": "row",
  "tableTitle": "CASH BOOK",
  "totalRows": 3,
  "rows": [
    { "Date": "08-01-2026", "Particulars": "Nagamma Gouda", "Debit": 1240000, "Credit": null },
    { "Date": "08-01-2026", "Particulars": "Naganna Gouda", "Debit": 60000, "Credit": null }
  ],
  "summaryRows": [
    { "label": "Total", "Debit": 1300000, "Credit": 0 }
  ]
}`;

        const raw    = await callGemini(prompt, req.file.buffer);
        const parsed = extractJson(raw);

        if (!parsed.rows || !Array.isArray(parsed.rows)) parsed.rows = [];
        if (!parsed.orientation) parsed.orientation = orientation;

        await consumeOneCredit(req.user._id);
        res.json({ success: true, data: parsed });

    } catch (err) {
        console.error('/scan error:', err.message);
        res.status(500).json({
            success: false,
            message: `Scan failed: ${err.message}. Try a clearer photo.`
        });
    }
});

// ── POST /api/gemini/scan-universal ──────────────────────────────────────────
// No schema — auto-detect everything (Ledger Scan / Universal Scan buttons)
router.post('/scan-universal', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });

        const prompt = `You are an expert at reading scanned handwritten or printed documents.

This image could be a cash book, ledger, register, marksheet, or any tabular document.
Even if it is slightly blurry, tilted, or low-contrast — do your best to read it.

STEP 1: Determine orientation
  - ROW-WISE: headers run across the TOP (most cash books, ledgers, bank registers)
  - COLUMN-WISE: labels run down the LEFT (some score sheets)

STEP 2: Extract ALL visible column names from the header.

STEP 3: Extract EVERY data row (skip header, put totals in summaryRows).

STEP 4: Note any totals, grand totals, or opening/closing balance rows separately.

CRITICAL RULES:
- Never return an empty rows array. If you can only read partial data, return what you can.
- For amounts: strip ₹, commas, spaces → plain number. "18,50,000" → 1850000
- For dates: DD-MM-YYYY format.
- Null for any cell that is blank or completely illegible.
- The "columns" array must exactly match the keys used in each row object.

Respond with ONLY this JSON (no explanation, no markdown fences):
{
  "orientation": "row",
  "tableTitle": "CASH BOOK",
  "columns": ["Date", "Particulars", "Ledger No", "Debit", "Credit"],
  "rows": [
    { "Date": "08-01-2026", "Particulars": "Nagamma Gouda", "Ledger No": null, "Debit": 1240000, "Credit": null },
    { "Date": "08-01-2026", "Particulars": "Naganna Gouda", "Ledger No": null, "Debit": 60000, "Credit": null }
  ],
  "summaryRows": [
    { "label": "Total", "Debit": 1850000, "Credit": 1850366 }
  ],
  "detectionNotes": "Cash book page dated 08-01-2026, mix of handwritten entries"
}`;

        const raw    = await callGemini(prompt, req.file.buffer);
        const parsed = extractJson(raw);

        // Safety guarantees
        if (!parsed.rows    || !Array.isArray(parsed.rows))    parsed.rows    = [];
        if (!parsed.columns || !Array.isArray(parsed.columns)) parsed.columns = [];
        if (!parsed.orientation) parsed.orientation = 'row';
        if (!parsed.summaryRows) parsed.summaryRows = [];

        // If columns is empty but rows has data, derive columns from first row
        if (parsed.columns.length === 0 && parsed.rows.length > 0) {
            parsed.columns = Object.keys(parsed.rows[0]);
        }

        await consumeOneCredit(req.user._id);
        res.json({ success: true, data: parsed });

    } catch (err) {
        console.error('/scan-universal error:', err.message);
        res.status(500).json({
            success: false,
            message: `Scan failed: ${err.message}. Try a clearer, well-lit photo.`
        });
    }
});

module.exports = router;
