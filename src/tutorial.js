// Tutorial de bienvenida: lo esencial en un minuto, algunos pasos sobre el plano de verdad

import { mapa } from './mapa.js'
import { minimizarCapas } from './capas.js'
import { abrirDialogo, cerrarDialogo } from './dialogos.js'
import { app } from './app.js'
import { $, esc, guardado } from './util.js'

const PASOS = [
  {
    titulo: '¡Bienvenido al Callejero de Sevilla!',
    texto: 'Te enseño lo esencial en un minuto. En algunos pasos lo pruebas tú mismo, sobre el plano de verdad.',
  },
  {
    titulo: 'Cinco modos de estudio',
    texto: '<b>Explorar</b> para mirar, <b>Aprender</b> barrio a barrio, <b>Practicar</b> con ejercicios, <b>Examen</b> con preguntas oficiales y <b>Grupos</b> para retar a tus compañeros.',
    resaltar: '.pestanas',
    pestana: 'explorar',
  },
  {
    titulo: 'Pruébalo: toca una calle',
    texto: 'Toca cualquier calle del plano y aparecerá su ficha junto a ella: barrio, distrito, cruces, la vista de la calle y la ruta desde el parque de bomberos.',
    esperar: 'calle',
    pestana: 'explorar',
  },
  {
    titulo: 'El buscador',
    texto: 'Busca calles, barrios, lugares o cruces: escribe, por ejemplo, «Sierpes y Campana».',
    resaltar: '#buscador',
  },
  {
    titulo: 'Capas del plano',
    texto: 'El <b>mapa mudo</b> no muestra nombres, como en el examen. Activa los nombres, los distritos y barrios, las flechas de sentido, las carreteras de acceso, los puntos de interés o el <b>satélite PNOA</b> cuando quieras.',
    resaltar: '#capas',
    capas: true,
  },
  {
    titulo: 'Practica sobre el mapa mudo',
    texto: 'Nombrar calles, encontrarlas, calles vecinas, itinerarios desde los parques… Filtra por zona y dificultad, y repasa cada día lo que toca.',
    resaltar: '#panel-practicar',
    pestana: 'practicar',
    salirJuego: true,
  },
  {
    titulo: 'Examen real',
    texto: 'Preguntas de exámenes oficiales del Ayuntamiento de Sevilla, con el mismo formato, tiempo y penalización. Las generadas llevan la marca «no oficial».',
    resaltar: '#panel-examen',
    pestana: 'examen',
  },
  {
    titulo: 'Anotaciones',
    texto: 'Dibuja, mide distancias, escribe y marca sobre el plano. Se quedan guardadas.',
    resaltar: '#boton-anotar',
  },
  {
    titulo: 'Tu progreso',
    texto: 'En <b>Mi cuenta</b> ves tu racha, tus calles dominadas por distrito y un plan diario hasta la fecha del examen. Todo se guarda en este navegador.',
    resaltar: '#boton-cuenta',
  },
  {
    titulo: '¡Listo!',
    texto: 'Empieza por un barrio que conozcas en <b>Aprender</b>. Puedes volver a ver este tutorial desde Mi cuenta.',
    pestana: 'aprender',
  },
]

let tarjeta = null

export function tutorial() {
  guardado.escribir('tutorialVisto', true)
  const d = abrirDialogo(
    `<div class="dialogo-portada"><img src="${import.meta.env.BASE_URL}marca/logo.webp" alt="" width="96" height="96" /></div>
    <div class="dialogo-cuerpo">
      <div class="antetitulo">Tutorial</div>
      <h2>${PASOS[0].titulo}</h2><p>${PASOS[0].texto}</p>
      ${puntos(0)}
    </div>
    <div class="dialogo-pie"><button class="enlace" data-cerrar>Ahora no</button><div class="derecha"><button class="principal" id="tut-empezar">Empezar</button></div></div>`,
  )
  $('#tut-empezar').onclick = () => {
    cerrarDialogo()
    paso(1)
  }
  return d
}

function puntos(i) {
  return `<div class="puntos-pasos">${PASOS.map((_, k) => `<i class="${k === i ? 'activo' : ''}"></i>`).join('')}</div>`
}

function limpiar() {
  document.querySelectorAll('.resaltar-tutorial').forEach((e) => e.classList.remove('resaltar-tutorial'))
  mapa.off('click', alTocarCalle)
}

let alTocarCalle = () => {}

function paso(i) {
  limpiar()
  if (i >= PASOS.length) return cerrar()
  const p = PASOS[i]
  if (p.pestana) app.cambiarPestana(p.pestana)
  if (p.salirJuego) {
    // que el ejercicio no tape la explicación
    $('#pregunta').hidden = true
  }
  if (p.capas) minimizarCapas(false)
  if (p.resaltar) {
    const el = $(p.resaltar)
    if (innerWidth <= 820 && el?.closest('#lateral')) $('#app').classList.add('menu-abierto')
    else if (innerWidth <= 820) $('#app').classList.remove('menu-abierto')
    el?.classList.add('resaltar-tutorial')
  }
  if (!tarjeta) {
    tarjeta = document.createElement('div')
    tarjeta.className = 'tutorial-tarjeta'
    document.body.append(tarjeta)
  }
  tarjeta.innerHTML = `
    <div class="antetitulo">Tutorial · ${i} de ${PASOS.length - 1}</div>
    <h3>${p.titulo}</h3>
    <p>${p.texto}</p>
    ${puntos(i)}
    <div class="dialogo-pie" style="padding:12px 0 0">
      <button class="enlace" id="tut-salir">Salir</button>
      <div class="derecha">${i > 1 ? '<button class="secundario pequeno" id="tut-ant">Atrás</button>' : ''}<button class="principal pequeno" id="tut-sig">${i === PASOS.length - 1 ? 'Terminar' : p.esperar ? 'Saltar' : 'Siguiente'}</button></div>
    </div>`
  tarjeta.hidden = false
  $('#tut-sig').onclick = () => paso(i + 1)
  $('#tut-salir').onclick = cerrar
  if ($('#tut-ant')) $('#tut-ant').onclick = () => paso(i - 1)
  if (p.esperar === 'calle') {
    $('#app').classList.remove('menu-abierto')
    alTocarCalle = () =>
      setTimeout(() => {
        const h = document.querySelector('.ficha-globo .ficha h3')
        if (h) {
          tarjeta.querySelector('p').innerHTML = `¡Eso es! Su ficha ha aparecido junto a la calle: <b>${esc(h.textContent)}</b>. Desde ella puedes verla en Street View o trazar la ruta desde el parque de bomberos.`
          $('#tut-sig').textContent = 'Siguiente'
          mapa.off('click', alTocarCalle)
        }
      }, 400)
    mapa.on('click', alTocarCalle)
  }
}

function cerrar() {
  limpiar()
  if (tarjeta) tarjeta.hidden = true
  if (innerWidth <= 820) $('#app').classList.remove('menu-abierto')
}
