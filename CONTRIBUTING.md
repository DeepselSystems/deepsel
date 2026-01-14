# Contributing to Deepsel Monorepo

Thank you for your interest in contributing to Deepsel! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/DeepselSystems/deepsel.git
   cd deepsel
   ```

2. **Install development dependencies**
   ```bash
   make install-dev
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Code Style

We use the following tools to maintain code quality:

- **Black** for code formatting (line length: 88)
- **Flake8** for linting
- **Bandit** for security checks
- **Pytest** for testing with coverage

Before committing, ensure your code passes all checks:

```bash
make format      # Format code
make lint        # Run linting
make security    # Run security checks
make test        # Run tests
```

### Version Management

Use the following commands to manage package versions:

```bash
make version       # Show current version
make bump-patch    # Bump patch version (0.0.X) - for bug fixes
make bump-minor    # Bump minor version (0.X.0) - for new features
make bump-major    # Bump major version (X.0.0) - for breaking changes
```

These commands automatically update the version in `pyproject.toml`.


### Testing in Other Projects

If you want to test your changes in another project that uses `deepsel`:

```bash
# 1. Activate your other project's virtual environment
cd ~/projects/your-app
source venv/bin/activate  # or: .venv/bin/activate

# 2. Install deepsel in editable mode from your local repo
pip install -e ~/Desktop/deepsel

# 3. Your app now uses your local development code
python main.py  # Uses code from ~/Desktop/deepsel

# 4. Make changes to deepsel source code
cd ~/Desktop/deepsel
nano deepsel/sqlalchemy/db_manager.py

# 5. Test immediately - no reinstall needed
cd ~/projects/your-app
python main.py  # Automatically sees your changes
```

This editable install creates a link to your source code, so changes are immediately reflected in the other project's venv.

### Commit Messages

Follow conventional commit format:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test additions or changes
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

Example:
```
feat: add support for MySQL databases
```

## Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all tests pass
4. Update CHANGELOG.md with your changes
5. Submit PR with clear description of changes

## Code Review

- PRs require at least one approval
- Address all review comments
- Keep PRs focused and reasonably sized

## Questions?

Open an issue for questions or discussions about contributions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
