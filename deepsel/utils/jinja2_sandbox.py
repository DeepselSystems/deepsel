"""
Resource-limited Jinja2 SandboxedEnvironment.

`jinja2.sandbox.SandboxedEnvironment` blocks templates from reaching unsafe
Python internals (attribute/object-traversal RCE) but does not cap CPU or
memory consumption of otherwise-"safe" operations. A template author who
merely has permission to write/render content — not a fully trusted
operator — can still hang or OOM the process with e.g. `{{ "x" * 10**9 }}`
or `{{ 10 ** 10 ** 10 }}`. Jinja2 itself only guards against this for
`range()` (see `jinja2.sandbox.MAX_RANGE`) — every other operation is
unbounded.

This module is imported lazily by callers (mirroring the existing
`from jinja2...` imports elsewhere in this codebase) because `jinja2` is
only installed via the `cms` extra, not a base dependency — do not add an
eager top-level import of this module to `deepsel/utils/__init__.py`.

`*`/`**` are not the only operations that can expand a small input into a
huge result in one step — old-style `%` string formatting and methods like
`.format()`/`.rjust()`/`.replace()` do the same through different code
paths, and that list has no fixed end (whoever finds the next one, the
shape is the same). Rather than enumerating methods one at a time, this
module combines a low per-operation cap on the amplification-specific
inputs (`*`'s repetition factor, `%`'s literal width/precision) with a
*generic* post-call result-size check (see `call()`) that catches any
call — named here or not — whose result is unexpectedly large. That check
runs after the call returns, so it bounds *propagation*, not the peak
memory/time of the one call that produced an oversized result; only
genuine process isolation (a separate, larger piece of work — the render
context here holds a live SQLAlchemy `Session`, which isn't picklable/
fork-safe) would close that last gap.

The generic backstop (`call()`, filters, `+`, and the non-amplification-
specific parts of `*`/`**`/`%`) uses a *separate, higher* cap
(`MAX_CALL_RESULT_LENGTH`, aligned with `MAX_RENDERED_OUTPUT_LENGTH`) than
the amplification-specific pre-checks (`MAX_OPERATION_RESULT_LENGTH`). An
earlier version used the same low cap everywhere, which rejected
legitimate templates operating on realistically large but non-amplified
content — e.g. `{{ long_html|safe }}` on a normal blog post body, or
`{{ header + body }}` — since `|safe`/`+` don't expand a small input, they
just pass through or concatenate already-legitimate content that can
easily exceed a "no reason to need more than 10,000 chars" threshold. The
amplification-specific pre-checks stay tight because a *literal
multiplier or width value* implausibly needs to exceed 10,000 in
legitimate use, which is a different claim from "this call's result is
long".

Two invocation paths remain genuinely open, for different reasons:

- `~` (the Concat node, e.g. `{{ a ~ b }}`) compiles to a hardcoded call to
  `jinja2.runtime.str_join`/`markup_join` — plain module-level functions,
  not looked up through any `environment` attribute. There is no
  documented extension point to intercept it short of monkey-patching
  those global functions process-wide (unsafe for a multi-tenant server —
  it would affect every concurrent render, not just the one being
  protected) or subclassing jinja2's code generator (fragile against
  internal jinja2 changes). Unlike `*`/`**`, `~` is not multiplicative:
  chaining N literals costs roughly N chars of template *source* to
  produce roughly N chars of output, so a `~`-chain of pure literals is
  bounded by however large a template's `content` is allowed to be — a
  request-body-size concern, not a Jinja2-sandboxing one. A `~`-chain
  built from *variables* (not literals) can't be constant-folded at all
  (see below) and falls through to normal rendering, where
  `render_with_output_limit`'s streaming cap still applies once/if the
  result reaches template output. In practice a variable operand is either
  a literal already covered by that source-size argument, or the result of
  some other operation this module capped at `MAX_CALL_RESULT_LENGTH` — so
  a `~`-chain over variables is a chain of already-bounded pieces whose sum
  still has to pass through the output stream to matter, which is exactly
  where the streaming cap watches.
- Iteration over large *server-supplied* collections (not `range()`)
  passed into the render context, and recursive macros (bounded only by
  Python's own recursion limit). Both are a different threat model from
  attacker-authored template text — the former comes from server-
  controlled query results, not the template — so they are accepted here
  rather than defended against.

One more thing worth knowing if extending this module: jinja2
constant-folds `Filter` nodes with literal arguments *at compile time*
(`_FilterTestCommon.as_const`, invoked from `env.from_string()`/
`env.compile()` — before `render()`/`generate()` are ever called), and
unlike `BinExpr` there is no `intercepted_binops`-style guard that skips
folding for specific filters. That fold reads whatever is in
`environment.filters` at compile time, which is why `__init__` below wraps
every entry in that dict up front, rather than only at call time — folding
still transiently evaluates once (the resulting `SecurityError` is caught
by jinja2's optimizer and treated as "can't fold", falling back to normal
runtime codegen, which then raises for real), so this bounds the damage to
one extra evaluation rather than preventing it outright — the same
propagation-not-peak trade-off documented on `call()` below.
"""

