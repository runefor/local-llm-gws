import sys
import types
import unittest
import importlib
from pathlib import Path

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


# 라우터 분리(main.py 모놀리스 → 도메인별 APIRouter) 전후로 이 집합이 바뀌지 않아야 한다.
# 새 엔드포인트를 의도적으로 추가/삭제할 때만 이 목록을 갱신한다.
EXPECTED_ROUTES = {
    ("DELETE", "/api/evidence-sets/{evidence_set_id}"),
    ("DELETE", "/api/wiki-conditions/{condition_id}"),
    ("GET", "/"),
    ("GET", "/api/auth/callback"),
    ("GET", "/api/auth/notion/callback"),
    ("GET", "/api/auth/notion/url"),
    ("GET", "/api/auth/status"),
    ("GET", "/api/chat/sessions"),
    ("GET", "/api/chat/sessions/{session_id}"),
    ("GET", "/api/evidence-sets"),
    ("GET", "/api/evidence-sets/{evidence_set_id}"),
    ("GET", "/api/gmail/labels"),
    ("GET", "/api/llm/config"),
    ("GET", "/api/llm/detect"),
    ("GET", "/api/llm/download/progress/{preset_id}"),
    ("GET", "/api/llm/hardware"),
    ("GET", "/api/llm/local_models"),
    ("GET", "/api/llm/presets"),
    ("GET", "/api/llm/server/status"),
    ("GET", "/api/notion/pages"),
    ("GET", "/api/rag/status"),
    ("GET", "/api/settings"),
    ("GET", "/api/wiki-conditions"),
    ("GET,HEAD", "/docs"),
    ("GET,HEAD", "/docs/oauth2-redirect"),
    ("GET,HEAD", "/openapi.json"),
    ("GET,HEAD", "/redoc"),
    ("PATCH", "/api/artifacts/{artifact_id}"),
    ("PATCH", "/api/artifacts/{artifact_id}/status"),
    ("PATCH", "/api/evidence-sets/{evidence_set_id}"),
    ("PATCH", "/api/wiki-conditions/{condition_id}"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/chat/sessions"),
    ("POST", "/api/chat/sessions/{session_id}/messages"),
    ("POST", "/api/chat/sessions/{session_id}/messages/stream"),
    ("POST", "/api/evidence-sets"),
    ("POST", "/api/evidence-sets/{evidence_set_id}/artifacts"),
    ("POST", "/api/export/notion"),
    ("POST", "/api/export/obsidian"),
    ("POST", "/api/gmail/search"),
    ("POST", "/api/gmail/vectorize"),
    ("POST", "/api/gws/originals/search"),
    ("POST", "/api/llm/config"),
    ("POST", "/api/llm/delete"),
    ("POST", "/api/llm/download"),
    ("POST", "/api/llm/server/start"),
    ("POST", "/api/llm/server/stop"),
    ("POST", "/api/llm/test"),
    ("POST", "/api/rag/feedback"),
    ("POST", "/api/rag/index"),
    ("POST", "/api/rag/search"),
    ("POST", "/api/settings"),
    ("POST", "/api/sync/drive"),
    ("POST", "/api/sync/gmail"),
    ("POST", "/api/utils/select_directory"),
    ("POST", "/api/wiki-conditions"),
    ("POST", "/api/wiki-conditions/{condition_id}/run"),
}


class RouteInventoryTest(unittest.TestCase):
    def _actual_routes(self):
        routes = set()
        for route in main.app.routes:
            methods = getattr(route, "methods", None)
            if not methods:
                continue
            # OPTIONS/HEAD 자동 추가분 중 HEAD는 GET과 함께 의미가 있으므로 유지, OPTIONS는 제외한다.
            relevant = sorted(m for m in methods if m != "OPTIONS")
            routes.add((",".join(relevant), route.path))
        return routes

    def test_route_surface_is_unchanged(self):
        self.assertEqual(self._actual_routes(), EXPECTED_ROUTES)


if __name__ == "__main__":
    unittest.main()
