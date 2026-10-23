# Workflow: /seo-fix

Precondición: existe una lista de hallazgos (de `/full-audit` o de un audit parcial) y el usuario aprobó cuáles corregir.

1. Ordenar los hallazgos aprobados por prioridad (CRITICAL primero).
2. Por cada uno, ejecutar la secuencia de `agents/fixer.md`: READ → confirmar que el problema sigue vigente → aplicar cambio mínimo → registrar valor anterior → publicar.
3. Excluir automáticamente cualquier cambio que toque lo listado en `rules/safe-changes.md` como sensible, aunque estuviera en la lista aprobada — señalarlo aparte y pedir confirmación puntual adicional.
4. Al terminar todos los cambios de esta tanda, pasar a `workflows/regression.md` automáticamente.
5. Entregar el resumen: qué se corrigió, qué quedó pendiente y por qué (si algo no se pudo aplicar).
