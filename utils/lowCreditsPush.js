/**
 * utils/lowCreditsPush.js
 * Fires a push notification when a user's scanCredits drops to/below the
 * configured threshold. Reuses the same Firebase app routes/notifications.js
 * already sets up for admin broadcasts.
 */
const { admin, initFirebase } = require('../config/firebase');

const LOW_CREDIT_THRESHOLD = parseInt(process.env.LOW_CREDIT_THRESHOLD || '3', 10);

/**
 * Call after decrementing a user's scanCredits. Sends at most one push per
 * "low balance episode" (resets when the user recharges — see routes/payments.js
 * and routes/admin.js, which clear lowCreditsNotified on top-up).
 */
async function maybeSendLowCreditsPush(user) {
    if (user.unlimitedAccess) return;
    if (user.scanCredits > LOW_CREDIT_THRESHOLD) return;
    if (user.lowCreditsNotified) return;   // already pinged for this low balance
    if (!user.fcmToken) return;            // nothing to push to

    user.lowCreditsNotified = true;
    await user.save();

    if (!initFirebase()) return; // Firebase not configured — silently skip, scanning still works

    const title = user.scanCredits <= 0
        ? '⚡ Out of scan credits'
        : `⚡ Only ${user.scanCredits} scan credit${user.scanCredits === 1 ? '' : 's'} left`;
    const body = user.scanCredits <= 0
        ? 'Recharge now to keep scanning marksheets.'
        : `Top up now so you don't get interrupted mid-scan.`;

    try {
        await admin.messaging().send({
            token: user.fcmToken,
            notification: { title, body },
            data: { type: 'low_credits', scanCredits: String(user.scanCredits) },
            android: {
                priority: 'high',
                notification: { channelId: 'credits_low_channel' }
            }
        });
    } catch (e) {
        // Invalid/expired token — clear it so future sends don't keep failing
        if (
            e.errorInfo?.code === 'messaging/registration-token-not-registered' ||
            e.errorInfo?.code === 'messaging/invalid-registration-token'
        ) {
            user.fcmToken = null;
            await user.save();
        }
        console.error('low-credits push failed:', e.message);
    }
}

module.exports = { maybeSendLowCreditsPush, LOW_CREDIT_THRESHOLD };
