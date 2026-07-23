use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

enum BackendProcess {
    Debug(Child),
    Sidecar(CommandChild),
}

impl BackendProcess {
    fn pid(&self) -> u32 {
        match self {
            Self::Debug(child) => child.id(),
            Self::Sidecar(child) => child.pid(),
        }
    }

    fn kill(self) {
        #[cfg(target_os = "windows")]
        {
            if kill_process_tree(self.pid()) {
                return;
            }
            eprintln!("Failed to kill backend process tree; falling back to direct child kill.");
        }

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

#[cfg(target_os = "windows")]
fn process_tree_kill_command(pid: u32) -> Command {
    let mut command = Command::new("taskkill");
    command
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(0x08000000);
    command
}

#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) -> bool {
    process_tree_kill_command(pid)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
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
                // 부모(이 앱)가 종료되면 백엔드가 스스로 종료하도록 PID를 넘긴다.
                cmd.arg("--parent-pid").arg(std::process::id().to_string());
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
                // 부모(이 앱)가 종료되면 백엔드가 스스로 종료하도록 PID를 넘긴다.
                let parent_pid = std::process::id().to_string();

                let sidecar_result = app.shell().sidecar("gws-backend").map(|cmd| {
                    let mut cmd = cmd.args(["--parent-pid", &parent_pid]);
                    if !resource_dir.is_empty() {
                        cmd = cmd.args(["--resource-dir", &resource_dir]);
                    }
                    cmd
                });

                // 사이드카 기동 실패(해석/spawn 실패, 또는 기동했지만 포트가 끝내 열리지 않음)를
                // 프론트가 한 이벤트로 받도록 통일한다. 리스너가 아직 붙기 전 타이밍을 감안해 몇 번 재발신한다.
                let emit_backend_startup_failed = |message: &'static str| {
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        for _ in 0..5 {
                            let _ = app_handle.emit(
                                "backend-startup-failed",
                                serde_json::json!({ "message": message }),
                            );
                            std::thread::sleep(std::time::Duration::from_secs(1));
                        }
                    });
                };

                match sidecar_result {
                    Ok(command) => match command.spawn() {
                        Ok((mut events, child)) => {
                            println!("Successfully started Python backend sidecar.");
                            let app_handle = app.handle().clone();
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

                            // 사이드카를 띄웠어도 실제로 포트가 열릴 때까지가 관건이다.
                            // 30초간 TCP 접속을 폴링하고, 끝내 열리지 않으면 프론트에 실패를 알린다.
                            let readiness_app_handle = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                let backend_addr: std::net::SocketAddr =
                                    "127.0.0.1:18731".parse().expect("valid backend address");
                                for _ in 0..30 {
                                    if std::net::TcpStream::connect_timeout(
                                        &backend_addr,
                                        std::time::Duration::from_millis(500),
                                    )
                                    .is_ok()
                                    {
                                        return;
                                    }
                                    std::thread::sleep(std::time::Duration::from_millis(500));
                                }

                                for _ in 0..5 {
                                    let _ = readiness_app_handle.emit(
                                        "backend-startup-failed",
                                        serde_json::json!({
                                            "message": "백엔드 서버가 응답하지 않습니다. 앱을 다시 시작해 주세요."
                                        }),
                                    );
                                    std::thread::sleep(std::time::Duration::from_secs(1));
                                }
                            });
                        }
                        Err(e) => {
                            eprintln!("Failed to start Python backend sidecar: {}", e);
                            emit_backend_startup_failed("백엔드 프로세스를 시작하지 못했습니다.");
                        }
                    },
                    Err(e) => {
                        eprintln!("Failed to resolve Python backend sidecar: {}", e);
                        emit_backend_startup_failed("백엔드 실행 파일을 찾을 수 없습니다.");
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

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::process_tree_kill_command;

    #[test]
    fn process_tree_kill_includes_descendants() {
        let command = process_tree_kill_command(42);
        let args = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(args, ["/PID", "42", "/T", "/F"]);
    }
}
