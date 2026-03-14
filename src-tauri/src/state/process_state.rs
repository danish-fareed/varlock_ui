use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Child;

/// Manages running child processes spawned by `varlock run`.
/// Each process is identified by a UUID string so the frontend
/// can request it be killed.
pub struct ProcessState {
    processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl ProcessState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Acquire the lock, recovering from poison if a thread panicked.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Child>> {
        self.processes.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Clone the inner shared map for background tasks.
    pub fn shared(&self) -> Arc<Mutex<HashMap<String, Child>>> {
        Arc::clone(&self.processes)
    }

    /// Register a running child process.
    pub fn insert(&self, id: String, child: Child) {
        self.lock().insert(id, child);
    }

    /// Remove and return a process by ID (for cleanup after exit).
    pub fn remove(&self, id: &str) -> Option<Child> {
        self.lock().remove(id)
    }

    /// Kill a running process by ID.
    pub fn kill(&self, id: &str) -> Result<(), String> {
        let mut processes = self.lock();
        if let Some(child) = processes.get_mut(id) {
            child
                .start_kill()
                .map_err(|e| format!("Failed to kill process: {}", e))?;
            processes.remove(id);
            Ok(())
        } else {
            Err(format!("Process {} not found", id))
        }
    }

    /// Kill all running processes. Used during app shutdown.
    pub fn kill_all(&self) {
        let mut processes = self.lock();
        for (id, child) in processes.iter_mut() {
            if let Err(e) = child.start_kill() {
                eprintln!("Failed to kill process {} on shutdown: {}", id, e);
            }
        }
        processes.clear();
    }
}
