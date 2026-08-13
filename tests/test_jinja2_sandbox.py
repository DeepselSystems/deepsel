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


class TestIterationBudget:
    """Neither the operation cap nor the output-length cap can see a loop
    with an empty body: two nested `range()` loops, each individually under
    jinja2's own per-call range cap (MAX_RANGE), produce no single large
    allocation and no output at all — yet iterate range(n) * range(m) times.
    `render_with_output_limit` only regains control at points where the
    compiled template actually yields output; with nothing to yield, the
    entire nested loop runs to completion inside one call before that check
    ever runs again. This is checked at a different layer: every iteration
    of any range()-based loop, regardless of nesting or output, is charged
    against one budget shared for the whole render."""

    def test_blocks_nested_loops_with_empty_bodies_exceeding_total_budget(self):
        """Sized (1000 x 1000 = 1,000,000 total iterations, empty bodies) to
        finish in well under a second even unpatched, so this is safe to
        actually run as the RED step."""
        env = ResourceLimitedSandboxedEnvironment(max_loop_iterations=100)
        template = env.from_string(
            "{% for i in range(1000) %}{% for j in range(1000) %}{% endfor %}{% endfor %}"
        )
        with pytest.raises(SecurityError):
            template.render()

    def test_allows_a_single_loop_under_budget(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{% for i in range(10) %}{{ i }}{% endfor %}")
        assert template.render() == "0123456789"  # nosec B101

    def test_loop_length_still_works(self):
        """Regression guard: `loop.length` must not be broken by wrapping
        range() — `LoopContext.length` uses `len()` on the wrapped iterable
        when available, which must not itself consume the budget."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string(
            "{% for i in range(5) %}{{ loop.length }}{% endfor %}"
        )
        assert template.render() == "55555"  # nosec B101


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
