# Schema Intelligence

## Principio central
**No generar schema solo porque "existe" el tipo.** Todo dato declarado en JSON-LD debe corresponder a algo real y visible en el contenido de la página. Un schema que dice cosas que la página no muestra es peor que no tener schema — es una señal de baja confianza para Google y para IA.

## Detección automática por tipo de negocio
| Tipo de negocio | Schema principal probable |
|---|---|
| SaaS / software | `Organization`, `SoftwareApplication`, `Service` |
| Hotel | `Hotel`, `LocalBusiness` |
| Restaurante | `Restaurant`, `LocalBusiness`, `Menu` |
| Ecommerce | `Product`, `Offer`, `Review`, `AggregateRating` (solo si son reales) |
| Agencia / servicios profesionales | `Organization`, `ProfessionalService`, `Service`, `Person` |
| Turismo | `TouristTrip`, `LocalBusiness`, `Offer` |
| Blog / medio | `Article`, `BlogPosting`, `Person` (autor) |
| Cualquier sitio | `WebSite`, `WebPage`, `BreadcrumbList`, `FAQPage` (si hay FAQ real) |

## Checklist de validación
- [ ] El JSON-LD es válido sintácticamente (sin errores al parsear).
- [ ] Cada campo (`name`, `address`, `telephone`, `aggregateRating`, `review`, `priceRange`, etc.) coincide con lo que la página muestra visualmente.
- [ ] `sameAs` enlaza a perfiles reales, activos, y que pertenecen a esta misma marca (no a otra empresa con nombre parecido).
- [ ] Un mismo `@id` de `Organization` se reutiliza entre páginas del sitio en vez de declarar organizaciones distintas por página.
- [ ] `FAQPage` solo con preguntas que de verdad se responden en la página visible.
- [ ] `AggregateRating`/`Review` solo si las reseñas son reales y verificables (nunca inventadas — ver `checks/eeat/anti-spam.md`).
- [ ] `BreadcrumbList` coincide con la navegación real del sitio.
