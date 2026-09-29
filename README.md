# DAM

Una web pensada para que los alumnos del curso de DAM tengan sus apuntes, horario, calendario, búsquedas y trabajo del día a día en un solo sitio.

## Cómo usarlo

Abre la página en:

https://gtalex1.github.io/DAM/

Desde ahí puedes:

- leer los apuntes del curso
- navegar por asignaturas y temas
- buscar contenido rápido
- añadir archivos favoritos
- usar el horario del curso
- llevar tu calendario personal con tareas
- iniciar sesión para guardar cambios y personalizar la página

### Iniciar sesión

Para entrar, pulsa en "Acceder" y usa tu usuario IDEA (el mismo usuario de iPASEN o Moodle).

- Usuario: tu usuario IDEA
- Contraseña: la que tú elijas

**Importante:** si olvidas la contraseña, no se puede recuperar la cuenta. Tienes que recordarla bien.

La idea es que cada alumno use su propia cuenta para guardar su trabajo y no mezclarlo con el de otros.

### Qué puedes hacer una vez dentro

Cuando estés logueado podrás:

- subir tus propios archivos
- modificar o añadir contenido dentro de la web
- apuntar en el horario las clases o horas que te han convalidado
- usar el calendario como agenda personal para tareas, exámenes y recordatorios
- dejar marcados los archivos o temas que más te interesen

---

## Qué es esta página

Es una especie de cuaderno digital para clase, con una interfaz parecida a un editor de código o a un IDE.

La idea no es solo leer apuntes, sino que también sirva como herramienta de estudio y organización del curso:

- ver apuntes por temas
- buscar información rápido
- tener el horario a mano
- llevar un calendario personal
- compartir materiales dentro del entorno del curso
- personalizar la experiencia con tu cuenta

---

## Información técnica

### Tecnologías utilizadas

- **HTML / CSS / JavaScript** para la interfaz
- **Marked.js** para renderizado de Markdown
- **Highlight.js** para resaltado de código
- **Firebase** para autenticación de usuarios
- **Cloudinary** para subida y almacenamiento de archivos
- **GitHub Pages** para el despliegue

### Estructura del proyecto

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── calendario.js
│   ├── calendario.js
│   ├── ejercicios-pseint.js
│   ├── firebase-init.js
│   ├── github-source.js
│   ├── horario-cuenta.js
│   ├── horario.js
│   ├── unidad1.js
│   └── unidadesMedida.js
├── DAM/
│   └── 1-DAM/
│       ├── Bases-de-Datos/
│       ├── Digitalización/
│       ├── Entornos-de-Desarrollo/
│       ├── Lenguajes-de-Marcas/
│       ├── Programacion/
│       ├── Sistemas-Informaticos/
│       ├── calendario.html
│       └── horario.html
└── README.md
```

### Asignaturas incluidas

- Bases de Datos
- Digitalización
- Entornos de Desarrollo
- Lenguajes de Marcas
- Programación (Java, Pseint, etc.)
- Sistemas Informáticos

### Ejecución local

Si quieres ejecutar la web en tu máquina local:

```bash
python -m http.server 8000
```

Luego abre en el navegador:

```text
http://localhost:8000/
```

Si se despliega en un servidor con una ruta base diferente, asegúrate de que la estructura de rutas de assets y archivos HTML se mantiene consistente.

### Configuración necesaria

Para que funcione correctamente, necesitas:

1. **Firebase** configurado con autenticación de usuarios
2. **Cloudinary** configurado para subida de archivos
3. La estructura de carpetas con los apuntes en `DAM/1-DAM/`

---

## Objetivo

Que los alumnos puedan tener una herramienta útil, clara y rápida para estudiar y organizar su curso sin tener que depender de documentos dispersos por internet o por otros sitios.
