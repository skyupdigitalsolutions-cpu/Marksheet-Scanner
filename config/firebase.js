const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
    if (initialized) return true;

    try {
        let credential;

        // Option 1: JSON content in environment variable (Railway/cloud hosting)
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            credential = admin.credential.cert(serviceAccount);
            console.log('✓ Firebase initialized from environment variable');

        // Option 2: JSON file on disk (local development)
        } else {
            const path = require('path');
            const fs   = require('fs');
            const keyPath = path.join(__dirname, '../firebase-service-account.json');
            if (!fs.existsSync(keyPath)) {
                console.warn('⚠  Firebase not configured — push notifications disabled');
                console.warn('   Set FIREBASE_SERVICE_ACCOUNT env variable or add firebase-service-account.json');
                return false;
            }
            credential = admin.credential.cert(require(keyPath));
            console.log('✓ Firebase initialized from file');
        }

        admin.initializeApp({ credential });
        initialized = true;
        return true;

    } catch (e) {
        console.error('Firebase init error:', e.message);
        return false;
    }
}

module.exports = { admin, initFirebase };
