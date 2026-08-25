# @deepsel/admin

React admin UI library (Vite library build). Provides CRUD hooks, auth, layout, and a component system on top of Mantine 8 + MUI DataGrid. Depends on `@deepsel/cms-utils` (types/utilities) and `@deepsel/cms-react` (`FormRenderer`, `FormSubmissionViewer`, and form CSS).

## Setup in a consuming app

Two methods — pick one:

```jsx
// Imperative (before React renders)
import { configureAdmin } from '@deepsel/admin';
configureAdmin({ backendHost: 'http://localhost:8000' });

// Or provider (inside React tree)
import { DeepselAdminProvider } from '@deepsel/admin';
<DeepselAdminProvider backendHost="http://localhost:8000">{children}</DeepselAdminProvider>;
```

Import `@deepsel/admin/style.css` in your app entry for baseline styles.

Backend host resolution (if not explicitly set): `VITE_PUBLIC_BACKEND` → `PUBLIC_BACKEND` → `window.PUBLIC_BACKEND` → `localhost:8000` (dev) / `''` (prod). **`/api/v1` is appended automatically** — pass the bare host.

## Core hook: `useModel(modelName, options?)`

The primary mechanism for replacing mock data with real API calls.

```jsx
import { useModel } from '@deepsel/admin';

// List view
const {
  data,
  loading,
  total,
  page,
  setPage,
  pageSize,
  setPageSize,
  orderBy,
  setOrderBy,
  searchTerm,
  setSearchTerm,
  filters,
  setFilters,
  get,
  deleteWithConfirm,
} = useModel('customer', {
  autoFetch: true,
  searchFields: ['first_name', 'last_name', 'email'],
  syncPagingParamsWithURL: true,
});

// Detail view
const { record, setRecord, getOne, update } = useModel('customer', {
  id: params.id,
  autoFetch: true,
});

// Create
const { create, loading } = useModel('customer');
await create({ first_name: 'Jane', last_name: 'Doe' });
```

### What `useModel` does under the hood

| Method                               | HTTP                                | Endpoint                         |
| ------------------------------------ | ----------------------------------- | -------------------------------- |
| `get(query?)`                        | POST                                | `/{model}/search?skip=N&limit=N` |
| `getOne(id)`                         | GET                                 | `/{model}/{id}`                  |
| `create(item)`                       | POST                                | `/{model}`                       |
| `update(item)`                       | PUT                                 | `/{model}/{id}`                  |
| `del(id, force?)`                    | DELETE                              | `/{model}/{id}`                  |
| `bulkDelete(query?, force?)`         | POST                                | `/{model}/bulk_delete`           |
| `exportCSV(rows?)`                   | POST                                | `/{model}/export`                |
| `importCSV(file)`                    | POST                                | `/{model}/import`                |
| `uploadFile(file, fkField, record?)` | POST                                | `/attachment/` then PUT          |
| `deleteWithConfirm(ids)`             | Cascade check + modal + bulk delete |

All requests send `credentials: 'include'` (session cookie) and `X-Organization-Id` header. On 401, clears user state and redirects to `/login?redirect=...`.

### Search query shape

```json
POST /api/v1/customer/search?skip=0&limit=20
{
  "search": {
    "AND": [{"field": "status", "operator": "=", "value": "active"}],
    "OR":  [{"field": "first_name", "operator": "ilike", "value": "jane"}]
  },
  "order_by": {"field": "created_at", "direction": "desc"}
}
```

- `searchFields` option auto-generates OR conditions with `ilike` from `searchTerm`
- `filters` option populates AND conditions
- `ilike`/`like` auto-wrap in `%...%` server-side
- `syncPagingParamsWithURL: true` syncs page/limit/search/filters/orderBy to URL query params
- `filterAfterLoad` applies a client-side filter after API data loads

### Options reference

| Option                        | Type              | Default                         | Purpose                                           |
| ----------------------------- | ----------------- | ------------------------------- | ------------------------------------------------- |
| `id`                          | string/number     | null                            | Fetch single record on mount                      |
| `autoFetch`                   | boolean           | false                           | Fetch on mount + when page/filters/orderBy change |
| `syncPagingParamsWithURL`     | boolean           | false                           | Persist pagination state in URL                   |
| `searchFields`                | string[]          | []                              | Fields for text search (OR ilike)                 |
| `page`                        | number            | 1                               | Initial page                                      |
| `pageSize`                    | number/null       | 20                              | Items per page (null = all)                       |
| `filters`                     | FilterCondition[] | []                              | Initial AND filters                               |
| `orderBy`                     | OrderBy           | `{field:'id',direction:'desc'}` | Initial sort                                      |
| `redirectLoginIfUnauthorized` | boolean           | true                            | Redirect to login on 401                          |
| `abortPreviousRequest`        | boolean           | true                            | Cancel inflight on new request                    |
| `filterAfterLoad`             | function          | null                            | Client-side post-filter                           |

