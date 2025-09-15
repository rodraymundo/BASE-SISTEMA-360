export function requireEleccion(tipo) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user || user.userType !== 'alumno') {
      return res.status(403).send('Acceso denegado');
    }

    // Checar arte
    if (tipo === 'arte') {
      if ([1,2,3].includes(Number(user.grado)) && !user.tieneArte) {
        return next();
      }
      return res.status(403).send('Acceso denegado');
    }

    // Checar taller
    if (tipo === 'taller') {
      if (!user.tieneTaller) {
        return next();
      }
      return res.status(403).send('Acceso denegado');
    }

    return res.status(403).send('Acceso denegado');
  };
}
