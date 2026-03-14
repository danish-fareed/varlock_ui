mod commands;
mod state;
mod varlock;

use commands::filesystem::WatcherState;
use state::app_state::AppState;
use state::process_state::ProcessState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .manage(ProcessState::new())
        .manage(WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            commands::varlock::check_varlock,
            commands::varlock::install_varlock,
            commands::varlock::varlock_load,
            commands::varlock::varlock_init,
            commands::varlock::varlock_scan,
            commands::process::varlock_run,
            commands::process::process_kill,
            commands::project::project_list,
            commands::project::project_add,
            commands::project::project_remove,
            commands::project::pick_directory,
            commands::filesystem::read_env_file,
            commands::filesystem::write_env_file,
            commands::filesystem::list_env_files,
            commands::filesystem::watch_project,
            commands::filesystem::unwatch_project,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.state::<ProcessState>().kill_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Varlock UI");
}
