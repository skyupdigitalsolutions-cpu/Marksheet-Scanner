const express = require('express');
const Scan    = require('../models/Scan');
const authMW  = require('../middleware/auth');

const router = express.Router();

// All scan routes require authentication
router.use(authMW);

// ── POST /api/scans ───────────────────────────────────────────────────────
// Save a new scan result from the app
router.post('/', async (req, res) => {
    try {
        const { rawData, templateName, provider, flaggedFields, corrections, excelFileName } = req.body;

        if (!rawData) {
            return res.status(400).json({ success: false, message: 'rawData required' });
        }

        // Map known fields from rawData
        const data = rawData;
        const scan = await Scan.create({
            userId:       req.user._id,
            username:     req.user.username,
            bookletNo:    data['No']            || data['No.']           || '',
            studentName:  data['Name']          || '',
            regNo:        data['Reg No']        || data['Reg. No.']      || '',
            classBranch:  data['Class Branch']  || data['Class & Branch']|| '',
            section:      data['Section']       || '',
            courseName:   data['Course Name']   || '',
            courseCode:   data['Course Code']   || '',
            semester:     data['Semester']      || '',
            date:         data['Date']          || '',
            academicYear: data['Academic Year'] || '',
            q1a: num(data['Q1a']), q1b: num(data['Q1b']), q1c: num(data['Q1c']),
            q1d: num(data['Q1d']), q1e: num(data['Q1e']), q1Total: num(data['Q1 Total']),
            q2a: num(data['Q2a']), q2b: num(data['Q2b']), q2c: num(data['Q2c']),
            q2d: num(data['Q2d']), q2e: num(data['Q2e']), q2Total: num(data['Q2 Total']),
            q3a: num(data['Q3a']), q3b: num(data['Q3b']), q3c: num(data['Q3c']),
            q3d: num(data['Q3d']), q3e: num(data['Q3e']), q3Total: num(data['Q3 Total']),
            grandTotal:   num(data['Grand Total']),
            rawData:      data,
            templateName: templateName || 'SIT_Booklet',
            provider:     provider     || 'gemini',
            flaggedFields: flaggedFields || [],
            corrections:   corrections  || '',
            excelFileName: excelFileName || '',
            exportedToExcel: !!excelFileName
        });

        res.status(201).json({ success: true, scan });
    } catch (err) {
        console.error('Save scan error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/scans ────────────────────────────────────────────────────────
// Get current user's scan history (paginated)
router.get('/', async (req, res) => {
    try {
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip  = (page - 1) * limit;

        // Optional filters
        const filter = { userId: req.user._id };
        if (req.query.regNo)     filter.regNo     = new RegExp(req.query.regNo, 'i');
        if (req.query.course)    filter.courseName = new RegExp(req.query.course, 'i');
        if (req.query.semester)  filter.semester   = req.query.semester;
        if (req.query.dateFrom || req.query.dateTo) {
            filter.scannedAt = {};
            if (req.query.dateFrom) filter.scannedAt.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo)   filter.scannedAt.$lte = new Date(req.query.dateTo);
        }

        const [scans, total] = await Promise.all([
            Scan.find(filter)
                .sort({ scannedAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-rawData'),   // exclude large rawData from list view
            Scan.countDocuments(filter)
        ]);

        res.json({
            success: true,
            scans,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/scans/stats ──────────────────────────────────────────────────
// Dashboard statistics for current user
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user._id;

        const [
            totalScans,
            thisMonth,
            avgGrandTotal,
            recentScans,
            topCourses
        ] = await Promise.all([
            Scan.countDocuments({ userId }),

            Scan.countDocuments({
                userId,
                scannedAt: { $gte: new Date(new Date().setDate(1)) }
            }),

            Scan.aggregate([
                { $match: { userId, grandTotal: { $gt: 0 } } },
                { $group: { _id: null, avg: { $avg: '$grandTotal' } } }
            ]),

            Scan.find({ userId })
                .sort({ scannedAt: -1 })
                .limit(5)
                .select('studentName regNo grandTotal scannedAt'),

            Scan.aggregate([
                { $match: { userId } },
                { $group: { _id: '$courseName', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ])
        ]);

        res.json({
            success: true,
            stats: {
                totalScans,
                thisMonth,
                avgGrandTotal: avgGrandTotal[0]?.avg?.toFixed(1) || 0,
                recentScans,
                topCourses
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/scans/:id ────────────────────────────────────────────────────
// Get single scan with full rawData
router.get('/:id', async (req, res) => {
    try {
        const scan = await Scan.findOne({ _id: req.params.id, userId: req.user._id });
        if (!scan) return res.status(404).json({ success: false, message: 'Scan not found' });
        res.json({ success: true, scan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── DELETE /api/scans/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const scan = await Scan.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        if (!scan) return res.status(404).json({ success: false, message: 'Scan not found' });
        res.json({ success: true, message: 'Scan deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/scans/export/csv ─────────────────────────────────────────────
// Export all user scans as CSV
router.get('/export/csv', async (req, res) => {
    try {
        const scans = await Scan.find({ userId: req.user._id }).sort({ scannedAt: -1 });

        const headers = [
            'Scanned At','Booklet No','Student Name','Reg No','Class Branch',
            'Section','Course Name','Course Code','Semester','Date','Academic Year',
            'Q1a','Q1b','Q1c','Q1d','Q1e','Q1 Total',
            'Q2a','Q2b','Q2c','Q2d','Q2e','Q2 Total',
            'Q3a','Q3b','Q3c','Q3d','Q3e','Q3 Total','Grand Total'
        ].join(',');

        const rows = scans.map(s => [
            new Date(s.scannedAt).toISOString(),
            csv(s.bookletNo), csv(s.studentName), csv(s.regNo), csv(s.classBranch),
            csv(s.section), csv(s.courseName), csv(s.courseCode), csv(s.semester),
            csv(s.date), csv(s.academicYear),
            s.q1a, s.q1b, s.q1c, s.q1d, s.q1e, s.q1Total,
            s.q2a, s.q2b, s.q2c, s.q2d, s.q2e, s.q2Total,
            s.q3a, s.q3b, s.q3c, s.q3d, s.q3e, s.q3Total, s.grandTotal
        ].join(','));

        const csvContent = [headers, ...rows].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition',
            `attachment; filename="${req.user.username}_scans.csv"`);
        res.send(csvContent);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────
const num = (v) => parseInt(v) || 0;
const csv = (v) => `"${(v || '').replace(/"/g, '""')}"`;

module.exports = router;
