"""Minimal built-in app for verifying the package-app seam.

Shows the conventions a consumer app follows:
- `models/*.py` — module-level classes with `__tablename__`, auto-registered
- `routers/*.py` — each module exposes a module-level `router`
- `data/__init__.py` — `import_order` listing seed CSVs
"""
