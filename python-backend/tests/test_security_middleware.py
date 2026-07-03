import sys
import types
import unittest
import importlib
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _install_dependency_stubs() -> None:
    googleapiclient = types.ModuleType("googleapiclient")
    discovery = types.ModuleType("googleapiclient.discovery")
    setattr(discovery, "build", lambda *args, **kwargs: None)
    setattr(googleapiclient, "discovery", discovery)
    sys.modules.setdefault("googleapiclient", googleapiclient)
    sys.modules.setdefault("googleapiclient.discovery", discovery)

    google = types.ModuleType("google")
    google_auth = types.ModuleType("google.auth")
    google_auth_transport = types.ModuleType("google.auth.transport")
    google_auth_requests = types.ModuleType("google.auth.transport.requests")
    setattr(google_auth_requests, "Request", lambda *args, **kwargs: None)
    google_oauth2 = types.ModuleType("google.oauth2")
    google_oauth2_credentials = types.ModuleType("google.oauth2.credentials")
    credentials = type("Credentials", (), {"from_authorized_user_file": staticmethod(lambda *args, **kwargs: None)})
    setattr(google_oauth2_credentials, "Credentials", credentials)
    google_auth_oauthlib = types.ModuleType("google_auth_oauthlib")
    google_auth_oauthlib_flow = types.ModuleType("google_auth_oauthlib.flow")
    flow = type("Flow", (), {"from_client_secrets_file": staticmethod(lambda *args, **kwargs: None)})
    setattr(google_auth_oauthlib_flow, "Flow", flow)
    sys.modules.setdefault("google", google)
    sys.modules.setdefault("google.auth", google_auth)
    sys.modules.setdefault("google.auth.transport", google_auth_transport)
    sys.modules.setdefault("google.auth.transport.requests", google_auth_requests)
    sys.modules.setdefault("google.oauth2", google_oauth2)
    sys.modules.setdefault("google.oauth2.credentials", google_oauth2_credentials)
    sys.modules.setdefault("google_auth_oauthlib", google_auth_oauthlib)
    sys.modules.setdefault("google_auth_oauthlib.flow", google_auth_oauthlib_flow)

    chromadb = types.ModuleType("chromadb")
    setattr(chromadb, "PersistentClient", lambda *args, **kwargs: None)
    chromadb_config = types.ModuleType("chromadb.config")
    setattr(chromadb_config, "Settings", lambda *args, **kwargs: None)
    sys.modules.setdefault("chromadb", chromadb)
    sys.modules.setdefault("chromadb.config", chromadb_config)

    markdownify = types.ModuleType("markdownify")
    setattr(markdownify, "markdownify", lambda value: value)
    sys.modules.setdefault("markdownify", markdownify)

    rank_bm25 = types.ModuleType("rank_bm25")
    setattr(rank_bm25, "BM25Okapi", lambda *args, **kwargs: None)
    sys.modules.setdefault("rank_bm25", rank_bm25)


_install_dependency_stubs()

main = importlib.import_module("main")


HEADERS = {"host": "localhost:18731", "origin": "http://localhost:18732"}
client = TestClient(main.app)


class SecurityMiddlewareTests(unittest.TestCase):
    def test_allowed_host_and_allowed_origin_passes(self):
        response = client.get("/", headers=HEADERS)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_allowed_host_without_origin_passes(self):
        response = client.get("/", headers={"host": "localhost:18731"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_disallowed_host_is_rejected(self):
        response = client.get("/", headers={**HEADERS, "host": "evil.example:18731"})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["message"], "허용되지 않은 Host입니다.")

    def test_disallowed_origin_is_rejected(self):
        response = client.get("/", headers={**HEADERS, "origin": "http://evil.example"})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["message"], "허용되지 않은 Origin입니다.")

    def test_tauri_origins_pass(self):
        for origin in ("http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"):
            with self.subTest(origin=origin):
                response = client.get("/", headers={**HEADERS, "origin": origin})

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "ok")

    def test_allowed_hosts_pass_without_origin(self):
        for host in ("localhost:18731", "127.0.0.1:18731", "localhost", "127.0.0.1"):
            with self.subTest(host=host):
                response = client.get("/", headers={"host": host})

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "ok")

    def test_cors_preflight_allowed_origin_echoes_origin(self):
        response = client.options(
            "/",
            headers={
                "host": "localhost:18731",
                "origin": "http://localhost:18732",
                "access-control-request-method": "GET",
            },
        )

        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:18732")

    def test_cors_preflight_disallowed_origin_does_not_echo_origin(self):
        response = client.options(
            "/",
            headers={
                "host": "localhost:18731",
                "origin": "http://evil.example",
                "access-control-request-method": "GET",
            },
        )

        # Current stack: local boundary rejects this before CORS can echo the origin.
        self.assertEqual(response.status_code, 403)
        self.assertNotEqual(response.headers.get("access-control-allow-origin"), "http://evil.example")
