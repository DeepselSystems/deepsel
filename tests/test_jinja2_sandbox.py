import pytest
from jinja2.exceptions import SecurityError

from deepsel.utils.jinja2_sandbox import (
    MAX_OPERATION_RESULT_LENGTH,
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


class TestPercentFormatAndMethodCallCap:
    """`*`/`**` aren't the only ways to expand a small string into a huge
    one in a single step: old-style `%` formatting width/precision fields,
    and methods like `.format()`/`.rjust()` that take a width argument, do
    the same thing through a different code path. Rather than enumerating
    every such method (an unbounded list), `%` gets a targeted pre-check
    (it's a binop this module already intercepts) and everything else is
    caught by a generic post-call result-size backstop — see `call()`."""

    def test_blocks_percent_format_width_bomb(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "%1000000000s" % s }}')
        with pytest.raises(SecurityError):
            template.render(s="x")

    def test_blocks_format_method_width_bomb(self):
        """`.format()`'s width isn't pre-validated — parsing the format-spec
        mini-language to do that safely risks false positives on legitimate
        specs like `{:.2f}`. Caught instead by the generic post-call
        result-size backstop, after the call returns."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ s.format(x) }}")
        with pytest.raises(SecurityError):
            template.render(s="{:>1000000000}", x="x")

    def test_blocks_rjust_width_bomb(self):
        """Proves the generic `call()` backstop, not a method-specific
        check: `rjust` isn't named anywhere in this module."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ s.rjust(n) }}")
        with pytest.raises(SecurityError):
            template.render(s="x", n=1_000_000_000)

    def test_blocks_combinatorial_replace_bomb(self):
        """The backstop's real purpose: methods nobody explicitly named.
        Two operands each individually under the per-operation cap
        combined multiplicatively by `.replace()`."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ ("a" * 9000).replace("a", "b" * 9000) }}')
        with pytest.raises(SecurityError):
            template.render()

    def test_allows_legitimate_percent_format(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "%s items" % n }}')
        assert template.render(n=5) == "5 items"  # nosec B101

    def test_allows_legitimate_format_call(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "{:>8}".format("x") }}')
        assert template.render() == "       x"  # nosec B101

    def test_allows_legitimate_format_precision(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "{:.2f}".format(n) }}')
        assert template.render(n=1.5) == "1.50"  # nosec B101

    def test_allows_long_but_reasonable_method_call_result(self):
        """PR review finding: a method that doesn't amplify anything
        (`.strip()` here just returns its input unchanged, no width/count
        argument involved) must not be rejected merely for operating on
        realistic, already-large-but-legitimate content — e.g. a normal
        blog post body. The generic `call()` backstop is aligned with
        `MAX_RENDERED_OUTPUT_LENGTH`, not the tighter
        `MAX_OPERATION_RESULT_LENGTH` used only for the amplification-
        specific pre-checks (`*`'s repetition estimate, `%`'s literal width
        scan)."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ long_text.strip() }}")
        long_text = "  " + "x" * 50_000 + "  "
        assert len(long_text) > MAX_OPERATION_RESULT_LENGTH  # nosec B101
        assert template.render(long_text=long_text) == long_text.strip()  # nosec B101


class TestPlusOperatorCap:
    def test_blocks_chained_concatenation_via_plus(self):
        """`+` isn't multiplicative like `*`, but chained `+` can still
        accumulate past the cap — each individual `+` is checked, so a
        chain is caught at the first step that crosses the threshold,
        regardless of how many `+`s follow. Uses the same (aligned with
        output policy) threshold as `call()`/filters — see
        test_allows_concatenation_of_reasonably_large_legitimate_content
        for why `+` isn't held to the tighter per-operation cap."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ a + a }}")
        with pytest.raises(SecurityError):
            template.render(a="x" * 600_000)

    def test_allows_legitimate_small_concatenation(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "foo" + "bar" }}')
        assert template.render() == "foobar"  # nosec B101

    def test_allows_concatenation_of_reasonably_large_legitimate_content(self):
        """Same false-positive class as the filter/method-call findings:
        `+` isn't amplifying (it doesn't multiply a small input by a large
        factor), so two moderately large, legitimate pieces (e.g. a page
        header + body) summing past the tight per-operation cap must still
        render — only genuinely oversized results should be rejected."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ header + body }}")
        header = "x" * 5_000
        body = "y" * 50_000
        assert len(header) + len(body) > MAX_OPERATION_RESULT_LENGTH  # nosec B101
        assert template.render(header=header, body=body) == header + body  # nosec B101


