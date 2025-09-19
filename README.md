# Parallax Depth Cards

Galería de tarjetas con efecto 3D (tilt/parallax) hecha con Vue 2.

## Estructura
- `index.html`: HTML base, incluye Vue y monta la app.
- `style.css`: Estilos del layout, cards, modal y galería.
- `app.js`: Lógica Vue (cards, modal, galería, tilt).
- `assets/`: Imágenes, íconos y manifest.

## Uso
1. Abre `index.html` en un navegador moderno.
2. Pasa el mouse sobre las cards para ver el efecto 3D.
3. Haz clic en una card para abrir el modal; cierra con X, clic fuera o ESC.
4. En el modal, puedes importar imágenes a la galería (input o drag & drop).

## Convenciones
- Sin hacks de eventos: el hover 3D funciona con `mouseenter/mousemove/mouseleave` nativos.
- Cierre del modal minimalista: limpieza de estado sin tocar `pointer-events` globales.
- Precarga de GIFs: verificación ligera para alternar entre imagen y GIF si existe.

## Notas de mantenimiento
- Si cambias el tamaño de las cards, `measure()` recalcula dimensiones al `mouseenter` y en `resize`.
- La galería revoca `blob:` URLs al cerrar el modal para evitar fugas de memoria.
- Si el tilt no responde tras cerrar el modal, mueve ligeramente el mouse para generar `mousemove`.
