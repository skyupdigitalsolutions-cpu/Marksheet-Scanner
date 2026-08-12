/**
 * routes/gemini.js — Gemini AI scan endpoints
 * FIX: These routes were entirely missing from server.js
 *      The app had no backend scan route — all scan buttons hit 404.
 */
const express = require('express');
const multer  = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const authMW  = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const FLASH = 'gemini-2.0-flash';
const PRO   = 'gemini-2.0-flash';

router.use(authMW);

function toGenerativePart(buffer, mimeType) {
    return { inlineData: { data: buffer.toString('base64'), mimeType } };
}
function stripJson(raw) {
    return raw.trim().replace(/^```json|^```|```$/gm, '').trim();
}

// POST /api/gemini/detect-fields
// FIX: was slow because no dedicated fast-detect route existed
router.post('/detect-fields', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
        const model = genAI.getGenerativeModel({ model: FLASH });
        const prompt = `You are a fast document parser. Analyse this scanned table image.
Return ONLY valid JSON — no markdown, no explanation.

Detect:
1. orientation: "row" (headers across top, records go down — registers, cash books, ledgers)
   OR "column" (labels on left side, records go across — some score sheets)
2. ALL column/field names visible
3. Best data type: "text" | "number" | "date" | "amount"

Output exactly:
{
  "orientation": "row" | "column",
  "confidence": 0-100,
  "columns": [
    { "name": "string", "type": "text|number|date|amount", "sample": "example value or empty" }
  ],
  "tableTitle": "string or empty",
  "language": "detected language"
}`;
        const result = await model.generateContent([prompt, toGenerativePart(req.file.buffer, req.file.mimetype)]);
        const parsed = JSON.parse(stripJson(result.response.text()));
        res.json({ success: true, data: parsed });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Detection failed' });
    }
});

// POST /api/gemini/scan  — schema-driven extraction
router.post('/scan', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
        let fields = [], orientation = 'row';
        try {
            fields = JSON.parse(req.body.fields || '[]');
            orientation = req.body.orientation || 'row';
        } catch (_) {}

        const model = genAI.getGenerativeModel({ model: PRO });
        const fieldList = fields.length
            ? fields.map((f, i) => `  ${i+1}. "${f.name||f}" (type: ${f.type||'text'})`).join('\n')
            : '  (auto-detect all fields)';

        const prompt = `Expert OCR for scanned documents.
ORIENTATION: "${orientation}" (row=each row is one record; column=each column is one record)
FIELDS: ${fieldList}
- Extract ALL visible records. Empty/illegible cell → null.
- amount: number only, strip ₹/commas. date: DD-MM-YYYY.
Return ONLY valid JSON:
{ "orientation":"row"|"column", "tableTitle":"", "totalRows":0, "rows":[{"Field":value}] }`;

        const result = await model.generateContent([prompt, toGenerativePart(req.file.buffer, req.file.mimetype)]);
        const parsed = JSON.parse(stripJson(result.response.text()));
        res.json({ success: true, data: parsed });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Scan failed' });
    }
});

// POST /api/gemini/scan-universal  — no schema, auto-detect everything
// FIX: Ledger Scan / Universal Scan buttons had no backend route
router.post('/scan-universal', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
        const model = genAI.getGenerativeModel({ model: PRO });
        const prompt = `Expert at reading scanned tabular documents (cash book, ledger, register, marksheet).
Detect orientation (row-wise or column-wise), extract ALL data, identify summary rows.
Return ONLY valid JSON:
{
  "orientation":"row"|"column",
  "tableTitle":"string",
  "columns":["col1","col2"],
  "rows":[{"col1":value,"col2":value}],
  "summaryRows":[{"label":"Total","col1":value}],
  "detectionNotes":"any important observation"
}`;
        const result = await model.generateContent([prompt, toGenerativePart(req.file.buffer, req.file.mimetype)]);
        const parsed = JSON.parse(stripJson(result.response.text()));
        res.json({ success: true, data: parsed });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Universal scan failed' });
    }
});

module.exports = router;
