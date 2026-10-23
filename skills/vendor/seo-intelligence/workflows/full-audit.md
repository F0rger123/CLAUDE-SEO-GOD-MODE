# Workflow: /full-audit

1. **DISCOVER**: detectar tipo de negocio (`SKILL.md` §0), stack técnico, idioma/mercado, qué fuentes de datos están disponibles (Search Console, GA4, Google Business Profile, PageSpeed).
2. **AUDIT**: ejecutar, en este orden, todos los módulos de `checks/` aplicables al tipo de negocio detectado:
   `technical → indexing → on-page → schema → performance → accessibility → local-seo (si aplica) → eeat → aeo → geo → llm`.
3. Por cada check fallido, generar un hallazgo completo (`SKILL.md` §6).
4. **IDENTIFY + PRIORITIZE**: clasificar todos los hallazgos en CRITICAL/HIGH/MEDIUM/LOW/OPPORTUNITY (`SKILL.md` §5).
5. Entregar el reporte con el formato de `templates/audit-report.md`.
6. Guardar snapshot "antes" (lista de checks que pasan/fallan) para permitir `/regression-test` después de implementar cambios.
7. Terminar con una sección "Aprobación necesaria": lista de cambios propuestos esperando confirmación del usuario antes de pasar a `/seo-fix`.

Este workflow **no modifica nada** — es responsabilidad exclusiva de `agents/auditor.md`.