import functools
import re

from jinja2.exceptions import SecurityError
from jinja2.sandbox import SandboxedEnvironment, safe_range

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

# Cap for the total number of range()-based loop iterations across an
# entire render (not per range() call — jinja2's own `safe_range` already
# caps that at MAX_RANGE). Closes nested-loop CPU exhaustion: two nested
# `range(100000)` loops with empty bodies produce no large allocation and
# no output, so neither the operation cap nor the output-length cap can see
# them, yet they total 100000*100000 iterations.
MAX_TOTAL_LOOP_ITERATIONS = 1_000_000

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


class _BudgetedRange:
    """
    Wraps a `range` so that *iterating* it charges against the owning
    environment's shared per-render iteration budget, in addition to
    jinja2's own per-call length cap (`safe_range`/`MAX_RANGE`). A single
    range() call being under MAX_RANGE says nothing about how many times a
    loop containing it runs — nesting multiplies that out, e.g. two nested
    range(100000) loops total 10 billion iterations while each individual
    call is compliant.

    `__len__` reads `len()` on the wrapped range directly (no iteration, no
    budget charge) so `loop.length` / `range(...)|length` are unaffected —
    only actually stepping through the loop via `__iter__` costs budget.
    """

    def __init__(self, rng: range, environment: "ResourceLimitedSandboxedEnvironment"):
        self._rng = rng
        self._environment = environment

    def __len__(self) -> int:
        return len(self._rng)

    def __iter__(self):
        for item in self._rng:
            self._environment._consume_iteration_budget()
            yield item


class ResourceLimitedSandboxedEnvironment(SandboxedEnvironment):
    """
    A SandboxedEnvironment that additionally rejects `*` and `**`
    expressions whose result would be implausibly large, blocking
    single-expression memory/CPU bombs (`"x" * 10**9`, a single huge
    exponent) that pure object-traversal sandboxing doesn't address, and
    caps the total number of range()-based loop iterations across a render
    to block nested-loop CPU exhaustion. Pair with `render_with_output_limit`
    to also cap cumulative output size.

    A fresh instance must be created per render call: the iteration budget
    is instance state, so reusing one environment across requests would
    leak a spent (or partially spent) budget into an unrelated render.
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
        # Overrides SandboxedEnvironment.__init__'s own `self.globals["range"]
        # = safe_range` (per-call length cap only) with a version that also
        # charges every iteration against the shared budget above.
        self.globals["range"] = self._budgeted_range
        # Filters (`|center`, `|indent`, ...) reach a separate dict from
        # `call()` — wrap every entry generically rather than naming
        # specific ones, same reasoning as `call()`'s backstop. `self.filters`
        # is `DEFAULT_FILTERS.copy()` per Environment.__init__, so mutating
        # it here only affects this instance.
        self.filters = {
            name: _wrap_with_size_check(filter_func)
            for name, filter_func in self.filters.items()
        }

    def _budgeted_range(self, *args) -> _BudgetedRange:
        return _BudgetedRange(safe_range(*args), self)

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
