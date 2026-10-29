# Callejero de Sevilla

Web para estudiar el callejero de Sevilla para la oposición de bombero **sobre el plano**: mapa mudo, ejercicios, test con preguntas de exámenes oficiales, rutas desde los parques de bomberos y progreso guardado en el navegador.

Inspirada en el estilo, los apartados y las interacciones de [callejerosevilla.es](https://callejerosevilla.es/): portada sobre el mapa, panel lateral con **Explorar · Aprender · Practicar · Examen · Grupos**, ventana de **Capas**, buscador, anotaciones y tutorial.

## Apartados

| Pestaña | Qué hace |
| --- | --- |
| **Explorar** | Distritos → barrios → calles. Ficha de cada calle: barrio(s), distrito, longitud, tramos peatonales y de sentido único, calles en las que acaba, cruces, paralelas, perpendiculares, lugares de interés y **ruta desde cada parque de bomberos** respetando el sentido de circulación. Buscador de calles, barrios, lugares y **cruces** («Sierpes y Campana»). |
| **Aprender** | Barrio a barrio por niveles de 5 calles: primero las ves, después las buscas (3 aciertos cada una), entran repasos de niveles anteriores y al final un repaso del barrio fija tu marca. |
| **Practicar** | ¿Qué calle es? · Elige la respuesta · ¿Dónde está? · ¿En qué barrio está? · Calles vecinas · Calles a ciegas · Traza la ruta · Itinerario · Lugares de interés. Filtros por zona, dificultad, repaso de hoy (repetición espaciada), falladas y vías principales. Duelo en directo para 2–6 jugadores en el mismo dispositivo. |
| **Examen** | Examen real (60 preguntas, 10 de reserva, 60 min, cada fallo resta ⅓, sin mapa), Contrarreloj 60 s con récord, Mis preguntas (crear, exportar, importar) y Test a tu medida (número, origen oficial/generado, zona, tipos, corrección, penalización, fallos máximos, tiempo…). Tests a medias guardados y revisión con «Ver en el mapa». |
| **Grupos** | Retos por enlace: todos reciben exactamente las mismas preguntas (semilla en el enlace) y comparan nota. |

Además: capas (mapa mudo, nombres, distritos, barrios, peatonales, sentido de circulación, **satélite PNOA**, relieve 3D, puntos de interés, polígonos industriales), vista 3D de edificios, anotaciones (dibujar, medir, escribir, marcar), Mi cuenta (racha, dominadas por distrito, plan diario hasta la fecha del examen, tema claro/oscuro, copia de seguridad) y diseño adaptado a móvil.

## Fuentes de datos

Todo se genera con `scripts/preparar_datos.py` a partir de fuentes oficiales y abiertas:

- **Callejero Digital de Andalucía Unificado (CDAU)**, Junta de Andalucía — CC BY 4.0. Viales (nombre normalizado, código INE de vía) y tramos con topología del municipio 41091 vía WFS.
- **Cartografía de manzanas**, Dirección General del Catastro — descarga INSPIRE CadastralZoning (nivel MANZANA) del municipio 41900.
- **Distritos, barrios, término municipal, parques de bomberos y equipamientos**, Ayuntamiento de Sevilla — datos abiertos de ide.SEVILLA.
- **Ortofoto PNOA**, Instituto Geográfico Nacional — CC BY 4.0, servida directamente desde su WMTS.
- **Mapa base**, colaboradores de OpenStreetMap (ODbL) y Protomaps — extracto PMTiles de Sevilla; también da las flechas de sentido de circulación, las calles peatonales, las carreteras de acceso (con su titularidad: Estado, Junta o Diputación) y estaciones, universidades y estadios.

El plano se limita a los 11 distritos de Sevilla: lo que queda fuera se tapa y no se puede salir de la ciudad.
- **Preguntas de examen**: cuestionario y plantillas (provisional y definitiva) del segundo ejercicio de la convocatoria de 67 plazas de bombero/a del Ayuntamiento de Sevilla (22/01/2026), documentos públicos. Se respetan las anulaciones de la plantilla definitiva. Las preguntas generadas con calles reales llevan la marca «no oficial».

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/ (web estática, se puede publicar en cualquier hosting)
```

### Publicación

El flujo `.github/workflows/pages.yml` construye la web y la publica en GitHub Pages en cada push a `main`. Hay que activarlo una vez en **Settings → Pages → Source: GitHub Actions**. La web quedará en `https://<usuario>.github.io/Callejero-de-sevilla/`.

### Regenerar los datos

```bash
pip install pyproj shapely mapbox-vector-tile lxml   # y pdftotext (poppler-utils)
go install github.com/protomaps/go-pmtiles@latest   # solo si hay que volver a extraer el mapa base
npm run datos                                       # descarga lo que falte en datos-fuente/ y escribe public/datos/
python3 scripts/preparar_datos.py --refrescar       # fuerza a descargar todo de nuevo
```

Para añadir otro examen oficial, añade sus tres PDF (cuestionario y plantillas) a la lista `EXAMENES` del script.

## Cuentas

Cada persona puede crear su cuenta (nombre, correo y contraseña) y tiene su progreso por separado.

- **Sin configurar nada**, las cuentas se guardan en el dispositivo (contraseña cifrada con PBKDF2). Sirve para compartir un ordenador o una tablet; para pasar el progreso a otro dispositivo se usa «Exportar copia».
- **Con Supabase** (gratis), las cuentas son reales y el progreso se sincroniza entre dispositivos. Crea un proyecto en supabase.com, ejecuta este SQL y define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables del repositorio (Settings → Secrets and variables → Actions → Variables):

```sql
create table progreso (
  user_id uuid primary key references auth.users on delete cascade,
  datos jsonb not null,
  actualizado timestamptz default now()
);
alter table progreso enable row level security;
create policy "cada uno lo suyo" on progreso for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Privacidad

Sin Supabase no hay servidor: el progreso, las anotaciones, las preguntas propias y los ajustes se guardan en el `localStorage` del navegador y se pueden exportar o borrar desde «Mi cuenta».
