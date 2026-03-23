use blake3::Hasher;
use std::fs;
use std::path::{Path, PathBuf};

fn include_file(path: &Path, hasher: &mut Hasher) {
    let bytes = match fs::read(path) {
        Ok(v) => v,
        Err(_) => return,
    };
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update(&bytes);
}

fn sorted_existing_files(cwd: &Path, names: &[&str]) -> Vec<PathBuf> {
    let mut files = names
        .iter()
        .map(|name| cwd.join(name))
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    files.sort();
    files
}

fn requirements_glob(cwd: &Path) -> Vec<PathBuf> {
    let entries = match fs::read_dir(cwd) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut files = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("requirements") && name.ends_with(".txt"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort();
    files
}

pub fn python_fingerprint(cwd: &Path) -> Option<String> {
    let mut hasher = Hasher::new();
    let mut used = false;

    for path in sorted_existing_files(
        cwd,
        &["pyproject.toml", "uv.lock", "poetry.lock", "pdm.lock"],
    ) {
        include_file(&path, &mut hasher);
        used = true;
    }
    for path in requirements_glob(cwd) {
        include_file(&path, &mut hasher);
        used = true;
    }

    if used {
        Some(hasher.finalize().to_hex().to_string())
    } else {
        None
    }
}

pub fn node_fingerprint(cwd: &Path) -> Option<String> {
    let mut hasher = Hasher::new();
    let mut used = false;

    for path in sorted_existing_files(
        cwd,
        &[
            "package.json",
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
            "bun.lock",
            "bun.lockb",
            "pnpm-workspace.yaml",
        ],
    ) {
        include_file(&path, &mut hasher);
        used = true;
    }

    if used {
        Some(hasher.finalize().to_hex().to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_temp_dir(name: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "varlock_launcher_fp_{}_{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    #[test]
    fn python_fingerprint_changes_when_requirements_change() {
        let dir = mk_temp_dir("python_fp");
        std::fs::write(dir.join("requirements.txt"), "fastapi==0.111.0\n").expect("write req");
        let a = python_fingerprint(&dir).expect("fingerprint a");
        std::fs::write(dir.join("requirements.txt"), "fastapi==0.112.0\n").expect("write req2");
        let b = python_fingerprint(&dir).expect("fingerprint b");
        assert_ne!(a, b);
    }

    #[test]
    fn node_fingerprint_changes_when_lockfile_changes() {
        let dir = mk_temp_dir("node_fp");
        std::fs::write(dir.join("package.json"), "{\"name\":\"app\"}\n").expect("write pkg");
        std::fs::write(dir.join("package-lock.json"), "{\"lockfileVersion\":3}\n")
            .expect("write lock");
        let a = node_fingerprint(&dir).expect("fingerprint a");
        std::fs::write(dir.join("package-lock.json"), "{\"lockfileVersion\":2}\n")
            .expect("write lock2");
        let b = node_fingerprint(&dir).expect("fingerprint b");
        assert_ne!(a, b);
    }
}
