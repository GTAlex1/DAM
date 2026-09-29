# Apuntes DAM

Repositorio de apuntes y recursos para el ciclo formativo de Desarrollo de Aplicaciones Multiplataforma (DAM). La página está diseñada como una experiencia tipo editor de código, con un árbol de archivos, búsqueda, favoritos y visualización de contenidos en formato HTML/Markdown.

## Descripción

Este proyecto consiste en una web estática que funciona como un cuaderno de clase digital para consultar apuntes de distintas asignaturas del curso DAM. La interfaz se inspira en un entorno de desarrollo visual, con:

- Explorador de archivos
- Búsqueda global por contenido
- Favoritos
- Vista de documentos desde una estructura de carpetas
- Soporte para calendario y horario académico
- Autenticación de usuarios
- Subida de archivos (integración de almacenamiento en la nube)

## Características principales

- Navegación por carpetas y archivos del curso
- Búsqueda de apuntes por asignatura y contenido
- Panel de favoritos para acceso rápido
- Estilo visual tipo VS Code / editor de código
- Organización temática de materias como:
  - Bases de Datos
  - Digitalización
  - Entornos de Desarrollo
  - Lenguajes de Marcas
  - Programación
  - Sistemas Informáticos
- Integración con Firebase para autenticación y gestión de usuarios
- Integración con almacenamiento Cloudinary para subida de documentos

## Estructura del proyecto

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

## Tecnologías utilizadas

- HTML
- CSS
- JavaScript
- Marked.js para renderizado de Markdown
- Highlight.js para resaltado de código
- Firebase para autenticación/usuarios
- Cloudinary para subida de archivos

## Cómo ejecutar el proyecto

Como se trata de una web estática, puedes ejecutarla con un servidor local sencillo:

```bash
python -m http.server 8000
```

Luego abre en el navegador:

```text
http://localhost:8000/
```

Si se despliega en un entorno con una ruta base como `/DAM/`, asegúrate de mantener la estructura de rutas de los assets y de los archivos HTML para que los estilos y scripts carguen correctamente.

## Uso

1. Abre la aplicación en el navegador.
2. Explora la estructura del curso desde el panel lateral.
3. Selecciona un archivo para visualizar su contenido.
4. Usa la búsqueda para encontrar apuntes por tema.
5. Guarda archivos como favoritos para acceso rápido.
6. Si tienes permisos, inicia sesión para acceder a funciones avanzadas como gestión de usuarios y subida de contenido.

## Objetivo

Este proyecto sirve como herramienta de estudio y consulta para alumnos de DAM, centralizando apuntes, ejercicios, recursos y organización del curso en una interfaz clara y fácil de navegar.

## Nota

El contenido de los apuntes está organizado dentro de la carpeta `DAM/1-DAM/` y puede ampliarse o actualizarse según el temario del curso.
