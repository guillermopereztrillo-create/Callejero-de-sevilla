// Cuentas: cada persona con su progreso.
//  · Con Supabase configurado (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY) las cuentas son reales:
//    correo y contraseña, y el progreso se sincroniza entre dispositivos.
//  · Sin configurar, las cuentas se crean en este dispositivo (nombre, correo y contraseña cifrada),
//    útil para compartir el ordenador o la tablet con otros opositores.

import { abrirDialogo, cerrarDialogo, confirmar } from './dialogos.js'
import { $, esc, guardado, aviso, debounce } from './util.js'

const URL_NUBE = import.meta.env.VITE_SUPABASE_URL
const CLAVE_NUBE = import.meta.env.VITE_SUPABASE_ANON_KEY
export const nubeActiva = !!(URL_NUBE && CLAVE_NUBE)

let cliente = null
async function nube() {
  if (!nubeActiva) return null
  if (!cliente) {
    const { createClient } = await import('@supabase/supabase-js')
    cliente = createClient(URL_NUBE, CLAVE_NUBE, { auth: { persistSession: true, storageKey: 'callejero.nube' } })
  }
  return cliente
}

const cuentas = () => guardado.leer('cuentas', [])

/** La cuenta con la que se está estudiando, o null si no hay sesión. */
export function sesion() {
  if (!guardado.cuenta) return null
  return cuentas().find((c) => c.id === guardado.cuenta) || null
}

async function cifrar(clave, sal) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(sal), iterations: 120000, hash: 'SHA-256' }, base, 256)
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Activa una cuenta: copia (si se pide) el progreso sin cuenta y recarga para usar su espacio. */
function activar(cuenta, { copiarAnonimo = false } = {}) {
  const lista = cuentas().filter((c) => c.id !== cuenta.id)
  lista.push(cuenta)
  guardado.escribir('cuentas', lista)
  if (copiarAnonimo) guardado.volcar(guardado.todo('callejero.'), cuenta.id)
  // el nombre de la cuenta es el que aparece en los retos
  const pre = `callejero.u.${cuenta.id}.`
  try {
    const p = JSON.parse(localStorage.getItem(pre + 'progreso') || '{}')
    if (!p.nombre) {
      p.nombre = cuenta.nombre
      localStorage.setItem(pre + 'progreso', JSON.stringify(p))
    }
    localStorage.setItem('callejero.cuentaActiva', JSON.stringify(cuenta.id))
  } catch {}
  location.reload()
}

export async function cerrarSesion() {
  if (nubeActiva && sesion()?.tipo === 'nube') {
    await subirAhora()
    await (await nube()).auth.signOut()
  }
  try {
    localStorage.removeItem('callejero.cuentaActiva')
  } catch {}
  location.reload()
}

const hayProgresoSinCuenta = () => Object.keys(guardado.todo('callejero.')).some((k) => ['progreso', 'historial', 'misPreguntas', 'anotaciones'].includes(k))

