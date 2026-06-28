use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

enum BackendProcess {
    Debug(Child),
    Sidecar(CommandChild),
}

impl BackendProcess {
    fn kill(self) {
        match self {
            Self::Debug(mut child) => {
                let _ = child.kill();
            }
            Self::Sidecar(child) => {
                let _ = child.kill();
            }
        }
    }
}

struct BackendState {
    process: Mutex<Option<BackendProcess>>,
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

fn store_backend_process(app: &tauri::App, backend_process: BackendProcess) {
    let state = app.state::<BackendState>();
    match state.process.lock() {
        Ok(mut process) => {
            *process = Some(backend_process);
        }
        Err(_) => {
            eprintln!("Failed to store Python backend process handle.");
        }
    };
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_state = BackendState {
        process: Mutex::new(None),
    };

    let app_result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(backend_state)
        .setup(|app| {
            let is_debug = cfg!(debug_assertions);

            if is_debug {
                // 개발 단계: 가상환경 파이썬 사용
                let Some(work_dir) = resolve_backend_dir() else {
                    eprintln!(
                        "Failed to find python-backend directory from current working directory."
                    );
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
                cmd.stdin(std::process::Stdio::piped());

                // Windows에서 새 콘솔창이 뜨지 않도록 처리
                #[cfg(target_os = "windows")]
                {
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }

                match cmd.spawn() {
                    Ok(child) => {
                        println!("Successfully started Python backend.");
                        store_backend_process(app, BackendProcess::Debug(child));
                    }
                    Err(e) => {
                        eprintln!("Failed to start Python backend: {}", e);
                    }
                }
            } else {
                let resource_dir = app.path().resource_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();

                let sidecar_result = if resource_dir.is_empty() {
                    app.shell().sidecar("gws-backend")
                } else {
                    app.shell().sidecar("gws-backend")
                        .map(|cmd| cmd.args(["--resource-dir", &resource_dir]))
                };

                match sidecar_result {
                    Ok(command) => match command.spawn() {
                        Ok((mut events, child)) => {
                            println!("Successfully started Python backend sidecar.");
                            tauri::async_runtime::spawn(async move {
                                while let Some(event) = events.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            println!(
                                                "[gws-backend] {}",
                                                String::from_utf8_lossy(&line)
                                            );
                                        }
                                        CommandEvent::Stderr(line) => {
                                            eprintln!(
                                                "[gws-backend] {}",
                                                String::from_utf8_lossy(&line)
                                            );
                                        }
                                        _ => {}
                                    }
                                }
                            });

                            store_backend_process(app, BackendProcess::Sidecar(child));
                        }
                        Err(e) => {
                            eprintln!("Failed to start Python backend sidecar: {}", e);
                        }
                    },
                    Err(e) => {
                        eprintln!("Failed to resolve Python backend sidecar: {}", e);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .build(tauri::generate_context!());

    let app = match app_result {
        Ok(app) => app,
        Err(error) => {
            eprintln!("error while building tauri application: {}", error);
            return;
        }
    };

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { .. } => {
            let state = app_handle.state::<BackendState>();
            match state.process.lock() {
                Ok(mut lock) => {
                    if let Some(process) = lock.take() {
                        println!("Killing Python backend process...");
                        process.kill();
                    }
                }
                Err(_) => {
                    eprintln!("Failed to acquire backend process handle for shutdown.");
                }
            };
        }
        _ => {}
    });
}
