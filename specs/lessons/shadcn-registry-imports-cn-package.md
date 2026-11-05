# shadcn's registry imports `cn` from an npm package

- **Added:** 2026-10-26 · **Applies to:** spec | implement | review · **Issue:** TAS-29
- **Paths:** `frontend/src/dino/**`, `frontend/package.json`
- **Rule:** With shadcn 4.22, `pnpm --filter frontend ui:add <name>` ignores the `utils` alias in `components.json`: the registry's files write `import { cn } from "cn"` and the CLI adds the npm package `cn` to `frontend/package.json`. `pnpm lint` refuses the import; once it points at `@/dino/cn`, run `pnpm --filter frontend remove cn` too. `shadcn add --dry-run <name>` lists `cn` under Dependencies when it will happen.
- **Why:** Checking the CLI set-up on TAS-29's foundation PR, `shadcn add button` wrote `from "cn"` and installed `cn`, which the spec's `components.json` was meant to route to `src/ui/cn.ts`. Every alias combination tried, including shadcn's default `@/lib/utils`, did the same.
- **Re-check by:** 2027-01-26
