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

Residual risk, not closed by this module: iteration over large *server-
supplied* collections (not `range()`) passed into the render context, and
recursive macros (bounded only by Python's own recursion limit). Both are
a different threat model from attacker-authored template text — the former
comes from server-controlled query results, not the template — so they are
accepted here rather than defended against.
"""

from jinja2.exceptions import SecurityError
from jinja2.sandbox import SandboxedEnvironment, safe_range

# Cap for `*` results that could allocate memory in one step (string, bytes,
# list, tuple repetition). Mirrors the order of magnitude of jinja2's own
# builtin range() cap (MAX_RANGE).
MAX_OPERATION_RESULT_LENGTH = 100_000

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

    intercepted_binops = frozenset({"*", "**"})

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

    def _budgeted_range(self, *args) -> _BudgetedRange:
        return _BudgetedRange(safe_range(*args), self)

    def _consume_iteration_budget(self) -> None:
        self._loop_iterations_remaining -= 1
        if self._loop_iterations_remaining <= 0:
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

        return super().call_binop(context, operator, left, right)


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
