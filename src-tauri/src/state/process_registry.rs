use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// A single entry in the process registry — tracks one running/crashed/stopped command.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRegistryEntry {
    pub command_id: String,
    pub process_uuid: String,
    pub pid: u32,
    pub raw_cmd: String,
    pub cwd: String,
    pub env_name: String,
    pub started_at: DateTime<Utc>,
    pub status: ProcessRegistryStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ProcessRegistryStatus {
    Running,
    Stopped,
    Crashed,
}

/// Persisted data structure for the registry file.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct RegistryData {
    processes: Vec<ProcessRegistryEntry>,
}

/// Process registry — persists running process state to disk so we can
/// restore after app restart and detect crashed processes.
pub struct ProcessRegistry {
    inner: Mutex<RegistryData>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        let data = Self::load_from_disk().unwrap_or_default();
        let registry = Self {
            inner: Mutex::new(data),
        };
        // On startup, check liveness of all "running" entries
        registry.check_all_pids();
        registry
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, RegistryData> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn registry_file_path() -> PathBuf {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("varlock-ui");
        if let Err(e) = fs::create_dir_all(&data_dir) {
            eprintln!(
                "Warning: Failed to create data directory {:?}: {}",
                data_dir, e
            );
        }
        data_dir.join("process_registry.json")
    }

    fn load_from_disk() -> Option<RegistryData> {
        let path = Self::registry_file_path();
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn persist(&self) {
        let data = self.lock();
        let path = Self::registry_file_path();
        match serde_json::to_string_pretty(&*data) {
            Ok(json) => {
                if let Err(e) = fs::write(&path, json) {
                    eprintln!(
                        "Error: Failed to persist process registry to {:?}: {}",
                        path, e
                    );
                }
            }
            Err(e) => {
                eprintln!("Error: Failed to serialize process registry: {}", e);
            }
        }
    }

    /// Register a newly launched process.
    pub fn register(
        &self,
        command_id: String,
        process_uuid: String,
        pid: u32,
        raw_cmd: String,
        cwd: String,
        env_name: String,
    ) {
        let entry = ProcessRegistryEntry {
            command_id,
            process_uuid,
            pid,
            raw_cmd,
            cwd,
            env_name,
            started_at: Utc::now(),
            status: ProcessRegistryStatus::Running,
        };
        {
            let mut data = self.lock();
            data.processes.push(entry);
        }
        self.persist();
    }

    /// Mark a process as stopped (clean exit).
    pub fn mark_stopped(&self, process_uuid: &str) {
        {
            let mut data = self.lock();
            if let Some(entry) = data
                .processes
                .iter_mut()
                .find(|e| e.process_uuid == process_uuid)
            {
                entry.status = ProcessRegistryStatus::Stopped;
            }
        }
        self.persist();
        self.cleanup_old_entries();
    }

    /// Mark a process as crashed.
    pub fn mark_crashed(&self, process_uuid: &str) {
        {
            let mut data = self.lock();
            if let Some(entry) = data
                .processes
                .iter_mut()
                .find(|e| e.process_uuid == process_uuid)
            {
                entry.status = ProcessRegistryStatus::Crashed;
            }
        }
        self.persist();
    }

    /// Remove a process entry entirely.
    pub fn remove(&self, process_uuid: &str) {
        {
            let mut data = self.lock();
            data.processes.retain(|e| e.process_uuid != process_uuid);
        }
        self.persist();
    }

    /// Get all entries (for frontend to query on startup).
    pub fn get_all(&self) -> Vec<ProcessRegistryEntry> {
        self.lock().processes.clone()
    }

    /// Get only running entries.
    pub fn get_running(&self) -> Vec<ProcessRegistryEntry> {
        self.lock()
            .processes
            .iter()
            .filter(|e| e.status == ProcessRegistryStatus::Running)
            .cloned()
            .collect()
    }

    /// Check if a specific PID is alive on Windows.
    #[cfg(target_os = "windows")]
    fn is_pid_alive(pid: u32) -> bool {
        use std::ptr;
        // PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        let handle = unsafe { windows_sys::Win32::System::Threading::OpenProcess(0x1000, 0, pid) };
        if handle.is_null() || handle == ptr::null_mut() {
            false
        } else {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(handle);
            }
            true
        }
    }

    /// Fallback for non-Windows: try sending signal 0.
    #[cfg(not(target_os = "windows"))]
    fn is_pid_alive(pid: u32) -> bool {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }

    /// On startup, check all "running" entries and mark dead ones as "crashed".
    fn check_all_pids(&self) {
        let mut changed = false;
        {
            let mut data = self.lock();
            for entry in data.processes.iter_mut() {
                if entry.status == ProcessRegistryStatus::Running && !Self::is_pid_alive(entry.pid)
                {
                    entry.status = ProcessRegistryStatus::Crashed;
                    changed = true;
                }
            }
        }
        if changed {
            self.persist();
        }
    }

    /// Remove stopped/crashed entries older than 24 hours.
    fn cleanup_old_entries(&self) {
        let cutoff = Utc::now() - chrono::Duration::hours(24);
        let mut changed = false;
        {
            let mut data = self.lock();
            let before = data.processes.len();
            data.processes
                .retain(|e| e.status == ProcessRegistryStatus::Running || e.started_at > cutoff);
            changed = data.processes.len() < before;
        }
        if changed {
            self.persist();
        }
    }
}
