# -*- mode: python ; coding: utf-8 -*-

import json
import os
from pathlib import Path
from urllib.parse import urlparse

from PyInstaller.utils.hooks import collect_all


backend_dir = Path(SPECPATH)
oauth_config_path = os.environ.get("GOOGLE_OAUTH_CLIENT_CONFIG_PATH", "").strip()


def validate_google_oauth_client_config(path):
    if not path:
        raise SystemExit("GOOGLE_OAUTH_CLIENT_CONFIG_PATH is required for release builds.")

    source = Path(path)
    if not source.is_file():
        raise SystemExit("GOOGLE_OAUTH_CLIENT_CONFIG_PATH does not point to a file.")

    try:
        data = json.loads(source.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit("GOOGLE_OAUTH_CLIENT_CONFIG_PATH must contain valid JSON.") from exc

    if not isinstance(data, dict):
        raise SystemExit("Google OAuth JSON root must be an object.")

    installed = data.get("installed")
    if not isinstance(installed, dict):
        raise SystemExit("Google OAuth JSON is missing field: installed")

    required = ("client_id", "client_secret", "auth_uri", "token_uri")
    missing = [
        field
        for field in required
        if not isinstance(installed.get(field), str) or not installed[field].strip()
    ]
    if missing:
        raise SystemExit(f"Google OAuth JSON is missing field: installed.{missing[0]}")

    redirects = installed.get("redirect_uris")
    if not isinstance(redirects, list) or not any(
        isinstance(uri, str)
        and (parsed := urlparse(uri)).scheme == "http"
        and parsed.hostname in {"localhost", "127.0.0.1"}
        for uri in redirects
    ):
        raise SystemExit("Google OAuth JSON is missing loopback redirect metadata.")

    return str(source.resolve())


oauth_config_path = validate_google_oauth_client_config(oauth_config_path)
chromadb_datas, chromadb_binaries, chromadb_hiddenimports = collect_all("chromadb")

a = Analysis(
    ["main.py"],
    pathex=[str(backend_dir)],
    binaries=chromadb_binaries,
    datas=chromadb_datas,
    hiddenimports=chromadb_hiddenimports
    + [
        "chromadb.utils.embedding_functions.onnx_mini_lm_l6_v2",
        "onnxruntime",
        "tokenizers",
        "rank_bm25",
        "datasketch",
        "google_auth_oauthlib.flow",
        "googleapiclient.discovery",
        "googleapiclient.errors",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "sentence_transformers",
        "torch",
        "transformers",
        "sklearn",
        "scipy",
        "tensorflow",
        "langchain",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)
a.datas += [("client_secrets.json", oauth_config_path, "DATA")]
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="gws-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
