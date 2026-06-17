# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-18
**Commit:** d40e9f6
**Branch:** main

## OVERVIEW
Local LLM Google Workspace desktop app: React 19 + TypeScript + Vite frontend, Tauri v2 Rust shell, and FastAPI Python backend. Product focus is Google Workspace/Gmail/Drive sync, local RAG, local LLM model/server control, and Obsidian/Notion export.

## STRUCTURE
```
local-llm-gws/
├── src/              # React app shell, state hub, panels, Material-style UI
├── python-backend/   # FastAPI API, Google Workspace clients, RAG, LLM, sinks
├── src-tauri/        # Tauri v2 Rust wrapper and app bundling config
├── docs/             # setup/deployment and Harness-1 design notes
├── DESIGN.md         # mandatory frontend visual system
├── RULES.md          # Korean project rules for agents
├── GEMINI.md         # stack/runtime rules and historical gotchas
└── run.bat           # local desktop launcher: npm run tauri dev
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Frontend bootstrap | `index.html`, `src/main.tsx`, `src/App.tsx` | `App.tsx` splits Tauri vs web shell. |
| Desktop UI shell | `src/layouts/DesktopLayout.tsx` | State-driven menu; no React Router. |
| Shared frontend API/state | `src/context/AppContext.tsx` | Large hub; most `http://localhost:18731` calls live here. |
| Feature panels | `src/components/` | RAG, LLM config, Gmail workspace, pipeline, logs. |
| Backend routes | `python-backend/main.py` | Monolithic FastAPI route surface on `127.0.0.1:18731`. |
| Google Workspace | `python-backend/src/gws/` | Gmail/Drive auth and data clients. |
| RAG/evidence | `python-backend/src/rag/`, `python-backend/src/evidence.py` | ChromaDB + BM25 + citation-ready records. |
| Local LLM | `python-backend/src/llm/` | Detection, inference config, model downloads, llama.cpp server. |
| Knowledge exports | `python-backend/src/sink/`, `python-backend/src/processor/` | Obsidian/Notion export and pipelines. |
| Tauri lifecycle | `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json` | Launches Python backend in debug and owns window config. |
| Release notes | `docs/deployment.md`, `docs/setup_uv.md` | Mentions sidecar flow; config currently lacks `externalBin`. |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `App` / `AppContent` | React functions | `src/App.tsx` | Provider + Tauri/web layout switch. |
| `AppProvider` | React provider | `src/context/AppContext.tsx` | Global state, backend polling, API orchestration. |
| `DesktopLayout` | React layout | `src/layouts/DesktopLayout.tsx` | Main desktop navigation and panes. |
| `RagSearchPanel` | React component | `src/components/RagSearchPanel.tsx` | Largest frontend hotspot; search/evidence UX. |
| `LlmConfigPanel` | React component | `src/components/LlmConfigPanel.tsx` | Model/server/download UX. |
| `app` | FastAPI app | `python-backend/main.py` | Route registry and local boundary middleware. |
| `enforce_local_app_boundary` | Middleware | `python-backend/main.py` | Host/origin guard for local app API. |
| `get_chroma_client` | Function | `python-backend/src/rag/indexer.py` | Persistent ChromaDB client under `python-backend/data/vectordb`. |
| `retrieve_chunks` | Function | `python-backend/src/rag/retriever.py` | Vector/BM25 retrieval path. |
| `run` | Rust function | `src-tauri/src/lib.rs` | Builds Tauri app and manages Python child process. |

## CONVENTIONS
- Reports and user-facing progress should be Korean unless the user asks otherwise.
- Frontend visual edits must read `DESIGN.md` first and follow Google Material 3: Google blue `#0b57d0`, pastel surfaces, 4px spacing scale, pill buttons, no purple/neon/glow AI aesthetic.
- Keep Tauri and browser behavior separate. Guard Tauri-only imports/calls (`window.__TAURI__`, dynamic `@tauri-apps/*`) so web mode does not crash.
- Internal ports are fixed by current code: backend `127.0.0.1:18731`, frontend dev `18732` with Vite `strictPort: true`.
- TypeScript quality gate is `npm run build` (`tsc && vite build`) with `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.
- Backend tests are unittest-style in `python-backend/tests/`; there is no root test script.
- Treat `.env`, `python-backend/data/`, `*.gguf`, ChromaDB files, tokens, venvs, `dist/`, `node_modules/`, `src-tauri/target/`, and generated schemas as local/generated artifacts unless explicitly asked.

## ANTI-PATTERNS (THIS PROJECT)
- Do not move ChromaDB, token, settings, or model paths out of `python-backend/data/` without preserving persistence and docs.
- Do not broaden FastAPI CORS/host/origin rules without matching tests; local API boundary is security-sensitive.
- Do not add full-body Gmail indexing to metadata search. Current tests protect selected-message vectorization and JIT metadata behavior.
- Do not remove `src-tauri/src/main.rs` `windows_subsystem = "windows"`; it prevents an extra Windows console in release.
- Do not edit generated/cache directories for source fixes: `src-tauri/gen/`, `src-tauri/target/`, `.mypy_cache/`, `__pycache__/`, venvs.
- Do not assume release sidecar packaging is wired just because docs mention it; verify `src-tauri/tauri.conf.json` first.

## UNIQUE STYLES
- Korean UI copy and logs are common in both frontend and backend responses.
- The app is not router-driven; desktop navigation is local state in layout/components.
- Backend route modules are not split yet; route additions in `main.py` increase an existing monolith and should be kept narrow or paired with an intentional router split.
- RAG defaults prefer Drive unless sources are supplied; Gmail body vectorization is selected-message only.

## COMMANDS
```bash
npm run dev
npm run build
npm run preview
npm run tauri dev
npm run tauri build
cd python-backend && python -m unittest discover -s tests
cd python-backend && python main.py
```

## NOTES
- `run.bat` is the simplest local desktop entrypoint and delegates to `npm run tauri dev`.
- Tauri debug startup expects `python-backend/.venv/Scripts/python.exe` on Windows and `python-backend/main.py` in place.
- `docs/setup_uv.md` describes uv/PyInstaller setup; keep docs and `src-tauri/tauri.conf.json` synchronized when changing packaging.
- Existing `.omx/state/.../AGENTS.md` is runtime/session guidance, not repo-wide project guidance.
