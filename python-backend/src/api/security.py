"""로컬 앱 셸 밖에서 온 요청을 차단하는 보안 경계.

이 모듈은 보안 민감부라 기능 라우트와 분리해 둔다. Host/Origin 허용 목록과
로컬 경계 미들웨어를 여기서만 관리하고, main.py는 configure_security(app)로
등록만 한다.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = {
    "http://localhost:18732",
    "http://127.0.0.1:18732",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
}
ALLOWED_HOSTS = {"localhost:18731", "127.0.0.1:18731", "localhost", "127.0.0.1"}


def configure_security(app: FastAPI) -> None:
    """CORS와 로컬 경계 미들웨어를 앱에 등록한다.

    등록 순서(CORS 먼저, 그다음 로컬 경계)는 유지해야 한다. 로컬 경계가 CORS보다
    바깥에서 먼저 실행되므로, 비허용 Origin의 preflight는 CORS 헤더가 붙기 전에
    403으로 거부된다.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(ALLOWED_ORIGINS),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def enforce_local_app_boundary(request: Request, call_next):
        """Reject browser requests that do not originate from the local app shell."""
        host = request.headers.get("host", "")
        origin = request.headers.get("origin")

        if host not in ALLOWED_HOSTS:
            return JSONResponse({"status": "error", "message": "허용되지 않은 Host입니다."}, status_code=403)

        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse({"status": "error", "message": "허용되지 않은 Origin입니다."}, status_code=403)

        return await call_next(request)
