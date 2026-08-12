/**
 * routes/notifications.js
 * FIXES:
 * 1. GET /history was MISSING — admin.html called it but got 404
 * 2. Notifications now saved to MongoDB after send
 * 3. Role-based targeting actually filters users
 * 4. Invalid FCM tokens cleaned up after send
 */
const express  = require('express');
const { admin, initFirebase } = require('../config/firebase');
const User         = require('../models/User');
const Notification = require('../models/Notification');
const authMW       = require('../middleware/auth');

const router = express.Router();
const ADMIN  = process.env.ADMIN_SECRET || 'skyup_admin_secret';

function adminAuth(req, res, next) {
    if (req.headers['x-admin-secret'] !== ADMIN)
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    next();
}

// POST /api/notifications/token
router.post('/token', authMW, async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ success: false, message: 'fcmToken required' });
        await User.findByIdAndUpdate(req.user._id, { fcmToken });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST /api/notifications/send
router.post('/send', adminAuth, async (req, res) => {
    const { title, body, type = 'general', target = 'all', targetRole, actionUrl, imageUrl } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: 'title and body required' });

    if (!initFirebase())
        return res.status(500).json({ success: false, message: 'Firebase not configured. Set FIREBASE_SERVICE_ACCOUNT env variable.' });

    try {
        const query = { fcmToken: { $ne: null } };
        if (target === 'role' && targetRole) query.role = targetRole;

        const users  = await User.find(query).select('fcmToken');
        const tokens = users.map(u => u.fcmToken).filter(Boolean);
        if (!tokens.length) return res.json({ success: true, message: 'No devices registered yet', sent: 0, failed: 0 });

        let sent = 0, failed = 0;
        const invalidTokens = [];

        for (let i = 0; i < tokens.length; i += 500) {
            const batch = tokens.slice(i, i + 500);
            try {
                const fcmMsg = {
                    tokens: batch,
                    notification: { title, body },
                    data: { type, actionUrl: actionUrl || '', target: target || 'all' },
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: type === 'update' ? 'update_channel' : type === 'promotion' ? 'promo_channel' : 'general_channel',
                            ...(imageUrl ? { imageUrl } : {})
                        }
                    }
                };
                const response = await admin.messaging().sendEachForMulticast(fcmMsg);
                sent   += response.successCount;
                failed += response.failureCount;
                response.responses.forEach((r, idx) => {
                    if (!r.success && (
                        r.error?.code === 'messaging/registration-token-not-registered' ||
                        r.error?.code === 'messaging/invalid-registration-token'
                    )) invalidTokens.push(batch[idx]);
                });
            } catch (e) { console.error('FCM batch error:', e.message); failed += batch.length; }
        }

        if (invalidTokens.length)
            await User.updateMany({ fcmToken: { $in: invalidTokens } }, { $set: { fcmToken: null } });

        await Notification.create({
            sentBy: 'SkyUp Digital Admin', title, body,
            imageUrl: imageUrl || null, actionUrl: actionUrl || null,
            type, target, targetRole: targetRole || null,
            sentCount: sent, failCount: failed
        });

        res.json({ success: true, message: `Sent: ${sent}, Failed: ${failed}`, sent, failed, total: tokens.length });
    } catch (err) {
        console.error('Send error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/notifications/history  ← FIX: was missing, admin.html called it
router.get('/history', adminAuth, async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ sentAt: -1 }).limit(50);
        res.json({ success: true, total: notifications.length, notifications });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/notifications/users
router.get('/users', adminAuth, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, total: users.length, fcmActive: users.filter(u => u.fcmToken).length, users });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
