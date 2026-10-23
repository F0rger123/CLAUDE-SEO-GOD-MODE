# GEO — Generative Engine Optimization

Evalúa si una marca tiene suficientes señales para ser **entendida, asociada y mencionada** por sistemas de IA generativa. Es el módulo más diferencial de esta skill.

- [ ] **Entidad de marca clara**: el sitio se identifica de forma inequívoca (nombre exacto, no variantes) en todo el contenido y en los datos estructurados.
- [ ] **Consistencia NAP** (Nombre, Dirección, Teléfono) idéntica entre sitio, Google Business Profile, directorios y redes.
- [ ] **Autoría**: contenido firmado por personas reales identificables, no anónimo.
- [ ] **Organización**: `Organization` en JSON-LD completo y coherente en todas las páginas.
- [ ] **Personas**: `Person` para quienes lideran o son voceros de la marca, enlazadas a `Organization` vía `worksFor`/`employee`.
- [ ] **Productos / servicios**: descripciones concretas, no genéricas, con `Service`/`Product` según corresponda.
- [ ] **Ubicación**: coherente entre schema, Google Business Profile y contenido visible.
- [ ] **Relaciones entre entidades**: personas↔empresa, empresa↔servicios, empresa↔ubicación, todas enlazadas y no contradictorias (ver `entity-consistency.md`).
- [ ] **Fuentes externas**: presencia en fuentes independientes del sitio propio (ver `external-sources.md`).
- [ ] **Menciones**: existen menciones de la marca fuera de sus propios canales.
- [ ] **Reputación**: reseñas y valoraciones reales, consistentes entre plataformas.
- [ ] **Schema**: completo y coherente (ver `checks/schema/`).
- [ ] **Contenido propio**: cubre el tema con profundidad y opinión real.
- [ ] **Contenido de terceros**: existe contenido de terceros que refuerza o confirma lo que la marca dice de sí misma.
- [ ] **`llms.txt` / `llms-full.txt`**: presentes y actualizados (ver `checks/llm/`).

## entity-consistency.md — Coherencia del Entity Graph
Construir conceptualmente:
```
Marca
 ├── Persona
 ├── Empresa
 ├── Servicio
 ├── Producto
 ├── Ubicación
 ├── Website
 ├── Social Profiles
 ├── Reviews
 ├── Publications
 └── External References
```
Cada nodo debe usar el mismo nombre/descripción base que los demás. Una inconsistencia (ej. el sitio dice "Trement SAS" pero LinkedIn dice "Trement Software") es un hallazgo GEO de prioridad alta — confunde a los sistemas que intentan resolver si son la misma entidad.

## external-sources.md — Citation / Source Intelligence
Fuentes a evaluar como posible respaldo de una entidad o afirmación:
- Google Business Profile
- Medios de comunicación reales
- Directorios relevantes del sector (ej. GoodFirms, Clutch, según la industria)
- Perfiles profesionales (LinkedIn)
- Sitios oficiales de asociaciones o gremios
- Publicaciones (propias o de terceros)
- Marketplaces del sector
- Fuentes sectoriales especializadas

**Distinguir siempre fuente propia de fuente independiente.** Un sitio que solo habla bien de sí mismo en sus propios canales tiene menos señal GEO que uno mencionado, aunque sea brevemente, por fuentes que no controla.
