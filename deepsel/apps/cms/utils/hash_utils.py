"""Hashing utilities for theme setup."""

import os
import hashlib


def hash_file(path: str):
    """Hash a single file."""
    if not os.path.exists(path):
        return None
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def hash_directory(
    path: str, ignored_dirs: list[str] = ["node_modules", "dist", ".astro", ".git"]
):
    """Hash an entire directory, optionally ignoring certain subdirectories."""
    if not os.path.exists(path):
        return None
    hasher = hashlib.sha256()
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        dirs.sort()
        files.sort()
        rel_root = os.path.relpath(root, path)
        hasher.update(rel_root.encode("utf-8"))
        for file_name in files:
            file_path = os.path.join(root, file_name)
            hasher.update(file_name.encode("utf-8"))
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    hasher.update(chunk)
    return hasher.hexdigest()


def hash_theme_files(theme_files):
    """Hash theme files from database models."""
    hasher = hashlib.sha256()
    for theme_file in sorted(
        theme_files,
        key=lambda tf: ((tf.theme_name or ""), (tf.file_path or "")),
    ):
        hasher.update((theme_file.theme_name or "").encode("utf-8"))
        hasher.update((theme_file.file_path or "").encode("utf-8"))
        for content in sorted(theme_file.contents, key=lambda c: (c.lang_code or "")):
            hasher.update((content.lang_code or "").encode("utf-8"))
            hasher.update((content.content or "").encode("utf-8"))
            updated_at = getattr(content, "updated_at", None)
            if updated_at:
                hasher.update(str(updated_at).encode("utf-8"))
    return hasher.hexdigest()
