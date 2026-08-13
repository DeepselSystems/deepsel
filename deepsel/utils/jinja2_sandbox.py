"""
Resource-limited Jinja2 SandboxedEnvironment.

`SandboxedEnvironment` blocks unsafe Python-object access (RCE) but not
CPU/memory exhaustion (`{{ "x" * 10**9 }}`, empty nested `{% for %}`
loops). This module adds: caps on `*`/`**`/`%`/`+`, a generic post-
call/filter size backstop, and a per-render budget on total `{% for %}`
iterations (any iterable, not just `range()`). Pair with
`render_with_output_limit` for cumulative output size.

Imported lazily — `jinja2` is a `cms`-extra dependency, not a base one.
Do not eagerly import this from `deepsel/utils/__init__.py`.

`MAX_OPERATION_RESULT_LENGTH` caps amplification *inputs* (`*`'s repeat
factor, `%`'s literal width) tightly, since no legitimate template needs
those that large. `MAX_CALL_RESULT_LENGTH` covers everything else
(`call()`, filters, `+`) at a higher, output-aligned cap, since those
have to tolerate large legitimate content, not just amplified bombs.

Accepted residual gaps:
- `~` (Concat): hardcoded call, no interception point without unsafe
  monkey-patching.
- Recursive macros: bounded only by Python's recursion limit.
- `|map`/`|select`: iterate outside any `{% for %}` node, so the
  iteration budget doesn't see them (their result still hits the filter
  size cap).
- Server-supplied collections now share the same iteration budget as
  attacker-authored loops.

`Filter` nodes with literal args are constant-folded at compile time, so
`__init__` wraps `environment.filters` up front — a fold attempt still
raises immediately instead of running unbounded.
"""

import functools
import re

from jinja2 import nodes
from jinja2.exceptions import SecurityError
from jinja2.sandbox import SandboxedEnvironment

# Cap for amplification-specific inputs: `*`'s repetition factor and `%`'s
# literal format width/precision. These are pre-checks on a *multiplier or
# width value*, not on existing content, so a low cap is safe — no
# legitimate template needs a single literal width/repeat-count over
# 10,000. (Results combining two already-capped operands — e.g.
# `.replace()` on two `*`-capped strings — can still reach up to roughly
# the square of this value before the *generic* backstop below,
# MAX_CALL_RESULT_LENGTH, catches them; that backstop is what actually
# bounds the final result size for anything not covered by a dedicated
# pre-check.)
MAX_OPERATION_RESULT_LENGTH = 10_000

# Cap, in bits, for `**` (int power) results. Estimated as
# `abs(exponent) * base.bit_length()` so the (potentially astronomically
# large) result never has to be computed just to measure it. 1,000,000 bits
# is far beyond anything a legitimate template needs (e.g. `2 ** 20` is 21
# bits) but well short of what would meaningfully stall a request.
MAX_POWER_RESULT_BITS = 1_000_000

# Cap for the cumulative size of rendered output. Catches loop-based
# exhaustion (many small chunks rather than one big allocation) that the
# per-operation cap above can't see, by checking a running total as the
# template streams output rather than after render() has already built the
# full string.
MAX_RENDERED_OUTPUT_LENGTH = 1_000_000

# Cap for the total number of `{% for %}` loop iterations across an entire
# render, regardless of what's being iterated over (range(), a string, a
# list, server-supplied query results, ...) or how deeply nested. Closes
# nested-loop CPU exhaustion: two nested loops with empty bodies produce no
# large allocation and no output, so neither the operation cap nor the
# output-length cap can see them, yet they total n*m iterations.
MAX_TOTAL_LOOP_ITERATIONS = 1_000_000

# Name under which the per-render iteration-budgeting wrapper is exposed in
# `self.globals` so compiled template code can call it — see `_parse()`.
# Double-underscored and namespaced to avoid colliding with a real template
# variable of the same name.
_BUDGET_ITER_GLOBAL_NAME = "__deepsel_budget_iter__"

# Cap for the generic post-call backstop (`call()`, filters, `+`, and the
# fallback check on `*`/`**`/`%`'s actual result) — deliberately higher
# than MAX_OPERATION_RESULT_LENGTH and aligned with the overall render
# output budget instead: this backstop has to tolerate calls/concatenations
# on realistically large, legitimate content (a blog post body, a page
# header + body) that were never "amplified" from something small, unlike
# the amplification-specific inputs MAX_OPERATION_RESULT_LENGTH guards.
MAX_CALL_RESULT_LENGTH = MAX_RENDERED_OUTPUT_LENGTH

