# Contributing (and how this skill improves itself)

Humans and agents follow the same rules. Read `RULES.md` first: no invented data, evidence tags, attribution.

## Add a rating check

1. **Code:** in `scripts/rate_site.py`, add one `c.add(...)` call in the right section (crawl, onpage, content, schema, performance, aeo, geo):
   ```python
   c.add("onpage", "Short check name", ratio_0_to_1_or_None, weight,
         "evidence: counts + example pages", "Plain-language fix.", tag="OBSERVED", impact="High|Medium|Low", pages=[...])
   ```
   - `ratio=None` means UNKNOWN: the check is left out of the score, never counted as pass or fail.
   - Use `tag="INFERRED"` for heuristics such as length or structure proxies.
   - Pass `pages=` with failing page paths so the report can point at them.
   - If the fix can be templated, append a fix kit: `kits.append({"title", "lang", "body"})`. Use `[CONFIRM: ...]` for any fact you don't have.
2. **Rubric:** add a row to `references/rating-rubric.md` with the weight and how it's measured. If the scoring changes meaningfully, bump `RUBRIC_VERSION`.
3. **Test:** in `tests/test_rating.py`, add the passing markup to the GOOD fixture, keep it out of BAD, and assert both outcomes.
4. **Benchmark:** `python scripts/dev/benchmark.py --compare <your baseline.json>`. Explain every score change before you commit.
5. Run `python -m unittest discover -s tests -p "test_*.py"`.

## Add a workflow or sub-skill

- Workflow: `workflows/<job>.md` with inputs, steps, automated vs manual, outputs, and state updates. Add it to the router table in `SKILL.md`.
- Sub-skill: `skills/<name>/SKILL.md` with `name` and `description` frontmatter. The description should list real trigger phrases. As a plugin, it's auto-discovered.

## Add an MCP tool

Add a function with `@mcp.tool()` in `mcp/server.py`. It should wrap an existing script, not reimplement logic. Write tools must call `_write_guard`. Add the tool to `docs/MCP.md`, then extend `tests/test_mcp_server.py`.

## Vendor a third-party skill

Only copy from repositories whose license allows it. Copy files unmodified into `skills/vendor/<source>/` together with its LICENSE and an `ATTRIBUTION.md` (source URL, commit, license, what was copied, dependencies, role). Update `skills/vendor/README.md` and the README index. If two skills do the same job, keep one as primary and list the other as an alternative.

## Self-improvement loop (for agents)

Run this loop when the user asks the skill to "improve itself", or after a rating that looked wrong:

1. **Self-audit:** rate 2–3 real sites, including one you know well. Compare every top fix with the live page. Use `curl -I` and view-source.
2. **Classify each miss:** false positive (the check flags something that's fine), false negative (a problem it didn't flag), unclear tip, missing fix kit, or presentation problem.
3. **Fix the smallest thing that removes the miss.** Prefer measuring something directly over adding a heuristic. If you do add a heuristic, label it INFERRED.
4. **Lock it in with a fixture test** (`tests/test_rating.py`) so the miss can't come back.
5. **Benchmark** before and after; justify every difference.
6. **Record it** in `CHANGELOG.md` (what changed, why, evidence).
7. Ask before pushing or publishing.

Never "improve" by inflating scores, hiding UNKNOWNs, or adding claims you can't measure.
