const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const INDEX_PATH = path.join(ROOT, "index.html");
const APP_PATH = path.join(ROOT, "app.js");

// 1. Read package.json
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const oldVersion = pkg.version || "1.2.0";
const parts = oldVersion.split(".").map(Number);
parts[2] = (parts[2] || 0) + 1; // Increment patch
const newVersion = parts.join(".");
const buildNum = (pkg.buildNumber || 24) + 1;

const now = new Date();
const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
const buildMetaStr = `Build ${buildNum} (${dateStr})`;

console.log(`[Version Bumper] Bumping version: ${oldVersion} -> ${newVersion} (Build ${buildNum})`);

// 2. Update package.json
pkg.version = newVersion;
pkg.buildNumber = buildNum;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");

// 3. Update manifest.json
if (fs.existsSync(MANIFEST_PATH)) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  manifest.version = newVersion;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

// 4. Update app.js
if (fs.existsSync(APP_PATH)) {
  let appJs = fs.readFileSync(APP_PATH, "utf8");
  appJs = appJs.replace(
    /const APP_VERSION = "[^"]+";/,
    `const APP_VERSION = "v${newVersion}";`
  );
  appJs = appJs.replace(
    /const APP_BUILD_DATE = "[^"]+";/,
    `const APP_BUILD_DATE = "${buildMetaStr}";`
  );
  fs.writeFileSync(APP_PATH, appJs, "utf8");
}

// 5. Update index.html
if (fs.existsSync(INDEX_PATH)) {
  let indexHtml = fs.readFileSync(INDEX_PATH, "utf8");
  // Update cache-busters
  indexHtml = indexHtml.replace(/styles\.css\?v=[^"'\s]+/g, `styles.css?v=${newVersion}`);
  indexHtml = indexHtml.replace(/app\.js\?v=[^"'\s]+/g, `app.js?v=${newVersion}`);
  // Update badges & spans
  indexHtml = indexHtml.replace(
    /(<span[^>]*id="siteFooterVersion"[^>]*>)[^<]*(<\/span>)/g,
    `$1v${newVersion}$2`
  );
  indexHtml = indexHtml.replace(
    /(<span[^>]*id="drawerVersionHeader"[^>]*>)[^<]*(<\/span>)/g,
    `$1v${newVersion}$2`
  );
  indexHtml = indexHtml.replace(
    /(<span[^>]*id="appVersionBadge"[^>]*>)[^<]*(<\/span>)/g,
    `$1v${newVersion}$2`
  );
  indexHtml = indexHtml.replace(
    /(<span[^>]*id="appBuildMeta"[^>]*>)[^<]*(<\/span>)/g,
    `$1${buildMetaStr}$2`
  );
  indexHtml = indexHtml.replace(
    /(<strong[^>]*id="drawerVersionFooter"[^>]*>)[^<]*(<\/strong>)/g,
    `$1v${newVersion}$2`
  );
  fs.writeFileSync(INDEX_PATH, indexHtml, "utf8");
}

console.log(`[Version Bumper] Successfully updated package.json, manifest.json, app.js, and index.html to v${newVersion} (${buildMetaStr})`);
