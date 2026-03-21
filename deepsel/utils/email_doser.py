"""
Email Rate Limiting (Dosing) System

This module provides functionality to control email sending rates to prevent abuse
and comply with email provider limits.

Features:
- Global rate limiting for system-wide email sending
- Support for future user/campaign/scope-based limits
- Automatic cleanup of expired timestamps
- Thread-safe operations
"""

import time
from collections import defaultdict, deque
from typing import Optional, Dict, Any
from threading import RLock


class EmailDoser:
    """
    Email rate limiter that controls how many emails can be sent within a time window.

    Currently implements global rate limiting, with architecture to support
    user/campaign/scope-based limits in the future.
    """

    def __init__(self, max_emails: int = 200, per_seconds: int = 3600):
        """
        Initialize the EmailDoser.

        Args:
            max_emails: Maximum number of emails allowed per time window
            per_seconds: Time window in seconds (default: 3600 = 1 hour)
        """
        self.max_emails = max_emails
        self.per_seconds = per_seconds
        self.sent_timestamps: Dict[str, deque] = defaultdict(lambda: deque())
        self._lock = RLock()  # Reentrant lock for better signal handling

    def can_send_email(self, scope: str = "global") -> bool:
        """
        Check if an email can be sent within the rate limit.

        Args:
            scope: The scope for rate limiting (default: "global")
                   Future: can be user_id, campaign_id, etc.

        Returns:
            bool: True if email can be sent, False otherwise
        """
        if self._lock.acquire(timeout=0.1):  # Quick timeout to avoid blocking signals
            try:
                now = time.time()
                timestamps = self.sent_timestamps[scope]

                # Remove timestamps older than the time window
                while timestamps and now - timestamps[0] > self.per_seconds:
                    timestamps.popleft()

                return len(timestamps) < self.max_emails
            finally:
                self._lock.release()
        else:
            # If we can't get the lock quickly, assume we can't send (safe default)
            return False

    def record_send(self, scope: str = "global") -> bool:
        """
        Record an email send attempt and check if it's within limits.

        Args:
            scope: The scope for rate limiting (default: "global")

        Returns:
            bool: True if email was recorded (within limits), False if rate limited
        """
        if self._lock.acquire(timeout=0.1):  # Quick timeout to avoid blocking signals
            try:
                now = time.time()
                timestamps = self.sent_timestamps[scope]

                # Remove timestamps older than the time window
                while timestamps and now - timestamps[0] > self.per_seconds:
                    timestamps.popleft()

                if len(timestamps) < self.max_emails:
                    timestamps.append(now)
                    return True
                return False
            finally:
                self._lock.release()
        else:
            return False  # Couldn't get lock, assume rate limited

    def get_next_available_time(self, scope: str = "global") -> float:
        """
        Get the time in seconds until the next email can be sent.

        Args:
            scope: The scope for rate limiting (default: "global")

        Returns:
            float: Seconds to wait (0 if can send immediately)
        """
        if self._lock.acquire(timeout=0.1):  # Quick timeout to avoid blocking signals
            try:
                timestamps = self.sent_timestamps[scope]
                if len(timestamps) < self.max_emails:
                    return 0.0
                return max(0.0, timestamps[0] + self.per_seconds - time.time())
            finally:
                self._lock.release()
        else:
            return 60.0  # If can't get lock, return a reasonable wait time

    def get_current_usage(self, scope: str = "global") -> Dict[str, Any]:
        """
        Get current usage statistics for a scope.

        Args:
            scope: The scope for rate limiting (default: "global")

        Returns:
            dict: Usage statistics including count, limit, time window, etc.
        """
        if self._lock.acquire(timeout=0.1):  # Quick timeout to avoid blocking signals
            try:
                now = time.time()
                timestamps = self.sent_timestamps[scope]

                # Clean old timestamps
                while timestamps and now - timestamps[0] > self.per_seconds:
                    timestamps.popleft()

                if len(timestamps) < self.max_emails:
                    next_available = 0.0
                else:
                    next_available = max(0.0, timestamps[0] + self.per_seconds - now)

                return {
                    "current_count": len(timestamps),
                    "max_emails": self.max_emails,
                    "time_window_seconds": self.per_seconds,
                    "next_available_seconds": next_available,
                    "scope": scope,
                }
            finally:
                self._lock.release()
        else:
            # If can't get lock, return safe defaults
            return {
                "current_count": 0,
                "max_emails": self.max_emails,
                "time_window_seconds": self.per_seconds,
                "next_available_seconds": 0.0,
                "scope": scope,
            }

    def update_limits(self, max_emails: int, per_seconds: int):
        """
        Update the rate limiting parameters.

        Args:
            max_emails: New maximum emails per time window
            per_seconds: New time window in seconds
        """
        if self._lock.acquire(timeout=0.1):  # Quick timeout to avoid blocking signals
            try:
                self.max_emails = max_emails
                self.per_seconds = per_seconds
            finally:
                self._lock.release()

    def cleanup_expired(self):
        """
        Clean up expired timestamps for all scopes.
        Call this periodically to prevent memory leaks.
        """
        if self._lock.acquire(timeout=0.1):  # Quick timeout to avoid blocking signals
            try:
                now = time.time()
                scopes_to_remove = []

                for scope, timestamps in self.sent_timestamps.items():
                    # Remove old timestamps
                    while timestamps and now - timestamps[0] > self.per_seconds:
                        timestamps.popleft()

                    # If no timestamps left, mark scope for removal
                    if not timestamps:
                        scopes_to_remove.append(scope)

                # Remove empty scopes
                for scope in scopes_to_remove:
                    del self.sent_timestamps[scope]
            finally:
                self._lock.release()


# Global instance for system-wide rate limiting
_global_email_doser: Optional[EmailDoser] = None


def get_global_email_doser() -> EmailDoser:
    """
    Get the global EmailDoser instance.

    Returns:
        EmailDoser: The global rate limiter instance
    """
    global _global_email_doser
    if _global_email_doser is None:
        # Default to 200 emails per hour, will be updated from settings
        _global_email_doser = EmailDoser(max_emails=200, per_seconds=3600)
    return _global_email_doser


def update_global_limits(max_emails_per_hour: int):
    """
    Update the global email rate limits from organization settings.

    Args:
        max_emails_per_hour: Maximum emails per hour (0 for unlimited)
    """
    global _global_email_doser
    if max_emails_per_hour == 0:
        # Unlimited - set to a very high number
        max_emails_per_hour = 999999

    if _global_email_doser is None:
        _global_email_doser = EmailDoser(
            max_emails=max_emails_per_hour, per_seconds=3600
        )
    else:
        _global_email_doser.update_limits(
            max_emails=max_emails_per_hour, per_seconds=3600
        )
