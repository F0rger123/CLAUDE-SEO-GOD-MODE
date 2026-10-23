# Regla: validar después de cada cambio

Ningún cambio se da por terminado hasta verificarlo en vivo.

## Checklist de validación tras un cambio
- [ ] Se pidió la URL/archivo real después del cambio (no se asumió que quedó bien).
- [ ] El contenido nuevo coincide exactamente con lo planeado (sin caracteres rotos, sin truncar).
- [ ] Si es JSON-LD: valida sin errores de sintaxis y sin campos que contradigan el contenido visible.
- [ ] Si es un cambio de indexación (`robots`, `sitemap`, `canonical`): se confirmó que no bloquea sin querer otra parte del sitio.
- [ ] Se registró el estado "antes" para poder comparar en la re-auditoría (`workflows/regression.md`).
- [ ] Se definió una ventana de medición razonable (ej. mínimo 28 días, o el ciclo típico de recrawl del sitio) antes de sacar conclusiones sobre el efecto del cambio.
