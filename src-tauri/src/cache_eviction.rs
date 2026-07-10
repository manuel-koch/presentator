use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// A cached file entry tracked for eviction.
struct CacheEntry {
    path: PathBuf,
    size: u64,
    mtime: SystemTime,
}

/// Deletes the oldest files in `dir` matching `*.<ext>` until the total
/// byte count is at or below `max_bytes`. Skips non-`<ext>` files (e.g. `.tmp` orphans).
/// Returns the number of files removed.
///
/// When `max_bytes` is 0, the entire directory is emptied — every matching
/// file is removed.
pub fn evict_to_limit(dir: &Path, max_bytes: u64, extension: &str) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };

    let mut files: Vec<CacheEntry> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some(extension) {
                return None;
            }
            let meta = entry.metadata().ok()?;
            let mtime = meta.modified().ok()?;
            Some(CacheEntry {
                path,
                size: meta.len(),
                mtime,
            })
        })
        .collect();

    let total: u64 = files.iter().map(|e| e.size).sum();
    if total <= max_bytes {
        return 0;
    }

    // Sort oldest-first; same-second files are tie-broken by path (stable).
    files.sort_by(|a, b| match a.mtime.cmp(&b.mtime) {
        std::cmp::Ordering::Equal => a.path.cmp(&b.path),
        other => other,
    });

    let target = total.saturating_sub(max_bytes);
    let mut removed_bytes = 0u64;
    let mut removed_count = 0;

    for entry in &files {
        if removed_bytes >= target {
            break;
        }
        if std::fs::remove_file(&entry.path).is_ok() {
            removed_bytes += entry.size;
            removed_count += 1;
        }
    }

    removed_count
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::thread::sleep;
    use std::time::Duration;

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn tmp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("cache_eviction_test_{n}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_file(dir: &Path, name: &str, size: usize) {
        let content = vec![b'x'; size];
        std::fs::write(dir.join(name), &content).unwrap();
    }

    #[test]
    fn empty_dir_returns_zero() {
        let dir = std::env::temp_dir().join("evict_empty_dir_test");
        let _ = std::fs::create_dir_all(&dir);
        let count = evict_to_limit(&dir, 100, "svg");
        assert_eq!(count, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_dir_returns_zero() {
        let dir = std::env::temp_dir().join("evict_missing_dir_test");
        let _ = std::fs::remove_dir_all(&dir);
        let count = evict_to_limit(&dir, 100, "svg");
        assert_eq!(count, 0);
    }

    #[test]
    fn under_limit_does_nothing() {
        let dir = tmp_dir();
        write_file(&dir, "a.svg", 10);
        write_file(&dir, "b.svg", 20);
        let count = evict_to_limit(&dir, 100, "svg");
        assert_eq!(count, 0);
        assert!(dir.join("a.svg").exists());
        assert!(dir.join("b.svg").exists());
    }

    #[test]
    fn evicts_oldest_first() {
        let dir = tmp_dir();
        // Write files with distinct mtimes (sleep 10ms between each).
        write_file(&dir, "old.svg", 40);
        sleep(Duration::from_millis(10));
        write_file(&dir, "mid.svg", 30);
        sleep(Duration::from_millis(10));
        write_file(&dir, "new.svg", 20);

        // Limit = 40 bytes → total is 90, need to remove 50 bytes.
        // Oldest (40) + mid (30) = 70 removed, which covers 50 target.
        // But we stop once removed_bytes >= target, so after removing old (40)
        // we still need 10 more, so mid (30) is removed too → 2 files.
        let count = evict_to_limit(&dir, 40, "svg");
        assert_eq!(count, 2, "should remove old.svg and mid.svg");
        assert!(!dir.join("old.svg").exists());
        assert!(!dir.join("mid.svg").exists());
        assert!(dir.join("new.svg").exists());
    }

    #[test]
    fn evicts_until_exactly_at_limit() {
        let dir = tmp_dir();
        write_file(&dir, "a.svg", 30);
        sleep(Duration::from_millis(10));
        write_file(&dir, "b.svg", 30);
        sleep(Duration::from_millis(10));
        write_file(&dir, "c.svg", 30);

        // Limit = 35, total = 90, need to remove 55.
        // Remove a (30) → removed=30, still need 25 more.
        // Remove b (30) → removed=60 ≥ 55. Done.
        let count = evict_to_limit(&dir, 35, "svg");
        assert_eq!(count, 2);
        assert!(!dir.join("a.svg").exists());
        assert!(!dir.join("b.svg").exists());
        assert!(dir.join("c.svg").exists());
    }

    #[test]
    fn zero_limit_empties_all() {
        let dir = tmp_dir();
        write_file(&dir, "x.svg", 10);
        write_file(&dir, "y.svg", 20);
        let count = evict_to_limit(&dir, 0, "svg");
        assert_eq!(count, 2);
        assert!(!dir.join("x.svg").exists());
        assert!(!dir.join("y.svg").exists());
    }

    #[test]
    fn ignores_non_matching_extension() {
        let dir = tmp_dir();
        write_file(&dir, "keep.tmp", 1000);
        write_file(&dir, "remove.svg", 10);
        let count = evict_to_limit(&dir, 0, "svg");
        assert_eq!(count, 1);
        assert!(dir.join("keep.tmp").exists());
        assert!(!dir.join("remove.svg").exists());
    }
}