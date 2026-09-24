# LinkedIn Contact Extractor (Chrome extension, BYOK)

Enrich the LinkedIn profile you are viewing via your own Apollo / Hunter API key. Keys stay in `chrome.storage.local` only.

## First-time setup
1. `chrome://extensions` → Developer mode → Load unpacked → select `linkedin-email-extractor`.
2. Open extension **Settings** (popup → Settings, or `chrome://extensions` → Details → Extension options).
3. Select primary provider (Apollo/Hunter), paste your key (no card needed for free tiers), Test, Save. Optionally enable fallback.
4. Open `linkedin.com/in/...` → click extension → Find Contact.

## What it does
- Detects `/in/` profile, normalizes URL (strips query/hash), extracts name/title/company/URL (FR-01/02/03).
- Shows visible emails/phones from page + Contact Info modal (free, no key).
- Find Contact → provider manager → primary (+ fallback if empty) → normalized email/phone/status → Copy / Copy All.
- Free guess (no key): GitHub + website + MX pattern guess, clearly labeled unverified.
- Credit warning before paid calls; fallback only on empty/error (never double-charges on success).

## Structure (SRS §21)
```
manifest.json
background/service-worker.js
content/linkedin.js
popup/popup.html popup.js popup.css
options/options.html options.js options.css
providers/provider-manager.js apollo.js hunter.js freeguess.js
utils/storage.js clipboard.js normalization.js
```

## Test (MVP acceptance)
- Non-profile page → "No LinkedIn profile detected."
- Settings → Test Apollo/Hunter → valid/invalid messages.
- Save/update/remove keys locally.
- Find Contact with key → email/phone/status or "Not available from provider".
- Copy email/phone/all works.
