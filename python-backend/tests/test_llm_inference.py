import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from unittest.mock import Mock, patch

from src.llm.inference import _message_text, chat_completion


class LlmInferenceTests(unittest.TestCase):
    def test_message_text_keeps_ollama_reasoning_out_of_content(self):
        content, thought = _message_text({
            "role": "assistant",
            "content": "",
            "reasoning": "LLM Wiki 초안을 작성합니다.",
        })

        self.assertEqual(content, "")
        self.assertEqual(thought, "LLM Wiki 초안을 작성합니다.")

    def test_message_text_keeps_content_before_reasoning(self):
        content, thought = _message_text({
            "role": "assistant",
            "content": "최종 답변",
            "reasoning": "내부 추론",
        })

        self.assertEqual(content, "최종 답변")
        self.assertEqual(thought, "내부 추론")

    def test_ollama_request_disables_reasoning_for_final_content(self):
        captured = {}

        def fake_post(url, *, json, headers):
            captured["payload"] = json
            return Mock(
                raise_for_status=Mock(),
                json=Mock(return_value={
                    "choices": [{
                        "message": {"content": "최종 답변"},
                        "finish_reason": "stop",
                    }],
                    "usage": {},
                }),
            )

        with patch("src.llm.inference.config.LLM_SERVE_MODE", "ollama"), \
             patch("src.llm.inference.config.LLM_MODEL", "gemma4:12b"), \
             patch("httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.side_effect = fake_post

            result = chat_completion(messages=[{"role": "user", "content": "ping"}])

        self.assertEqual(result["content"], "최종 답변")
        self.assertEqual(captured["payload"]["reasoning"], {"effort": "none"})


if __name__ == "__main__":
    unittest.main()
