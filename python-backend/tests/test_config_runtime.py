import json
import os
import subprocess
import sys
import unittest


class RuntimeConfigTests(unittest.TestCase):
    def test_app_runtime_uses_real_data_dir_even_when_dependencies_import_unittest(self):
        env = os.environ.copy()
        env.pop("LOCAL_LLM_GWS_DATA_DIR", None)
        env.pop("LOCAL_LLM_GWS_CHROMA_DB_PATH", None)

        output = subprocess.check_output(
            [
                sys.executable,
                "-c",
                (
                    "import sys, json; "
                    "import googleapiclient.discovery, fastapi, uvicorn; "
                    "import main; "
                    "from config import config; "
                    "print(json.dumps({'data_dir': str(config.DATA_DIR), 'token_path': str(config.TOKEN_PATH)}))"
                ),
            ],
            cwd=os.path.dirname(os.path.dirname(__file__)),
            env=env,
            text=True,
        )
        data = json.loads(output)

        self.assertNotIn("test-runtime", data["data_dir"])
        self.assertTrue(data["token_path"].endswith(os.path.join("data", "token.json")))
