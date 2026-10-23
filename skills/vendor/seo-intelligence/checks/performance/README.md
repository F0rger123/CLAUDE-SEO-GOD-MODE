# Performance (Core Web Vitals)

- [ ] **LCP** (Largest Contentful Paint) en móvil y escritorio dentro de rango aceptable.
- [ ] **INP** (Interaction to Next Paint) — reemplazo de FID — sin bloqueos largos por JS pesado.
- [ ] **CLS** (Cumulative Layout Shift) — sin saltos de layout por imágenes/anuncios sin dimensiones reservadas.
- [ ] Imágenes optimizadas (formato, compresión, tamaño real vs. mostrado) y con `loading="lazy"` donde aplica (nunca en el LCP).
- [ ] CSS/JS críticos priorizados; el resto diferido o cargado de forma asíncrona.
- [ ] Fuentes web con estrategia de carga que evite texto invisible o saltos (`font-display`).
- [ ] Servidor con tiempos de respuesta razonables (TTFB); CDN si el público está distribuido geográficamente.

Medir siempre con datos reales de campo (CrUX / PageSpeed Insights) además de laboratorio — el dato de campo refleja usuarios reales, el de laboratorio es una simulación.
