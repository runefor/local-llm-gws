use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct BackendState {
    child: Mutex<Option<Child>>,
}

fn resolve_backend_dir() -> Option<PathBuf> {
    let current_dir = std::env::current_dir().ok()?;
    [
        current_dir.join("python-backend"),
        current_dir.join("../python-backend"),
    ]
    .into_iter()
    .find(|path| path.join("main.py").exists())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_state = BackendState {
        child: Mutex::new(None),
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(backend_state)
        .setup(|app| {
            let is_debug = cfg!(debug_assertions);
            
            if is_debug {
                // 개발 단계: 가상환경 파이썬 사용
                let Some(work_dir) = resolve_backend_dir() else {
                    eprintln!("Failed to find python-backend directory from current working directory.");
                    return Ok(());
                };
                let python_exe = if cfg!(target_os = "windows") {
                    work_dir.join(".venv/Scripts/python.exe")
                } else {
                    work_dir.join(".venv/bin/python")
                };
                let script_path = work_dir.join("main.py");

                let mut cmd = Command::new(&python_exe);
                cmd.arg(&script_path);
                cmd.current_dir(&work_dir);

                // Windows에서 새 콘솔창이 뜨지 않도록 처리
                #[cfg(target_os = "windows")]
                {
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }

                match cmd.spawn() {
                    Ok(child) => {
                        println!("Successfully started Python backend.");
                        let state = app.state::<BackendState>();
                        *state.child.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        eprintln!("Failed to start Python backend: {}", e);
                    }
                }
            } else {
                // 배포 단계: 추후 PyInstaller 등으로 패키징된 Sidecar 바이너리 사용 예정
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { .. } => {
            let state = app_handle.state::<BackendState>();
            let mut lock = state.child.lock().unwrap();
            if let Some(mut child) = lock.take() {
                println!("Killing Python backend process...");
                let _ = child.kill();
            }
        }
        _ => {}
    });
}
