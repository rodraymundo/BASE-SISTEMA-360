export function permisoMiddleware(nombrePermiso) {
  return (req, res, next) => {
    const permisos = req.user?.permisos || {}; // Asegúrate que ya están cargados en el login

    if (permisos[nombrePermiso]) {
      return next();
    }

    return res.status(403).send('No tienes permiso para acceder a esta página.');
  };
}
