export function bloquearAlumnos(req, res, next) {
  const userType = req.session.user?.userType;

  if (userType === 'alumno') {
    return res.status(403).send('Acceso denegado para alumnos.');
  }

  next();
}
