# Gig Invoice Generator

An invoice tool for two identities — **George Gadd** (Singer/Songwriter or E-Learning Design) and **TV Party Tonight!** — with their own designs, PDF export, one-click emailing, saved clients, invoice history, and travel/agent-fee/misc line items.

```
index.html
css/styles.css
js/firebase-config.js   <- you fill this in (step 5 below)
js/storage.js
js/app.js
assets/george-gadd-logo.png
firestore.rules         <- you paste this into Firebase (step 4 below)
```

## Running it

**On GitHub Pages** (recommended — this is what the persistence setup below assumes):
1. Push all these files to a GitHub repo, keeping them at the repo root (don't nest them in a subfolder).
2. Repo → Settings → Pages → Deploy from a branch → `main`, `/ (root)`.
3. Live at `https://<username>.github.io/<repo>/`.

**Locally:** you can open `index.html` directly by double-clicking it, but Firestore's saved-login persistence and some browser security rules behave better over `http(s)://` than `file://`. If you want to test locally, run a tiny local server from the folder (e.g. `python3 -m http.server`) and open `http://localhost:8000`.

## Setting up persistence (Firebase)

Your data — settings, saved clients, invoice history — needs somewhere to live that isn't tied to one browser. This uses [Firebase](https://firebase.google.com) (Google's free app backend): Authentication for a simple email/password sign-in, and Firestore as the database. Free tier, no credit card required, and nowhere near enough usage from one person's invoices to ever hit a limit.

1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Add project** → name it anything (e.g. "gig-invoices") → you can skip Google Analytics → **Create project**.
2. Left sidebar → **Build → Authentication** → **Get started** → **Sign-in method** tab → enable **Email/Password** → **Save**.
3. Left sidebar → **Build → Firestore Database** → **Create database** → pick a location near you → start in **production mode** → **Enable**.
4. Still in Firestore, open the **Rules** tab → replace the contents with everything in `firestore.rules` from this repo → **Publish**.
5. **Project settings** (gear icon, top left) → **General** tab → scroll to **Your apps** → click the web icon `</>` → give it any nickname → register. You'll be shown a `firebaseConfig` object — copy those values into `js/firebase-config.js` in this repo, replacing the placeholders.
6. Commit and push. Reload your site — you'll see a sign-in screen. Click **Create account** and pick any email/password you like (this is separate from your Google login, it's just for this app). You're in, and your data now lives in your own private Firestore database.

From then on, signing in from any browser or device (even after clearing history) gets you back to the same data.

## Where things are saved

- **Inside a Claude.ai artifact:** uses Claude's built-in `window.storage`, tied to your Claude.ai account — no sign-in needed, this bit doesn't change.
- **Everywhere else (GitHub Pages, local, etc.):** uses the Firebase Authentication + Firestore setup above. If `js/firebase-config.js` still has the placeholder values, the app will show a short notice instead of the sign-in screen, telling you to finish setup.

`js/storage.js` is the only file that knows about either of these — everything else in `js/app.js` just calls `AppStorage.get(...)` / `AppStorage.set(...)` without caring where the data actually lives.

## Email invoice

The "Email invoice" button calls Claude's API with a connected Gmail tool to send the invoice directly. **This only works inside a Claude.ai artifact**, where that call is authenticated automatically.

Outside Claude.ai (GitHub Pages, etc.), that call fails harmlessly, and the button automatically falls back to opening a pre-filled drafted email in your default mail app instead — so the feature still works, just with one manual click to send. No setup needed for this fallback.

## Customising

- **Day-to-day details** (address, bank details, invoice prefixes, tagline, currency, payment terms, default agent fee) — all editable in-app via "⚙ Your details", no code changes needed.
- **Deeper changes** (colours, wording, a third identity, a different logo) — edit `css/styles.css` and `js/app.js`. The George Gadd logo is `assets/george-gadd-logo.png`; swap the file (keep the same name, or update the path in `js/app.js`'s `gaddTemplate` function).

## Accessibility

Both invoice themes are checked against WCAG AA contrast (4.5:1 minimum for body text) — see the colour values in `css/styles.css`.

## Security note

`js/firebase-config.js` is safe to commit to a public repo — Firebase's client config values aren't secret; access control is enforced by `firestore.rules` instead (only the signed-in user matching a document's ID can read or write it). Don't use anything else (like a personal access token) to write to this repo from client-side code in the browser — that genuinely would be exposed to anyone who views the page source.

---
Personal-use tool — adapt freely.
