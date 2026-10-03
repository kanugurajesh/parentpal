// Exposes the local API (PORT, default 4000) on your free ngrok static domain, so a phone running
// Expo Go over `expo start --tunnel` can reach it from anywhere. Needs NGROK_AUTHTOKEN and
// NGROK_DOMAIN in the root .env (https://dashboard.ngrok.com/get-started/your-authtoken and
// https://dashboard.ngrok.com/domains).
import ngrok from "@ngrok/ngrok";

const { NGROK_AUTHTOKEN, NGROK_DOMAIN, PORT = "4000" } = process.env;
if (!NGROK_AUTHTOKEN || !NGROK_DOMAIN) {
  console.error("Set NGROK_AUTHTOKEN and NGROK_DOMAIN in the root .env first.");
  process.exit(1);
}

const listener = await ngrok.forward({
  addr: Number(PORT),
  authtoken: NGROK_AUTHTOKEN,
  domain: NGROK_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, ""),
});
console.log(`API tunnel: ${listener.url()} -> http://localhost:${PORT}`);

// Keep the process alive; ngrok closes the tunnel on exit.
setInterval(() => {}, 1 << 30);
