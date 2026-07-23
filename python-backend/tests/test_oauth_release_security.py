import html
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import quote

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import config as config_module
import main
from src.api.routers import auth as auth_router
from src.gws import auth as gws_auth


HEADERS = {"host": "localhost:18731", "origin": "http://localhost:18732"}
PAYLOAD = "<script>alert(\"x\")</script>&'"
ESCAPED_PAYLOAD = html.escape(PAYLOAD, quote=True)


def _write_desktop_client(path: Path, **installed_overrides: object) -> None:
    installed = {
        "client_id": "client-id",
        "client_secret": "client-secret",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost:18731/api/auth/callback"],
    }
    installed.update(installed_overrides)
    path.write_text(json.dumps({"installed": installed}), encoding="utf-8")


def _probe_config(extra_env: dict[str, str], frozen: bool = False) -> dict[str, str]:
    env = os.environ.copy()
    env.pop("LOCAL_LLM_GWS_DATA_DIR", None)
    env.pop("LOCAL_LLM_GWS_CHROMA_DB_PATH", None)
    env.update(extra_env)
    frozen_setup = "sys.frozen=True;" if frozen else ""
    output = subprocess.check_output(
        [
            sys.executable,
            "-c",
            (
                f"import json,sys;{frozen_setup}"
                "import config;"
                "print(json.dumps({"
                "'data_dir':str(config.config.DATA_DIR),"
                "'vector_dir':str(config.config.VECTOR_DB_PATH),"
                "'token_path':str(config.config.TOKEN_PATH)}))"
            ),
        ],
        cwd=BACKEND_ROOT,
        env=env,
        text=True,
    )
    return json.loads(output)


