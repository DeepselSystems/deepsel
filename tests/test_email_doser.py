import time
from unittest.mock import patch

from deepsel.utils.email_doser import EmailDoser


def test_can_send_under_limit():
    doser = EmailDoser(max_emails=3, per_seconds=60)
    assert doser.can_send_email() is True


def test_can_send_at_limit():
    doser = EmailDoser(max_emails=2, per_seconds=60)
    doser.record_send()
    doser.record_send()
    assert doser.can_send_email() is False


def test_record_send_returns_true_under_limit():
    doser = EmailDoser(max_emails=2, per_seconds=60)
    assert doser.record_send() is True
    assert doser.record_send() is True


def test_record_send_returns_false_at_limit():
    doser = EmailDoser(max_emails=2, per_seconds=60)
    doser.record_send()
    doser.record_send()
    assert doser.record_send() is False


def test_sliding_window_expiry():
    doser = EmailDoser(max_emails=1, per_seconds=10)
    base = time.time()

    with patch("deepsel.utils.email_doser.time") as mock_time:
        mock_time.time.return_value = base
        assert doser.record_send() is True
        assert doser.can_send_email() is False

        # 11 seconds later the old timestamp expires
        mock_time.time.return_value = base + 11
        assert doser.can_send_email() is True
        assert doser.record_send() is True


def test_get_next_available_time_under_limit():
    doser = EmailDoser(max_emails=5, per_seconds=60)
    assert doser.get_next_available_time() == 0.0


def test_get_next_available_time_at_limit():
    doser = EmailDoser(max_emails=1, per_seconds=60)
    base = time.time()

    with patch("deepsel.utils.email_doser.time") as mock_time:
        mock_time.time.return_value = base
        doser.record_send()

        mock_time.time.return_value = base + 20
        wait = doser.get_next_available_time()
        assert 39 <= wait <= 41  # ~40 seconds remaining


def test_get_current_usage():
    doser = EmailDoser(max_emails=10, per_seconds=60)
    doser.record_send()
    doser.record_send()

    usage = doser.get_current_usage()
    assert usage["current_count"] == 2
    assert usage["max_emails"] == 10
    assert usage["time_window_seconds"] == 60
    assert usage["next_available_seconds"] == 0.0
    assert usage["scope"] == "global"


def test_get_current_usage_at_limit():
    doser = EmailDoser(max_emails=1, per_seconds=60)
    doser.record_send()

    usage = doser.get_current_usage()
    assert usage["current_count"] == 1
    assert usage["next_available_seconds"] > 0


def test_update_limits():
    doser = EmailDoser(max_emails=1, per_seconds=60)
    doser.record_send()
    assert doser.can_send_email() is False

    doser.update_limits(max_emails=5, per_seconds=60)
    assert doser.can_send_email() is True


def test_cleanup_expired_removes_empty_scopes():
    doser = EmailDoser(max_emails=10, per_seconds=10)
    base = time.time()

    with patch("deepsel.utils.email_doser.time") as mock_time:
        mock_time.time.return_value = base
        doser.record_send("scope_a")
        doser.record_send("scope_b")

        assert "scope_a" in doser.sent_timestamps
        assert "scope_b" in doser.sent_timestamps

        # 11 seconds later everything expired
        mock_time.time.return_value = base + 11
        doser.cleanup_expired()

        assert "scope_a" not in doser.sent_timestamps
        assert "scope_b" not in doser.sent_timestamps


def test_separate_scopes():
    doser = EmailDoser(max_emails=1, per_seconds=60)
    doser.record_send("user_1")

    assert doser.can_send_email("user_1") is False
    assert doser.can_send_email("user_2") is True
