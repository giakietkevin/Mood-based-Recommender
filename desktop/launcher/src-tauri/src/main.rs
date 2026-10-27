// KietStation desktop launcher.
// Starts the bundled Python backend (python\python.exe -m uvicorn main:app, from the server\ folder next to this exe)
// on 127.0.0.1, shows a splash screen while it boots, then points the window at it. The backend dies with the window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, Url, WebviewWindow};

// The port stays the same between launches: localStorage, the login token and the service worker are keyed by
// origin, so a new port each time would sign the user out and reset their settings. The fallbacks only kick in
// when another program already holds the first one.
const PORTS: std::ops::RangeInclusive<u16> = 17860..=17869;
// TensorFlow makes the first start slow, especially from a cold disk
const START_TIMEOUT: Duration = Duration::from_secs(300);

struct Server(Mutex<Option<Child>>);

fn app_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn pick_port() -> Option<u16> {
    PORTS.clone().find(|p| TcpListener::bind(("127.0.0.1", *p)).is_ok())
}

fn is_up(port: u16) -> bool {
    let addr = ([127, 0, 0, 1], port).into();
    let Ok(mut s) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    if s.write_all(b"GET /manifest.json HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").is_err() {
        return false;
    }
    let mut buf = [0u8; 12];
    matches!(s.read_exact(&mut buf), Ok(()) if &buf[9..12] == b"200")
}

fn path_with(bin: PathBuf) -> std::ffi::OsString {
    let mut paths = vec![bin];
    if let Some(p) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&p));
    }
    std::env::join_paths(paths).unwrap_or_default()
}

fn spawn_server(dir: &Path, port: u16) -> std::io::Result<Child> {
    let log = File::create(dir.join("server.log"))?;
    let mut cmd = Command::new(dir.join("python").join("python.exe"));
    cmd.args(["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", &port.to_string()])
        .current_dir(dir.join("server"))
        // with no console Python writes in the ANSI code page and crashes on the first emoji it prints
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("DEEPFACE_HOME", dir.join("deepface"))
        .env("PATH", path_with(dir.join("bin")))
        .stdout(log.try_clone()?)
        .stderr(log);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn()?;
    #[cfg(windows)]
    kill_with_launcher(&child);
    Ok(child)
}

// Puts the backend (and the ffmpeg processes it starts) in a job that Windows kills when this process ends,
// so a crash or a Task Manager kill of the launcher does not leave Python running in the background.
#[cfg(windows)]
fn kill_with_launcher(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::*;
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        AssignProcessToJobObject(job, child.as_raw_handle() as _);
        // the job handle is left open on purpose: it closes when the launcher exits
    }
}

fn show_error(window: &WebviewWindow, msg: &str) {
    // give the splash page time to load when the failure is immediate
    thread::sleep(Duration::from_secs(1));
    let log = app_dir().join("server.log").display().to_string();
    let js = format!(
        "window.showError({}, {})",
        serde_json::to_string(msg).unwrap_or_default(),
        serde_json::to_string(&log).unwrap_or_default()
    );
    let _ = window.eval(&js);
}

fn start(window: WebviewWindow) {
    let dir = app_dir();
    let Some(port) = pick_port() else {
        return show_error(&window, "Không tìm được cổng trống (17860–17869) để chạy KietStation.");
    };
    let child = match spawn_server(&dir, port) {
        Ok(c) => c,
        Err(e) => return show_error(&window, &format!("Không chạy được backend: {e}")),
    };
    let app = window.app_handle().clone();
    let server = app.state::<Server>();
    server.0.lock().unwrap().replace(child);

    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        if is_up(port) {
            let url = Url::parse(&format!("http://127.0.0.1:{port}/")).expect("valid url");
            let _ = window.navigate(url);
            return;
        }
        let exited = server
            .0
            .lock()
            .unwrap()
            .as_mut()
            .map_or(true, |c| matches!(c.try_wait(), Ok(Some(_))));
        if exited {
            return show_error(&window, "Backend đã dừng khi đang khởi động.");
        }
        if Instant::now() > deadline {
            return show_error(&window, "Backend khởi động quá lâu (hơn 5 phút).");
        }
        thread::sleep(Duration::from_millis(500));
    }
}

fn main() {
    let app = tauri::Builder::default()
        // a second launch would start a second backend on the same data files; focus the open window instead
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .manage(Server(Mutex::new(None)))
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");
            thread::spawn(move || start(window));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start KietStation");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(mut child) = app.state::<Server>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