class GoogleCredentialResolutionTests(unittest.TestCase):
    def test_valid_desktop_json_passes_validation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            client_path = Path(tmp_dir) / "client_secrets.json"
            _write_desktop_client(client_path)

            config_module.Config()._validate_google_client_config(client_path)

    def test_each_missing_required_field_fails_without_leaking_value(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            client_path = Path(tmp_dir) / "client_secrets.json"
            for field in ("client_id", "client_secret", "auth_uri", "token_uri", "redirect_uris"):
                with self.subTest(field=field):
                    _write_desktop_client(client_path, **{field: "" if field != "redirect_uris" else []})
                    with self.assertRaises(ValueError) as ctx:
                        config_module.Config()._validate_google_client_config(client_path)
                    self.assertIn(field, str(ctx.exception))
                    self.assertNotIn("client-id", str(ctx.exception))

    def test_non_object_root_and_non_loopback_redirect_fail(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            client_path = Path(tmp_dir) / "client_secrets.json"
            client_path.write_text("[]", encoding="utf-8")
            with self.assertRaises(ValueError):
                config_module.Config()._validate_google_client_config(client_path)

            _write_desktop_client(client_path, redirect_uris=["https://example.com/callback"])
            with self.assertRaises(ValueError) as ctx:
                config_module.Config()._validate_google_client_config(client_path)
            self.assertIn("loopback", str(ctx.exception))

    def test_user_client_secrets_file_wins_when_present(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            user_path = root / "data" / "client_secrets.json"
            bundle_path = root / "bundle" / "client_secrets.json"
            user_path.parent.mkdir()
            bundle_path.parent.mkdir()
            _write_desktop_client(user_path, client_id="user-client")
            _write_desktop_client(bundle_path, client_id="bundle-client")
            cfg = config_module.Config()
            cfg.CREDENTIALS_PATH = user_path

            with patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", str(bundle_path.parent), create=True):
                resolved = cfg.resolve_google_client_config_path()

            self.assertEqual(resolved, user_path)

    def test_invalid_user_override_does_not_fall_back_to_bundle(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            user_path = root / "data" / "client_secrets.json"
            bundle_path = root / "bundle" / "client_secrets.json"
            user_path.parent.mkdir()
            bundle_path.parent.mkdir()
            user_path.write_text("{not-json", encoding="utf-8")
            _write_desktop_client(bundle_path)
            cfg = config_module.Config()
            cfg.CREDENTIALS_PATH = user_path

            with patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", str(bundle_path.parent), create=True):
                with self.assertRaises(ValueError):
                    cfg.resolve_google_client_config_path()

    def test_frozen_bundle_is_used_only_when_user_override_is_absent(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            user_path = root / "data" / "client_secrets.json"
            bundle_path = root / "bundle" / "client_secrets.json"
            user_path.parent.mkdir()
            bundle_path.parent.mkdir()
            _write_desktop_client(bundle_path)
            cfg = config_module.Config()
            cfg.CREDENTIALS_PATH = user_path

            with patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", str(bundle_path.parent), create=True):
                resolved = cfg.resolve_google_client_config_path()

            self.assertEqual(resolved, bundle_path)

    def test_token_path_stays_under_data_dir_not_frozen_bundle(self):
        self.assertEqual(config_module.config.TOKEN_PATH, config_module.config.DATA_DIR / "token.json")

    def test_missing_non_frozen_config_has_actionable_error(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            cfg = config_module.Config()
            cfg.CREDENTIALS_PATH = Path(tmp_dir) / "missing.json"
            with patch.object(sys, "frozen", False, create=True):
                with self.assertRaises(FileNotFoundError) as ctx:
                    cfg.resolve_google_client_config_path()
            self.assertIn("개발 환경", str(ctx.exception))

    def test_dev_frozen_and_process_override_paths(self):
        dev = _probe_config({})
        self.assertEqual(Path(dev["data_dir"]), BACKEND_ROOT / "data")

        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            frozen = _probe_config({"LOCALAPPDATA": str(root)}, frozen=True)
            self.assertEqual(Path(frozen["data_dir"]), root / "local-llm-gws" / "data")

            data_override = root / "custom-data"
            vector_override = root / "custom-vectors"
            overridden = _probe_config(
                {
                    "LOCAL_LLM_GWS_DATA_DIR": str(data_override),
                    "LOCAL_LLM_GWS_CHROMA_DB_PATH": str(vector_override),
                }
            )
            self.assertEqual(Path(overridden["data_dir"]), data_override)
            self.assertEqual(Path(overridden["vector_dir"]), vector_override)
            self.assertEqual(Path(overridden["token_path"]), data_override / "token.json")


class OAuthCallbackHtmlEscapingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def assert_payload_is_escaped(self, response) -> None:
        self.assertNotIn(PAYLOAD, response.text)
        self.assertNotIn("<script>", response.text)
        self.assertIn(ESCAPED_PAYLOAD, response.text)

    def test_google_callback_exception_escapes_dynamic_error_text(self):
        flow = Mock()
        flow.fetch_token.side_effect = RuntimeError(PAYLOAD)
        with patch.object(gws_auth, "_active_flow", flow):
            response = self.client.get("/api/auth/callback?code=x", headers=HEADERS)

        self.assertEqual(response.status_code, 500)
        self.assert_payload_is_escaped(response)

    def test_notion_error_query_escapes_dynamic_error_text(self):
        response = self.client.get(f"/api/auth/notion/callback?error={quote(PAYLOAD)}", headers=HEADERS)

        self.assertEqual(response.status_code, 400)
        self.assert_payload_is_escaped(response)

    def test_notion_token_non_200_body_escapes_dynamic_error_text(self):
        fake_response = Mock(status_code=400, text=PAYLOAD)
        with patch.object(auth_router.config, "NOTION_CLIENT_ID", "id"), \
             patch.object(auth_router.config, "NOTION_CLIENT_SECRET", "secret"), \
             patch("httpx.post", return_value=fake_response):
            response = self.client.get("/api/auth/notion/callback?code=x", headers=HEADERS)

        self.assertEqual(response.status_code, 400)
        self.assert_payload_is_escaped(response)

    def test_notion_callback_exception_escapes_dynamic_error_text(self):
        with patch.object(auth_router.config, "NOTION_CLIENT_ID", "id"), \
             patch.object(auth_router.config, "NOTION_CLIENT_SECRET", "secret"), \
             patch("httpx.post", side_effect=RuntimeError(PAYLOAD)):
            response = self.client.get("/api/auth/notion/callback?code=x", headers=HEADERS)

        self.assertEqual(response.status_code, 500)
        self.assert_payload_is_escaped(response)

    def test_login_json_error_message_is_not_html_escaped(self):
        with patch("src.gws.auth.get_auth_url_and_start_server", side_effect=RuntimeError(PAYLOAD)):
            response = self.client.post("/api/auth/login", headers=HEADERS)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], PAYLOAD)


if __name__ == "__main__":
    unittest.main()
