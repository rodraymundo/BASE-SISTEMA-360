const bcrypt = require('bcryptjs');
    const db = require('./config/db');

    async function hashPasswords() {
        const saltRounds = 10;

        try {
            // Obtener todos los usuarios
            const [users] = await db.query('SELECT id_usuario, contraseña_usuario FROM Usuario');

            for (const user of users) {
                // Hashear la contraseña
                const hashedPassword = await bcrypt.hash(user.contraseña_usuario, saltRounds);

                // Actualizar la contraseña en la DB
                await db.query('UPDATE Usuario SET contraseña_usuario = ? WHERE id_usuario = ?', [hashedPassword, user.id_usuario]);
                console.log(`Contraseña actualizada para id_usuario: ${user.id_usuario}`);
            }

            console.log('Todas las contraseñas han sido hasheadas.');
            process.exit(0);
        } catch (error) {
            console.error('Error al hashear contraseñas:', error);
            process.exit(1);
        }
    }

    hashPasswords();