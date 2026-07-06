use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};

#[derive(serde::Serialize, Clone)]
pub struct CacheStats {
    pub entry_count: usize,
    pub total_bytes: u64,
}

/// SHA-256 of all inputs that affect the rendered SVG output.
/// `app_version` (pass `env!("CARGO_PKG_VERSION")`) ensures the cache is
/// invalidated whenever the app is rebuilt with a new version, which should
/// happen whenever rendering dependencies change.
pub fn cache_key(
    content: &str,
    font_size_pt: f32,
    text_color: &str,
    font_family: &str,
    text_align: &str,
    width: f64,
    app_version: &str,
) -> String {
    let mut h = Sha256::new();
    h.update(content.as_bytes());
    h.update(b"\0");
    h.update(font_size_pt.to_le_bytes());
    h.update(b"\0");
    h.update(text_color.as_bytes());
    h.update(b"\0");
    h.update(font_family.as_bytes());
    h.update(b"\0");
    h.update(text_align.as_bytes());
    h.update(b"\0");
    h.update(width.to_le_bytes());
    h.update(b"\0");
    h.update(app_version.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

pub fn overlay_svg_dir(cache_root: &Path) -> PathBuf {
    cache_root.join("overlay-svg")
}

pub fn get(cache_dir: &Path, key: &str) -> Option<String> {
    std::fs::read_to_string(cache_dir.join(format!("{key}.svg"))).ok()
}

/// Atomically writes `svg` to `cache_dir/<key>.svg` via a temp file.
pub fn put(cache_dir: &Path, key: &str, svg: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(cache_dir)?;
    let target = cache_dir.join(format!("{key}.svg"));
    let tmp = cache_dir.join(format!("{key}.tmp"));
    std::fs::write(&tmp, svg)?;
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
        if path.extension().and_then(|e| e.to_str()) == Some("svg") {
            if let Ok(meta) = entry.metadata() {
                count += 1;
                bytes += meta.len();
            }
        }
    }
    CacheStats { entry_count: count, total_bytes: bytes }
}

/// Deletes every `.svg` file in `cache_dir`. Returns the number of files removed.
pub fn clear(cache_dir: &Path) -> usize {
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return 0;
    };
    let mut removed = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("svg") {
            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
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
        let dir = std::env::temp_dir().join(format!("presentator_cache_test_{n}"));
        // Remove stale state from a previous test run, then recreate.
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // ── cache_key ─────────────────────────────────────────────────────────────

    #[test]
    fn cache_key_is_deterministic() {
        let k1 = cache_key("hello", 14.0, "#000", "Helvetica Neue", "left", 280.0, "1.0.0");
        let k2 = cache_key("hello", 14.0, "#000", "Helvetica Neue", "left", 280.0, "1.0.0");
        assert_eq!(k1, k2);
    }

    #[test]
    fn cache_key_is_64_hex_chars() {
        let k = cache_key("x", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        assert_eq!(k.len(), 64);
        assert!(k.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn cache_key_changes_with_content() {
        let k1 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        let k2 = cache_key("bar", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        assert_ne!(k1, k2);
    }

    #[test]
    fn cache_key_changes_with_width() {
        let k1 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        let k2 = cache_key("foo", 14.0, "#000", "Arial", "left", 200.0, "1.0.0");
        assert_ne!(k1, k2);
    }

    #[test]
    fn cache_key_changes_with_font_size() {
        let k1 = cache_key("foo", 13.0, "#000", "Arial", "left", 100.0, "1.0.0");
        let k2 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        assert_ne!(k1, k2);
    }

    #[test]
    fn cache_key_changes_with_color() {
        let k1 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        let k2 = cache_key("foo", 14.0, "#fff", "Arial", "left", 100.0, "1.0.0");
        assert_ne!(k1, k2);
    }

    #[test]
    fn cache_key_changes_with_font_family() {
        let k1 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        let k2 = cache_key("foo", 14.0, "#000", "Menlo", "left", 100.0, "1.0.0");
        assert_ne!(k1, k2);
    }

    #[test]
    fn cache_key_changes_with_text_align() {
        let k1 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        let k2 = cache_key("foo", 14.0, "#000", "Arial", "center", 100.0, "1.0.0");
        assert_ne!(k1, k2);
    }

    #[test]
    fn cache_key_changes_with_app_version() {
        let k1 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.0");
        let k2 = cache_key("foo", 14.0, "#000", "Arial", "left", 100.0, "1.0.1");
        assert_ne!(k1, k2);
    }

    // ── get / put ─────────────────────────────────────────────────────────────

    #[test]
    fn get_returns_none_for_missing_key() {
        let dir = tmp_dir();
        assert!(get(&dir, "nosuchkey").is_none());
    }

    #[test]
    fn put_then_get_returns_same_svg() {
        let dir = tmp_dir();
        let svg = "<svg><rect/></svg>";
        put(&dir, "testkey", svg).unwrap();
        assert_eq!(get(&dir, "testkey").unwrap(), svg);
    }

    #[test]
    fn put_overwrites_existing_entry() {
        let dir = tmp_dir();
        put(&dir, "k", "first").unwrap();
        put(&dir, "k", "second").unwrap();
        assert_eq!(get(&dir, "k").unwrap(), "second");
    }

    #[test]
    fn put_creates_cache_dir_if_absent() {
        let dir = std::env::temp_dir()
            .join(format!("presentator_cache_mkdir_{}", COUNTER.fetch_add(1, Ordering::SeqCst)));
        assert!(!dir.exists());
        put(&dir, "k", "<svg/>").unwrap();
        assert!(dir.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── stats ─────────────────────────────────────────────────────────────────

    #[test]
    fn stats_returns_zeros_for_missing_dir() {
        let dir = std::env::temp_dir().join("presentator_cache_noexist_stats");
        let s = stats(&dir);
        assert_eq!(s.entry_count, 0);
        assert_eq!(s.total_bytes, 0);
    }

    #[test]
    fn stats_counts_svg_files_and_their_bytes() {
        let dir = tmp_dir();
        let svg = "<svg><rect/></svg>";
        put(&dir, "a", svg).unwrap();
        put(&dir, "b", svg).unwrap();
        let s = stats(&dir);
        assert_eq!(s.entry_count, 2);
        assert_eq!(s.total_bytes, (svg.len() * 2) as u64);
    }

    #[test]
    fn stats_does_not_count_tmp_files() {
        let dir = tmp_dir();
        // Simulate a leftover .tmp file (e.g. from a crashed write).
        std::fs::write(dir.join("orphan.tmp"), "partial").unwrap();
        let s = stats(&dir);
        assert_eq!(s.entry_count, 0);
    }

    // ── clear ─────────────────────────────────────────────────────────────────

    #[test]
    fn clear_removes_all_svg_files_and_returns_count() {
        let dir = tmp_dir();
        put(&dir, "x", "<svg/>").unwrap();
        put(&dir, "y", "<svg/>").unwrap();
        let removed = clear(&dir);
        assert_eq!(removed, 2);
        assert_eq!(stats(&dir).entry_count, 0);
    }

    #[test]
    fn clear_on_missing_dir_returns_zero() {
        let dir = std::env::temp_dir().join("presentator_cache_noexist_clear");
        assert_eq!(clear(&dir), 0);
    }

    #[test]
    fn clear_does_not_remove_tmp_files() {
        let dir = tmp_dir();
        std::fs::write(dir.join("orphan.tmp"), "partial").unwrap();
        let removed = clear(&dir);
        assert_eq!(removed, 0);
        assert!(dir.join("orphan.tmp").exists());
        let _ = std::fs::remove_file(dir.join("orphan.tmp"));
    }
}
