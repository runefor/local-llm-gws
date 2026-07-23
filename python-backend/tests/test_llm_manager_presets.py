import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.llm import manager


class LlmManagerPresetTests(unittest.TestCase):
    def test_lightweight_preset_uses_public_qwen_download(self):
        preset = next(
            model
            for model in manager.get_preset_models()
            if model["id"] == "qwen2.5-0.5b"
        )

        self.assertEqual(preset["repo_id"], "Qwen/Qwen2.5-0.5B-Instruct-GGUF")
        self.assertEqual(
            preset["filename"],
            "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        )
        self.assertEqual(preset["profile"], "cpu_only")

    def test_cpu_only_profiles_recommend_public_lightweight_preset(self):
        profiles = [
            manager.HardwareProfile(ram_gb=4),
            manager.HardwareProfile(ram_gb=16, profile_tier="cpu_only"),
        ]

        for profile in profiles:
            with self.subTest(profile=profile):
                with patch.object(
                    manager,
                    "get_hardware_profile",
                    return_value=profile,
                ):
                    self.assertEqual(
                        manager.get_recommended_model_id(),
                        "qwen2.5-0.5b",
                    )


if __name__ == "__main__":
    unittest.main()