# Matches an old-style `%` conversion specifier and captures its width and
# precision digit groups, e.g. `%1000000000s` -> width="1000000000", or
# `%.1000000000f` -> precision="1000000000". Scoped to specifiers (not "any
# digits in the string") so a template containing an unrelated large literal
# number doesn't false-positive.
_PERCENT_CONVERSION_PATTERN = re.compile(r"%[-+0 #]*(\d*)(?:\.(\d*))?[a-zA-Z%]")


def _reject_if_oversized(value, max_length: int = MAX_CALL_RESULT_LENGTH):
    """Raise SecurityError if `value` is a str/bytes/list/tuple/dict larger
    than `max_length`. Generic backstop used by `call_binop` and `call` —
    see module docstring for what this does and does not close, and for why
    the default differs from `MAX_OPERATION_RESULT_LENGTH`."""
    if isinstance(value, (str, bytes, list, tuple, dict)) and len(value) > max_length:
        raise SecurityError(f"Result exceeds the maximum allowed size ({max_length})")
    return value


def _wrap_with_size_check(func, max_length: int = MAX_CALL_RESULT_LENGTH):
    """Wrap `func` so its return value goes through `_reject_if_oversized`.
    Uses `functools.wraps` so jinja2's own markers on filter functions
    (e.g. `jinja_pass_arg`, set by the `pass_context`/`pass_environment`
    decorators and read via `__dict__`) survive onto the wrapper — without
    it, filters needing `context`/`environment` passed in would silently
    stop receiving it."""

    @functools.wraps(func)
    def wrapped(*args, **kwargs):
        return _reject_if_oversized(func(*args, **kwargs), max_length)

    return wrapped


class _BudgetedIterable:
    """
    Wraps any iterable so that *iterating* it charges against the owning
    environment's shared per-render iteration budget. Applied to every
    `{% for %}` loop's source expression (see `_parse()` below) — a single
    loop being individually harmless says nothing about how many times it
    runs when nested, e.g. two nested loops of 100,000 items each total 10
    billion iterations while neither loop is large on its own.

    `__len__` delegates to the wrapped object so `loop.length` / `|length`
    are unaffected — `LoopContext.length` calls `len()` on the object it
    was given, and that alone must not consume budget, only actually
    stepping through `__iter__` does. If the wrapped object doesn't support
    `len()`, this raises the same `TypeError` it would have, and
    `LoopContext.length` falls back to materializing via the iterator
    (which does consume budget, one charge per item, same as normal
    iteration).
    """

    def __init__(self, wrapped, environment: "ResourceLimitedSandboxedEnvironment"):
        self._wrapped = wrapped
        self._environment = environment

    def __len__(self) -> int:
        return len(self._wrapped)

    def __iter__(self):
        for item in self._wrapped:
            self._environment._consume_iteration_budget()
            yield item


