# LLM (llms.txt / llms-full.txt / citabilidad)

- [ ] Existe `llms.txt` en la raíz del sitio: resumen breve en texto plano de qué hace la empresa, a quién sirve y cómo contactarla.
- [ ] Existe (si aplica el tamaño del sitio) `llms-full.txt`: versión extendida con más contexto — servicios, páginas clave, políticas relevantes.
- [ ] Ambos archivos se mantienen actualizados cuando cambian servicios o datos de contacto (evitar que queden desincronizados del sitio real).
- [ ] El contenido de `llms.txt` es coherente con lo que dice el resto del sitio y el schema — nunca una versión "más bonita" que exagere.
- [ ] El sitio no depende exclusivamente de JavaScript para mostrar el contenido que se quiere citable (ver `checks/technical/README.md` sobre renderizado).

Ver plantillas base en `templates/llms.txt` y `templates/llms-full.txt` — deben completarse siempre con datos reales del negocio, nunca dejarse con contenido de ejemplo.
