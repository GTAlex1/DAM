# Introducción a la programación

## ¿Qué es un algoritmo?

Un **algoritmo** es una secuencia finita y ordenada de pasos que resuelve un problema. Antes de escribir una sola línea de código, se puede representar con:

- **Pseudocódigo**: descripción en lenguaje natural estructurado.
- **Diagrama de flujo**: representación gráfica con símbolos estandarizados.

## Tipos de datos básicos

| Tipo | Ejemplo | Descripción |
|---|---|---|
| `int` | `25` | Números enteros |
| `float` / `double` | `3.14` | Números decimales |
| `char` | `'A'` | Un único carácter |
| `String` | `"Hola"` | Cadena de texto |
| `boolean` | `true` / `false` | Verdadero o falso |

## Variables y constantes

```java
int edad = 20;          // variable: puede cambiar
final double PI = 3.14; // constante: no cambia
```

## Primer programa en Java

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hola, DAM!");
    }
}
```

## Notas de clase

- Todo programa Java necesita una clase con un método `main`.
- Java es **fuertemente tipado**: hay que declarar el tipo de cada variable.
- El punto y coma `;` cierra cada instrucción — es el error de sintaxis más común al empezar.