class ResourceLimitedSandboxedEnvironment(SandboxedEnvironment):
    """
    A SandboxedEnvironment that additionally rejects `*` and `**`
    expressions whose result would be implausibly large, blocking
    single-expression memory/CPU bombs (`"x" * 10**9`, a single huge
    exponent) that pure object-traversal sandboxing doesn't address, and
    caps the total number of `{% for %}` loop iterations across a render
    to block nested-loop CPU exhaustion — see module docstring. Pair with
    `render_with_output_limit` to also cap cumulative output size.

    A fresh instance must be created per render call: the iteration budget
    is instance state, so reusing one environment across renders would leak
    a spent (or partially spent) budget into an unrelated render.
    """

    intercepted_binops = frozenset({"*", "**", "%", "+"})

    def __init__(
        self,
        *args,
        max_loop_iterations: int = MAX_TOTAL_LOOP_ITERATIONS,
        **kwargs,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._loop_iterations_remaining = max_loop_iterations
        self._max_loop_iterations = max_loop_iterations
        self.globals[_BUDGET_ITER_GLOBAL_NAME] = self._budget_iterable
        # Filters (`|center`, `|indent`, ...) reach a separate dict from
        # `call()` — wrap every entry generically rather than naming
        # specific ones, same reasoning as `call()`'s backstop. `self.filters`
        # is `DEFAULT_FILTERS.copy()` per Environment.__init__, so mutating
        # it here only affects this instance.
        self.filters = {
            name: _wrap_with_size_check(filter_func)
            for name, filter_func in self.filters.items()
        }

    def _parse(self, source, name, filename):
        """
        Wraps every `{% for %}` node's source expression with a call to
        `self._budget_iterable`, so every iteration of every loop — not
        just `range()`-based ones — is charged against the shared budget.
        Plain `{% for x in y %}` compiles to an un-mediated Python
        `for x in y:` with no `environment`-routed call to intercept
        (confirmed by inspecting jinja2's generated source), so this has to
        happen at the AST level, before code generation, rather than via
        any Environment method override.

        Wrapping as a `nodes.Call` (not e.g. a `nodes.Filter`) matters:
        `Call.as_const` is not overridden by jinja2, so it always raises
        `Impossible()` and is never evaluated by jinja2's compile-time
        constant-folding optimizer — unlike `Filter` nodes (see module
        docstring), there's no risk of this transiently executing at
        `compile()`/`from_string()` time.
        """
        ast = super()._parse(source, name, filename)
        for for_node in list(ast.find_all(nodes.For)):
            for_node.iter = nodes.Call(
                nodes.Name(_BUDGET_ITER_GLOBAL_NAME, "load"),
                [for_node.iter],
                [],
                None,
                None,
            )
        return ast

    def _budget_iterable(self, iterable) -> _BudgetedIterable:
        return _BudgetedIterable(iterable, self)

    def _consume_iteration_budget(self) -> None:
        self._loop_iterations_remaining -= 1
        if self._loop_iterations_remaining < 0:
            raise SecurityError(
                "Template exceeded the maximum allowed number of loop "
                f"iterations ({self._max_loop_iterations})"
            )

    def call_binop(self, context, operator, left, right):
        if operator == "*":
            for sequence, factor in ((left, right), (right, left)):
                if isinstance(sequence, (str, bytes, list, tuple)) and isinstance(
                    factor, int
                ):
                    if len(sequence) * max(factor, 0) > MAX_OPERATION_RESULT_LENGTH:
                        raise SecurityError(
                            "Result of '*' exceeds the maximum allowed length "
                            f"({MAX_OPERATION_RESULT_LENGTH})"
                        )
        elif operator == "**":
            if (
                isinstance(left, int)
                and isinstance(right, int)
                and abs(left) > 1
                and right > 0
                and right * left.bit_length() > MAX_POWER_RESULT_BITS
            ):
                raise SecurityError(
                    "Result of '**' exceeds the maximum allowed size "
                    f"({MAX_POWER_RESULT_BITS} bits)"
                )
        elif operator == "%":
            if isinstance(left, (str, bytes)):
                format_string = (
                    left if isinstance(left, str) else left.decode("latin-1")
                )
                for match in _PERCENT_CONVERSION_PATTERN.finditer(format_string):
                    for group in match.groups():
                        if group and int(group) > MAX_OPERATION_RESULT_LENGTH:
                            raise SecurityError(
                                "'%' format specifier width/precision exceeds"
                                " the maximum allowed size "
                                f"({MAX_OPERATION_RESULT_LENGTH})"
                            )

        # Backstop for the "%" dynamic-width form (`"%*d" % (width, value)`,
        # where width isn't a literal in the format string and so isn't
        # caught above) and anything else that slips past the pre-checks.
        return _reject_if_oversized(super().call_binop(context, operator, left, right))

    def call(__self, __context, __obj, *args, **kwargs):
        """
        Generic backstop for any callable reached from sandboxed code
        (string/bytes/list methods like `.format()`, `.rjust()`,
        `.replace()`, filters, globals — anything routed through
        `environment.call`) whose result is unexpectedly large. Deliberately
        not a table of specific "dangerous" method names — see module
        docstring for why, and for what this does and does not close.

        Double-underscore parameter names match SandboxedEnvironment.call's
        own signature: they avoid colliding with a template kwarg literally
        named `context`/`obj`, which `**kwargs` would otherwise pass through.
        """
        return _reject_if_oversized(super().call(__context, __obj, *args, **kwargs))


def render_with_output_limit(
    template, context: dict, max_length: int = MAX_RENDERED_OUTPUT_LENGTH
) -> str:
    """
    Render `template` while enforcing a cap on cumulative output length,
    raising `SecurityError` as soon as the running total exceeds
    `max_length` instead of after `template.render()` has already built the
    full (potentially huge) string. Catches loop-based exhaustion — many
    small chunks, none individually large enough to trip
    `ResourceLimitedSandboxedEnvironment`'s per-operation cap — by checking
    output size as the template streams rather than only at the end.
    """
    chunks = []
    total_length = 0
    for chunk in template.generate(**context):
        total_length += len(chunk)
        if total_length > max_length:
            raise SecurityError(
                f"Rendered output exceeds the maximum allowed length ({max_length})"
            )
        chunks.append(chunk)
    return "".join(chunks)
