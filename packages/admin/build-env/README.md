Intentionally empty.

`vite.config.lib.js` sets `envDir` to this directory so the library build never
loads `packages/admin/.env` (which carries `VITE_PUBLIC_BACKEND=http://localhost:8000`
for the standalone admin dev server). Without it, `vite build` constant-folds that
value into `src/constants/backendHost.js` and the published bundle sends every
request to an absolute `http://localhost:8000/api/v1`.

Do not add a `.env` here.
