# Stigmergy Project Migration Design Document

## 1. Objective
Separate the `@hierophage/stigmergy` (core engine) and `@hierophage/stigmergy-web` (visualization dashboard) packages from the `hierophage-cli` fork into a standalone, lightweight monorepo. The goal is to create a portable, easy-to-share repository that maintains generic build tooling without the weight of the original CLI project.

## 2. Analysis of Current State
*   **Location**: Currently nested within `packages/` in a large monorepo.
*   **Coupling**:
    *   **Runtime**: The packages are loosely coupled to the rest of the CLI. Imports are primarily internal or to standard libraries. There are zero runtime dependencies on sibling packages (like `core` or `cli`) other than `@hierophage/stigmergy` itself.
    *   **Build Time**: Highly coupled. Relies on:
        *   Root `package.json` for devDependencies (Typescript, Vitest, ESLint, Prettier).
        *   Root `tsconfig.json` for base configuration.
        *   Root `eslint.config.js`.
        *   Shared `scripts/build_package.js` and `scripts/copy_files.js`.

## 3. Target Architecture
We will adopt a standard **NPM Workspace** (or Yarn/PNPM) structure. This minimizes tooling complexity while allowing the `web` package to consume the `core` package locally.

### Proposed Directory Structure
```text
stigmergy-monorepo/
├── .gitignore             # Specific to this project
├── package.json           # New root workspace definition
├── tsconfig.json          # Base configuration (migrated)
├── eslint.config.js       # Linting rules (migrated)
├── scripts/               # extracted build tooling
│   ├── build_package.js
│   └── copy_files.js
└── packages/
    ├── stigmergy/         # Core logic
    └── stigmergy-web/     # Viz/UI
```

## 4. detailed Migration Plan

### Phase 1: Repository Initialization
1.  Initialize a new empty git repository.
2.  Create a `.gitignore` specifically tailored for this project (ignoring `node_modules`, `dist`, `.env.local`, coverage reports).

### Phase 2: Code Extraction
1.  **Core Package**: Copy `packages/stigmergy` -> `new-repo/packages/stigmergy`.
2.  **Web Package**: Copy `packages/stigmergy-web` -> `new-repo/packages/stigmergy-web`.
3.  **Sanitization**:
    *   Delete nested `node_modules` and `dist` directories to ensure a clean state.
    *   Verify `package.json` in both packages. Ensure `@hierophage/stigmergy-web` depends on `*` or `workspace:*` version of `@hierophage/stigmergy`.

### Phase 3: Build System Relocation
The current projects rely on scripts located two levels up (`../../scripts`). We must preserve this relative pathing or update the package scripts.

1.  **Create Scripts Directory**: `mkdir scripts` in the new repo root.
2.  **Migrate Scripts**:
    *   Copy `hierophage-cli/scripts/build_package.js` -> `new-repo/scripts/`.
    *   Copy `hierophage-cli/scripts/copy_files.js` -> `new-repo/scripts/`.
3.  **Validate Configs**:
    *   *Self-Check*: `build_package.js` contains a check `if (!process.cwd().includes('packages'))`. This logic remains valid in the new structure and requires no changes.
    *   *Path Check*: The `scripts` in `packages/stigmergy/package.json` call `node ../../scripts/build_package.js`. This relative path remains valid in the new structures.

### Phase 4: Root Configuration (The Critical Step)
Dependencies currently provided by the monorepo root must be explicitly defined in the new root.

1.  **`tsconfig.json`**: Copy the root `tsconfig.json`.
    *   *Action*: Ensure `include` and `exclude` paths are generic enough for the new repo.
2.  **`eslint.config.js`**: Copy the root config.
    *   *Refinement*: You may want to simplify the `ignores` list to remove irrelevant paths (like `gemini-cli` internals, `sandbox` etc).
3.  **Root `package.json`**: Create a new file.
    *   **Workspaces**: `["packages/*"]`
    *   **Scripts**:
        ```json
        "build": "npm run build --workspaces",
        "test": "npm run test --workspaces --if-present",
        "dev": "npm run dev -w @hierophage/stigmergy-web"
        ```
    *   **DevDependencies**: You must manually identify which versions are currently used. Based on current checks, install:
        *   `typescript`
        *   `vitest`
        *   `eslint`, `typescript-eslint`, `@eslint/js`, `globals`
        *   `prettier`, `eslint-config-prettier`
        *   `tsx` (for running TS scripts if needed)
        *   `@types/node`

### Phase 5: CI/CD & Automation
Since we are losing the parent repo's CI:
1.  **GitHub Actions**: Create `.github/workflows/ci.yml`.
    *   Trigger: On push to main, and PRs.
    *   Steps: `npm install`, `npm run build`, `npm run test`, `npm run lint`.

## 5. Verification Checklist

- [ ] **Install**: `npm install` runs cleanly in the root.
- [ ] **Linking**: `packages/stigmergy-web` node_modules contains a symlink to `../stigmergy`.
- [ ] **Build Core**: `cd packages/stigmergy && npm run build` completes and generates `dist/`.
- [ ] **Build Web**: `cd packages/stigmergy-web && npm run build` completes using the local core build.
- [ ] **Tests**: Unit tests pass in the core package.
- [ ] **Runtime**: `npm run dev` in the web package launches the UI and it connects to the server successfully.

## 6. Future Considerations
*   **Renaming**: If you wish to drop the `@hierophage` scope or rename the packages, do it immediately after migration (Phase 2) before publishing or sharing.
*   **Publishing**: If you plan to publish to NPM, you may need a tool like `changesets` or `lerna` to manage versioning, as the current repo uses a simplified custom release process.
