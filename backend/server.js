// backend/server.js
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

const routes = require('./routes');
const db = require('./config/db'); // si lo usas en otras partes

const app = express();
const PORT = process.env.PORT || 3000;

// MySQL pool (solo para consultas; NO es store de sesiones aquí)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: true } // activa si tu BD lo requiere
});

// trust proxy necesario en Render/Heroku para cookies 'secure'
app.set('trust proxy', 1);

// CORS
const corsOptions = {
  origin: process.env.ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS']
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/assets', express.static(path.join(__dirname, '../public')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));

// cookie-session (usa SESSION_KEYS ó SESSION_SECRET)
const keys = (process.env.SESSION_KEYS && process.env.SESSION_KEYS.length)
  ? process.env.SESSION_KEYS.split(',')
  : (process.env.SESSION_SECRET ? [process.env.SESSION_SECRET] : ['dev_secret']);

app.use(cookieSession({
  name: 'session',
  keys,
  maxAge: 24 * 60 * 60 * 1000, // 1 día
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // true solo en prod (HTTPS)
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
}));

// CSRF: leemos token desde body o headers o desde la sesión
const csrfProtection = csrf({
  cookie: false,
  value: (req) => req.body._csrf || req.headers['x-csrf-token'] || req.headers['csrf-token'] || req.session?.csrfToken
});
app.use(csrfProtection);

// Generar token CSRF y guardarlo en la sesión si no existe
app.use((req, res, next) => {
  try {
    if (!req.session.csrfToken) {
      req.session.csrfToken = req.csrfToken();
      if (process.env.NODE_ENV !== 'production') {
        console.log('Generated CSRF Token for new session:', req.session.csrfToken);
      }
    }
  } catch (err) {
    // csurf puede fallar en algunos requests (HEAD, etc.) — no bloquear todo
    console.warn('CSRF token generation warning:', err && err.message);
  }
  next();
});

// Debug leve (solo en dev)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log('Request Path:', req.path, 'Method:', req.method, 'Session keys:', Object.keys(req.session || {}));
    next();
  });
}

// Anti-cache headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Rutas
app.use('/', routes);

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT} - ${new Date().toLocaleString('es-MX')}`);
}).on('error', err => {
  console.error('Server Error:', err);
});
