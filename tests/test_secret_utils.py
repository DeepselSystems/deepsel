from deepsel.utils.secret_utils import truncate_secret


def test_none_returns_none():
    assert truncate_secret(None) is None


def test_empty_string_returns_empty():
    assert truncate_secret("") == ""


def test_normal_long_string():
    result = truncate_secret("sk-1234567890abc")
    assert result == "sk-12............abc"


def test_short_string_fallback():
    # "abc" has len 3, which is < prefix(5) + suffix(3) = 8
    result = truncate_secret("abc")
    assert result == "a............c"


def test_single_char():
    result = truncate_secret("x")
    assert result == "x............"


def test_two_chars():
    result = truncate_secret("ab")
    assert result == "a............b"


def test_custom_prefix_suffix():
    result = truncate_secret("abcdefghij", prefix_length=3, suffix_length=2)
    assert result == "abc............ij"


def test_custom_mask():
    result = truncate_secret("abcdefghij", mask="***")
    assert result == "abcde***hij"


def test_min_length_for_truncation_short():
    # Value length (10) <= min_length_for_truncation (15), uses fallback
    result = truncate_secret("abcdefghij", min_length_for_truncation=15)
    assert result == "a............j"


def test_min_length_for_truncation_exceeded():
    # Value length (15) > min_length_for_truncation (5), truncates normally
    result = truncate_secret("abcdefghijklmno", min_length_for_truncation=5)
    assert result == "abcde............mno"


def test_exact_prefix_plus_suffix_length():
    # len("abcdefgh") == 8 == prefix(5) + suffix(3), should truncate normally
    result = truncate_secret("abcdefgh")
    assert result == "abcde............fgh"
