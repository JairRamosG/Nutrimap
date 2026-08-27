# Process

## Pre-requisitos

1. **Repositorio en GitHub creado** — el orquestador debe tener acceso al repo
2. **AGENTS.md customizado** con el stack y contexto del proyecto
3. **`gh` CLI configurado** — para crear y gestionar issues desde la terminal

## Flujo de Trabajo

Los issues de GitHub son el backlog canónico. Un issue a la vez.

### Ciclo de Vida de un Issue

```
1. PM crea los issues en GitHub (o hace grooming si ya existen)
2. PM hace grooming → issue queda claro
3. Engineer implementa → crea código
4. QA verifica → PASS o FAIL
5. Si FAIL → vuelve al Engineer con feedback
6. Si PASS → se cierra el issue
7. Repetir con el siguiente
```

### Reglas

- No saltearse el grooming
- El Engineer no cierra el issue
- QA no arregla nada, solo dice PASS o FAIL
- El orquestador cierra el issue solo después de PASS

## Roles

- **PM** - Crea y hace grooming de issues. Sigue `_docs/team/pm.md`
- **Engineer** - Implementa un issue groomado. Sigue `_docs/team/engineer.md`
- **QA** - Verifica contra criterios de aceptación. Sigue `_docs/team/qa.md`

## Orquestador

La sesión principal es el orquestador. Lanza PM, Engineer y QA como subagentes.
No hace grooming, implementación ni testing directamente.

### Lifecycle

```
1. Verificar que el repo de GitHub existe y tiene issues (o crearlos)
2. Tomar el siguiente issue abierto del backlog
3. PM lo grooms
4. Engineer lo implementa
5. QA lo verifica
6. En FAIL, volver al paso 4 con el comentario de QA como input
7. En PASS, cerrar el issue
8. Repetir hasta que el backlog esté vacío
```
