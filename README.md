# Varlock UI

Varlock UI is a secure, local-first environment variable manager and vault. It allows developers to securely manage `.env` files across multiple projects without relying on cloud synchronization.

Built for security and developer experience, Varlock ensures your secrets never leave your machine unless you explicitly export them.

## Features

- **Local-First Security:** Your secrets stay on your machine.
- **Project Workspaces:** Manage `.env` files for multiple projects easily from a beautiful UI.
- **Zero-Trust Cryptography:** 
  - Argon2id for Key Derivation
  - HKDF for Key Stretching
  - XChaCha20-Poly1305 for Authenticated Encryption
  - Auto-locking and strict memory zeroization
- **Direct Variable Injection:** Start processes with secrets directly injected into their environment without writing plaintext `.env` files to disk.
- **Cross-Platform:** Available on Windows, macOS, and Linux.

## Architecture

Varlock is built as a generic desktop application using Tauri and Rust:

- **Frontend:** React, TypeScript, TailwindCSS
- **Backend Core:** Rust
- **Database:** Local SQLite (`vault.db`) encrypted with master keys
- **Process Management:** Native terminal spawning and direct `shell-words` invocation

## Security

Varlock was designed with defense-in-depth principles. For a complete overview of the threat model and recent security audits, see the `docs/audit` folder.

- **Content Security Policy:** Strict CSP enforces isolation between the web UI and Native APIs.
- **Keyring Protection:** Master credentials are obfuscated before storage in the OS-native Keychain.
- **No Path Traversal:** File system access is tightly restricted to registered project directories.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [Rust](https://www.rust-lang.org/) (latest stable)
- Tauri dependencies for your platform (see the [Tauri setup guide](https://tauri.app/v1/guides/getting-started/prerequisites))

### Building and Running

1. Clone the repository:
   ```bash
   git clone https://github.com/danish-fareed/varlock_ui.git
   cd varlock_ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

### Running Tests

To verify the backend cryptographic and database logic:
```bash
cd src-tauri
cargo test
```

## License

MIT License. See `LICENSE` for details.
