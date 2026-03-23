//! Varlock Vault Cryptography Module
//!
//! Implements the full encryption stack:
//! - **XChaCha20-Poly1305** for authenticated encryption (192-bit random nonce)
//! - **Argon2id** for password-based key derivation (memory-hard)
//! - **HKDF-SHA256** for key stretching to 512-bit Stretched Master Key
//! - **DEK/KEK model**: Data encrypted by random DEK, DEK encrypted by password-derived KEK
//!
//! Nonce strategy: Random 192-bit via OsRng per encrypt call.
//! Birthday-bound collision at 2^96 operations ≈ 2^-96 — safe for <<10M secrets.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Errors from the crypto module.
#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Key derivation failed: {0}")]
    KeyDerivation(String),
    #[error("Encryption failed: {0}")]
    Encryption(String),
    #[error("Decryption failed: {0}")]
    Decryption(String),
    #[error("Invalid data: {0}")]
    InvalidData(String),
}

impl From<CryptoError> for String {
    fn from(e: CryptoError) -> String {
        e.to_string()
    }
}

// ── Argon2id parameters ──
// 64MB memory, 3 iterations, 4 threads — exceeds OWASP recommendations
const ARGON2_MEMORY_KIB: u32 = 65_536; // 64 MB
const ARGON2_ITERATIONS: u32 = 3;
const ARGON2_PARALLELISM: u32 = 4;
const ARGON2_OUTPUT_LEN: usize = 32; // 256-bit master key

// Salt length for Argon2
const SALT_LEN: usize = 32;

// HKDF info strings for domain separation
const HKDF_INFO_ENCRYPTION: &[u8] = b"varlock-vault-encryption-key";
const HKDF_INFO_MAC: &[u8] = b"varlock-vault-mac-key";

// DEK length
const DEK_LEN: usize = 32; // 256-bit

// Nonce length for XChaCha20-Poly1305
const NONCE_LEN: usize = 24; // 192-bit

/// A 256-bit key that zeroizes on drop.
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct SecureKey {
    bytes: [u8; 32],
}

impl SecureKey {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self { bytes }
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.bytes
    }
}

/// The 512-bit Stretched Master Key, split into encryption and MAC halves.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct StretchedMasterKey {
    encryption_key: [u8; 32],
    mac_key: [u8; 32],
}

impl StretchedMasterKey {
    pub fn encryption_key(&self) -> &[u8; 32] {
        &self.encryption_key
    }

    #[allow(dead_code)]
    pub fn mac_key(&self) -> &[u8; 32] {
        &self.mac_key
    }
}

/// Salt used for Argon2id derivation, stored alongside the vault.
pub struct VaultSalt {
    pub bytes: [u8; SALT_LEN],
}

impl VaultSalt {
    /// Generate a new random salt.
    pub fn generate() -> Self {
        let mut bytes = [0u8; SALT_LEN];
        OsRng.fill_bytes(&mut bytes);
        Self { bytes }
    }

    /// Create from existing bytes.
    pub fn from_bytes(bytes: [u8; SALT_LEN]) -> Self {
        Self { bytes }
    }
}

/// Protected DEK — the random Data Encryption Key, encrypted by the Stretched Master Key.
/// Stored in the vault header.
pub struct ProtectedDek {
    /// Nonce used to encrypt the DEK
    pub nonce: [u8; NONCE_LEN],
    /// Encrypted DEK (ciphertext + 16-byte Poly1305 tag)
    pub ciphertext: Vec<u8>,
}

impl ProtectedDek {
    /// Serialize to bytes: [nonce (24)] [ciphertext (32 + 16)]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(NONCE_LEN + self.ciphertext.len());
        out.extend_from_slice(&self.nonce);
        out.extend_from_slice(&self.ciphertext);
        out
    }

    /// Deserialize from bytes.
    pub fn from_bytes(data: &[u8]) -> Result<Self, CryptoError> {
        if data.len() < NONCE_LEN + DEK_LEN + 16 {
            return Err(CryptoError::InvalidData(
                "Protected DEK data too short".into(),
            ));
        }
        let mut nonce = [0u8; NONCE_LEN];
        nonce.copy_from_slice(&data[..NONCE_LEN]);
        let ciphertext = data[NONCE_LEN..].to_vec();
        Ok(Self { nonce, ciphertext })
    }
}

// ── Key Derivation ──

