# TAURI KNOWLEDGE BASE

## OVERVIEW
Tauri v2 Rust wrapper for the local desktop app. This subtree owns app window config, frontend build wiring, bundle metadata, and debug-time Python backend process lifecycle.

## STRUCTURE
```
src-tauri/
├── src/main.rs          # release Windows subsystem attribute + run() call
├── src/lib.rs           # Tauri builder, Python child process management
├── tauri.conf.json      # dev/build URLs, window, bundle config
├── Cargo.toml           # Rust package/dependencies/profiles
├── capabilities/        # Tauri permissions
├── gen/schemas/         # generated schemas; do not hand-edit for app logic
└── icons/               # bundle icons
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| App entry | `src/main.rs` | Keep Windows release console suppression. |
| Tauri setup | `src/lib.rs` | Plugins, managed backend state, invoke handler. |
| Python backend launch | `src/lib.rs` | Debug only; resolves `python-backend` and `.venv` Python. |
| Window/build config | `tauri.conf.json` | `devUrl`, `beforeDevCommand`, dimensions, bundle targets. |
| Rust deps/profile | `Cargo.toml` | Tauri v2 and opener plugin. |
| Release packaging notes | `../docs/deployment.md`, `../docs/setup_uv.md` | Docs mention sidecar flow; verify config. |

## CONVENTIONS
- Dev frontend URL is `http://localhost:18732`; Vite has `strictPort: true` in root `vite.config.ts`.
- `beforeDevCommand` is `npm run dev`; `beforeBuildCommand` is `npm run build`; frontend dist is `../dist`.
- Debug mode starts `python-backend/main.py` with `python-backend/.venv/Scripts/python.exe` on Windows or `.venv/bin/python` elsewhere.
- `BackendState` stores the Python `Child`; exit handling kills the child process.
- Main window is hidden initially, custom-decorated (`decorations: false`), `1280x860`, minimum `1180x760`.
- Keep Rust changes small; this crate is mostly lifecycle glue, not business logic.

## ANTI-PATTERNS
- Do not remove `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` from `src/main.rs`.
- Do not assume production sidecar packaging exists because docs mention it; `tauri.conf.json` currently has no `externalBin` entry.
- Do not hand-edit `target/` or generated schema files for runtime behavior.
- Do not break backend child cleanup on `RunEvent::ExitRequested`.
- Do not hardcode a new backend path without preserving `resolve_backend_dir()` behavior for root and nested working directories.

## COMMANDS
```bash
npm run tauri dev
npm run tauri build
cargo check --manifest-path src-tauri/Cargo.toml
```

## NOTES
- `src-tauri/src/main.rs:1` explicitly warns that the Windows release console guard must stay.
- If packaging a Python sidecar, update `tauri.conf.json`, docs, and Rust debug/release branch together.
