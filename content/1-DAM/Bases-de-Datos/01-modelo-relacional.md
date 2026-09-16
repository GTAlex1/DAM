# Modelo relacional

## Conceptos clave

- **Tabla (relación)**: conjunto de filas con la misma estructura.
- **Tupla (fila)**: un registro concreto.
- **Atributo (columna)**: una propiedad de la entidad.
- **Clave primaria (PK)**: identifica de forma única cada fila.
- **Clave ajena (FK)**: referencia a la PK de otra tabla, define la relación.

## Del modelo E/R a tablas

Una relación **1:N** (un alumno tiene muchas matrículas) se traduce añadiendo la PK del lado "1" como FK en el lado "N".

Una relación **N:M** (alumnos matriculados en varios módulos) necesita una tabla intermedia:

```
Alumno (id_alumno, nombre)
Modulo (id_modulo, nombre)
Matricula (id_alumno FK, id_modulo FK, curso)
```

## Normalización

| Forma normal | Qué exige |
|---|---|
| 1FN | Valores atómicos, sin grupos repetitivos |
| 2FN | 1FN + sin dependencias parciales de la PK |
| 3FN | 2FN + sin dependencias transitivas |

## Notas de clase

- Una tabla bien normalizada evita **redundancia** e **inconsistencias**.
- No siempre conviene llegar a 3FN: a veces se **desnormaliza** por rendimiento.
- Diferencia entre clave primaria y clave candidata: puede haber varias candidatas, pero solo una se elige como PK.
