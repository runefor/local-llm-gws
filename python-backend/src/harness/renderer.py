from src.harness.state import ExternalizedStateStore

def render(state: ExternalizedStateStore) -> str:
    """ExternalizedStateStore 객체의 상태를 시스템 프롬프트용 마크다운 텍스트로 변환합니다."""
    
    status_md = []
    status_md.append(f"# 에이전트 하네스 상태판 (Harness State)")
    status_md.append(f"- **기본 질문 (Primary Query):** {state.primary_query}")
    status_md.append(f"- **남은 허용 턴 (Remaining Turns):** {state.remaining_turns} / {state.total_allowed_turns}")
    
    # 1. 큐레이션된 증거 대장
    status_md.append(f"\n## 큐레이션된 증거 대장 (Curated Evidence Ledger)")
    if not state.curated_evidence_ledger:
        status_md.append("*(비어 있음)*")
    else:
        status_md.append("| 문서 ID | 문서 제목 | 중요도 | 압축된 핵심 내용 (Chunks) |")
        status_md.append("| --- | --- | --- | --- |")
        for doc_id, ev in state.curated_evidence_ledger.items():
            chunks_summary = " ".join([f"- {c}" for c in ev.compressed_chunks]) if ev.compressed_chunks else "*(압축 진행 중/없음)*"
            status_md.append(f"| `{doc_id}` | {ev.original_title} | `{ev.importance_tag}` | {chunks_summary} |")
            
    # 2. 검증 등록부
    status_md.append(f"\n## 가설 및 검증 대장 (Verification Registry)")
    if not state.verification_registry:
        status_md.append("*(비어 있음)*")
    else:
        status_md.append("| 주장 ID | 검증하려는 주장 | 상태 | 할당된 증거 ID |")
        status_md.append("| --- | --- | --- | --- |")
        for claim_id, vr in state.verification_registry.items():
            ev_ids = ", ".join([f"`{eid}`" for eid in vr.assigned_evidence_ids]) if vr.assigned_evidence_ids else "없음"
            status_md.append(f"| `{claim_id}` | {vr.claim_statement} | `{vr.status.upper()}` | {ev_ids} |")
            
    # 3. 검색 기록
    status_md.append(f"\n## 검색 기록 (Search History)")
    if not state.search_history:
        status_md.append("*(검색 기록 없음)*")
    else:
        for idx, hist in enumerate(state.search_history):
            status_md.append(f"{idx+1}. {hist}")
            
    # 4. 예산 인식 가이드 지시사항
    status_md.append(f"\n## 긴급 지시사항 (Directives)")
    if state.remaining_turns <= 2:
        status_md.append(
            "> [!CAUTION]\n"
            "> **남은 턴이 얼마 남지 않았습니다!** 즉시 추가 검색 및 검증 시도를 중단하고, \n"
            "> 현재까지 수집된 큐레이션된 증거(`curated_evidence_ledger`)와 검증 상태(`verification_registry`)를 기반으로\n"
            "> `finalize_answer` 액션을 실행하여 최선의 최종 답변을 제시하십시오."
        )
    elif state.remaining_turns <= 5:
        status_md.append(
            "> [!WARNING]\n"
            "> **남은 턴이 부족합니다.** 새로운 주장을 추가하거나 큰 탐색을 하기보다는, \n"
            "> 기존에 수집된 정보를 정리 및 검증하고 가급적 빠르게 결론(`finalize_answer`) 단계로 넘어가십시오."
        )
    else:
        status_md.append(
            "> [!NOTE]\n"
            "> 질문에 대한 답변을 뒷받침할 확실한 증거를 수집하기 위해 `search_knowledge`로 관련 문서를 탐색하고, \n"
            "> 추출된 중요 주장은 `verify_claim`으로 검증하십시오. 필요한 문서는 `curate_evidence`를 통해 큐레이션하십시오."
        )
        
    # 5. JSON 응답 포맷 안내 및 행동 규칙
    status_md.append(
        "\n## 에이전트 지시 및 행동 규칙 (Action Rules)\n"
        "당신은 위 상태판 정보를 매 턴 업데이트 받아 다음 행동을 결정하는 '상태 외재화 에이전트'입니다.\n"
        "이전 대화 맥락이 생략되어 있어도 이 '상태판' 정보만이 당신의 현재 기억 장치입니다.\n"
        "매 단계마다 반드시 아래 JSON 구조로만 답변하십시오. (마크다운 코드 블록 제외, 순수 JSON만 출력)\n\n"
        "```json\n"
        "{\n"
        '  "thought": "어떤 증거를 찾아야 할지, 어떤 가설을 검증할지 등에 대한 에이전트의 내부 생각",\n'
        '  "action": "실행할 도구 이름 (search_knowledge | verify_claim | curate_evidence | finalize_answer)",\n'
        '  "arguments": {\n'
        '    // 실행할 도구에 필요한 매개변수들\n'
        "  }\n"
        "}\n"
        "```\n"
        "\n"
        "## 도구 정의 (Tools API):\n"
        "1. `search_knowledge` (지식 검색)\n"
        "   - arguments: `{\"query\": \"검색할 쿼리\"}`\n"
        "   - 설명: ChromaDB에서 Google Workspace 연동 데이터를 기반으로 키워드 및 시맨틱 검색을 수행합니다.\n"
        "\n"
        "2. `verify_claim` (주장 등록 및 검증)\n"
        "   - arguments: `{\"claim_id\": \"신규 또는 기존 주장 ID (예: claim_1)\", \"claim_statement\": \"검증할 주장 텍스트\", \"status\": \"verified\" | \"contradicted\" | \"unverified\", \"assigned_evidence_ids\": [\"증거가 될 문서 ID (예: gmail_xyz_0, drive_abc_0)\"]}`\n"
        "   - 설명: 특정 가설이나 사실 여부를 수집된 증거 문서(evidence)와 대조하여 검증 상태를 업데이트합니다.\n"
        "\n"
        "3. `curate_evidence` (증거 큐레이션 및 승격)\n"
        "   - arguments: `{\"doc_id\": \"문서 ID\", \"title\": \"문서 제목\", \"importance_tag\": \"very_high\" | \"high\" | \"fair\" | \"low\"}`\n"
        "   - 설명: 검색된 후보 문서 풀(`candidate_pool`) 중 주요 답변 근거가 되는 유의미한 문서를 큐레이션 대장(`curated_evidence_ledger`)으로 승격합니다.\n"
        "\n"
        "4. `finalize_answer` (최종 답변 완료)\n"
        "   - arguments: `{\"answer\": \"최종 답변 본문 (한국어)\"}`\n"
        "   - 설명: 검색과 검증을 끝마치고 사용자 질문에 대한 최종 종합 답변을 반환하며 루프를 종료합니다.\n"
    )
    
    return "\n".join(status_md)
