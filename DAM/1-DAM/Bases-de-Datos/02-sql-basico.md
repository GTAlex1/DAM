# SQL básico

## Consultas simples

```sql
SELECT nombre, edad
FROM alumno
WHERE edad >= 18
ORDER BY nombre ASC;
```

## Joins

```sql
SELECT a.nombre, m.nombre AS modulo
FROM alumno a
INNER JOIN matricula ma ON a.id_alumno = ma.id_alumno
INNER JOIN modulo m ON ma.id_modulo = m.id_modulo;
```

| Join | Devuelve |
|---|---|
| `INNER JOIN` | Solo filas con coincidencia en ambas tablas |
| `LEFT JOIN` | Todas las de la izquierda + coincidencias |
| `RIGHT JOIN` | Todas las de la derecha + coincidencias |

## Funciones de agregación

```sql
SELECT modulo, COUNT(*) AS total_alumnos
FROM matricula
GROUP BY modulo
HAVING COUNT(*) > 10;
```

- `WHERE` filtra filas **antes** de agrupar.
- `HAVING` filtra grupos **después** de agrupar.

## DML esencial

```sql
INSERT INTO alumno (nombre, edad) VALUES ('Marta', 20);
UPDATE alumno SET edad = 21 WHERE id_alumno = 3;
DELETE FROM alumno WHERE id_alumno = 3;
```

> ⚠️ Un `UPDATE` o `DELETE` sin `WHERE` afecta a **toda la tabla**.
