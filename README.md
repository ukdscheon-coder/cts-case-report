# CTS Case Report

Free, no-login mobile app (installable PWA) for Beckman Coulter CTS customer case reports.

- Hospital, Instance Number, Serial Number, photos, notes
- On-device text scan (OCR, no AI tokens, works offline)
- One-tap call to Beckman Coulter CTS; call start and case-number time logged automatically
- Send by Email, WhatsApp, SMS or any chat app: a report link shows the full report and every photo to anyone, no login
- Share PDF + photos through the phone's share menu

## Free hosting
- **Live app:** https://cts-case-report.uk-dscheon.workers.dev
- **Cloudflare Workers** (main): app + report links (KV, 30-day expiry). `wrangler deploy`
- **Vercel** (mirror): static app; report links are served by the Cloudflare worker.
- Reports and photos stay on the phone until the user chooses to share a link.

## Install on a phone
- iPhone: open the link in Safari → Share → Add to Home Screen
- Android: open in Chrome → Install app
