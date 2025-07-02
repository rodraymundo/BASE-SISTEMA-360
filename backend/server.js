const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const routes = require('./routes'); // Importa las rutas
const db = require('./config/db'); // Ajustado para config/db.js
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Session store configuration for MySQL
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Balmoral',
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000, // 15 minutes
  expiration: 24 * 60 * 60 * 1000 // 24 hours
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://preparatoria-evaluaciones.com' : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/assets', express.static(path.join(__dirname, '../public'))); // Sirve todos los archivos de public bajo /assets
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tu_secreto_aqui',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(csrf());

// Middleware to protect routes
const authMiddleware = (req, res, next) => {
  if (!req.session.user) {
    return res.status(403).json({ success: false, message: 'No autenticado. Por favor, inicia sesión.' });
  }
  next();
};

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});


// Use routes
app.use('/', routes);

// Start server
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT} a las ${new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' })}`);
});