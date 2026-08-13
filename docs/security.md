# Security boundary

Fuse Bead Studio is untrusted module content running inside Lumina's Workshop sandbox. Official and community modules use the same package, permission, isolation, update, and rollback contract.

## Capabilities the module receives

- `image.pick`: an image selected through Lumina, without exposing its filesystem path;
- `project.storage`: a module-scoped, quota-limited project namespace;
- `color-library.read`: a sanitized color-library snapshot without internal paths or credentials;
- `handoff.image`: an explicit, user-confirmed image and recipe handoff to Lumina's converter.

Every request crosses the public `@lumina/workshop-sdk` `MessageChannel` boundary. The module does not import Lumina source files or internal frontend APIs.

## Capabilities the module does not receive

The module receives no:

- general filesystem paths or arbitrary file read/write access;
- Registry signing keys, Registry credentials, GitHub credentials, or update credentials;
- Electron, Node.js, preload, shell, clipboard, or native-process APIs;
- general HTTP, HTTPS, WebSocket, popup, download, top-frame navigation, or cross-module access;
- direct converter internals, material-archive paths, session identifiers, or host cache paths.

Runtime HTML is a validated, self-contained file. Executable package files outside `ui/index.html`, external HTML/CSS resources, dynamic imports, and `eval` are rejected before installation. The desktop protocol applies an isolated module origin and blocks network and navigation escapes again at runtime.

## Data handling

Image analysis and editable project storage stay local. The module serializes project state rather than raw source-image bytes; private filenames and host paths are not written into recipes. Handoff uses the source-color PNG only after an in-module summary and any required host replacement confirmation.

Changing a LUT or material library never silently changes the saved artwork palette. Mappings carry their library identity and become stale when that library changes.

## Package and update integrity

Release packages are deterministic and accompanied by SHA-256 checksums. Lumina installs exact SemVer assets admitted by its signed Registry, stages updates as candidates, and activates only after validation and a successful ready handshake. A failed candidate rolls back without deleting the user's module-scoped projects.

Report suspected vulnerabilities privately to the Lumina Studio maintainers. Do not attach proprietary pattern charts, credentials, local paths, or private material archives to a public issue.

