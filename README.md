# Halloween para tu comunidad 🎃

La web de la fiesta de Halloween de tu comunidad de vecinos, **en tu propio GitHub y con tus datos en tu propia hoja de Google**. Gratis.

- **Recorrido de truco o trato** con las puertas que reparten chuches y un **juego de acertijos** para encontrarlas.
- Para **edificios** (portales, pisos y letras) o **casas** (calles y números).
- **Panel del gestor** (`admin.html`): fecha y hora, tipo de urbanización, portales o calles, quién reparte, enlace y **QR** para el cartel.
- **Inscripción de peques**: cada familia se apunta y recibe un enlace privado para cambiarla o borrarla.
- Español e inglés. Sin dependencias, sin compilación, sin cookies de seguimiento.

**Demo:** https://aluonam.github.io/halloween-mi-comunidad/ (gestor: [admin.html](https://aluonam.github.io/halloween-mi-comunidad/admin.html), clave `demo`; también [casas](https://aluonam.github.io/halloween-mi-comunidad/?layout=houses)).

Necesitas una **cuenta de Google** y una **cuenta de GitHub** (gratis). Son unos 15 minutos, una sola vez.

---

## 1. Tu hoja de Google (≈ 10 min)

Aquí se guardan los datos de tu comunidad: ajustes, puertas y peques. Solo tú tienes acceso.

1. En Google Drive: **Nuevo → Hojas de cálculo de Google**. Ponle nombre, p. ej. `Halloween · Mi comunidad`.
2. **Extensiones → Apps Script**. Borra lo que haya y pega entero el archivo [`apps-script/Code.gs`](apps-script/Code.gs). Guarda (💾) y cierra esa pestaña.
3. **Recarga la hoja**. Aparece el menú **🎃 Halloween**:
   - **🎃 Halloween → 1. Activar la hoja**. Google pedirá permisos: *Continuar* → tu cuenta → *Configuración avanzada → Ir a… → Permitir* (es tu propio script).
   - **🎃 Halloween → Cambiar la clave del gestor**: elige la clave con la que entrarás al panel (mín. 6 caracteres).
4. **Extensiones → Apps Script → Implementar → Nueva implementación → ⚙️ Aplicación web**:
   - Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier usuario** → **Implementar**.
   - Copia la **URL de la aplicación web** (acaba en `/exec`).

## 2. Tu web en GitHub (≈ 3 min)

1. Arriba a la derecha de este repositorio: **Fork → Create fork**. Tendrás tu copia en `tu-usuario/halloween-mi-comunidad`.
2. En **tu** copia, pestaña **Actions** → **I understand my workflows, go ahead and enable them**.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Pestaña **Code → Add file → Create new file**:
   - Nombre: `comunidad.json`
   - Contenido (con **tu** URL del paso 1.4):
     ```json
     {
       "hoja": "https://script.google.com/macros/s/…/exec"
     }
     ```
   - **Commit changes**.

En un par de minutos tu web estará en **`https://tu-usuario.github.io/halloween-mi-comunidad/`**
(puedes seguir el progreso en la pestaña **Actions**).

## 3. Configura la fiesta

Entra en **`…/admin.html`** con tu clave de gestor:

- **⚙️ Configuración**: nombre de la comunidad, día y hora, minifiesta, WhatsApp, **edificios o casas** (nº de portales, pisos, bajo, letras, calles…).
- **Quién reparte**: toca las ventanas de los portales (o añade casas) de los vecinos que reparten. Pulsa **💾 Guardar**.
- **Tu web**: copia el enlace o descarga el **QR** para el cartel del portal.

Los vecinos que quieran repartir te lo piden a ti; las familias apuntan a sus peques desde la web.
Otro año: **Configuración → Empezar nueva edición** vacía puertas y peques y conserva lo demás.

---

## Actualizaciones

Tu copia se actualiza **sola cada noche** con las mejoras de este proyecto (la tarea «Publicar» de la pestaña Actions). Tus datos no se tocan: están en tu hoja y en `comunidad.json`, que este proyecto no tiene.

- Si en **Actions** ves un aviso «No se pudo actualizar sola», entra en tu repositorio y pulsa **Sync fork → Update branch**.
- GitHub pausa las tareas diarias si un repositorio pasa 60 días sin cambios; te avisará por correo y se reactivan con un clic.
- Si una mejora cambia `apps-script/Code.gs`, lo verás en las novedades del proyecto: pega el nuevo archivo en tu Apps Script y haz **Implementar → Gestionar implementaciones → ✏️ → Versión: nueva → Implementar** (la URL no cambia).

## Preguntas

- **¿He olvidado la clave del gestor?** En tu hoja: **🎃 Halloween → Cambiar la clave del gestor**.
- **¿Dónde están los datos?** En tu hoja de Google (pestañas `ajustes`, `puertas` y `peques`). Puedes verlos, exportarlos o borrarlos cuando quieras. Al acabar la fiesta, borra las filas de `peques`.
- **¿Puedo cambiar textos o colores?** Textos en `js/i18n.js`, colores en `css/base.css`. Ojo: si cambias archivos del proyecto, la actualización automática puede chocar con tus cambios y tendrás que resolverlo a mano.
- **¿Y sin GitHub?** Pide una invitación a quien te pasó esto: también existe una versión alojada en la que solo necesitas tu hoja de Google.

## Estructura

```
index.html · admin.html · privacidad.html
comunidad.json          (lo creas tú) URL de tu hoja
apps-script/Code.gs     "servidor" de tu hoja de Google
.github/workflows/      publicación en Pages y actualización diaria
js/                     api.js (conexión con tu hoja y demo) · layouts/ (portales y casas) · sections/ · admin.js · i18n.js …
css/ · fonts/ · js/vendor/ (QR, MIT)
```
