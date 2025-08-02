const cantidadEvaluaciones = document.getElementById('cantidadEvaluaciones');
const nombreAlumno = document.getElementById('nombreAlumno');
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // CARGAR LOS BOTONES QUE TENDRA DISPONIBLES PARA IR A EVALUACIONES
        await cargarInfo();
    } catch (error) {
        console.error('Error al iniciar la página:', error);
        // window.location.href = '/';
    }
});


async function cargarInfo() {
    try {
        const servicios = await getServicios();
        const counselor = await getCounselor();
        const talleres = await getTalleres();
        const docentes = await getDocentes();
        const alumno = await getInfoAlumno();
        let evaluacionesPendientes = 0;

        // FOR EACHS PARA SABER LA CANTIDAD DE EVALUACIONES PENDIENTES
        servicios.servicios.forEach(servicio => {
            if (servicio.estado_evaluacion_servicio == 0) {
                evaluacionesPendientes ++;
            }
        });


        if (counselor.counselor[0].estado_evaluacion_counselor == 0) { // SOLO PUEDE HABER UN COUNSELOR
            evaluacionesPendientes ++;
        }

        talleres.talleres.forEach(taller => {
            if (taller.estado_evaluacion_taller == 0) {
                evaluacionesPendientes ++;
            }
        });
        
        docentes.profesores.forEach(docente => {
            if (docente.estado_evaluacion_docente == 0) {
                evaluacionesPendientes ++;
            }
        });
        

        nombreAlumno.innerText = `¡Bienvenido(a),${alumno.alumno[0].nombre_alumno}!`

        // PONER LA CANTIDAD DE EVAKUACIONES FALTANTES
        cantidadEvaluaciones.innerText = evaluacionesPendientes;
    } catch (error) {
        console.error('Error al cargar botones:', error);
    }
}


 //OBTENER LOS SERVICIOS DE LA API
async function getServicios (){
    try {
        const res = await fetch(`/getServicios`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los servicios');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER EL COUNSELOR DE LA API
async function getCounselor (){
    try {
        const res = await fetch(`/getCounselor`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudo obtener el counselor');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER LOS TALLERES DE LA API
async function getTalleres (){
    try {
        const res = await fetch(`/getTalleres`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los talleres');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER LOS PROFESORES DE LA API
async function getDocentes (){
    try {
        const res = await fetch(`/getDocentes`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los docentes');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER LA INFO DE EL ALUMNO DE LA API
async function getInfoAlumno (){
    try {
        const res = await fetch(`/getInfoAlumno`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudo obtener la info del alumno');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}
