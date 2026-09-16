# Estructuras de control

## Condicionales

```java
if (nota >= 5) {
    System.out.println("Aprobado");
} else if (nota >= 4) {
    System.out.println("Recuperación");
} else {
    System.out.println("Suspenso");
}
```

`switch` es más legible cuando comparamos una misma variable contra varios valores concretos:

```java
switch (dia) {
    case 1 -> System.out.println("Lunes");
    case 2 -> System.out.println("Martes");
    default -> System.out.println("Otro día");
}
```

## Bucles

### `for` — cuando sabemos cuántas veces repetir

```java
for (int i = 0; i < 10; i++) {
    System.out.println(i);
}
```

### `while` — cuando la condición se evalúa antes de cada vuelta

```java
int intentos = 0;
while (intentos < 3) {
    intentos++;
}
```

### `do-while` — se ejecuta al menos una vez

```java
int opcion;
do {
    opcion = leerMenu();
} while (opcion != 0);
```

## Comparativa rápida

| Estructura | Se usa cuando... |
|---|---|
| `for` | Conocemos el número de iteraciones |
| `while` | La condición se conoce solo en tiempo de ejecución |
| `do-while` | El código debe ejecutarse mínimo una vez |

> ⚠️ Cuidado con los bucles infinitos: revisa siempre que la condición de salida se pueda cumplir.
