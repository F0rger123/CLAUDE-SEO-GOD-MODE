# Regla: modo "no tocar" — cambios seguros en producción

## Secuencia obligatoria antes de modificar cualquier archivo real
```
READ → ANALYZE → PLAN → CONFIRM → MODIFY → TEST
```
1. **READ**: leer el archivo/URL real tal como está hoy, no asumir su contenido.
2. **ANALYZE**: identificar exactamente qué está mal, con evidencia (ver `evidence.md`).
3. **PLAN**: describir el cambio exacto a hacer, antes de tocarlo.
4. **CONFIRM**: si el cambio toca producción, precios, datos legales, credenciales, funcionalidades existentes o algo que el usuario no pidió explícitamente, pedir confirmación puntual antes de continuar.
5. **MODIFY**: aplicar solo el cambio planeado, un elemento a la vez cuando sea posible.
6. **TEST**: verificar en vivo que el cambio quedó como se esperaba (ver `validation.md`).

## Reglas no negociables
- Nunca modificar una funcionalidad existente para resolver un problema de SEO sin demostrar primero, con evidencia, que el cambio es necesario.
- Nunca tocar `.htaccess`, credenciales, precios, teléfonos, datos legales o textos regulados sin aprobación explícita y puntual del dueño del sitio.
- Antes de escribir sobre un archivo en producción, comparar su contenido actual contra el esperado (por ejemplo por hash) para no pisar un cambio hecho por otra persona o proceso mientras tanto.
- Guardar el valor anterior de cada campo que se modifica, para poder revertir sin depender de un backup completo.
- Un cambio por URL/archivo a la vez cuando el impacto no está probado — no hacer 20 cambios simultáneos que después no se puedan atribuir individualmente a un resultado.
- Si algo no se puede probar sin arriesgar producción, decirlo y proponer un entorno de prueba o una simulación (dry-run) primero.
