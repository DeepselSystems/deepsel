import re
import tomllib
from importlib.metadata import version
from pathlib import Path

# CVE-2025-27516: a jinja2.sandbox.SandboxedEnvironment escape, fixed in
# Jinja2 3.1.6. render_wysiwyg_content.py relies on SandboxedEnvironment to
# block SSTI, so an older Jinja2 would silently defeat that mitigation even
# though this package's own code is correct.
MIN_JINJA2_VERSION = (3, 1, 6)


def _parse_version(version_string: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", version_string)[:3])


def test_installed_jinja2_meets_sandbox_escape_floor():
    installed = _parse_version(version("Jinja2"))
    assert installed >= MIN_JINJA2_VERSION  # nosec B101


def test_pyproject_declares_jinja2_sandbox_escape_floor():
    """Guards against the pin regressing back below 3.1.6 unnoticed — the
    installed-version test above only catches a stale environment, not a
    pyproject.toml edit that lowers the floor for future installs."""
    pyproject = tomllib.loads(
        (Path(__file__).parent.parent / "pyproject.toml").read_text()
    )
    cms_requirements = pyproject["project"]["optional-dependencies"]["cms"]
    jinja2_requirement = next(r for r in cms_requirements if r.startswith("Jinja2"))

    declared_floor = _parse_version(jinja2_requirement.split(">=")[1])
    assert declared_floor >= MIN_JINJA2_VERSION  # nosec B101
