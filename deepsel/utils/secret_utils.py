"""
Utility functions for masking and truncating sensitive values like API keys, secrets, tokens, etc.
"""

from typing import Optional


def truncate_secret(
    value: Optional[str],
    prefix_length: int = 5,
    suffix_length: int = 3,
    min_length_for_truncation: int = 0,
    mask: str = "............",
) -> Optional[str]:
    """
    Return truncated version of any secret/sensitive value like 'first_part...last_part'.
    Useful for displaying partial API keys, tokens, secrets for identification while maintaining security.

    Args:
        value: The sensitive value to truncate
        prefix_length: Number of characters to show at the beginning
        suffix_length: Number of characters to show at the end
        min_length_for_truncation: Minimum length before truncation is applied
        mask: Replacement when value is too short to show even partially.

    Returns:
        Truncated string or original value if too short/empty
    """
    if not value:
        return value

    if (len(value) < (prefix_length + suffix_length)) or (
        len(value) <= min_length_for_truncation
    ):
        return f"{value[:1]}{mask}{value[-1:] if len(value) >= 2 else ""}"

    # Show first N and last N characters with ... in between
    first_part = value[:prefix_length]
    last_part = value[-suffix_length:]

    # Return
    return f"{first_part}{mask}{last_part}"
