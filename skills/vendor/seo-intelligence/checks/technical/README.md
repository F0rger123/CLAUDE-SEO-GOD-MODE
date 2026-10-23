# Technical SEO

- [ ] **HTML semántico**: uso correcto de `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<footer>` — no todo en `<div>`.
- [ ] **Canonicals**: cada URL declara `<link rel="canonical">` correcto; sin canonicals cruzados entre páginas distintas.
- [ ] **Hreflang**: si el sitio tiene varios idiomas/países, cada variante declara `hreflang` recíproco y consistente (A apunta a B y B apunta a A).
- [ ] **Sitemap.xml**: existe, está actualizado, enviado a Search Console, y solo incluye URLs indexables (200, canónicas, sin noindex).
- [ ] **Robots.txt**: no bloquea CSS/JS necesarios para renderizar, no bloquea por accidente secciones que sí deben indexarse.
- [ ] **Redirecciones**: 301 para cambios permanentes (nunca 302 para eso), sin cadenas de más de 1 redirección, sin bucles.
- [ ] **Enlaces internos**: sin enlaces rotos (404), anchor text descriptivo (no "click aquí"), profundidad razonable desde la home.
- [ ] **Imágenes**: formato moderno (webp/avif cuando aplique), tamaño servido acorde al mostrado, `alt` descriptivo real.
- [ ] **JavaScript / renderizado**: el contenido crítico para SEO es visible sin depender de JS pesado sin fallback; probar con "ver código fuente" además del DOM renderizado.
- [ ] **HTTPS y seguridad**: certificado válido en todo el dominio, sin contenido mixto (recursos http:// en página https://), cabeceras de seguridad razonables.
- [ ] **Mobile SEO**: diseño responsive real (no solo "zoom out"), objetivos táctiles con tamaño adecuado, sin intersticiales intrusivos.

Cada ítem marcado como fallo debe convertirse en un hallazgo con el formato de `SKILL.md` §6, no quedarse como checkbox suelto.
