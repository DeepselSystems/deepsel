# Publishing Guide

This guide explains how to publish `deepsel` to PyPI.

## Quick Reference

```bash
# 1. Bump version (automatically updates pyproject.toml and submodules' __init__.py files)
make bump-patch  # or bump-minor, bump-major

# 2. Update CHANGELOG.md
# 3. Run checks
make prepush

# 4. Commit and tag
git add .
git commit -m "Describe changes"
git tag v0.2.0
git push origin v0.2.0

# 5. GitHub Actions automatically publishes to PyPI
# 6. Monitor: https://github.com/DeepselSystems/deepsel/actions
```

## Publishing Steps

### 1. Update Version

Use the automated version bump commands:

```bash
make version       # Check current version
make bump-patch    # Bug fixes: 0.1.0 → 0.1.1
make bump-minor    # New features: 0.1.0 → 0.2.0
make bump-major    # Breaking changes: 0.1.0 → 1.0.0
```

These commands automatically update the version in `pyproject.toml` and submodules' `__init__.py` files.


### 2. Run Pre-push Checks

```bash
make prepush
```

This runs all quality checks:
- Code formatting (black)
- Linting (flake8)
- Security checks (bandit)
- Tests with coverage (pytest)
- Package build and validation

### 3. Commit and Tag

```bash
# Commit your changes
git add .
git commit -m "Describe changes"

# Create and push tag
git tag v0.2.0
git push origin v0.2.0
```

### 4. Automatic Publishing

**The GitHub Actions workflow will automatically:**
1. Trigger on the tag push (format: `v*.*.*`)
2. Install dependencies
3. Run quality checks (format, lint, security, tests)
4. Build the package
5. Validate the distribution
6. Publish to PyPI

**Monitor the workflow:**
- Visit: https://github.com/DeepselSystems/deepsel/actions
- Check the "Publish to PyPI" workflow run

### 5. Manual Publishing (Alternative)

If you need to publish manually, configure your `.pypirc`  for authentication: 

Create `~/.pypirc`:

```bash
cp .pypirc.example .pypirc
```

Edit `~/.pypirc`:

```ini
[distutils]
index-servers =
    pypi

[pypi]
username = __token__
password = <your-pypi-token>
```

Then publish to PyPI:
```bash
make publish
```

### 6. Verify package on PyPI

Visit https://pypi.org/project/deepsel/ and verify version number is correct

### 7. (Optional) Create GitHub release with notes
   - Go to repository Releases
   - Click "Draft a new release"
   - Choose the existing tag (e.g., `v0.2.0`)
   - Add release title and description
   - Click "Publish release"

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes → `make bump-major`
- **MINOR** (0.1.0): New features, backward compatible → `make bump-minor`
- **PATCH** (0.0.1): Bug fixes, backward compatible → `make bump-patch`

Use `make version` to check the current version at any time.



