# dam-notes

Tus apuntes de DAM en forma de "editor VS Code" navegable, listo para GitHub Pages.

## Estructura del proyecto

```
dam-notes/
├── index.html          ← la interfaz (no tocar salvo que quieras cambiar el layout)
├── styles.css           ← el tema visual
├── app.js               ← construye el árbol, pestañas, render y drag&drop
├── github-source.js      ← lee la carpeta DAM/ en vivo desde la API de GitHub
├── firebase-init.js      ← conexión con Firebase Auth + Firestore (login y orden guardado)
├── firestore.rules       ← reglas de seguridad: lectura pública, escritura solo tu UID
└── DAM/                  ← AQUÍ van tus apuntes. Todo lo que metas aquí aparece solo.
    ├── 1-DAM/
    │   ├── Programacion/*.html o *.md
    │   ├── Bases-de-Datos/*.html o *.md
    │   └── ...
    └── 2-DAM/
        └── ...
```

## Cómo añadir un apunte nuevo

**Ya no hay manifest que editar.** La web lee la carpeta `DAM/` del repositorio en tiempo real, usando la API de GitHub. Solo tienes que:

1. Crear la carpeta/subcarpeta que quieras dentro de `DAM/` (si no existe ya).
2. Meter dentro tu archivo `.html` o `.md`.
3. Commit + push.
4. Recargar la web — el archivo aparece automáticamente en el explorador, en el sitio que le toque por orden alfabético (a menos que ya hayas reordenado esa carpeta a mano, ver más abajo).

No hace falta tocar `index.html`, `app.js` ni ningún índice.

### Formatos soportados
- **`.html`**: se muestra tal cual, dentro de un iframe — el archivo controla su propio estilo. Tienes una plantilla de referencia en `DAM/1-DAM/Programacion/00-ejemplo-plantilla.html`, cópiala como punto de partida.
- **`.md`**: se renderiza como Markdown con el mismo tema oscuro del resto de la web (código con resaltado de sintaxis, tablas, etc.).

### Sobre la API de GitHub
La lectura dinámica usa la API pública de GitHub (`api.github.com`), que tiene un límite de 60 peticicones/hora por IP sin autenticación (la web hace 2 peticiones por visita). Para un proyecto personal de apuntes es más que suficiente; si algún día tuvieras muchísimo tráfico, se podría añadir caché o un token, pero no hace falta ahora.

### Detección del repositorio
La web detecta automáticamente tu usuario y repositorio a partir de la URL de GitHub Pages (`https://tu-usuario.github.io/tu-repo/`). Si alguna vez pruebas con un dominio propio o en local sin ese patrón de URL, añade `?owner=TU-USUARIO&repo=TU-REPO` al final de la URL.

## Configurar el login (Firebase) — necesario antes de publicar

El modo edición (arrastrar carpetas/archivos para reordenarlos) usa Firebase Authentication + Firestore. Pasos:

1. **Crea tu usuario**: Firebase Console → tu proyecto (`damm-29df1`) → *Authentication* → pestaña *Sign-in method* → activa el proveedor **Email/Password**. Luego en la pestaña *Users* → *Add user*, con el correo y contraseña que quieras usar para entrar.
2. **Copia tu UID**: en esa misma tabla de *Users*, copia el valor de la columna **User UID** de tu usuario recién creado.
3. **Pégalo en dos sitios**:
   - `firebase-init.js` → constante `AUTHORIZED_UID`.
   - `firestore.rules` → sustituye `REPLACE_WITH_YOUR_UID` por el mismo UID.
4. **Crea la base de datos**: Firebase Console → *Firestore Database* → *Create database* → modo producción (cualquier región).
5. **Sube las reglas**: pestaña *Rules* de Firestore → pega el contenido de `firestore.rules` → *Publish*.

Con esto, cualquier visitante puede **leer** la web con normalidad, pero solo tú (con ese usuario y contraseña) puedes iniciar sesión desde el icono de la persona en la barra de actividad y arrastrar carpetas/archivos para reordenarlos. El orden se guarda en Firestore y se aplica a todos los visitantes automáticamente.

> Nota: como `app.js` ahora usa `import`, el navegador necesita cargarlo por `http(s)://`, no con doble clic sobre el archivo. GitHub Pages ya sirve así por defecto, así que en producción no cambia nada.

## Probarlo en local

Como ahora los apuntes se leen desde GitHub (no desde tu disco), para probarlo en local necesitas que el repositorio **ya esté subido a GitHub** (con al menos la carpeta `DAM/`), y servir estos archivos con un servidor local apuntando a ese repo:

```bash
python3 -m http.server 8000
# abre: http://localhost:8000/?owner=TU-USUARIO&repo=TU-REPO
```

Si no tienes Python, la extensión **Live Server** de VS Code funciona igual (clic derecho sobre `index.html` → "Open with Live Server"), añadiendo el mismo `?owner=...&repo=...` a la URL que abra.

Una vez publicado en GitHub Pages, esos parámetros ya no hacen falta — se detectan solos desde la URL.

## Publicarlo en GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo `apuntes-dam`.
2. Sube todo el contenido de esta carpeta a la raíz del repo:
   ```bash
   git init
   git add .
   git commit -m "Primeros apuntes de DAM"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/apuntes-dam.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Source → Deploy from a branch → main / (root)** → Save.
4. En un par de minutos tu web estará en `https://TU-USUARIO.github.io/apuntes-dam/`.

Cada vez que hagas `git push` con nuevos apuntes, la web se actualiza sola.

## Personalizar

- **Colores**: todo el tema vive en las variables `:root` al principio de `styles.css` (son los mismos nombres/valores que el tema Dark+ real de VS Code, así que puedes intercambiarlos por otro tema si prefieres, p. ej. Monokai o One Dark).
- **Icono/pestaña del navegador**: cambia el `<link rel="icon">` en `index.html`.
- **Buscador de archivos**: de momento el icono de la lupa en la barra de actividad es decorativo; si te curras el proyecto, sería el siguiente paso lógico a implementar en `app.js`.
