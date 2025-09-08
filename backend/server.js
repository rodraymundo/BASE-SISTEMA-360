const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const db = require('./config/db');
require('dotenv').config();

const session = require('cookie-session');

app.use(session({
  name: 'session',
  keys: [process.env.SESSION_SECRET],
  maxAge: 24 * 60 * 60 * 1000 // 1 día
}));

const app = express();
const PORT = process.env.PORT || 3000;

// Session store configuration for MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306, // Default MySQL port if not set
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true
  }
});

const sessionStore = new MySQLStore({}, pool.promise());

// Middleware
const corsOptions = {
  origin: process.env.ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/assets', express.static(path.join(__dirname, '../public')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.set('trust proxy', 1); // importante en Railway para HTTPS

app.use(session({
  secret: process.env.SESSION_SECRET || "mi_super_secreto_local",
  resave: false,
  saveUninitialized: false, // mejor seguridad
  store: sessionStore,
  cookie: {
    secure: true,          // ahora sí en producción
    httpOnly: true,
    sameSite: 'lax'        // o 'none' si hay subdominios
  }
}));

const csrfProtection = csrf({
  cookie: false,
  value: (req) => req.body._csrf || req.session.csrfToken
});

app.use(csrfProtection);

app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = req.csrfToken();
    console.log('Generated CSRF Token for new session:', req.session.csrfToken);
  }
  next();
});

app.use((req, res, next) => {
  console.log('Request Path:', req.path, 'Method:', req.method, 'Session ID:', req.session?.id);
  if (req.path === '/login' && req.method === 'POST') {
    console.log('Incoming CSRF Token:', req.body._csrf);
    console.log('Session CSRF Token:', req.session.csrfToken);
  }
  next();
});

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use('/', routes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT} a las ${new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' })}`);
}).on('error', (err) => {
  console.error('Server Error:', err);
});