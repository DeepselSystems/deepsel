from unittest.mock import MagicMock, patch

import pytest

import deepsel.utils.storage as storage


@pytest.fixture(autouse=True)
def reset_client_cache():
    """Reset module-level singletons before and after each test."""
    storage._s3_client = None
    storage._blob_service_client = None
    yield
    storage._s3_client = None
    storage._blob_service_client = None


class TestGetS3Client:
    def test_builds_with_env_credentials(self, monkeypatch):
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIA_TEST")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret")
        monkeypatch.setenv("AWS_REGION", "ap-southeast-1")
        sentinel = MagicMock(name="s3")
        with patch("boto3.client", return_value=sentinel) as mock_client:
            result = storage.get_s3_client()
        assert result is sentinel
        mock_client.assert_called_once_with(
            "s3",
            aws_access_key_id="AKIA_TEST",
            aws_secret_access_key="secret",
            region_name="ap-southeast-1",
        )

    def test_cached_after_first_call(self):
        sentinel = MagicMock(name="s3")
        with patch("boto3.client", return_value=sentinel) as mock_client:
            first = storage.get_s3_client()
            second = storage.get_s3_client()
        assert first is second is sentinel
        mock_client.assert_called_once()


class TestGetBlobServiceClient:
    def test_builds_from_connection_string(self, monkeypatch):
        monkeypatch.setenv("AZURE_STORAGE_CONNECTION_STRING", "conn-str")
        sentinel = MagicMock(name="blob")
        with patch(
            "azure.storage.blob.BlobServiceClient.from_connection_string",
            return_value=sentinel,
        ) as mock_from:
            result = storage.get_blob_service_client()
        assert result is sentinel
        mock_from.assert_called_once_with("conn-str")

    def test_cached_after_first_call(self):
        sentinel = MagicMock(name="blob")
        with patch(
            "azure.storage.blob.BlobServiceClient.from_connection_string",
            return_value=sentinel,
        ) as mock_from:
            first = storage.get_blob_service_client()
            second = storage.get_blob_service_client()
        assert first is second is sentinel
        mock_from.assert_called_once()
