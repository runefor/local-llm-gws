# Spec — Wiki 아티팩트 품질·구조 강화

**Status:** draft (review 전)
**Date:** 2026-07-05
**Scope:** 기존 Wiki 생성 파이프라인의 산출물 품질/구조 심화. **새 아티팩트 유형은 추가하지 않는다.**

## 1. Context / 문제

앱의 Wiki 생성층은 이미 "생성 → 인용/lint → 상태 → export" 골격을 갖췄다(`src/wiki_artifacts.py`,
`src/evidence.py`, `src/wiki_condition_runner.py`, `src/wiki_fallback.py`). 그러나 산출물이 lint를
`candidate`로 통과해도 실제 품질이 낮을 수 있는 **구조적 허점**이 있다:

- `lint_artifact_content`(`wiki_artifacts.py:102`)는 9개 필수 H2 섹션의 **제목 존재만** 검사하고
  **내용이 비어 있는지**는 보지 않는다 → LLM이 `## 확정에 가까운 사실`만 쓰고 본문을 비워도 통과.
- 인용은 **문서 전체에 [ev_...]가 1개 이상** 있으면 통과(`missing_citation`) → "확정에 가까운 사실"의
  개별 주장에 근거가 안 붙어도 통과. 근거 없는 사실 진술이 남을 수 있다.
- 프롬프트(`evidence.py:272`)는 `## 출처 지도`를 **표**로 요구하지만 lint는 표 여부/필수 열을 검증 안 함.
- `SUBJECTIVE_CLAIM_RE`(`wiki_artifacts.py:21`) 어휘가 작아(가장|최고|최선|나은|좋은|우수|언급|추정|보임|것으로 보)
  평가성 표현이 "확정 사실"에 섞여도 놓치기 쉽다.

즉 `status_for_lint`(candidate/needs_review)의 신뢰도가 약하다. 이 spec은 **lint를 실질 품질 게이트로
강화하고, 생성 프롬프트를 강화된 계약에 맞춰 정렬**해 근거 없는/구조만 흉내낸 Wiki가 `candidate`로
새어나가지 않게 한다. 이는 검색 품질 게이트(2026-07-05 통과)에 이은 "근거→Wiki" 산출물 신뢰도 강화다.

## 2. 목표 / 비목표

**목표**
- 생성된 Wiki 아티팩트가 lint를 통과하면 "구조 완비 + 사실 주장에 근거 부착 + 평가/사실 분리"가
  실제로 보장된다.
- 프롬프트가 강화된 lint 규칙과 1:1로 정렬되어, 정상 LLM이면 재생성 없이 통과하도록 한다(false-fail 최소화).
- 모든 새 규칙은 `tests/test_wiki_artifacts.py`에 단위 테스트로 고정된다.

**비목표**
- 새 아티팩트 유형(회의록/타임라인/FAQ 등) 추가 — 별도 spec.
- 조건 경로(`_build_wiki_prompt`)의 "가벼운 초안" 성격 변경 — 기본 유지(§5에서 선택적 정렬만 논의).
- 외부 LLM 전송 경고 흐름(`confirm_external_llm`) 변경 — 불변.
- Wiki 갱신/버전/병합 — 별도 spec.

## 3. 요구사항 (강화된 lint 계약)

`is_wiki_artifact_type`인 아티팩트에 대해 `lint_artifact_content`에 다음을 추가한다. 기존 규칙
(source_missing, missing_title, missing_section, unknown_citation_marker, source_location_missing)은 유지.

| # | 규칙 | code | severity | 판정 |
|---|------|------|----------|------|
| R1 | 필수 9개 섹션의 **본문이 비어 있지 않아야** 함(공백/구분선만이면 실패). `_section_text` 재사용. | `empty_section` | error | 본문 없는 섹션마다 1건 |
| R2 | `## 확정에 가까운 사실`의 **각 실질 라인(불릿/문장)에 [ev_...] 인용**이 있어야 함. 인용 없는 사실 라인마다 실패. | `uncited_fact` | error | 라인별 |
| R3 | `## 출처 지도`는 **마크다운 표**이고 헤더에 근거ID·출처·날짜·위치·중요도(왜) 열이 있어야 함. | `source_map_not_table` | error | 1건 |
| R4 | `SUBJECTIVE_CLAIM_RE` 어휘 확장(예: 훌륭|탁월|명백|확실히|분명|대체로|아마|~인 듯|권장|추천 등) + 적용 대상에 `## 한 줄 결론`·`## 확정에 가까운 사실` 포함. | `subjective_claim_in_confirmed_facts`(기존 code 재사용) | error | 섹션별 |

