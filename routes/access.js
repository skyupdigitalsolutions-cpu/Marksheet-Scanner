/**
 * routes/access.js
 *
 * Called by the Android app around every scan:
 *   GET  /api/access/status   — before showing the camera/scan screen
 *   POST /api/access/consume  — right after a scan succeeds, to deduct 1 credit
 *
 * This lets admin restrictions + the Razorpay paywall work even though the
 * app calls Gemini directly with its own embedded API key (see
 * app/.../gemini/GeminiAPI.kt) instead of through routes/gemini.js.
 */
const express = require('express');
const authMW  = require('../middleware/auth');
const { evaluateAccess, consumeOneCredit } = require('../middleware/checkAccess');

const router = express.Router();
router.use(authMW);

// GET /api/access/status
router.get('/status', (req, res) => {
    const check = evaluateAccess(req.user);
    res.json({
        success: true,
        canScan: check.allowed,
        message: check.reason,
        scanCredits: req.user.scanCredits,
        unlimitedAccess: req.user.unlimitedAccess,
        isBlocked: req.user.isBlocked,
        isActive: req.user.isActive,
        minRechargeAmount: parseInt(process.env.MIN_RECHARGE_RUPEES || '100', 10)
    });
});

// POST /api/access/consume  — call once, immediately after a scan succeeds
router.post('/consume', async (req, res) => {
    try {
        // Re-check right before consuming, in case admin blocked the user
        // mid-session or credits ran out between the status check and now.
        const check = evaluateAccess(req.user);
        if (!check.allowed) {
            return res.status(402).json({ success: false, code: 'ACCESS_DENIED', message: check.reason });
        }
        const updated = await consumeOneCredit(req.user._id);
        res.json({
            success: true,
            scanCredits: updated.scanCredits,
            unlimitedAccess: updated.unlimitedAccess,
            totalScansUsed: updated.totalScansUsed
        });
    } catch (err) {
        console.error('consume credit error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
