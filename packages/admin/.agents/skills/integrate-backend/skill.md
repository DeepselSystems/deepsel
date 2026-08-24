---
name: integrate-backend
description: >-
  Replace mock/local data in a React app with real deepsel backend API calls using @deepsel/admin hooks. Use when wiring up useModel, auth, file uploads, or converting zustand mock stores to server-backed CRUD.
---

# Backend integration with @deepsel/admin

This skill covers converting a React app from mock/local data to a live deepsel FastAPI backend. The app uses `@deepsel/admin` for hooks and components.

## Pre-flight

1. **Identify the backend tables.** Check `apps/{app}/models/` for model files — each has a `__tablename__` that becomes the `modelName` argument to `useModel`.
2. **Identify the mock data layer.** Typically a zustand store or local state with hardcoded arrays. Map each mock entity to its backend table.
3. **Check permissions.** The backend's `role.csv` must grant the user's role access to each table (`table:action:scope`). If 403s occur, check the role CSV.
4. **Check AUTHLESS mode.** If `AUTHLESS=true` in backend `.env`, requests run as the seeded admin user — no login UI needed, but `RequireAuth` still handles it automatically (logs in as `authless/authless`).

## Step 1: App setup

```jsx
// main.jsx or App.jsx
import { configureAdmin } from '@deepsel/admin';
import '@deepsel/admin/style.css';

configureAdmin({ backendHost: 'http://localhost:8000' });
// Do NOT append /api/v1 — it's added automatically
```

If using Vite dev server, proxy the backend:

```js
// vite.config.js
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
```

With a proxy, set `backendHost` to `''` (empty string) so requests go through the proxy.

## Step 2: Auth + routing skeleton

```jsx
import { RequireAuth, AppLayout, Login } from '@deepsel/admin';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout navbarLinks={navLinks} />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<CustomerList />} />
            <Route path="/customers/new" element={<CustomerCreate />} />
            <Route path="/customers/:id" element={<CustomerEdit />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

## Step 3: Convert list views

**Before (mock):**

```jsx
const { customers } = useStore();
```

**After (API):**

```jsx
import { useModel, ListViewPagination } from '@deepsel/admin';

function CustomerList() {
  const query = useModel('customer', {
    autoFetch: true,
    searchFields: ['first_name', 'last_name', 'email', 'phone'],
    syncPagingParamsWithURL: true,
    orderBy: { field: 'created_at', direction: 'desc' },
  });
  const { data, loading, total, deleteWithConfirm } = query;

  // DataGrid, cards, or table using `data`
  // Pagination:
  return <ListViewPagination query={query} />;
}
```

### Filtering

```jsx
// Programmatic filter
const query = useModel('visit', {
  autoFetch: true,
  filters: [
    { field: 'customer_id', operator: '=', value: customerId },
    { field: 'status', operator: '=', value: 'scheduled' },
  ],
});

// User-driven search (wired to a search input)
const { searchTerm, setSearchTerm } = query;
<TextInput value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />;
```

### Sorting

```jsx
const { orderBy, setOrderBy } = query;
// Clicking a column header:
setOrderBy({ field: 'name', direction: orderBy.direction === 'asc' ? 'desc' : 'asc' });
```

## Step 4: Convert create views

**Before:**

```jsx
const { addCustomer } = useStore();
addCustomer({ name, email });
```

**After:**

```jsx
import { useModel, CreateFormActionBar } from '@deepsel/admin';
import { useNavigate } from 'react-router-dom';

function CustomerCreate() {
  const [record, setRecord] = useState({ first_name: '', last_name: '' });
  const { create, loading } = useModel('customer');
  const navigate = useNavigate();

  const handleSave = async () => {
    const created = await create(record);
    if (created) navigate(`/customers/${created.id}`);
  };

  return (
    <>
      <CreateFormActionBar title="New Customer" onSave={handleSave} loading={loading} />
      <TextInput
        label="First Name"
        value={record.first_name}
        onChange={(e) => setRecord({ ...record, first_name: e.target.value })}
      />
    </>
  );
}
```

## Step 5: Convert edit views

**Before:**

```jsx
const customer = customers.find((c) => c.id === id);
updateCustomer(id, changes);
```

**After:**

```jsx
import { useModel, EditFormActionBar } from '@deepsel/admin';

