# dam-notes

Tus apuntes de DAM en forma de "editor VS Code" navegable, listo para GitHub Pages.

## Estructura del proyecto

```
dam-notes/
├── index.html        ← la interfaz (no tocar salvo que quieras cambiar el layout)
├── styles.css         ← el tema visual
├── app.js             ← construye el árbol, pestañas, render de markdown y drag&drop
├── firebase-init.js    ← conexión con Firebase Auth + Firestore (login y orden guardado)
├── firestore.rules     ← reglas de seguridad: lectura pública, escritura solo tu UID
├── manifest.json       ← EL ÍNDICE: qué carpetas/archivos aparecen en el explorador
└── content/
    ├── README.md
    ├── 1-DAM/
    │   ├── Programacion/*.md
    │   ├── Bases-de-Datos/*.md
    │   ├── Sistemas-Informaticos/*.md
    │   ├── Lenguajes-de-Marcas/*.md
    │   └── Entornos-de-Desarrollo/*.md
    └── 2-DAM/
        ├── Acceso-a-Datos/*.md
        ├── Desarrollo-de-Interfaces/*.md
        ├── Programacion-Multimedia-y-Moviles/*.md
        ├── Programacion-de-Servicios-y-Procesos/*.md
        └── Sistemas-de-Gestion-Empresarial/*.md
```

## Cómo añadir un apunte nuevo

1. Escribe el `.md` dentro de la carpeta del módulo correspondiente (en `content/...`).
2. Abre `manifest.json` y añade una entrada como esta, en el sitio del árbol que corresponda:
   ```json
   { "name": "04-excepciones.md", "type": "file", "path": "content/1-DAM/Programacion/04-excepciones.md", "lang": "markdown" }
   ```
3. Commit + push. Ya está en la web.

Si quieres una carpeta/asignatura nueva, añade un bloque `{ "name": "...", "type": "folder", "children": [...] }` al nivel que corresponda.

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

Los archivos se cargan con `fetch()`, así que **no funciona abriendo `index.html` directamente con doble clic** (el navegador bloquea `fetch` sobre `file://`). Necesitas un servidor local, por ejemplo:

```bash
# Con Python (ya lo tienes si has instalado DAM en tu máquina)
python3 -m http.server 8000
# abre http://localhost:8000
```

O con la extensión **Live Server** de VS Code (clic derecho sobre `index.html` → "Open with Live Server") — queda temático usar VS Code para editar una web que imita VS Code.

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