/** Diálogo de acceso: crear cuenta o entrar. */
export function abrirAcceso(modo = 'crear') {
  const locales = cuentas().filter((c) => c.tipo === 'local')
  const d = abrirDialogo(
    `<div class="dialogo-portada"><img src="${import.meta.env.BASE_URL}marca/logo.webp" alt="" width="84" height="84" /></div>
    <div class="dialogo-cuerpo">
      <div class="seg-fino" id="acceso-modo"><button type="button" data-m="crear">Crear cuenta</button><button type="button" data-m="entrar">Ya tengo cuenta</button></div>
      <form id="acceso-form" autocomplete="on">
        <h2 id="acceso-titulo" style="margin-top:16px"></h2>
        <p id="acceso-texto"></p>
        <div id="campo-nombre"><label for="acceso-nombre">Nombre</label><input type="text" id="acceso-nombre" autocomplete="name" maxlength="30" /></div>
        <label for="acceso-correo">Correo electrónico</label><input type="email" id="acceso-correo" autocomplete="email" required />
        <label for="acceso-clave">Contraseña</label><input type="password" id="acceso-clave" autocomplete="current-password" minlength="6" required />
        <div id="campo-copiar" ${hayProgresoSinCuenta() ? '' : 'hidden'}><label class="interruptor" style="margin-top:12px"><input type="checkbox" id="acceso-copiar" checked /><i></i>Guardar en la cuenta lo que ya has estudiado sin cuenta</label></div>
        <p class="nota" id="acceso-error" style="color:var(--error)"></p>
        ${!nubeActiva && locales.length ? `<p class="nota">Cuentas en este dispositivo: ${locales.map((c) => esc(c.nombre)).join(', ')}</p>` : ''}
        <p class="nota">${nubeActiva ? 'Tu progreso se guarda en tu cuenta y lo tendrás en cualquier dispositivo.' : 'Las cuentas se guardan en este dispositivo: cada persona tiene su progreso por separado. Para llevarlo a otro, usa «Exportar copia» en Mi cuenta.'}</p>
      </form>
    </div>
    <div class="dialogo-pie">
      <button class="enlace" type="button" data-cerrar>Seguir sin cuenta</button>
      ${nubeActiva ? '<button class="enlace" type="button" id="acceso-olvido">He olvidado la contraseña</button>' : ''}
      <div class="derecha"><button class="principal" id="acceso-ok">Crear cuenta</button></div>
    </div>`,
  )
  const pintar = () => {
    d.querySelectorAll('#acceso-modo button').forEach((b) => b.classList.toggle('activo', b.dataset.m === modo))
    const crear = modo === 'crear'
    $('#acceso-titulo').textContent = crear ? 'Crea tu cuenta gratis' : 'Entra en tu cuenta'
    $('#acceso-texto').textContent = crear ? 'Guarda tu racha, tus repasos, tus anotaciones y tus preguntas, y reta a tus amigos con tu nombre.' : 'Sigue donde lo dejaste.'
    $('#campo-nombre').hidden = !crear
    $('#acceso-nombre').required = crear
    $('#acceso-clave').autocomplete = crear ? 'new-password' : 'current-password'
    $('#acceso-ok').textContent = crear ? 'Crear cuenta' : 'Entrar'
    $('#acceso-error').textContent = ''
  }
  d.querySelector('#acceso-modo').onclick = (e) => {
    const b = e.target.closest('[data-m]')
    if (!b) return
    modo = b.dataset.m
    pintar()
  }
  const enviar = async () => {
    const f = $('#acceso-form')
    if (!f.reportValidity()) return
    const datos = { nombre: $('#acceso-nombre').value.trim(), correo: $('#acceso-correo').value.trim().toLowerCase(), clave: $('#acceso-clave').value, copiar: $('#acceso-copiar')?.checked }
    $('#acceso-ok').disabled = true
    try {
      if (nubeActiva) await accesoNube(modo, datos)
      else await accesoLocal(modo, datos)
    } catch (err) {
      $('#acceso-error').textContent = err.message
    } finally {
      const b = $('#acceso-ok')
      if (b) b.disabled = false
    }
  }
  $('#acceso-ok').onclick = enviar
  $('#acceso-form').onsubmit = (e) => {
    e.preventDefault()
    enviar()
  }
  if ($('#acceso-olvido'))
    $('#acceso-olvido').onclick = async () => {
      const correo = $('#acceso-correo').value.trim()
      if (!correo) return ($('#acceso-error').textContent = 'Escribe tu correo y vuelve a pulsar.')
      await (await nube()).auth.resetPasswordForEmail(correo, { redirectTo: location.origin + location.pathname })
      aviso('Te hemos enviado un correo para cambiar la contraseña')
    }
  pintar()
}

async function accesoLocal(modo, { nombre, correo, clave, copiar }) {
  const lista = cuentas()
  const existe = lista.find((c) => c.tipo === 'local' && c.correo === correo)
  if (modo === 'crear') {
    if (existe) throw new Error('Ya hay una cuenta con ese correo en este dispositivo. Pulsa «Ya tengo cuenta».')
    const sal = crypto.getRandomValues(new Uint32Array(4)).join('-')
    const cuenta = { id: 'l' + Date.now().toString(36), tipo: 'local', nombre, correo, sal, hash: await cifrar(clave, sal), creada: new Date().toISOString() }
    cerrarDialogo()
    activar(cuenta, { copiarAnonimo: copiar })
  } else {
    if (!existe || (await cifrar(clave, existe.sal)) !== existe.hash) throw new Error('El correo o la contraseña no son correctos.')
    cerrarDialogo()
    activar(existe)
  }
}

