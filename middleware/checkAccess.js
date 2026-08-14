/**
 * middleware/checkAccess.js
 *
 * Central place that decides whether a user is allowed to perform a scan.
 * A user is blocked from scanning if ANY of:
 *   1. Admin has set isBlocked = true               → "Access restricted by admin"
 *   2. Admin has set isActive  = false               → "Account deactivated"
 *   3. scanCredits <= 0 AND unlimitedAccess = false  → "No scan credits left, please recharge"
 *
 * Used two ways:
 *   - requireAccess: Express middleware for routes that call Gemini directly
 *     from the backend (routes/gemini.js). Auto-consumes 1 credit on success.
 *   - evaluateAccess(user): plain function used by routes/access.js, which the
 *     Android app calls BEFORE and AFTER a direct-to-Gemini scan (the app
 *     currently calls the Gemini API directly with an embedded key, so the
 *     backend can't intercept that call — it gates it instead by checking
 *     before, and decrementing the credit after).
 */
const User = require('../models/User');

function evaluateAccess(user) {
    if (user.isBlocked) {
        return { allowed: false, reason: user.blockedReason || 'Your access has been restricted by admin. Contact support.' };
    }
    if (!user.isActive) {
        return { allowed: false, reason: 'Your account has been deactivated. Contact support.' };
    }
    if (!user.unlimitedAccess && (user.scanCredits === undefined || user.scanCredits <= 0)) {
        return { allowed: false, reason: 'No scan credits left. Please recharge to continue scanning.' };
    }
    return { allowed: true, reason: '' };
}

/** Express middleware — use on routes that themselves call the AI provider. */
async function requireAccess(req, res, next) {
    try {
        const check = evaluateAccess(req.user);
        if (!check.allowed) {
            return res.status(402).json({ success: false, code: 'ACCESS_DENIED', message: check.reason });
        }
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error checking access' });
    }
}

/** Deduct one credit after a successful scan. No-op if user has unlimited access. */
async function consumeOneCredit(userId) {
    const user = await User.findById(userId);
    if (!user) return null;
    if (!user.unlimitedAccess) {
        user.scanCredits = Math.max(0, (user.scanCredits || 0) - 1);
    }
    user.totalScansUsed = (user.totalScansUsed || 0) + 1;
    await user.save();
    return user;
}

module.exports = { evaluateAccess, requireAccess, consumeOneCredit };
