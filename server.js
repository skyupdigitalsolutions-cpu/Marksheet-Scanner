require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();
app.set('trust proxy', 1);   // Railway sits behind one reverse-proxy hop — required for express-rate-limit
connectDB();

// ── Security ──────────────────────────────────────────────────────────────
// Custom CSP: strict for API routes, relaxed for admin.html
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'"],   // needed for admin.html inline JS
            scriptSrcAttr: ["'unsafe-inline'"],            // needed for onclick= handlers
            styleSrc:    ["'self'", "'unsafe-inline'"],    // needed for inline styles
            imgSrc:      ["'self'", "data:", "https:"],
            connectSrc:  ["'self'", "https:"],             // allow fetch() to any HTTPS
            fontSrc:     ["'self'", "https:", "data:"],
            objectSrc:   ["'none'"],
            frameSrc:    ["'none'"],
        }
    },
    crossOriginEmbedderPolicy: false   // allow admin panel to load without COEP issues
}));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret']
}));

// ── Rate limiting ─────────────────────────────────────────────────────────
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

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Marksheet Scanner API running',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.status(200).send('Marksheet Scanner API v2.0 — OK');
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server running on 0.0.0.0:${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  Admin:  http://localhost:${PORT}/admin.html`);
});