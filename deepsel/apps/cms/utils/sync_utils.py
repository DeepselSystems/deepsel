"""Utility functions for syncing directories."""

import hashlib
import os
import shutil


def _file_hash(filepath, chunk_size=8192):
    """Compute MD5 hash of entire file in chunks for memory efficiency."""
    hasher = hashlib.md5(usedforsecurity=False)
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                hasher.update(chunk)
    except (IOError, OSError):
        return None
    return hasher.hexdigest()


def sync_directory(src, dst, exclude_dirs=None):
    """
    Recursively sync src to dst, excluding certain directories.

    Args:
        src: Source directory path
        dst: Destination directory path
        exclude_dirs: Set of directory names to exclude from sync
    """
    if exclude_dirs is None:
        exclude_dirs = {"node_modules", "dist", ".astro", ".git"}

    # Get all items in source
    src_items = set(os.listdir(src)) if os.path.exists(src) else set()
    dst_items = set(os.listdir(dst)) if os.path.exists(dst) else set()

    # Remove items from dst that don't exist in src (excluding protected dirs)
    for item in dst_items - src_items:
        if item in exclude_dirs:
            continue
        dst_path = os.path.join(dst, item)
        if os.path.isdir(dst_path):
            shutil.rmtree(dst_path)
        else:
            os.remove(dst_path)

    # Add or update items from src to dst
    for item in src_items:
        if item in exclude_dirs:
            continue

        src_path = os.path.join(src, item)
        dst_path = os.path.join(dst, item)

        if os.path.isdir(src_path):
            # Recursively sync directories
            if not os.path.exists(dst_path):
                os.makedirs(dst_path, exist_ok=True)
            sync_directory(src_path, dst_path, exclude_dirs)
        else:
            # Copy files if they don't exist or are different
            should_copy = False
            if not os.path.exists(dst_path):
                should_copy = True
            else:
                # Compare file sizes first (cheap), then hash if sizes match
                src_size = os.path.getsize(src_path)
                dst_size = os.path.getsize(dst_path)
                if src_size != dst_size:
                    should_copy = True
                elif _file_hash(src_path) != _file_hash(dst_path):
                    should_copy = True

            if should_copy:
                shutil.copy2(src_path, dst_path)
