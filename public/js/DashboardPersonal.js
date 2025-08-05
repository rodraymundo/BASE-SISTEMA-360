const listaBotones = document.getElementById('listaBotones'); // DIV QUE ALMACENARA LOS BOTONES
const cantidadEvaluaciones = document.getElementById('cantidadEvaluaciones');
const nombrePersona = document.getElementById('nombrePersona');
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // CARGAR LOS BOTONES QUE TENDRA DISPONIBLES PARA IR A EVALUACIONES
        await cargarBotones();
    } catch (error) {
        console.error('Error al iniciar la página:', error);
        // window.location.href = '/';
    }
});


async function cargarBotones() {
    try {
        const cordinadores = await getCoordinadores();
        const subordinados = await getSubordinados();
        const pares = await getPares();
        const jefes = await getJefes();
        const todos = await get360();
        const persona = await getInfoPersona();
        let coordinadoresPendientesCantidad = 0;
        let subordinadosPendienteCantidad = 0;
        let jefesPendienteCantidad = 0;
        let paresPendientesCantidad = 0;
        let todosPendientesCantidad = 0;

        //DEPENDIENDO DE SI LAS EVALUACIONES QUE DEBEN DE HACER SUPERAN A 0 APARECE EL BOTON
        if(cordinadores.cantidadCoordinadores>0){
            const btnCordinador = document.createElement('a');
            btnCordinador.className = 'btn btn-success px-4 py-2 m-1 fw-bold position-relative'; // EL POSITION-RELATIVE ES PARA QUE LA INSIGNIA DETECTE EL BOTON COMO EL ELEMENTO 
            btnCordinador.href = '/EvaluacionCoordinador';
            btnCordinador.innerText = 'COORDINADOR';

            cordinadores.coordinadores.forEach(cordinador => {
                if (cordinador.estado_evaluacion_coordinador == 0) {
                    coordinadoresPendientesCantidad ++;
                }
            });

            if (coordinadoresPendientesCantidad > 0) {   // PARA PONER UNA INSIGNIAS DE PENDIENTES 
                const coordinadoresPendientes = document.createElement('span');
                coordinadoresPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
                coordinadoresPendientes.innerText = coordinadoresPendientesCantidad;
                btnCordinador.appendChild(coordinadoresPendientes);
            }
            listaBotones.appendChild(btnCordinador);
        }

        if(subordinados.cantidadSubordinados>0){
            const btnSubordinado = document.createElement('a');
            btnSubordinado.className = 'btn btn-primary px-4 py-2 m-1 fw-bold position-relative';
            btnSubordinado.href = '/EvaluacionSubordinados';
            btnSubordinado.innerText = 'SUBORDINADOS';
            
            subordinados.subordinados.forEach(subordinado => {
                if (subordinado.estado_evaluacion_subordinado == 0) {
                    subordinadosPendienteCantidad ++;
                }
            });
            
            if (subordinadosPendienteCantidad > 0) {   // PARA PONER UNA INSIGNIAS DE PENDIENTES 
                const subordinadosPendientes = document.createElement('span');
                subordinadosPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
                subordinadosPendientes.innerText = subordinadosPendienteCantidad;
                btnSubordinado.appendChild(subordinadosPendientes);
            }
            listaBotones.appendChild(btnSubordinado);
        }

        if(pares.cantidadPares>0){
            const btnPares = document.createElement('a');
            btnPares.className = 'btn btn-warning text-white px-4 py-2 m-1 fw-bold position-relative';
            btnPares.href = '/EvaluacionPares';
            btnPares.innerText = 'PARES';

            pares.pares.forEach(par => {
                if (par.estado_evaluacion_par == 0) {
                    paresPendientesCantidad ++;
                }
            });

            if (paresPendientesCantidad > 0) {   // PARA PONER UNA INSIGNIAS DE PENDIENTES 
                const paresPendientes = document.createElement('span');
                paresPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
                paresPendientes.innerText = paresPendientesCantidad;
                btnPares.appendChild(paresPendientes);
            }
            listaBotones.appendChild(btnPares);
        }

        if(jefes.cantidadJefes>0){
            const btnJefes = document.createElement('a');
            btnJefes.className = 'btn btn-info text-white px-4 py-2 m-1 fw-bold position-relative';
            btnJefes.href = '/EvaluacionJefe';
            btnJefes.innerText = 'JEFES';
            
            jefes.jefes.forEach(jefe => {
                if (jefe.estado_evaluacion_jefe == 0) {
                    jefesPendienteCantidad ++;
                }
            });

            if (jefesPendienteCantidad > 0) {   // PARA PONER UNA INSIGNIAS DE PENDIENTES 
                const jefesPendientes = document.createElement('span');
                jefesPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
                jefesPendientes.innerText = jefesPendienteCantidad;
                btnJefes.appendChild(jefesPendientes);
            }
            listaBotones.appendChild(btnJefes);
        }

        if(todos.cantidad360>0){
            const btn360 = document.createElement('a');
            btn360.className = 'btn btn-dark text-white px-4 py-2 m-1 fw-bold position-relative';
            btn360.href = '/Evaluacion360';
            btn360.innerText = '360';

            todos.todos.forEach(personal => {
                if (personal.estado_evaluacion_360 == 0) {
                    todosPendientesCantidad ++;
                }
            });

            if (todosPendientesCantidad > 0) {   // PARA PONER UNA INSIGNIAS DE PENDIENTES 
                const todosPendientes = document.createElement('span');
                todosPendientes.className = 'badge bg-danger position-absolute top-0 start-100 translate-middle ';
                todosPendientes.innerText = todosPendientesCantidad;
                btn360.appendChild(todosPendientes);
            }
            listaBotones.appendChild(btn360);
        }

        nombrePersona.innerText = `¡Bienvenido(a),${persona.persona[0].nombre_personal}!`

        // PONER LA CANTIDAD DE EVAKUACIONES FALTANTES
        cantidadEvaluaciones.innerText = coordinadoresPendientesCantidad + subordinadosPendienteCantidad + jefesPendienteCantidad + paresPendientesCantidad + todosPendientesCantidad;
    } catch (error) {
        console.error('Error al cargar botones:', error);
    }
}

//OBTENER LOS CORDINADORES DE LA API
async function getCoordinadores (){
    try {
        const res = await fetch(`/getCoordinadores`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener las coordinadores');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

 //OBTENER LOS SUBORDINADOS DE LA API
async function getSubordinados (){
    try {
        const res = await fetch(`/getSubordinados`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener las subordinados');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER LOS PARES DE LA API
async function getPares (){
    try {
        const res = await fetch(`/getPares`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener las pares');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER LOS SUBORDINADOS DE LA API
async function getJefes (){
    try {
        const res = await fetch(`/getJefes`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los jefes');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER LOS 360 DE LA API
async function get360 (){
    try {
        const res = await fetch(`/get360`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los 360');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

//OBTENER LA INFO DE LA PERSONA DE LA API
async function getInfoPersona (){
    try {
        const res = await fetch(`/getInfoPersona`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudo obtener la info de la persona');
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}