/// Derive a 256-bit Master Key from a password using Argon2id.
pub fn derive_master_key(password: &str, salt: &VaultSalt) -> Result<SecureKey, CryptoError> {
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_ITERATIONS,
        ARGON2_PARALLELISM,
        Some(ARGON2_OUTPUT_LEN),
    )
    .map_err(|e| CryptoError::KeyDerivation(format!("Invalid Argon2 params: {}", e)))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut output = [0u8; ARGON2_OUTPUT_LEN];
    argon2
        .hash_password_into(password.as_bytes(), &salt.bytes, &mut output)
        .map_err(|e| CryptoError::KeyDerivation(format!("Argon2id failed: {}", e)))?;

    Ok(SecureKey::from_bytes(output))
}

/// Stretch a 256-bit Master Key into a 512-bit Stretched Master Key using HKDF-SHA256.
/// Returns two 256-bit keys: one for encryption, one for MAC.
pub fn stretch_master_key(master_key: &SecureKey) -> Result<StretchedMasterKey, CryptoError> {
    let hkdf = Hkdf::<Sha256>::new(None, master_key.as_bytes());

    let mut encryption_key = [0u8; 32];
    hkdf.expand(HKDF_INFO_ENCRYPTION, &mut encryption_key)
        .map_err(|e| CryptoError::KeyDerivation(format!("HKDF expand (enc) failed: {}", e)))?;

    let mut mac_key = [0u8; 32];
    hkdf.expand(HKDF_INFO_MAC, &mut mac_key)
        .map_err(|e| CryptoError::KeyDerivation(format!("HKDF expand (mac) failed: {}", e)))?;

    Ok(StretchedMasterKey {
        encryption_key,
        mac_key,
    })
}

// ── DEK Management ──

/// Generate a new random 256-bit Data Encryption Key.
pub fn generate_dek() -> SecureKey {
    let mut bytes = [0u8; DEK_LEN];
    OsRng.fill_bytes(&mut bytes);
    SecureKey::from_bytes(bytes)
}

/// Encrypt the DEK with the Stretched Master Key's encryption half (KEK).
pub fn protect_dek(
    dek: &SecureKey,
    stretched_key: &StretchedMasterKey,
) -> Result<ProtectedDek, CryptoError> {
    let cipher = XChaCha20Poly1305::new_from_slice(stretched_key.encryption_key())
        .map_err(|e| CryptoError::Encryption(format!("XChaCha20 init failed: {}", e)))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, dek.as_bytes().as_ref())
        .map_err(|e| CryptoError::Encryption(format!("DEK encryption failed: {}", e)))?;

    Ok(ProtectedDek {
        nonce: nonce_bytes,
        ciphertext,
    })
}

/// Decrypt the DEK using the Stretched Master Key's encryption half (KEK).
pub fn unprotect_dek(
    protected: &ProtectedDek,
    stretched_key: &StretchedMasterKey,
) -> Result<SecureKey, CryptoError> {
    let cipher = XChaCha20Poly1305::new_from_slice(stretched_key.encryption_key())
        .map_err(|e| CryptoError::Decryption(format!("XChaCha20 init failed: {}", e)))?;

    let nonce = XNonce::from_slice(&protected.nonce);

    let plaintext = cipher
        .decrypt(nonce, protected.ciphertext.as_ref())
        .map_err(|_| CryptoError::Decryption("DEK decryption failed (wrong password?)".into()))?;

    if plaintext.len() != DEK_LEN {
        return Err(CryptoError::Decryption(
            "Decrypted DEK has unexpected length".into(),
        ));
    }

    let mut bytes = [0u8; DEK_LEN];
    bytes.copy_from_slice(&plaintext);
    Ok(SecureKey::from_bytes(bytes))
}

// ── Data Encryption ──

/// Encrypt arbitrary data using the DEK.
/// Returns: [nonce (24 bytes)] [ciphertext + tag]
pub fn encrypt(data: &[u8], dek: &SecureKey) -> Result<Vec<u8>, CryptoError> {
    let cipher = XChaCha20Poly1305::new_from_slice(dek.as_bytes())
        .map_err(|e| CryptoError::Encryption(format!("XChaCha20 init failed: {}", e)))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| CryptoError::Encryption(format!("Encryption failed: {}", e)))?;

    let mut result = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt data that was encrypted with `encrypt()`.
