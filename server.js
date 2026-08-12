require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();
connectDB();

// ── Security ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret']
}));

app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000, max: 30,
    message: { success: false, message: 'Too many requests.' }
}));
app.use('/api/gemini', rateLimit({
    windowMs: 60 * 1000, max: 20,
    message: { success: false, message: 'Scan rate limit reached. Wait a moment.' }
}));
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, max: 200,
    message: { success: false, message: 'Too many requests.' }
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.static(__dirname));

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/scans',         require('./routes/scans'));
app.use('/api/gemini',        require('./routes/gemini'));

// ── Health check — Railway pings this to confirm app is alive ─────────────
// Must respond FAST (before Railway's 60s timeout)
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Marksheet Scanner API running',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// ── Root — so Railway's browser preview shows something ───────────────────
app.get('/', (req, res) => {
    res.status(200).send('Marksheet Scanner API v2.0 — OK');
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
});

// ── FIX: bind to 0.0.0.0 so Railway's proxy can reach the app ────────────
// Without '0.0.0.0', Node binds to 127.0.0.1 only → Railway health check
// cannot connect → SIGTERM after 60s timeout
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server running on 0.0.0.0:${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
});
