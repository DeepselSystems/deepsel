# Code Implementer Memory — cms-react

## Key Patterns

### useUpload import

`useUpload` is a **default export** — cannot be imported via `export * from './useUpload'` re-export barrel.
Always import directly: `import useUpload from '../../../hooks/useUpload'`

### TypeScript target is ES2020

`tsconfig.json` targets ES2020. `String.prototype.replaceAll` is ES2021+.
Use `str.replace(/ /g, '-')` instead of `str.replaceAll(' ', '-')`.

### uploadFileModel returns unknown[]

`useUpload.uploadFileModel` returns `Promise<unknown[]>`. Access first element with `attachmentResult[0]` (not lodash `head`) to avoid `no-unsafe-argument` ESLint errors. Then cast: `const item = (attachmentResult[0] ?? null) as MyType | null`.

### void for floating promises in ESLint

Any async call not awaited must be prefixed with `void` to satisfy `no-floating-promises`.
Inside callbacks: `onClick={() => { void asyncFn(); }}`

### DI pattern for hooks

`backendHost`, `user`, `setUser` are always passed as props to components (never accessed from stores directly inside components). `NotificationState` is the only store called directly inside components.

### AttachmentFile

Exported from `src/ui/ChooseAttachmentModal.tsx` — import with `import type { AttachmentFile } from '../../ChooseAttachmentModal'`

### User type

Exported from `src/stores/UserState.ts`, re-exported via `src/stores/index.ts`.
Import with `import type { User } from '../../../stores'`

## Key File Locations

- hooks barrel: `src/hooks/index.ts`
- stores barrel: `src/stores/index.ts`
- ui barrel: `src/ui/index.ts`
- NotificationState: `src/stores/NotificationState.ts`
- useUpload (default export): `src/hooks/useUpload.ts`
- useModel (named export): `src/hooks/useModel.ts`
- useFetch (named export): `src/hooks/useFetch.ts`
- AttachmentFile: `src/ui/ChooseAttachmentModal.tsx`
