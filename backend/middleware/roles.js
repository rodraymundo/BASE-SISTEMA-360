function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session.user || !req.session.user.roles) {
      return res.status(403).send('Acceso denegado');
    }

    const rolesUsuario = req.session.user.roles.map(r => r.nombre_rol.toLowerCase());
    const rolesPermitidosLower = rolesPermitidos.map(r => r.toLowerCase());

    const tienePermiso = rolesUsuario.some(rol =>
      rolesPermitidosLower.includes(rol)
    );

    if (!tienePermiso) {
      return res.status(403).send('Acceso denegado');
    }

    next();
  };
}

module.exports = permitirRoles;
