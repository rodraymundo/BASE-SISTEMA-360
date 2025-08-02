let botonActivo = null;//SABER QUE BOTON "EVALUAR" FUE EL QUE SE PRESIONO

const listaProfesores = document.getElementById('listaProfesores'); // DIV QUE ALMACENARA LAS CARD DE PROFESORES 
const modalEvaluacion = new bootstrap.Modal(document.getElementById('modalEvaluacion')); // MODAL
const modalEvaluacionHeader = document.getElementById('modalEvaluacionHeader'); // HEADER DEL MODAL
const modalEvaluacionBody = document.getElementById('modalEvaluacionBody'); // BODY DEL MODAL
const modalEvaluacionFooter = document.getElementById('modalEvaluacionFooter');
const btnAtras = document.getElementById('btnAtras'); // BOTON DE ATRAS
const btnSiguiente = document.getElementById('btnSiguiente'); // BOTON DE SIGUIENTE


document.addEventListener('DOMContentLoaded', async () => {
    try {
        // CARGAR LOS PROFESORES
        await cargarProfesores();
        document.querySelectorAll('.evaluar-btn').forEach(btn => {//LE AGREGA A TODOS LOS BOTONES EL EVENTO 
            btn.addEventListener('click', (e) => {//CUANDO SE PRESIONA EL BOTON
                botonActivo = e.currentTarget;
                cargarPreguntasModal(botonActivo.dataset.id_materia, botonActivo.dataset.id_personal, botonActivo.dataset.id_nivel_ingles, botonActivo.dataset.id_arte_especialidad);
            });
        });

    } catch (error) {
        console.error('Error al iniciar la página:', error);
        // window.location.href = '/';
    }
});