async function accesoNube(modo, { nombre, correo, clave, copiar }) {
  const sb = await nube()
  if (modo === 'crear') {
    const { data, error } = await sb.auth.signUp({ email: correo, password: clave, options: { data: { nombre }, emailRedirectTo: location.origin + location.pathname } })
    if (error) throw new Error(traducir(error.message))
    if (!data.session) {
      cerrarDialogo()
      guardado.escribir('copiarAlConfirmar', !!copiar)
      return abrirDialogo(
        `<div class="dialogo-cuerpo"><div class="antetitulo">Casi está</div><h2>Confirma tu correo</h2><p>Te hemos enviado un enlace a <b>${esc(correo)}</b>. Ábrelo y vuelve aquí para entrar con tu contraseña.</p></div><div class="dialogo-pie"><div class="derecha"><button class="principal" data-cerrar>Entendido</button></div></div>`,
      )
    }
    cerrarDialogo()
    return entrarNube(data.user, copiar)
  }
  const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: clave })
  if (error) throw new Error(traducir(error.message))
  cerrarDialogo()
  return entrarNube(data.user, guardado.leer('copiarAlConfirmar', false))
}

function traducir(m) {
  if (/invalid login/i.test(m)) return 'El correo o la contraseña no son correctos.'
  if (/already registered/i.test(m)) return 'Ya existe una cuenta con ese correo. Pulsa «Ya tengo cuenta».'
  if (/email not confirmed/i.test(m)) return 'Antes tienes que confirmar el correo con el enlace que te enviamos.'
  if (/password/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.'
  return m
}

/** Tras entrar con la nube: trae el progreso guardado (si es más reciente) y activa la cuenta. */
async function entrarNube(user, copiar) {
  const sb = await nube()
  const id = 'n' + user.id.replace(/-/g, '').slice(0, 16)
  const cuenta = { id, tipo: 'nube', uid: user.id, nombre: user.user_metadata?.nombre || user.email.split('@')[0], correo: user.email }
  const { data } = await sb.from('progreso').select('datos, actualizado').eq('user_id', user.id).maybeSingle()
  if (data?.datos) guardado.volcar(data.datos, id)
  guardado.borrar('copiarAlConfirmar')
  activar(cuenta, { copiarAnonimo: copiar && !data?.datos })
}

// ---------------------------------------------------------------- sincronización

async function subirAhora() {
  const c = sesion()
  if (!nubeActiva || c?.tipo !== 'nube') return
  const sb = await nube()
  const { data } = await sb.auth.getSession()
  if (!data.session) return
  await sb.from('progreso').upsert({ user_id: c.uid, datos: guardado.todo(), actualizado: new Date().toISOString() })
}

/** Al arrancar: si hay sesión en la nube, sube los cambios cada pocos segundos. */
export async function iniciarCuentas() {
  const c = sesion()
  if (!nubeActiva) return
  const sb = await nube()
  const { data } = await sb.auth.getSession()
  if (c?.tipo === 'nube' && !data.session) {
    // la sesión caducó: se sigue estudiando en local hasta volver a entrar
    aviso('Tu sesión ha caducado: vuelve a entrar para sincronizar el progreso', 5000)
    return
  }
  if (!c && data.session) return entrarNube(data.session.user, false)
  if (c?.tipo === 'nube') {
    const subir = debounce(() => subirAhora().catch(() => {}), 4000)
    guardado.alEscribir = subir
    addEventListener('pagehide', () => subirAhora())
  }
}

export async function cambiarCuenta() {
  if (await confirmar('¿Cambiar de cuenta?', 'Se cerrará la sesión actual en este dispositivo. Tu progreso queda guardado en tu cuenta.', 'Cambiar', 'Cancelar')) {
    await cerrarSesion()
  }
}
