# Client profile template

The live profile is `state.json` → `profile` (rendered to `<client>/profile.md`). This template documents each field and the command that sets it. Lists and objects are JSON.

| Field | Example | Command |
|---|---|---|
| business_name | D-Hauss Remodeling | set at `init --name` |
| website | https://example.com | set at `init --website` |
| industry | Residential remodeling | `set <slug> profile.industry "Residential remodeling"` |
| services | ["Kitchen remodeling","Bathroom remodeling"] | `set <slug> profile.services '[...]'` (priority order) |
| locations | [{"name":"Main office","street":"","city":"York","region":"PA","postal":"17401","country":"US","phone":"717-555-0100","gbp_url":"","lat":null,"lng":null,"hours_spec":[{"days":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":"08:00","closes":"17:00"}]}] | `set <slug> profile.locations '[...]'` (empty street = hidden address SAB) |
| service_area | ["York, PA","Red Lion, PA","Dover, PA"] | `set <slug> profile.service_area '[...]'` |
| geographic_focus | local / regional / national / remote | `set ... profile.geographic_focus local` |
| target_audience | Homeowners 35–65 in York County with older homes | `set ...` |
| conversion_goals | ["Phone call","Quote form"] | `set ...` |
| competitors | [{"name":"...","url":"..."}] | `set ...` |
| cms | WordPress + Elementor | `set ...` |
| analytics | GA4 (G-XXXX) | `set ...` |
| sitemap_url | https://example.com/sitemap_index.xml | `set ...` |
| current_issues | Redesign in 2025 dropped traffic | `set ...` |
| content_availability | Project photos yes; owner can review drafts | `set ...` |
| ranking_goals | ["kitchen remodeling york pa"] | `set ...` |
| primary_phone, email | 717-555-0100 | `set ...` |
| brand_facts | {"founded":"2009","license":"PA HIC #...","logo_url":"...","price_range":"$$$"} | `set <slug> profile.brand_facts.founded 2009` |
| social_profiles | ["https://facebook.com/..."] | `set ...` |
| notes | anything else | `set ...` |

Never store passwords, API keys, or tokens here.
