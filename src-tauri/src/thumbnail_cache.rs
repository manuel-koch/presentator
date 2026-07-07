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
        if path.extension().and_then(|e| e.to_str()) == Some("png")
            && std::fs::remove_file(&path).is_ok()
        {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn tmp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let pid = std::process::id();
        let dir = std::env::temp_dir().join(format!("thumb_cache_test_{pid}_{n}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // Minimal 1×1 white PNG encoded as base64.
    const PNG_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

    #[test]
    fn thumbnail_dir_appends_step_thumbnail() {
        let root = std::path::Path::new("/tmp/cache");
        assert_eq!(thumbnail_dir(root), root.join("step-thumbnail"));
    }

    #[test]
    fn get_returns_none_for_missing_key() {
        let dir = tmp_dir();
        assert!(get(&dir, "nonexistent").is_none());
    }

    #[test]
    fn put_then_get_returns_same_png() {
        let dir = tmp_dir();
        put(&dir, "key1", PNG_B64).unwrap();
        let retrieved = get(&dir, "key1").unwrap();
        assert_eq!(retrieved, PNG_B64);
    }

    #[test]
    fn put_overwrites_existing_entry() {
        let dir = tmp_dir();
        let png2 = "AAAA"; // not a real PNG but base64-decodable
        put(&dir, "key2", PNG_B64).unwrap();
        put(&dir, "key2", png2).unwrap();
        let got = get(&dir, "key2").unwrap();
        assert_eq!(got, png2);
    }

    #[test]
    fn put_creates_cache_dir_if_absent() {
        let parent = tmp_dir();
        let dir = parent.join("nested_new");
        // The nested dir must not exist yet — parent was just freshly created.
        assert!(!dir.exists());
        put(&dir, "k", PNG_B64).unwrap();
        assert!(dir.exists());
    }

    #[test]
    fn put_returns_err_for_invalid_base64() {
        let dir = tmp_dir();
        let result = put(&dir, "bad", "not!valid!base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn stats_returns_zeros_for_missing_dir() {
        let dir = std::path::Path::new("/tmp/nonexistent_thumb_cache_xyz");
        let s = stats(dir);
        assert_eq!(s.entry_count, 0);
        assert_eq!(s.total_bytes, 0);
    }

    #[test]
    fn stats_counts_png_files_and_bytes() {
        let dir = tmp_dir();
        put(&dir, "a", PNG_B64).unwrap();
        put(&dir, "b", PNG_B64).unwrap();
        let s = stats(&dir);
        assert_eq!(s.entry_count, 2);
        assert!(s.total_bytes > 0);
    }

    #[test]
    fn stats_ignores_non_png_files() {
        let dir = tmp_dir();
        std::fs::write(dir.join("file.tmp"), b"tmp").unwrap();
        std::fs::write(dir.join("file.txt"), b"txt").unwrap();
        put(&dir, "real", PNG_B64).unwrap();
        let s = stats(&dir);
        assert_eq!(s.entry_count, 1);
    }

    #[test]
    fn clear_removes_all_png_files_and_returns_count() {
        let dir = tmp_dir();
        put(&dir, "x", PNG_B64).unwrap();
        put(&dir, "y", PNG_B64).unwrap();
        let removed = clear(&dir);
        assert_eq!(removed, 2);
        assert_eq!(stats(&dir).entry_count, 0);
    }

    #[test]
    fn clear_on_missing_dir_returns_zero() {
        let dir = std::path::Path::new("/tmp/nonexistent_thumb_clear_xyz");
        assert_eq!(clear(dir), 0);
    }

    #[test]
    fn clear_does_not_remove_non_png_files() {
        let dir = tmp_dir();
        std::fs::write(dir.join("keep.tmp"), b"x").unwrap();
        put(&dir, "gone", PNG_B64).unwrap();
        let removed = clear(&dir);
        assert_eq!(removed, 1);
        assert!(dir.join("keep.tmp").exists());
    }
}
