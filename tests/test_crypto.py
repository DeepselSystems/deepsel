import string

import pytest

from deepsel.utils.crypto import (
    decrypt,
    encrypt,
    generate_recovery_codes,
    get_valid_recovery_code_index,
    hash_text,
    verify_hashed_text,
    verify_recovery_codes,
)


class TestHashText:
    def test_hash_and_verify_round_trip(self):
        hashed = hash_text("s3cret-password")
        assert hashed != "s3cret-password"
        assert verify_hashed_text("s3cret-password", hashed) is True

    def test_verify_rejects_wrong_text(self):
        hashed = hash_text("correct")
        assert verify_hashed_text("wrong", hashed) is False

    def test_hash_is_salted_non_deterministic(self):
        assert hash_text("same") != hash_text("same")


class TestRecoveryCodes:
    def test_generate_default_count_and_length(self):
        codes = generate_recovery_codes()
        assert len(codes) == 16
        assert all(len(c) == 10 for c in codes)

    def test_generate_custom_count_and_length(self):
        codes = generate_recovery_codes(num_codes=5, code_length=4)
        assert len(codes) == 5
        assert all(len(c) == 4 for c in codes)

    def test_generate_uses_uppercase_and_digits_only(self):
        allowed = set(string.ascii_uppercase + string.digits)
        codes = generate_recovery_codes(num_codes=20)
        assert all(set(c) <= allowed for c in codes)

    def test_verify_recovery_codes_hit(self):
        codes = ["ABC123", "DEF456"]
        hashed = [hash_text(c) for c in codes]
        assert verify_recovery_codes("DEF456", hashed) is True

    def test_verify_recovery_codes_miss(self):
        hashed = [hash_text("ABC123")]
        assert verify_recovery_codes("NOPE00", hashed) is False

    def test_verify_recovery_codes_empty_code(self):
        assert verify_recovery_codes("", [hash_text("ABC123")]) is False
        assert verify_recovery_codes(None, [hash_text("ABC123")]) is False

    def test_get_valid_index_returns_position(self):
        codes = ["AAA", "BBB", "CCC"]
        hashed = [hash_text(c) for c in codes]
        assert get_valid_recovery_code_index("CCC", hashed) == 2

    def test_get_valid_index_miss_returns_minus_one(self):
        hashed = [hash_text("AAA")]
        assert get_valid_recovery_code_index("ZZZ", hashed) == -1

    def test_get_valid_index_empty_inputs(self):
        assert get_valid_recovery_code_index("", [hash_text("AAA")]) == -1
        assert get_valid_recovery_code_index("AAA", []) == -1
        assert get_valid_recovery_code_index(None, None) == -1


class TestEncryptDecrypt:
    def test_round_trip(self):
        secret = "my-secret-key"
        token = encrypt("hello world", secret)
        assert token != "hello world"
        assert decrypt(token, secret) == b"hello world"

    def test_wrong_secret_fails(self):
        token = encrypt("payload", "right-secret")
        with pytest.raises(Exception):
            decrypt(token, "wrong-secret")

    def test_exact_32_char_secret(self):
        # key derivation pads/encodes to a valid 32-byte Fernet key
        secret = "x" * 32
        token = encrypt("data", secret)
        assert decrypt(token, secret) == b"data"

    def test_unicode_payload(self):
        secret = "key"
        token = encrypt("héllo→世界", secret)
        assert decrypt(token, secret).decode("utf-8") == "héllo→世界"
