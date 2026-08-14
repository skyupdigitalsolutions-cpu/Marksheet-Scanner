/**
 * routes/admin.js
 * All routes here require the 'x-admin-secret' header (see middleware/adminAuth.js).
 * Consumed by admin.html's "Access Control" and "Payments" tabs.
 */
const express   = require('express');
const User      = require('../models/User');
const Payment   = require('../models/Payment');
const Scan      = require('../models/Scan');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/users — full list incl. restriction + credit state
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, total: users.length, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/users/:id/block   { blocked: true/false, reason }
router.post('/users/:id/block', async (req, res) => {
    try {
        const { blocked, reason } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            {
                isBlocked: !!blocked,
                blockedReason: blocked ? (reason || 'Restricted by admin') : '',
                blockedAt: blocked ? new Date() : null
            },
            { new: true }
        ).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/users/:id/active   { active: true/false }
// Separate from block — this is a hard account disable (also used at login/auth level)
router.post('/users/:id/active', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive: !!req.body.active },
            { new: true }
        ).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/users/:id/credits   { credits: <number to ADD, can be negative>, unlimitedAccess: true/false }
// Lets admin manually grant free scans or unlimited access without a payment.
router.post('/users/:id/credits', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (req.body.credits !== undefined) {
            const delta = parseInt(req.body.credits, 10) || 0;
            user.scanCredits = Math.max(0, (user.scanCredits || 0) + delta);
        }
        if (req.body.unlimitedAccess !== undefined) {
            user.unlimitedAccess = !!req.body.unlimitedAccess;
        }
        await user.save();
        res.json({ success: true, user: user.toJSON() });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/payments — all users' payment history + revenue summary
router.get('/payments', async (req, res) => {
    try {
        const payments = await Payment.find().sort({ createdAt: -1 }).limit(200);
        const paidOnly = payments.filter(p => p.status === 'paid');
        const totalRevenuePaise = paidOnly.reduce((sum, p) => sum + p.amount, 0);
        res.json({
            success: true,
            payments,
            summary: {
                totalPayments: payments.length,
                successfulPayments: paidOnly.length,
                totalRevenueRupees: Math.round(totalRevenuePaise / 100)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/stats — overview numbers for the dashboard
router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, blockedUsers, totalScans, payments] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isBlocked: true }),
            Scan.countDocuments(),
            Payment.find({ status: 'paid' })
        ]);
        const totalRevenueRupees = Math.round(payments.reduce((s, p) => s + p.amount, 0) / 100);
        res.json({
            success: true,
            stats: { totalUsers, blockedUsers, totalScans, totalRevenueRupees, totalPayments: payments.length }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