async function cargarProfesores() {
    try {
        const res = await fetch('/getDocentes', { credentials: 'include' }); //OBTENER LOS PROFESORES CON LA API
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los profesores');
        let estadoEvaluacion = '';
        let nombreProfesor = '';
        let cardProfesor = '';

        // PROFESORES DE MATERIAS "NORMALES"
        data.profesores.forEach(profesor => {
            switch (profesor.estado_evaluacion_materia) { //SEFUN EL ESTADO DE EVALUACION SE PONE UNA OPCION DIFERENTE 
                case 0:
                        estadoEvaluacion = `<button class="btn btn-success rounded-pill px-4 shadow evaluar-btn" id="btnEvaluar-${profesor.id_personal}" data-id_materia="${profesor.id_materia}" data-id_personal="${profesor.id_personal}">Evaluar</button>`;
                    break;
                case 1:
                        estadoEvaluacion = `<p class="fw-bold text-uppercase text-success">Profesor evaluado correctamente</p>`;
                    break;            
                default:
                    break;
            }

            nombreProfesor = `${profesor.nombre_personal} ${profesor.apaterno_personal} ${profesor.amaterno_personal}`;

            cardProfesor = document.createElement('div'); // SE CREA UN ELEMENTO HTML QUE ALMACENARA EL CONTENIDO
            cardProfesor.className = 'col mb-3'; // SE LE AGREGAN LAS CLASES PRINCIPALES A EL ELEMENTO HTML Y ABAJO EL CONTENIDO QUE ALMACENARA
            cardProfesor.innerHTML = `  
                <div class="card h-100 shadow rounded-4 p-4">
                    <img src='./assets/img/${profesor.img_profesor}' class="card-img-top rounded-top-4" alt="Imagen del Profesor">
                    <div class="card-body text-center">
                        <h5 class="fw-bold text-uppercase bg-danger text-white rounded-pill py-2 px-3 d-inline-block shadow-lg">${nombreProfesor}</h5>
                        <p class="card-text mb-1"><strong>MATERIA:</strong> ${profesor.nombre_materia}</p>
                    </div>
                    <div class="card-footer bg-white border-0 text-center">
                        ${estadoEvaluacion}
                    </div>
                </div>
            `; 
            listaProfesores.appendChild(cardProfesor); // SE EL AGREGA EL ELEMENTO CREADO A EL ELEMENTO HTML ORIGINAL EL EL .html
        });

        // PROFESOR DE INGLES
        const ingles = data.ingles[0];
        switch (ingles.estado_evaluacion_nivel_ingles) { //SEFUN EL ESTADO DE EVALUACION SE PONE UNA OPCION DIFERENTE 
            case 0:
                    estadoEvaluacion = `<button class="btn btn-success rounded-pill px-4 shadow evaluar-btn" id="btnEvaluar-${ingles.id_personal}" data-id_materia="${ingles.id_materia}" data-id_personal="${ingles.id_personal}" data-id_nivel_ingles="${ingles.id_nivel_ingles}">Evaluar</button>`;
                break;
            case 1:
                    estadoEvaluacion = `<p class="fw-bold text-uppercase text-success">Profesor evaluado correctamente</p>`;
                break;            
            default:
                break;
        }

        nombreProfesor = `${ingles.nombre_personal} ${ingles.apaterno_personal} ${ingles.amaterno_personal}`;

        cardProfesor = document.createElement('div'); // SE CREA UN ELEMENTO HTML QUE ALMACENARA EL CONTENIDO
        cardProfesor.className = 'col mb-3'; // SE LE AGREGAN LAS CLASES PRINCIPALES A EL ELEMENTO HTML Y ABAJO EL CONTENIDO QUE ALMACENARA
        cardProfesor.innerHTML = `  
            <div class="card h-100 shadow rounded-4 p-4">
                <img src='./assets/img/${ingles.img_profesor}' class="card-img-top rounded-top-4" alt="Imagen del Profesor">
                <div class="card-body text-center">
                    <h5 class="fw-bold text-uppercase bg-danger text-white rounded-pill py-2 px-3 d-inline-block shadow-lg">${nombreProfesor}</h5>
                    <p class="card-text mb-1"><strong>MATERIA:</strong> ${ingles.nombre_materia} / ${ingles.nombre_nivel_ingles}</p>
                </div>
                <div class="card-footer bg-white border-0 text-center">
                    ${estadoEvaluacion}
                </div>
            </div>
        `; 
        listaProfesores.appendChild(cardProfesor); // SE EL AGREGA EL ELEMENTO CREADO A EL ELEMENTO HTML ORIGINAL EL EL .html

        // PROFESOR DE ARTE
        const arte = data.arte[0];
        switch (arte.estado_evaluacion_arte_especialidad) { //SEFUN EL ESTADO DE EVALUACION SE PONE UNA OPCION DIFERENTE 
            case 0:
                    estadoEvaluacion = `<button class="btn btn-success rounded-pill px-4 shadow evaluar-btn" id="btnEvaluar-${arte.id_personal}" data-id_materia="${arte.id_materia}" data-id_personal="${arte.id_personal}" data-id_arte_especialidad="${arte.id_arte_especialidad}">Evaluar</button>`;
                break;
            case 1:
                    estadoEvaluacion = `<p class="fw-bold text-uppercase text-success">Profesor evaluado correctamente</p>`;
                break;            
            default:
                break;
        }

        nombreProfesor = `${arte.nombre_personal} ${arte.apaterno_personal} ${arte.amaterno_personal}`;

        cardProfesor = document.createElement('div'); // SE CREA UN ELEMENTO HTML QUE ALMACENARA EL CONTENIDO
        cardProfesor.className = 'col mb-3'; // SE LE AGREGAN LAS CLASES PRINCIPALES A EL ELEMENTO HTML Y ABAJO EL CONTENIDO QUE ALMACENARA
        cardProfesor.innerHTML = `  
            <div class="card h-100 shadow rounded-4 p-4">
                <img src='./assets/img/${arte.img_profesor}' class="card-img-top rounded-top-4" alt="Imagen del Profesor">
                <div class="card-body text-center">
                    <h5 class="fw-bold text-uppercase bg-danger text-white rounded-pill py-2 px-3 d-inline-block shadow-lg">${nombreProfesor}</h5>
                    <p class="card-text mb-1"><strong>MATERIA:</strong> ${arte.nombre_materia} / ${arte.nombre_arte_especialidad}</p>
                </div>
                <div class="card-footer bg-white border-0 text-center">
                    ${estadoEvaluacion}
                </div>
            </div>
        `; 
        listaProfesores.appendChild(cardProfesor); // SE EL AGREGA EL ELEMENTO CREADO A EL ELEMENTO HTML ORIGINAL EL EL .html

        const cards = listaProfesores.querySelectorAll('.col');
        if (cards.length % 2 !== 0) {//EN CASO DE QUE EL NUMERO DE CARDS SEA IMPAR EL ULTIMO SE CENTRARA
            const ultimaCard = cards[cards.length - 1];
            ultimaCard.className = 'mx-auto mb-3'; // SE LE CAMBIA LA CLASE PARA QUE SE CENTRE 
        }
    } catch (error) {
        console.error('Error al cargar profesores:', error);
    }
}


