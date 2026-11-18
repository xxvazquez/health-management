// One-time helper: signs in to Google and prints the refresh token that
// backup.yml uses to upload to Drive. Run it on your own computer:
//
//   GOOGLE_DRIVE_CLIENT_ID=… GOOGLE_DRIVE_CLIENT_SECRET=… node .github/scripts/drive-token.mjs
//
// The client must be a "Desktop app" OAuth client, and the consent screen
// must be "In production" — a "Testing" app's refresh tokens expire after
// seven days.

import { createServer } from "node:http";

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET first.");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const code = url.searchParams.get("code");
  if (!code) {
    res.end(`Sign-in failed: ${url.searchParams.get("error") ?? "no code"}`);
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const json = await tokenRes.json();
  res.end(json.refresh_token ? "Done — you can close this tab and go back to the terminal." : "No refresh token came back; see the terminal.");
  if (json.refresh_token) console.log(`\nGOOGLE_DRIVE_REFRESH_TOKEN:\n${json.refresh_token}\n`);
  else console.error(json);
  server.close();
});

let redirectUri = "";
server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  }).toString();
  console.log(`Open this link and sign in with the Google account that should hold the backups:\n\n${auth}\n`);
});
