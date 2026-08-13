# Security policy

Do not open a public issue for a vulnerability that could weaken the Workshop
sandbox, permission model, package validation, image or project-data
isolation, release integrity, or converter handoff.

Use GitHub's private vulnerability reporting for this repository. Include the
affected module, SDK, and Workshop API versions, a minimal reproduction, and
the security boundary that is crossed. Do not include user projects, pattern
images, tokens, local filesystem paths, private material archives, or private
Lumina source.

The runtime threat model and intentionally unavailable capabilities are
documented in [docs/security.md](docs/security.md).