async function cargarPreguntasModal(id_materia, id_personal, id_nivel_ingles, id_arte_especialidad) {
    try {
        const res = await fetch(`/getPreguntasDocente`, { credentials: 'include' }); //OBTENER LAS PREGUNTAS DE LA API
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener las preguntas');

        let paginaActual = 1;
        const totalPreguntas = data.cantidadPreguntas; // OBTENER CANTIDAD DE PREGUNTAS
        const totalPaginas = Math.ceil(totalPreguntas / 3); // DIVIDIR CANTIDAD DE PREGUNTAS Y REDONDEAR A EL ENTERO MAYOR PARA SABER CANTIDAD DE PAGINAS A USAR EN PREGUNTAS
        let totalPaginasR = totalPreguntas % 3 == 0 || totalPreguntas % 3 == 2 ? totalPaginas + 1: totalPaginas; // SABER SI SE VA A REQUERIR UNA PAGINA EXTRA PARA COMENTARIOS
        let preguntaActual = 0; // SE USARA PARA PODER IR ACCEDIENDO A LA PREGUNTA QUE SE DESEA EN EL ARRAY


        // HEADER - MODAL
        const tituloModal = 'DOCENTE';// AGREGAR TITULO 
        modalEvaluacionHeader.innerHTML =  `
            <h5 class="modal-title fw-bold">${tituloModal}</h5>
            </button>
        `;

        modalEvaluacionBody.innerHTML = ''; // VACIAR EL MODAL EVALUACION PARA QUE NO TENGA CONTENIDO DE ALGUN OTRO MODAL QUE SE CARGO ANTERIORMENTE 

        // BODY MODAL
        // CREAR TODAS LAS PAGINAS DE EL MODAL
        for (let i = 1; i <= totalPaginas; i++) {
            // CREAR EL ELEMENTO DE CADA PAGINA
            const paginaModalBody = document.createElement('div');
            paginaModalBody.id = `pagina-${tituloModal}-${i}`; // PARA PODER HACER EL CAMBIO DE PAGINA
            
            let preguntasPorPagina = 0; //  SE REINICIA EL CONTADOR EN CADA PAGINA
            // AGREGAR PREGUNTAS A CADA PAGINA
            while (preguntaActual < totalPreguntas && preguntasPorPagina<3) {
                // HACER CADA CARD DE CADA PREGUNTA CON SU INFO
                const cardPregunta = document.createElement('div'); // CREAR CARD DE CADA PREGUNTA
                cardPregunta.className = 'mb-3 p-3 rounded-4';
                cardPregunta.style.background = '#eF2d3b';

                const tituloPregunta = document.createElement('p'); // CREAR ELEMENTO PARA EL TITULO DE AL PREGUNTA 
                tituloPregunta.className = 'fw-bold text-center';
                tituloPregunta.innerText = data.preguntas[preguntaActual].nombre_pregunta;
                
                const respuestasPregunta = document.createElement('div'); // CREAR ELEMENTO DIV QUE ALMACENARA LOS DIV QUE ALMACENAN CADA INPUT
                respuestasPregunta.className = 'd-flex justify-content-center';
                data.respuestas.forEach(respuesta =>{
                    if(respuesta.id_pregunta==data.preguntas[preguntaActual].id_pregunta){
                        const posibleRespuesta = document.createElement('div'); // CREAR DIV QUE ALACENARA EL INPUT
                        posibleRespuesta.className = 'form-check form-check-inline';
                        posibleRespuesta.innerHTML = ` 
                            <input class="form-check-input" type="radio" name="p-${preguntaActual+1}" value="${respuesta.id_respuesta}" data-id_pregunta="${respuesta.id_pregunta}"> ${respuesta.nombre_respuesta}
                        `; // AGREGAR EL INPUT AL DIV / ES +1 PARA QUE EL NUMERO DE PREGUNTA VAYA INICIANDO EN 1 Y ASI SE SIGA EN LUAGAR DE 0 COMO EN EL ARREGLO / ES NAME PORQUE ESE NAME SE DEBE DE PODER REPETIR DEPENDIENDO DE LA CANTIDAD DE POSIBLES RESPUESTAS
                        respuestasPregunta.appendChild(posibleRespuesta); // AGREGAR EL DIV CON EL INOUT DENTRO A EL DIV DE ARRIBA QUE ALMACENA ESTOS DIV
                    }
                });

                cardPregunta.appendChild(tituloPregunta); // AGREGAR TITULO DE LA PREGUNTA A EL CARD DE PREGUNTA
                cardPregunta.appendChild(respuestasPregunta); // AGREGAR POSIBLES RESPUESTAS A EL CARD DE PREGUNTA
                paginaModalBody.appendChild(cardPregunta);// AGREGAR EL CARD A LA PAGINA
                preguntaActual ++;// SUMAR 1 A LA VARIABLE
                preguntasPorPagina ++;
            } 
            modalEvaluacionBody.appendChild(paginaModalBody);// AGREGAR LA PAGINA A EL BODY 
        }

        // COMENTARIOS 
        if (totalPreguntas % 3 == 0 || totalPreguntas % 3 == 2){ // ES 0 PORQUE ESO QUIERE DECIR QUE EL TOTAL DE PREGUNTAS ES MULTIPLO DE 3 PUES NO HAY RESIDUO  Y QUE LA ULTIMA PAGINA ESTA OCUPADA POR 3 PREGUNTAS
            // SE CREA UNA PAGINA EXTRA PARA PODER PONER EL ESPACIO PARA COMENTARIOS
            const paginaModalBody = document.createElement('div');
            paginaModalBody.id = `pagina-${tituloModal}-${totalPaginas+1}`; // ES MAS 1 PUES LAS ANTERIORES ESTARAN OCUPADAS CON PREGUTAS
            paginaModalBody.className = 'text-center';// CENTRAR CONTENIDO
            paginaModalBody.innerHTML = `
                <h5 class="fw-bold">COMENTARIOS</h5>
                <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                    <p class="fw-bold">¿TIENES COMENTARIOS POSITIVOS?</p>
                    <div class="d-flex justify-content-center">
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="1"> SI
                        </div>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="0"> NO
                        </div>
                    </div>
                </div>
                <textarea class="form-control mb-3 d-none" placeholder="Aspectos a positivos en ${tituloModal.toLowerCase()}: ..." id="comentarioDocentePositivo"></textarea>
                <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                    <p class="fw-bold">¿TIENES COMENTARIOS NEGATIVOS?</p>
                    <div class="d-flex justify-content-center">
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="1"> SI
                        </div>
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="0"> NO
                        </div>
                    </div>
                </div>
                <textarea class="form-control mb-3 d-none" placeholder="Aspectos a negativos en ${tituloModal.toLowerCase()}: ..." id="comentarioDocenteNegativo"></textarea>
                <button id="btnTerminarEvaluacion" class="btn btn-danger fw-bold">Terminar Evaluación</button>
            `; // AGREGAR CARDS PARA PREGUNTAR SI DESEA DEJAR COMENTARIOS
            modalEvaluacionBody.appendChild(paginaModalBody);
        }else if (totalPreguntas % 3 == 1 ){
            // SE MANTIENE EN LA ULTIMAPAGINA CREADA PUES AUN HAY ESPACIO (ESTO SOLO SI EL RESIDUO ES 1 PUES QUIERE DECIR QUE HAY SOLO UNA PREGUNTA EN LA ULTIMA PAGINA)
            const ultimaPagina = document.getElementById(`pagina-${tituloModal}-${totalPaginas}`); // OBTENER LA ULTIMA PAGINA CREADA
            // CREAR ELEMENTOS DE LOS COMENTARIOS Y BOTON
            ultimaPagina.classList = 'text-center' // PODER CENTRAR EL CONTENIDO
            const tituloComentario = document.createElement('h5'); // TITULO DE APARTADO
            tituloComentario.className = 'fw-bold';
            tituloComentario.innerText = 'COMENTARIOS';
            const preguntaComentarioPositivo = document.createElement('div'); // CARD PARA PREGUNATAR SI TIENE COMENTARIO POSITIVO
            preguntaComentarioPositivo.className = 'mb-3 p-3 rounded-4';
            preguntaComentarioPositivo.style.background = '#eF2d3b';
            preguntaComentarioPositivo.innerHTML = `
                <p class="fw-bold">¿TIENES COMENTARIOS NEGATIVOS?</p>
                <div class="d-flex justify-content-center">
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="1"> SI
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="0"> NO
                    </div>
                </div>
            `;
            const preguntaComentarioNegativo = document.createElement('div'); // CARD PARA PREGUNATAR SI TIENE COMENTARIO NEGATIVO
            preguntaComentarioNegativo.className = 'mb-3 p-3 rounded-4';
            preguntaComentarioNegativo.style.background = '#eF2d3b';
            preguntaComentarioNegativo.innerHTML = `
                <p class="fw-bold">¿TIENES COMENTARIOS NEGATIVOS?</p>
                <div class="d-flex justify-content-center">
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="1"> SI
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="0"> NO
                    </div>
                </div>
            `;
            const contenidoComentarioPositivo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO POSITIVO
            contenidoComentarioPositivo.className = 'form-control mb-3 d-none';
            contenidoComentarioPositivo.id = 'comentarioDocentePositivo';
            contenidoComentarioPositivo.placeholder = `Aspectos a positivos en ${tituloModal.toLowerCase()}: ...`;
            const contenidoComentarioNegativo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO NEGATIVO
            contenidoComentarioNegativo.className = 'form-control mb-3 d-none';
            contenidoComentarioNegativo.id = 'comentarioDocenteNegativo';
            contenidoComentarioNegativo.placeholder = `Aspectos a negativos en ${tituloModal.toLowerCase()}: ...`;
            const botonTerminarEvaluacion = document.createElement('button');
            botonTerminarEvaluacion.id = 'btnTerminarEvaluacion';
            botonTerminarEvaluacion.className = 'btn btn-danger fw-bold';
            botonTerminarEvaluacion.innerText  = 'Terminar Evaluación';

            //AGREGAR ELEMENTOS A LA ULTIMA PAGINA
            ultimaPagina.appendChild(tituloComentario);
            ultimaPagina.appendChild(preguntaComentarioPositivo);
            ultimaPagina.appendChild(contenidoComentarioPositivo);
            ultimaPagina.appendChild(preguntaComentarioNegativo);
            ultimaPagina.appendChild(contenidoComentarioNegativo);
            ultimaPagina.appendChild(botonTerminarEvaluacion);
        }

        let comentarioPositivoSeleccionValor = null; // SE DECLARAN ANTES PARA PODER USARLAS COMO CONDICION AL TERMINAR EVALUACION
        let comentarioNegativoSeleccionValor = null;

        const respuestasComentarioPositivo = document.querySelectorAll(`input[name="p-comentarioPositivo"]`);// SABER SI QUIERE DEJAR COMENTARIO POSITIVO
        respuestasComentarioPositivo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
            input.addEventListener('change', () => {
                const comentarioPositivoSeleccion = document.querySelector('input[name="p-comentarioPositivo"]:checked');
                comentarioPositivoSeleccionValor = comentarioPositivoSeleccion.value;

                const comentarioDocentePositivo = document.getElementById('comentarioDocentePositivo');
                // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                if (comentarioPositivoSeleccionValor === "1") {
                    comentarioDocentePositivo.classList.remove('d-none');
                }else{
                    comentarioDocentePositivo.classList.add('d-none');
                }
            });
        });

        const respuestasComentarioNegativo = document.querySelectorAll(`input[name="p-comentarioNegativo"]`);//  SABER SI QUIERE DEJAR COMENTARIO NEGATIVO
        respuestasComentarioNegativo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
            input.addEventListener('change', () => {
                const comentarioNegativoSeleccion = document.querySelector('input[name="p-comentarioNegativo"]:checked');
                comentarioNegativoSeleccionValor = comentarioNegativoSeleccion.value;

                const comentarioDocenteNegativo = document.getElementById('comentarioDocenteNegativo');
                // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                if (comentarioNegativoSeleccionValor === "1") {
                    comentarioDocenteNegativo.classList.remove('d-none');
                }else{
                    comentarioDocenteNegativo.classList.add('d-none');
                }
            });
        });


        //FUNCION PARA MOSTRAR LA PAGINA DEPENDIENDO DE EN CUAL SE ENCUENTRE ANTERIORMENTE
        function mostrarPagina(tituloModal,pagina) {
            for (let i = 1; i <= totalPaginasR; i++) {
                const paginaModal = document.getElementById( 'pagina-' + tituloModal + '-' + i)
                if (paginaModal) {
                    paginaModal.classList.add('d-none'); //QUITAR TODAS LAS PAGINAS AL INICIO
                }
            }

            const paginaModalActual = document.getElementById( 'pagina-' + tituloModal + '-' + pagina);
            if (paginaModalActual) {
                paginaModalActual.classList.remove('d-none');//QUITAR EL D-NONE A LA PAGINA QUE ESTA
            }
            

            if(btnAtras != null){
                btnAtras.style.display = (pagina === 1) ? 'none' : 'inline-block';
            }
            if(btnSiguiente){
                btnSiguiente.style.display = (pagina === totalPaginasR) ? 'none' : 'inline-block';
            }
        }

        //BOTON DE SIGUIENTE
        btnSiguiente.addEventListener('click', () => {
            if (paginaActual < totalPaginasR) {
                paginaActual++;
                mostrarPagina(tituloModal,paginaActual);
            }
        });

        //BOTON DE ATRAS
        btnAtras.addEventListener('click', () => {
            if (paginaActual > 1) {
                paginaActual--;
                mostrarPagina(tituloModal,paginaActual);
            }
        });

        const btnTerminarEvaluacion = document.getElementById('btnTerminarEvaluacion'); // BOTON DE TERMINAR EVALUACION
        // FUNCIION BOTON DE TERMINAR EVALUACION  
        btnTerminarEvaluacion.addEventListener('click', async ()=>{
            const respuestasAlumno = []; // PARA ALMACENAR LAS RESPUESTAS QUE EL ALUMNO DIO 
            const comentariosAlumno = []; // PARA ALMACENAR LOS COMENTARIOS QUE EL ALUMNO DIO 
            for (let i = 1; i <= totalPreguntas; i++) {
                const respuestaSeleccionada = document.querySelector(`input[name="p-${i}"]:checked`); // SELECCIONA EL INPUT QUE ESTE SELLECIONADO DE CADA PREGUNTA
                const valorRespuesta = respuestaSeleccionada ? respuestaSeleccionada.value : null; // SI NO SE SELECCIONO AUN ES NULL
                if (valorRespuesta != null){
                    respuestasAlumno.push({
                        'id_pregunta': respuestaSeleccionada.dataset.id_pregunta,
                        'id_respuesta': valorRespuesta
                    });
                }
            }

            // ALERTA EN CASO DE QUE UNA PREGUNTA ESTE SIN CONTESTAR 
            if(respuestasAlumno.length < totalPreguntas || comentarioPositivoSeleccionValor === null || comentarioNegativoSeleccionValor === null){
                await Swal.fire({
                    icon: 'error',
                    title: 'Todas las preguntas deben de ser contestadas'
                });
                return;
            }

            if (comentarioPositivoSeleccionValor == 1 && comentarioDocentePositivo.value == ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                await Swal.fire({
                    icon: 'error',
                    title: 'El apartado para comentar esta vacio'
                });
                return;
            }

            if (comentarioNegativoSeleccionValor == 1 && comentarioDocenteNegativo.value == ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                await Swal.fire({
                    icon: 'error',
                    title: 'El apartado para comentar esta vacio'
                });
                return;
            }

            //HACER LOGICA PARA QUE SEA DOCENTE_INGLES EN COMENTARIO Y CON ARTE 
            if (id_nivel_ingles != null) {
                // SE CAMBIA EL NOMBRE A comentario_docente_ingles 
                // EN CASO DE QUE SE ELIJA METER COMENTARIOS METERLOS A EL ARRAY comentariosAlumno 
                if (comentarioPositivoSeleccionValor == 1 && comentarioDocentePositivo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 1,
                        'comentario_docente_ingles': comentarioDocentePositivo.value 
                    });
                }

                if (comentarioNegativoSeleccionValor == 1 && comentarioDocenteNegativo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 0,
                        'comentario_docente_ingles': comentarioDocenteNegativo.value 
                    });
                }
            } else if (id_arte_especialidad != null) {
                // SE CAMBIA EL NOMBRE A comentario_docente_arte 
                // EN CASO DE QUE SE ELIJA METER COMENTARIOS METERLOS A EL ARRAY comentariosAlumno 
                if (comentarioPositivoSeleccionValor == 1 && comentarioDocentePositivo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 1,
                        'comentario_docente_arte': comentarioDocentePositivo.value 
                    });
                }

                if (comentarioNegativoSeleccionValor == 1 && comentarioDocenteNegativo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 0,
                        'comentario_docente_arte': comentarioDocenteNegativo.value 
                    });
                }
            } else {
                // SI ES MATERIA NORMAL
                // EN CASO DE QUE SE ELIJA METER COMENTARIOS METERLOS A EL ARRAY comentariosAlumno 
                if (comentarioPositivoSeleccionValor == 1 && comentarioDocentePositivo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 1,
                        'comentario_docente': comentarioDocentePositivo.value 
                    });
                }

                if (comentarioNegativoSeleccionValor == 1 && comentarioDocenteNegativo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 0,
                        'comentario_docente': comentarioDocenteNegativo.value 
                    });
                }
            }
            console.log('respuestas',respuestasAlumno);
            console.log('comentarios',comentariosAlumno);
            console.log('idmateria',id_materia);
            console.log('idpersonal',id_personal);
            console.log('idingles',id_nivel_ingles);
            console.log('idarte',id_arte_especialidad);

            const resulado = await guardarRespuestasDocente(id_materia,id_personal,id_nivel_ingles,id_arte_especialidad,respuestasAlumno,comentariosAlumno);
            if(resulado.success){
                await Swal.fire({
                    icon: 'success',
                    title: resulado.message,
                    text: resulado.message,
                    timer: 1500,
                    showConfirmButton: false
                });
                window.location.reload(); // CHECAR CUANDO LOS COMENTARIOS ESTAN VACIONS DEBIDO AL NO
            }else{
                await Swal.fire({
                    icon: 'error',
                    title: resulado.message,
                    text: resulado.message,
                });
            }
        });

        mostrarPagina(tituloModal,1);//PARA MOSTRAR LA PRIMER PAGINA Y QUE NO SE MUESTRE LA PAGINA ACTUAL PUES ESTA SE PUEDE QUEDAR GUARDADA COMO 4 AL REALIZAR OTRA EVALUACION ANTES
        modalEvaluacion.show();
    } catch (error) {
        console.error('Error al modal:', error);
    }
}

async function guardarRespuestasDocente (id_materia,id_personal,id_nivel_ingles,id_arte_especialidad,respuestas,comentarios){
    try {
        const csrfRes = await fetch('/csrf-token', {
            credentials: 'include'
            });
        const { csrfToken } = await csrfRes.json();

        const res = await fetch('/postRespuestasDocente', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                id_materia,
                id_personal,
                id_nivel_ingles,
                id_arte_especialidad,
                respuestas,
                comentarios
            })
        });
        const data = await res.json();
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

