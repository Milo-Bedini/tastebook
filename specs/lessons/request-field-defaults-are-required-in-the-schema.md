# A request field with a default comes out required in the generated types

- **Added:** 2026-11-03 · **Applies to:** spec | implement | review · **Issue:** TAS-153
- **Rule:** A serializer field with a non-callable `default` (`ChoiceField(..., default=UnitSystem.METRIC)`) gets `default:` in `schema.yml`, and `openapi-typescript` then types it required (`unit_system: UnitSystem`), so a frontend caller has to send it. For a request field the caller may leave out, use `required=False` with no default, say what happens when it's missing in `help_text`, and apply the default in the service. A callable default such as `default=list` emits nothing, so it stays optional.
- **Why:** The TAS-153 spec gave the seed's `unit_system` a default and its contract said `unit_system?: UnitSystem`, but the regenerated `schema.d.ts` made it required and every seeded member in `frontend/e2e/setups.ts` failed type-checking.
- **Re-check by:** 2027-02-03
