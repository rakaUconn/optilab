//! OptiLab shell: starts the Python optics engine (FastAPI sidecar) on a free localhost port with a
//! random token, hands both to the UI via `engine_info`, and stops it on exit.
//!
//! * debug builds (`npm run tauri dev`): `python -m optilab.server` from the repo's `.venv`
//!   (override with `OPTILAB_PYTHON`);
//! * release builds: the PyInstaller binary bundled as the `optilab-engine` sidecar.

use std::net::TcpListener;
use std::process::Child;
use std::sync::Mutex;

use rand::{distributions::Alphanumeric, Rng};
use serde::Serialize;
use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::CommandChild;

#[allow(dead_code)] // `Std` is used by debug builds, `Sidecar` by release builds
enum Proc {
    Std(Child),
    Sidecar(CommandChild),
}

struct Engine {
    port: u16,
    token: String,
    proc: Mutex<Option<Proc>>,
}

#[derive(Serialize)]
struct EngineInfo {
    port: u16,
    token: String,
}

#[tauri::command]
fn engine_info(engine: State<'_, Engine>) -> EngineInfo {
    EngineInfo { port: engine.port, token: engine.token.clone() }
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").expect("no free port").local_addr().unwrap().port()
}

#[cfg(debug_assertions)]
fn spawn_engine(_app: &tauri::AppHandle, port: u16, token: &str) -> Result<Proc, String> {
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let engine_dir = root.join("engine");
    let venv = if cfg!(windows) { root.join(".venv/Scripts/python.exe") } else { root.join(".venv/bin/python") };
    let python = std::env::var("OPTILAB_PYTHON").ok().map(PathBuf::from).unwrap_or_else(|| {
        if venv.exists() { venv } else if cfg!(windows) { "python".into() } else { "python3".into() }
    });
    Command::new(&python)
        .args(["-m", "optilab.server", "--port", &port.to_string(), "--token", token])
        .current_dir(&engine_dir)
        .env("PYTHONPATH", &engine_dir)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map(Proc::Std)
        .map_err(|e| format!("cannot start engine with {}: {e} (see README: create .venv and `pip install -e engine`)", python.display()))
}

#[cfg(not(debug_assertions))]
fn spawn_engine(app: &tauri::AppHandle, port: u16, token: &str) -> Result<Proc, String> {
    use tauri_plugin_shell::ShellExt;
    let (_rx, child) = app
        .shell()
        .sidecar("optilab-engine")
        .map_err(|e| e.to_string())?
        .args(["--port", &port.to_string(), "--token", token])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(Proc::Sidecar(child))
}

fn stop(engine: &Engine) {
    if let Some(p) = engine.proc.lock().unwrap().take() {
        match p {
            Proc::Std(mut c) => {
                let _ = c.kill();
                let _ = c.wait();
            }
            Proc::Sidecar(c) => {
                let _ = c.kill();
            }
        }
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![engine_info])
        .setup(|app| {
            let port = free_port();
            let token: String = rand::thread_rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
            let proc = spawn_engine(app.handle(), port, &token).map_err(|e| {
                eprintln!("optilab: {e}");
                e
            });
            app.manage(Engine { port, token, proc: Mutex::new(proc.ok()) });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building OptiLab");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(engine) = handle.try_state::<Engine>() {
                stop(&engine);
            }
        }
    });
}