function CustomerEdit() {
  const { id } = useParams();
  const { record, setRecord, update, loading } = useModel('customer', {
    id,
    autoFetch: true,
  });

  const handleSave = async () => {
    await update(record);
  };

  if (!record) return <FormViewSkeleton />;

  return (
    <>
      <EditFormActionBar title={record.first_name} onSave={handleSave} loading={loading} />
      <TextInput
        label="First Name"
        value={record.first_name || ''}
        onChange={(e) => setRecord({ ...record, first_name: e.target.value })}
      />
    </>
  );
}
```

## Step 6: Delete

```jsx
// Single delete with cascade check + confirmation modal
const { deleteWithConfirm } = useModel('customer');
await deleteWithConfirm([customerId], () => navigate('/customers'));

// Bulk delete
const { bulkDelete } = useModel('customer');
await bulkDelete(null, true); // force=true skips cascade check
```

## Step 7: Related data

### FK fields — use `RecordSelect`

```jsx
import { RecordSelect } from '@deepsel/admin';

<RecordSelect
  model="plan"
  label="Membership Plan"
  value={record.plan_id}
  onChange={(id) => setRecord({ ...record, plan_id: id })}
  searchFields={['name']}
  renderOption={(item) => item.name}
  renderValue={(item) => item.name}
/>;
```

### One-to-many — use `useOne2many`

```jsx
import { useOne2many } from '@deepsel/admin';

const { update: saveEquipment, loading } = useOne2many({
  parentRecord: customer,
  childModel: 'equipment',
  relationshipName: 'equipment',
  foreignKeyField: 'customer_id',
});

// On save: diffs the array, creates/updates/deletes as needed
await saveEquipment(editedEquipmentList, customer);
```

### Fetching related data separately

```jsx
// Fetch visits for a specific customer
const { data: visits } = useModel('visit', {
  autoFetch: true,
  filters: [{ field: 'customer_id', operator: '=', value: customerId }],
});
```

## Step 8: File uploads

```jsx
import { useModel, AttachmentDropzone } from '@deepsel/admin';

const { uploadFile } = useModel('equipment');

// Upload and link to a record's FK field in one call
await uploadFile(file, 'photo_attachment_id', equipmentRecord);

// Serve URL for display
const photoUrl = `/api/v1/attachment/serve-by-name/${attachment.name}`;
```

## Step 9: Notifications

```jsx
import { NotificationState } from '@deepsel/admin';

NotificationState.getState().notify('Customer saved', 'success');
NotificationState.getState().notify('Something went wrong', 'error');
```

## Common gotchas

- **Model name = CRUDRouter `prefix`**, not `__tablename__` or the Python class name. Check `apps/{app}/routers/*.py` for the `prefix=` argument. When table names are prefixed (e.g., `hvac_customer`), the router typically drops the app prefix (e.g., `customer`).
- **Numeric/Decimal fields are strings.** Backend `Numeric`/`Decimal` columns arrive as string values (e.g., `"199.00"` not `199.00`). Wrap with `Number()` before arithmetic or `.toFixed()`: `Number(record.amount || 0).toFixed(2)`.
- **`backendHost: ''` and env vars.** `VITE_PUBLIC_BACKEND` takes precedence over an explicit `backendHost: ''` because empty string is falsy. Unset the env var when using a Vite proxy.
- **No GET list route by default** — listing is `POST /search`. `useModel.get()` does this.
- **Search implicitly filters `active=True`** — soft-deleted rows are hidden.
- **`getOne` on a missing ID returns 403**, not 404 (permission-scoped query matches nothing).
- **Update schema may require all non-nullable fields** unless the backend passes a custom all-optional `update_schema` to `CRUDRouter`. Check for 422s on partial updates.
- **Date objects** are auto-converted to naive ISO strings by `useModel` (strips timezone).
- **`X-Organization-Id` header** is sent automatically from `OrganizationIdState`. For AUTHLESS single-tenant apps, org ID defaults to 1.
- **Empty `backendHost`** is valid — means requests go to the same origin (useful with Vite proxy or when served from the same domain).
