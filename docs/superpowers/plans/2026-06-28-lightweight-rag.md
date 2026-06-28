# Lightweight RAG & Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱의 기본 모델을 1B 체급으로 경량화하고, 7B 이상의 고용량 모델은 UI에서 파워 유저 전용으로 분리하며, 사용자의 하드웨어 사양을 직관적으로 보여주어 올바른 모델 선택을 유도합니다.

**Architecture:** 
백엔드(`manager.py`)의 프리셋 목록을 "Lightweight(1B~3B)"과 "Heavy(7B+)" 그룹으로 재편성합니다. 프론트엔드(`LlmConfigPanel.tsx`)에서는 백엔드의 `/api/llm/hardware` 엔드포인트를 호출하여 내 PC 사양을 상단에 표시하고, 모델 다운로드 목록을 플랫 리스트에서 2개의 아코디언/섹션(권장 모델 vs 고급 모델)으로 시각적으로 분리합니다.

**Tech Stack:** React 19, Tailwind CSS, FastAPI, Python

## Global Constraints

- 한국어 커뮤니케이션 및 코드 주석 유지 (Rule 1)
- 버튼은 반드시 `rounded-full` (알약 형태) 적용 (Rule 2 / DESIGN.md)
- Primary 색상 `#0b57d0` 사용, AI 특유의 네온/보라색 배제 (Rule 2 / DESIGN.md)
- 간격(Margin/Padding)은 4px 배수 엄수 (Rule 2)

---

### Task 1: 백엔드 프리셋 및 하드웨어 매핑 재편성

**Files:**
- Modify: `python-backend/src/llm/manager.py:10-85`
- Test: `python-backend/tests/test_manager.py` (또는 수동 확인)

**Interfaces:**
- Consumes: 기존 `PRESET_MODELS` 및 `tier_map`
- Produces: `category` 속성이 추가된 프리셋 모델 목록 API 응답

- [ ] **Step 1: 프리셋 데이터 구조에 `category` 속성 추가**
`manager.py`의 프리셋 리스트에 `category` 필드("recommended" 또는 "power_user")를 추가하고, 모델을 1B 중심으로 개편합니다.

```python
# python-backend/src/llm/manager.py 수정 예시
PRESET_MODELS = [
    {
        "id": "gemma3-1b",
        "name": "Gemma 3 1B IT (권장)",
        "description": "구글의 초경량 모델. 속도가 매우 빠르며 RAG 요약에 최적화되어 있습니다.",
        "ram_gb_required": 4,
        "vram_gb_required": 0,
        "profile": "cpu_only",
        "repo_id": "google/gemma-3-1b-it-GGUF",
        "filename": "gemma-3-1b-it-Q4_K_M.gguf",
        "category": "recommended" # 신규 추가
    },
    {
        "id": "llama3.2-3b",
        "name": "Llama 3.2 3B Instruct",
        "description": "메타의 경량 모델. 품질과 속도의 균형이 좋습니다.",
        "ram_gb_required": 8,
        "vram_gb_required": 0,
        "profile": "cpu_only",
        "repo_id": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "category": "recommended" # 신규 추가
    },
    {
        "id": "exaone3-7.8b",
        "name": "EXAONE 3.0 7.8B (파워 유저)",
        "description": "고품질 한국어 답변. 5GB 이상의 여유 공간과 높은 사양이 필요합니다.",
        "ram_gb_required": 16,
        "vram_gb_required": 0,
        "profile": "mid_8gb",
        "repo_id": "LGAI-EXAONE/EXAONE-3.0-7.8B-Instruct-GGUF",
        "filename": "exaone-3.0-7.8b-instruct-q4_k_m.gguf",
        "category": "power_user" # 신규 추가
    }
]
```

- [ ] **Step 2: API 라우터(main.py) 응답 모델 검토**
FastAPI에서 `/api/llm/presets` 응답 시 `category` 필드가 직렬화되도록 보장합니다. FastAPI에서 리스트를 그대로 반환하므로 모델에 필드만 추가하면 됩니다.

---

### Task 2: 프론트엔드 - 하드웨어 정보 조회 및 프리셋 인터페이스 갱신

**Files:**
- Modify: `src/components/LlmConfigPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/llm/hardware`, `GET /api/llm/presets`
- Produces: 사용자 하드웨어 상태(RAM, GPU)가 패널 상단에 표시됨.

- [ ] **Step 1: Preset 및 하드웨어 인터페이스 정의 갱신**
`LlmConfigPanel.tsx` 상단에 새 필드를 반영합니다.

