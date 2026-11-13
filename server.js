const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const ROOT = __dirname;
const CAPTURES_DIR = path.join(ROOT, "captures");
const FIRMWARE_DIR = path.join(ROOT, "firmware");

if (!fs.existsSync(CAPTURES_DIR)) {
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}
if (!fs.existsSync(FIRMWARE_DIR)) {
  fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
}

function buildQuerySn(sixteenCode) {
  const clean = String(sixteenCode).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (clean.length !== 32) return clean;
  // BleDataSourceImpl.getNewVersion replaces FW version (chars 22..26) with "0001"
  // and recomputes two's complement checksum in byte 15 (chars 30..32)
  const prefix30 = clean.slice(0, 22) + "0001" + clean.slice(26, 30);
  let sum = 0;
  for (let i = 0; i < 30; i += 2) {
    sum += parseInt(prefix30.slice(i, i + 2), 16);
  }
  const chk = ((0x100 - (sum & 0xff)) & 0xff).toString(16).padStart(2, "0").toUpperCase();
  return prefix30 + chk;
}

function httpGetBuffer(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(urlStr, { headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
  });
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bin": "application/octet-stream"
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/capture") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const latestPath = path.join(CAPTURES_DIR, "latest-session.json");
        fs.writeFileSync(latestPath, JSON.stringify(data.sessionRecord, null, 2), "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/query-firmware") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { sixteenCode } = JSON.parse(body);
        const querySn = buildQuerySn(sixteenCode);
        const results = [];
        for (const snCandidate of [querySn, sixteenCode]) {
          for (const suffix of ["", "&test=1"]) {
            const url = `http://upgrade.skyrc.com/?SN=${snCandidate}${suffix}`;
            const resp = await httpGetBuffer(url, { SN: snCandidate });
            const text = resp.body.toString("utf8");
            let parsed = null;
            try {
              parsed = JSON.parse(text);
            } catch (_) {}
            results.push({ url, snCandidate, text, parsed });
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].verUrl) {
              const verUrl = parsed[0].verUrl;
              const binResp = await httpGetBuffer(verUrl);
              const fileName = path.basename(verUrl.split("?")[0]) || `nc3000pro-${Date.now()}.bin`;
              const savedPath = path.join(FIRMWARE_DIR, fileName);
              fs.writeFileSync(savedPath, binResp.body);
              results[results.length - 1].downloadedFile = `firmware/${fileName}`;
              results[results.length - 1].downloadedBytes = binResp.body.length;
            }
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sixteenCode, querySn, results }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";

  const filePath = path.normalize(path.join(ROOT, reqPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    });
    res.end(content);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SkyRC NC3000 Pro BLE Workbench running at http://localhost:${PORT}`);
});
