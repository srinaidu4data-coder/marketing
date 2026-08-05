# Agent rules — Role Forge (this repo)

## Production host (mandatory)

- **This product is Role Forge**, Vercel project **`roleforge`**.
- **Production URL:** `https://roleforge-tau.vercel.app`
- Optional alias only if it resolves to the same Role Forge project: `https://roleforge.vercel.app`

## Forbidden — never use as this app

- Do **not** use, probe, health-check, document, or treat as production any host matching:
  - `yantra-mvp-gray.vercel.app`
  - any other **Yantra** deployment URL
- Those are **not** Role Forge. Using them for deploy verification is a **serious product error**.

## Deploy / health checks

- Prefer: `https://roleforge-tau.vercel.app/api/health` and GitHub/Vercel status for project **roleforge**.
- Never default “prod” to a Yantra URL.
