# Workflow: /gsc-analysis

Requiere acceso real a la API de Search Console (`searchAnalytics.query`). Nunca simular estos datos.

1. Traer datos reales:
   ```
   POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
   {
     "startDate": "YYYY-MM-DD",
     "endDate": "YYYY-MM-DD",
     "dimensions": ["query", "page"],
     "rowLimit": 500
   }
   ```
2. Calcular por página y por consulta: impresiones, clics, CTR, posición media.
3. Identificar oportunidades concretas:
   - **Quick wins**: keywords en posición 4-20 con volumen de impresiones razonable.
   - **Impresiones altas + CTR bajo**: candidatas a mejorar title/meta description.
   - **Canibalización**: mismo término, varias URLs con posiciones inestables.
   - **Keywords sin landing adecuada**: consultas con impresiones pero sin una página específica para esa intención.
   - **Pérdida de tráfico**: comparar periodo actual vs. periodo anterior equivalente, señalar caídas significativas.
   - **Crecimiento**: igual, para páginas/consultas en ascenso, para reforzarlas.
4. Entregar cada oportunidad como acción concreta, no como dato suelto. Ejemplo de formato:
   ```
   /servicios/web
   Query: "desarrollo web Colombia"
   8.421 impresiones · posición media 8.7 · CTR 1.2%
   Acción: mejorar title, H1, meta description, contenido introductorio y entidades relacionadas.
   ```
5. Nunca proyectar cifras futuras ("esto generará X visitas") — solo reportar lo medido y la acción recomendada.