/// Input format: [nonce (24 bytes)] [ciphertext + tag]
pub fn decrypt(encrypted: &[u8], dek: &SecureKey) -> Result<Vec<u8>, CryptoError> {
    if encrypted.len() < NONCE_LEN + 16 {
        return Err(CryptoError::InvalidData("Encrypted data too short".into()));
    }

    let cipher = XChaCha20Poly1305::new_from_slice(dek.as_bytes())
        .map_err(|e| CryptoError::Decryption(format!("XChaCha20 init failed: {}", e)))?;

    let nonce = XNonce::from_slice(&encrypted[..NONCE_LEN]);
    let ciphertext = &encrypted[NONCE_LEN..];

    cipher.decrypt(nonce, ciphertext).map_err(|_| {
        CryptoError::Decryption("Decryption failed (data tampered or wrong key)".into())
    })
}

// ── Secret Generation ──

/// Generate a cryptographically random secret of the specified type.
pub fn generate_secret(secret_type: &str, length: Option<usize>) -> String {
    match secret_type {
        "hex" => {
            let len = length.unwrap_or(64);
            let byte_len = (len + 1) / 2;
            let mut bytes = vec![0u8; byte_len];
            OsRng.fill_bytes(&mut bytes);
            let hex: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
            hex[..len].to_string()
        }
        "base64" => {
            let len = length.unwrap_or(32);
            let mut bytes = vec![0u8; len];
            OsRng.fill_bytes(&mut bytes);
            general_purpose_base64_encode(&bytes)
        }
        "uuid" => uuid::Uuid::new_v4().to_string(),
        "alphanumeric" => {
            let len = length.unwrap_or(32);
            let charset = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            generate_from_charset(charset, len)
        }
        "password" => {
            let len = length.unwrap_or(24);
            let charset =
                b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
            generate_from_charset(charset, len)
        }
        _ => {
            // Default: hex string
            let len = length.unwrap_or(64);
            let byte_len = (len + 1) / 2;
            let mut bytes = vec![0u8; byte_len];
            OsRng.fill_bytes(&mut bytes);
            let hex: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
            hex[..len].to_string()
        }
    }
}

/// Generate a random string from a given character set using rejection sampling.
/// This eliminates modular bias that occurs with `byte % charset.len()` when
/// charset.len() doesn't evenly divide 256.
fn generate_from_charset(charset: &[u8], len: usize) -> String {
    let charset_len = charset.len();
    let threshold = 256 - (256 % charset_len); // reject bytes >= this value
    let mut result = Vec::with_capacity(len);
    let mut buf = [0u8; 1];
    while result.len() < len {
        OsRng.fill_bytes(&mut buf);
        if (buf[0] as usize) < threshold {
            result.push(charset[buf[0] as usize % charset_len] as char);
        }
        // else: discard and retry — removes bias
    }
    result.into_iter().collect()
}

/// Validate a master password meets minimum security requirements.
pub fn validate_password(password: &str) -> Result<(), CryptoError> {
    if password.len() < 12 {
        return Err(CryptoError::InvalidData(
            "Password must be at least 12 characters".into(),
        ));
    }
    Ok(())
}

