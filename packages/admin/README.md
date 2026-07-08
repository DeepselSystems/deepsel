# @deepsel/admin

React building blocks for FastAPI + deepsel backends — auth, CRUD hooks, stores, and the admin UI shell.

This README covers the **standalone-host** case: you have a FastAPI/deepsel backend and want to build a custom React frontend that uses `@deepsel/admin`'s hooks and views without mounting the full admin app.

## Install

```bash
npm install @deepsel/admin
```

The package declares these as **peer dependencies** — install the matching versions in your app:

```bash
npm install \
  react@^18 react-dom@^18 \
  @mantine/core@8.3.15 @mantine/hooks@8.3.15 @mantine/modals@8.3.15 \
  @mantine/dates@8.3.15 @mantine/form@8.3.15 \
  react-router-dom@^7.6 \
  i18next@^25 react-i18next@^13 \
  zustand@^5 dayjs@^1.11
```

## Configure backend URL

You have three options, picked in this priority order:

**1. Runtime API (recommended for consumers)** — call `configureAdmin` at app entry, before rendering any admin component:

```js
import { configureAdmin } from '@deepsel/admin';
configureAdmin({ backendHost: 'http://localhost:8000' });
```

Or wrap your tree with `<DeepselAdminProvider>` — it applies the value synchronously before children render, so the first request sees the configured host:

```jsx
import { DeepselAdminProvider } from '@deepsel/admin';

<DeepselAdminProvider backendHost="http://localhost:8000">
  <YourAdminTree />
</DeepselAdminProvider>;
```

**2. Build-time env var** — for Vite consumers, set this in `.env.development` (or your shell):

```
VITE_PUBLIC_BACKEND=http://localhost:8000
```

**3. Global** — set `window.PUBLIC_BACKEND` before importing `@deepsel/admin`.

The package auto-appends `/api/v1` if the URL doesn't already include it. The default dev login for a fresh deepsel backend is `admin` / `1234`.

Your backend needs CORS configured to allow your dev origin **with credentials** (the package uses `credentials: 'include'` and httpOnly session cookies):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Provider stack

The hooks and Login require this provider tree, in this order. Drop into your `src/main.jsx`:

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { BasenameProvider } from '@deepsel/admin';
import '@mantine/core/styles.css';
import '@deepsel/admin/style.css';
import App from './App.jsx';

i18n.use(initReactI18next).init({
  resources: { en: { translation: {} } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

createRoot(document.getElementById('root')).render(
  <I18nextProvider i18n={i18n}>
    <BasenameProvider value="/">
      <BrowserRouter>
        <MantineProvider>
          <ModalsProvider>
            <App />
          </ModalsProvider>
        </MantineProvider>
      </BrowserRouter>
    </BasenameProvider>
  </I18nextProvider>,
);
```

The order matters: `Login` uses `useNavigate` (needs Router), `t()` (needs i18n), Mantine components (needs MantineProvider), and `useBasename` (needs BasenameProvider). `useModel`'s `deleteWithConfirm` opens a Mantine modal (needs ModalsProvider).

`@deepsel/admin/style.css` carries the bundled Mantine + cms-utils styles — without it, components render unstyled.

## Theming & overrides

The admin ships the **CX1 design system** as the default look (indigo accent, compact
type, soft shadows). `<App/>` applies it through its own internal `MantineProvider`,
so you get the styled defaults just by mounting it — no theme wiring needed.

All visual values resolve from namespaced `--dsl-*` CSS variables. To re-skin, redefine
any of them **after** importing the stylesheet — one variable flows through every Mantine
component, the `.dsl-*` classes, and the Tailwind composites at once:

```css
/* your app.css, imported after '@deepsel/admin/style.css' */
:root {
  --dsl-accent: #0a7d4f; /* buttons, links, focus rings, active tabs… */
  --dsl-radius-sm: 6px; /* input corners */
  --dsl-font: 'Inter', sans-serif;
}
```

Full token list: [`src/theme/tokens.css`](src/theme/tokens.css). Per-instance overrides
still work via Mantine's `classNames` / `styles` / `variant` props on any primitive.

Building your own screens with the styled primitives (outside `<App/>`, under your own
`MantineProvider`)? Import the theme so they match:

```jsx
import { MantineProvider, mergeThemeOverrides } from '@mantine/core';
import { Button, TextInput, adminMantineTheme, adminCssVariablesResolver } from '@deepsel/admin';

<MantineProvider theme={adminMantineTheme} cssVariablesResolver={adminCssVariablesResolver}>
  <Button>Styled</Button>
</MantineProvider>;
```

## Auth gate

```jsx
// src/App.jsx
import { useEffect, useState } from 'react';
import { Login, UserState, useAuthentication } from '@deepsel/admin';
import YourApp from './YourApp.jsx';

export default function App() {
  const { user } = UserState();
  const { fetchUser } = useAuthentication();
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    fetchUser()
      .catch(() => {})
      .finally(() => setBootstrapping(false));
  }, []);

  if (bootstrapping) return null;
  if (!user) return <Login defaultRedirect="/" />;
  return <YourApp />;
}
```

`fetchUser()` calls `GET /user/util/me` with the session cookie; a 401 means the user isn't signed in. `<Login>` accepts a `defaultRedirect` prop (default `/pages`) — set it to wherever your app's authenticated home lives.

## Use the CRUD hook

```jsx
import { useModel } from '@deepsel/admin';

function ItemList() {
  const { data, loading, create, update, deleteWithConfirm } = useModel('your_table', {
    autoFetch: true,
    pageSize: 50,
  });

  if (loading) return <p>Loading...</p>;
  return (
    <ul>
      {data.map((item) => (
        <li key={item.id} onClick={() => deleteWithConfirm(item.id)}>
          {item.name}
        </li>
      ))}
    </ul>
  );
}
```

`useModel(modelName)` hits `POST /{modelName}/search`, `POST /{modelName}`, `PUT /{modelName}/{id}`, `DELETE /{modelName}/{id}`. The model name is the backend `__tablename__` (e.g. `ims_insight`, not `Insight`). Field shapes use the backend's snake_case directly — no transformation.

## Vite consumers

Once on a recent published version of `@deepsel/admin` (≥ 1.13), no special vite config is needed — peer deps prevent duplication. If you're consuming via a local `file:` link to source, add a minimal dedupe to be safe:

```js
// vite.config.js
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks', '@mantine/modals'],
  },
});
```

## What's exported

See [`src/index.js`](src/index.js) for the full surface. Highlights:

- **Hooks**: `useModel`, `useFetch`, `useUpload`, `useAuthentication`, `useOrganization`, `useUserPreferences`, `usePageTitle`, `useQuery`, `usePagingTableParams`, …
- **Components**: `Login`, `RequireAuth`, `VisibilityControl`, `AppLayout`, `App` (the full admin shell)
- **State stores** (Zustand): `UserState`, `OrganizationIdState`, `BackendHostURLState`, `NotificationState`, `OrganizationState`, …
- **Contexts**: `BasenameProvider`, `AIProviderConfigProvider`
