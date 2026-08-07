const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

let initialized = false;

function initFirebase() {
    if (initialized) return true;
    const keyPath = path.join(__dirname, '../firebase-service-account.json');
    if (!fs.existsSync(keyPath)) {
        console.warn('⚠  firebase-service-account.json not found — push notifications disabled');
        return false;
    }
    try {
        admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
        initialized = true;
        console.log('✓ Firebase Admin (V1 API) initialized');
        return true;
    } catch (e) {
        console.error('Firebase init error:', e.message);
        return false;
    }
}

module.exports = { admin, initFirebase };
