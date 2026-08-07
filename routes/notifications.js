const express          = require('express');
const { admin, initFirebase } = require('../config/firebase');
const User             = require('../models/User');
const authMW           = require('../middleware/auth');

const router = express.Router();
const ADMIN  = process.env.ADMIN_SECRET || 'skyup_admin_secret';

function adminAuth(req, res, next) {
    if (req.headers['x-admin-secret'] !== ADMIN)
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    next();
}

// ── POST /api/notifications/token ─────────────────────────────────────────
// App registers FCM token after login
router.post('/token', authMW, async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken)
            return res.status(400).json({ success: false, message: 'fcmToken required' });
        await User.findByIdAndUpdate(req.user._id, { fcmToken });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /api/notifications/send ──────────────────────────────────────────
// Developer sends push to all users — uses FCM V1 API via firebase-admin
router.post('/send', adminAuth, async (req, res) => {
    const { title, body, type = 'general', actionUrl } = req.body;
    if (!title || !body)
        return res.status(400).json({ success: false, message: 'title and body required' });

    if (!initFirebase())
        return res.status(500).json({
            success: false,
            message: 'firebase-service-account.json not found. See setup instructions.'
        });

    try {
        const users  = await User.find({ fcmToken: { $ne: null } }).select('fcmToken');
        const tokens = users.map(u => u.fcmToken).filter(Boolean);

        if (!tokens.length)
            return res.json({ success: true, message: 'No devices registered yet', sent: 0 });

        let sent = 0, failed = 0;

        // FCM V1 multicast — batches of 500
        for (let i = 0; i < tokens.length; i += 500) {
            const batch = tokens.slice(i, i + 500);
            try {
                const response = await admin.messaging().sendEachForMulticast({
                    tokens: batch,
                    notification: { title, body },
                    data: {
                        type,
                        actionUrl: actionUrl || '',
                    },
                    android: {
                        priority: 'high',
                        notification: { channelId: 'promo_channel' }
                    }
                });
                sent   += response.successCount;
                failed += response.failureCount;

                // Clean up invalid tokens
                const invalid = response.responses
                    .map((r, idx) => (!r.success && (
                        r.error?.code === 'messaging/registration-token-not-registered' ||
                        r.error?.code === 'messaging/invalid-registration-token'
                    )) ? batch[idx] : null)
                    .filter(Boolean);
                if (invalid.length)
                    await User.updateMany({ fcmToken: { $in: invalid } }, { $set: { fcmToken: null } });
            } catch (e) {
                console.error('Batch error:', e.message);
                failed += batch.length;
            }
        }

        res.json({
            success: true,
            message: `Sent: ${sent}, Failed: ${failed}`,
            sent, failed, total: tokens.length
        });

    } catch (err) {
        console.error('Send error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /api/notifications/users ──────────────────────────────────────────
// Developer: see all registered users
router.get('/users', adminAuth, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({
            success:   true,
            total:     users.length,
            fcmActive: users.filter(u => u.fcmToken).length,
            users
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
