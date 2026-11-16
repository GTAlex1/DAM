# Migración de Firebase a Supabase

Esta carpeta contiene las herramientas para sacar los datos del proyecto Firebase **damm** (`damm-29df1`).

## 1. Exportar los datos de Firebase

El script `exportar-firebase.js` **solo lee**: no modifica ni borra nada en Firebase.

1. Instala [Node.js](https://nodejs.org) (versión 18 o superior).
2. En la consola de Firebase: **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**.
3. Guarda el archivo descargado como `migracion/serviceAccountKey.json`. Está en el `.gitignore`, pero comprueba que no se sube.
4. Desde esta carpeta ejecuta:

```bash
npm install
node exportar-firebase.js
```

Resultado, en `migracion/salida/`:

| Archivo | Contenido |
|---|---|
| `firestore.json` | Todas las colecciones y subcolecciones de Firestore (fechas en formato ISO 8601) |
| `auth-usuarios.json` | Cuentas de Authentication: correo, UID, fechas, hash y sal de la contraseña |

## 2. Seguridad

- Los dos archivos contienen **datos personales de los alumnos**. No los subas a GitHub: Pages publica todo lo que haya en el repositorio.
- `serviceAccountKey.json` da **control total** del proyecto. Cuando termines, bórralo y revoca la clave desde **Google Cloud → IAM → Cuentas de servicio → Claves**.
- No pegues esos archivos ni la clave en ningún chat.

## 3. Siguientes pasos de la migración

1. Crear el proyecto de Supabase y el esquema de tablas con sus políticas de seguridad (RLS), equivalentes a `firestore.rules`.
2. Importar los datos de `firestore.json`.
3. Migrar las cuentas de Authentication.
4. Pasar los archivos de Cloudinary a Supabase Storage y reescribir las URLs guardadas en `apuntes` y en los mensajes del chat.
5. Cambiar el JS de la web (`firebase-init.js`, `calendario.js`, `horario-cuenta.js`, `firebase-core.js`) para que use Supabase.
