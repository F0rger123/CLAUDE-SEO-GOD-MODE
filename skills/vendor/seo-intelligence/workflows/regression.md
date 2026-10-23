# Workflow: /regression-test

1. Tomar el snapshot "antes" guardado en el último `/full-audit` o `/seo-fix`.
2. Volver a ejecutar exactamente el mismo set de checks (mismos módulos, mismas páginas).
3. Comparar resultado por resultado:
   - **Fixed**: pasaba a fallar antes → ahora pasa.
   - **Regressions**: pasaba antes → ahora falla. Reportar con la misma severidad que un hallazgo nuevo, sin excepción.
   - **Remaining**: seguía fallando antes → sigue fallando.
4. Formato de salida obligatorio:
   ```
   SEO CHECKS
   Before: X/Y
   After:  X'/Y

   Fixed:
   ✓ ...

   Regressions:
   [lista o "0"]

   Remaining:
   [lista]
   ```
5. Si hay regresiones, priorizarlas de inmediato por encima de cualquier otra tarea pendiente — un cambio que rompió algo que funcionaba es más urgente que una mejora nueva.
