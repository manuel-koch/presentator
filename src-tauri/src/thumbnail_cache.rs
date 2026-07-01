use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};
use base64::{Engine as _, engine::general_purpose::STANDARD};

#[derive(serde::Serialize, Clone)]
pub struct CacheStats {
    pub entry_count: usize,
    pub total_bytes: u64,
}

pub fn thumbnail_dir(cache_root: &Path) -> PathBuf {
    cache_root.join("step-thumbnail")
}

fn hash_key(key: &str) -> String {
    let mut h = Sha256::new();
    h.update(key.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Returns base64-encoded PNG bytes, or `None` if not cached.
pub fn get(cache_dir: &Path, key: &str) -> Option<String> {
    let bytes = std::fs::read(cache_dir.join(format!("{}.png", hash_key(key)))).ok()?;
    Some(STANDARD.encode(bytes))
}

/// Atomically writes PNG bytes (decoded from base64) to `<cache_dir>/<hash>.png`.
/// Best-effort: silently ignores decode or I/O failures.
pub fn put(cache_dir: &Path, key: &str, png_base64: &str) -> std::io::Result<()> {
    let bytes = STANDARD.decode(png_base64)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::create_dir_all(cache_dir)?;
    let hash = hash_key(key);
    let tmp = cache_dir.join(format!("{hash}.tmp"));
    let target = cache_dir.join(format!("{hash}.png"));
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &target)
}

pub fn stats(cache_dir: &Path) -> CacheStats {
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return CacheStats { entry_count: 0, total_bytes: 0 };
    };
    let mut count = 0usize;
    let mut bytes = 0u64;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("png") {
            if let Ok(meta) = entry.metadata() {
                count += 1;
                bytes += meta.len();
            }
        }
    }
    CacheStats { entry_count: count, total_bytes: bytes }
}

/// Deletes every `.png` file in `cache_dir`. Returns the number of files removed.
pub fn clear(cache_dir: &Path) -> usize {
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return 0;
    };
    let mut removed = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("png") {
            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}
