require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit= require('express-rate-limit');
const connectDB= require('./config/db');

const app = express();
connectDB();

app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 50, message: { success: false, message: 'Too many requests.' } }));
app.use(express.json({ limit: '1mb' }));

// ── Auth only ─────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/health', (req, res) => res.json({ success: true, message: 'API running' }));

app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
