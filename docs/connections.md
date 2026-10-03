> Reference only. These integrations are disabled in the public static demo. Do not enter real account data into the demo.

# Gerardo OS connections

Gerardo OS is deployed from GitHub to a Cloudflare Worker. The Worker is the
only place that normally fetches the private Canvas calendar feed, handles
Plaid access tokens, and accesses the shared D1 workspace. Browser storage
contains a temporary offline workspace and a short-lived Spotify PKCE session;
it never contains a bank login or Plaid secret.

## Cloudflare server secrets

Add these values in **Workers & Pages → gerardo-os → Settings → Variables and
Secrets**. Choose **Encrypt** / **Secret** for every value except the name of
the variable itself.

| Name | Value | Purpose |
| --- | --- | --- |
| `INTEGRATION_ENCRYPTION_KEY` | 64 hexadecimal characters | AES-GCM key used to encrypt Plaid integration records in D1 |
| `PLAID_CLIENT_ID` | Your Plaid client ID | Server-to-server Plaid requests |
| `PLAID_SECRET` | Your Plaid secret for the same environment | Server-to-server Plaid requests |
| `PLAID_ENV` | `production` or `sandbox` | Prevents mixing Plaid environments |

Generate the encryption key on your own computer and paste it directly into
Cloudflare:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not put these values in GitHub, Customize, browser developer tools, or a
support message. The existing D1 table is reused with an `integration:v1:`
owner key; no manual migration is needed. Cloudflare Access still protects
all routes, and the Worker verifies the signed Access JWT before any API route
runs.

## Canvas

The app uses the private **Calendar Feed** only. In Canvas open
**Calendar → Calendar Feed**, copy the `.ics` URL, and paste it into
**Academics → Canvas settings**. It imports dated and all-day assignments and
events from the calendars you have enabled and keeps dates in the selected time
zone.

Gerardo OS first tries to refresh the feed through the Worker. UH currently
returns HTTP 406 to Cloudflare Worker subrequests, including through UH's
`uh.instructure.com` tenant address. When that happens, Gerardo OS turns off
the failing automatic refresh and offers a private browser-only fallback:

1. Select **Open/download latest .ics**.
2. Save the calendar file if the browser opens it as text.
3. Select **Import downloaded .ics** and choose the file.

The fallback reads the file locally in the browser and merges it through the
same parser, so the private feed contents are not sent through the blocked
Cloudflare-to-UH request. Repeat those steps whenever you want fresh Canvas
dates. No Canvas API token is needed.

Canvas calendar feeds contain up to 1,000 items and do not include Canvas To Do
items, grades, submissions, announcements, modules, or course materials. They
also cannot guarantee a separate course entry when that course has no calendar
events. This is a Canvas feed limitation, not a dashboard permission issue.
Gerardo OS does not ask for or store a Canvas password or personal API token,
and it never submits or changes coursework. The private feed URL is part of the
Access-protected workspace; do not share it publicly. If UH later offers an
approved student OAuth connection, it can be added separately without putting
a token in the browser.

## Spotify

Spotify uses the browser-only Authorization Code with PKCE flow. Create a
Spotify developer app, add the exact deployed URL with its trailing slash as a
redirect URI (for example `https://your-private-workspace.example/`), and
paste the public Client ID into **Customize**. Never use or paste a client
secret; this app does not need one.

The account needs Spotify Premium for playback-control endpoints, and the
developer app may need your account listed as an allowed user. Open Spotify on
the PC or tablet and start a song before using the controls; Spotify controls
an active Spotify device rather than playing audio through the Worker. The
player stores a renewable token only in that browser tab's session storage.
Connect each device/browser separately. **Study mode** selects a saved focus
playlist and the split player shows the current song, progress, pause, seek,
previous, and next controls.

## Plaid banking

Plaid must be configured on the Worker before the **Connect bank** button is
enabled. Create a Plaid application, request **Transactions** production
access, and add the exact deployed URL plus trailing slash as the Link OAuth
redirect URI. Put the four server values above into Cloudflare and redeploy or
retry the latest GitHub build.

Plaid Link then lets you connect multiple institutions. Gerardo OS stores only
the encrypted Plaid access token, institution label, account masks, balances,
and up to 180 days of transaction data. It never stores online-banking
passwords, full account numbers, or PINs. Transactions are refreshed when the
Finance tab opens, when the page returns to the foreground, and every 15
minutes while open. Plaid and each bank control how current the returned data
is; this is not a real-time ledger.

Keep the same `INTEGRATION_ENCRYPTION_KEY` across deployments. Replacing it
makes the existing encrypted bank record unreadable. If Finance temporarily
fails to load, the app keeps the last loaded bank view on screen and offers a
Retry button. It also reports missing Cloudflare variable names and detects
when a saved connection belongs to the other Plaid environment, so a production
connection is not mistaken for a deleted account.

Use `sandbox` while testing with Plaid test institutions. Sandbox data is not
your real bank data. Switch all three Plaid values (`PLAID_CLIENT_ID`,
`PLAID_SECRET`, and `PLAID_ENV`) together when production access is approved.
Plaid may require a paid plan, production review, or institution-specific
coverage before real accounts can be connected.

## Recovery and ownership

The app derives one owner key from the Cloudflare Access identity, so another
Access user cannot read your Canvas, Plaid, or workspace records. If an
integration is disconnected, its server token and cached records are removed;
the local workspace's manually entered tasks and budgets remain. If a device
was offline, use **Retry sync** after it is online. Workspace edits use the
existing last-successful-save behavior; Plaid credentials use a separate
encrypted record. The Canvas feed URL is stored with the Access-protected
workspace so the automatic route can be retried if UH stops blocking it.

### Official references

* [Spotify PKCE authorization](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
* [Spotify token refresh](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens)
* [Spotify playback control](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
* [Plaid Link](https://plaid.com/docs/link/web/)
* [Plaid Transactions](https://plaid.com/docs/transactions/add-to-app/)
* [Plaid sandbox and production environments](https://plaid.com/docs/sandbox/)
