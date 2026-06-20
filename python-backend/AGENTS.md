# PYTHON BACKEND KNOWLEDGE BASE

## OVERVIEW
FastAPI backend for the local desktop app. This subtree owns Google Workspace auth/data access, local RAG, LLM detection/inference/server control, evidence artifacts, and Obsidian/Notion export.

## STRUCTURE
```
python-backend/
├── main.py           # FastAPI app, middleware, route registry
├── config.py         # env + data/model/token path configuration
├── requirements.txt  # backend dependencies
├── src/
│   ├── gws/          # Google auth, Gmail, Drive clients
│   ├── rag/          # ChromaDB/BM25 indexing and retrieval
│   ├── llm/          # local server detection, inference, model management
│   ├── processor/    # RAG/LLM pipelines
│   ├── sink/         # Obsidian/Notion export
│   ├── evidence.py   # evidence sets, artifacts, citation maps
│   └── settings.py   # Obsidian/Notion user settings
└── tests/            # unittest tests with dependency stubs
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| API route contract | `main.py` | Monolithic; host/origin guard at top. |
| Env/default paths | `config.py`, `.env.example` | `data/` is the persistence root. |
| Gmail metadata/search | `src/gws/gmail.py`, `main.py` | Metadata search must avoid full-body fetch. |
| Google OAuth | `src/gws/auth.py`, `main.py` callbacks | Token stored under `data/token.json`. |
| Drive sync | `src/gws/drive.py`, `src/rag/indexer.py` | Drive sync can auto-index and rebuild BM25. |
| RAG indexing | `src/rag/indexer.py` | ChromaDB persistence + multilingual tokenization. |
| RAG retrieval | `src/rag/retriever.py` | Fusion/filtering and evidence record conversion. |
| LLM config/inference | `src/llm/inference.py`, `src/llm/detector.py` | OpenAI-compatible endpoints. |
| Model/server lifecycle | `src/llm/manager.py`, `src/llm/server.py` | GGUF downloads and llama.cpp server control. |
| Export sinks | `src/sink/obsidian.py`, `src/sink/notion.py` | User-configured destinations. |

## CONVENTIONS
- Backend listens on `127.0.0.1:18731`; frontend expects `http://localhost:18731`.
- Keep `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` restrictive. Add/update tests when changing them.
- Persist runtime/user data under `python-backend/data/`: ChromaDB, BM25 pickle, tokens, settings, model files.
- `Config.save_user_config()` mirrors LLM config into `data/config.json`; keep in-memory config and file state aligned.
- Gmail listing/search is metadata-first. Full body fetch is only for explicit selected-message vectorization.
- RAG source normalization currently defaults to Drive when no source is provided.
- Use Korean error/status messages where the API response is shown directly in the UI.
- Tests use `unittest` and often stub heavy Google/Chroma/SentenceTransformer dependencies.

## ANTI-PATTERNS
- Do not move or clear `data/vectordb`, `token.json`, `settings.json`, or downloaded `.gguf` files without explicit migration intent.
- Do not import/load heavy RAG dependencies on metadata-only Gmail search paths; tests assert this behavior.
- Do not allow legacy full Gmail body indexing through `/api/rag/index` for Gmail; selected-message vectorization is the safe path.
- Do not broaden local boundary middleware to arbitrary browser origins.
- Do not treat `.env`, `data/`, `.venv/`, `venv/`, or `__pycache__/` as source files.

## COMMANDS
```bash
cd python-backend && python main.py
cd python-backend && python -m unittest discover -s tests
cd python-backend && python -m unittest tests.test_gmail_jit
cd python-backend && python -m unittest tests.test_obsidian_export
```

## NOTES
- Tauri debug launch expects `.venv/Scripts/python.exe` on Windows.
- `requirements.txt` is the dependency source; no `pyproject.toml` or pytest config is present.
- `docs/setup_uv.md` documents an uv/PyInstaller path, but source still relies on this directory layout for debug.
