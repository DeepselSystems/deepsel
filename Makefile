.PHONY: help install install-dev clean test lint format build publish publish-test check-dist security prepush

help:
	@echo "Deepsel Monorepo - Makefile Commands"
	@echo "================================="
	@echo ""
	@echo "Development:"
	@echo "  make install          - Install package in production mode"
	@echo "  make install-dev      - Install package with dev dependencies"
	@echo "  make clean            - Remove build artifacts and cache files"
	@echo ""
	@echo "Code Quality:"
	@echo "  make test             - Run tests with coverage"
	@echo "  make lint             - Run linting checks (flake8)"
	@echo "  make security         - Run security checks (bandit)"
	@echo "  make format           - Format code with black"
	@echo "  make format-check     - Check code formatting without changes"
	@echo ""
	@echo "Building & Publishing:"
	@echo "  make build            - Build distribution packages"
	@echo "  make check-dist       - Check distribution package"
	@echo "  make publish-test     - Publish to TestPyPI"
	@echo "  make publish          - Publish to PyPI (production)"
	@echo ""
	@echo "Utilities:"
	@echo "  make version          - Show current package version"
	@echo "  make tree             - Show project structure"

install:
	pip install -e .

install-dev:
	pip install -e ".[dev]"

clean:
	@echo "Cleaning build artifacts..."
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info
	rm -rf .eggs/
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.egg" -delete
	rm -rf .pytest_cache/
	rm -rf .coverage
	rm -rf htmlcov/
	rm -rf .mypy_cache/
	@echo "Clean complete!"

test:
	@echo "Running tests with coverage..."
	pytest --cov=deepsel --cov-report=term-missing --cov-report=xml

lint:
	@echo "Running flake8..."
	flake8 deepsel --ignore=E501,F401,W292,E261,W503,W504,E302,F541,E303,E712,E711,E203,W291

security:
	@echo "Running bandit security checks..."
	bandit -r deepsel -f screen

format:
	@echo "Formatting code with black..."
	black .

format-check:
	@echo "Checking code formatting..."
	black deepsel --check --verbose --diff --color

build: clean
	@echo "Building distribution packages..."
	python -m build
	@echo "Build complete! Packages are in dist/"

prepush:
	@echo "Running prepush checks..."
	make lint
	make security
	make format-check
	make test
	make build

check-dist: build
	@echo "Checking distribution package..."
	twine check dist/*

publish-test: check-dist
	@echo "Publishing to TestPyPI..."
	@echo "WARNING: This will upload to TestPyPI!"
	@read -p "Continue? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		twine upload --repository testpypi dist/*; \
	fi

publish: check-dist
	@echo "Publishing to PyPI..."
	@echo "WARNING: This will upload to production PyPI!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		twine upload dist/*; \
	fi

tree:
	@echo "Project structure:"
	@tree -I '__pycache__|*.pyc|*.egg-info|build|dist|.git' -L 3 || \
	find . -not -path '*/\.*' -not -path '*/build/*' -not -path '*/dist/*' \
		-not -path '*/__pycache__/*' -not -path '*.egg-info/*' | \
		grep -v '\.pyc$$' | sort

# Quick shortcuts
t: test
l: lint
s: security
f: format
b: build
c: clean
p: prepush