/// Simple base64 encoding (avoid pulling in a full base64 crate).
fn general_purpose_base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let chunks = data.chunks(3);

    for chunk in chunks {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);

        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_derivation_roundtrip() {
        let salt = VaultSalt::generate();
        let key1 = derive_master_key("test-password-123", &salt).unwrap();
        let key2 = derive_master_key("test-password-123", &salt).unwrap();

        // Same password + salt should produce same key
        assert_eq!(key1.as_bytes(), key2.as_bytes());

        // Different password should produce different key
        let key3 = derive_master_key("different-password", &salt).unwrap();
        assert_ne!(key1.as_bytes(), key3.as_bytes());
    }

    #[test]
    fn test_hkdf_stretch() {
        let salt = VaultSalt::generate();
        let master_key = derive_master_key("test-password", &salt).unwrap();
        let stretched = stretch_master_key(&master_key).unwrap();

        // Encryption and MAC keys should be different
        assert_ne!(stretched.encryption_key(), stretched.mac_key());
    }

    #[test]
    fn test_dek_protect_unprotect() {
        let salt = VaultSalt::generate();
        let master_key = derive_master_key("test-password", &salt).unwrap();
        let stretched = stretch_master_key(&master_key).unwrap();

        let dek = generate_dek();
        let protected = protect_dek(&dek, &stretched).unwrap();
        let recovered = unprotect_dek(&protected, &stretched).unwrap();

        assert_eq!(dek.as_bytes(), recovered.as_bytes());
    }

    #[test]
    fn test_dek_wrong_password() {
        let salt = VaultSalt::generate();

        let master_key1 = derive_master_key("correct-password", &salt).unwrap();
        let stretched1 = stretch_master_key(&master_key1).unwrap();

        let dek = generate_dek();
        let protected = protect_dek(&dek, &stretched1).unwrap();

        // Try to decrypt with wrong password
        let master_key2 = derive_master_key("wrong-password", &salt).unwrap();
        let stretched2 = stretch_master_key(&master_key2).unwrap();

        let result = unprotect_dek(&protected, &stretched2);
        assert!(result.is_err());
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let dek = generate_dek();
        let plaintext = b"STRIPE_KEY=sk_live_abc123";

        let encrypted = encrypt(plaintext, &dek).unwrap();
        let decrypted = decrypt(&encrypted, &dek).unwrap();

        assert_eq!(plaintext.as_ref(), decrypted.as_slice());
    }

    #[test]
    fn test_encrypt_different_nonces() {
        let dek = generate_dek();
        let plaintext = b"same data";

        let enc1 = encrypt(plaintext, &dek).unwrap();
        let enc2 = encrypt(plaintext, &dek).unwrap();

        // Same plaintext should produce different ciphertexts (different random nonces)
        assert_ne!(enc1, enc2);

        // But both should decrypt to the same value
        assert_eq!(decrypt(&enc1, &dek).unwrap(), decrypt(&enc2, &dek).unwrap());
    }

    #[test]
    fn test_decrypt_tampered_data() {
        let dek = generate_dek();
        let encrypted = encrypt(b"secret data", &dek).unwrap();

        // Tamper with the ciphertext
        let mut tampered = encrypted.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 0xFF;

        let result = decrypt(&tampered, &dek);
        assert!(result.is_err());
    }

    #[test]
    fn test_protected_dek_serialization() {
        let salt = VaultSalt::generate();
        let master_key = derive_master_key("test", &salt).unwrap();
        let stretched = stretch_master_key(&master_key).unwrap();

        let dek = generate_dek();
        let protected = protect_dek(&dek, &stretched).unwrap();

        let bytes = protected.to_bytes();
        let restored = ProtectedDek::from_bytes(&bytes).unwrap();

        let recovered = unprotect_dek(&restored, &stretched).unwrap();
        assert_eq!(dek.as_bytes(), recovered.as_bytes());
    }

    #[test]
    fn test_generate_secret_hex() {
        let secret = generate_secret("hex", Some(64));
        assert_eq!(secret.len(), 64);
        assert!(secret.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_generate_secret_uuid() {
        let secret = generate_secret("uuid", None);
        assert!(uuid::Uuid::parse_str(&secret).is_ok());
    }

    #[test]
    fn test_generate_secret_alphanumeric() {
        let secret = generate_secret("alphanumeric", Some(32));
        assert_eq!(secret.len(), 32);
        assert!(secret.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn test_generate_from_charset_no_bias() {
        let charset = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let n = 500_000;
        let generated = generate_from_charset(charset, n);

        let mut freq = std::collections::HashMap::new();
        for ch in generated.chars() {
            *freq.entry(ch).or_insert(0u64) += 1;
        }

        let expected = n as f64 / charset.len() as f64;
        // 5% tolerance — the old modular bias produces ~25% relative bias
        // on affected characters, which is 5x larger than this threshold.
        // With 500k samples (~8065 per char), 3σ ≈ 3.3%, so 5% is reliable.
        for (ch, count) in &freq {
            let deviation = (*count as f64 - expected).abs() / expected;
            assert!(
                deviation < 0.05,
                "Character '{}' has {:.1}% deviation (count: {}, expected: {:.0})",
                ch,
                deviation * 100.0,
                count,
                expected
            );
        }
    }

    #[test]
    fn test_validate_password_short() {
        assert!(validate_password("").is_err());
        assert!(validate_password("short").is_err());
        assert!(validate_password("11chars!!!!").is_err());
    }

    #[test]
    fn test_validate_password_valid() {
        assert!(validate_password("12characters!").is_ok());
        assert!(validate_password("a-very-long-secure-password-123").is_ok());
    }
}
