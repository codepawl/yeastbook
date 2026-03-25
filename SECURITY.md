# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Email **nxan2911@gmail.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You'll receive a response within 48 hours

## Security Considerations

Yeastbook executes arbitrary TypeScript/JavaScript code via `new AsyncFunction()`. This is by design — it's a notebook runtime, similar to how Jupyter executes Python.

**Known attack surface:**
- Cell code runs with full Bun/Node.js permissions (filesystem, network, process)
- The WebSocket server has no authentication by default
- The HTTP server binds to localhost only

**Recommendations:**
- Don't run untrusted notebooks without reviewing cell contents
- Don't expose the server to the public internet
- Use `--port` to avoid port conflicts

## Scope

Security issues in the following areas are in scope:
- Code execution escaping intended sandboxing
- XSS in the notebook UI (output rendering, markdown)
- Path traversal in file operations
- WebSocket message injection