- **R2 정의**: "실질 라인" = 공백/헤더/표 구분선 제외한, 마침표·명사구를 포함한 서술 라인. 표 안(출처 지도)의
  근거ID는 R2 대상에서 제외(표는 R3가 검증). 구현은 보수적으로 — 애매하면 실패시키지 않아 false-fail을 피한다.
- `status`는 기존대로 error가 하나라도 있으면 `failed` → `status_for_lint`가 `needs_review`.

## 4. 프롬프트 정렬 (false-fail 방지)

강화된 lint를 통과하도록 생성 프롬프트를 **명시적으로** 맞춘다. 규칙만 강화하고 프롬프트를 안 맞추면
정상 산출물도 needs_review로 떨어져 UX가 나빠진다.

- **수정**: `evidence.py:_artifact_prompt_guidance`(262–274) — 다음을 추가:
  - "각 섹션은 최소 1개 이상의 내용 라인을 채우십시오(빈 섹션 금지)." (R1)
  - "## 확정에 가까운 사실의 모든 항목은 문장 끝에 [ev_...]를 붙이십시오. 근거가 없으면 ## 검증 필요로 옮기십시오." (R2)
  - "## 출처 지도는 | 근거ID | 출처 | 날짜 | 위치 | 왜 중요한지 | 헤더의 표로 작성하십시오." (R3)
  - 기존 평가성 표현 분리 지침 유지/보강. (R4)
- 재사용: `_evidence_marker_list`(evidence.py:334)로 사용 가능한 [ev_...] 목록을 프롬프트에 이미 제공 중인지
  확인하고, 없으면 사실 주장 인용을 돕도록 포함.

## 5. 조건 경로(선택, 2순위)

`wiki_condition_runner._build_wiki_prompt`는 "후보 초안"이라 9섹션 미적용이 의도된 설계다. 이번 범위에서는
**기본 유지**. 단, 조건 경로 산출물도 evidence-set으로 승격될 때 동일 lint를 타므로, 승격 지점에서 강화된
lint가 정상 작동하는지 회귀 테스트만 추가한다(신규 프롬프트 정렬은 하지 않음).

## 6. 변경 파일

- `python-backend/src/wiki_artifacts.py` — `lint_artifact_content`에 R1~R4 추가, `SUBJECTIVE_CLAIM_RE` 확장,
  필요 시 `_section_text`/표 파싱 헬퍼 추가. (동작 확장, 기존 규칙 불변)
- `python-backend/src/evidence.py` — `_artifact_prompt_guidance` 문구 강화(§4).
- `python-backend/tests/test_wiki_artifacts.py` — R1~R4 각각 pass/fail 케이스 + 기존 회귀. TDD로 규칙마다
  실패 테스트 먼저.
- (선택) `docs/testing/rag-search-quality-checklist.md` 또는 별도 wiki 체크리스트에 lint 규칙 표 반영.

## 7. 검증 (게이트)

```powershell
cd python-backend
./.venv/Scripts/python.exe -m unittest tests.test_wiki_artifacts    # R1~R4 신규 케이스 포함 전건 통과
./.venv/Scripts/python.exe -m unittest discover -s tests            # 전체 회귀 통과
cd ..; npm run build                                                # 프론트 타입/빌드 불변 확인
```
- **수용 기준**:
  - 빈 섹션/무인용 사실/비표 출처지도/평가성 사실을 각각 담은 아티팩트가 `failed`(needs_review)로 판정.
  - 9섹션을 채우고 사실마다 인용하고 출처지도를 표로 쓴 아티팩트는 `passed`(candidate).
  - 강화 후 `_artifact_prompt_guidance`로 실제 LLM 생성 시(수동 1회) 정상 산출물이 candidate로 통과(false-fail 없음).
- **회귀 불변**: 기존 `test_wiki_artifacts.py`/`test_wiki_conditions.py` 전건 유지, 외부 LLM 경고 흐름 불변.

## 8. 리스크

- **False-fail(과엄격)**: R2/R4가 너무 엄격하면 정상 산출물이 needs_review로 떨어진다 → R2는 "확정 사실"
  섹션에만 한정, 애매 라인은 통과(보수적), 프롬프트 정렬로 완화. 캘리브레이션은 실제 LLM 1회 생성으로 확인.
- **정규식 취약성**: 표/라인 판정은 정규식 기반이라 형식 변형에 취약 → 보수적 매칭 + 테스트로 고정.
- **테스트 안전망**: 백엔드는 unittest가 있어 프론트보다 안전. TDD로 규칙마다 먼저 실패 테스트 작성.

## 9. 규모

소규모~중간. lint 4규칙 + 프롬프트 문구 + 테스트. 신규 파일 없음(문서 제외). 새 유형/DB/마이그레이션 없음.
