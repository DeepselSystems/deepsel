import pytest
from jinja2.exceptions import SecurityError

from deepsel.utils.jinja2_sandbox import (
    MAX_RENDERED_OUTPUT_LENGTH,
    ResourceLimitedSandboxedEnvironment,
    render_with_output_limit,
)


class TestOperationResultCap:
    """SandboxedEnvironment blocks unsafe Python-object access but does not
    cap the size of otherwise-"safe" operations. `*`/`**` can allocate an
    unbounded amount of memory (or, for `**`, take a very long time) in a
    single step."""

    def test_blocks_literal_string_multiplication_bomb(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "x" * 1000000000 }}')
        with pytest.raises(SecurityError):
            template.render()

    def test_blocks_context_variable_multiplication_bomb(self):
        """Jinja2 constant-folds `*` at compile time unless the operator is
        intercepted, so a literal-only payload alone wouldn't prove the
        interception is wired for the general case — this uses a runtime
        value instead."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ s * n }}")
        with pytest.raises(SecurityError):
            template.render(s="x", n=1_000_000_000)

    def test_blocks_list_repetition_bomb(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ ([0] * n)|length }}")
        with pytest.raises(SecurityError):
            template.render(n=1_000_000_000)

    def test_blocks_large_exponent_bomb(self):
        """A single huge exponent is the actual danger — not the chained
        form `10 ** 10 ** 10`, which Jinja2 parses left-associatively as
        `(10 ** 10) ** 10` (~10**100, a tame 101-digit number, confirmed by
        inspecting the compiled template source)."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ b ** n }}")
        with pytest.raises(SecurityError):
            template.render(b=10, n=1_000_000_000)

    def test_allows_legitimate_numeric_multiplication(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ 5 * 3 }}")
        assert template.render() == "15"  # nosec B101

    def test_allows_legitimate_string_multiplication(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "ab" * 3 }}')
        assert template.render() == "ababab"  # nosec B101

    def test_allows_legitimate_power(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ 2 ** 10 }}")
        assert template.render() == "1024"  # nosec B101


class TestRenderWithOutputLimit:
    def test_raises_when_cumulative_output_exceeds_limit(self):
        """A loop of many small chunks, each individually far under the
        per-operation cap, must still be caught by the running-total check
        in `render_with_output_limit` — the case the operation cap alone
        can't see. Repeat count stays well under jinja2's own range()
        cap (MAX_RANGE=100000) so this fails for the output-limit reason,
        not a different one."""
        env = ResourceLimitedSandboxedEnvironment()
        chunk = "x" * 100
        repeat_count = (MAX_RENDERED_OUTPUT_LENGTH // len(chunk)) + 10
        template = env.from_string("{% for i in range(n) %}" + chunk + "{% endfor %}")
        with pytest.raises(SecurityError):
            render_with_output_limit(template, {"n": repeat_count})

    def test_renders_normally_under_the_limit(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("Hello {{ name }}!")
        assert (
            render_with_output_limit(template, {"name": "Ada"}) == "Hello Ada!"
        )  # nosec B101