```typescript
interface Preset {
  id: string;
  name: string;
  description: string;
  ram_gb_required: number;
  category?: "recommended" | "power_user";
}

interface HardwareProfile {
  ram_gb: number;
  gpu_name: string;
  vram_gb: number;
  profile_tier: string;
}
```

- [ ] **Step 2: 하드웨어 정보 Fetch 로직 추가**
상태 변수 `hardware, setHardware`를 추가하고 렌더링 시점에 백엔드 API를 호출합니다.

```typescript
const [hardware, setHardware] = useState<HardwareProfile | null>(null);

const fetchHardware = async () => {
  try {
    const res = await fetch("http://127.0.0.1:18731/api/llm/hardware");
    if (res.ok) setHardware(await res.json());
  } catch (e) {
    console.error("하드웨어 정보 조회 실패", e);
  }
};

useEffect(() => {
  // 모드가 internal일 때 조회하도록 의존성 배열 구성
  if (llmMode === "internal") fetchHardware();
}, [llmMode]);
```

- [ ] **Step 3: 패널 상단에 하드웨어 정보 표시 UI 렌더링**
내장 모드(`internal`) 탭 내부 최상단에 하드웨어 정보를 Material 3 스타일로 렌더링합니다.

```tsx
{/* 내장 로컬 모드 설정 부분 상단에 추가 */}
{llmMode === "internal" && (
  <div className="space-y-6">
    {hardware && (
      <div className="bg-primary/5 rounded-[12px] p-4 border border-primary/10 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-primary">내 시스템 사양</h3>
          <p className="text-sm text-gray-600 mt-1">
            RAM: {hardware.ram_gb}GB | GPU: {hardware.gpu_name} (VRAM: {hardware.vram_gb}GB)
          </p>
        </div>
        <div className="px-3 py-1 bg-white rounded-full text-xs font-medium text-gray-500 shadow-sm border border-gray-100">
          프로파일: {hardware.profile_tier}
        </div>
      </div>
    )}
```

---

### Task 3: 프론트엔드 - 추천/고급 모델 목록 시각적 분리

**Files:**
- Modify: `src/components/LlmConfigPanel.tsx`

**Interfaces:**
- Consumes: Task 1에서 추가된 `category` 기반의 프리셋 배열
- Produces: 2개의 그룹으로 분리된 모델 리스트 UI

- [ ] **Step 1: 프리셋 배열을 두 그룹으로 분리 필터링**
컴포넌트 렌더링 영역 상단에서 `presets` 배열을 분리합니다.

```typescript
const recommendedPresets = presets.filter(p => !p.category || p.category === "recommended");
const powerUserPresets = presets.filter(p => p.category === "power_user");
```

- [ ] **Step 2: 기본 권장 모델 섹션 렌더링**
```tsx
<div className="space-y-4">
  <h3 className="text-base font-semibold text-gray-800 px-1">기본 권장 모델 (빠르고 가벼움)</h3>
  <div className="space-y-3">
    {recommendedPresets.map((preset) => (
       /* 기존 맵핑하던 프리셋 카드 UI 코드를 그대로 재사용 */
    ))}
  </div>
</div>
```

- [ ] **Step 3: 파워 유저 모델 섹션 렌더링**
경고 문구와 함께 분리된 섹션을 구성합니다.
```tsx
{powerUserPresets.length > 0 && (
  <div className="space-y-4 pt-4 border-t border-gray-100">
    <div className="px-1">
      <h3 className="text-base font-semibold text-gray-800">파워 유저용 고품질 모델</h3>
      <p className="text-xs text-gray-500 mt-1">
        하드 드라이브 용량(5GB 이상)과 높은 RAM을 요구합니다. 고사양 PC 사용자에게만 권장합니다.
      </p>
    </div>
    <div className="space-y-3">
      {powerUserPresets.map((preset) => (
         /* 기존 맵핑하던 프리셋 카드 UI 코드를 그대로 재사용 */
      ))}
    </div>
  </div>
)}
```

---

## Verification Plan

### Manual Verification
1. 프론트엔드/백엔드 모두 가동 (`npm run tauri dev`).
2. **UI 확인**: LLM 설정 패널에서 상단에 `내 시스템 사양` 박스가 렌더링되고 PC RAM/GPU가 맞게 표시되는지 확인.
3. **분리 확인**: 모델 다운로드 리스트가 "기본 권장 모델"과 "파워 유저용 고품질 모델"로 나뉘어 있는지 확인.
4. **다운로드/상태 확인**: 권장 모델에 있는 Gemma 3 1B의 다운로드 버튼이 정상 동작하는지 테스트.
