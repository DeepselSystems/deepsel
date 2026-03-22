import os
import random
import string


def sanitize_filename(filename):
    if not filename:
        return ""
    special_chars = "~!@#$%^&*()"
    sanitized = "".join(char for char in filename if char not in special_chars)
    return sanitized


def randomize_file_name(filename, length: int = 10):
    characters = string.ascii_letters + string.digits
    file_ext = os.path.splitext(filename)[1]
    file_name_part = os.path.splitext(filename)[0]
    random_string = "".join(
        random.choice(characters) for _ in range(length)  # nosec B311
    )
    new_filename = f"{file_name_part}-{random_string}{file_ext}"

    return new_filename
