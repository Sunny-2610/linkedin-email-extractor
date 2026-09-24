# LinkedIn Email Extractor (Chrome extension)

Finds public contact emails on the LinkedIn profile you are currently viewing and
lets you copy them with one click.

## How it works

1. You open a profile (`linkedin.com/in/...`) while logged in to LinkedIn.
2. Click the extension icon (or the toolbar button) — the popup opens.
3. It scans the visible profile (including the profile's `Contact info` section)
   for `mailto:` links and plain-text email addresses, including lightly
   obfuscated ones like `name [at] domain [dot] com`.
4. Found emails are listed with per-email **Copy** buttons and a **Copy all**.

## Load the extension (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (toggle top right).
3. Click **Load unpacked** and select this `linkedin-email-extractor` folder.
4. Pin the extension to the toolbar for easy access.

## Test

- Profile with a public email -> the popup should list it.
- Profile without any email -> you should see "No email found."
- Open a non-profile page -> the popup tells you to open a profile first.

## Files

| File          | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `manifest.json` | MV3 manifest: permissions, action, content script |
| `content.js`  | Scans the profile DOM when the popup asks it to     |
| `popup.html` / `popup.css` | Popup UI                                |
| `popup.js`    | Triggers the scan, renders results, copy helpers    |

No icons are shipped yet (`chrome://extensions` shows a placeholder icon). Add
16/32/48/128px PNGs under `icons/` and reference them in `manifest.json` when
you have brand artwork.

## Notes

- Reads only the page you have open — no background crawling, so it stays within
  LinkedIn's terms of service.
- Only use emails you find for outreach where the member made them public or you
  have a legitimate business reason (respect GDPR/can-spam).