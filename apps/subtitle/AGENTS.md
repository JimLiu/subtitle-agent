# Repository Guidelines

## Project Structure & Module Organization
This Next.js 15 project keeps runtime code in `src`. Routes live in `src/app` (notably `editor` for the workspace and `projects` for saved items), shared UI in `src/components` (`ui` for primitives, `editor` for composites). Domain logic sits in `src/lib` with media and storage helpers, state in `src/stores`, types in `src/types`, and static data in `src/constants` or `src/data`. Assets stay under `public`.

## Build, Test, and Development Commands
- `npm install` (or `pnpm install`) to sync dependencies.
- `npm run dev` starts the app on http://localhost:3000.
- `npm run build` produces the production bundle—run before shipping API-touching changes.
- `npm run start` serves the compiled build for smoke checks.
- `npm run lint` runs the Next.js/ESLint ruleset; use it before every commit.

## Coding Style & Naming Conventions
Write TypeScript with strict typing and prefer named exports. Follow the repo’s two-space indentation, double-quoted strings, and trailing commas enforced by ESLint. Component files stay kebab-cased (`color-picker.tsx`), hooks are camelCased (`useSubtitleStore.ts`), Zustand stores live in `src/stores` and end with `Store`. Co-locate Tailwind utility styling inside JSX; shared tokens belong in `globals.css` or `src/constants`.

## Testing Guidelines
Automated tests are not yet wired up; every PR must describe manual verification steps and include screenshots or recordings for user-facing changes. When introducing tests, prefer Vitest plus Testing Library in `src/__tests__` with filenames matching `<feature>.test.ts[x]`. Target 70%+ coverage on new modules and run prospective suites with `npm run test` (add the script if you introduce it). Re-run `npm run lint` after adding mocks.

## Commit & Pull Request Guidelines
Follow the existing history: short, imperative, lower-case commit subjects (`add project page`, `update duration`). Group related changes into atomic commits that still pass linting. PRs should include a summary, issue links or task IDs, manual QA notes, and before/after visuals for UI tweaks. Flag migrations, media-processing changes, or timeline algorithm updates so reviewers can focus on regression risk.

## Security & Configuration Tips
Do not commit API keys or media samples; load secrets from `.env.local` (gitignored). The FFmpeg WebAssembly bundle and Mediabunny integrations run client-side—test with anonymized assets to avoid leaking customer data. Large binaries should live in cloud storage links rather than the repo.
