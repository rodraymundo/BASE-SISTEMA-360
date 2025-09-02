let botonActivo = null;//SABER QUE BOTON "EVALUAR" FUE EL QUE SE PRESIONO

const listaServicios = document.getElementById('listaServicios'); // DIV QUE ALMACENARA LAS CARD DE SERVICIOS 
const modalEvaluacion = new bootstrap.Modal(document.getElementById('modalEvaluacion')); // MODAL
const modalEvaluacionHeader = document.getElementById('modalEvaluacionHeader'); // HEADER DEL MODAL
const modalEvaluacionBody = document.getElementById('modalEvaluacionBody'); // BODY DEL MODAL
const modalEvaluacionFooter = document.getElementById('modalEvaluacionFooter');
const btnAtras = document.getElementById('btnAtras'); // BOTON DE ATRAS
const btnSiguiente = document.getElementById('btnSiguiente'); // BOTON DE SIGUIENTE


document.addEventListener('DOMContentLoaded', async () => {
    try {
        // CARGAR LOS SERVICIOS
        await cargarServicios();
        document.querySelectorAll('.evaluar-btn').forEach(btn => {//LE AGREGA A TODOS LOS BOTONES EL EVENTO 
            btn.addEventListener('click', (e) => {//CUANDO SE PRESIONA EL BOTON
                botonActivo = e.currentTarget;
                cargarPreguntasModal(botonActivo.dataset.id_servicio, botonActivo.dataset.nombre_servicio);
            });
        });
        document.querySelectorAll('.noUtilizado-btn').forEach(btn  => {//LE AGREGA A TODOS LOS BOTONES EL EVENTO 
            btn.addEventListener('click', async (e) => {//CUANDO SE PRESIONA EL BOTON
                botonActivo = e.currentTarget;
                const resulado = await guardarRespuestasServicio(botonActivo.dataset.id_servicio);
                if(resulado.success){
                    await Swal.fire({
                        icon: 'success',
                        title: resulado.message,
                        timer: 1500,
                        showConfirmButton: false
                    });
                    window.location.reload();
                }else{
                    await Swal.fire({
                        icon: 'error',
                        title: resulado.message,
                        text: resulado.message,
                    });
                }
            });
        });


    } catch (error) {
        console.error('Error al iniciar la página:', error);
        // window.location.href = '/';
    }
});


async function cargarServicios() {
    try {
        const res = await fetch('/getServicios', { credentials: 'include' }); //OBTENER LOS SERVICIOS CON LA API
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los servicios');

        data.servicios.forEach(servicio => {
            let estadoEvaluacion = '';
            switch (servicio.estado_evaluacion_servicio) { //SEFUN EL ESTADO DE EVALUACION SE PONE UNA OPCION DIFERENTE 
                case 0:
                        estadoEvaluacion = `
                            <button class="btn btn-success rounded-pill px-4 shadow evaluar-btn"  data-id_servicio="${servicio.id_servicio}" data-nombre_servicio="${servicio.nombre_servicio}">Evaluar</button>
                            <button class="btn btn-danger rounded-pill px-4 shadow noUtilizado-btn"  data-id_servicio="${servicio.id_servicio}">No lo utilice</button>
                        `;
                    break;
                case 1:
                        estadoEvaluacion = `<p class="fw-bold text-uppercase text-success">Servicio evaluado correctamente</p>`;
                    break;
                case 2:
                        estadoEvaluacion = `<p class="fw-bold text-uppercase text-warning ">Servicio no utilizado</p>`;
                    break;
            
                default:
                    break;
            }

            const cardServicio = document.createElement('div'); // SE CREA UN ELEMENTO HTML QUE ALMACENARA EL CONTENIDO
            cardServicio.className = 'col mb-3'; // SE LE AGREGAN LAS CLASES PRINCIPALES A EL ELEMENTO HTML Y ABAJO EL CONTENIDO QUE ALMACENARA
            cardServicio.innerHTML = `  
                <div class="card h-100 shadow rounded-4 p-4">
                    <img src='./assets/img/${servicio.img_servicio}' class="card-img-top rounded-top-4" alt="Imagen del Servicio">
                    <div class="card-body text-center">
                        <h5 class="fw-bold text-uppercase bg-danger text-white rounded-pill py-2 px-3 d-inline-block shadow-lg">${servicio.nombre_servicio}</h5>
                    </div>
                    <div class="card-footer bg-white border-0 text-center">
                        ${estadoEvaluacion}
                    </div>
                </div>
            `; 
            listaServicios.appendChild(cardServicio); // SE EL AGREGA EL ELEMENTO CREADO A EL ELEMENTO HTML ORIGINAL EL EL .html
        });

        
        const cards = listaServicios.querySelectorAll('.col');
        if (cards.length % 2 !== 0) {//EN CASO DE QUE EL NUMERO DE CARDS SEA IMPAR EL ULTIMO SE CENTRARA
            const ultimaCard = cards[cards.length - 1];
            ultimaCard.className = 'mx-auto mb-3'; // SE LE CAMBIA LA CLASE PARA QUE SE CENTRE 
        }
    } catch (error) {
        console.error('Error al cargar servicios:', error);
    }
}


