[Repository](https://github.com/GTAlex1/DAM)

# DAM

A web app designed for students of the DAM course to keep notes, timetable, calendar, searches, and daily study workflow in one place.

## How to use it

Open the app here:

https://gtalex1.github.io/DAM/

From there, you can:

- read course notes
- navigate by subject and topic
- search content quickly
- save favorite files
- access the class timetable
- use the personal calendar for tasks and reminders
- log in to save changes and personalize the experience

### Log in

Click on "Acceder" and use your IDEA username (the same one used in iPASEN or Moodle).

- Username: your IDEA username
- Password: any password you choose

Important: if you forget the password, the account cannot be recovered. Please remember it well.

This is intended so each student can keep their own workspace and avoid mixing personal data with other users.

### What you can do after logging in

Once logged in, you can:

- upload your own files
- edit or add content inside the web app
- add convalidated or personal timetable entries
- use the calendar as a personal study planner
- bookmark the notes or topics you need most

---

## What this page is

This is a digital class notebook with an interface inspired by code editors and IDEs.

The goal is not only to read notes, but also to organize the course in a practical way:

- view notes by subject
- search information quickly
- keep the timetable available
- manage a personal calendar
- share materials inside the course environment
- customize the experience with your own account

---

## Technical overview

### Technologies used

- HTML, CSS, and JavaScript for the front-end
- Marked.js for Markdown rendering
- Highlight.js for syntax highlighting
- Firebase for user authentication
- Cloudinary for file upload and storage
- GitHub Pages for deployment

### Project structure

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
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
├── README.md
├── README-en.md
└── .github/
```

### Included subjects

- Databases
- Digitization
- Development Environments
- Markup Languages
- Programming (Java, Pseint, etc.)
- Computer Systems

### Run locally

To run the app locally:

```bash
python -m http.server 8000
```

Then open the app in your browser:

```text
http://localhost:8000/
```

If the app is served under a different base path, keep the asset and file routes consistent so styles and scripts load correctly.

### Required configuration

For the app to work properly, you need:

1. Firebase configured for user authentication
2. Cloudinary configured for file uploads
3. The course notes structure inside `DAM/1-DAM/`

---

## Purpose

The aim is to provide students with a practical, clear, and fast tool to study and organize the DAM course without relying on scattered documents or external sources.
