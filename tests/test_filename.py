import os

from deepsel.utils.filename import randomize_file_name, sanitize_filename


class TestSanitizeFilename:
    def test_removes_special_chars(self):
        assert sanitize_filename("a~b!c@d#e$f%g^h&i*j(k)l.txt") == "abcdefghijkl.txt"

    def test_keeps_normal_chars(self):
        assert sanitize_filename("my_file-01.pdf") == "my_file-01.pdf"

    def test_empty_returns_empty(self):
        assert sanitize_filename("") == ""

    def test_none_returns_empty(self):
        assert sanitize_filename(None) == ""

    def test_only_special_chars(self):
        assert sanitize_filename("~!@#$%^&*()") == ""


class TestRandomizeFileName:
    def test_preserves_extension(self):
        result = randomize_file_name("photo.jpg")
        assert result.endswith(".jpg")
        assert os.path.splitext(result)[1] == ".jpg"

    def test_keeps_name_part_prefix(self):
        result = randomize_file_name("report.pdf")
        assert result.startswith("report-")

    def test_default_random_length(self):
        result = randomize_file_name("a.txt")
        # "a" + "-" + 10 random chars + ".txt"
        random_part = result[len("a-") : -len(".txt")]
        assert len(random_part) == 10

    def test_custom_length(self):
        result = randomize_file_name("a.txt", length=4)
        random_part = result[len("a-") : -len(".txt")]
        assert len(random_part) == 4

    def test_randomization_differs(self):
        assert randomize_file_name("x.png") != randomize_file_name("x.png")

    def test_no_extension(self):
        result = randomize_file_name("README")
        assert result.startswith("README-")
        assert os.path.splitext(result)[1] == ""
