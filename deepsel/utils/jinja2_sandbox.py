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

Residual risk, not closed by this module: nested loops that are each within
`MAX_RANGE` but produce no large single allocation and no large cumulative
output (e.g. `{% for i in range(100000) %}{% for j in range(100000) %}
{% endfor %}{% endfor %}`) still burn CPU. There is no cheap wall-clock
timeout available here — rendering can run inside a FastAPI threadpool
thread, where signal-based alarms don't fire, and a Python thread cannot be
forcibly killed once started.
"""

from jinja2.exceptions import SecurityError
from jinja2.sandbox import SandboxedEnvironment

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


class ResourceLimitedSandboxedEnvironment(SandboxedEnvironment):
    """
    A SandboxedEnvironment that additionally rejects `*` and `**`
    expressions whose result would be implausibly large, blocking
    single-expression memory/CPU bombs (`"x" * 10**9`, `10 ** 10 ** 10`)
    that pure object-traversal sandboxing doesn't address. Pair with
    `render_with_output_limit` to also cap cumulative output size.
    """

    intercepted_binops = frozenset({"*", "**"})

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
