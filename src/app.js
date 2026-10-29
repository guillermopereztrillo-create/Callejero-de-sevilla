// Estado compartido entre pestañas

export const app = {
  pestana: 'explorar',
  /** Ejercicio o test en curso: mientras lo hay, tocar el plano es responder. */
  juego: null,
  cambiarPestana: () => {},
  cerrarMenuMovil: () => {},
}
