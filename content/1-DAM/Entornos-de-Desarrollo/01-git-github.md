# Git y GitHub

## Flujo básico

```bash
git init
git add .
git commit -m "Primer commit"
git branch -M main
git remote add origin https://github.com/usuario/repo.git
git push -u origin main
```

## Comandos del día a día

```bash
git status              # qué ha cambiado
git add archivo.txt     # preparar cambios
git commit -m "mensaje" # guardar cambios
git pull                # traer cambios remotos
git push                # subir cambios
```

## Ramas

```bash
git branch nueva-funcionalidad
git checkout nueva-funcionalidad
# o en un solo paso:
git checkout -b nueva-funcionalidad
```

```bash
git checkout main
git merge nueva-funcionalidad
```

## .gitignore típico

```
node_modules/
*.class
.env
.DS_Store
```

## Notas de clase

- Un **commit** es una fotografía del proyecto en un momento dado; el mensaje debe explicar el *qué* y el *por qué*.
- `git pull` = `git fetch` + `git merge`.
- Los conflictos aparecen cuando dos ramas modifican la misma línea; Git los marca con `<<<<<<<` y `>>>>>>>` para resolverlos a mano.
