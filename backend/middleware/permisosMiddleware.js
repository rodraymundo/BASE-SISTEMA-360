export function permisoMiddleware(nombrePermiso) {
  return (req, res, next) => {
    console.log('req.user:', req.user);
    console.log('req.user.permisos:', req.user?.permisos);
    console.log('nombrePermiso:', nombrePermiso);

    const permisos = req.user?.permisos || {}; 

    if (permisos[nombrePermiso]) {
      return next();
    }

    return res.status(403).send('No tienes permiso para acceder a esta página.');
  };
}
