import asyncio
import logging
import json
from typing import Dict, Any, AsyncGenerator, Optional, Callable
from src.harness.state import ExternalizedStateStore
from src.harness import renderer, parser, tools
from src.llm import inference

logger = logging.getLogger(__name__)

async def run_agent(
    query: str, 
    max_turns: int = 15, 
    on_turn_callback: Optional[Callable[[Dict[str, Any]], None]] = None
) -> Dict[str, Any]:
    """
    하네스 상태 외재화 에이전트 루프를 실행합니다.
    """
    state = ExternalizedStateStore(
        primary_query=query, 
        total_allowed_turns=max_turns, 
        remaining_turns=max_turns
    )
    
    turns_log = []
    final_answer = "답변을 생성하지 못했습니다."
    
    while state.remaining_turns > 0:
        turn_num = max_turns - state.remaining_turns + 1
        logger.info(f"에이전트 턴 {turn_num}/{max_turns} 시작...")
        
        # 1. 상태판 -> 마크다운 시스템 프롬프트 렌더링
        prompt = renderer.render(state)
        
        # 2. LLM 추론 호출
        raw_output = inference.chat_completion(
            messages=[{"role": "system", "content": prompt}],
            json_mode=True,
            max_tokens=1024,
            temperature=0.3
        )
        
        if "error" in raw_output:
            err_msg = f"추론 중 에러 발생: {raw_output['error']}"
            logger.error(err_msg)
            break
            
        # 3. Action / Thought JSON 파싱
        action_obj = parser.parse_action(raw_output)
        thought = action_obj.get("thought", "")
        action_name = action_obj.get("action", "search_knowledge")
        arguments = action_obj.get("arguments", {})
        
        # 4. 에이전트 도구 실행
        tool_result = await tools.execute_tool(action_obj, state)
        
        # 현재 상태 정보 덤프
        current_state_dump = {
            "curated_evidence": [
                {
                    "doc_id": ev.doc_id,
                    "title": ev.original_title,
                    "importance": ev.importance_tag,
                    "chunks": ev.compressed_chunks
                }
                for ev in state.curated_evidence_ledger.values()
            ],
            "verification": [
                {
                    "claim_id": cid,
                    "statement": vr.claim_statement,
                    "status": vr.status,
                    "evidence_ids": vr.assigned_evidence_ids
                }
                for cid, vr in state.verification_registry.items()
            ],
            "search_history": list(state.search_history)
        }
        
        # 턴 로그 작성
        turn_info = {
            "turn": turn_num,
            "thought": thought,
            "action": action_name,
            "arguments": arguments,
            "result": tool_result,
            "state": current_state_dump
        }
        
        turns_log.append(turn_info)
        
        # 콜백이 설정되어 있다면 실시간 알림 호출
        if on_turn_callback:
            try:
                if asyncio.iscoroutinefunction(on_turn_callback):
                    await on_turn_callback(turn_info)
                else:
                    on_turn_callback(turn_info)
            except Exception as e:
                logger.error(f"콜백 호출 에러: {e}")
                
        # 5. 상태 업데이트 (턴 수 차감)
        state.remaining_turns -= 1
        
        # 6. 종료 조건 확인
        if action_name == "finalize_answer":
            final_answer = arguments.get("answer", "")
            break
            
        # 과도한 로컬 CPU 점유 방지용 딜레이
        await asyncio.sleep(0.5)
        
    else:
        # 에이전트 예산 소진 시 강제 종료 및 누적 정보로 요약
        final_answer = f"제한된 {max_turns}턴 내에 답변 검증을 완료하지 못했습니다. 수집된 증거 기준 요약:\n"
        for ev in state.curated_evidence_ledger.values():
            final_answer += f"- {ev.original_title} ({ev.importance_tag}): " + " ".join(ev.compressed_chunks) + "\n"
            
    return {
        "status": "success",
        "query": query,
        "answer": final_answer,
        "turns_used": len(turns_log),
        "turns_log": turns_log
    }

async def run_agent_generator(query: str, max_turns: int = 15) -> AsyncGenerator[str, None]:
    """
    SSE 스트리밍 응답용 비동기 제너레이터입니다.
    """
    queue = asyncio.Queue()
    
    # 턴 완료 시마다 큐에 삽입하는 콜백
    def callback(turn_data):
        queue.put_nowait(turn_data)
        
    # 백그라운드 태스크로 에이전트 실행 시작
    task = asyncio.create_task(run_agent(query, max_turns, on_turn_callback=callback))
    
    while not task.done() or not queue.empty():
        try:
            # 턴 데이터 대기
            turn_data = await asyncio.wait_for(queue.get(), timeout=0.2)
            yield f"data: {json.dumps({'event': 'turn', 'data': turn_data}, ensure_ascii=False)}\n\n"
            queue.task_done()
        except asyncio.TimeoutError:
            continue
            
    # 최종 결과 스트리밍
    result = task.result()
    yield f"data: {json.dumps({'event': 'final', 'data': result}, ensure_ascii=False)}\n\n"
