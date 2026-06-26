# Windows Code Signing — setup guide

**Why this is Gate 0.** The desktop installer is currently **unsigned**, so Windows shows a blue **SmartScreen "unrecognized app"** warning on first run. That warning lands at the worst possible moment — right when a new user is about to connect their bank — and it kills more of the funnel than any competitor. Signing (with reputation) removes it. This is the single highest-leverage trust fix.

> The Play Store build is already signed by Google Play app signing — this doc is **only** the Windows desktop (`desktop-bar`, Tauri) installer. macOS notarization is a separate step if/when you ship a Mac build.

---

## Pick a certificate (owner action — this is the part only you can buy)

| Option | Cost | Kills SmartScreen | Notes |
|---|---|---|---|
| **Azure Trusted Signing** (recommended) | **~$10/mo** | **Fast** (Microsoft-validated identity builds reputation quickly) | Cheapest legitimate path. No hardware token. Eligibility: a business with 3+ yrs verifiable history, **or** individual validation. Sign in the cloud. |
| **EV Code Signing cert** (DigiCert/Sectigo) | ~$300–500/yr | **Instant** | Immediate SmartScreen reputation, but requires a hardware token or cloud HSM (FIPS). Most friction to set up. |
| **OV (standard) cert** | ~$200–300/yr | **Slow** | Signs the binary, but SmartScreen reputation only builds up over many downloads — the warning persists at first. Cheapest cert, weakest immediate effect. |

**Recommendation:** **Azure Trusted Signing** if you're eligible (best cost + fast reputation). If individual validation is a hurdle, an **EV cert** for instant reputation. Avoid OV — it doesn't solve the warning quickly, which is the whole point.

---

## Wire it into the build (do this once you have the cert)

⚠️ **Don't add signing config to `tauri.conf.json` until the cert exists** — a bad thumbprint/command fails the build. Keep the committed config clean; add the block below only when ready (or inject via CI env vars).

### A) Azure Trusted Signing
Install the signer (`cargo install trusted-signing-cli` or the `dotnet sign` tool), then add to `src-tauri/tauri.conf.json` under `bundle`:
```jsonc
"windows": {
  "signCommand": "trusted-signing-cli -e https://<REGION>.codesigning.azure.net -a <ACCOUNT_NAME> -c <CERT_PROFILE_NAME> %1"
}
```
Tauri passes each artifact path as `%1`. Authenticate via Azure env vars (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) in your build environment — never commit them.

### B) Cert in the Windows cert store (EV/OV token or imported)
```jsonc
"windows": {
  "certificateThumbprint": "<THUMBPRINT_NO_SPACES>",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```
Get the thumbprint from `certmgr.msc` (or `Get-ChildItem Cert:\CurrentUser\My`), strip spaces.

> Confirm the exact field names against the current Tauri v2 bundler docs before committing — the schema occasionally changes (`signCommand` may be a string with `%1` or a `{ cmd, args }` object depending on version).

### Verify a signed build
```powershell
signtool verify /pa /v "path\to\Persistence_x64-setup.exe"
```
Then download it on a clean machine and confirm **no SmartScreen warning** (reputation may take a few signed releases on OV; instant on EV / Trusted Signing).

---

## Checklist
- [ ] Decide: Azure Trusted Signing vs EV cert
- [ ] Purchase / enroll (owner)
- [ ] Set signing env vars in the build environment (never commit secrets)
- [ ] Add the `bundle.windows` block above
- [ ] Build, `signtool verify`, test on a clean machine
- [ ] Cut a signed release; confirm SmartScreen is gone