class TestFilterCap:
    """Filters (`|center`, `|indent`, etc.) reach jinja2's separate
    `environment.filters` dict, not `environment.call()` — a different
    invocation path from method calls, wrapped generically here rather
    than naming specific filters, for the same reason as `call()`'s
    backstop (see module docstring)."""

    def test_blocks_filter_amplification(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ s|center(n) }}")
        with pytest.raises(SecurityError):
            template.render(s="x", n=1_000_000_000)

    def test_allows_legitimate_filter_use(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "x"|center(7) }}')
        assert template.render() == "   x   "  # nosec B101

    def test_allows_long_but_reasonable_filter_input(self):
        """PR review finding: wrapping every filter with the tight
        per-operation cap broke legitimate long content, e.g.
        `{{ long_html|safe }}` — `|safe` doesn't amplify anything (it just
        marks the string safe, unchanged), but ordinary blog/page content
        easily exceeds 10,000 chars while staying far under the render's
        overall output budget. Fixed by aligning the generic call()/filter
        backstop with `MAX_RENDERED_OUTPUT_LENGTH` instead of the tighter
        `MAX_OPERATION_RESULT_LENGTH`, which stays reserved for the
        amplification-specific pre-checks (`*`'s repetition estimate, `%`'s
        literal width scan) where a legitimate need to exceed it is
        implausible."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{{ long_html|safe }}")
        long_html = "<p>paragraph</p>" * 1_000
        assert len(long_html) > MAX_OPERATION_RESULT_LENGTH  # nosec B101
        assert template.render(long_html=long_html) == long_html  # nosec B101

    def test_filter_with_literal_constant_args_is_still_blocked(self):
        """Jinja2 constant-folds Filter nodes with literal arguments at
        COMPILE time (`_FilterTestCommon.as_const`, called from
        `env.from_string()`/`env.compile()` — before render() is ever
        invoked), unlike BinExpr, which has an `intercepted_binops` guard
        that skips folding entirely. Without wrapping `environment.filters`
        itself (so the wrapped version is what compile-time folding calls
        too), `env.from_string(...)` alone would transiently allocate the
        full attack size trying to fold this. Uses 5,000,000 — not a
        realistic attack magnitude — so that transient allocation during
        the failed fold attempt stays safe to actually execute here."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string('{{ "x"|center(5000000) }}')
        with pytest.raises(SecurityError):
            template.render()


class TestIterationBudget:
    """Neither the operation cap nor the output-length cap can see a loop
    with an empty body: two nested loops, each individually harmless,
    produce no single large allocation and no output at all — yet iterate
    n * m times. `render_with_output_limit` only regains control at points
    where the compiled template actually yields output; with nothing to
    yield, the entire nested loop runs to completion inside one call before
    that check ever runs again. This is checked at a different layer: every
    iteration of *any* `{% for %}` loop — not just range()-based ones — is
    charged against one budget shared for the whole render."""

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

    def test_blocks_nested_loops_over_non_range_iterables(self):
        """PR review finding: the budget only intercepted `range()`, so
        `{% for %}` over any other iterable (a string, here — already under
        the amplification cap on its own) bypassed it entirely. Two nested
        loops over a 20-char string multiply out to 400 iterations against a
        budget of 100."""
        env = ResourceLimitedSandboxedEnvironment(max_loop_iterations=100)
        template = env.from_string(
            '{% set s = "x" * 20 %}'
            "{% for a in s %}{% for b in s %}{% endfor %}{% endfor %}"
        )
        with pytest.raises(SecurityError):
            template.render()

    def test_allows_a_single_loop_under_budget(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{% for i in range(10) %}{{ i }}{% endfor %}")
        assert template.render() == "0123456789"  # nosec B101

    def test_allows_realistic_nested_loop_over_lists(self):
        """Legitimate use (e.g. table rows/columns) must keep working now
        that the budget covers every for-loop, not just range()."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string(
            "{% for row in rows %}{% for cell in row %}{{ cell }}{% endfor %}{% endfor %}"
        )
        rows = [[str(c) for c in range(20)] for _ in range(50)]
        expected = "".join(c for row in rows for c in row)
        assert template.render(rows=rows) == expected  # nosec B101

    def test_loop_length_still_works(self):
        """Regression guard: `loop.length` must not be broken by wrapping
        the loop iterable — `LoopContext.length` uses `len()` on it when
        available, which must not itself consume the budget."""
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string(
            "{% for i in range(5) %}{{ loop.length }}{% endfor %}"
        )
        assert template.render() == "55555"  # nosec B101

    def test_loop_length_still_works_for_non_range_iterables(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string("{% for x in items %}{{ loop.length }}{% endfor %}")
        assert template.render(items=["a", "b", "c"]) == "333"  # nosec B101

    def test_for_else_still_works(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string(
            "{% for x in items %}{{ x }}{% else %}empty{% endfor %}"
        )
        assert template.render(items=[]) == "empty"  # nosec B101

    def test_dict_iteration_still_works(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string(
            "{% for k, v in d.items() %}{{ k }}={{ v }} {% endfor %}"
        )
        assert template.render(d={"a": 1, "b": 2}) == "a=1 b=2 "  # nosec B101

    def test_recursive_loop_still_works(self):
        env = ResourceLimitedSandboxedEnvironment()
        template = env.from_string(
            "{% for x in items recursive %}{{ x.name }}"
            "{% if x.children %}({{ loop(x.children) }}){% endif %}{% endfor %}"
        )
        items = [{"name": "a", "children": [{"name": "b", "children": []}]}]
        assert template.render(items=items) == "a(b)"  # nosec B101

    def test_allows_exactly_the_configured_number_of_iterations(self):
        """PR review finding (off-by-one): a budget of N must allow exactly
        N iterations, not N-1."""
        env = ResourceLimitedSandboxedEnvironment(max_loop_iterations=10)
        template = env.from_string("{% for i in range(10) %}{{ i }}{% endfor %}")
        assert template.render() == "0123456789"  # nosec B101

    def test_rejects_one_more_than_the_configured_number_of_iterations(self):
        env = ResourceLimitedSandboxedEnvironment(max_loop_iterations=10)
        template = env.from_string("{% for i in range(11) %}{% endfor %}")
        with pytest.raises(SecurityError):
            template.render()


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
