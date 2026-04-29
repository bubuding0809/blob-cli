# AGENTS.md

Guidance for AI agents (or humans) working on the blob-cli codebase. If you're trying to _use_ blob-cli rather than develop it, see the [README](./README.md) or run `npx skills add bubuding0809/blob-cli`.

## Repo layout

- `src/`: CLI source. Entrypoint is `src/cli.ts`; subcommands live in `src/commands/`.
- `test/`: unit and integration tests. All run with `bun test`.
- `viewer/`: a separate Next.js project with its own `package.json`. Proxies blob content with inline-render headers and serves the password-gated dashboard. Deploys independently to Vercel.
- `skills/`: pre-built agent skills shipped to users via `npx skills add`. Two of them: `blob-cli-setup` and `blob-cli-share`. Each is a directory with a `SKILL.md` (YAML frontmatter + body).
- `dist/`: bundled CLI, built on publish. Gitignored.
- `scripts/release.sh`: release helper, invoked via `bun run release X.Y.Z`.
- `.github/workflows/publish.yml`: tag-triggered npm publish over OIDC. No API tokens to rotate.

## Tooling

Bun is the runtime and package manager. Use `bun test`, `bun run build`\*\*\*\*, `bun install --frozen-lockfile`. Don't shell out to `npm` for installs.

TypeScript strict mode. `tsconfig.json` at the root for the CLI, `viewer/tsconfig.json` for the viewer.

The CLI is bundled with `bun build --target=node` rather than transpiled file by file. The output `dist/cli.js` is what npm publishes.

## Common commands

```bash
bun test                  # full test suite (unit + integration)
bun test:integration      # integration tests only
bun run dev <args>        # run the CLI from source without rebuilding
bun run build             # rebuild dist/cli.js
bun run release 0.X.Y     # cut a release (see below)
```

## Release flow

`bun run release X.Y.Z` runs `scripts/release.sh`, which:

1. Validates the working tree is clean, the branch is `main`, and the tag doesn't already exist.
2. Bumps `package.json#version`.
3. Sweeps the install URL pin (`v<old>/install.sh` → `v<new>/install.sh`) across every file listed in `INSTALL_URL_FILES`. If you add a new doc that quotes the install URL, add it to that array.
4. Runs `bun test` and `bun run build`.
5. Commits, tags, pushes. The `publish.yml` workflow takes it from there.

## Things to keep in sync when changing the Deploy URL

The Vercel Deploy URL (the one that auto-provisions a private Blob store) appears in three places:

- `README.md`
- `viewer/README.md`
- `skills/blob-cli-setup/SKILL.md`

If you change any parameter (project name, env vars, `stores` config), update all three. There's no automation for this because the URL is structural, not version-pinned.

## Skill changes

`npx skills add bubuding0809/blob-cli` clones from GitHub `main`. A change to a `SKILL.md` ships to users the moment it lands on `main`. There's no version-bump dance for skills, so test carefully before merging.

## Viewer changes

`viewer/` is its own deploy target. Test it from the repo root with `cd viewer && bun test`. Run dev with `cd viewer && bun run dev`. Viewer changes only reach users' deployments when those users redeploy. The Deploy button clones from `tree/main/viewer`.
