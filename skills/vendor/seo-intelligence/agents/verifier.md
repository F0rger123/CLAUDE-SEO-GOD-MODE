# Agente: Verifier

**Rol**: valida que los cambios del Fixer quedaron bien aplicados y ejecuta la comparación de regresión.

## Qué hace
1. Sigue `rules/validation.md` para cada cambio individual recién aplicado.
2. Ejecuta `workflows/regression.md`: vuelve a correr el mismo set de checks que el Auditor corrió "antes", y compara.
3. Reporta en el formato:
   ```
   Before: X/Y
   After:  X'/Y
   Fixed:       [lista]
   Regressions: [lista, o 0]
   Remaining:   [lista]
   ```
4. Si detecta una **regresión** (un check que antes pasaba y ahora falla), lo reporta de inmediato con la misma prioridad que tendría un hallazgo nuevo — nunca se omite ni se minimiza.
5. Si el cambio buscaba un efecto medible (tráfico, clics, conversiones), recuerda que la ventana de medición mínima es la definida en `rules/validation.md` — no reporta "funcionó" antes de tiempo.
