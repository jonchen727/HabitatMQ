/**
 * Custom Node.js server for Enclosure.
 *
 * Wraps Next.js production server and adds WebSocket upgrade proxying
 * for go2rtc MSE streams. This allows go2rtc WebSocket connections to
 * flow through the same port (3003) as HTTP traffic, making them
 * accessible through Cloudflare Tunnel without exposing port 1984.
 *
 * Architecture:
 *   Browser → wss://your-domain.com/api/streams/go2rtc/ws?src=cam-xxx
 *          → CF Tunnel → your-host:3003 (this server)
 *          → Raw TCP proxy → localhost:1984/api/ws?src=cam-xxx (go2rtc)
 *
 * Usage:
 *   NODE_ENV=production node server.js
 *
 * The systemd service should use this instead of `next start`.
 */

const { createServer } = require("node:http");
const { createConnection } = require("node:net");
const { parse } = require("node:url");
const next = require("next");

const port = parseInt(process.env.PORT || "3003", 10);
const GO2RTC_HOST = process.env.GO2RTC_HOST || "localhost";
const GO2RTC_PORT = parseInt(process.env.GO2RTC_PORT || "1984", 10);

const app = next({ dev: false, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url || "/", true));
  });

  // ── WebSocket upgrade proxy ────────────────────────────────────────────
  // Intercepts WS upgrade requests for /api/streams/go2rtc/ws and proxies
  // them to go2rtc's native WebSocket API via raw TCP socket piping.
  // This is a zero-dependency approach — no ws or http-proxy needed.
  server.on("upgrade", (req, clientSocket, head) => {
    const parsed = parse(req.url || "/", false);
    const pathname = parsed.pathname || "";

    if (pathname === "/api/streams/go2rtc/ws") {
      // Proxy WebSocket upgrade to go2rtc
      const targetSocket = createConnection(
        { host: GO2RTC_HOST, port: GO2RTC_PORT },
        () => {
          // Reconstruct the HTTP upgrade request for go2rtc
          const targetPath = `/api/ws${parsed.search || ""}`;
          const lines = [
            `GET ${targetPath} HTTP/1.1`,
            `Host: ${GO2RTC_HOST}:${GO2RTC_PORT}`,
            `Upgrade: websocket`,
            `Connection: Upgrade`,
            `Sec-WebSocket-Key: ${req.headers["sec-websocket-key"]}`,
            `Sec-WebSocket-Version: ${req.headers["sec-websocket-version"]}`,
          ];
          if (req.headers["sec-websocket-protocol"]) {
            lines.push(
              `Sec-WebSocket-Protocol: ${req.headers["sec-websocket-protocol"]}`
            );
          }
          if (req.headers["sec-websocket-extensions"]) {
            lines.push(
              `Sec-WebSocket-Extensions: ${req.headers["sec-websocket-extensions"]}`
            );
          }
          lines.push("Origin: *", "", "");

          targetSocket.write(lines.join("\r\n"));
          if (head.length > 0) targetSocket.write(head);

          // Bidirectional pipe — zero-copy streaming
          targetSocket.pipe(clientSocket);
          clientSocket.pipe(targetSocket);
        }
      );

      targetSocket.on("error", (err) => {
        console.error("[ws-proxy] go2rtc connection error:", err.message);
        clientSocket.destroy();
      });

      clientSocket.on("error", () => targetSocket.destroy());
      clientSocket.on("close", () => targetSocket.destroy());
      targetSocket.on("close", () => clientSocket.destroy());
    } else {
      // No other WebSocket upgrades expected in production — reject
      clientSocket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      clientSocket.destroy();
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`> Enclosure ready on http://0.0.0.0:${port}`);
    console.log(`> go2rtc WS proxy: /api/streams/go2rtc/ws → ${GO2RTC_HOST}:${GO2RTC_PORT}`);
  });
});