## Auth

### `useAuthentication()`

```jsx
import { useAuthentication } from '@deepsel/admin';

const { user, login, logout, signup, fetchUser, loading, error } = useAuthentication();

// Login
await login({ identifier: 'user@example.com', password: 'pass', otp: '123456' });

// Logout (returns never — navigates away)
await logout();
```

Auth uses httpOnly session cookies — no client-side token storage. The browser sends cookies automatically via `credentials: 'include'`.

Key methods:

- `login({ identifier, password, otp? })` — POST `/token` (form-encoded)
- `signup({ email, password }, autoLogin?)` — POST `/signup`
- `logout()` — POST `/logout/oidc` then `/logout`
- `fetchUser()` — GET `/user/util/me` (refresh from session)
- `fetchLoginOrganizations(username)` — POST `/login/organizations`

### Route guards

```jsx
import { RequireAuth, PublicAuth, VisibilityControl } from '@deepsel/admin';

// Protected routes — redirects to /login if unauthenticated
<Route element={<RequireAuth />}>
  <Route path="/dashboard" element={<Dashboard />} />
</Route>

// Public routes — silently tries to fetch user (no redirect)
<Route element={<PublicAuth />}>
  <Route path="/public-page" element={<PublicPage />} />
</Route>

// Role-based visibility
<VisibilityControl roleIds={['admin_role']} render={false}>
  <AdminOnlyButton />
</VisibilityControl>
```

`RequireAuth` handles authless mode automatically — if `siteSettings.authless` is true, it logs in with `authless/authless` silently.

## Zustand stores

Global state via zustand singletons. Usable as hooks or via `.getState()`.

| Store                     | Key state                                   | Purpose                                  |
| ------------------------- | ------------------------------------------- | ---------------------------------------- |
| `UserState`               | `user`, `setUser`, `logout`                 | Current user                             |
| `BackendHostURLState`     | `backendHost`, `setBackendHost`             | API base URL                             |
| `OrganizationIdState`     | `organizationId`, `setOrganizationId`       | Selected org (persisted to localStorage) |
| `OrganizationState`       | `organizations`, `setOrganizations`         | All orgs list                            |
| `NotificationState`       | `notify(message, type, duration)`           | Toast notifications                      |
| `SitePublicSettingsState` | `settings`, `setSettings`                   | Org public settings                      |
| `SidebarState`            | `isCollapsed`, `setUserPreferenceCollapsed` | Sidebar state                            |

Others: `APISchemaState`, `FileAttachmentState`, `NavigationConfirmationState`, `ShowHeaderBackButtonState`, `ShowSiteSelectorState`, `GoToSiteLinkState`, `HideHeaderItemsState`, `ChatBoxState`.

## Layout

```jsx
import { AppLayout } from '@deepsel/admin';
import { IconHome, IconUsers } from '@tabler/icons-react';

const navLinks = [
  { label: 'Dashboard', icon: IconHome, to: '/dashboard' },
  { label: 'Customers', icon: IconUsers, to: '/customers' },
  {
    label: 'Admin',
    icon: IconSettings,
    roleIds: ['admin_role'], // role-gated
    children: [
      { label: 'Users', to: '/users' },
      { label: 'Roles', to: '/roles' },
    ],
  },
];

<Route element={<RequireAuth />}>
  <Route element={<AppLayout navbarLinks={navLinks} />}>
    <Route path="/dashboard" element={<Dashboard />} />
  </Route>
</Route>;
```

Props: `navbarLinks`, `navbarWidth` (220), `headerHeight` (50), `breakpoint` ('sm'), `showApps` (true), `showSiteSelector`.

Header includes: burger toggle, sidebar collapse, site selector (multi-org), "go to site" link, apps dropdown, profile dropdown. Sidebar collapse persists to user preferences on the server.

## UI components

All exported from `@deepsel/admin` (Mantine underneath, prefixed `--dsl-*` CSS tokens):

**Form inputs:** `TextInput`, `TextArea`, `NumberInput`, `PasswordInput`, `SecretInput`, `Select`, `MultiSelect`, `Checkbox`, `Switch`, `Radio`, `RadioGroup`, `DateInput`, `DatePickerInput`, `DateTimePickerInput`, `DebounceInput`, `DebounceArea`, `FileInput`, `RecordSelect`, `RecordSelectMulti`

