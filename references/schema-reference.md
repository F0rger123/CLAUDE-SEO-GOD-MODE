# Schema reference

JSON-LD in `<script type="application/ld+json">`. Vocabulary: https://schema.org. Google feature docs: https://developers.google.com/search/docs/appearance/structured-data/search-gallery.

## LocalBusiness (and subtypes)

Use the most specific subtype: `GeneralContractor`, `HomeAndConstructionBusiness`, `Plumber`, `Electrician`, `HVACBusiness`, `RoofingContractor`, `HousePainter`, `Locksmith`, `MovingCompany`, `AutoRepair`, `Dentist`, `LegalService`, `Restaurant`, `Store`, `ProfessionalService`, ...

| Property | Google | Notes |
|---|---|---|
| `name` | required | Exactly as on GBP and signage |
| `address` (PostalAddress) | required for local business feature | SABs that hide their address on GBP: weigh omitting street; keep locality/region |
| `url`, `telephone` | recommended | Same phone as GBP |
| `geo` (lat/lng, 5 decimals) | recommended | |
| `openingHoursSpecification` | recommended | |
| `image`, `logo` | recommended | Real photos |
| `priceRange` | recommended | e.g. `$$` |
| `areaServed` | schema.org | Cities/counties actually served |
| `sameAs` | schema.org | GBP/Maps URL, Facebook, LinkedIn, Yelp, BBB, Houzz |
| `aggregateRating`, `review` | do not self-serve | Google does not show review stars for LocalBusiness/Organization markup about themselves |

## Organization

`name`, `url`, `logo` (≥112×112, crawlable), `sameAs`, `contactPoint`, `foundingDate`, `founder`, `address`. Put on the homepage; give it `@id` `https://site/#organization`.

## Service

`name`, `serviceType`, `provider` (`@id` of the business), `areaServed`, `description`, `offers` (only real pricing). No Google rich result; helps entity understanding.

## FAQPage

`mainEntity`: array of `Question` with `acceptedAnswer.Answer.text`. Must match visible Q&A. Google limits FAQ rich results to well-known authoritative government and health sites, so do not promise stars/accordions in SERPs.

## BreadcrumbList

`itemListElement` of `ListItem` with `position`, `name`, `item`. Matches the visible breadcrumb.

## Article / BlogPosting

`headline`, `image`, `datePublished`, `dateModified`, `author` (`Person` with `url`), `publisher`.

## WebSite

`name`, `url`, optional `alternateName`. Helps site name display. (Sitelinks search box markup is retired by Google.)

## Review snippets

Allowed for reviews of products, recipes, courses, software, books, etc., not self-reviews of the business itself.

## Entity graph pattern

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {"@type": "Organization", "@id": "https://example.com/#organization", "name": "...", "url": "https://example.com/"},
    {"@type": "GeneralContractor", "@id": "https://example.com/#localbusiness", "name": "...", "parentOrganization": {"@id": "https://example.com/#organization"}},
    {"@type": "WebSite", "@id": "https://example.com/#website", "url": "https://example.com/", "publisher": {"@id": "https://example.com/#organization"}}
  ]
}
```

For single-location small businesses, one LocalBusiness entity can serve as the organization; avoid two conflicting entities.
