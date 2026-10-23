# Confidence labels — tag every finding

Every finding, claim, or score this skill produces must carry one of these four labels. Never present one as another.

| Label | Meaning | Example |
|---|---|---|
| `OBSERVED` | Measured directly in this session from a real source (code read, Search Console response, GA4 response, PageSpeed result). | "OBSERVED: no `<link rel=canonical>` found in the fetched HTML of /pricing." |
| `INFERRED` | A reasonable conclusion built on top of `OBSERVED` data, not itself directly measured. | "INFERRED: the 0-click, high-impression queries are more likely explained by SERP layout (position 4.3 average) than by bot traffic, based on the observed position and lack of impression spikes." |
| `RECOMMENDED` | General best practice, not verified against this specific site's data. Must say so explicitly. | "RECOMMENDED (not verified against your data): keep title tags under ~60 characters." |
| `UNKNOWN — requires verification` | The skill does not have enough evidence to say either way. This is a valid, honest answer — never replaced by a guess. | "UNKNOWN — requires verification: whether the reviews shown are real; ask the site owner to confirm before citing them as E-E-A-T evidence." |

## Rule
If a finding, a score component, or a priority ranking is about to be written without one of these labels attached (explicitly or by clear section context), stop and add it. A report where everything reads as equally certain is misleading by omission.
