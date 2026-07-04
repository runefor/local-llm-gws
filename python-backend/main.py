from fastapi import FastAPI
import uvicorn

from src.api.routers.auth import router as auth_router
from src.api.routers.chat import router as chat_router
from src.api.routers.evidence import router as evidence_router
from src.api.routers.llm_sync import router as llm_sync_router
from src.api.routers.rag import router as rag_router
from src.api.routers.settings_export import router as settings_export_router
from src.api.routers.wiki_conditions import router as wiki_conditions_router
from src.api.security import configure_security
from src.gws.originals import router as gws_originals_router

app = FastAPI(title="Local LLM GWS API", description="Python Backend API for Tauri")
app.include_router(auth_router)
app.include_router(llm_sync_router)
app.include_router(rag_router)
app.include_router(chat_router)
app.include_router(evidence_router)
app.include_router(wiki_conditions_router)
app.include_router(settings_export_router)
app.include_router(gws_originals_router)

configure_security(app)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Python Backend is running!"}


if __name__ == "__main__":
    import threading
    import os
    import time
    import argparse
    from config import config

    parser = argparse.ArgumentParser()
    parser.add_argument("--resource-dir", default="", help="Tauri 리소스 디렉토리 경로")
    parser.add_argument(
        "--parent-pid",
        type=int,
        default=0,
        help="이 PID(부모 앱)가 종료되면 백엔드도 스스로 종료합니다.",
    )
    args, _ = parser.parse_known_args()

    if args.resource_dir:
        config.TAURI_RESOURCE_DIR = args.resource_dir

    def monitor_parent_process(parent_pid: int):
        """부모 프로세스(Tauri)가 종료되면 백엔드를 스스로 종료시킵니다.

        과거에는 sys.stdin.read()로 부모 stdin 파이프의 EOF를 감시했으나,
        stdin fd를 블로킹 read하면 chromadb 초기화(RAG 상태/검색 경로)가
        무한 대기에 빠지는 문제가 있어 부모 PID 폴링 방식으로 교체했습니다.
        """
        import psutil

        while True:
            if not psutil.pid_exists(parent_pid):
                os._exit(0)
            time.sleep(1)

    # 부모 PID가 주어진 경우에만 감시 스레드를 기동한다(Tauri가 항상 --parent-pid를 전달).
    if args.parent_pid:
        monitor_thread = threading.Thread(
            target=monitor_parent_process, args=(args.parent_pid,), daemon=True
        )
        monitor_thread.start()

    uvicorn.run(app, host="127.0.0.1", port=18731)
