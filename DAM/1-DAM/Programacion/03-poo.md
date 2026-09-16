# Programación Orientada a Objetos

## Los 4 pilares

1. **Encapsulación** — ocultar el estado interno y exponer solo lo necesario.
2. **Herencia** — una clase hija reutiliza y extiende el comportamiento de una clase padre.
3. **Polimorfismo** — un mismo método se comporta distinto según el objeto que lo invoca.
4. **Abstracción** — modelar solo lo relevante del problema, ignorando el detalle innecesario.

## Clase y objeto

```java
public class Alumno {
    private String nombre;
    private int edad;

    public Alumno(String nombre, int edad) {
        this.nombre = nombre;
        this.edad = edad;
    }

    public String getNombre() {
        return nombre;
    }
}
```

```java
Alumno a1 = new Alumno("Lucía", 19);
System.out.println(a1.getNombre());
```

## Herencia

```java
public class AlumnoDAM extends Alumno {
    private String modulo;

    public AlumnoDAM(String nombre, int edad, String modulo) {
        super(nombre, edad);
        this.modulo = modulo;
    }
}
```

## Interfaces vs clases abstractas

| | Interfaz | Clase abstracta |
|---|---|---|
| Herencia múltiple | Sí | No (solo una) |
| Puede tener atributos con estado | No | Sí |
| Métodos con implementación | Solo `default` | Sí |

## Notas de clase

- `this` referencia al objeto actual; `super` referencia a la clase padre.
- Un constructor sin parámetros se genera automáticamente si no defines ninguno.
- Los `getters`/`setters` son la forma habitual de respetar la encapsulación.
