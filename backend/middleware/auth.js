module.exports = (req, res, next) => {
  if (!req.session.user) {
    return res.status(403).json({ success: false, message: 'No autenticado. Por favor, inicia sesión.' });
  }
  next();
};
