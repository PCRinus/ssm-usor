# Signer

The pyHanko service behind `SignerService` (ADR 023): prepares a sheet's signature fields,
fills text fields, signs in two phases and validates. What it does and why is in
[docs/pdf.md](../../../docs/pdf.md#signer).

Python 3.12 or newer. From `apps/pdf`:

```sh
pnpm setup:signer   # python3 -m venv signer/.venv, then the pinned dependencies and the test tools
pnpm test:signer    # pytest
signer/.venv/bin/ruff format signer && signer/.venv/bin/ruff check signer
```

The tests embed Liberation Sans, rescaled to 1,000 units per em on the way: from `SIGNER_FONT`
when it is set, else Debian's copy, else the one `pnpm install` brings with the editor's fonts.

Run the image on its own with `docker build -t signer . && docker run -p 127.0.0.1:3301:3301 signer`,
or beside Gotenberg with `pnpm dev:pdf` at the root.