async function cargarPreguntasModal(id_servicio, nombre_servicio) {
    try {
        const res = await fetch(`/getPreguntasServicio/${id_servicio}`, { credentials: 'include' }); //OBTENER LOS SERVICIOS DE LA API
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener las preguntas');

        let paginaActual = 1;
        const totalPreguntas = data.cantidadPreguntas; // OBTENER CANTIDAD DE PREGUNTAS
        const totalPaginas = Math.ceil(totalPreguntas / 3); // DIVIDIR CANTIDAD DE PREGUNTAS Y REDONDEAR A EL ENTERO MAYOR PARA SABER CANTIDAD DE PAGINAS A USAR EN PREGUNTAS
        let totalPaginasR = totalPreguntas % 3 == 0 || totalPreguntas % 3 == 2 ? totalPaginas + 1: totalPaginas; // SABER SI SE VA A REQUERIR UNA PAGINA EXTRA PARA COMENTARIOS
        let preguntaActual = 0; // SE USARA PARA PODER IR ACCEDIENDO A LA PREGUNTA QUE SE DESEA EN EL ARRAY
        let totalPaginasLoma = 0; // PARA EN CASO DE SER LA LOMA PODER SABER CUANTAS PAGINAS SON Y PODER USAR ESTA VARIABLE EN BOTON SIGUIENTE
        let comentarioPositivoSeleccionValor = null; // SE DECLARAN ANTES PARA PODER USARLAS COMO CONDICION AL TERMINAR EVALUACION
        let comentarioNegativoSeleccionValor = null;
        let totalPaginasLigas_Deportivas = 0 // PARA EN CASO DE SER LIGAS DEPORTIVAS PODER SABER CUANTAS PAGINAS SON Y PODER USAR ESTA VARIABLE EN BOTON SIGUIENTE

        // HEADER - MODAL
        const tituloModal = data.preguntas[0].nombre_servicio;// AGREGAR TITULO DEL MODAL/SERVICIO QUE SE ABRIO 
        modalEvaluacionHeader.innerHTML =  `
            <h5 class="modal-title fw-bold text-white">${tituloModal}</h5>
            </button>
        `;

        modalEvaluacionBody.innerHTML = ''; // VACIAR EL MODAL EVALUACION PARA QUE NO TENGA CONTENIDO DE ALGUN OTRO MODAL QUE SE CARGO ANTERIORMENTE 

        if (nombre_servicio !== 'LA LOMA' && nombre_servicio !== 'LIGAS DEPORTIVAS') { // EN CASO DE SER LOMA O LIGAS DEPORTIVAS NO SE HACE ESTO Y SE HACE LO SUYO ABAJO
            // BODY MODAL
            // CREAR TODAS LAS PAGINAS DE EL MODAL
            for (let i = 1; i <= totalPaginas; i++) { // ESTE TOTAL PAGINAS ES DE PURA PREGUNTA SIN CONTAR SI OCUPA OTRA PARA COMENTARIOS O NO
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
                    tituloPregunta.className = 'fw-bold text-center text-white';
                    tituloPregunta.innerText = data.preguntas[preguntaActual].nombre_pregunta;
                    
                    const respuestasPregunta = document.createElement('div'); // CREAR ELEMENTO DIV QUE ALMACENARA LOS DIV QUE ALMACENAN CADA INPUT
                    respuestasPregunta.className = 'd-flex justify-content-center';
                    data.respuestas.forEach(respuesta =>{
                        if(respuesta.id_pregunta==data.preguntas[preguntaActual].id_pregunta){
                            const posibleRespuesta = document.createElement('div'); // CREAR DIV QUE ALACENARA EL INPUT
                            posibleRespuesta.className = 'form-check form-check-inline text-white';
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

            // COMENTARIOS PARA SERVICIOS NORMALES
            if (totalPreguntas % 3 == 0 || totalPreguntas % 3 == 2 ){ // ES 0 PORQUE ESO QUIERE DECIR QUE EL TOTAL DE PREGUNTAS ES MULTIPLO DE 3 PUES NO HAY RESIDUO  Y QUE LA ULTIMA PAGINA ESTA OCUPADA POR 3 PREGUNTAS
                // SE CREA UNA PAGINA EXTRA PARA PODER PONER EL ESPACIO PARA COMENTARIOS
                const paginaModalBody = document.createElement('div');
                paginaModalBody.id = `pagina-${tituloModal}-${totalPaginas+1}`; // ES MAS 1 PUES LAS ANTERIORES ESTARAN OCUPADAS CON PREGUTAS
                paginaModalBody.className = 'text-center';// CENTRAR CONTENIDO
                paginaModalBody.innerHTML = `
                    <h5 class="fw-bold">COMENTARIOS</h5>
                    <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                        <p class="fw-bold text-white">¿TIENES COMENTARIOS DE ADMIRACION?</p>
                        <div class="d-flex justify-content-center">
                            <div class="form-check form-check-inline text-white">
                                <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="1"> SI
                            </div>
                            <div class="form-check form-check-inline text-white">
                                <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="0"> NO
                            </div>
                        </div>
                    </div>
                    <textarea class="form-control mb-3 d-none" placeholder="Aspectos admirables en ${tituloModal.toLowerCase()}: ..." id="comentarioServicioPositivo"></textarea>
                    <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                        <p class="fw-bold text-white">¿TIENES COMENTARIOS DE MEJORA?</p>
                        <div class="d-flex justify-content-center">
                            <div class="form-check form-check-inline text-white">
                                <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="1"> SI
                            </div>
                            <div class="form-check form-check-inline text-white">
                                <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="0"> NO
                            </div>
                        </div>
                    </div>
                    <textarea class="form-control mb-3 d-none" placeholder="Aspectos a mejorar en ${tituloModal.toLowerCase()}: ..." id="comentarioServicioNegativo"></textarea>
                    <button id="btnTerminarEvaluacion" class="btn btn-danger fw-bold">Terminar Evaluación</button>
                `; // AGREGAR CARDS PARA PREGUNTAR SI DESEA DEJAR COMENTARIOS
                modalEvaluacionBody.appendChild(paginaModalBody);
            }else if (totalPreguntas % 3 == 1){ // SE DEBE DE COMPRABAR QUE YA SE CREO LA ULTIMA PAGINA PARA EN CASO DE QUE SEA LA LOMA O OTRO DONDE PRIMERO SE ELIJE A QUIEN SE EVALUA
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
                    <p class="fw-bold text-white">¿TIENES COMENTARIOS DE ADMIRACION?</p>
                    <div class="d-flex justify-content-center">
                        <div class="form-check form-check-inline text-white">
                            <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="1"> SI
                        </div>
                        <div class="form-check form-check-inline text-white">
                            <input class="form-check-input" type="radio" name="p-comentarioPositivo" value="0"> NO
                        </div>
                    </div>
                `;
                const preguntaComentarioNegativo = document.createElement('div'); // CARD PARA PREGUNATAR SI TIENE COMENTARIO NEGATIVO
                preguntaComentarioNegativo.className = 'mb-3 p-3 rounded-4';
                preguntaComentarioNegativo.style.background = '#eF2d3b';
                preguntaComentarioNegativo.innerHTML = `
                    <p class="fw-bold text-white">¿TIENES COMENTARIOS DE MEJORA?</p>
                    <div class="d-flex justify-content-center">
                        <div class="form-check form-check-inline text-white">
                            <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="1"> SI
                        </div>
                        <div class="form-check form-check-inline text-white">
                            <input class="form-check-input" type="radio" name="p-comentarioNegativo" value="0"> NO
                        </div>
                    </div>
                `;
                const contenidoComentarioPositivo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO POSITIVO
                contenidoComentarioPositivo.className = 'form-control mb-3 d-none';
                contenidoComentarioPositivo.id = 'comentarioServicioPositivo';
                contenidoComentarioPositivo.placeholder = `Aspectos admirables en ${tituloModal.toLowerCase()}: ...`;
                const contenidoComentarioNegativo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO NEGATIVO
                contenidoComentarioNegativo.className = 'form-control mb-3 d-none';
                contenidoComentarioNegativo.id = 'comentarioServicioNegativo';
                contenidoComentarioNegativo.placeholder = `Aspectos a mejorar en ${tituloModal.toLowerCase()}: ...`;
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

            const respuestasComentarioPositivo = document.querySelectorAll(`input[name="p-comentarioPositivo"]`);// SABER SI QUIERE DEJAR COMENTARIO POSITIVO
            respuestasComentarioPositivo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
                input.addEventListener('change', () => {
                    const comentarioPositivoSeleccion = document.querySelector('input[name="p-comentarioPositivo"]:checked');
                    comentarioPositivoSeleccionValor = comentarioPositivoSeleccion.value;

                    const comentarioServicioPositivo = document.getElementById('comentarioServicioPositivo');
                    // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                    if (comentarioPositivoSeleccionValor === "1") {
                        comentarioServicioPositivo.classList.remove('d-none');
                    }else{
                        comentarioServicioPositivo.classList.add('d-none');
                    }
                });
            });

            const respuestasComentarioNegativo = document.querySelectorAll(`input[name="p-comentarioNegativo"]`);//  SABER SI QUIERE DEJAR COMENTARIO NEGATIVO
            respuestasComentarioNegativo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
                input.addEventListener('change', () => {
                    const comentarioNegativoSeleccion = document.querySelector('input[name="p-comentarioNegativo"]:checked');
                    comentarioNegativoSeleccionValor = comentarioNegativoSeleccion.value;

                    const comentarioServicioNegativo = document.getElementById('comentarioServicioNegativo');
                    // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                    if (comentarioNegativoSeleccionValor === "1") {
                        comentarioServicioNegativo.classList.remove('d-none');
                    }else{
                        comentarioServicioNegativo.classList.add('d-none');
                    }
                });
            });
        }

        // OPCION DE SELECCIONAR PSICOLOGO EN CASO DE SER ESTE SERVICIO
        if (nombre_servicio == 'PSICOPEDAGÓGICO') {
            try {
                const res = await fetch(`/getPsicologos`, { credentials: 'include' }); //OBTENER LOS PSICOLOGOS DE LA API
                const data = await res.json();
                if (!data.success) throw new Error('No se pudieron obtener los psicologos');

                const primeraPagina = document.getElementById(`pagina-${tituloModal}-1`) //OBTENER LA PRIMER PAGINA DE EL MODAL
                const selectPsicologo = document.createElement('div'); // CREAR EL SELECT
                    selectPsicologo.className = 'container text-center';
                    selectPsicologo.innerHTML = `
                        <div class="mb-4">
                            <label for="psicologoSelect" class="form-label fw-bold">SELECCIONA UN PSICÓLOGO</label>
                            <select class="form-select" id="psicologoSelect">
                                <option value=0 selected disabled>Selecciona una opción</option>
                            </select>
                        </div>
                    `;
                primeraPagina.insertBefore(selectPsicologo, primeraPagina.firstChild); // AGREGAR EL ELEMENTO ASNTES DE EL PRIMER ELEMENTO QUE TIENE COMO CHILD LA PAGINA 
                
                const optionsPiscologos = document.getElementById('psicologoSelect'); // PARA PODER AGREGAR TODAS LAS OPCIONES DE PSICOLOGO
                data.psicologos.forEach(psicologo =>{
                    const nombrePsicologo = `${psicologo.nombre_personal} ${psicologo.apaterno_personal} ${psicologo.amaterno_personal}`;
                    const posiblePsicologo = document.createElement('option');
                    posiblePsicologo.value = psicologo.id_personal;
                    posiblePsicologo.innerText = nombrePsicologo;
                    optionsPiscologos.appendChild(posiblePsicologo); // AGREGAR EL PSICOLOGO A LAS OPCIONES
                });
            } catch (error) {
                console.error('Error en psicologos:', error);
            }
        }

        // OPCION DE SELECCIONAR LA DISCIPLINA DEPORTIVA EN CASO DE SER LA LOMA
        if (nombre_servicio == 'LA LOMA') {
            try {
                const res = await fetch(`/getDisciplinasDeportivas`, { credentials: 'include' }); //OBTENER LAS DISCIPLINAS DEPORTIVAS DE LA API
                const data = await res.json();
                const res2 = await fetch(`/getPreguntasServicio/${id_servicio}`, { credentials: 'include' }); //OBTENER LOS SERVICIOS DE LA API
                const data2 = await res2.json();
                if (!data.success) throw new Error('No se pudieron obtener las disciplinas deportivas');

                modalEvaluacionBody.innerHTML = ``;

                const selectDisciplinaDeportiva = document.createElement('div'); // CREAR EL CONTENEDOR DEL DROPDOWN
                selectDisciplinaDeportiva.className = 'container text-center';
                selectDisciplinaDeportiva.id = `pagina-LA LOMA-1`;  // PORQUE SERA LA PRIMER PAGINA
                selectDisciplinaDeportiva.innerHTML = `
                    <div class="mb-4">
                        <label class="form-label fw-bold">SELECCIONA UNA O VARIAS DISCIPLINAS</label>
                        <div class="dropdown">
                            <button class="btn btn-outline-danger dropdown-toggle w-100" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="dropdownDisciplinasBtn">
                                Selecciona una o varias disciplinas
                            </button>
                            <ul class="dropdown-menu p-2 w-100" id="dropdownDisciplinasList" style="max-height: 250px; overflow-y: auto;"></ul>
                        </div>
                    </div>
                `;
                modalEvaluacionBody.appendChild(selectDisciplinaDeportiva) // AGREGAR EL ELEMENTO ASNTES DE EL PRIMER ELEMENTO QUE TIENE COMO CHILD LA PAGINA

                const listContainer = document.getElementById('dropdownDisciplinasList'); // CONTENEDOR DEL DROPDOWN
                const btn = document.getElementById('dropdownDisciplinasBtn'); // BOTON DEL DROPDOWN
                // console.log(data.disciplinasDeportivas);
                data.disciplinasDeportivas.forEach((disciplina) => {// AGREGAR OPCIONES DE DISCIPLINAS
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div class="form-check">
                        <input class="form-check-input" type="checkbox" value="${disciplina.id_disciplina_deportiva}" id="disciplina-${disciplina.id_disciplina_deportiva}" data-nombre_disciplina_deportiva="${disciplina.nombre_disciplina_deportiva}">
                        <label class="form-check-label" for="disciplina-${disciplina.id_disciplina_deportiva}">
                            ${disciplina.nombre_disciplina_deportiva}
                        </label>
                        </div>
                    `;
                    listContainer.appendChild(li);
                });
                const checkboxes = listContainer.querySelectorAll('input[type="checkbox"]'); // PARA ACTUALIZAR EL TEXTO DEL BOTÓN AL SELECCIONAR OPCIONES
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', () => {
                        const selected = [...checkboxes].filter(c => c.checked).map(c => ({nombre_disciplina_deportiva: c.dataset.nombre_disciplina_deportiva,id_disciplina_deportiva: c.value}));// CONVIERTE LA NODELIST EN UN ARRAY REAL .FILTER(C => C.CHECKED) // SE QUEDA SOLO CON LOS CHECKBOXES SELECCIONADOS .MAP(C => C.VALUE); OBTIENE EL VALOR QUE SE DESEA SACAR DE CADA ELEMENTO
                        if (selected.length === 0) {
                            btn.textContent = 'Selecciona una o varias disciplinas';
                        } else if (selected.length <= 3) {
                            btn.textContent = selected.map(item => item.nombre_disciplina_deportiva).join(', '); // .join JUNTA LOS VALORES DEL ARREGLO SEPRANDOLOS POR ", "
                        } else {
                            const primerosTres = selected.slice(0, 3).map(item => item.nombre_disciplina_deportiva).join(', '); // .slice TOMA LOS PRIMEROS 3 ELEMENTOS DEL ARRAY
                            btn.textContent = `${primerosTres} +${selected.length - 3} MÁS`;
                        }
                        // console.log("paginas totales",totalPaginasR*selected.length + 1);
                        // console.log('legthSelect',selected.length);
                        // console.log('paginasR',totalPaginasR);
                        // console.log('totalLoma',totalPaginasLoma);
                        // console.log('selected',selected);

                        for (let i = 0; i < totalPaginasLoma; i++) { // BORRAR PAGINAS ANTERIORES PARA VOLVER A CREAR LAS NUEVAS
                            const paginaBorrar = document.getElementById(`pagina-${tituloModal}-${i+2}`); // MAS 2 PORQUE  COMO INICIA EN 0 EL ARREGLO / SE DEBE DE SUMAR PARA NO CONTAR LA PAGINA 1 TAMBIEN 
                            if (paginaBorrar !== null) {
                                paginaBorrar.remove();
                            }
                        }

                        totalPaginasLoma = totalPaginasR*selected.length + 1; // EL MAS 1 ES PORQUE ESA ES LA PAGINA QUE SE USA PARA QUE ELIJAN DISCIPLINAS
                        let paginaActual = 1; //  SE REINICIA EL CONTADOR EN CADA PAGINA A 1 QUE ES LA PAGINA QUE SIEMPRE ESTARA PUES ES DONDE SE ELIJEN LAS DISCIPLINAS
                        // console.log('totalLomaDespues', totalPaginasLoma);
                        let contadorSelect = 1; // PARA EN LOS COMENTARIOS AL MOMENTO DE OBTENER LA ULTIMA PAGINA PODER OBTENER LA  ULTIMA REFERENTE A CADA DISCIPLINA SELECCIONADA
                        selected.forEach(disciplina => {
                            let paginasPorSelected = 0; // PARA PODER CONTROLAR CUANTAS PAGINAS CREARA CADA SELECT 
                            // BODY MODAL
                            // CREAR TODAS LAS PAGINAS DE EL MODAL
                            preguntaActual = 0; // SE REINICIA PARA CADA SELECT
                            while (paginasPorSelected<totalPaginasR && paginaActual + 1  <= totalPaginasLoma) { // LAS PAGINAS POR CADA SELECT DEBEN DE SER LAS QUE SE CALCULAN CONTANDO COMENTARIOS / EN PAGINA ACTUAL ES +1 PORQUE NO SE DEBE DE CONTAR LA PRIMER PAGINA 
                                // CREAR EL ELEMENTO DE CADA PAGINA
                                const paginaModalBody = document.createElement('div');
                                paginaModalBody.id = `pagina-${tituloModal}-${paginaActual + 1}`; // PARA PODER HACER EL CAMBIO DE PAGINA / ES +1 PORQUE NO SE DEBE DE CONTAR LA PRIMER PAGINA 
                                paginaModalBody.className = 'd-none'; // EN LO DE LA LOMA SE DEBE DE PONER LA CLASE D-NONE DIRECTAMENTE A LA PAGINA PORQUE EN LOS NORMALES PRIMERO SE CREAN LAS PAGINAS Y YA DESPUES SE LES AÑADE LA CLASE D-NONO A LAS PAGINAS CON EL FOR MOSTRAR PAGINA PERO EN LA LOMA NO PASA PORQUE LAS PAGINAS SE CREARAN CUANDO SE ELIJA DISCIPLINA 
                                
                                let preguntasPorPagina = 0; //  SE REINICIA EL CONTADOR EN CADA PAGINA
                                // AGREGAR PREGUNTAS A CADA PAGINA
                                // console.log("pregunta actual",preguntaActual);
                                // console.log("total", totalPreguntas);
                                while (preguntaActual < totalPreguntas && preguntasPorPagina<3) {
                                    // HACER CADA CARD DE CADA PREGUNTA CON SU INFO
                                    const cardPregunta = document.createElement('div'); // CREAR CARD DE CADA PREGUNTA
                                    cardPregunta.className = 'mb-3 p-3 rounded-4';
                                    cardPregunta.style.background = '#eF2d3b';

                                    const tituloPregunta = document.createElement('p'); // CREAR ELEMENTO PARA EL TITULO DE AL PREGUNTA 
                                    tituloPregunta.className = 'fw-bold text-center text-white';
                                    tituloPregunta.innerText = `${data2.preguntas[preguntaActual].nombre_pregunta} - ${disciplina.nombre_disciplina_deportiva}`;
                                    
                                    const respuestasPregunta = document.createElement('div'); // CREAR ELEMENTO DIV QUE ALMACENARA LOS DIV QUE ALMACENAN CADA INPUT
                                    respuestasPregunta.className = 'd-flex justify-content-center';
                                    data2.respuestas.forEach(respuesta =>{
                                        if(respuesta.id_pregunta==data2.preguntas[preguntaActual].id_pregunta){
                                            const posibleRespuesta = document.createElement('div'); // CREAR DIV QUE ALACENARA EL INPUT
                                            posibleRespuesta.className = 'form-check form-check-inline text-white';
                                            posibleRespuesta.innerHTML = ` 
                                                <input class="form-check-input" type="radio" name="p-${disciplina.nombre_disciplina_deportiva}-${preguntaActual+1}" value="${respuesta.id_respuesta}" data-id_pregunta="${respuesta.id_pregunta}" data-id_disciplina="${disciplina.id_disciplina_deportiva}"> ${respuesta.nombre_respuesta}
                                            `; // AGREGAR EL INPUT AL DIV / ES +1 PARA QUE EL NUMERO DE PREGUNTA VAYA INICIANDO EN 1 Y ASI SE SIGA EN LUAGAR DE 0 COMO EN EL ARREGLO / ES NAME PORQUE ESE NAME SE DEBE DE PODER REPETIR DEPENDIENDO DE LA CANTIDAD DE POSIBLES RESPUESTAS / EL DISCIPLINA LO TRAIGO DEL ARREGLO SELECT PUES AHI LO TRAIGO DEL VALUE DE CADA DISCIPLINA
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
                                paginaActual ++;// SUMAR 1 A LA VARIABLE
                                paginasPorSelected ++;
                                // console.log('paginaActual',paginaActual);
                            }

                            // COMENTARIOS PARA CASO LA LOMA
                            if (totalPreguntas % 3 == 0 || totalPreguntas % 3 == 2 ){ // ES 0 PORQUE ESO QUIERE DECIR QUE EL TOTAL DE PREGUNTAS ES MULTIPLO DE 3 PUES NO HAY RESIDUO  Y QUE LA ULTIMA PAGINA ESTA OCUPADA POR 3 PREGUNTAS / SI HAY RESIDUO DE 2 QUIERE DECIR QUE LA ULTIMA PAGINA TENDRA 2 PREGUNTAS
                                // SE CREA UNA PAGINA EXTRA PARA PODER PONER EL ESPACIO PARA COMENTARIOS
                                const paginaModalBody = document.getElementById(`pagina-${tituloModal}-${paginaActual}`);
                                paginaModalBody.id = `pagina-${tituloModal}-${paginaActual}`; // ES DIRECTAMENTE LA PAGINA ACTUAL PUES ESTA QUEDA EN LA ULTIMA PAGINA QUE SE CREO PARA LA DISCIPLINA Y COMO SE CREAN LAS PAGINAS NECESARIAS YA CONTANDO SI NECESITA OTRA PARA METER COMENTARIOS O NO 
                                paginaModalBody.classList.add('text-center');// CENTRAR CONTENIDO / EN LO DE LA LOMA SE DEBE DE HACER ADD EN LUGAR DE CLASSNAME PORQUE EN LOS NORMALES PRIMERO SE CREAN LAS PAGINAS Y YA DESPUES SE LES AÑADE LA CLASE D-NONO A LAS PAGINAS CON EL FOR MOSTRAR PAGINA PERO EN LA LOMA NO PASA PORQUE LAS PAGINAS SE CREARAN CUANDO SE ELIJA DISCIPLINA 
                                paginaModalBody.innerHTML = `
                                    <h5 class="fw-bold">COMENTARIOS</h5>
                                    <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                                        <p class="fw-bold text-white">¿TIENES COMENTARIOS DE ADMIRACION - ${disciplina.nombre_disciplina_deportiva}?</p>
                                        <div class="d-flex justify-content-center">
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioPositivo-${disciplina.nombre_disciplina_deportiva}" value="1"> SI
                                            </div>
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioPositivo-${disciplina.nombre_disciplina_deportiva}" value="0"> NO
                                            </div>
                                        </div>
                                    </div>
                                    <textarea class="form-control mb-3 d-none" placeholder="Aspectos admirables en ${tituloModal.toLowerCase()} (${disciplina.nombre_disciplina_deportiva}): ..." id="comentarioServicioPositivo-${disciplina.nombre_disciplina_deportiva}"></textarea>
                                    <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                                        <p class="fw-bold text-white">¿TIENES COMENTARIOS DE MEJORA - ${disciplina.nombre_disciplina_deportiva}?</p>
                                        <div class="d-flex justify-content-center">
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioNegativo-${disciplina.nombre_disciplina_deportiva}" value="1"> SI
                                            </div>
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioNegativo-${disciplina.nombre_disciplina_deportiva}" value="0"> NO
                                            </div>
                                        </div>
                                    </div>
                                    <textarea class="form-control mb-3 d-none" placeholder="Aspectos a mejorar en ${tituloModal.toLowerCase()} (${disciplina.nombre_disciplina_deportiva}): ..." id="comentarioServicioNegativo-${disciplina.nombre_disciplina_deportiva}"></textarea
                                `; // AGREGAR CARDS PARA PREGUNTAR SI DESEA DEJAR COMENTARIOS
                                modalEvaluacionBody.appendChild(paginaModalBody);

                            }else if (totalPreguntas % 3 == 1){
                                // SE MANTIENE EN LA ULTIMAPAGINA CREADA PUES AUN HAY ESPACIO (ESTO SOLO SI EL RESIDUO ES 1 PUES QUIERE DECIR QUE HAY SOLO UNA PREGUNTA EN LA ULTIMA PAGINA)
                                const ultimaPagina = document.getElementById(`pagina-${tituloModal}-${(totalPaginasR * contadorSelect) + 1}`); // OBTENER LA ULTIMA PAGINA CREADA / EL TOTALPAGINASR ES LAS PAGINAS QUE SE NECESITAN PARA PREGUNTAS Y COMENTARIOS, EL * CON CONTADOR SELECT ES PARA SABER EN QUE SELECT VA Y POR CONSIGUIENTE SABER CUAL ES LA ULTIMA PAGINA DE ESE SELECT Y POR ULTIMO ES +1 PORQUE LA PRIMER PAGINA NO SE CUANTA PUES ES LA QUE SE USA PARA SELECCIONAR DISCIPLINAS
                                // CREAR ELEMENTOS DE LOS COMENTARIOS Y BOTON
                                ultimaPagina.classList.add('text-center');// CENTRAR CONTENIDO / EN LO DE LA LOMA SE DEBE DE HACER ADD EN LUGAR DE CLASSNAME PORQUE EN LOS NORMALES PRIMERO SE CREAN LAS PAGINAS Y YA DESPUES SE LES AÑADE LA CLASE D-NONO A LAS PAGINAS CON EL FOR MOSTRAR PAGINA PERO EN LA LOMA NO PASA PORQUE LAS PAGINAS SE CREARAN CUANDO SE ELIJA DISCIPLINA 
                                const tituloComentario = document.createElement('h5'); // TITULO DE APARTADO
                                tituloComentario.className = 'fw-bold';
                                tituloComentario.innerText = 'COMENTARIOS';
                                const preguntaComentarioPositivo = document.createElement('div'); // CARD PARA PREGUNATAR SI TIENE COMENTARIO POSITIVO
                                preguntaComentarioPositivo.className = 'mb-3 p-3 rounded-4';
                                preguntaComentarioPositivo.style.background = '#eF2d3b';
                                preguntaComentarioPositivo.innerHTML = `
                                    <p class="fw-bold text-white">¿TIENES COMENTARIOS DE ADMIRACION - ${disciplina.nombre_disciplina_deportiva}?</p>
                                    <div class="d-flex justify-content-center">
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioPositivo-${disciplina.nombre_disciplina_deportiva}" value="1"> SI
                                        </div>
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioPositivo-${disciplina.nombre_disciplina_deportiva}" value="0"> NO
                                        </div>
                                    </div>
                                `;
                                const preguntaComentarioNegativo = document.createElement('div'); // CARD PARA PREGUNATAR SI TIENE COMENTARIO NEGATIVO
                                preguntaComentarioNegativo.className = 'mb-3 p-3 rounded-4';
                                preguntaComentarioNegativo.style.background = '#eF2d3b';
                                preguntaComentarioNegativo.innerHTML = `
                                    <p class="fw-bold text-white">¿TIENES COMENTARIOS DE MEJORA - ${disciplina.nombre_disciplina_deportiva}?</p>
                                    <div class="d-flex justify-content-center">
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioNegativo-${disciplina.nombre_disciplina_deportiva}" value="1"> SI
                                        </div>
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioNegativo-${disciplina.nombre_disciplina_deportiva}" value="0"> NO
                                        </div>
                                    </div>
                                `;
                                const contenidoComentarioPositivo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO POSITIVO
                                contenidoComentarioPositivo.className = 'form-control mb-3 d-none';
                                contenidoComentarioPositivo.id = `comentarioServicioPositivo-${disciplina.nombre_disciplina_deportiva}`;
                                contenidoComentarioPositivo.placeholder = `Aspectos admirables en ${tituloModal.toLowerCase()} (${disciplina.nombre_disciplina_deportiva}): ...`;
                                const contenidoComentarioNegativo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO NEGATIVO
                                contenidoComentarioNegativo.className = 'form-control mb-3 d-none';
                                contenidoComentarioNegativo.id = `comentarioServicioNegativo-${disciplina.nombre_disciplina_deportiva}`;
                                contenidoComentarioNegativo.placeholder = `Aspectos a mejorar en ${tituloModal.toLowerCase()} (${disciplina.nombre_disciplina_deportiva}): ...`;

                                //AGREGAR ELEMENTOS A LA ULTIMA PAGINA
                                ultimaPagina.appendChild(tituloComentario);
                                ultimaPagina.appendChild(preguntaComentarioPositivo);
                                ultimaPagina.appendChild(contenidoComentarioPositivo);
                                ultimaPagina.appendChild(preguntaComentarioNegativo);
                                ultimaPagina.appendChild(contenidoComentarioNegativo);
                                contadorSelect ++; // SUMAR 1 PARA QUE SE SIGA CON EL SIGUIENTE SELECT
                            }

                            const respuestasComentarioPositivo = document.querySelectorAll(`input[name="p-comentarioPositivo-${disciplina.nombre_disciplina_deportiva}"]`);// SABER SI QUIERE DEJAR COMENTARIO POSITIVO
                            respuestasComentarioPositivo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
                                input.addEventListener('change', () => {
                                    const comentarioPositivoSeleccion = document.querySelector(`input[name="p-comentarioPositivo-${disciplina.nombre_disciplina_deportiva}"]:checked`);
                                    comentarioPositivoSeleccionValor = comentarioPositivoSeleccion.value;

                                    const comentarioServicioPositivo = document.getElementById(`comentarioServicioPositivo-${disciplina.nombre_disciplina_deportiva}`);
                                    // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                                    if (comentarioPositivoSeleccionValor === "1") {
                                        comentarioServicioPositivo.classList.remove('d-none');
                                    }else{
                                        comentarioServicioPositivo.classList.add('d-none');
                                    }
                                });
                            });

                            const respuestasComentarioNegativo = document.querySelectorAll(`input[name="p-comentarioNegativo-${disciplina.nombre_disciplina_deportiva}"]`);//  SABER SI QUIERE DEJAR COMENTARIO NEGATIVO
                            respuestasComentarioNegativo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
                                input.addEventListener('change', () => {
                                    const comentarioNegativoSeleccion = document.querySelector(`input[name="p-comentarioNegativo-${disciplina.nombre_disciplina_deportiva}"]:checked`);
                                    comentarioNegativoSeleccionValor = comentarioNegativoSeleccion.value;

                                    const comentarioServicioNegativo = document.getElementById(`comentarioServicioNegativo-${disciplina.nombre_disciplina_deportiva}`);
                                    // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                                    if (comentarioNegativoSeleccionValor === "1") {
                                        comentarioServicioNegativo.classList.remove('d-none');
                                    }else{
                                        comentarioServicioNegativo.classList.add('d-none');
                                    }
                                });
                            });
                        });

                        // BOTON DE FINALIZAR LA AVALUACION / SE HACE AQUI PORQUE NO SE CREA EL BOTON HASTA QUE SE ELIGE UNA DISCIPLINA MINIMO ENTONCES NO SE PUEDE OBTENER FUERA PUES AUN SE A CREADO EN EL DOOM
                        const paginaFinal = document.getElementById(`pagina-${tituloModal}-${totalPaginasLoma}`); // LA PAGINA FINAL QUE SE CREO DE TODAS LAS DISCIPLINAS
                        const botonTerminarEvaluacion = document.createElement('button');
                        botonTerminarEvaluacion.id = 'btnTerminarEvaluacion';
                        botonTerminarEvaluacion.className = 'btn btn-danger fw-bold';
                        botonTerminarEvaluacion.innerText  = 'Terminar Evaluación';
                        paginaFinal.appendChild(botonTerminarEvaluacion);
                        const btnTerminarEvaluacion = document.getElementById('btnTerminarEvaluacion'); 
                            btnTerminarEvaluacion.addEventListener('click', async ()=>{
                                const respuestasAlumno = []; // PARA ALMACENAR LAS RESPUESTAS QUE EL ALUMNO DIO 
                                const valoresComentario = []; // PARA ALMACENAR LOS VALORES DE QUE SI DESEA DEJAR COMENTARIOS POSITIVOS O NEGATIVOS
                                const comentariosVacios = []; // PARA SABER SI HAY COMENTARIOS VACIOS EN CASO DE QUE SE DECIDA DEJAR UNO
                                const comentariosAlumno = []; // PARA ALMACENAR LOS COMENTARIOS QUE EL ALUMNO DIO 

                                selected.forEach(async disciplinaRespuesta => {
                                    for (let i = 1; i <= totalPreguntas; i++) { // RECORRER LAS PREGUNTAR PARA OBTENER SU RESPUESTA
                                        const respuestaSeleccionada = document.querySelector(`input[name="p-${disciplinaRespuesta.nombre_disciplina_deportiva}-${i}"]:checked`); // SELECCIONA EL INPUT QUE ESTE SELLECIONADO DE CADA PREGUNTA
                                        const valorRespuesta = respuestaSeleccionada ? respuestaSeleccionada.value : null; // SI NO SE SELECCIONO AUN ES NULL
                                        if (valorRespuesta != null){
                                            respuestasAlumno.push({ // METER  RESPUESTA 
                                                'id_disciplina_deportiva': respuestaSeleccionada.dataset.id_disciplina,
                                                'id_pregunta': respuestaSeleccionada.dataset.id_pregunta,
                                                'id_respuesta': valorRespuesta
                                            });
                                        }
                                    }

                                    let comentarioPositivoSeleccionValor = null; // SE REINICIAN VARIABLES PARA QUE NO SE QUEDEN CON VALORES DE UN ANTERIOR CICLO 
                                    let comentarioNegativoSeleccionValor = null;
                                    
                                    // METER LA RESPUESTA (SI/NO) DE LOS COMENTARIOS
                                    const comentarioPositivoSeleccion = document.querySelector(`input[name="p-comentarioPositivo-${disciplinaRespuesta.nombre_disciplina_deportiva}"]:checked`);
                                    if(comentarioPositivoSeleccion !== null){
                                        comentarioPositivoSeleccionValor = comentarioPositivoSeleccion.value;
                                    }
                                    const comentarioNegativoSeleccion = document.querySelector(`input[name="p-comentarioNegativo-${disciplinaRespuesta.nombre_disciplina_deportiva}"]:checked`);
                                    if (comentarioNegativoSeleccion !== null){
                                        comentarioNegativoSeleccionValor = comentarioNegativoSeleccion.value;
                                    }

                                    if(comentarioPositivoSeleccionValor !== null && comentarioNegativoSeleccionValor !== null){
                                        valoresComentario.push({
                                            'id_disciplina_deportiva': disciplinaRespuesta.id_disciplina_deportiva, // ESTE SE LO PUSE CUANDO HICE EL SELECTED LO TRAJE DE EL VALUE DE CADA OPCION DE DISCIPLINA
                                            'comentarioPositivoSeleccionValor': comentarioPositivoSeleccionValor,
                                            'comentarioNegativoSeleccionValor': comentarioNegativoSeleccionValor
                                        });
                                    }

                                    // EN CASO DE HABER COMENTARIOS METERLOS
                                    const comentarioServicioPositivo = document.getElementById(`comentarioServicioPositivo-${disciplinaRespuesta.nombre_disciplina_deportiva}`);
                                    const comentarioServicioNegativo = document.getElementById(`comentarioServicioNegativo-${disciplinaRespuesta.nombre_disciplina_deportiva}`);

                                    // console.log('comentarioServicioPositivo',comentarioServicioPositivo);
                                    // console.log('comentarioServicioPositivo.value',comentarioServicioPositivo.value);
                                    // console.log('comentarioServicioNegativo',comentarioServicioNegativo);
                                    // console.log('comentarioServicioNegativo.value',comentarioServicioNegativo.value);
                                    if (comentarioPositivoSeleccionValor == 1 && comentarioServicioPositivo.value == '' ){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                                        comentariosVacios.push({
                                            'FaltaPositivo?':'SI' // LO PUSE POR PONER ALGO JAJAAJA
                                        });
                                    }

                                    if (comentarioNegativoSeleccionValor == 1 && comentarioServicioNegativo.value == ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                                        comentariosVacios.push({
                                            'FaltaNegativo?':'SI' // LO PUSE POR PONER ALGO JAJAAJA
                                        })
                                    }

                                    if (comentarioPositivoSeleccionValor == 1 && comentarioServicioPositivo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO Y QUE NO ESTA VACIO EL COMENTARIO
                                        comentariosAlumno.push({
                                            'id_disciplina_deportiva': disciplinaRespuesta.id_disciplina_deportiva,
                                            'tipo_comentario': 1,
                                            'comentario_servicio': comentarioServicioPositivo.value 
                                        });
                                    }

                                    if (comentarioNegativoSeleccionValor == 1 && comentarioServicioNegativo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGAATIVO Y QUE NO ESTA VACIO EL COMENTARIO
                                        comentariosAlumno.push({
                                            'id_disciplina_deportiva': disciplinaRespuesta.id_disciplina_deportiva,
                                            'tipo_comentario': 2,
                                            'comentario_servicio': comentarioServicioNegativo.value 
                                        });
                                    }
                                    
                                });

                                console.log('selected',selected);
                                console.log('valores',valoresComentario);
                                console.log('respuestasAlumno',respuestasAlumno);
                                console.log('comentarios',comentariosAlumno);

                                // ALERTA EN CASO DE QUE UNA PREGUNTA ESTE SIN CONTESTAR 
                                if(respuestasAlumno.length < totalPreguntas * selected.length || valoresComentario.length < selected.length ){ // SE MULTIPLICAN LA CANTIDAD DE REGUNTAS QUE SE DEBEN DE RESPONDER POR LA CANTIDAD DE DISCIPLINAS SELECCIONADA / ES < A LA LENGTH DE SELECTED PUES 1 VALORES COMENTARIOS YA TRAE LOS VALORES (SI/NO) DE AMBOS COMENTARIOS (POSITIVO/NEGATIVO)
                                    await Swal.fire({
                                        icon: 'error',
                                        title: 'Todas las preguntas deben de ser contestadas'
                                    });
                                    return;
                                }

                                if (comentariosVacios.length > 0){ // QUIERE DECIR QUE EL ARREGLO SE LLENO AL MENOS CON UN VALOR POR LO QUUE HAY ALGUN COMENTARIO AL QUE SE REPONDIO CON SI PERO SIN CONTENIDO
                                    await Swal.fire({
                                        icon: 'error',
                                        title: 'El apartado para comentar esta vacio'
                                    });
                                    return;
                                }

                                const resulado = await guardarRespuestasServicioLoma(id_servicio,respuestasAlumno,comentariosAlumno);
                                if(resulado.success){
                                    await Swal.fire({
                                        icon: 'success',
                                        title: resulado.message,
                                        text: resulado.message,
                                        timer: 1500,
                                        showConfirmButton: false
                                    });
                                    window.location.reload();
                                }else{
                                    await Swal.fire({
                                        icon: 'error',
                                        title: resulado.message,
                                        text: resulado.message,
                                    });
                                }
                            });
                    });
                });

            } catch (error) {
                console.error('Error en disciplinas deportivas:', error);
            }
        }

        // OPCION DE SELECCIONAR LA LIGA DEPORTIVA EN CASO DE SER LIGAS DEPORTIVAS
        if (nombre_servicio == 'LIGAS DEPORTIVAS') {
            try {
                const res = await fetch(`/getLigasDeportivas`, { credentials: 'include' }); //OBTENER LAS LIGAS DEPORTIVAS DE LA API
                const data = await res.json();
                const res2 = await fetch(`/getPreguntasServicio/${id_servicio}`, { credentials: 'include' }); //OBTENER LOS SERVICIOS DE LA API
                const data2 = await res2.json();
                if (!data.success) throw new Error('No se pudieron obtener las ligas deportivas');

                modalEvaluacionBody.innerHTML = ``;

                const selectLigaDeportiva = document.createElement('div'); // CREAR EL CONTENEDOR DEL DROPDOWN
                selectLigaDeportiva.className = 'container text-center';
                selectLigaDeportiva.id = `pagina-LIGAS DEPORTIVAS-1`;  // PORQUE SERA LA PRIMER PAGINA
                selectLigaDeportiva.innerHTML = `
                    <div class="mb-4">
                        <label class="form-label fw-bold">SELECCIONA UNA O VARIAS LIGAS</label>
                        <div class="dropdown">
                            <button class="btn btn-outline-danger dropdown-toggle w-100" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="dropdownLigasBtn">
                                Selecciona una o varias ligas
                            </button>
                            <ul class="dropdown-menu p-2 w-100" id="dropdownLigasList" style="max-height: 250px; overflow-y: auto;"></ul>
                        </div>
                    </div>
                `;
                modalEvaluacionBody.appendChild(selectLigaDeportiva) // AGREGAR EL ELEMENTO ASNTES DE EL PRIMER ELEMENTO QUE TIENE COMO CHILD LA PAGINA

                const listContainer = document.getElementById('dropdownLigasList'); // CONTENEDOR DEL DROPDOWN
                const btn = document.getElementById('dropdownLigasBtn'); // BOTON DEL DROPDOWN
                // console.log(data.ligasDeportivas);
                data.ligasDeportivas.forEach((liga) => {// AGREGAR OPCIONES DE LIGAS
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div class="form-check">
                        <input class="form-check-input" type="checkbox" value="${liga.id_liga_deportiva}" id="liga-${liga.id_liga_deportiva}" data-nombre_liga_deportiva="${liga.nombre_liga_deportiva}">
                        <label class="form-check-label" for="liga-${liga.id_liga_deportiva}">
                            ${liga.nombre_liga_deportiva}
                        </label>
                        </div>
                    `;
                    listContainer.appendChild(li);
                });
                const checkboxes = listContainer.querySelectorAll('input[type="checkbox"]'); // PARA ACTUALIZAR EL TEXTO DEL BOTÓN AL SELECCIONAR OPCIONES
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', () => {
                        const selected = [...checkboxes].filter(c => c.checked).map(c => ({nombre_liga_deportiva: c.dataset.nombre_liga_deportiva,id_liga_deportiva: c.value}));// CONVIERTE LA NODELIST EN UN ARRAY REAL .FILTER(C => C.CHECKED) // SE QUEDA SOLO CON LOS CHECKBOXES SELECCIONADOS .MAP(C => C.VALUE); OBTIENE EL VALOR QUE SE DESEA SACAR DE CADA ELEMENTO
                        if (selected.length === 0) {
                            btn.textContent = 'Selecciona una o varias ligas';
                        } else if (selected.length <= 3) {
                            btn.textContent = selected.map(item => item.nombre_liga_deportiva).join(', '); // .join JUNTA LOS VALORES DEL ARREGLO SEPRANDOLOS POR ", "
                        } else {
                            const primerosTres = selected.slice(0, 3).map(item => item.nombre_liga_deportiva).join(', '); // .slice TOMA LOS PRIMEROS 3 ELEMENTOS DEL ARRAY
                            btn.textContent = `${primerosTres} +${selected.length - 3} MÁS`;
                        }
                        // console.log("paginas totales",totalPaginasR*selected.length + 1);
                        // console.log('legthSelect',selected.length);
                        // console.log('paginasR',totalPaginasR);
                        // console.log('totalLIGAS DEPORTIVAS',totalPaginasLIGAS DEPORTIVAS);
                        // console.log('selected',selected);

                        for (let i = 0; i < totalPaginasLigas_Deportivas; i++) { // BORRAR PAGINAS ANTERIORES PARA VOLVER A CREAR LAS NUEVAS
                            const paginaBorrar = document.getElementById(`pagina-${tituloModal}-${i+2}`); // MAS 2 PORQUE  COMO INICIA EN 0 EL ARREGLO / SE DEBE DE SUMAR PARA NO CONTAR LA PAGINA 1 TAMBIEN 
                            if (paginaBorrar !== null) {
                                paginaBorrar.remove();
                            }
                        }

                        totalPaginasLigas_Deportivas = totalPaginasR*selected.length + 1; // EL MAS 1 ES PORQUE ESA ES LA PAGINA QUE SE USA PARA QUE ELIJAN LIGAS
                        let paginaActual = 1; //  SE REINICIA EL CONTADOR EN CADA PAGINA A 1 QUE ES LA PAGINA QUE SIEMPRE ESTARA PUES ES DONDE SE ELIJEN LAS LIGAS
                        let contadorSelect = 1; // PARA EN LOS COMENTARIOS AL MOMENTO DE OBTENER LA ULTIMA PAGINA PODER OBTENER LA  ULTIMA REFERENTE A CADA LIGA SELECCIONADA
                        selected.forEach(liga => {
                            let paginasPorSelected = 0; // PARA PODER CONTROLAR CUANTAS PAGINAS CREARA CADA SELECT 
                            // BODY MODAL
                            // CREAR TODAS LAS PAGINAS DE EL MODAL
                            preguntaActual = 0; // SE REINICIA PARA CADA SELECT
                            while (paginasPorSelected<totalPaginasR && paginaActual + 1  <= totalPaginasLigas_Deportivas) { // LAS PAGINAS POR CADA SELECT DEBEN DE SER LAS QUE SE CALCULAN CONTANDO COMENTARIOS / EN PAGINA ACTUAL ES +1 PORQUE NO SE DEBE DE CONTAR LA PRIMER PAGINA 
                                // CREAR EL ELEMENTO DE CADA PAGINA
                                const paginaModalBody = document.createElement('div');
                                paginaModalBody.id = `pagina-${tituloModal}-${paginaActual + 1}`; // PARA PODER HACER EL CAMBIO DE PAGINA / ES +1 PORQUE NO SE DEBE DE CONTAR LA PRIMER PAGINA 
                                paginaModalBody.className = 'd-none'; // EN LO DE LA LIGAS DEPORTIVAS SE DEBE DE PONER LA CLASE D-NONE DIRECTAMENTE A LA PAGINA PORQUE EN LOS NORMALES PRIMERO SE CREAN LAS PAGINAS Y YA DESPUES SE LES AÑADE LA CLASE D-NONO A LAS PAGINAS CON EL FOR MOSTRAR PAGINA PERO EN LA LIGAS DEPORTIVAS NO PASA PORQUE LAS PAGINAS SE CREARAN CUANDO SE ELIJA LIGA 
                                
                                let preguntasPorPagina = 0; //  SE REINICIA EL CONTADOR EN CADA PAGINA
                                // AGREGAR PREGUNTAS A CADA PAGINA
                                // console.log("pregunta actual",preguntaActual);
                                // console.log("total", totalPreguntas);
                                while (preguntaActual < totalPreguntas && preguntasPorPagina<3) {
                                    // HACER CADA CARD DE CADA PREGUNTA CON SU INFO
                                    const cardPregunta = document.createElement('div'); // CREAR CARD DE CADA PREGUNTA
                                    cardPregunta.className = 'mb-3 p-3 rounded-4';
                                    cardPregunta.style.background = '#eF2d3b';

                                    const tituloPregunta = document.createElement('p'); // CREAR ELEMENTO PARA EL TITULO DE AL PREGUNTA 
                                    tituloPregunta.className = 'fw-bold text-center text-white';
                                    tituloPregunta.innerText = `${data2.preguntas[preguntaActual].nombre_pregunta} - ${liga.nombre_liga_deportiva}`;
                                    
                                    const respuestasPregunta = document.createElement('div'); // CREAR ELEMENTO DIV QUE ALMACENARA LOS DIV QUE ALMACENAN CADA INPUT
                                    respuestasPregunta.className = 'd-flex justify-content-center';
                                    data2.respuestas.forEach(respuesta =>{
                                        if(respuesta.id_pregunta==data2.preguntas[preguntaActual].id_pregunta){
                                            const posibleRespuesta = document.createElement('div'); // CREAR DIV QUE ALACENARA EL INPUT
                                            posibleRespuesta.className = 'form-check form-check-inline text-white';
                                            posibleRespuesta.innerHTML = ` 
                                                <input class="form-check-input" type="radio" name="p-${liga.nombre_liga_deportiva}-${preguntaActual+1}" value="${respuesta.id_respuesta}" data-id_pregunta="${respuesta.id_pregunta}" data-id_liga="${liga.id_liga_deportiva}"> ${respuesta.nombre_respuesta}
                                            `; // AGREGAR EL INPUT AL DIV / ES +1 PARA QUE EL NUMERO DE PREGUNTA VAYA INICIANDO EN 1 Y ASI SE SIGA EN LUAGAR DE 0 COMO EN EL ARREGLO / ES NAME PORQUE ESE NAME SE DEBE DE PODER REPETIR DEPENDIENDO DE LA CANTIDAD DE POSIBLES RESPUESTAS / EL LIGA LO TRAIGO DEL ARREGLO SELECT PUES AHI LO TRAIGO DEL VALUE DE CADA LIGA
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
                                paginaActual ++;// SUMAR 1 A LA VARIABLE
                                paginasPorSelected ++;
                                // console.log('paginaActual',paginaActual);
                            }

                            // COMENTARIOS PARA CASO LA LIGAS DEPORTIVAS
                            if (totalPreguntas % 3 == 0 || totalPreguntas % 3 == 2 ){ // ES 0 PORQUE ESO QUIERE DECIR QUE EL TOTAL DE PREGUNTAS ES MULTIPLO DE 3 PUES NO HAY RESIDUO  Y QUE LA ULTIMA PAGINA ESTA OCUPADA POR 3 PREGUNTAS / SI HAY RESIDUO DE 2 QUIERE DECIR QUE LA ULTIMA PAGINA TENDRA 2 PREGUNTAS
                                // SE CREA UNA PAGINA EXTRA PARA PODER PONER EL ESPACIO PARA COMENTARIOS
                                const paginaModalBody = document.getElementById(`pagina-${tituloModal}-${paginaActual}`);
                                paginaModalBody.id = `pagina-${tituloModal}-${paginaActual}`; // ES DIRECTAMENTE LA PAGINA ACTUAL PUES ESTA QUEDA EN LA ULTIMA PAGINA QUE SE CREO PARA LA LIGA Y COMO SE CREAN LAS PAGINAS NECESARIAS YA CONTANDO SI NECESITA OTRA PARA METER COMENTARIOS O NO 
                                paginaModalBody.classList.add('text-center');// CENTRAR CONTENIDO / EN LO DE LA LIGAS DEPORTIVAS SE DEBE DE HACER ADD EN LUGAR DE CLASSNAME PORQUE EN LOS NORMALES PRIMERO SE CREAN LAS PAGINAS Y YA DESPUES SE LES AÑADE LA CLASE D-NONO A LAS PAGINAS CON EL FOR MOSTRAR PAGINA PERO EN LA LIGAS DEPORTIVAS NO PASA PORQUE LAS PAGINAS SE CREARAN CUANDO SE ELIJA LIGA 
                                paginaModalBody.innerHTML = `
                                    <h5 class="fw-bold">COMENTARIOS</h5>
                                    <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                                        <p class="fw-bold text-white">¿TIENES COMENTARIOS DE ADMIRACION - ${liga.nombre_liga_deportiva}?</p>
                                        <div class="d-flex justify-content-center">
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioPositivo-${liga.nombre_liga_deportiva}" value="1"> SI
                                            </div>
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioPositivo-${liga.nombre_liga_deportiva}" value="0"> NO
                                            </div>
                                        </div>
                                    </div>
                                    <textarea class="form-control mb-3 d-none" placeholder="Aspectos admirables en ${tituloModal.toLowerCase()} (${liga.nombre_liga_deportiva}): ..." id="comentarioServicioPositivo-${liga.nombre_liga_deportiva}"></textarea>
                                    <div class="mb-3 p-3 rounded-4" style="background-color: #eF2d3b">
                                        <p class="fw-bold text-white">¿TIENES COMENTARIOS DE MEJORA - ${liga.nombre_liga_deportiva}?</p>
                                        <div class="d-flex justify-content-center">
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioNegativo-${liga.nombre_liga_deportiva}" value="1"> SI
                                            </div>
                                            <div class="form-check form-check-inline text-white">
                                                <input class="form-check-input" type="radio" name="p-comentarioNegativo-${liga.nombre_liga_deportiva}" value="0"> NO
                                            </div>
                                        </div>
                                    </div>
                                    <textarea class="form-control mb-3 d-none" placeholder="Aspectos a mejorar en ${tituloModal.toLowerCase()} (${liga.nombre_liga_deportiva}): ..." id="comentarioServicioNegativo-${liga.nombre_liga_deportiva}"></textarea
                                `; // AGREGAR CARDS PARA PREGUNTAR SI DESEA DEJAR COMENTARIOS
                                modalEvaluacionBody.appendChild(paginaModalBody);

                            }else if (totalPreguntas % 3 == 1){
                                // SE MANTIENE EN LA ULTIMAPAGINA CREADA PUES AUN HAY ESPACIO (ESTO SOLO SI EL RESIDUO ES 1 PUES QUIERE DECIR QUE HAY SOLO UNA PREGUNTA EN LA ULTIMA PAGINA)
                                const ultimaPagina = document.getElementById(`pagina-${tituloModal}-${(totalPaginasR * contadorSelect) + 1}`); // OBTENER LA ULTIMA PAGINA CREADA / EL TOTALPAGINASR ES LAS PAGINAS QUE SE NECESITAN PARA PREGUNTAS Y COMENTARIOS, EL * CON CONTADOR SELECT ES PARA SABER EN QUE SELECT VA Y POR CONSIGUIENTE SABER CUAL ES LA ULTIMA PAGINA DE ESE SELECT Y POR ULTIMO ES +1 PORQUE LA PRIMER PAGINA NO SE CUANTA PUES ES LA QUE SE USA PARA SELECCIONAR LIGAS
                                // CREAR ELEMENTOS DE LOS COMENTARIOS Y BOTON
                                ultimaPagina.classList.add('text-center');// CENTRAR CONTENIDO / EN LO DE LA LIGAS DEPORTIVAS SE DEBE DE HACER ADD EN LUGAR DE CLASSNAME PORQUE EN LOS NORMALES PRIMERO SE CREAN LAS PAGINAS Y YA DESPUES SE LES AÑADE LA CLASE D-NONO A LAS PAGINAS CON EL FOR MOSTRAR PAGINA PERO EN LA LIGAS DEPORTIVAS NO PASA PORQUE LAS PAGINAS SE CREARAN CUANDO SE ELIJA LIGA 
                                const tituloComentario = document.createElement('h5'); // TITULO DE APARTADO
                                tituloComentario.className = 'fw-bold';
                                tituloComentario.innerText = 'COMENTARIOS';
                                const preguntaComentarioPositivo = document.createElement('div'); // CARD PARA PREGUNATAR SI TIENE COMENTARIO POSITIVO
                                preguntaComentarioPositivo.className = 'mb-3 p-3 rounded-4';
                                preguntaComentarioPositivo.style.background = '#eF2d3b';
                                preguntaComentarioPositivo.innerHTML = `
                                    <p class="fw-bold text-white">¿TIENES COMENTARIOS DE ADMIRACION - ${liga.nombre_liga_deportiva}?</p>
                                    <div class="d-flex justify-content-center">
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioPositivo-${liga.nombre_liga_deportiva}" value="1"> SI
                                        </div>
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioPositivo-${liga.nombre_liga_deportiva}" value="0"> NO
                                        </div>
                                    </div>
                                `;
                                const preguntaComentarioNegativo = document.createElement('div'); // CARD PARA PREGUNATAR SI TIENE COMENTARIO NEGATIVO
                                preguntaComentarioNegativo.className = 'mb-3 p-3 rounded-4';
                                preguntaComentarioNegativo.style.background = '#eF2d3b';
                                preguntaComentarioNegativo.innerHTML = `
                                    <p class="fw-bold text-white">¿TIENES COMENTARIOS DE MEJORA - ${liga.nombre_liga_deportiva}?</p>
                                    <div class="d-flex justify-content-center">
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioNegativo-${liga.nombre_liga_deportiva}" value="1"> SI
                                        </div>
                                        <div class="form-check form-check-inline text-white">
                                            <input class="form-check-input" type="radio" name="p-comentarioNegativo-${liga.nombre_liga_deportiva}" value="0"> NO
                                        </div>
                                    </div>
                                `;
                                const contenidoComentarioPositivo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO POSITIVO
                                contenidoComentarioPositivo.className = 'form-control mb-3 d-none';
                                contenidoComentarioPositivo.id = `comentarioServicioPositivo-${liga.nombre_liga_deportiva}`;
                                contenidoComentarioPositivo.placeholder = `Aspectos admirables en ${tituloModal.toLowerCase()} (${liga.nombre_liga_deportiva}): ...`;
                                const contenidoComentarioNegativo = document.createElement('textarea'); // TEXT AREA PARA COMENTARIO NEGATIVO
                                contenidoComentarioNegativo.className = 'form-control mb-3 d-none';
                                contenidoComentarioNegativo.id = `comentarioServicioNegativo-${liga.nombre_liga_deportiva}`;
                                contenidoComentarioNegativo.placeholder = `Aspectos a mejorar en ${tituloModal.toLowerCase()} (${liga.nombre_liga_deportiva}): ...`;

                                //AGREGAR ELEMENTOS A LA ULTIMA PAGINA
                                ultimaPagina.appendChild(tituloComentario);
                                ultimaPagina.appendChild(preguntaComentarioPositivo);
                                ultimaPagina.appendChild(contenidoComentarioPositivo);
                                ultimaPagina.appendChild(preguntaComentarioNegativo);
                                ultimaPagina.appendChild(contenidoComentarioNegativo);
                                contadorSelect ++; // SUMAR 1 PARA QUE SE SIGA CON EL SIGUIENTE SELECT
                            }

                            const respuestasComentarioPositivo = document.querySelectorAll(`input[name="p-comentarioPositivo-${liga.nombre_liga_deportiva}"]`);// SABER SI QUIERE DEJAR COMENTARIO POSITIVO
                            respuestasComentarioPositivo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
                                input.addEventListener('change', () => {
                                    const comentarioPositivoSeleccion = document.querySelector(`input[name="p-comentarioPositivo-${liga.nombre_liga_deportiva}"]:checked`);
                                    comentarioPositivoSeleccionValor = comentarioPositivoSeleccion.value;

                                    const comentarioServicioPositivo = document.getElementById(`comentarioServicioPositivo-${liga.nombre_liga_deportiva}`);
                                    // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                                    if (comentarioPositivoSeleccionValor === "1") {
                                        comentarioServicioPositivo.classList.remove('d-none');
                                    }else{
                                        comentarioServicioPositivo.classList.add('d-none');
                                    }
                                });
                            });

                            const respuestasComentarioNegativo = document.querySelectorAll(`input[name="p-comentarioNegativo-${liga.nombre_liga_deportiva}"]`);//  SABER SI QUIERE DEJAR COMENTARIO NEGATIVO
                            respuestasComentarioNegativo.forEach(input => { // HACER QUE CADA OPCION (INPUT RADIO) TENGA UN EVENTO PARA SABER CUANDO UNO ESTA SELECCIONADO
                                input.addEventListener('change', () => {
                                    const comentarioNegativoSeleccion = document.querySelector(`input[name="p-comentarioNegativo-${liga.nombre_liga_deportiva}"]:checked`);
                                    comentarioNegativoSeleccionValor = comentarioNegativoSeleccion.value;

                                    const comentarioServicioNegativo = document.getElementById(`comentarioServicioNegativo-${liga.nombre_liga_deportiva}`);
                                    // DEPENDIENDO DE LA RESPUESTA APARECE EL ESPPACIO PARA COMENTAR O NO
                                    if (comentarioNegativoSeleccionValor === "1") {
                                        comentarioServicioNegativo.classList.remove('d-none');
                                    }else{
                                        comentarioServicioNegativo.classList.add('d-none');
                                    }
                                });
                            });
                        });

                        // BOTON DE FINALIZAR LA AVALUACION / SE HACE AQUI PORQUE NO SE CREA EL BOTON HASTA QUE SE ELIGE UNA LIGA MINIMO ENTONCES NO SE PUEDE OBTENER FUERA PUES AUN SE A CREADO EN EL DOOM
                        const paginaFinal = document.getElementById(`pagina-${tituloModal}-${totalPaginasLigas_Deportivas}`); // LA PAGINA FINAL QUE SE CREO DE TODAS LAS LIGAS
                        const botonTerminarEvaluacion = document.createElement('button');
                        botonTerminarEvaluacion.id = 'btnTerminarEvaluacion';
                        botonTerminarEvaluacion.className = 'btn btn-danger fw-bold';
                        botonTerminarEvaluacion.innerText  = 'Terminar Evaluación';
                        paginaFinal.appendChild(botonTerminarEvaluacion);
                        const btnTerminarEvaluacion = document.getElementById('btnTerminarEvaluacion'); 
                            btnTerminarEvaluacion.addEventListener('click', async ()=>{
                                const respuestasAlumno = []; // PARA ALMACENAR LAS RESPUESTAS QUE EL ALUMNO DIO 
                                const valoresComentario = []; // PARA ALMACENAR LOS VALORES DE QUE SI DESEA DEJAR COMENTARIOS POSITIVOS O NEGATIVOS
                                const comentariosVacios = []; // PARA SABER SI HAY COMENTARIOS VACIOS EN CASO DE QUE SE DECIDA DEJAR UNO
                                const comentariosAlumno = []; // PARA ALMACENAR LOS COMENTARIOS QUE EL ALUMNO DIO 

                                selected.forEach(async ligaRespuesta => {
                                    for (let i = 1; i <= totalPreguntas; i++) { // RECORRER LAS PREGUNTAR PARA OBTENER SU RESPUESTA
                                        const respuestaSeleccionada = document.querySelector(`input[name="p-${ligaRespuesta.nombre_liga_deportiva}-${i}"]:checked`); // SELECCIONA EL INPUT QUE ESTE SELLECIONADO DE CADA PREGUNTA
                                        const valorRespuesta = respuestaSeleccionada ? respuestaSeleccionada.value : null; // SI NO SE SELECCIONO AUN ES NULL
                                        if (valorRespuesta != null){
                                            respuestasAlumno.push({ // METER  RESPUESTA 
                                                'id_liga_deportiva': respuestaSeleccionada.dataset.id_liga,
                                                'id_pregunta': respuestaSeleccionada.dataset.id_pregunta,
                                                'id_respuesta': valorRespuesta
                                            });
                                        }
                                    }

                                    let comentarioPositivoSeleccionValor = null; // SE REINICIAN VARIABLES PARA QUE NO SE QUEDEN CON VALORES DE UN ANTERIOR CICLO 
                                    let comentarioNegativoSeleccionValor = null;
                                    
                                    // METER LA RESPUESTA (SI/NO) DE LOS COMENTARIOS
                                    const comentarioPositivoSeleccion = document.querySelector(`input[name="p-comentarioPositivo-${ligaRespuesta.nombre_liga_deportiva}"]:checked`);
                                    if(comentarioPositivoSeleccion !== null){
                                        comentarioPositivoSeleccionValor = comentarioPositivoSeleccion.value;
                                    }
                                    const comentarioNegativoSeleccion = document.querySelector(`input[name="p-comentarioNegativo-${ligaRespuesta.nombre_liga_deportiva}"]:checked`);
                                    if (comentarioNegativoSeleccion !== null){
                                        comentarioNegativoSeleccionValor = comentarioNegativoSeleccion.value;
                                    }

                                    if(comentarioPositivoSeleccionValor !== null && comentarioNegativoSeleccionValor !== null){
                                        valoresComentario.push({
                                            'id_liga_deportiva': ligaRespuesta.id_liga_deportiva, // ESTE SE LO PUSE CUANDO HICE EL SELECTED LO TRAJE DE EL VALUE DE CADA OPCION DE LIGA
                                            'comentarioPositivoSeleccionValor': comentarioPositivoSeleccionValor,
                                            'comentarioNegativoSeleccionValor': comentarioNegativoSeleccionValor
                                        });
                                    }

                                    // EN CASO DE HABER COMENTARIOS METERLOS
                                    const comentarioServicioPositivo = document.getElementById(`comentarioServicioPositivo-${ligaRespuesta.nombre_liga_deportiva}`);
                                    const comentarioServicioNegativo = document.getElementById(`comentarioServicioNegativo-${ligaRespuesta.nombre_liga_deportiva}`);

                                    // console.log('comentarioServicioPositivo',comentarioServicioPositivo);
                                    // console.log('comentarioServicioPositivo.value',comentarioServicioPositivo.value);
                                    // console.log('comentarioServicioNegativo',comentarioServicioNegativo);
                                    // console.log('comentarioServicioNegativo.value',comentarioServicioNegativo.value);
                                    if (comentarioPositivoSeleccionValor == 1 && comentarioServicioPositivo.value == '' ){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                                        comentariosVacios.push({
                                            'FaltaPositivo?':'SI' // LO PUSE POR PONER ALGO JAJAAJA
                                        });
                                    }

                                    if (comentarioNegativoSeleccionValor == 1 && comentarioServicioNegativo.value == ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                                        comentariosVacios.push({
                                            'FaltaNegativo?':'SI' // LO PUSE POR PONER ALGO JAJAAJA
                                        })
                                    }

                                    if (comentarioPositivoSeleccionValor == 1 && comentarioServicioPositivo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO Y QUE NO ESTA VACIO EL COMENTARIO
                                        comentariosAlumno.push({
                                            'id_liga_deportiva': ligaRespuesta.id_liga_deportiva,
                                            'tipo_comentario': 1,
                                            'comentario_servicio': comentarioServicioPositivo.value 
                                        });
                                    }

                                    if (comentarioNegativoSeleccionValor == 1 && comentarioServicioNegativo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGAATIVO Y QUE NO ESTA VACIO EL COMENTARIO
                                        comentariosAlumno.push({
                                            'id_liga_deportiva': ligaRespuesta.id_liga_deportiva,
                                            'tipo_comentario': 2,
                                            'comentario_servicio': comentarioServicioNegativo.value 
                                        });
                                    }
                                    
                                });

                                console.log('selected',selected);
                                console.log('valores',valoresComentario);
                                console.log('respuestasAlumno',respuestasAlumno);
                                console.log('comentarios',comentariosAlumno);

                                // ALERTA EN CASO DE QUE UNA PREGUNTA ESTE SIN CONTESTAR 
                                if(respuestasAlumno.length < totalPreguntas * selected.length || valoresComentario.length < selected.length ){ // SE MULTIPLICAN LA CANTIDAD DE REGUNTAS QUE SE DEBEN DE RESPONDER POR LA CANTIDAD DE LIGAS SELECCIONADA / ES < A LA LENGTH DE SELECTED PUES 1 VALORES COMENTARIOS YA TRAE LOS VALORES (SI/NO) DE AMBOS COMENTARIOS (POSITIVO/NEGATIVO)
                                    await Swal.fire({
                                        icon: 'error',
                                        title: 'Todas las preguntas deben de ser contestadas'
                                    });
                                    return;
                                }

                                if (comentariosVacios.length > 0){ // QUIERE DECIR QUE EL ARREGLO SE LLENO AL MENOS CON UN VALOR POR LO QUUE HAY ALGUN COMENTARIO AL QUE SE REPONDIO CON SI PERO SIN CONTENIDO
                                    await Swal.fire({
                                        icon: 'error',
                                        title: 'El apartado para comentar esta vacio'
                                    });
                                    return;
                                }

                                const resulado = await guardarRespuestasServicioLigasDeportivas(id_servicio,respuestasAlumno,comentariosAlumno);
                                if(resulado.success){
                                    await Swal.fire({
                                        icon: 'success',
                                        title: resulado.message,
                                        text: resulado.message,
                                        timer: 1500,
                                        showConfirmButton: false
                                    });
                                    window.location.reload();
                                }else{
                                    await Swal.fire({
                                        icon: 'error',
                                        title: resulado.message,
                                        text: resulado.message,
                                    });
                                }
                            });
                    });
                });

            } catch (error) {
                console.error('Error en ligas deportivas:', error);
            }
        }


        //FUNCION PARA MOSTRAR LA PAGINA DEPENDIENDO DE EN CUAL SE ENCUENTRE ANTERIORMENTE
        function mostrarPagina(tituloModal,pagina) {
            let totalPaginasReales = nombre_servicio == "LA LOMA" ? totalPaginasLoma : nombre_servicio == "LIGAS DEPORTIVAS" ? totalPaginasLigas_Deportivas : totalPaginasR; // SABER EL TOTAL DE PAGINAS EN CASO DE SER LA LOMA O LIGAS DEPORTIVAS
            for (let i = 1; i <= totalPaginasReales; i++) {
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
                // if (totalPaginasReales == 0) { // QUIERE DECIR QUE AUN NO HAY PAGINAS CREADAS EN EL CADO DE LA LOMA Y LIGAS DEPORTIVAS
                //     btnSiguiente.style.display = 'none';
                // }else{
                    btnSiguiente.style.display = (pagina === totalPaginasReales) ? 'none' : 'inline-block';
                // }
            }
        }

        //BOTON DE SIGUIENTE
        btnSiguiente.addEventListener('click', () => {
            let totalPaginasReales = nombre_servicio == "LA LOMA" ? totalPaginasLoma : nombre_servicio == "LIGAS DEPORTIVAS" ? totalPaginasLigas_Deportivas : totalPaginasR; // SABER EL TOTAL DE PAGINAS EN CASO DE SER LA LOMA O LIGAS DEPORTIVAS
            if (paginaActual < totalPaginasReales) {
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

        if(nombre_servicio !== 'LA LOMA' && nombre_servicio !== 'LIGAS DEPORTIVAS') { // EN CASO DE SER UN SERVICIO "NORMAL"
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

                // ALERTA EN CASO DE QUE NO SE SELECCIONE UN PSICOLOGO
                let id_personal = null; // SE DECLARA COMO NULL POR SI NO HAY SELECT 
                const select = document.getElementById('psicologoSelect');
                if (select != null) { // SI ES NULLL QUIERE DECIR QUE ESE SELECT NUNCA SE CREO POR LO QUE NO ES PSICOLOGO
                    id_personal = select.value; // EL VALOR DEL SELECT (id_personal)
                    if(id_personal == 0){
                        await Swal.fire({
                            icon: 'error',
                            title: 'Se debe de elegir un psicologo'
                        });
                        return;
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

                if (comentarioPositivoSeleccionValor == 1 && comentarioServicioPositivo.value == ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                    await Swal.fire({
                        icon: 'error',
                        title: 'El apartado para comentar esta vacio'
                    });
                    return;
                }

                if (comentarioNegativoSeleccionValor == 1 && comentarioServicioNegativo.value == ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO PERO ESTA VACIO POR LO QUE SE ALERTA 
                    await Swal.fire({
                        icon: 'error',
                        title: 'El apartado para comentar esta vacio'
                    });
                    return;
                }

                // EN CASO DE QUE SE ELIJA METER COMENTARIOS METERLOS A EL ARRAY comentariosAlumno 
                if (comentarioPositivoSeleccionValor == 1 && comentarioServicioPositivo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO POSITIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 1,
                        'comentario_servicio': comentarioServicioPositivo.value 
                    });
                }
                
                if (comentarioNegativoSeleccionValor == 1 && comentarioServicioNegativo.value != ''){ // QUIERE DECIR QUE SI TIENE COMENTARIO NEGATIVO Y QUE NO ESTA VACIO EL COMENTARIO
                    comentariosAlumno.push({
                        'tipo_comentario': 0,
                        'comentario_servicio': comentarioServicioNegativo.value 
                    });
                }
                
                console.log('respuestas',respuestasAlumno);
                console.log('comentarios',comentariosAlumno);
                console.log('idservicio',id_servicio);

                const resulado = await guardarRespuestasServicio(id_servicio,respuestasAlumno,comentariosAlumno, id_personal);
                if(resulado.success){
                    await Swal.fire({
                        icon: 'success',
                        title: resulado.message,
                        text: resulado.message,
                        timer: 1500,
                        showConfirmButton: false
                    });
                    window.location.reload();
                }else{
                    await Swal.fire({
                        icon: 'error',
                        title: resulado.message,
                        text: resulado.message,
                    });
                }
            });
        }
        
        mostrarPagina(tituloModal,1);//PARA MOSTRAR LA PRIMER PAGINA Y QUE NO SE MUESTRE LA PAGINA ACTUAL PUES ESTA SE PUEDE QUEDAR GUARDADA COMO 4 AL REALIZAR OTRA EVALUACION ANTES
        modalEvaluacion.show();
    } catch (error) {
        console.error('Error al modal:', error);
    }
}

async function guardarRespuestasServicio(id_servicio,respuestas,comentarios, id_personal){
    try {
        const csrfRes = await fetch('/csrf-token', {
            credentials: 'include'
            });
        const { csrfToken } = await csrfRes.json();

        const res = await fetch('/postRespuestasServicio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                id_servicio,
                respuestas,
                comentarios,
                id_personal
            })
        });
        const data = await res.json();
        return data;
    } catch (error) {
        console.error('Error al llamar el webservice:', error);
    }
}

async function guardarRespuestasServicioLoma(id_servicio,respuestas,comentarios){
    try {
        const csrfRes = await fetch('/csrf-token', {
            credentials: 'include'
            });
        const { csrfToken } = await csrfRes.json();

        const res = await fetch('/postRespuestasServicioLoma', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                id_servicio,
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

async function guardarRespuestasServicioLigasDeportivas(id_servicio,respuestas,comentarios){
    try {
        const csrfRes = await fetch('/csrf-token', {
            credentials: 'include'
            });
        const { csrfToken } = await csrfRes.json();

        const res = await fetch('/postRespuestasServicioLigasDeportivas', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                id_servicio,
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