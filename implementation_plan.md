# Redesign Vault System and App UX

## Goal Description
The objective is to overhaul the Vault system to enable secure, recommended variable storage, improve the global Dashboard and Settings popup, and add drag-and-drop pinning for sidebar projects. The final result should feel professional, responsive, and secure.

## User Review Required
> [!IMPORTANT]
> - **Component Extraction**: I will move `VaultPage` and `DashboardPage` into their own files to keep `AppLayout.tsx` maintainable.
> - **Sensitivity Logic**: A new `isSensitiveKey` utility will be extracted to `src/lib/utils.ts` and covered with tests.
> - **Settings Scope**: I will implement real UI content for "General" and "Vault" tabs. "Integrations" and "Account" will be polished UI shells for now, as they likely require more backend integration.

## Proposed Changes

### Refactoring & Utilities
#### [NEW] `src/lib/utils.ts`
- Implement `isSensitiveKey(key: string): boolean` based on: `*_KEY`, `*_SECRET`, `*_TOKEN`, `PASSWORD`, `DATABASE_URL`, `API_KEY`.

#### [NEW] `src/lib/utils.test.ts`
- Add unit tests for `isSensitiveKey`.

#### [NEW] `src/components/dashboard/DashboardPage.tsx`
- Extracted logic from `AppLayout.tsx` for the global dashboard.
- Refined to show more metadata per project (e.g., last used, environment counts if available).
- Ensures smooth transitions and clean typography matching standard developer tools.

#### [NEW] `src/components/vault/VaultPage.tsx`
- Extracted logic from `AppLayout.tsx` for the redesigned Vault view.

---

### Vault System Enhancements
To support comprehensive Vault visibility and secure variable management:
#### [MODIFY] `src/components/vault/VaultPage.tsx`
- Redesign the `VaultOverview` component to display a categorized list of all stored variables across all projects.
- Group secrets by project and allow explicit reveal actions to mask secrets.

#### [MODIFY] `src/stores/vaultStore.ts`
- Add a new state/action to fetch and cache all vault secrets across all projects for the Vault page.

#### [MODIFY] `src/components/variables/VariableRow.tsx`
- Enhance the action menu to clearly show "Store in Vault" vs "Remove from Vault".
- Implement `Copy` action.
- Use `isSensitiveKey` to show a "Recommended for Vault" badge if appropriate.

#### [MODIFY] `src/components/variables/VariableDetailDrawer.tsx`
- Use `isSensitiveKey` to prompt "This variable looks sensitive. Would you like to store it in Vault?".

---

### Sidebar & Pinned Projects
To support reorderable, persisted pinned projects in the sidebar:
#### [MODIFY] `src/stores/projectStore.ts`
- Add `pinnedProjectIds: string[]` state.
- Add generic `reorderPinnedProjects` and `togglePin` actions.
- Hydrate and persist `pinnedProjectIds` to `localStorage`.

#### [MODIFY] `src/components/project/ProjectList.tsx`
- Split the project list into "Pinned Projects" and "All Projects".
- Implement native HTML5 drag-and-drop for the "Pinned Projects" section.


---

### Settings Popup Redesign
To improve aesthetics and navigation in settings:
#### [MODIFY] `src/components/settings/SettingsPage.tsx`
- Reorganize the sidebar tabs into: General, Vault, Security, Integrations, Account.
- Move appearance settings to "General".
- Add real settings for "General" and "Vault", and polished shells for others.

## Verification Plan

### Automated Tests
- Run `npm run test` (or equivalent) for `src/lib/utils.test.ts`.

### Manual Verification
- **Sidebar Reordering:** I will ask you to open the app, pin a few projects, drag them around, and refresh the app to ensure the order persists (persisted via `localStorage`).
- **Vault Recommendations:** I will ask you to add an `API_KEY` to a project and verify that the UI recommends storing it in the Vault.
- **Vault Visibility:** I will ask you to open the Vault page and confirm that secrets from multiple projects are listed and masked by default.
- **Settings:** I will ask you to open the Settings popup and verify that "Appearance" is under "General" and that "Vault" settings are listed and functional.
