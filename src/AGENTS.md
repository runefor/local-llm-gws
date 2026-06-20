# FRONTEND KNOWLEDGE BASE

## OVERVIEW
React 19 + TypeScript frontend for the Tauri/web app. This subtree owns the visual shell, Google Workspace/RAG/LLM panels, and browser-safe API orchestration.

## STRUCTURE
```
src/
├── main.tsx          # React bootstrap
├── App.tsx           # AppProvider + Tauri/web layout switch
├── context/          # AppContext: shared state and backend calls
├── layouts/          # DesktopLayout shell and desktop menu state
├── components/       # Feature panels and titlebar
├── utils/env.ts      # Tauri environment detection
├── App.css           # App-level styling
└── index.css         # Tailwind/CSS entry
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| App boot | `main.tsx`, `App.tsx` | `isTauri()` decides desktop vs web shell. |
| Shared data/API actions | `context/AppContext.tsx` | Large state hub; touch carefully. |
| Desktop navigation | `layouts/DesktopLayout.tsx` | `activeMenu` drives view changes; no React Router. |
| Browser fallback | `layouts/DesktopLayout.tsx` | Browser mode reuses the desktop shell. |
| RAG/evidence UX | `components/RagSearchPanel.tsx` | Largest panel; search, index, evidence sets, artifacts. |
| Gmail workflow | `components/HybridMailWorkspace.tsx`, `components/SyncPanel.tsx` | Metadata search, selection, vectorize/process handoff. |
| Local LLM UX | `components/LlmConfigPanel.tsx` | Server status, preset download/delete, mode config. |
| Pipeline/export UX | `components/KnowledgePipelinePanel.tsx`, `components/ServiceConfigPanel.tsx` | Obsidian/Notion settings and exports. |

## CONVENTIONS
- Read root `DESIGN.md` before any rendered UI/CSS change.
- Use Google Material 3 tone: `#0b57d0`, pastel blue containers, subtle borders/shadows, 4px spacing multiples.
- All interactive buttons stay pill-shaped (`border-radius: 9999px` / `rounded-full` equivalent). Cards use 12px or 16px radius.
- Avoid purple/indigo gradients, neon glow, oversized blur, and lorem ipsum filler.
- Keep Korean user-facing labels/logs natural and concise.
- Tauri-only APIs must be guarded or dynamically imported. Browser mode must not crash if Tauri APIs are unavailable.
- Current API base is hardcoded as `http://localhost:18731`; update all call sites consistently if this changes.
- `npm run build` is the frontend verification gate; TypeScript forbids unused locals/params.

## ANTI-PATTERNS
- Do not add React Router unless navigation architecture is intentionally changed across both desktop and web layouts.
- Do not duplicate backend state outside `AppContext` unless the panel state is purely local UI state.
- Do not call backend endpoints from visual components without considering `backendStatus`, auth state, and existing `AppContext` helpers.
- Do not import `@tauri-apps/*` at top level in code that can run in web mode.
- Do not edit `dist/`; it is build output.

## HOTSPOTS
- `components/RagSearchPanel.tsx` (~1060 lines): evidence/search complexity.
- `context/AppContext.tsx` (~900 lines): global state and API contract surface.
- `components/LlmConfigPanel.tsx` (~600 lines): local model/server lifecycle.
- `components/HybridMailWorkspace.tsx` (~500 lines): selected Gmail processing flow.
