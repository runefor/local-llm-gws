import unittest

from config import config


class ConfigIsolationTests(unittest.TestCase):
    def test_tests_use_separate_vector_db(self):
        self.assertIn("test-runtime", str(config.DATA_DIR))
        self.assertEqual(config.CHROMA_DB_PATH.name, "test-vectordb")

