const listaBotones = document.getElementById('listaBotones');
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
        let docentesPendientesCantidad = 0;
        let counselorPendienteCantidad = 0;
        let talleresPendientesCantidad = 0;
        let serviciosPendientesCantidad = 0;

        // FOR EACHS PARA SABER LA CANTIDAD DE EVALUACIONES PENDIENTES
        if (counselor.counselor[0].estado_evaluacion_counselor == 0) { // SOLO PUEDE HABER UN COUNSELOR
            counselorPendienteCantidad ++;
        }

        docentes.profesores.forEach(docente => {
            if (docente.estado_evaluacion_materia == 0) {
                docentesPendientesCantidad ++;
            }
        });

        docentes.ingles.forEach(docente => {
            if (docente.estado_evaluacion_nivel_ingles == 0) {
                docentesPendientesCantidad ++;
            }
        });

        docentes.arte.forEach(docente => {
            if (docente.estado_evaluacion_arte_especialidad == 0) {
                docentesPendientesCantidad ++;
            }
        });

        servicios.servicios.forEach(servicio => {
            if (servicio.estado_evaluacion_servicio == 0) {
                serviciosPendientesCantidad ++;
            }
        });

        talleres.talleres.forEach(taller => {
            if (taller.estado_evaluacion_taller == 0) {
                talleresPendientesCantidad ++;
            }
        });

        // CREACION DE BOTONES
        const btnDocentes = document.createElement('a');
        btnDocentes.className = 'btn btn-success px-4 py-2 m-1 text-white fw-bold position-relative'; // EL POSITION-RELATIVE ES PARA QUE LA INSIGNIA DETECTE EL BOTON COMO EL ELEMENTO "PRINCIPAL"
        btnDocentes.href = '/EvaluacionProfesores';
        btnDocentes.innerText = 'PROFESORES';

        if (docentesPendientesCantidad > 0) {   // PARA PONER UNA INSIGNIAS DE PENDIENTES 
            const docentesPendientes = document.createElement('span');
            docentesPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
            docentesPendientes.innerText = docentesPendientesCantidad;
            btnDocentes.appendChild(docentesPendientes);
        }
        listaBotones.appendChild(btnDocentes);

        const btnCounselor = document.createElement('a');
        btnCounselor.className = 'btn btn-primary px-4 py-2 m-1 text-white fw-bold position-relative';
        btnCounselor.href = '/EvaluacionCounselor';
        btnCounselor.innerText = 'COUNSELOR';

        if (counselorPendienteCantidad > 0) {   // PARA PONER UNA INSIGNIAS DE PENDIENTES 
            const docentesPendientes = document.createElement('span');
            docentesPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
            docentesPendientes.innerText = counselorPendienteCantidad;
            btnCounselor.appendChild(docentesPendientes);
        }
        listaBotones.appendChild(btnCounselor);

        // DEPENDIENDO SI TIENE TALLERES ASIGNADOS
        if(talleres.cantidadTalleres>0){
            const btnTalleres = document.createElement('a');
            btnTalleres.className = 'btn btn-info px-4 py-2 m-1 text-white fw-bold position-relative';
            btnTalleres.href = '/EvaluacionTalleres';
            btnTalleres.innerText = 'TALLERES';

            // PARA PONER UNA INSIGNIA CON LOS TALLERES PENDIENTES
            if (talleresPendientesCantidad > 0) {
                const talleresPendientes = document.createElement('span');
                talleresPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
                talleresPendientes.innerText = talleresPendientesCantidad;
                btnTalleres.appendChild(talleresPendientes);
            }
            listaBotones.appendChild(btnTalleres);
        }  

        const btnServicios = document.createElement('a');
        btnServicios.className = 'btn btn-warning px-4 py-2 m-1 text-white fw-bold position-relative';
        btnServicios.href = '/EvaluacionServicios';
        btnServicios.innerText = 'SERVICIOS';

        if (serviciosPendientesCantidad > 0) {
            const docentesPendientes = document.createElement('span');
            docentesPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
            docentesPendientes.innerText = serviciosPendientesCantidad;
            btnServicios.appendChild(docentesPendientes);
        }
        listaBotones.appendChild(btnServicios);

        nombreAlumno.innerText = `¡Bienvenido(a),${alumno.alumno[0].nombre_alumno}!`

        // PONER LA CANTIDAD DE EVAKUACIONES FALTANTES
        cantidadEvaluaciones.innerText = docentesPendientesCantidad + counselorPendienteCantidad + talleresPendientesCantidad + serviciosPendientesCantidad;
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
