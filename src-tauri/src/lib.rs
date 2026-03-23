mod cli_entry;
mod commands;
mod db;
mod discovery;
mod launcher;
mod state;
mod varlock;
mod vault;

use commands::filesystem::WatcherState;
use rusqlite::Connection;
use state::app_state::AppState;
use state::process_registry::ProcessRegistry;
use state::process_state::ProcessState;
use state::vault_state::VaultState;
use tauri::Manager;
use vault::vault_db::VaultDb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Some(code) = cli_entry::maybe_handle_cli() {
        std::process::exit(code);
    }

    // Apply non-vault local DB migrations for project intelligence layer.
    if let Err(e) = apply_local_project_intelligence_migration() {
        eprintln!(
            "Warning: failed to apply local project intelligence migration: {}",
            e
        );
    }

    // Open (or create) the vault database
    let vault_db = VaultDb::open().expect("Failed to open vault database");
    let vault_state = VaultState::new(vault_db);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .manage(ProcessState::new())
        .manage(ProcessRegistry::new())
        .manage(WatcherState::new())
        .manage(vault_state)
        .invoke_handler(tauri::generate_handler![
            // Existing commands
            commands::varlock::check_varlock,
            commands::varlock::install_varlock,
            commands::varlock::varlock_load,
            commands::varlock::varlock_load_merged,
            commands::varlock::varlock_init,
            commands::varlock::varlock_scan,
            commands::varlock::migration_plan,
            commands::varlock::migration_apply,
            commands::varlock::get_migration_preview,
            commands::varlock::migrate_project_to_varlock,
            commands::process::varlock_run,
            commands::process::process_kill,
            commands::process::stop_command,
            commands::process::direct_run,
            commands::python_env::get_python_env_state,
            commands::python_env::list_python_interpreters_cmd,
            commands::python_env::set_preferred_python_interpreter_cmd,
            commands::python_env::warmup_python_env,
            commands::python_env::rebuild_python_env,
            commands::project::project_list,
            commands::project::project_add,
            commands::project::project_clone_github,
            commands::project::project_remove,
            commands::project::pick_directory,
            commands::filesystem::read_env_file,
            commands::filesystem::write_env_file,
            commands::filesystem::list_env_files,
            commands::filesystem::list_editable_project_files,
            commands::filesystem::read_project_file,
            commands::filesystem::write_project_file,
            commands::filesystem::watch_project,
            commands::filesystem::unwatch_project,
            // Vault commands
            commands::vault::vault_status,
            commands::vault::vault_setup,
            commands::vault::vault_unlock,
            commands::vault::vault_auto_unlock,
            commands::vault::vault_lock,
            commands::vault::vault_is_unlocked,
            commands::vault::vault_import_env,
            commands::vault::vault_get_variables,
            commands::vault::vault_get_all_variables,
            commands::vault::vault_share_variable,
            commands::vault::vault_unshare_variable,
            commands::vault::vault_get_shared_targets,
            commands::vault::vault_get_variables_shared_with,
            commands::vault::vault_set_variable,
            commands::vault::vault_delete_variable,
            commands::vault::vault_generate_secret,
            commands::vault::vault_resolve_env,
            commands::vault::vault_write_ref_env,
            commands::vault::vault_forget_device,
            // Discovery commands
            commands::discovery::scan_project,
            commands::discovery::save_custom_command,
            // Terminal commands
            commands::terminal_attach::open_terminal_at,
            commands::terminal_attach::attach_to_process,
            commands::terminal_attach::run_in_terminal,
            commands::terminal_attach::open_in_editor,
            commands::terminal_attach::open_in_explorer,
            // AI Context commands
            commands::ai_context::ai_context_json,
            commands::ai_context::ai_context_markdown,
            commands::ai_context::ai_context_data,
        ])
        .setup(|app| {
            // Start background idle timeout checker
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30));
                if let Some(vault) = handle.try_state::<VaultState>() {
                    vault.check_idle_timeout();
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    // Kill running processes
                    window.state::<ProcessState>().kill_all();
                    // Lock the vault (zeroize key)
                    window.state::<VaultState>().lock();
                }
                tauri::WindowEvent::Focused(false) => {
                    // Window lost focus — could start the idle timer
                    // (the background thread handles the actual timeout)
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Varlock UI");
}

fn apply_local_project_intelligence_migration() -> Result<(), String> {
    let db_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("varlock-ui")
        .join("app.db");
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    db::project_intelligence::apply_project_intelligence_migration(&conn).map_err(|e| e.to_string())
}
