use std::{env, fs, path::Path};

fn main() {
    // `bundle.externalBin` must exist at compile time. In debug builds the engine is launched from
    // Python directly, so a placeholder is enough; release builds need the real PyInstaller binary
    // (see engine/scripts/build_sidecar.py).
    if env::var("PROFILE").map(|p| p == "debug").unwrap_or(false) {
        let target = env::var("TARGET").unwrap();
        let ext = if target.contains("windows") { ".exe" } else { "" };
        let p = Path::new("binaries").join(format!("optilab-engine-{target}{ext}"));
        if !p.exists() {
            fs::create_dir_all("binaries").unwrap();
            fs::write(&p, b"placeholder: debug builds run `python -m optilab.server`\n").unwrap();
        }
    }
    tauri_build::build()
}