**Display:** `H1`, `H2`, `H3`, `Badge`, `Chip`, `ChipColor`, `Card`, `Divider`, `ColorDisplay`, `HtmlDisplay`, `ReadOnlyField`, `RecordChipDisplay`, `RecordDisplay`, `UserAvatar`, `NumberFormatter`, `FileDisplay`, `FileChipDisplay`, `Masonry`, `LinkedCell`, `SplitButton`

**Scaffolding:** `ListViewPagination`, `ListViewSkeleton`, `FormViewSkeleton`, `ChartViewSkeleton`, `CreateFormActionBar`, `EditFormActionBar`, `ViewFormActionBar`, `CreateFormWrapper`, `DataGridColumnMenu`

**Attachments:** `AttachmentDropzone`, `AttachmentPreview`, `AttachmentCardOverlay`, `ChooseAttachmentModal`, `EnhancedImageSelector`

**Rich text:** `RichTextInput` (Tiptap-based), `RichTextEditor`, `RichTextRenderer`

### `RecordSelect` — FK selector

Searchable dropdown that queries a backend model. Supports inline create via modal.

```jsx
<RecordSelect
  model="plan"
  value={record.plan_id}
  onChange={(id) => setRecord({ ...record, plan_id: id })}
  searchFields={['name']}
  renderOption={(item) => item.name}
  renderValue={(item) => item.name}
  createView={PlanCreateForm} // optional inline create
/>
```

### Action bars

```jsx
// Create page header
<CreateFormActionBar title="New Customer" onSave={handleSave} loading={loading} />

// Edit page header
<EditFormActionBar title={record?.name} onSave={handleSave} onDelete={handleDelete} loading={loading} />
```

## File uploads

```jsx
import { useModel, useUpload, useUploadSizeLimit } from '@deepsel/admin';

const { uploadFile } = useModel('equipment');
// Upload + link to record in one call:
await uploadFile(file, 'photo_attachment_id', record);

// Or raw upload:
const { uploadFileModel } = useUpload();
const attachments = await uploadFileModel('/attachment/', files);
// Returns [{ id, name, content_type, filesize, ... }]
// Serve URL: /api/v1/attachment/serve-by-name/{name}

// Upload size limit:
const { uploadSizeLimit } = useUploadSizeLimit(); // cached GET /attachment/config/upload_size_limit
```

## One-to-many relationships

```jsx
import { useOne2many } from '@deepsel/admin';

const { create, update, loading } = useOne2many({
  parentRecord: customer,
  childModel: 'equipment',
  relationshipName: 'equipment', // key on parent record holding child array
  foreignKeyField: 'customer_id',
});

// Diff-based save: creates new, updates changed, deletes removed
await update(editedEquipmentList, customer);
```

## Other hooks

| Hook                                      | Purpose                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `useFetch(url)`                           | Generic fetch with auth/org headers. Returns `get`, `post`, `put`, `del` |
| `useAPISchema(model)`                     | Introspects `/openapi.json` for column types (string, enum, date-time)   |
| `useUserPreferences(key, {defaultValue})` | Read/write keys in `user.preferences` JSON column                        |
| `usePrefillData(defaults)`                | Reads `?prefill=<JSON>` from URL to pre-populate create forms            |
| `useBack()` / `useBackWithRedirect()`     | Navigation helpers                                                       |
| `usePageTitle()`                          | Sets document title                                                      |
| `useOrganization()`                       | Fetches and manages org list                                             |
| `useEditSession(type, id)`                | WebSocket presence + live updates (collab editing)                       |
| `useDraftAutosave({...})`                 | Debounced (2s) draft saving to `/draft/save_draft`                       |
| `useUploadSizeLimit()`                    | Cached upload size config                                                |

## Theming

```jsx
import { adminMantineTheme, adminCssVariablesResolver } from '@deepsel/admin';
import { MantineProvider, mergeThemeOverrides } from '@mantine/core';

const myTheme = mergeThemeOverrides(adminMantineTheme, {
  /* overrides */
});

<MantineProvider theme={myTheme} cssVariablesResolver={adminCssVariablesResolver}>
  {children}
</MantineProvider>;
```

Override `--dsl-*` CSS custom properties for re-skinning. Color scheme is forced to "light" (`forceColorScheme="light"`).

## Peer dependencies

React 18+, react-router-dom 7+, Mantine 8+ (core, modals, dates, dropzone, form, hooks, notifications, tiptap, charts), MUI 5 (material, x-data-grid), zustand 5, dayjs, i18next >=25, react-i18next >=13.2.2, @tabler/icons-react, emotion. `@deepsel/cms-react` and `@deepsel/cms-utils` are regular dependencies (pulled in automatically).

## View patterns

See the `integrate-backend` skill for step-by-step patterns for converting mock data views to real API-backed views, including list/create/edit page templates.
