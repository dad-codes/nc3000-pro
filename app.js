// SkyRC NC3000 Pro — BLE Reverse Engineering & Firmware Workbench
const APP_VERSION = "v1.2.20";
const APP_BUILD_DATE = "Build 44 (2026.11.13)";
window.APP_VERSION = APP_VERSION;
window.APP_BUILD_DATE = APP_BUILD_DATE;

const KNOWN_UUID_NAMES = {
  "00001800-0000-1000-8000-00805f9b34fb": "Generic Access (0x1800)",
  "00001801-0000-1000-8000-00805f9b34fb": "Generic Attribute (0x1801)",
  "0000180a-0000-1000-8000-00805f9b34fb": "Device Information (0x180A)",
  "0000180f-0000-1000-8000-00805f9b34fb": "Battery Service (0x180F)",
  "0000ffe0-0000-1000-8000-00805f9b34fb": "SkyRC / UART Stream Service (0xFFE0)",
  "0000ffe1-0000-1000-8000-00805f9b34fb": "SkyRC / UART TX/RX (0xFFE1)",
  "0000ffe2-0000-1000-8000-00805f9b34fb": "SkyRC / UART Aux (0xFFE2)",
  "0000fff0-0000-1000-8000-00805f9b34fb": "Vendor Serial Service (0xFFF0)",
  "0000fff1-0000-1000-8000-00805f9b34fb": "Vendor Serial Char 1 (0xFFF1)",
  "0000fff2-0000-1000-8000-00805f9b34fb": "Vendor Serial Char 2 (0xFFF2)",
  "0000fe59-0000-1000-8000-00805f9b34fb": "Nordic Secure DFU (0xFE59)",
  "00002a00-0000-1000-8000-00805f9b34fb": "Device Name (0x2A00)",
  "00002a23-0000-1000-8000-00805f9b34fb": "System ID (0x2A23)",
  "00002a24-0000-1000-8000-00805f9b34fb": "Model Number (0x2A24)",
  "00002a25-0000-1000-8000-00805f9b34fb": "Serial Number (0x2A25)",
  "00002a26-0000-1000-8000-00805f9b34fb": "Firmware Revision (0x2A26)",
  "00002a27-0000-1000-8000-00805f9b34fb": "Hardware Revision (0x2A27)",
  "00002a28-0000-1000-8000-00805f9b34fb": "Software Revision (0x2A28)",
  "00002a29-0000-1000-8000-00805f9b34fb": "Manufacturer Name (0x2A29)",
  "00002a50-0000-1000-8000-00805f9b34fb": "PnP ID (0x2A50)",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e": "Nordic UART Service (NUS)",
  "6e400002-b5a3-f393-e0a9-e50e24dcca9e": "Nordic UART TX",
  "6e400003-b5a3-f393-e0a9-e50e24dcca9e": "Nordic UART RX",
  "00010203-0405-0607-0809-0a0b0c0d1912": "Telink BLE OTA Service",
  "f000ffc0-0451-4000-b000-000000000000": "TI OAD Firmware Service",
  "1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0": "Silicon Labs OTA Service",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455": "Microchip / ISSC Transparent UART"
};

const SKYRC_CMD_NAMES = {
  0x01: "Bootloader / Handshake (0x01)",
  0x07: "Verify Password / Auth (0x07)",
  0x11: "Take Charge Control / Start (0x11)",
  0x13: "Stop Operation (0x13)",
  0x55: "Take Charge / Machine Status (0x55)",
  0x57: "getDeviceInfo — SKU / SN / FW & HW Version (0x57)",
  0x5a: "BLE / System Info (0x5A)",
  0x5f: "Channel Telemetry Stream (0x5F)",
  0x60: "Upgrade Prepare (0x60)",
  0x61: "Upgrading Chunk (0x61)",
  0x62: "Upgrade End / Checksum (0x62)",
  0x65: "checkNewVer / Boot Info (0x65)",
  0x66: "checkBootVer (0x66)",
  0x80: "NC3000 Start / Control (0x80)",
  0x91: "getNc300Data Slot Telemetry (0x91)",
  0x94: "settingParametersForNC3000 Start/Config (0x94)",
  0x96: "querySystemSetting (0x96)",
  0x9a: "getNc228Data All Slots Telemetry (0x9A)",
  0xfe: "stopNc3000Charge Slot Stop (0xFE)"
};

const SKYRC_SKU_NAMES = {
  "313030323039": "SkyRC NC3000 Pro (SK-100209)",
  "313030323238": "SkyRC NC2500 Pro / NC228 (SK-100228)",
  "313030313831": "SkyRC NC2200 (SK-100181)",
  "313030313832": "SkyRC T1000 / NC2200 (SK-100182)",
  "313030323134": "SkyRC MC5000 (SK-100214)"
};

// State
let bleDevice = null;
let gattServer = null;
let characteristicsMap = new Map(); // key: uuid -> { char, serviceUuid, props }
let customServiceUuids = [];
let binaryDumpChunks = [];
let binaryDumpTotalBytes = 0;

let scanState = {
  running: false,
  currentOpcode: null,
  timer: null,
  hits: new Map()
};

const sessionRecord = {
  startedAt: new Date().toISOString(),
  device: {},
  deviceInfo: {},
  services: [],
  packets: []
};

// Localhost Environment Detection for Developer Workbench Tools Gating
const IS_LOCALHOST =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]");

if (typeof document !== "undefined" && document.body) {
  if (IS_LOCALHOST) {
    document.body.classList.add("is-localhost");
  } else {
    document.body.classList.remove("is-localhost");
  }
}

// UI Elements
const statusIndicator = document.getElementById("keeperGlobalStatus") || document.getElementById("statusIndicator");
const statusText = document.getElementById("keeperStatusText") || document.getElementById("statusText");
const acceptAllDevicesEl = document.getElementById("acceptAllDevices");
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const btnExportSession = document.getElementById("btnExportSession");
const btnReadAll = document.getElementById("btnReadAll");
const gattListEl = document.getElementById("gattList");
const txCharSelect = document.getElementById("txCharSelect");
const writeModeSelect = document.getElementById("writeModeSelect");
const rawHexInput = document.getElementById("rawHexInput");
const btnWrapSkyrc = document.getElementById("btnWrapSkyrc");
const btnSendHex = document.getElementById("btnSendHex");
const packetLogEl = document.getElementById("packetLog");
const envWarningEl = document.getElementById("envWarning");

// Build exhaustive optionalServices list so Chrome Web Bluetooth grants access to vendor services
function buildOptionalServices() {
  const list = new Set([
    "generic_access",
    "generic_attribute",
    "device_information",
    "battery_service",
    "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    "00001530-1212-efde-1523-785feabcd123",
    "f000ffc0-0451-4000-b000-000000000000",
    "1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0",
    "00010203-0405-0607-0809-0a0b0c0d1912",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    "0000fee0-0000-1000-8000-00805f9b34fb",
    "0000fee7-0000-1000-8000-00805f9b34fb",
    ...customServiceUuids
  ]);

  // Add 16-bit vendor ranges commonly used by SkyRC / WCH / Telink / TI / Nordic / Beken BLE chips
  const ranges = [
    [0x1800, 0x183f],
    [0xfe00, 0xffff],
    [0xfd00, 0xfdff],
    [0xf000, 0xf0ff],
    [0xae00, 0xaeff],
    [0xa000, 0xa0ff],
    [0xffe0, 0xffff]
  ];
  for (const [start, end] of ranges) {
    for (let u = start; u <= end; u++) {
      list.add(u);
    }
  }
  return Array.from(list);
}

function formatUuid(uuid) {
  const lower = String(uuid).toLowerCase();
  if (KNOWN_UUID_NAMES[lower]) {
    return `${KNOWN_UUID_NAMES[lower]}`;
  }
  if (lower.endsWith("-0000-1000-8000-00805f9b34fb")) {
    const shortHex = lower.slice(4, 8).toUpperCase();
    return `0x${shortHex} (${lower})`;
  }
  return lower;
}

function shortUuid(uuid) {
  const lower = String(uuid).toLowerCase();
  if (lower.endsWith("-0000-1000-8000-00805f9b34fb")) {
    return "0x" + lower.slice(4, 8).toUpperCase();
  }
  return lower.slice(0, 8) + "…";
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

function bytesToAscii(bytes) {
  return Array.from(bytes)
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
    .join("");
}

function hexToBytes(hexStr) {
  const clean = hexStr.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error("Invalid hex string (must have an even number of hex digits).");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

// Decode SkyRC protocol frame if applicable
function decodeSkyrcFrame(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const notes = [];

  if (bytes[0] === 0x0f) {
    const len = bytes[1];
    const cmd = bytes[2];
    const cmdName = SKYRC_CMD_NAMES[cmd] || `Opcode 0x${cmd.toString(16).padStart(2, "0").toUpperCase()}`;
    notes.push(`SkyRC Frame [${cmdName}] Len=${len}`);

    // Specific decoder for 0x57 (getDeviceInfo / MachineBean.decodeInfo)
    if (cmd === 0x57 && bytes.length >= 19) {
      // In BleDataSourceImpl.decodeInfo(byte[] data):
      // If isMtu (bytes[3] === 0x57 or 21B response): 16-byte SN starts at offset 4 (or offset 3)
      const startIdx = bytes[3] === 0x31 ? 3 : bytes[4] === 0x31 ? 4 : 3;
      if (bytes.length >= startIdx + 16) {
        const snBytes = bytes.slice(startIdx, startIdx + 16);
        const sixteenCode = Array.from(snBytes)
          .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
          .join("");
        const skuHex = sixteenCode.slice(0, 12);
        const skuAscii = bytesToAscii(snBytes.slice(0, 6));
        const oemCode = sixteenCode.slice(16, 20);
        const fwMajor = snBytes[11];
        const fwMinor = snBytes[12];
        const fwVer = `${fwMajor}.${String(fwMinor).padStart(2, "0")}`;
        const hwVer = sixteenCode.slice(26, 28);
        const reserveCode = sixteenCode.slice(28, 30);
        const modelName = SKYRC_SKU_NAMES[skuHex] || `SkyRC SKU ${skuAscii}`;

        notes.push(
          `Model=${modelName} | SN=${sixteenCode} | FW=${fwVer} | HW=${hwVer} | OEM=${oemCode} | Rsv=${reserveCode}`
        );

        // Update Device Identity Card live
        document.getElementById("infoModel").textContent = `${modelName} (${skuAscii})`;
        document.getElementById("infoMfg").textContent = `SkyRC (OEM ${oemCode})`;
        document.getElementById("infoFw").textContent = `v${fwVer}`;
        document.getElementById("infoHw").textContent = `HW ${hwVer}`;
        document.getElementById("infoSw").textContent = `SN: ${sixteenCode}`;

        sessionRecord.deviceInfo = {
          ...sessionRecord.deviceInfo,
          model: modelName,
          sku: skuAscii,
          sixteenCode,
          oem: oemCode,
          firmwareRevision: fwVer,
          hardwareRevision: hwVer,
          reserveCode
        };

        // Query upgrade.skyrc.com via local server ONLY when running on localhost
        const isLocalhost =
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname === "0.0.0.0";

        if (isLocalhost && !sessionRecord.deviceInfo.queriedUpgradeServer) {
          sessionRecord.deviceInfo.queriedUpgradeServer = true;
          fetch("/api/query-firmware", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sixteenCode })
          })
            .then((r) => r.json())
            .then((res) => {
              if (res && res.ok) {
                appendLog(
                  "SYS",
                  null,
                  null,
                  `Queried upgrade.skyrc.com for SN=${res.querySn}: ${JSON.stringify(res.results)}`
                );
              }
            })
            .catch(() => {});
        }
      }
    } else if (cmd === 0x66 && bytes.length >= 5) {
      notes.push(`Bootloader Version Payload: ${bytesToHex(bytes.slice(3, bytes.length - 1))}`);
    } else if (cmd === 0x91 && bytes.length >= 19) {
      const slotInfo = parseAndApplyNc3000SlotTelemetry(bytes);
      if (slotInfo) {
        notes.push(
          `Slot ${slotInfo.slotIdx + 1} (mask=0x${slotInfo.mask.toString(16).padStart(2, "0")}) | ` +
            `V=${(slotInfo.voltageMv / 1000).toFixed(3)}V (${slotInfo.voltageMv}mV) | ` +
            `I=${slotInfo.currentMa}mA | Cap=${slotInfo.capacityMah}mAh | ` +
            `-ΔV=${slotInfo.deltaVMv}mV | IR=${slotInfo.irMohm}mΩ | ` +
            `State=${slotInfo.chargerStatusLabel} (${slotInfo.chargerStatu}) | Mode=${slotInfo.modeLabel}`
        );
      }
    } else if (cmd === 0x94) {
      notes.push(`NC3000 Set/Start ACK (${bytes.length}B)`);
    } else if (cmd === 0x95) {
      notes.push(`NC3000 System Settings Set ACK (${bytes.length}B)`);
    } else if (cmd === 0x96 && bytes.length >= 6) {
      const parsedHw = typeof parseNc3000SystemSettingResponse === "function" ? parseNc3000SystemSettingResponse(bytes) : null;
      if (parsedHw) {
        notes.push(
          `System Settings: Beep=${parsedHw.systemBeep ? "ON" : "OFF"}, Vol=${parsedHw.notifyBeep}, LCD=${parsedHw.lcd}, Timeout=${parsedHw.sleepTime}`
        );
      } else {
        notes.push(`System Settings Payload (${bytes.length - 4}B)`);
      }
    } else if (cmd === 0x97) {
      notes.push(`NC3000 Factory Reset ACK (${bytes.length}B)`);
    } else if (cmd === 0x56) {
      notes.push(`NC3000 Change PIN ACK (${bytes.length}B)`);
    } else if (cmd === 0xfe) {
      notes.push(`NC3000 Stop Slot ACK (${bytes.length}B)`);
    } else if (cmd === 0x9a && bytes.length >= 6) {
      notes.push(`Slot Telemetry Payload (${bytes.length - 4}B)`);
    }
  }

  return notes.length > 0 ? notes.join(" | ") : null;
}

let backendSyncAvailable = null; // null = unprobed, false = disabled, true = active

async function syncToLocalBackend(eventType, payload) {
  // Only attempt backend sync if running on a local development server (localhost / 127.0.0.1)
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "0.0.0.0";

  if (!isLocalhost || backendSyncAvailable === false) {
    return;
  }

  try {
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, payload, sessionRecord })
    });
    if (!res.ok) {
      // Backend route does not exist on this server, disable future requests
      backendSyncAvailable = false;
    } else {
      backendSyncAvailable = true;
    }
  } catch (_) {
    // Backend unreachable or offline, disable future requests
    backendSyncAvailable = false;
  }
}

function appendLog(direction, charUuid, bytes, note = "") {
  const ts = new Date().toISOString().slice(11, 23);
  const hex = bytes ? bytesToHex(bytes) : "";
  const ascii = bytes ? bytesToAscii(bytes) : "";
  const decoded = bytes ? decodeSkyrcFrame(bytes) : null;

  const pktRecord = {
    timestamp: new Date().toISOString(),
    direction,
    characteristic: charUuid || null,
    hex,
    ascii,
    decoded,
    note
  };
  sessionRecord.packets.push(pktRecord);
  syncToLocalBackend("packet", pktRecord);

  const div = document.createElement("div");
  div.className = `log-entry ${direction.toLowerCase()}`;

  const meta = document.createElement("div");
  meta.className = "log-meta";
  meta.innerHTML = `<span><strong>${direction}</strong> ${charUuid ? `[${shortUuid(charUuid)}]` : ""} ${note}</span><span>${ts}</span>`;
  div.appendChild(meta);

  if (hex) {
    const hexEl = document.createElement("div");
    hexEl.className = "log-hex";
    hexEl.textContent = `HEX  (${bytes.length}B): ${hex}`;
    div.appendChild(hexEl);

    const asciiEl = document.createElement("div");
    asciiEl.className = "log-ascii";
    asciiEl.textContent = `ASCII: ${ascii}`;
    div.appendChild(asciiEl);
  }

  if (decoded) {
    const decEl = document.createElement("div");
    decEl.className = "log-decoded";
    decEl.textContent = `DECODED: ${decoded}`;
    div.appendChild(decEl);
  }

  packetLogEl.appendChild(div);
  if (document.getElementById("autoScrollLog").checked) {
    packetLogEl.scrollTop = packetLogEl.scrollHeight;
  }
}

function setStatus(state, text) {
  const pill = document.getElementById("keeperGlobalStatus") || statusIndicator;
  const txt = document.getElementById("keeperStatusText") || statusText;
  if (pill) pill.className = `status-pill ${state}`;
  if (txt) txt.textContent = text;
  const isConnected = state === "connected";
  document.body.classList.toggle("ble-connected", isConnected);
  if (btnConnect) {
    btnConnect.style.display = isConnected ? "none" : "";
  }
  if (btnDisconnect) {
    btnDisconnect.style.display = isConnected ? "" : "none";
    btnDisconnect.disabled = !isConnected;
  }
  updateKeeperControlButtons();
  updateKeeperHeaderPill();
}

async function connectBle() {
  if (!navigator.bluetooth) {
    showToast("Web Bluetooth API is not available in this browser. Please open this page in Google Chrome or Microsoft Edge.", "error");
    return;
  }

  try {
    setStatus("connecting", "Requesting device…");
    const optionalServices = buildOptionalServices();
    const acceptAll = acceptAllDevicesEl.checked;

    const options = acceptAll
      ? { acceptAllDevices: true, optionalServices }
      : {
          filters: [
            { namePrefix: "NC3000" },
            { namePrefix: "SkyRC" },
            { namePrefix: "SKYRC" },
            { namePrefix: "MC3000" },
            { namePrefix: "B6" },
            { services: [0xffe0] },
            { services: [0xfff0] }
          ],
          optionalServices
        };

    bleDevice = await navigator.bluetooth.requestDevice(options);
    bleDevice.addEventListener("gattserverdisconnected", onDisconnected);

    document.getElementById("infoName").textContent = bleDevice.name || "(Unnamed BLE Device)";
    document.getElementById("infoId").textContent = bleDevice.id || "—";
    sessionRecord.device = {
      name: bleDevice.name || null,
      id: bleDevice.id || null
    };

    setStatus("connecting", `Connecting to ${bleDevice.name || "device"}…`);
    appendLog("SYS", null, null, `Connecting to GATT server on ${bleDevice.name || bleDevice.id}…`);

    gattServer = await bleDevice.gatt.connect();
    setStatus("connected", `Connected: ${bleDevice.name || "NC3000 Pro"}`);
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    btnReadAll.disabled = false;

    await enumerateGatt();
  } catch (err) {
    setStatus("disconnected", "Disconnected");
    appendLog("ERR", null, null, `Connection failed: ${err.message}`);
  }
}

function onDisconnected() {
  stopOpcodeScan();
  stopTelemetryPoller();
  if (keeperState.active) {
    stopAutoKeeper(false);
  }
  setStatus("disconnected", "Disconnected");
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  btnReadAll.disabled = true;
  btnSendHex.disabled = true;
  btnStartScan.disabled = true;
  txCharSelect.disabled = true;
  const pollBtn = document.getElementById("btnPollOnce");
  if (pollBtn) pollBtn.disabled = true;
  updateKeeperControlButtons();
  document.querySelectorAll(".probe-btn").forEach((b) => (b.disabled = true));
  appendLog("SYS", null, null, "BLE device disconnected.");
}

async function enumerateGatt() {
  characteristicsMap.clear();
  gattListEl.innerHTML = "";
  txCharSelect.innerHTML = "";
  sessionRecord.services = [];

  appendLog("SYS", null, null, "Discovering primary GATT services…");
  const services = await gattServer.getPrimaryServices();
  appendLog("SYS", null, null, `Discovered ${services.length} GATT service(s).`);

  const writableChars = [];
  const notifyChars = [];

  for (const service of services) {
    const sUuid = service.uuid.toLowerCase();
    const sRecord = { uuid: sUuid, name: formatUuid(sUuid), characteristics: [] };
    sessionRecord.services.push(sRecord);

    const card = document.createElement("div");
    card.className = "service-card";
    card.innerHTML = `
      <div class="service-header">
        <span class="mono">${formatUuid(sUuid)}</span>
        <span class="badge">${service.isPrimary ? "PRIMARY" : "SECONDARY"}</span>
      </div>
    `;

    let chars = [];
    try {
      chars = await service.getCharacteristics();
    } catch (e) {
      appendLog("ERR", sUuid, null, `Could not list characteristics: ${e.message}`);
    }

    for (const char of chars) {
      const cUuid = char.uuid.toLowerCase();
      const props = [];
      for (const k of [
        "read",
        "write",
        "writeWithoutResponse",
        "notify",
        "indicate",
        "authenticatedSignedWrites"
      ]) {
        if (char.properties[k]) props.push(k);
      }

      characteristicsMap.set(cUuid, { char, serviceUuid: sUuid, props });
      sRecord.characteristics.push({ uuid: cUuid, name: formatUuid(cUuid), properties: props });

      const row = document.createElement("div");
      row.className = "char-row";
      row.id = `char-row-${cUuid}`;

      const badgesHtml = props
        .map((p) => `<span class="prop-badge ${p === "notify" || p === "indicate" ? "active" : ""}">${p}</span>`)
        .join("");

      row.innerHTML = `
        <div class="char-top">
          <span class="char-uuid mono">${formatUuid(cUuid)}</span>
          <div class="prop-badges">${badgesHtml}</div>
        </div>
        <div class="char-actions">
          ${char.properties.read ? `<button class="btn small" data-read-uuid="${cUuid}">Read</button>` : ""}
          ${
            char.properties.write || char.properties.writeWithoutResponse
              ? `<button class="btn small" data-select-tx="${cUuid}">Use as TX</button>`
              : ""
          }
        </div>
        <div class="char-val mono hidden" id="val-${cUuid}"></div>
      `;
      card.appendChild(row);

      if (char.properties.write || char.properties.writeWithoutResponse) {
        writableChars.push(cUuid);
      }

      // Auto-subscribe to all notify / indicate characteristics
      if (char.properties.notify || char.properties.indicate) {
        try {
          await char.startNotifications();
          char.addEventListener("characteristicvaluechanged", (ev) => {
            onNotification(cUuid, ev.target.value);
          });
          notifyChars.push(cUuid);
          appendLog("SYS", cUuid, null, "Subscribed to notifications.");
        } catch (err) {
          appendLog("ERR", cUuid, null, `Failed to start notifications: ${err.message}`);
        }
      }

      // Auto-read standard Device Info & Generic Access characteristics
      if (char.properties.read && (sUuid.includes("180a") || sUuid.includes("1800") || sUuid.includes("180f"))) {
        await readCharacteristicValue(cUuid);
      }
    }

    gattListEl.appendChild(card);
  }

  // Bind read and select-tx buttons
  gattListEl.querySelectorAll("[data-read-uuid]").forEach((btn) => {
    btn.addEventListener("click", () => readCharacteristicValue(btn.getAttribute("data-read-uuid")));
  });
  gattListEl.querySelectorAll("[data-select-tx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      txCharSelect.value = btn.getAttribute("data-select-tx");
      updateActiveCharSummary();
    });
  });

  // Populate TX characteristic dropdown
  if (writableChars.length > 0) {
    // Prioritize FFE1, FFF1, FFF2, NUS TX
    const preferredOrder = ["ffe1", "fff1", "fff2", "6e400002"];
    writableChars.sort((a, b) => {
      const scoreA = preferredOrder.findIndex((p) => a.includes(p));
      const scoreB = preferredOrder.findIndex((p) => b.includes(p));
      return (scoreA === -1 ? 99 : scoreA) - (scoreB === -1 ? 99 : scoreB);
    });

    for (const u of writableChars) {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = formatUuid(u);
      txCharSelect.appendChild(opt);
    }
    txCharSelect.disabled = false;
    btnSendHex.disabled = false;
    document.getElementById("btnStartScan").disabled = false;
    const pollBtn = document.getElementById("btnPollOnce");
    if (pollBtn) pollBtn.disabled = false;
    updateKeeperControlButtons();
    document.querySelectorAll(".probe-btn").forEach((b) => (b.disabled = false));
  } else {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(No writable characteristics found)";
    txCharSelect.appendChild(opt);
  }

  updateActiveCharSummary(notifyChars);
  syncToLocalBackend("gatt_enumerated", {
    device: sessionRecord.device,
    deviceInfo: sessionRecord.deviceInfo,
    services: sessionRecord.services
  });

  // Automatically query slot telemetry and device info after subscribing to 0xFFE1
  if (writableChars.some((u) => u.includes("ffe1"))) {
    setTimeout(async () => {
      appendLog("SYS", null, null, "Querying live NC3000 Pro slot telemetry & device status…");
      // Poll all 4 slots immediately upon connection so running modes & active cells are detected without delay
      await pollAllFourSlotsOnce();
      startTelemetryPoller();

      // Read device information and bootloader version in background
      await sendBytes(
        hexToBytes("0F 13 57 00 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 58"),
        "[Auto Handshake: getDeviceInfo MTU=true]"
      );
      await new Promise((r) => setTimeout(r, 200));
      await sendBytes(
        hexToBytes("0F 13 57 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 57"),
        "[Auto Handshake: getDeviceInfo MTU=false]"
      );
      await new Promise((r) => setTimeout(r, 200));
      await sendBytes(hexToBytes("0F 03 66 00 66"), "[Auto Handshake: checkBootVer (0x66)]");
    }, 150);
  }
}

function updateActiveCharSummary(notifyChars) {
  const tx = txCharSelect.value ? shortUuid(txCharSelect.value) : "None";
  const rxCount = notifyChars ? notifyChars.length : "Active";
  document.getElementById("infoActiveChars").textContent = `TX: ${tx} | RX: ${rxCount}`;
}

async function readCharacteristicValue(cUuid) {
  const entry = characteristicsMap.get(cUuid);
  if (!entry) return;
  try {
    const dataView = await entry.char.readValue();
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const ascii = bytesToAscii(bytes);
    const hex = bytesToHex(bytes);

    const valEl = document.getElementById(`val-${cUuid}`);
    if (valEl) {
      valEl.classList.remove("hidden");
      valEl.textContent = `HEX: ${hex} | ASCII: "${ascii}"`;
    }

    // Populate Device Identity Card if standard characteristic
    if (cUuid.includes("2a00")) document.getElementById("infoName").textContent = ascii;
    if (cUuid.includes("2a24")) {
      document.getElementById("infoModel").textContent = ascii;
      sessionRecord.deviceInfo.model = ascii;
    }
    if (cUuid.includes("2a29")) {
      document.getElementById("infoMfg").textContent = ascii;
      sessionRecord.deviceInfo.manufacturer = ascii;
    }
    if (cUuid.includes("2a26")) {
      document.getElementById("infoFw").textContent = ascii;
      sessionRecord.deviceInfo.firmwareRevision = ascii;
    }
    if (cUuid.includes("2a27")) {
      document.getElementById("infoHw").textContent = ascii;
      sessionRecord.deviceInfo.hardwareRevision = ascii;
    }
    if (cUuid.includes("2a28")) {
      document.getElementById("infoSw").textContent = ascii;
      sessionRecord.deviceInfo.softwareRevision = ascii;
    }

    appendLog("RX", cUuid, bytes, "(Read Value)");
  } catch (err) {
    appendLog("ERR", cUuid, null, `Read failed: ${err.message}`);
  }
}

let rxReassemblyBuffer = new Uint8Array(0);

function onNotification(cUuid, dataView) {
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);

  const valEl = document.getElementById(`val-${cUuid}`);
  if (valEl) {
    valEl.classList.remove("hidden");
    valEl.textContent = `LAST RX (${bytes.length}B): ${bytesToHex(bytes)}`;
  }

  // Check if opcode scanner is running and waiting for response
  if (scanState.running && scanState.currentOpcode !== null) {
    const opHex = "0x" + scanState.currentOpcode.toString(16).padStart(2, "0").toUpperCase();
    if (!scanState.hits.has(opHex)) {
      scanState.hits.set(opHex, bytesToHex(bytes));
      renderDiscoveredOpcode(opHex, bytes);
    }
  }

  // Check if recording to binary buffer
  if (document.getElementById("recordToBin").checked) {
    // Strip SkyRC framing if 0x0F ... FF FF or store raw
    binaryDumpChunks.push(bytes);
    binaryDumpTotalBytes += bytes.length;
    document.getElementById("binBufferSize").textContent = `${binaryDumpTotalBytes} bytes`;
  }

  // BLE Notification Reassembly:
  // SkyRC frames begin with 0x0F, followed by byte length `L`. The total frame is `L + 3` bytes.
  // In MTU-constrained BLE environments (e.g. 20-byte MTU limit), a 22-byte 0x91 telemetry
  // frame can be split across Chunk 1 (20B) and Chunk 2 (2B). Reassemble contiguous frames before dispatch.
  let frameToProcess = bytes;
  if (rxReassemblyBuffer.length > 0) {
    const merged = new Uint8Array(rxReassemblyBuffer.length + bytes.length);
    merged.set(rxReassemblyBuffer, 0);
    merged.set(bytes, rxReassemblyBuffer.length);
    const expectedLen = merged.length >= 2 ? merged[1] + 3 : 0;
    if (expectedLen > 0 && merged.length >= expectedLen) {
      frameToProcess = merged.slice(0, expectedLen);
      rxReassemblyBuffer = merged.slice(expectedLen);
    } else {
      rxReassemblyBuffer = merged;
      return; // Waiting for remainder of frame
    }
  } else if (bytes[0] === 0x0f && bytes.length >= 2) {
    const expectedLen = bytes[1] + 3;
    if (bytes.length < expectedLen) {
      rxReassemblyBuffer = new Uint8Array(bytes);
      return; // Waiting for remainder of frame
    }
  }

  appendLog("RX", cUuid, frameToProcess, "(Notification)");
}

let bleTxQueue = Promise.resolve();

async function sendBytes(bytes, label = "") {
  return (bleTxQueue = bleTxQueue.then(async () => {
    const targetUuid = txCharSelect.value;
    if (!targetUuid) {
      appendLog("ERR", null, null, "No TX characteristic selected.");
      return;
    }
    const entry = characteristicsMap.get(targetUuid);
    if (!entry) return;

    const mode = writeModeSelect.value;
    try {
      if (
        mode === "withoutResponse" ||
        (mode === "auto" && entry.char.properties.writeWithoutResponse)
      ) {
        await entry.char.writeValueWithoutResponse(bytes);
      } else {
        await entry.char.writeValueWithResponse(bytes);
      }
      appendLog("TX", targetUuid, bytes, label);
    } catch (err) {
      // Fallback if writeWithoutResponse or writeWithResponse fails
      try {
        await entry.char.writeValue(bytes);
        appendLog("TX", targetUuid, bytes, `${label} (fallback writeValue)`);
      } catch (err2) {
        appendLog("ERR", targetUuid, bytes, `Write failed: ${err2.message}`);
      }
    }
  }).catch((queueErr) => {
    appendLog("ERR", null, null, `BLE TX Queue Error: ${queueErr.message}`);
  }));
}

// Build a valid SkyCharger BLE frame (Cmd.base): 0F [LEN] [CMD] [PAYLOAD...] [CHECKSUM]
function buildSkyrcFrame(cmdAndPayloadBytes) {
  let sum = 0;
  for (const b of cmdAndPayloadBytes) {
    sum = (sum + b) & 0xff;
  }
  const out = new Uint8Array(2 + cmdAndPayloadBytes.length + 1);
  out[0] = 0x0f;
  out[1] = cmdAndPayloadBytes.length + 1;
  out.set(cmdAndPayloadBytes, 2);
  out[2 + cmdAndPayloadBytes.length] = sum;
  return out;
}

// Opcode Scanner
function renderDiscoveredOpcode(opHex, rxBytes) {
  const container = document.getElementById("discoveredOpcodes");
  const chip = document.createElement("span");
  chip.className = "opcode-chip";
  chip.textContent = `${opHex} (${rxBytes.length}B)`;
  chip.title = `Response: ${bytesToHex(rxBytes)} | Click to load in Custom Frame Sender`;
  chip.addEventListener("click", () => {
    const op = parseInt(opHex, 16);
    const frame = buildSkyrcFrame(new Uint8Array([op, 0x00]));
    rawHexInput.value = bytesToHex(frame);
  });
  container.appendChild(chip);
}

async function startOpcodeScan() {
  const startOp = parseInt(document.getElementById("scanStart").value, 16);
  const endOp = parseInt(document.getElementById("scanEnd").value, 16);
  const delayMs = parseInt(document.getElementById("scanDelay").value, 10) || 120;

  if (isNaN(startOp) || isNaN(endOp) || startOp < 0 || endOp > 255 || startOp > endOp) {
    showToast("Invalid start/end hex opcodes (use 00 to FF).", "warning");
    return;
  }

  scanState.running = true;
  scanState.hits.clear();
  document.getElementById("discoveredOpcodes").innerHTML = "";
  document.getElementById("btnStartScan").disabled = true;
  document.getElementById("btnStopScan").disabled = false;

  const progressEl = document.getElementById("scanProgress");

  for (let op = startOp; op <= endOp; op++) {
    if (!scanState.running) break;
    // Skip 0x11 / 0x12 / 0x13 start/stop charge commands during passive discovery unless explicitly probed
    scanState.currentOpcode = op;
    const opHex = "0x" + op.toString(16).padStart(2, "0").toUpperCase();
    progressEl.textContent = `Scanning opcode ${opHex} (${op - startOp + 1} / ${endOp - startOp + 1}) — Hits: ${scanState.hits.size}`;

    const frame = buildSkyrcFrame(new Uint8Array([op, 0x00]));
    await sendBytes(frame, `[Scan ${opHex}]`);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  stopOpcodeScan();
}

function stopOpcodeScan() {
  scanState.running = false;
  scanState.currentOpcode = null;
  document.getElementById("btnStartScan").disabled = !gattServer || !gattServer.connected;
  document.getElementById("btnStopScan").disabled = true;
  document.getElementById("scanProgress").textContent = `Scan finished — ${scanState.hits.size} responsive opcode(s) discovered.`;
}

// Event Listeners
btnConnect.addEventListener("click", connectBle);
btnDisconnect.addEventListener("click", () => {
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  }
});

btnReadAll.addEventListener("click", async () => {
  for (const [cUuid, entry] of characteristicsMap.entries()) {
    if (entry.char.properties.read) {
      await readCharacteristicValue(cUuid);
    }
  }
});

document.getElementById("btnAddUuid").addEventListener("click", () => {
  const val = document.getElementById("customServiceUuid").value.trim().toLowerCase();
  if (val) {
    customServiceUuids.push(val);
    appendLog("SYS", null, null, `Added custom service UUID: ${val} (Reconnect to apply)`);
    document.getElementById("customServiceUuid").value = "";
  }
});

document.querySelectorAll(".probe-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const hex = btn.getAttribute("data-hex");
    rawHexInput.value = hex;
    sendBytes(hexToBytes(hex), `[Probe]`);
  });
});

btnWrapSkyrc.addEventListener("click", () => {
  try {
    const raw = hexToBytes(rawHexInput.value);
    const wrapped = buildSkyrcFrame(raw);
    rawHexInput.value = bytesToHex(wrapped);
  } catch (e) {
    showToast(e.message, "error");
  }
});

btnSendHex.addEventListener("click", () => {
  try {
    const bytes = hexToBytes(rawHexInput.value);
    sendBytes(bytes, "[Manual TX]");
  } catch (e) {
    showToast(e.message, "error");
  }
});

document.getElementById("btnStartScan").addEventListener("click", startOpcodeScan);
document.getElementById("btnStopScan").addEventListener("click", stopOpcodeScan);

document.getElementById("btnClearBin").addEventListener("click", () => {
  binaryDumpChunks = [];
  binaryDumpTotalBytes = 0;
  document.getElementById("binBufferSize").textContent = "0 bytes";
});

document.getElementById("btnDownloadBin").addEventListener("click", () => {
  if (binaryDumpTotalBytes === 0) {
    showToast("Binary buffer is empty.", "warning");
    return;
  }
  const merged = new Uint8Array(binaryDumpTotalBytes);
  let offset = 0;
  for (const chunk of binaryDumpChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const blob = new Blob([merged], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `nc3000pro-dump-${Date.now()}.bin`;
  a.click();
});

btnExportSession.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(sessionRecord, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `nc3000pro-ble-capture.json`;
  a.click();
});

document.getElementById("btnClearLog").addEventListener("click", () => {
  packetLogEl.innerHTML = "";
});

document.getElementById("btnCopyLog").addEventListener("click", () => {
  const text = sessionRecord.packets
    .map((p) => `[${p.timestamp}] ${p.direction} ${p.characteristic || ""} | ${p.hex} | ${p.ascii} | ${p.decoded || ""}`)
    .join("\n");
  navigator.clipboard.writeText(text);
});

// ============================================================================
// NC3000 Pro 4-Slot Telemetry (0x91) + Start/Config (0x94) + Stop (0xFE)
// & "Set & Forget" Race Target-Voltage Keeper (Auto Charge / Discharge / Hold)
// ============================================================================

const NC3000_SLOT_MASKS = [0x01, 0x02, 0x04, 0x08];
const NC3000_MODE_NAMES = {
  0: "Charge",
  1: "Discharge",
  2: "Break-in",
  3: "Cycle",
  4: "MaxBoost",
  5: "Turbo",
  6: "3-Stage"
};
const NC3000_HW_MODE_TO_ID = {
  0: "CHARGE",
  1: "DISCHARGE",
  2: "BREAKIN",
  3: "CYCLE",
  4: "MAXBOOST",
  5: "TURBO",
  6: "THREE_STAGE"
};
const NC3000_CHARGER_STATUS_NAMES = {
  0: "Standby / Idle",
  1: "Ready",
  2: "Charging",
  3: "Discharging",
  4: "Resting",
  5: "Done",
  6: "Done / Hold",
  7: "Done"
};
const NC3000_ERROR_STATE_NAMES = {
  1: "DC In Too Low!",
  2: "DC In Too High!",
  3: "Connection Break!",
  4: "Cut-off Cap. Reached!",
  5: "Safety Timer / Temp Cutoff!",
  6: "Cut-off Temp. Reached!",
  7: "Battery Failure!",
  8: "High Voltage!"
};

const slotTelemetry = [0, 1, 2, 3].map((slotIdx) => ({
  slotIdx,
  mask: NC3000_SLOT_MASKS[slotIdx],
  hasBattery: false,
  voltageMv: 0,
  currentMa: 0,
  deltaVMv: 0, // Hardware -ΔV peak detect drop in mV (bytes 8..9)
  capacityMah: 0,
  durationSec: 0,
  irMohm: 0,
  chargerStatu: 0,
  chargerStatusLabel: "No Data",
  mode: 0,
  modeLabel: "—",
  errorState: 0,
  updatedAt: 0
}));

const pairAudioState = [
  { wasReady: false, wasStalled: false },
  { wasReady: false, wasStalled: false }
];

let audioContext = null;
let audioAlertsEnabled = true;

function initAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioContext = new AudioCtx();
  }
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function playTone(freq, durationMs, type = "sine", gainVal = 0.15) {
  if (!audioAlertsEnabled) return;
  try {
    initAudioContext();
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    gain.gain.setValueAtTime(gainVal, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + durationMs / 1000);
  } catch (_) {}
}

function playReadyChime() {
  if (!audioAlertsEnabled) return;
  playTone(523.25, 120, "sine", 0.2); // C5
  setTimeout(() => playTone(659.25, 120, "sine", 0.2), 140); // E5
  setTimeout(() => playTone(783.99, 280, "sine", 0.25), 280); // G5
  if (navigator.vibrate) {
    try { navigator.vibrate([80, 60, 120]); } catch (_) {}
  }
}

function playStallAlarm() {
  if (!audioAlertsEnabled) return;
  playTone(220, 150, "square", 0.15); // A3 low warning buzz
  setTimeout(() => playTone(220, 150, "square", 0.15), 200);
  setTimeout(() => playTone(220, 250, "square", 0.2), 400);
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200, 100, 400]); } catch (_) {}
  }
}

function playReconnectChime() {
  if (!audioAlertsEnabled) return;
  playTone(659.25, 80, "sine", 0.18); // E5
  setTimeout(() => playTone(880, 120, "sine", 0.22), 100); // A5
  if (navigator.vibrate) {
    try { navigator.vibrate([60, 40, 80]); } catch (_) {}
  }
}

function playBreakAlert() {
  if (!audioAlertsEnabled) return;
  playTone(400, 90, "triangle", 0.15);
  setTimeout(() => playTone(280, 140, "triangle", 0.15), 100);
  if (navigator.vibrate) {
    try { navigator.vibrate([150, 80, 150]); } catch (_) {}
  }
}

// Custom Toast Notifications (Anti-native alert replacement)
function showToast(message, type = "info", durationMs = 3500) {
  const container = document.getElementById("toastContainer");
  if (!container) {
    console.log(`[Toast ${type}] ${message}`);
    return;
  }
  const icons = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌"
  };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || "ℹ️"}</span>
    <span class="toast-msg">${message}</span>
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  container.appendChild(toast);

  const dismiss = () => {
    if (toast.classList.contains("dismissing")) return;
    toast.classList.add("dismissing");
    if (window.gsap) {
      gsap.to(toast, { opacity: 0, y: 10, duration: 0.2, onComplete: () => toast.remove() });
    } else {
      toast.remove();
    }
  };

  toast.querySelector(".toast-close")?.addEventListener("click", dismiss);
  if (durationMs > 0) {
    setTimeout(dismiss, durationMs);
  }

  if (window.gsap) {
    gsap.fromTo(toast, { opacity: 0, y: 15, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: "power2.out" });
  }
}

// Custom Modal Confirm Dialog (Replacement for window.confirm)
function showConfirmModal({ title = "Confirm", message, confirmText = "Confirm", cancelText = "Cancel", isDanger = false }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("customModalOverlay");
    const titleEl = document.getElementById("customModalTitle");
    const msgEl = document.getElementById("customModalMessage");
    const inputWrap = document.getElementById("customModalInputWrap");
    const btnConfirm = document.getElementById("customModalConfirm");
    const btnCancel = document.getElementById("customModalCancel");
    const btnClose = document.getElementById("customModalClose");
    if (!overlay) {
      resolve(true);
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    if (inputWrap) inputWrap.classList.add("hidden");
    btnConfirm.textContent = confirmText;
    btnConfirm.className = `btn small ${isDanger ? "danger" : "primary"}`;
    btnCancel.textContent = cancelText;

    const cleanup = (result) => {
      overlay.classList.add("hidden");
      btnConfirm.removeEventListener("click", onConfirm);
      btnCancel.removeEventListener("click", onCancel);
      btnClose.removeEventListener("click", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };

    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };

    btnConfirm.addEventListener("click", onConfirm);
    btnCancel.addEventListener("click", onCancel);
    btnClose.addEventListener("click", onCancel);
    window.addEventListener("keydown", onKeyDown);

    overlay.classList.remove("hidden");
    btnConfirm.focus();
    if (window.gsap) {
      gsap.fromTo(".custom-modal-card", { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "power2.out" });
    }
  });
}

// Custom Modal Prompt Dialog (Replacement for window.prompt)
function showPromptModal({ title = "Prompt", message, defaultValue = "", placeholder = "", confirmText = "Save" }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("customModalOverlay");
    const titleEl = document.getElementById("customModalTitle");
    const msgEl = document.getElementById("customModalMessage");
    const inputWrap = document.getElementById("customModalInputWrap");
    const inputEl = document.getElementById("customModalInput");
    const btnConfirm = document.getElementById("customModalConfirm");
    const btnCancel = document.getElementById("customModalCancel");
    const btnClose = document.getElementById("customModalClose");
    if (!overlay) {
      resolve(defaultValue);
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    if (inputWrap) inputWrap.classList.remove("hidden");
    if (inputEl) {
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
    }
    btnConfirm.textContent = confirmText;
    btnConfirm.className = "btn small primary";
    btnCancel.textContent = "Cancel";

    const cleanup = (result) => {
      overlay.classList.add("hidden");
      btnConfirm.removeEventListener("click", onConfirm);
      btnCancel.removeEventListener("click", onCancel);
      btnClose.removeEventListener("click", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };

    const onConfirm = () => {
      const val = inputEl ? inputEl.value.trim() : "";
      cleanup(val || null);
    };
    const onCancel = () => cleanup(null);
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };

    btnConfirm.addEventListener("click", onConfirm);
    btnCancel.addEventListener("click", onCancel);
    btnClose.addEventListener("click", onCancel);
    window.addEventListener("keydown", onKeyDown);

    overlay.classList.remove("hidden");
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
    if (window.gsap) {
      gsap.fromTo(".custom-modal-card", { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "power2.out" });
    }
  });
}

const STORAGE_KEY = "nc3000pro_keeper_prefs_v1";
const STORAGE_PROFILES_KEY = "nc3000pro_profiles_v1";

const WORKING_MODES = {
  RACE_READY: {
    id: "RACE_READY",
    code: -1,
    name: "Race Ready Mode",
    icon: "🏎️",
    badge: "RACE READY",
    sectionId: "sectionModeRaceReady",
    description: "Balances each cell to Target/2 (e.g. 1.6V discharges to 1.5V, 1.4V charges to 1.5V) so the 2-cell series pair matches perfectly."
  },
  CHARGE: {
    id: "CHARGE",
    code: 0,
    name: "Mode 0: Charge",
    icon: "⚡",
    badge: "MODE 0: CHG",
    sectionId: "sectionModeNativeCharge",
    description: "Standard CC/CV saturation charge with -ΔV peak cutoff and holding voltage across active slots."
  },
  DISCHARGE: {
    id: "DISCHARGE",
    code: 1,
    name: "Mode 1: Discharge",
    icon: "🔋",
    badge: "MODE 1: DIS",
    sectionId: "sectionModeNativeDischarge",
    description: "Linear constant-current discharge down to cutoff voltage across active slots to measure capacity."
  },
  CYCLE: {
    id: "CYCLE",
    code: 3,
    name: "Mode 3: Cycle",
    icon: "🔄",
    badge: "MODE 3: CYCLE",
    sectionId: "sectionModeNativeCycle",
    description: "Automated multi-pass charge/discharge cycling across active slots to refresh capacity and break memory effect."
  },
  BREAKIN: {
    id: "BREAKIN",
    code: 2,
    name: "Mode 2: Break-in",
    icon: "🔬",
    badge: "MODE 2: BREAKIN",
    sectionId: "sectionModeNativeBreakin",
    description: "IEC 61951-2 standard conditioning across active slots with auto-scaled 0.1C charge and 0.2C discharge."
  },
  TURBO: {
    id: "TURBO",
    code: 5,
    name: "Mode 5: Turbo",
    icon: "🚀",
    badge: "MODE 5: TURBO",
    sectionId: "sectionModeNativeTurbo",
    description: "High-current rapid charging (up to 3.0A) across active slots for fast track turnaround."
  },
  THREE_STAGE: {
    id: "THREE_STAGE",
    code: 6,
    name: "Mode 6: 3-Stage",
    icon: "📊",
    badge: "MODE 6: 3-STAGE",
    sectionId: "sectionModeNativeThreeStage",
    description: "2-step current charging with gentle saturation across active slots to maximize punch without overheating."
  },
  MAXBOOST: {
    id: "MAXBOOST",
    code: 4,
    name: "Mode 4: MaxBoost",
    icon: "💥",
    badge: "MODE 4: BOOST",
    sectionId: "sectionModeNativeMaxBoost",
    description: "Pulsed boost current across active slots to overcome surface passivation and wake up zero-volt sleeping cells."
  }
};
WORKING_MODES["0"] = WORKING_MODES.CHARGE;
WORKING_MODES["1"] = WORKING_MODES.DISCHARGE;
WORKING_MODES["2"] = WORKING_MODES.BREAKIN;
WORKING_MODES["3"] = WORKING_MODES.CYCLE;
WORKING_MODES["4"] = WORKING_MODES.MAXBOOST;
WORKING_MODES["5"] = WORKING_MODES.TURBO;
WORKING_MODES["6"] = WORKING_MODES.THREE_STAGE;

const DEFAULT_PROFILES = [
  {
    id: "race_ready_300",
    name: "🏎️ Race Ready: 3.00V Track Pack (1.50V/cell - High Punch)",
    mode: "RACE_READY",
    params: {
      pair1TargetV: "3.000",
      pair2TargetV: "3.000",
      linkPairs: true,
      deadbandMv: 5,
      chargeMa: 800,
      dischargeMa: 1000,
      fineMa: 200,
      trickleMa: 30,
      settleSec: 15,
      stallTimeoutMin: 4,
      tempProtectC: 71
    }
  },
  {
    id: "race_ready_290",
    name: "🏎️ Race Ready: 2.90V Technical Qualifying (1.45V/cell)",
    mode: "RACE_READY",
    params: {
      pair1TargetV: "2.900",
      pair2TargetV: "2.900",
      linkPairs: true,
      deadbandMv: 5,
      chargeMa: 800,
      dischargeMa: 1000,
      fineMa: 200,
      trickleMa: 30,
      settleSec: 15,
      stallTimeoutMin: 4,
      tempProtectC: 71
    }
  },
  {
    id: "race_ready_280",
    name: "🏎️ Race Ready: 2.80V Speed Practice (1.40V/cell)",
    mode: "RACE_READY",
    params: {
      pair1TargetV: "2.800",
      pair2TargetV: "2.800",
      linkPairs: true,
      deadbandMv: 5,
      chargeMa: 800,
      dischargeMa: 1000,
      fineMa: 200,
      trickleMa: 30,
      settleSec: 15,
      stallTimeoutMin: 4,
      tempProtectC: 71
    }
  },
  {
    id: "race_ready_270",
    name: "🏎️ Race Ready: 2.70V Safe Storage (1.35V/cell)",
    mode: "RACE_READY",
    params: {
      pair1TargetV: "2.700",
      pair2TargetV: "2.700",
      linkPairs: true,
      deadbandMv: 5,
      chargeMa: 600,
      dischargeMa: 1000,
      fineMa: 200,
      trickleMa: 0,
      settleSec: 15,
      stallTimeoutMin: 4,
      tempProtectC: 71
    }
  },
  {
    id: "native_chg_neochamp",
    name: "⚡ Mode 0 Charge: NeoChamp 1A Rapid (-5mV ΔV)",
    mode: "CHARGE",
    params: {
      chargeMa: 1000,
      cutoffMv: 1650,
      deltaVMv: 5,
      restartVoltMv: 1290,
      trickleMa: 30,
      capacityMah: 1500,
      timerMin: 120,
      tempProtectC: 71
    }
  },
  {
    id: "native_chg_eneloop",
    name: "⚡ Mode 0 Charge: Eneloop 1.5A Standard",
    mode: "CHARGE",
    params: {
      chargeMa: 1500,
      cutoffMv: 1650,
      deltaVMv: 5,
      restartVoltMv: 1290,
      trickleMa: 30,
      capacityMah: 2500,
      timerMin: 150,
      tempProtectC: 71
    }
  },
  {
    id: "native_dis_bench",
    name: "🔋 Mode 1 Discharge: 1.0A Capacity Benchmark (1.00V)",
    mode: "DISCHARGE",
    params: {
      dischargeMa: 1000,
      cutoffMv: 1000,
      stopCurrentMa: 100,
      timerMin: 180,
      tempProtectC: 71
    }
  },
  {
    id: "native_cycle_refresh",
    name: "🔄 Mode 3 Cycle: 3x C->D->C Refresh & Memory Wipe",
    mode: "CYCLE",
    params: {
      cycleSeq: 3,
      cycleCount: 3,
      chargeMa: 1000,
      dischargeMa: 1000,
      cutoffMv: 1650,
      dischargeCutoffMv: 1000,
      deltaVMv: 5,
      trickleMa: 30,
      restDischMin: 10,
      restChargeMin: 10,
      timerMin: 180,
      tempProtectC: 71
    }
  },
  {
    id: "native_breakin_neochamp",
    name: "🔬 Mode 2 Break-in: NeoChamp 1000mAh (IEC 61951-2)",
    mode: "BREAKIN",
    params: {
      capacityMah: 1000,
      tempProtectC: 71
    }
  },
  {
    id: "native_breakin_eneloop",
    name: "🔬 Mode 2 Break-in: Eneloop 2000mAh (IEC 61951-2)",
    mode: "BREAKIN",
    params: {
      capacityMah: 2000,
      tempProtectC: 71
    }
  },
  {
    id: "native_turbo_3a",
    name: "🚀 Mode 5 Turbo: 3.0A Maximum Punch (Active IR)",
    mode: "TURBO",
    params: {
      turboLevel: 4,
      chargeMa: 3000,
      cutoffMv: 1650,
      deltaVMv: 4,
      tempProtectC: 71
    }
  },
  {
    id: "native_3stage_step",
    name: "📊 Mode 6 3-Stage: 2.0A Step-down to 800mA (80%)",
    mode: "THREE_STAGE",
    params: {
      stage1Ma: 2000,
      stage1Pct: 80,
      stage2Ma: 800,
      cutoffMv: 1600,
      deltaVMv: 4,
      trickleMa: 30,
      tempProtectC: 71
    }
  },
  {
    id: "native_maxboost_revive",
    name: "💥 Mode 4 MaxBoost: 300mAh 0V Cell Recovery",
    mode: "MAXBOOST",
    params: {
      capacityMah: 300,
      chargeMa: 1000,
      cutoffMv: 1650,
      deltaVMv: 4,
      tempProtectC: 71
    }
  }
];

const DEFAULT_PROFILE_IDS = new Set(DEFAULT_PROFILES.map((p) => p.id));

function isDefaultProfile(profileId) {
  return DEFAULT_PROFILE_IDS.has(profileId);
}

function updateProfileButtonsState() {
  const select = document.getElementById("keeperProfileSelect");
  const deleteBtn = document.getElementById("btnDeleteProfile");
  if (!select || !deleteBtn) return;
  const profileId = select.value;
  const isDefault = isDefaultProfile(profileId);
  deleteBtn.disabled = isDefault;
  if (isDefault) {
    deleteBtn.title = "Standard factory presets cannot be deleted";
  } else {
    deleteBtn.title = "Delete this custom profile";
  }
}

function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILES_KEY);
    if (!raw) return DEFAULT_PROFILES.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PROFILES.slice();
  } catch (_) {
    return DEFAULT_PROFILES.slice();
  }
}

function saveProfiles(profiles) {
  try {
    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
  } catch (_) {}
}

function populateProfileSelect() {
  const select = document.getElementById("keeperProfileSelect");
  if (!select) return;
  const profiles = loadProfiles();
  const currentVal = select.value;
  select.innerHTML = "";

  const optGroupRace = document.createElement("optgroup");
  optGroupRace.label = "🏎️ Race Ready Target Balancer";
  const optGroupNative = document.createElement("optgroup");
  optGroupNative.label = "⚙️ Native SkyRC Hardware Modes";
  const optGroupCustom = document.createElement("optgroup");
  optGroupCustom.label = "⭐ Custom User Presets";

  profiles.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (!DEFAULT_PROFILE_IDS.has(p.id)) {
      optGroupCustom.appendChild(opt);
    } else if (p.mode === "RACE_READY") {
      optGroupRace.appendChild(opt);
    } else {
      optGroupNative.appendChild(opt);
    }
  });

  if (optGroupRace.children.length > 0) select.appendChild(optGroupRace);
  if (optGroupNative.children.length > 0) select.appendChild(optGroupNative);
  if (optGroupCustom.children.length > 0) select.appendChild(optGroupCustom);

  if (currentVal && profiles.some((p) => p.id === currentVal)) {
    select.value = currentVal;
  } else if (profiles.length > 0) {
    select.value = profiles[0].id;
  }

  updateProfileButtonsState();
}

function updateHeaderModePill() {
  const pill = document.getElementById("headerModePill");
  if (!pill) return;
  const mode = document.getElementById("keeperWorkingMode")?.value || "RACE_READY";
  const modeObj = WORKING_MODES[mode] || WORKING_MODES.RACE_READY;
  pill.textContent = `${modeObj.icon} ${modeObj.badge}`;
  pill.title = `Current Mode: ${modeObj.name} (Click to change)`;
}

function switchWorkingMode(modeId, syncProfile = false) {
  const targetMode = WORKING_MODES[modeId] || WORKING_MODES.RACE_READY;

  // Toggle parameter sections visibility
  Object.values(WORKING_MODES).forEach((m) => {
    const sec = document.getElementById(m.sectionId);
    if (sec) sec.style.display = m.id === targetMode.id ? "block" : "none";
  });

  // Update dropdown selection if needed
  const select = document.getElementById("keeperWorkingMode");
  if (select && select.value !== targetMode.id) {
    select.value = targetMode.id;
  }

  updateHeaderModePill();

  if (syncProfile) {
    const profiles = loadProfiles();
    const matching = profiles.find((p) => p.mode === targetMode.id);
    if (matching) {
      const profSelect = document.getElementById("keeperProfileSelect");
      if (profSelect) profSelect.value = matching.id;
      applyProfile(matching.id);
      return;
    }
  } else {
    // Keep profile dropdown aligned to the active mode family if user opens Presets
    const profiles = loadProfiles();
    const matching = profiles.find((p) => p.mode === targetMode.id);
    const profSelect = document.getElementById("keeperProfileSelect");
    if (matching && profSelect) {
      profSelect.value = matching.id;
    }
  }

  for (let i = 0; i < 4; i++) updateSlotCardUI(i);
  updatePairCardsUI();
  updateKeeperControlButtons();
  saveKeeperPrefs();
}

function parseSafeInt(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

function getCurrentModeParams(mode) {
  const tempProtectC = parseInt(document.getElementById("keeperTempProtectC")?.value, 10) || 71;
  switch (mode) {
    case "RACE_READY":
      return {
        pair1TargetV: document.getElementById("keeperPair1TargetV")?.value || "3.000",
        pair2TargetV: document.getElementById("keeperPair2TargetV")?.value || "3.000",
        linkPairs: document.getElementById("chkLinkPairs")?.checked,
        deadbandMv: parseInt(document.getElementById("keeperDeadbandMv")?.value, 10) || 5,
        chargeMa: parseInt(document.getElementById("keeperChargeMa")?.value, 10) || 800,
        dischargeMa: parseInt(document.getElementById("keeperDischargeMa")?.value, 10) || 1000,
        fineMa: parseInt(document.getElementById("keeperFineMa")?.value, 10) || 200,
        trickleMa: parseInt(document.getElementById("keeperTrickleMa")?.value, 10) || 30,
        settleSec: parseInt(document.getElementById("keeperSettleSec")?.value, 10) || 15,
        stallTimeoutMin: parseInt(document.getElementById("keeperStallTimeoutMin")?.value, 10) || 4,
        tempProtectC
      };
    case "CHARGE":
      return {
        chargeMa: parseInt(document.getElementById("mode0ChargeMa")?.value, 10) || 1000,
        cutoffMv: parseInt(document.getElementById("mode0CutoffMv")?.value, 10) || 1650,
        deltaVMv: parseSafeInt(document.getElementById("mode0DeltaVMv")?.value, 5),
        restartVoltMv: parseInt(document.getElementById("mode0RestartVoltMv")?.value, 10) || 1290,
        trickleMa: parseSafeInt(document.getElementById("mode0TrickleMa")?.value, 30),
        capacityMah: parseInt(document.getElementById("mode0CapacityMah")?.value, 10) || 3500,
        timerMin: parseSafeInt(document.getElementById("mode0TimerMin")?.value, 180),
        tempProtectC
      };
    case "DISCHARGE":
      return {
        dischargeMa: parseInt(document.getElementById("mode1DischargeMa")?.value, 10) || 1000,
        cutoffMv: parseInt(document.getElementById("mode1CutoffMv")?.value, 10) || 1000,
        stopCurrentMa: parseSafeInt(document.getElementById("mode1StopCurrentMa")?.value, 100),
        timerMin: parseSafeInt(document.getElementById("mode1TimerMin")?.value, 180),
        tempProtectC
      };
    case "CYCLE":
      return {
        cycleSeq: parseInt(document.getElementById("mode3CycleSequence")?.value, 10) || 3,
        cycleCount: parseInt(document.getElementById("mode3CycleCount")?.value, 10) || 1,
        chargeMa: parseInt(document.getElementById("mode3ChargeMa")?.value, 10) || 1000,
        dischargeMa: parseInt(document.getElementById("mode3DischargeMa")?.value, 10) || 1000,
        cutoffMv: parseInt(document.getElementById("mode3CutoffMv")?.value, 10) || 1650,
        dischargeCutoffMv: parseInt(document.getElementById("mode3DischargeCutoffMv")?.value, 10) || 1000,
        deltaVMv: parseSafeInt(document.getElementById("mode3DeltaVMv")?.value, 5),
        trickleMa: parseSafeInt(document.getElementById("mode3TrickleMa")?.value, 30),
        restDischMin: parseSafeInt(document.getElementById("mode3RestDischMin")?.value, 10),
        restChargeMin: parseSafeInt(document.getElementById("mode3RestChargeMin")?.value, 10),
        timerMin: parseSafeInt(document.getElementById("mode3TimerMin")?.value, 180),
        tempProtectC
      };
    case "BREAKIN":
      return {
        capacityMah: parseInt(document.getElementById("mode2CapacityMah")?.value, 10) || 1000,
        tempProtectC
      };
    case "TURBO":
      return {
        turboLevel: parseInt(document.getElementById("mode5TurboLevel")?.value, 10) || 4,
        chargeMa: parseInt(document.getElementById("mode5ChargeMa")?.value, 10) || 3000,
        cutoffMv: parseInt(document.getElementById("mode5CutoffMv")?.value, 10) || 1650,
        deltaVMv: parseInt(document.getElementById("mode5DeltaVMv")?.value, 10) || 4,
        tempProtectC
      };
    case "THREE_STAGE":
      return {
        stage1Ma: parseInt(document.getElementById("mode6Stage1Ma")?.value, 10) || 2000,
        stage1Pct: parseInt(document.getElementById("mode6Stage1Pct")?.value, 10) || 80,
        stage2Ma: parseInt(document.getElementById("mode6Stage2Ma")?.value, 10) || 800,
        cutoffMv: parseInt(document.getElementById("mode6CutoffMv")?.value, 10) || 1600,
        deltaVMv: parseInt(document.getElementById("mode6DeltaVMv")?.value, 10) || 4,
        trickleMa: parseInt(document.getElementById("mode6TrickleMa")?.value, 10) || 30,
        tempProtectC
      };
    case "MAXBOOST":
      return {
        capacityMah: parseInt(document.getElementById("mode4CapacityMah")?.value, 10) || 300,
        chargeMa: parseInt(document.getElementById("mode4ChargeMa")?.value, 10) || 1000,
        cutoffMv: parseInt(document.getElementById("mode4CutoffMv")?.value, 10) || 1650,
        deltaVMv: parseInt(document.getElementById("mode4DeltaVMv")?.value, 10) || 4,
        tempProtectC
      };
    default:
      return { tempProtectC };
  }
}

function applyProfile(profileId) {
  const profiles = loadProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return;

  const modeSelect = document.getElementById("keeperWorkingMode");
  if (modeSelect) modeSelect.value = profile.mode;
  switchWorkingMode(profile.mode, false);

  const params = profile.params || {};

  if (profile.mode === "RACE_READY") {
    if (params.pair1TargetV !== undefined) {
      const p1 = document.getElementById("keeperPair1TargetV");
      if (p1) p1.value = params.pair1TargetV;
    }
    if (params.pair2TargetV !== undefined) {
      const p2 = document.getElementById("keeperPair2TargetV");
      if (p2) p2.value = params.pair2TargetV;
    }
    if (params.linkPairs !== undefined) {
      const link = document.getElementById("chkLinkPairs");
      if (link) link.checked = !!params.linkPairs;
    }
    if (params.deadbandMv !== undefined) {
      const el = document.getElementById("keeperDeadbandMv");
      if (el) el.value = params.deadbandMv;
    }
    if (params.chargeMa !== undefined) {
      const el = document.getElementById("keeperChargeMa");
      if (el) el.value = params.chargeMa;
    }
    if (params.dischargeMa !== undefined) {
      const el = document.getElementById("keeperDischargeMa");
      if (el) el.value = params.dischargeMa;
    }
    if (params.fineMa !== undefined) {
      const el = document.getElementById("keeperFineMa");
      if (el) el.value = params.fineMa;
    }
    if (params.trickleMa !== undefined) {
      const el = document.getElementById("keeperTrickleMa");
      if (el) el.value = params.trickleMa;
    }
    if (params.settleSec !== undefined) {
      const el = document.getElementById("keeperSettleSec");
      if (el) el.value = params.settleSec;
    }
    if (params.stallTimeoutMin !== undefined) {
      const el = document.getElementById("keeperStallTimeoutMin");
      if (el) el.value = params.stallTimeoutMin;
    }
    const p1 = document.getElementById("keeperPair1TargetV");
    if (p1) syncPairTargets(p1);
  } else if (profile.mode === "CHARGE") {
    if (params.chargeMa !== undefined && document.getElementById("mode0ChargeMa")) document.getElementById("mode0ChargeMa").value = params.chargeMa;
    if (params.cutoffMv !== undefined && document.getElementById("mode0CutoffMv")) document.getElementById("mode0CutoffMv").value = params.cutoffMv;
    if (params.deltaVMv !== undefined && document.getElementById("mode0DeltaVMv")) document.getElementById("mode0DeltaVMv").value = params.deltaVMv;
    if (params.restartVoltMv !== undefined && document.getElementById("mode0RestartVoltMv")) document.getElementById("mode0RestartVoltMv").value = params.restartVoltMv;
    if (params.trickleMa !== undefined && document.getElementById("mode0TrickleMa")) document.getElementById("mode0TrickleMa").value = params.trickleMa;
    if (params.capacityMah !== undefined && document.getElementById("mode0CapacityMah")) document.getElementById("mode0CapacityMah").value = params.capacityMah;
    if (params.timerMin !== undefined && document.getElementById("mode0TimerMin")) document.getElementById("mode0TimerMin").value = params.timerMin;
  } else if (profile.mode === "DISCHARGE") {
    if (params.dischargeMa !== undefined && document.getElementById("mode1DischargeMa")) document.getElementById("mode1DischargeMa").value = params.dischargeMa;
    if (params.cutoffMv !== undefined && document.getElementById("mode1CutoffMv")) document.getElementById("mode1CutoffMv").value = params.cutoffMv;
    if (params.stopCurrentMa !== undefined && document.getElementById("mode1StopCurrentMa")) document.getElementById("mode1StopCurrentMa").value = params.stopCurrentMa;
    if (params.timerMin !== undefined && document.getElementById("mode1TimerMin")) document.getElementById("mode1TimerMin").value = params.timerMin;
  } else if (profile.mode === "CYCLE") {
    if (params.cycleSeq !== undefined && document.getElementById("mode3CycleSequence")) document.getElementById("mode3CycleSequence").value = params.cycleSeq;
    if (params.cycleCount !== undefined && document.getElementById("mode3CycleCount")) document.getElementById("mode3CycleCount").value = params.cycleCount;
    if (params.chargeMa !== undefined && document.getElementById("mode3ChargeMa")) document.getElementById("mode3ChargeMa").value = params.chargeMa;
    if (params.dischargeMa !== undefined && document.getElementById("mode3DischargeMa")) document.getElementById("mode3DischargeMa").value = params.dischargeMa;
    if (params.cutoffMv !== undefined && document.getElementById("mode3CutoffMv")) document.getElementById("mode3CutoffMv").value = params.cutoffMv;
    if (params.dischargeCutoffMv !== undefined && document.getElementById("mode3DischargeCutoffMv")) document.getElementById("mode3DischargeCutoffMv").value = params.dischargeCutoffMv;
    if (params.deltaVMv !== undefined && document.getElementById("mode3DeltaVMv")) document.getElementById("mode3DeltaVMv").value = params.deltaVMv;
    if (params.trickleMa !== undefined && document.getElementById("mode3TrickleMa")) document.getElementById("mode3TrickleMa").value = params.trickleMa;
    if (params.restDischMin !== undefined && document.getElementById("mode3RestDischMin")) document.getElementById("mode3RestDischMin").value = params.restDischMin;
    if (params.restChargeMin !== undefined && document.getElementById("mode3RestChargeMin")) document.getElementById("mode3RestChargeMin").value = params.restChargeMin;
    if (params.timerMin !== undefined && document.getElementById("mode3TimerMin")) document.getElementById("mode3TimerMin").value = params.timerMin;
  } else if (profile.mode === "BREAKIN") {
    if (params.capacityMah !== undefined) {
      const capEl = document.getElementById("mode2CapacityMah");
      if (capEl) {
        capEl.value = params.capacityMah;
        const chg = Math.round(params.capacityMah * 0.1);
        const dis = Math.round(params.capacityMah * 0.2);
        if (document.getElementById("mode2ChargeMa")) document.getElementById("mode2ChargeMa").value = chg;
        if (document.getElementById("mode2DischargeMa")) document.getElementById("mode2DischargeMa").value = dis;
      }
    }
  } else if (profile.mode === "TURBO") {
    if (params.turboLevel !== undefined && document.getElementById("mode5TurboLevel")) {
      document.getElementById("mode5TurboLevel").value = params.turboLevel;
      const turboRates = [1500, 1800, 2000, 2500, 3000];
      if (document.getElementById("mode5ChargeMa")) document.getElementById("mode5ChargeMa").value = turboRates[params.turboLevel] || 3000;
    }
    if (params.cutoffMv !== undefined && document.getElementById("mode5CutoffMv")) document.getElementById("mode5CutoffMv").value = params.cutoffMv;
    if (params.deltaVMv !== undefined && document.getElementById("mode5DeltaVMv")) document.getElementById("mode5DeltaVMv").value = params.deltaVMv;
  } else if (profile.mode === "THREE_STAGE") {
    if (params.stage1Ma !== undefined && document.getElementById("mode6Stage1Ma")) document.getElementById("mode6Stage1Ma").value = params.stage1Ma;
    if (params.stage1Pct !== undefined && document.getElementById("mode6Stage1Pct")) document.getElementById("mode6Stage1Pct").value = params.stage1Pct;
    if (params.stage2Ma !== undefined && document.getElementById("mode6Stage2Ma")) document.getElementById("mode6Stage2Ma").value = params.stage2Ma;
    if (params.cutoffMv !== undefined && document.getElementById("mode6CutoffMv")) document.getElementById("mode6CutoffMv").value = params.cutoffMv;
    if (params.deltaVMv !== undefined && document.getElementById("mode6DeltaVMv")) document.getElementById("mode6DeltaVMv").value = params.deltaVMv;
    if (params.trickleMa !== undefined && document.getElementById("mode6TrickleMa")) document.getElementById("mode6TrickleMa").value = params.trickleMa;
  } else if (profile.mode === "MAXBOOST") {
    if (params.capacityMah !== undefined && document.getElementById("mode4CapacityMah")) document.getElementById("mode4CapacityMah").value = params.capacityMah;
    if (params.chargeMa !== undefined && document.getElementById("mode4ChargeMa")) document.getElementById("mode4ChargeMa").value = params.chargeMa;
    if (params.cutoffMv !== undefined && document.getElementById("mode4CutoffMv")) document.getElementById("mode4CutoffMv").value = params.cutoffMv;
    if (params.deltaVMv !== undefined && document.getElementById("mode4DeltaVMv")) document.getElementById("mode4DeltaVMv").value = params.deltaVMv;
  }

  if (params.tempProtectC !== undefined) {
    const el = document.getElementById("keeperTempProtectC");
    if (el) {
      el.value = params.tempProtectC;
      updateTempCutoffNoteUI();
    }
  }

  saveKeeperPrefs();
  try {
    localStorage.setItem("skyrc_nc3000_active_profile", profileId);
  } catch (_) {}

  const profSelect = document.getElementById("keeperProfileSelect");
  if (profSelect && profSelect.value !== profileId) {
    profSelect.value = profileId;
  }
  updateProfileButtonsState();

  // Tactile micro-interaction feedback via GSAP
  if (window.gsap) {
    const activeSection = document.getElementById(WORKING_MODES[profile.mode]?.sectionId);
    if (activeSection) {
      gsap.fromTo(activeSection, { opacity: 0.7, y: 4 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" });
    }
  }

  appendLog("SYS", null, null, `Applied Profile: "${profile.name}" (${WORKING_MODES[profile.mode]?.name || profile.mode}).`);
}

async function saveCurrentAsNewProfile() {
  const mode = document.getElementById("keeperWorkingMode")?.value || "RACE_READY";
  const defaultName = `${WORKING_MODES[mode]?.icon || "⚙️"} Custom ${WORKING_MODES[mode]?.name || mode} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
  const name = await showPromptModal({
    title: "💾 Save New Profile",
    message: "Enter a name for this new profile:",
    defaultValue: defaultName,
    confirmText: "Save Profile"
  });
  if (!name || !name.trim()) return;

  const newProfile = {
    id: `custom_${Date.now()}`,
    name: name.trim(),
    mode,
    params: getCurrentModeParams(mode)
  };

  const profiles = loadProfiles();
  profiles.push(newProfile);
  saveProfiles(profiles);
  populateProfileSelect();

  const select = document.getElementById("keeperProfileSelect");
  if (select) select.value = newProfile.id;
  try {
    localStorage.setItem("skyrc_nc3000_active_profile", newProfile.id);
  } catch (_) {}

  appendLog("SYS", null, null, `Created and saved new profile: "${newProfile.name}".`);
  showToast(`Profile "${newProfile.name}" saved!`, "success");
}

function overwriteCurrentProfile() {
  const select = document.getElementById("keeperProfileSelect");
  if (!select) return;
  const profileId = select.value;
  const profiles = loadProfiles();
  const idx = profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) return;

  const currentMode = document.getElementById("keeperWorkingMode")?.value || "RACE_READY";
  profiles[idx].mode = currentMode;
  profiles[idx].params = getCurrentModeParams(currentMode);

  saveProfiles(profiles);
  appendLog("SYS", null, null, `Overwrote profile settings for: "${profiles[idx].name}".`);

  if (window.gsap) {
    const btn = document.getElementById("btnOverwriteProfile");
    if (btn) gsap.fromTo(btn, { backgroundColor: "rgba(16, 185, 129, 0.4)" }, { backgroundColor: "", duration: 0.5 });
  }
  showToast(`Profile "${profiles[idx].name}" updated with current settings!`, "success");
}

async function deleteCurrentProfile() {
  const select = document.getElementById("keeperProfileSelect");
  if (!select) return;
  const profileId = select.value;

  // Protect standard / factory presets from deletion
  if (DEFAULT_PROFILE_IDS.has(profileId)) {
    showToast("Standard factory presets cannot be deleted.", "warning");
    return;
  }

  const profiles = loadProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return;

  const confirmed = await showConfirmModal({
    title: "🗑️ Delete Profile",
    message: `Are you sure you want to delete profile "${profile.name}"? This action cannot be undone.`,
    confirmText: "Delete",
    isDanger: true
  });
  if (!confirmed) return;

  const filtered = profiles.filter((p) => p.id !== profileId);
  saveProfiles(filtered.length > 0 ? filtered : DEFAULT_PROFILES.slice());
  populateProfileSelect();
  const remaining = loadProfiles();
  if (remaining.length > 0) {
    applyProfile(remaining[0].id);
  }
  showToast(`Deleted profile "${profile.name}".`, "info");
}

async function resetDefaultProfiles() {
  const confirmed = await showConfirmModal({
    title: "↺ Reset Profiles",
    message: "Reset all saved profiles back to factory defaults? Any custom profiles will be removed.",
    confirmText: "Reset Defaults",
    isDanger: true
  });
  if (!confirmed) return;
  saveProfiles(DEFAULT_PROFILES.slice());
  populateProfileSelect();
  applyProfile(DEFAULT_PROFILES[0].id);
  appendLog("SYS", null, null, "All profiles reset to factory defaults.");
  showToast("All profiles reset to factory defaults.", "info");
}

function updateTempCutoffNoteUI() {
  const tempEl = document.getElementById("keeperTempProtectC");
  const noteEl = document.getElementById("tempCutoffNote");
  if (!tempEl || !noteEl) return;
  const val = parseInt(tempEl.value, 10);
  if (!val || val >= 71) {
    noteEl.textContent = "71 = OFF (NTC Bypass)";
  } else {
    noteEl.textContent = `${val}°C Hardware Cutoff`;
  }
}

function saveKeeperPrefs() {
  try {
    const prefs = {
      prefsSchemaVersion: 3,
      keeperWorkingMode: document.getElementById("keeperWorkingMode")?.value || "RACE_READY",
      pair1TargetV: document.getElementById("keeperPair1TargetV")?.value,
      pair2TargetV: document.getElementById("keeperPair2TargetV")?.value,
      chkLinkPairs: document.getElementById("chkLinkPairs")?.checked,
      keeperChargeMa: document.getElementById("keeperChargeMa")?.value,
      keeperDischargeMa: document.getElementById("keeperDischargeMa")?.value,
      keeperFineMa: document.getElementById("keeperFineMa")?.value,
      keeperTrickleMa: document.getElementById("keeperTrickleMa")?.value,
      keeperSettleSec: document.getElementById("keeperSettleSec")?.value,
      keeperDeadbandMv: document.getElementById("keeperDeadbandMv")?.value,
      keeperStallTimeoutMin: document.getElementById("keeperStallTimeoutMin")?.value,
      keeperTempProtectC: document.getElementById("keeperTempProtectC")?.value,
      mode0ChargeMa: document.getElementById("mode0ChargeMa")?.value,
      mode0CutoffMv: document.getElementById("mode0CutoffMv")?.value,
      mode0DeltaVMv: document.getElementById("mode0DeltaVMv")?.value,
      mode0RestartVoltMv: document.getElementById("mode0RestartVoltMv")?.value,
      mode0TrickleMa: document.getElementById("mode0TrickleMa")?.value,
      mode0CapacityMah: document.getElementById("mode0CapacityMah")?.value,
      mode0TimerMin: document.getElementById("mode0TimerMin")?.value,
      mode1DischargeMa: document.getElementById("mode1DischargeMa")?.value,
      mode1CutoffMv: document.getElementById("mode1CutoffMv")?.value,
      mode1StopCurrentMa: document.getElementById("mode1StopCurrentMa")?.value,
      mode1TimerMin: document.getElementById("mode1TimerMin")?.value,
      mode3CycleSequence: document.getElementById("mode3CycleSequence")?.value,
      mode3CycleCount: document.getElementById("mode3CycleCount")?.value,
      mode3ChargeMa: document.getElementById("mode3ChargeMa")?.value,
      mode3DischargeMa: document.getElementById("mode3DischargeMa")?.value,
      mode3CutoffMv: document.getElementById("mode3CutoffMv")?.value,
      mode3DischargeCutoffMv: document.getElementById("mode3DischargeCutoffMv")?.value,
      mode3DeltaVMv: document.getElementById("mode3DeltaVMv")?.value,
      mode3TrickleMa: document.getElementById("mode3TrickleMa")?.value,
      mode3TimerMin: document.getElementById("mode3TimerMin")?.value,
      mode3RestDischMin: document.getElementById("mode3RestDischMin")?.value,
      mode3RestChargeMin: document.getElementById("mode3RestChargeMin")?.value,
      mode2CapacityMah: document.getElementById("mode2CapacityMah")?.value,
      mode5TurboLevel: document.getElementById("mode5TurboLevel")?.value,
      mode5CutoffMv: document.getElementById("mode5CutoffMv")?.value,
      mode5DeltaVMv: document.getElementById("mode5DeltaVMv")?.value,
      mode6Stage1Ma: document.getElementById("mode6Stage1Ma")?.value,
      mode6Stage1Pct: document.getElementById("mode6Stage1Pct")?.value,
      mode6Stage2Ma: document.getElementById("mode6Stage2Ma")?.value,
      mode6CutoffMv: document.getElementById("mode6CutoffMv")?.value,
      mode6DeltaVMv: document.getElementById("mode6DeltaVMv")?.value,
      mode6TrickleMa: document.getElementById("mode6TrickleMa")?.value,
      mode4CapacityMah: document.getElementById("mode4CapacityMah")?.value,
      mode4ChargeMa: document.getElementById("mode4ChargeMa")?.value,
      mode4CutoffMv: document.getElementById("mode4CutoffMv")?.value,
      mode4DeltaVMv: document.getElementById("mode4DeltaVMv")?.value,
      chkSlot1: isSlotEnabled(0),
      chkSlot2: isSlotEnabled(1),
      chkSlot3: isSlotEnabled(2),
      chkSlot4: isSlotEnabled(3),
      slotEnabled: [isSlotEnabled(0), isSlotEnabled(1), isSlotEnabled(2), isSlotEnabled(3)],
      audioAlertsEnabled,
      isPitMode: document.body.classList.contains("pit-mode")
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

function loadKeeperPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    const p1 = document.getElementById("keeperPair1TargetV");
    const p2 = document.getElementById("keeperPair2TargetV");
    const link = document.getElementById("chkLinkPairs");
    const chg = document.getElementById("keeperChargeMa");
    const dis = document.getElementById("keeperDischargeMa");
    const fine = document.getElementById("keeperFineMa");
    const tri = document.getElementById("keeperTrickleMa");
    const setl = document.getElementById("keeperSettleSec") || document.getElementById("keeperSettleMs");
    const db = document.getElementById("keeperDeadbandMv");
    const stall = document.getElementById("keeperStallTimeoutMin");
    const tempP = document.getElementById("keeperTempProtectC");

    // Migrate legacy v1/v2 defaults to precision racing algorithm defaults
    if ((prefs.prefsSchemaVersion || 1) < 3) {
      prefs.keeperDeadbandMv = "5"; // 5mV per cell = 10mV combined pair for accurate race targets
      if (!prefs.keeperFineMa || parseInt(prefs.keeperFineMa, 10) < 200) prefs.keeperFineMa = "200";
      if (!prefs.keeperTempProtectC || parseInt(prefs.keeperTempProtectC, 10) <= 55) prefs.keeperTempProtectC = "71";
      prefs.prefsSchemaVersion = 3;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }

    if (prefs.pair1TargetV && p1) p1.value = prefs.pair1TargetV;
    if (prefs.pair2TargetV && p2) p2.value = prefs.pair2TargetV;
    if (prefs.chkLinkPairs !== undefined && link) link.checked = prefs.chkLinkPairs;
    if (prefs.keeperChargeMa && chg) chg.value = prefs.keeperChargeMa;
    if (prefs.keeperDischargeMa && dis) dis.value = prefs.keeperDischargeMa;
    if (prefs.keeperFineMa && fine) fine.value = Math.max(200, parseInt(prefs.keeperFineMa, 10) || 200);
    if (prefs.keeperTrickleMa && tri) tri.value = prefs.keeperTrickleMa;
    if ((prefs.keeperSettleSec || prefs.keeperSettleMs) && setl) setl.value = prefs.keeperSettleSec || prefs.keeperSettleMs;
    if (prefs.keeperDeadbandMv && db) db.value = prefs.keeperDeadbandMv;
    if (prefs.keeperStallTimeoutMin && stall) stall.value = prefs.keeperStallTimeoutMin;
    if (prefs.keeperTempProtectC && tempP) tempP.value = prefs.keeperTempProtectC;

    // Restore Native Mode fields
    if (prefs.mode0ChargeMa && document.getElementById("mode0ChargeMa")) document.getElementById("mode0ChargeMa").value = prefs.mode0ChargeMa;
    if (prefs.mode0CutoffMv && document.getElementById("mode0CutoffMv")) document.getElementById("mode0CutoffMv").value = prefs.mode0CutoffMv;
    if (prefs.mode0DeltaVMv && document.getElementById("mode0DeltaVMv")) document.getElementById("mode0DeltaVMv").value = prefs.mode0DeltaVMv;
    if (prefs.mode0RestartVoltMv && document.getElementById("mode0RestartVoltMv")) document.getElementById("mode0RestartVoltMv").value = prefs.mode0RestartVoltMv;
    if (prefs.mode0TrickleMa && document.getElementById("mode0TrickleMa")) document.getElementById("mode0TrickleMa").value = prefs.mode0TrickleMa;
    if (prefs.mode0CapacityMah && document.getElementById("mode0CapacityMah")) document.getElementById("mode0CapacityMah").value = prefs.mode0CapacityMah;
    if (prefs.mode0TimerMin !== undefined && prefs.mode0TimerMin !== "" && document.getElementById("mode0TimerMin")) document.getElementById("mode0TimerMin").value = prefs.mode0TimerMin;
    if (prefs.mode1DischargeMa && document.getElementById("mode1DischargeMa")) document.getElementById("mode1DischargeMa").value = prefs.mode1DischargeMa;
    if (prefs.mode1CutoffMv && document.getElementById("mode1CutoffMv")) document.getElementById("mode1CutoffMv").value = prefs.mode1CutoffMv;
    if (prefs.mode1StopCurrentMa !== undefined && prefs.mode1StopCurrentMa !== "" && document.getElementById("mode1StopCurrentMa")) document.getElementById("mode1StopCurrentMa").value = prefs.mode1StopCurrentMa;
    if (prefs.mode1TimerMin !== undefined && prefs.mode1TimerMin !== "" && document.getElementById("mode1TimerMin")) document.getElementById("mode1TimerMin").value = prefs.mode1TimerMin;
    if (prefs.mode3CycleSequence && document.getElementById("mode3CycleSequence")) document.getElementById("mode3CycleSequence").value = prefs.mode3CycleSequence;
    if (prefs.mode3CycleCount && document.getElementById("mode3CycleCount")) document.getElementById("mode3CycleCount").value = prefs.mode3CycleCount;
    if (prefs.mode3ChargeMa && document.getElementById("mode3ChargeMa")) document.getElementById("mode3ChargeMa").value = prefs.mode3ChargeMa;
    if (prefs.mode3DischargeMa && document.getElementById("mode3DischargeMa")) document.getElementById("mode3DischargeMa").value = prefs.mode3DischargeMa;
    if (prefs.mode3CutoffMv && document.getElementById("mode3CutoffMv")) document.getElementById("mode3CutoffMv").value = prefs.mode3CutoffMv;
    if (prefs.mode3DischargeCutoffMv && document.getElementById("mode3DischargeCutoffMv")) document.getElementById("mode3DischargeCutoffMv").value = prefs.mode3DischargeCutoffMv;
    if (prefs.mode3DeltaVMv && document.getElementById("mode3DeltaVMv")) document.getElementById("mode3DeltaVMv").value = prefs.mode3DeltaVMv;
    if (prefs.mode3TrickleMa !== undefined && prefs.mode3TrickleMa !== "" && document.getElementById("mode3TrickleMa")) document.getElementById("mode3TrickleMa").value = prefs.mode3TrickleMa;
    if (prefs.mode3TimerMin !== undefined && prefs.mode3TimerMin !== "" && document.getElementById("mode3TimerMin")) document.getElementById("mode3TimerMin").value = prefs.mode3TimerMin;
    if (prefs.mode3RestDischMin && document.getElementById("mode3RestDischMin")) document.getElementById("mode3RestDischMin").value = prefs.mode3RestDischMin;
    if (prefs.mode3RestChargeMin && document.getElementById("mode3RestChargeMin")) document.getElementById("mode3RestChargeMin").value = prefs.mode3RestChargeMin;
    if (prefs.mode2CapacityMah && document.getElementById("mode2CapacityMah")) {
      document.getElementById("mode2CapacityMah").value = prefs.mode2CapacityMah;
      const cap = parseInt(prefs.mode2CapacityMah, 10) || 1000;
      if (document.getElementById("mode2ChargeMa")) document.getElementById("mode2ChargeMa").value = Math.round(cap * 0.1);
      if (document.getElementById("mode2DischargeMa")) document.getElementById("mode2DischargeMa").value = Math.round(cap * 0.2);
    }
    if (prefs.mode5TurboLevel && document.getElementById("mode5TurboLevel")) {
      document.getElementById("mode5TurboLevel").value = prefs.mode5TurboLevel;
      const turboRates = [1500, 1800, 2000, 2500, 3000];
      if (document.getElementById("mode5ChargeMa")) document.getElementById("mode5ChargeMa").value = turboRates[prefs.mode5TurboLevel] || 3000;
    }
    if (prefs.mode5CutoffMv && document.getElementById("mode5CutoffMv")) document.getElementById("mode5CutoffMv").value = prefs.mode5CutoffMv;
    if (prefs.mode5DeltaVMv && document.getElementById("mode5DeltaVMv")) document.getElementById("mode5DeltaVMv").value = prefs.mode5DeltaVMv;
    if (prefs.mode6Stage1Ma && document.getElementById("mode6Stage1Ma")) document.getElementById("mode6Stage1Ma").value = prefs.mode6Stage1Ma;
    if (prefs.mode6Stage1Pct && document.getElementById("mode6Stage1Pct")) document.getElementById("mode6Stage1Pct").value = prefs.mode6Stage1Pct;
    if (prefs.mode6Stage2Ma && document.getElementById("mode6Stage2Ma")) document.getElementById("mode6Stage2Ma").value = prefs.mode6Stage2Ma;
    if (prefs.mode6CutoffMv && document.getElementById("mode6CutoffMv")) document.getElementById("mode6CutoffMv").value = prefs.mode6CutoffMv;
    if (prefs.mode6DeltaVMv && document.getElementById("mode6DeltaVMv")) document.getElementById("mode6DeltaVMv").value = prefs.mode6DeltaVMv;
    if (prefs.mode6TrickleMa && document.getElementById("mode6TrickleMa")) document.getElementById("mode6TrickleMa").value = prefs.mode6TrickleMa;
    if (prefs.mode4CapacityMah && document.getElementById("mode4CapacityMah")) document.getElementById("mode4CapacityMah").value = prefs.mode4CapacityMah;
    if (prefs.mode4ChargeMa && document.getElementById("mode4ChargeMa")) document.getElementById("mode4ChargeMa").value = prefs.mode4ChargeMa;
    if (prefs.mode4CutoffMv && document.getElementById("mode4CutoffMv")) document.getElementById("mode4CutoffMv").value = prefs.mode4CutoffMv;
    if (prefs.mode4DeltaVMv && document.getElementById("mode4DeltaVMv")) document.getElementById("mode4DeltaVMv").value = prefs.mode4DeltaVMv;

    if (prefs.keeperWorkingMode) {
      const modeSelect = document.getElementById("keeperWorkingMode");
      if (modeSelect) modeSelect.value = prefs.keeperWorkingMode;
      switchWorkingMode(prefs.keeperWorkingMode, false);
    }

    updateTempCutoffNoteUI();

    [1, 2, 3, 4].forEach((slot) => {
      const idx = slot - 1;
      let val = true;
      if (prefs.slotEnabled && Array.isArray(prefs.slotEnabled) && prefs.slotEnabled[idx] !== undefined) {
        val = !!prefs.slotEnabled[idx];
      } else if (prefs[`chkSlot${slot}`] !== undefined) {
        val = !!prefs[`chkSlot${slot}`];
      }
      setSlotEnabled(idx, val, false);
    });
    syncAllSlotCheckboxesUI();

    if (prefs.audioAlertsEnabled !== undefined) {
      audioAlertsEnabled = prefs.audioAlertsEnabled;
      updateAudioButtonUI();
    }
    if (prefs.isPitMode) {
      document.body.classList.add("pit-mode");
      updatePitModeButtonUI();
    }
    if (p1) syncPairTargets(p1);
  } catch (_) {}
}

function updateAudioButtonUI() {
  const btn = document.getElementById("btnToggleAudio");
  if (!btn) return;
  btn.textContent = audioAlertsEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF";
  btn.className = audioAlertsEnabled ? "btn small" : "btn small secondary";
}

function updatePitModeButtonUI() {
  const btn = document.getElementById("btnTogglePitMode");
  if (!btn) return;
  const isPit = document.body.classList.contains("pit-mode");
  btn.textContent = isPit ? "🎛️ Normal View" : "🎛️ Pit Display Mode";
  btn.title = isPit ? "Switch back to standard workbench view" : "Switch to high-contrast enlarged pit display view";
}

const keeperState = {
  active: false,
  pairs: [
    { active: false },
    { active: false }
  ],
  pollTimer: null,
  pollCursor: 0,
  slots: [0, 1, 2, 3].map((slotIdx) => ({
    slotIdx,
    phase: "IDLE", // IDLE | EVAL_OCV | CHARGING | DISCHARGING | SETTLING | HOLDING_READY | STALLED | NO_BATTERY
    phaseDetail: "Standby",
    lastCmdTime: 0,
    settleUntilTime: 0,
    passCount: 0,
    activeCommandedCurrentMa: 0,
    chargeStartTime: 0,
    dischargeStartTime: 0,
    lastProgressV: 0,
    lastProgressTime: 0,
    consecutiveSettlingFails: 0,
    wasBatteryPresent: false,
    debounceUntilTime: 0,
    hasSyncedDone: false,
    latchGraceUntil: 0,
    outOfBandPolls: 0,
    thermalFaultCount: 0,
    isStalled: false,
    stallReason: ""
  }))
};

// Map slot bitmask (0x01, 0x02, 0x04, 0x08) to 0..3 (StaticUtils.transformMasqueNc3000)
function maskToSlotIndex(mask) {
  if (mask === 0x01) return 0;
  if (mask === 0x02) return 1;
  if (mask === 0x04) return 2;
  if (mask === 0x08) return 3;
  return -1;
}

// Exact decoder for 0x91 response based on NcBean.setNc3000Data(byte[]) in apk/classes4.dex
function parseAndApplyNc3000SlotTelemetry(bytes) {
  if (!bytes || bytes.length < 19) return null;

  const mask = bytes[3] & 0xff;
  const slotIdx = maskToSlotIndex(mask);
  if (slotIdx < 0) return null;

  const currentMa = ((bytes[4] & 0xff) << 8) | (bytes[5] & 0xff);
  const voltageMv = ((bytes[6] & 0xff) << 8) | (bytes[7] & 0xff);
  // Byte 8 is hardcoded 0x00 by firmware; Byte 9 is -ΔV peak detect drop in mV (struct offset +0x284)
  const deltaVMv = ((bytes[8] & 0xff) << 8) | (bytes[9] & 0xff);
  const capacityMah = ((bytes[10] & 0xff) << 8) | (bytes[11] & 0xff);

  // In NC3000 Pro firmware, the slot telemetry struct always formats:
  // [12..15]=uint32 duration (sec), [16..17]=uint16 IR (mOhm), [18]=chargerStatu, [19]=mode, [20]=errorState
  const durationSec =
    ((bytes[12] & 0xff) * 16777216) +
    ((bytes[13] & 0xff) << 16) +
    ((bytes[14] & 0xff) << 8) +
    (bytes[15] & 0xff);
  const irMohm = bytes.length >= 18 ? (((bytes[16] & 0xff) << 8) | (bytes[17] & 0xff)) : 0;
  const chargerStatu = bytes.length >= 19 ? (bytes[18] & 0xff) : 0;
  const mode = bytes.length >= 20 ? (bytes[19] & 0xff) : 0;
  const errorState = bytes.length >= 21 ? (bytes[20] & 0xff) : 0;

  const hasBattery = voltageMv > 50; // NcBean treats 0 or 1 mV as empty slot
  const chargerStatusLabel = !hasBattery
    ? "Empty Slot"
    : errorState > 0
      ? NC3000_ERROR_STATE_NAMES[errorState] || `Error 0x${errorState.toString(16).toUpperCase()}`
      : NC3000_CHARGER_STATUS_NAMES[chargerStatu] || `State ${chargerStatu}`;
  const modeLabel = NC3000_MODE_NAMES[mode] || `Mode ${mode}`;

  const info = {
    slotIdx,
    mask,
    hasBattery,
    voltageMv,
    currentMa,
    deltaVMv,
    capacityMah,
    durationSec,
    irMohm,
    chargerStatu,
    chargerStatusLabel,
    mode,
    modeLabel,
    errorState,
    updatedAt: Date.now()
  };

  slotTelemetry[slotIdx] = info;

  // Telemetry buffer ingestion & automatic reset on cell insertion
  if (typeof telemetryHistory !== "undefined") {
    const wasBatteryPresent = telemetryHistory.lastHasBattery[slotIdx];
    if (!wasBatteryPresent && info.hasBattery) {
      if (typeof resetSlotTelemetry === "function") {
        resetSlotTelemetry(slotIdx, "Battery inserted");
      }
    }
    telemetryHistory.lastHasBattery[slotIdx] = info.hasBattery;

    if (info.hasBattery && !telemetryHistory.isPaused) {
      const sample = {
        t: info.updatedAt,
        elapsedSec: info.durationSec || 0,
        v: +(info.voltageMv / 1000).toFixed(3),
        i: info.currentMa,
        ir: info.irMohm,
        mah: info.capacityMah,
        deltaV: info.deltaVMv,
        status: info.chargerStatusLabel,
        mode: info.modeLabel
      };
      const slotArr = telemetryHistory.slots[slotIdx];
      slotArr.push(sample);
      if (slotArr.length > telemetryHistory.maxPoints) {
        slotArr.shift();
      }
      if (info.capacityMah > telemetryHistory.maxCapacity[slotIdx]) {
        telemetryHistory.maxCapacity[slotIdx] = info.capacityMah;
      }
      if (telemetryHistory.selectedSlotView === slotIdx || telemetryHistory.selectedSlotView === -1) {
        if (typeof updateAnalyticsKpis === "function") {
          updateAnalyticsKpis(slotIdx);
        }
        if (typeof requestTelemetryChartUpdate === "function") {
          requestTelemetryChartUpdate();
        }
      }
    }
  }

  const pairIdx = slotIdx < 2 ? 0 : 1;
  if (!keeperState.pairs) {
    keeperState.pairs = [{ active: false }, { active: false }];
  }

  const cfg = getKeeperConfig();
  const isPairActive = !!keeperState.pairs[pairIdx]?.active;
  const isRaceReadySession = isPairActive && cfg.mode === "RACE_READY";
  const isUserStopCoolingDown = Date.now() < (keeperState.pairs[pairIdx]?.userStoppedUntil || 0);

  // Active hardware mode detection and auto-monitoring synchronization:
  // chargerStatu: 0=Standby/Idle, 1=Ready, 2=Charging, 3=Discharging, 4=Resting, 5..7=Done
  // Hardware is running if actively charging, discharging, resting between cycles, or done.
  // Hardware is ready/configured if in Ready state (1) or if a specific mode > 0 is selected.
  const detectedModeId = NC3000_HW_MODE_TO_ID[info.mode] || "CHARGE";
  const isHwRunning = info.hasBattery && (info.chargerStatu >= 2 || info.currentMa > 15);
  const isHwReady = info.hasBattery && info.chargerStatu === 1;
  const isHwConfigured = info.hasBattery && info.mode > 0;
  const isHwActive = isHwRunning || isHwReady || (isHwConfigured && !keeperState.active);

  if (isHwActive && !isRaceReadySession && !isUserStopCoolingDown) {
    // If webapp is idle or in a different mode, adopt the hardware mode
    if (!keeperState.active || (cfg.mode !== detectedModeId && !isPairActive)) {
      switchWorkingMode(detectedModeId, false);
      appendLog(
        "SYS",
        null,
        null,
        `[Hardware Sync] Detected active hardware session on Slot ${slotIdx + 1} (Pair ${pairIdx + 1}): Mode ${info.modeLabel} (${info.chargerStatusLabel}). Web UI synchronized to ${detectedModeId}.`
      );
    } else if (!isPairActive && isHwRunning) {
      appendLog(
        "SYS",
        null,
        null,
        `[Hardware Sync] Attached to active hardware session on Slot ${slotIdx + 1} (Pair ${pairIdx + 1}): Mode ${info.modeLabel} (${info.chargerStatusLabel}).`
      );
    }

    // Activate pair monitoring if hardware is actively running (charging/discharging/resting/done)
    if (isHwRunning) {
      keeperState.pairs[pairIdx].active = true;
      keeperState.active = true;

      if (info.chargerStatu >= 5) {
        keeperState.slots[slotIdx].phase = "DONE";
        keeperState.slots[slotIdx].phaseDetail = `✅ Done (${WORKING_MODES[detectedModeId]?.badge || "Native"})`;
      } else if (info.chargerStatu === 4) {
        keeperState.slots[slotIdx].phase = "NATIVE_ACTIVE";
        keeperState.slots[slotIdx].phaseDetail = `Resting (OCV Dwell)`;
      } else {
        keeperState.slots[slotIdx].phase = "NATIVE_ACTIVE";
        keeperState.slots[slotIdx].phaseDetail = `${info.chargerStatusLabel} (${(info.voltageMv / 1000).toFixed(3)}V, ${info.currentMa}mA)`;
      }
    } else if (isHwReady) {
      keeperState.slots[slotIdx].phase = "READY";
      keeperState.slots[slotIdx].phaseDetail = `Ready (Primed on Hardware)`;
    }

    keeperState.slots[slotIdx].wasBatteryPresent = true;
    updateKeeperControlButtons();
  } else if (!isHwActive && keeperState.slots[slotIdx]?.phase === "NATIVE_ACTIVE" && info.chargerStatu === 0 && info.currentMa <= 10) {
    const now = Date.now();
    const cmdGrace = now - (keeperState.slots[slotIdx]?.lastCmdTime || 0) < 5000;
    if (!cmdGrace) {
      // Hardware returned to Standby after native operation and grace period elapsed
      keeperState.slots[slotIdx].phase = "IDLE";
      keeperState.slots[slotIdx].phaseDetail = "Standby";

      const siblingIdx = slotIdx % 2 === 0 ? slotIdx + 1 : slotIdx - 1;
      const siblingK = keeperState.slots[siblingIdx];
      const siblingT = slotTelemetry[siblingIdx];
      const siblingActive = siblingK?.phase === "NATIVE_ACTIVE" || (siblingT?.hasBattery && siblingT?.chargerStatu >= 2);

      if (!siblingActive && (now - (siblingK?.lastCmdTime || 0) >= 5000)) {
        keeperState.pairs[pairIdx].active = false;
        keeperState.active = keeperState.pairs[0].active || keeperState.pairs[1].active;
        updateKeeperControlButtons();
      }
    }
  }

  updateSlotCardUI(slotIdx);
  updatePairCardsUI();

  // Closed-loop autonomous keeper steps ONLY for active pairs
  // When idle, cell presence and telemetry are monitored safely without charging/discharging
  if (keeperState.active && keeperState.pairs[pairIdx]?.active) {
    stepSlotKeeper(slotIdx).catch((err) => {
      appendLog("ERR", null, null, `Keeper Slot ${slotIdx + 1} error: ${err.message}`);
    });
  }

  return info;
}

// Build 0x94 (Cmd.settingParametersForNC3000) 44-byte frame from Nc3000SetBean.getDatas()
function buildNc3000SetFrame({
  slotMask = 0x01,
  model = 0, // 0 = Charge, 1 = Discharge, 2 = Break-in, 3 = Cycle, 4 = MaxBoost, 5 = Turbo, 6 = 3-Stage
  chargeMa = 1000,
  dischargeMa = 500,
  capacityMah = 3500,
  inStopVoltageMv = 1480, // Charge cutoff voltage (mV)
  outStopVoltageMv = 1100, // Discharge cutoff voltage (mV)
  inStopCurrentMa = 100,
  outStopCurrentMa = 100,
  chargeRestMin = 10,
  dischargeRestMin = 10,
  cycleCount = 1,
  cycleMode = 0,
  deltaVMv = 3, // -dV in mV (0 = Off)
  trickleMa = 30, // Encoded as trickleMa / 10 in datas[23]
  restartVoltMv = 1290, // Holding/restart voltage in mV at datas[24..25]
  tempProtectC = 71,
  inTimeProtectMin = 180,
  maxBoostCapMah = 100,
  turboMode = 0,
  batteryType214 = 0,
  storageVoltageMv = 0,
  is280 = 0,
  twoStagePercent = 80,
  twoStageCurrentMa = 800
}) {
  const payload = new Uint8Array(41); // cmd (0x94) + 40-byte Nc3000SetBean.getDatas()
  payload[0] = 0x94;
  // Position byte (datas[0]):
  // In SkyRC NC3000 Pro firmware (disassembly of 0x8004058 and 0x8010f4e):
  // - 0x00: ALL 4 SLOTS (no bits 0..3 set -> convert_mask_to_slot returns 4 -> loops r7 = 0..3)
  // - 0x01: Slot 1 (bit 0 set -> index 0)
  // - 0x02: Slot 2 (bit 1 set -> index 1)
  // - 0x04: Slot 3 (bit 2 set -> index 2)
  // - 0x08: Slot 4 (bit 3 set -> index 3)
  // If 0x0F (all 4 slots mask) or 0x00, pass 0x00 so firmware targets ALL 4 slots!
  const posByte = (slotMask === 0x00 || slotMask === 0x0f) ? 0x00 : (slotMask & 0x0f);
  payload[1] = posByte;
  payload[2] = model & 0xff; // datas[1]: model (0..6)

  payload[3] = (chargeMa >> 8) & 0xff; // datas[2..3]
  payload[4] = chargeMa & 0xff;

  payload[5] = (dischargeMa >> 8) & 0xff; // datas[4..5]
  payload[6] = dischargeMa & 0xff;

  payload[7] = (capacityMah >> 8) & 0xff; // datas[6..7]
  payload[8] = capacityMah & 0xff;

  payload[9] = (inStopVoltageMv >> 8) & 0xff; // datas[8..9]
  payload[10] = inStopVoltageMv & 0xff;

  payload[11] = (outStopVoltageMv >> 8) & 0xff; // datas[10..11]
  payload[12] = outStopVoltageMv & 0xff;

  payload[13] = (inStopCurrentMa >> 8) & 0xff; // datas[12..13]
  payload[14] = inStopCurrentMa & 0xff;

  payload[15] = (outStopCurrentMa >> 8) & 0xff; // datas[14..15]
  payload[16] = outStopCurrentMa & 0xff;

  payload[17] = (chargeRestMin >> 8) & 0xff; // datas[16..17]
  payload[18] = chargeRestMin & 0xff;

  payload[19] = (dischargeRestMin >> 8) & 0xff; // datas[18..19]
  payload[20] = dischargeRestMin & 0xff;

  payload[21] = cycleCount & 0xff; // datas[20]
  payload[22] = cycleMode & 0xff; // datas[21]
  payload[23] = deltaVMv & 0xff; // datas[22]
  payload[24] = Math.max(0, Math.min(25, Math.round(trickleMa / 10))) & 0xff; // datas[23]: trickle / 10

  payload[25] = (restartVoltMv >> 8) & 0xff; // datas[24..25]: restartVolt (保持电压)
  payload[26] = restartVoltMv & 0xff;

  payload[27] = tempProtectC & 0xff; // datas[26]
  payload[28] = (inTimeProtectMin >> 8) & 0xff; // datas[27..28]
  payload[29] = inTimeProtectMin & 0xff;

  payload[30] = (maxBoostCapMah >> 8) & 0xff; // datas[29..30]
  payload[31] = maxBoostCapMah & 0xff;

  payload[32] = turboMode & 0xff; // datas[31]
  payload[33] = batteryType214 & 0xff; // datas[32]
  payload[34] = (storageVoltageMv >> 8) & 0xff; // datas[33..34]
  payload[35] = storageVoltageMv & 0xff;
  payload[36] = is280 & 0xff; // datas[35]
  payload[37] = twoStagePercent & 0xff; // datas[36]
  payload[38] = (twoStageCurrentMa >> 8) & 0xff; // datas[37..38]
  payload[39] = twoStageCurrentMa & 0xff;
  payload[40] = 0x00; // datas[39] reserved

  return buildSkyrcFrame(payload);
}

// Build 0xFE (Cmd.stopNc3000Charge) frame
// Position byte:
// - 0x00: ALL 4 SLOTS (STM32 firmware loops r4 = 0..3)
// - 0x01: Slot 1, 0x02: Slot 2, 0x04: Slot 3, 0x08: Slot 4
function buildNc3000StopFrame(slotMask) {
  const posByte = (slotMask === 0x00 || slotMask === 0x0f) ? 0x00 : (slotMask & 0x0f);
  return buildSkyrcFrame(new Uint8Array([0xfe, posByte]));
}

// Build Native Hardware 0x94 Frame from active UI mode parameters
function buildNativeModeFrame(mode, slotMask) {
  const cfg = getKeeperConfig();
  switch (mode) {
    case "CHARGE": {
      const chargeMa = parseInt(document.getElementById("mode0ChargeMa")?.value, 10) || 1000;
      const inStopVoltageMv = parseInt(document.getElementById("mode0CutoffMv")?.value, 10) || 1650;
      const deltaVMv = parseSafeInt(document.getElementById("mode0DeltaVMv")?.value, 5);
      const restartVoltMv = parseInt(document.getElementById("mode0RestartVoltMv")?.value, 10) || 1290;
      const trickleMa = parseSafeInt(document.getElementById("mode0TrickleMa")?.value, 30);
      const capacityMah = parseInt(document.getElementById("mode0CapacityMah")?.value, 10) || 3500;
      const inTimeProtectMin = parseSafeInt(document.getElementById("mode0TimerMin")?.value, 180);
      return buildNc3000SetFrame({
        slotMask,
        model: 0,
        chargeMa,
        inStopVoltageMv,
        deltaVMv,
        restartVoltMv,
        trickleMa,
        capacityMah,
        inTimeProtectMin,
        tempProtectC: cfg.tempProtectC
      });
    }
    case "DISCHARGE": {
      const dischargeMa = parseInt(document.getElementById("mode1DischargeMa")?.value, 10) || 1000;
      const outStopVoltageMv = parseInt(document.getElementById("mode1CutoffMv")?.value, 10) || 1000;
      const outStopCurrentMa = parseSafeInt(document.getElementById("mode1StopCurrentMa")?.value, 100);
      const inTimeProtectMin = parseSafeInt(document.getElementById("mode1TimerMin")?.value, 180);
      return buildNc3000SetFrame({
        slotMask,
        model: 1,
        dischargeMa,
        outStopVoltageMv,
        outStopCurrentMa,
        inTimeProtectMin,
        tempProtectC: cfg.tempProtectC
      });
    }
    case "CYCLE": {
      const cycleMode = parseInt(document.getElementById("mode3CycleSequence")?.value, 10) || 3;
      const cycleCount = parseInt(document.getElementById("mode3CycleCount")?.value, 10) || 1;
      const chargeMa = parseInt(document.getElementById("mode3ChargeMa")?.value, 10) || 1000;
      const dischargeMa = parseInt(document.getElementById("mode3DischargeMa")?.value, 10) || 1000;
      const inStopVoltageMv = parseInt(document.getElementById("mode3CutoffMv")?.value, 10) || 1650;
      const outStopVoltageMv = parseInt(document.getElementById("mode3DischargeCutoffMv")?.value, 10) || 1000;
      const deltaVMv = parseSafeInt(document.getElementById("mode3DeltaVMv")?.value, 5);
      const trickleMa = parseSafeInt(document.getElementById("mode3TrickleMa")?.value, 30);
      const dischargeRestMin = parseSafeInt(document.getElementById("mode3RestDischMin")?.value, 10);
      const chargeRestMin = parseSafeInt(document.getElementById("mode3RestChargeMin")?.value, 10);
      const inTimeProtectMin = parseSafeInt(document.getElementById("mode3TimerMin")?.value, 180);
      return buildNc3000SetFrame({
        slotMask,
        model: 3,
        cycleMode,
        cycleCount,
        chargeMa,
        dischargeMa,
        dischargeRestMin,
        chargeRestMin,
        inStopVoltageMv,
        outStopVoltageMv,
        deltaVMv,
        trickleMa,
        inTimeProtectMin,
        tempProtectC: cfg.tempProtectC
      });
    }
    case "BREAKIN": {
      const cap = parseInt(document.getElementById("mode2CapacityMah")?.value, 10) || 1000;
      const chargeMa = Math.max(100, Math.round(cap * 0.1));
      const dischargeMa = Math.max(100, Math.round(cap * 0.2));
      return buildNc3000SetFrame({
        slotMask,
        model: 2,
        capacityMah: cap,
        chargeMa,
        dischargeMa,
        chargeRestMin: 60,
        dischargeRestMin: 60,
        outStopVoltageMv: 900,
        tempProtectC: cfg.tempProtectC
      });
    }
    case "TURBO": {
      const turboLevel = parseInt(document.getElementById("mode5TurboLevel")?.value, 10) || 4;
      const turboRates = [1500, 1800, 2000, 2500, 3000];
      const chargeMa = turboRates[turboLevel] || parseInt(document.getElementById("mode5ChargeMa")?.value, 10) || 3000;
      const inStopVoltageMv = parseInt(document.getElementById("mode5CutoffMv")?.value, 10) || 1650;
      const deltaVMv = parseInt(document.getElementById("mode5DeltaVMv")?.value, 10) || 4;
      return buildNc3000SetFrame({
        slotMask,
        model: 5,
        turboMode: turboLevel,
        chargeMa,
        inStopVoltageMv,
        deltaVMv,
        tempProtectC: cfg.tempProtectC
      });
    }
    case "THREE_STAGE": {
      const chargeMa = parseInt(document.getElementById("mode6Stage1Ma")?.value, 10) || 2000;
      const twoStagePercent = parseInt(document.getElementById("mode6Stage1Pct")?.value, 10) || 80;
      const twoStageCurrentMa = parseInt(document.getElementById("mode6Stage2Ma")?.value, 10) || 800;
      const inStopVoltageMv = parseInt(document.getElementById("mode6CutoffMv")?.value, 10) || 1600;
      const deltaVMv = parseInt(document.getElementById("mode6DeltaVMv")?.value, 10) || 4;
      const trickleMa = parseInt(document.getElementById("mode6TrickleMa")?.value, 10) || 30;
      return buildNc3000SetFrame({
        slotMask,
        model: 6,
        chargeMa,
        twoStagePercent,
        twoStageCurrentMa,
        inStopVoltageMv,
        deltaVMv,
        trickleMa,
        tempProtectC: cfg.tempProtectC
      });
    }
    case "MAXBOOST": {
      const maxBoostCapMah = parseInt(document.getElementById("mode4CapacityMah")?.value, 10) || 300;
      const chargeMa = parseInt(document.getElementById("mode4ChargeMa")?.value, 10) || 1000;
      const inStopVoltageMv = parseInt(document.getElementById("mode4CutoffMv")?.value, 10) || 1650;
      const deltaVMv = parseInt(document.getElementById("mode4DeltaVMv")?.value, 10) || 4;
      return buildNc3000SetFrame({
        slotMask,
        model: 4,
        maxBoostCapMah,
        chargeMa,
        inStopVoltageMv,
        deltaVMv,
        tempProtectC: cfg.tempProtectC
      });
    }
    default:
      return buildNc3000SetFrame({ slotMask, tempProtectC: cfg.tempProtectC });
  }
}

// Read current Keeper configuration from UI inputs
function getKeeperConfig() {
  const mode = document.getElementById("keeperWorkingMode")?.value || "RACE_READY";
  const pair1TargetV = parseFloat(document.getElementById("keeperPair1TargetV")?.value) || 3.000;
  const pair2TargetV = parseFloat(document.getElementById("keeperPair2TargetV")?.value) || 3.000;
  const pair1TargetMv = Math.round(Math.max(1800, Math.min(3500, pair1TargetV * 1000)));
  const pair2TargetMv = Math.round(Math.max(1800, Math.min(3500, pair2TargetV * 1000)));

  // Combined Target: Pair 1 splits across Slots 1 & 2; Pair 2 splits across Slots 3 & 4
  const slotTargetMv = [
    Math.round(pair1TargetMv / 2),
    Math.round(pair1TargetMv / 2),
    Math.round(pair2TargetMv / 2),
    Math.round(pair2TargetMv / 2)
  ];

  const deadbandMv = Math.max(2, Math.min(50, parseInt(document.getElementById("keeperDeadbandMv")?.value, 10) || 5));
  const chargeMa = Math.max(200, Math.min(3000, parseInt(document.getElementById("keeperChargeMa")?.value, 10) || 800));
  const dischargeMa = Math.max(100, Math.min(2500, parseInt(document.getElementById("keeperDischargeMa")?.value, 10) || 1000));
  const fineMa = Math.max(200, Math.min(1000, parseInt(document.getElementById("keeperFineMa")?.value, 10) || 200));
  const trickleMa = Math.max(0, Math.min(100, parseInt(document.getElementById("keeperTrickleMa")?.value, 10) || 30));
  const settleSec = Math.max(5, Math.min(120, parseInt(document.getElementById("keeperSettleSec")?.value, 10) || 15));
  const stallTimeoutMin = Math.max(2, Math.min(15, parseInt(document.getElementById("keeperStallTimeoutMin")?.value, 10) || 4));
  const tempProtectC = Math.max(40, Math.min(71, parseInt(document.getElementById("keeperTempProtectC")?.value, 10) || 71));

  const enabledSlots = [
    isSlotEnabled(0),
    isSlotEnabled(1),
    isSlotEnabled(2),
    isSlotEnabled(3)
  ];

  return {
    mode,
    pair1TargetMv,
    pair2TargetMv,
    slotTargetMv,
    deadbandMv,
    chargeMa,
    dischargeMa,
    fineMa,
    trickleMa,
    settleMs: settleSec * 1000,
    stallTimeoutMs: stallTimeoutMin * 60 * 1000,
    tempProtectC,
    enabledSlots
  };
}

function isSlotEnabled(slotIdx) {
  const chk = document.querySelector(`.keeper-slot-chk[data-slot="${slotIdx}"]`);
  return chk ? chk.checked : true;
}

function setSlotEnabled(slotIdx, enabled, triggerEvents = true) {
  document.querySelectorAll(`.keeper-slot-chk[data-slot="${slotIdx}"]`).forEach((chk) => {
    chk.checked = !!enabled;
  });
  if (triggerEvents) {
    onSlotSelectionChanged(slotIdx, !!enabled);
  }
}

function syncAllSlotCheckboxesUI() {
  const cfg = getKeeperConfig();
  for (let i = 0; i < 4; i++) {
    const isChecked = cfg.enabledSlots[i];
    document.querySelectorAll(`.keeper-slot-chk[data-slot="${i}"]`).forEach((chk) => {
      if (chk.checked !== isChecked) chk.checked = isChecked;
    });
    const cardEl = document.querySelector(`.slot-card[data-slot-card="${i}"]`);
    if (cardEl) {
      cardEl.classList.toggle("slot-disabled", !isChecked);
    }
  }
  const summaryEl = document.getElementById("slotSelectionSummary");
  if (summaryEl) {
    const active = [];
    for (let i = 0; i < 4; i++) {
      if (cfg.enabledSlots[i]) active.push(i + 1);
    }
    if (active.length === 4) {
      summaryEl.textContent = "All 4 slots active";
      summaryEl.className = "slot-summary-indicator mono all-active";
    } else if (active.length === 0) {
      summaryEl.textContent = "No slots active";
      summaryEl.className = "slot-summary-indicator mono none-active";
    } else {
      summaryEl.textContent = `Slots ${active.join(", ")} active (${active.length}/4)`;
      summaryEl.className = "slot-summary-indicator mono partial-active";
    }
  }
  updateKeeperControlButtons();
}

function onSlotSelectionChanged(slotIdx, isChecked) {
  document.querySelectorAll(`.keeper-slot-chk[data-slot="${slotIdx}"]`).forEach((chk) => {
    if (chk.checked !== isChecked) chk.checked = isChecked;
  });

  const cfg = getKeeperConfig();
  const cardEl = document.querySelector(`.slot-card[data-slot-card="${slotIdx}"]`);
  if (cardEl) {
    cardEl.classList.toggle("slot-disabled", !isChecked);
  }

  const summaryEl = document.getElementById("slotSelectionSummary");
  if (summaryEl) {
    const active = [];
    for (let i = 0; i < 4; i++) {
      if (cfg.enabledSlots[i]) active.push(i + 1);
    }
    if (active.length === 4) {
      summaryEl.textContent = "All 4 slots active";
      summaryEl.className = "slot-summary-indicator mono all-active";
    } else if (active.length === 0) {
      summaryEl.textContent = "No slots active";
      summaryEl.className = "slot-summary-indicator mono none-active";
    } else {
      summaryEl.textContent = `Slots ${active.join(", ")} active (${active.length}/4)`;
      summaryEl.className = "slot-summary-indicator mono partial-active";
    }
  }

  if (keeperState.active) {
    if (!isChecked) {
      sendSlotStop(slotIdx, `Slot ${slotIdx + 1} unticked by user`);
      keeperState.slots[slotIdx].phase = "IDLE";
      keeperState.slots[slotIdx].phaseDetail = "Slot Disabled";

      const pairIdx = slotIdx < 2 ? 0 : 1;
      const siblingIdx = slotIdx < 2 ? (slotIdx === 0 ? 1 : 0) : (slotIdx === 2 ? 3 : 2);
      if (!cfg.enabledSlots[siblingIdx] || keeperState.slots[siblingIdx].phase === "IDLE") {
        keeperState.pairs[pairIdx].active = false;
      }
      keeperState.active = keeperState.pairs[0].active || keeperState.pairs[1].active;
    } else {
      const pairIdx = slotIdx < 2 ? 0 : 1;
      keeperState.pairs[pairIdx].active = true;
      if (cfg.mode === "RACE_READY") {
        keeperState.slots[slotIdx].phase = slotTelemetry[slotIdx].hasBattery ? "EVAL_OCV" : "NO_BATTERY";
        keeperState.slots[slotIdx].phaseDetail = slotTelemetry[slotIdx].hasBattery ? "Evaluating OCV…" : "Waiting for Battery";
      } else {
        keeperState.slots[slotIdx].phase = slotTelemetry[slotIdx].hasBattery ? "NATIVE_ACTIVE" : "NO_BATTERY";
        keeperState.slots[slotIdx].phaseDetail = slotTelemetry[slotIdx].hasBattery ? `Starting ${WORKING_MODES[cfg.mode]?.name || "Native"}…` : "Waiting for Battery";
        if (gattServer && gattServer.connected) {
          const frame = buildNativeModeFrame(cfg.mode, NC3000_SLOT_MASKS[slotIdx]);
          sendBytes(frame, `[Dynamically start Slot ${slotIdx + 1} (${cfg.mode})]`);
        }
      }
    }
  }

  updateSlotCardUI(slotIdx);
  updatePairCardsUI();
  updateKeeperControlButtons();
  saveKeeperPrefs();
}

// Update the Mini 4WD Pair Live Summary Cards (Pair 1: Slots 1+2, Pair 2: Slots 3+4)
function updatePairCardsUI() {
  const cfg = getKeeperConfig();
  const pairs = [
    { pairIdx: 0, label: "PAIR 1", slots: [0, 1], targetMv: cfg.pair1TargetMv },
    { pairIdx: 1, label: "PAIR 2", slots: [2, 3], targetMv: cfg.pair2TargetMv }
  ];

  pairs.forEach(({ pairIdx, slots, targetMv }) => {
    const sA = slots[0];
    const sB = slots[1];
    const tA = slotTelemetry[sA];
    const tB = slotTelemetry[sB];
    const kA = keeperState.slots[sA];
    const kB = keeperState.slots[sB];
    const isPairActive = !!keeperState.pairs?.[pairIdx]?.active;

    const cardEl = document.getElementById(`pairCard-${pairIdx}`);
    const badgeEl = document.getElementById(`pairBadge-${pairIdx}`);
    const totalVEl = document.getElementById(`pairTotalV-${pairIdx}`);
    const targetDeltaEl = document.getElementById(`pairTargetDelta-${pairIdx}`);
    const diffEl = document.getElementById(`pairDiff-${pairIdx}`);
    const gradeEl = document.getElementById(`pairGrade-${pairIdx}`);
    const footerEl = document.getElementById(`pairFooter-${pairIdx}`);

    if (!cardEl) return;

    cardEl.classList.remove("ready", "balancing", "stalled");

    // Update Stacked Horizontal Voltage Bars for each slot in this pair
    const minV = 1.10;
    const maxV = 1.60;
    const cellTargetMv = Math.round(targetMv / 2);
    const cellTargetV = cellTargetMv / 1000;
    const targetPct = Math.max(0, Math.min(100, ((cellTargetV - minV) / (maxV - minV)) * 100));

    slots.forEach((s) => {
      const sT = slotTelemetry[s];
      const sK = keeperState.slots[s];
      const voltEl = document.getElementById(`pairBarVolt-${s}`);
      const fillEl = document.getElementById(`pairBarFill-${s}`);
      const targetLineEl = document.getElementById(`pairBarTarget-${s}`);
      const targetLabelEl = document.getElementById(`pairBarTargetLabel-${s}`);
      const statusEl = document.getElementById(`pairBarStatus-${s}`);

      if (targetLineEl) {
        targetLineEl.style.left = `${targetPct.toFixed(1)}%`;
        targetLineEl.title = `Target: ${cellTargetV.toFixed(3)} V`;
      }
      if (targetLabelEl) {
        targetLabelEl.textContent = `Target: ${cellTargetV.toFixed(2)}V`;
      }

      if (!voltEl || !fillEl) return;

      if (!sT || !sT.hasBattery) {
        voltEl.textContent = "Empty";
        fillEl.style.width = "0%";
        fillEl.className = "pair-bar-fill";
        if (statusEl) {
          statusEl.textContent = (sK && sK.phase === "CONNECTION_BREAK") ? "Break" : "Empty";
          statusEl.className = "pair-bar-status-badge standby";
        }
      } else {
        const curV = sT.voltageMv / 1000;
        const diffMv = sT.voltageMv - cellTargetMv;
        const sign = diffMv > 0 ? "+" : "";
        voltEl.textContent = `${curV.toFixed(3)} V (${sign}${diffMv} mV)`;
        const curPct = Math.max(0, Math.min(100, ((curV - minV) / (maxV - minV)) * 100));
        fillEl.style.width = `${curPct.toFixed(1)}%`;

        if (sK.isStalled) {
          fillEl.className = "pair-bar-fill stalled";
          if (statusEl) {
            statusEl.textContent = "⚠️ Stalled";
            statusEl.className = "pair-bar-status-badge stalled";
          }
        } else if (sT.chargerStatu === 2 || sK.phase === "CHARGING") {
          fillEl.className = "pair-bar-fill charging";
          if (statusEl) {
            statusEl.innerHTML = `⚡ Charging ${sT.currentMa || cfg.chargeMa}mA`;
            statusEl.className = "pair-bar-status-badge charging";
          }
        } else if (sT.chargerStatu === 3 || sK.phase === "DISCHARGING") {
          fillEl.className = "pair-bar-fill discharging";
          if (statusEl) {
            statusEl.innerHTML = `🔋 Discharging ${sT.currentMa || cfg.dischargeMa}mA`;
            statusEl.className = "pair-bar-status-badge discharging";
          }
        } else if (sK.phase === "SETTLING" || sT.chargerStatu === 4) {
          fillEl.className = "pair-bar-fill resting";
          if (statusEl) {
            statusEl.innerHTML = `💤 Resting <span class="sleep-zzz" aria-hidden="true"><span>z</span><span>Z</span><span>Z</span></span>`;
            statusEl.className = "pair-bar-status-badge resting";
          }
        } else if (sK.phase === "DONE" || sT.chargerStatu >= 5) {
          fillEl.className = "pair-bar-fill done";
          if (statusEl) {
            statusEl.textContent = "✅ Done";
            statusEl.className = "pair-bar-status-badge done";
          }
        } else if (sK.phase === "HOLDING_READY" || (isPairActive && Math.abs(diffMv) <= cfg.deadbandMv)) {
          fillEl.className = "pair-bar-fill ready";
          if (statusEl) {
            statusEl.textContent = "Ready";
            statusEl.className = "pair-bar-status-badge ready";
          }
        } else {
          fillEl.className = "pair-bar-fill";
          if (statusEl) {
            statusEl.textContent = "Standby";
            statusEl.className = "pair-bar-status-badge standby";
          }
        }
      }
    });

    const bothPresent = tA.hasBattery && tB.hasBattery;
    const eitherPresent = tA.hasBattery || tB.hasBattery;
    const eitherStalled = kA.isStalled || kB.isStalled;

    if (!eitherPresent) {
      badgeEl.className = "pair-badge standby";
      badgeEl.textContent = "Standby";
      totalVEl.textContent = "Empty";
      targetDeltaEl.textContent = `Target: ${(targetMv / 1000).toFixed(3)} V (${(targetMv / 2000).toFixed(3)}V/cell)`;
      diffEl.textContent = "— mV";
      gradeEl.className = "pair-match-grade";
      gradeEl.textContent = "Insert 2 Cells";
      footerEl.textContent = `Slot ${sA + 1}: Empty • Slot ${sB + 1}: Empty`;
      return;
    }

    if (!bothPresent) {
      const isBreak = (!tA.hasBattery && kA.phase === "CONNECTION_BREAK") || (!tB.hasBattery && kB.phase === "CONNECTION_BREAK");
      const presentT = tA.hasBattery ? tA : tB;
      const presentK = tA.hasBattery ? kA : kB;
      const missingSlot = tA.hasBattery ? sB + 1 : sA + 1;
      const presentSlot = tA.hasBattery ? sA + 1 : sB + 1;

      if (cfg.mode !== "RACE_READY") {
        const modeBadge = (presentT.hasBattery && WORKING_MODES[presentT.mode]?.badge) || WORKING_MODES[cfg.mode]?.badge || "RUNNING";
        const modeName = (presentT.hasBattery && WORKING_MODES[presentT.mode]?.name) || WORKING_MODES[cfg.mode]?.name || cfg.mode;
        const isSingleDone = presentK.phase === "DONE" || presentT.chargerStatu >= 5;
        const isSingleActive = isPairActive || presentK.phase === "NATIVE_ACTIVE" || presentT.chargerStatu >= 2 || presentT.currentMa > 20;

        cardEl.classList.remove("balancing", "ready", "stalled");
        if (isBreak) {
          cardEl.classList.add("stalled");
          badgeEl.className = "pair-badge stalled";
          badgeEl.textContent = "CELL BREAK";
        } else if (isSingleDone) {
          cardEl.classList.add("ready");
          badgeEl.className = "pair-badge ready";
          badgeEl.textContent = "DONE";
        } else if (isSingleActive) {
          cardEl.classList.add("balancing");
          badgeEl.className = "pair-badge balancing";
          badgeEl.textContent = modeBadge;
        } else {
          badgeEl.className = "pair-badge standby";
          badgeEl.textContent = "STANDBY";
        }

        totalVEl.textContent = `${(presentT.voltageMv / 1000).toFixed(3)} V`;
        targetDeltaEl.textContent = modeName;
        diffEl.textContent = "— mV";
        gradeEl.className = isSingleDone ? "pair-match-grade excellent" : (isSingleActive ? "pair-match-grade good" : "pair-match-grade");
        gradeEl.textContent = isBreak ? `⚡ Re-insert Slot ${missingSlot} to Auto-Resume` : `Single Cell in Slot ${presentSlot} (${(presentT.voltageMv / 1000).toFixed(3)}V)`;
        footerEl.textContent = `Slot ${sA + 1}: ${tA.hasBattery ? (tA.voltageMv / 1000).toFixed(3) + "V" : "Empty"} • Slot ${sB + 1}: ${tB.hasBattery ? (tB.voltageMv / 1000).toFixed(3) + "V" : "Empty"}`;
        return;
      }

      badgeEl.className = isBreak ? "pair-badge stalled" : "pair-badge balancing";
      badgeEl.textContent = isBreak ? "CELL BREAK" : "1 / 2 Cells";
      totalVEl.textContent = `${(presentT.voltageMv / 1000).toFixed(3)} V`;
      targetDeltaEl.textContent = isBreak ? `⚡ Slot ${missingSlot} Removed (Awaiting Reconnect)` : `Needs 2nd cell in Slot ${missingSlot}`;
      diffEl.textContent = "— mV";
      gradeEl.className = isBreak ? "pair-match-grade imbalanced" : "pair-match-grade";
      gradeEl.textContent = isBreak ? `⚡ Re-insert Slot ${missingSlot} to Auto-Resume` : `Insert cell in Slot ${missingSlot}`;
      footerEl.textContent = `Slot ${sA + 1}: ${tA.hasBattery ? (tA.voltageMv / 1000).toFixed(3) + "V" : "Empty"} • Slot ${sB + 1}: ${tB.hasBattery ? (tB.voltageMv / 1000).toFixed(3) + "V" : "Empty"}`;
      return;
    }

    // Both batteries are physically present in the pair
    const totalPackMv = tA.voltageMv + tB.voltageMv;
    const totalPackV = totalPackMv / 1000;
    const packDiffMv = totalPackMv - targetMv;
    const packSign = packDiffMv > 0 ? "+" : "";
    totalVEl.textContent = `${totalPackV.toFixed(3)} V`;
    if (cfg.mode === "RACE_READY") {
      targetDeltaEl.textContent = `Target: ${(targetMv / 1000).toFixed(3)} V (${packSign}${packDiffMv} mV)`;
    } else {
      const modeObj = (tA.hasBattery && tA.mode in WORKING_MODES) ? WORKING_MODES[tA.mode] : (WORKING_MODES[cfg.mode] || WORKING_MODES.CHARGE);
      targetDeltaEl.textContent = `${modeObj.name}`;
    }

    const cellDiffMv = Math.abs(tA.voltageMv - tB.voltageMv);
    diffEl.textContent = `${cellDiffMv} mV`;

    // Match Grade Classification for racing
    if (eitherStalled) {
      gradeEl.className = "pair-match-grade fault";
      const stalledSlot = kA.isStalled ? sA + 1 : sB + 1;
      gradeEl.textContent = `⚠️ Slot ${stalledSlot} Defective (Replace)`;
    } else if (cellDiffMv <= 5) {
      gradeEl.className = "pair-match-grade excellent";
      gradeEl.textContent = "MATCH GRADE (<5mV) ★★★";
    } else if (cellDiffMv <= 15) {
      gradeEl.className = "pair-match-grade good";
      gradeEl.textContent = "GOOD MATCH (<15mV) ★★";
    } else {
      gradeEl.className = "pair-match-grade imbalanced";
      gradeEl.textContent = `IMBALANCED (Δ${cellDiffMv}mV)`;
    }

    // Overall Pair Status
    const isPairReadyNow = (kA.phase === "HOLDING_READY" && kB.phase === "HOLDING_READY") ||
      (cfg.mode !== "RACE_READY" && isPairActive && (kA.phase === "DONE" || tA.chargerStatu >= 5) && (kB.phase === "DONE" || tB.chargerStatu >= 5));

    if (eitherStalled) {
      cardEl.classList.add("stalled");
      badgeEl.className = "pair-badge stalled";
      badgeEl.textContent = "CELL FAULT";
      if (!pairAudioState[pairIdx]?.wasStalled) {
        if (!pairAudioState[pairIdx]) pairAudioState[pairIdx] = {};
        pairAudioState[pairIdx].wasStalled = true;
        playStallAlarm();
      }
    } else if (isPairReadyNow) {
      cardEl.classList.add("ready");
      badgeEl.className = "pair-badge ready";
      badgeEl.textContent = cfg.mode === "RACE_READY" ? `READY (${totalPackV.toFixed(2)}V)` : "DONE";
      if (!pairAudioState[pairIdx]?.wasReady) {
        if (!pairAudioState[pairIdx]) pairAudioState[pairIdx] = {};
        pairAudioState[pairIdx].wasReady = true;
        playReadyChime();
      }
    } else if (
      isPairActive ||
      kA.phase === "CHARGING" ||
      kB.phase === "CHARGING" ||
      kA.phase === "DISCHARGING" ||
      kB.phase === "DISCHARGING" ||
      kA.phase === "NATIVE_ACTIVE" ||
      kB.phase === "NATIVE_ACTIVE" ||
      tA.currentMa > 20 ||
      tB.currentMa > 20
    ) {
      if (pairAudioState[pairIdx]) {
        pairAudioState[pairIdx].wasReady = false;
        pairAudioState[pairIdx].wasStalled = false;
      }
      cardEl.classList.add("balancing");
      badgeEl.className = "pair-badge balancing";
      const modeBadge = (tA.hasBattery && WORKING_MODES[tA.mode]?.badge) || WORKING_MODES[cfg.mode]?.badge || "RUNNING";
      badgeEl.textContent = cfg.mode === "RACE_READY" ? "BALANCING" : modeBadge;
    } else if (kA.phase === "SETTLING" || kB.phase === "SETTLING") {
      badgeEl.className = "pair-badge resting";
      badgeEl.textContent = "SETTLING";
    } else {
      badgeEl.className = "pair-badge standby";
      badgeEl.textContent = "STANDBY";
    }

    const sAState = kA.isStalled ? "⚠️ Fault" : `${(tA.voltageMv / 1000).toFixed(3)}V (${kA.phaseDetail})`;
    const sBState = kB.isStalled ? "⚠️ Fault" : `${(tB.voltageMv / 1000).toFixed(3)}V (${kB.phaseDetail})`;
    footerEl.textContent = `Slot ${sA + 1}: ${sAState} • Slot ${sB + 1}: ${sBState}`;

    // Pair Level Fault / Stall Notification Banner
    const pairStallBannerEl = document.getElementById(`pairStallBanner-${pairIdx}`);
    const pairStallReasonEl = document.getElementById(`pairStallReason-${pairIdx}`);
    if (eitherStalled) {
      const stalledSlot = kA.isStalled ? sA : sB;
      const stallReason = keeperState.slots[stalledSlot].stallReason || "Degraded cell / cutoff reached";
      if (pairStallBannerEl) pairStallBannerEl.classList.remove("hidden");
      if (pairStallReasonEl) pairStallReasonEl.textContent = `Slot ${stalledSlot + 1}: ${stallReason}`;
    } else {
      if (pairStallBannerEl) pairStallBannerEl.classList.add("hidden");
    }
  });
}

function updateSlotCardUI(slotIdx) {
  const t = slotTelemetry[slotIdx];
  const k = keeperState.slots[slotIdx];
  const cfg = getKeeperConfig();
  const slotTargetMv = cfg.slotTargetMv[slotIdx];

  const cardEl = document.querySelector(`[data-slot-card="${slotIdx}"]`);
  const hwBadgeEl = document.getElementById(`slotHwState-${slotIdx}`);
  const voltEl = document.getElementById(`slotVolt-${slotIdx}`);
  const deltaEl = document.getElementById(`slotDelta-${slotIdx}`);
  const curEl = document.getElementById(`slotCur-${slotIdx}`);
  const capEl = document.getElementById(`slotCap-${slotIdx}`);
  const deltaVEl = document.getElementById(`slotDeltaV-${slotIdx}`);
  const irEl = document.getElementById(`slotIr-${slotIdx}`);
  const phaseEl = document.getElementById(`slotKeeperPhase-${slotIdx}`);
  const stallBannerEl = document.getElementById(`slotStallBanner-${slotIdx}`);
  const stallReasonEl = document.getElementById(`slotStallReason-${slotIdx}`);

  if (!cardEl) return;

  // Dynamic hardware status label that factors in live current & mode
  let hwLabel = t.chargerStatusLabel;
  if (!t.hasBattery) {
    hwLabel = "Empty Slot";
    hwBadgeEl.className = "slot-hw-badge standby";
  } else if (t.currentMa > 20) {
    // Current is actively flowing
    if (t.mode === 1 || t.chargerStatu === 3) {
      hwLabel = `Discharging (${t.currentMa}mA)`;
      hwBadgeEl.className = "slot-hw-badge discharging";
    } else {
      hwLabel = `Charging (${t.currentMa}mA)`;
      hwBadgeEl.className = "slot-hw-badge charging";
    }
  } else {
    // Current is ~0mA (Resting / Done / Standby)
    if (t.chargerStatu === 4) {
      hwLabel = `💤 Resting (OCV) <span class="sleep-zzz" aria-hidden="true"><span>z</span><span>Z</span><span>Z</span></span>`;
      hwBadgeEl.className = "slot-hw-badge resting";
    } else if (t.chargerStatu === 0) {
      hwLabel = "Standby (0mA)";
      hwBadgeEl.className = "slot-hw-badge standby";
    } else if (t.chargerStatu >= 5) {
      hwLabel = "Done";
      hwBadgeEl.className = "slot-hw-badge done";
    } else {
      hwLabel = NC3000_CHARGER_STATUS_NAMES[t.chargerStatu] || `State ${t.chargerStatu}`;
      hwBadgeEl.className = "slot-hw-badge";
    }
  }
  hwBadgeEl.innerHTML = hwLabel;

  if (!t.hasBattery) {
    voltEl.textContent = "Empty";
    deltaEl.textContent = (k.phase === "CONNECTION_BREAK") ? "⚡ Break: Cell removed" : "Insert cell";
    curEl.textContent = "0 mA";
    capEl.textContent = "0 mAh";
    if (deltaVEl) deltaVEl.textContent = "— mV";
    irEl.textContent = "— mΩ";
    if (k.phase === "CONNECTION_BREAK") {
      hwBadgeEl.className = "slot-hw-badge break";
      hwBadgeEl.textContent = "Connection Break";
    }
  } else if (k.phase === "RECONNECT_DEBOUNCE") {
    hwBadgeEl.className = "slot-hw-badge reconnecting";
    hwBadgeEl.textContent = "Stabilizing…";
    voltEl.textContent = `${(t.voltageMv / 1000).toFixed(3)} V`;
    deltaEl.textContent = "Debouncing contacts (2s)";
    curEl.textContent = "0 mA";
    capEl.textContent = `${t.capacityMah} mAh`;
    if (deltaVEl) deltaVEl.textContent = `${t.deltaVMv} mV`;
    irEl.textContent = t.irMohm > 0 ? `${t.irMohm} mΩ` : "— mΩ";
  } else {
    voltEl.textContent = `${(t.voltageMv / 1000).toFixed(3)} V`;
    if (cfg.mode === "RACE_READY") {
      const diffMv = t.voltageMv - slotTargetMv;
      const sign = diffMv > 0 ? "+" : "";
      deltaEl.textContent = `Target ${(slotTargetMv / 1000).toFixed(3)}V (${sign}${diffMv} mV)`;
    } else {
      const modeId = NC3000_HW_MODE_TO_ID[t.mode] || cfg.mode;
      const modeObj = WORKING_MODES[modeId] || WORKING_MODES[cfg.mode] || WORKING_MODES.CHARGE;
      deltaEl.textContent = `${modeObj.name}`;
    }
    curEl.textContent = `${t.currentMa} mA`;
    capEl.textContent = `${t.capacityMah} mAh`;
    if (deltaVEl) deltaVEl.textContent = `${t.deltaVMv} mV`;
    irEl.textContent = t.irMohm > 0 ? `${t.irMohm} mΩ` : "— mΩ";
  }

  // Handle Defective / Stalled Battery Warning & Disabled State
  const isEnabled = cfg.enabledSlots[slotIdx];
  cardEl.classList.toggle("slot-disabled", !isEnabled);

  if (k.isStalled) {
    cardEl.classList.add("stalled");
    stallBannerEl?.classList.remove("hidden");
    if (stallReasonEl) stallReasonEl.textContent = k.stallReason;
    phaseEl.textContent = "⚠️ STALLED — REPLACE CELL";
  } else if (!isEnabled) {
    cardEl.classList.remove("stalled");
    stallBannerEl?.classList.add("hidden");
    phaseEl.textContent = "Status: Slot Disabled";
  } else {
    cardEl.classList.remove("stalled");
    stallBannerEl?.classList.add("hidden");
    const pairIdx = slotIdx < 2 ? 0 : 1;
    const isPairActive = !!keeperState.pairs[pairIdx]?.active;
    phaseEl.textContent = isPairActive
      ? `Status: ${k.phaseDetail}`
      : "Status: Standby";
  }

  cardEl.classList.remove("charging", "discharging", "holding");
  if (!k.isStalled) {
    if (t.chargerStatu === 2 || k.phase === "CHARGING") {
      cardEl.classList.add("charging");
    } else if (t.chargerStatu === 3 || k.phase === "DISCHARGING") {
      cardEl.classList.add("discharging");
    } else if (k.phase === "HOLDING_READY") {
      cardEl.classList.add("holding");
    }
  }

  // Update Mini 4WD series pair status
  updatePairCardsUI();
}

// Send Charge-to-Target command for a single slot
async function sendSlotChargeToTarget(slotIdx, useFineCurrent = false) {
  const cfg = getKeeperConfig();
  const mask = NC3000_SLOT_MASKS[slotIdx];
  const slotTargetMv = cfg.slotTargetMv[slotIdx];
  const chargeCurrent = useFineCurrent ? cfg.fineMa : cfg.chargeMa;
  
  // On fine trim, add a slight +4mV offset to compensate for residual 200mA load I*R drop so resting OCV settles exactly at targetMv:
  const hwTargetStopMv = Math.max(1250, Math.min(1800, slotTargetMv + (useFineCurrent ? 4 : 0)));

  const frame = buildNc3000SetFrame({
    slotMask: mask,
    model: 0, // Charge
    chargeMa: chargeCurrent,
    dischargeMa: cfg.dischargeMa,
    capacityMah: 3500,
    inStopVoltageMv: hwTargetStopMv,
    outStopVoltageMv: Math.max(500, Math.min(1400, slotTargetMv - 50)),
    inStopCurrentMa: Math.min(100, chargeCurrent),
    outStopCurrentMa: Math.min(100, cfg.fineMa),
    deltaVMv: 0, // 0 = Disable -dV peak detection so false dips do NOT cut off early before target voltage!
    trickleMa: cfg.trickleMa,
    restartVoltMv: slotTargetMv, // Pass slot target as holding/restart voltage
    tempProtectC: cfg.tempProtectC || 71, // 71 = OFF / NTC Bypass in firmware
    inTimeProtectMin: 180
  });

  const now = Date.now();
  keeperState.slots[slotIdx].lastCmdTime = now;
  keeperState.slots[slotIdx].chargeStartTime = now;
  keeperState.slots[slotIdx].lastProgressV = slotTelemetry[slotIdx].voltageMv;
  keeperState.slots[slotIdx].lastProgressTime = now;
  keeperState.slots[slotIdx].activeCommandedCurrentMa = chargeCurrent;
  keeperState.slots[slotIdx].hasSyncedDone = false;
  keeperState.slots[slotIdx].latchGraceUntil = 0;

  await sendBytes(
    frame,
    `[Keeper Slot ${slotIdx + 1}: ${useFineCurrent ? "FINE TOP-OFF" : "CHARGE"} @ ${chargeCurrent}mA → ${(slotTargetMv / 1000).toFixed(3)}V (Stop ${(hwTargetStopMv / 1000).toFixed(3)}V)]`
  );
}

// Send Discharge-to-Target command for a single slot
async function sendSlotDischargeToTarget(slotIdx, useFineCurrent = false) {
  const cfg = getKeeperConfig();
  const mask = NC3000_SLOT_MASKS[slotIdx];
  const slotTargetMv = cfg.slotTargetMv[slotIdx];
  const dischargeCurrent = useFineCurrent ? cfg.fineMa : cfg.dischargeMa;
  // NC3000 Pro native outStopVoltage supports 500..1400 mV; if target > 1400 mV,
  // we set hardware floor to 1400 mV and our closed-loop poller stops at exact targetMv!
  const hwCutoffMv = Math.max(500, Math.min(1400, slotTargetMv));

  const frame = buildNc3000SetFrame({
    slotMask: mask,
    model: 1, // Discharge
    chargeMa: cfg.chargeMa,
    dischargeMa: dischargeCurrent,
    capacityMah: 3500,
    inStopVoltageMv: Math.max(1250, Math.min(1800, slotTargetMv)),
    outStopVoltageMv: hwCutoffMv,
    inStopCurrentMa: 100,
    outStopCurrentMa: Math.min(dischargeCurrent, cfg.fineMa), // Taper current near target
    deltaVMv: 5,
    trickleMa: 0,
    restartVoltMv: slotTargetMv,
    tempProtectC: cfg.tempProtectC || 71, // 71 = OFF / NTC Bypass in firmware
    inTimeProtectMin: 180
  });

  const now = Date.now();
  keeperState.slots[slotIdx].lastCmdTime = now;
  keeperState.slots[slotIdx].dischargeStartTime = now;
  keeperState.slots[slotIdx].activeCommandedCurrentMa = dischargeCurrent;
  keeperState.slots[slotIdx].hasSyncedDone = false;
  keeperState.slots[slotIdx].latchGraceUntil = 0;

  await sendBytes(
    frame,
    `[Keeper Slot ${slotIdx + 1}: DISCHARGE @ ${dischargeCurrent}mA → ${(slotTargetMv / 1000).toFixed(3)}V]`
  );
}

async function sendSlotStop(slotIdx, reason = "Target reached") {
  const mask = NC3000_SLOT_MASKS[slotIdx];
  const frame = buildNc3000StopFrame(mask);
  keeperState.slots[slotIdx].lastCmdTime = Date.now();
  await sendBytes(frame, `[Keeper Slot ${slotIdx + 1}: STOP (0xFE) — ${reason}]`);
}

// Closed-loop per-slot state machine evaluated on every 0x91 telemetry update
async function stepSlotKeeper(slotIdx) {
  const cfg = getKeeperConfig();
  const slotTargetMv = cfg.slotTargetMv[slotIdx];
  const t = slotTelemetry[slotIdx];
  const k = keeperState.slots[slotIdx];
  const now = Date.now();

  const pairIdx = slotIdx < 2 ? 0 : 1;
  if (!keeperState.pairs[pairIdx]?.active) {
    return;
  }

  if (!cfg.enabledSlots[slotIdx]) {
    k.phase = "IDLE";
    k.phaseDetail = "Slot Disabled";
    updateSlotCardUI(slotIdx);
    return;
  }

  // 0. Handle Native Hardware Modes (non-Race-Ready)
  if (cfg.mode !== "RACE_READY") {
    if (!t.hasBattery) {
      if (k.wasBatteryPresent) {
        k.wasBatteryPresent = false;
        k.phase = "CONNECTION_BREAK";
        k.phaseDetail = "⚡ Connection Break (Cell Removed)";
        await sendSlotStop(slotIdx, "Battery removed: clearing Connection Break hardware latch");
        playBreakAlert();
      } else {
        k.phase = "NO_BATTERY";
        k.phaseDetail = "Waiting for Battery";
      }
      updateSlotCardUI(slotIdx);
      return;
    }

    // Battery is present
    k.wasBatteryPresent = true;
    if (t.chargerStatu >= 5 || t.workState === 5 || t.workState === 6) {
      k.phase = "DONE";
      const modeObj = (t.mode in WORKING_MODES) ? WORKING_MODES[t.mode] : (WORKING_MODES[cfg.mode] || WORKING_MODES.CHARGE);
      k.phaseDetail = `✅ Done (${modeObj.badge || "Native"})`;
      if (!k.hasSyncedDone) {
        k.hasSyncedDone = true;
        playDoneAlert();
      }
    } else {
      k.phase = "NATIVE_ACTIVE";
      const stateName = NC3000_CHARGER_STATUS_NAMES[t.chargerStatu] || WORK_STATE_NAMES[t.workState] || "Running";
      k.phaseDetail = `${stateName} (${(t.voltageMv / 1000).toFixed(3)}V, ${t.currentMa}mA)`;
    }
    updateSlotCardUI(slotIdx);
    return;
  }

  // 1. Connection Break / Battery Removal Detection
  if (!t.hasBattery) {
    if (k.wasBatteryPresent) {
      // Battery was pulled out during operation (Connection Break!)
      k.wasBatteryPresent = false;
      k.phase = "CONNECTION_BREAK";
      k.phaseDetail = "⚡ Connection Break (Cell Removed)";
      // Reset all per-cell counters so re-inserted battery starts with a clean slate
      k.isStalled = false;
      k.stallReason = "";
      k.consecutiveSettlingFails = 0;
      k.lastProgressV = 0;
      k.chargeStartTime = 0;
      k.dischargeStartTime = 0;
      k.passCount = 0;
      k.hasSyncedDone = false;
      k.latchGraceUntil = 0;
      k.outOfBandPolls = 0;
      k.thermalFaultCount = 0;
      // Send 0xFE to dismiss the "Connection Break!" error latch on the charger hardware
      await sendSlotStop(slotIdx, "Battery removed: clearing Connection Break hardware latch");
      appendLog("SYS", null, null, `[Connection Break] Slot ${slotIdx + 1} battery removed. Hardware error latch cleared. Auto-recovery armed.`);
      playBreakAlert();
      updateSlotCardUI(slotIdx);
      return;
    }
    if (k.phase !== "CONNECTION_BREAK") {
      k.phase = "NO_BATTERY";
      k.phaseDetail = "Waiting for Battery";
    }
    k.isStalled = false;
    k.consecutiveSettlingFails = 0;
    updateSlotCardUI(slotIdx);
    return;
  }

  // 2. Hardware Thermal Cutoff Error Handling & Sensor Bypass Recovery
  // SkyRC firmware raises errorState 6 (or 5) when ADC temperature reaches cutoff limit.
  // If the cell is physically cold, the slot's SMD NTC thermistor is faulty or drifted.
  if (t.errorState === 6 || t.errorState === 5) {
    if ((k.thermalFaultCount || 0) < 3 && cfg.tempProtectC >= 71) {
      k.thermalFaultCount = (k.thermalFaultCount || 0) + 1;
      appendLog("WARN", null, null, `[Thermal Bypass] Slot ${slotIdx + 1}: False thermal cutoff (0x0${t.errorState}) on cold battery. Clearing hardware latch and applying NTC Bypass (71=OFF)...`);
      await sendSlotStop(slotIdx, "Clearing false thermal cutoff on cold sensor");
      k.phase = "SETTLING";
      k.settleUntilTime = now + 4000;
      k.phaseDetail = "Bypassing Sensor Cutoff…";
      updateSlotCardUI(slotIdx);
      return;
    } else if (cfg.tempProtectC < 71) {
      k.isStalled = true;
      k.stallReason = `Hardware Cut-off Temp Reached (${cfg.tempProtectC}°C). If battery is cold, Slot ${slotIdx + 1} NTC thermistor is drifted/faulty: set Temp Cutoff to 71 (OFF / Bypass) in settings.`;
      k.phase = "STALLED";
      k.phaseDetail = "⚠️ TEMP CUTOFF — CHECK SENSOR";
      updateSlotCardUI(slotIdx);
      await sendSlotStop(slotIdx, "Thermal cutoff tripped");
      return;
    }
  }

  // 3. Battery Insertion / Auto-Recovery Detection
  if (!k.wasBatteryPresent && t.hasBattery) {
    // Battery was physically re-inserted or newly inserted!
    k.wasBatteryPresent = true;
    k.phase = "RECONNECT_DEBOUNCE";
    k.debounceUntilTime = now + 2000; // 2 seconds debounce to let physical spring contacts settle
    k.phaseDetail = "Cell Detected: Reading OCV (2s)…";
    k.isStalled = false;
    k.stallReason = "";
    k.consecutiveSettlingFails = 0;
    k.lastProgressV = t.voltageMv;
    k.lastProgressTime = now;
    k.chargeStartTime = 0;
    k.dischargeStartTime = 0;
    k.passCount = 0;
    k.hasSyncedDone = false;
    k.latchGraceUntil = 0;
    k.outOfBandPolls = 0;
    k.thermalFaultCount = 0;
    // Send 0xFE stop command once to ensure any residual error latch on the hardware slot is cleared
    await sendSlotStop(slotIdx, "Cell inserted: clearing standby latch");
    appendLog("SYS", null, null, `[Auto-Recovery] Battery detected in Slot ${slotIdx + 1} (${(t.voltageMv / 1000).toFixed(3)}V). Stabilizing contacts...`);
    playReconnectChime();
    updateSlotCardUI(slotIdx);
    return;
  }

  // 4. Debounce window for reconnected battery (prevents contact bounce false triggers)
  if (k.phase === "RECONNECT_DEBOUNCE") {
    if (now < k.debounceUntilTime) {
      const remainSec = Math.ceil((k.debounceUntilTime - now) / 1000);
      k.phaseDetail = `Settling contacts (${remainSec}s)…`;
      updateSlotCardUI(slotIdx);
      return;
    }
    // Contacts stabilized! Transition to EVAL_OCV
    k.phase = "EVAL_OCV";
    k.phaseDetail = "Evaluating OCV…";
    appendLog("SYS", null, null, `[Auto-Recovery] Slot ${slotIdx + 1} contacts stabilized at ${(t.voltageMv / 1000).toFixed(3)}V. Auto-resuming Keeper task.`);
  }

  // If already flagged as stalled/defective, do not restart tasks
  if (k.isStalled) {
    if (t.chargerStatu === 2 || t.chargerStatu === 3) {
      await sendSlotStop(slotIdx, "Stopping stalled defective cell");
    }
    k.phase = "STALLED";
    k.phaseDetail = "⚠️ STALLED — REPLACE CELL";
    updateSlotCardUI(slotIdx);
    return;
  }

  // Avoid command spam within 3.0 seconds of last command
  if (now - k.lastCmdTime < 3000) {
    updateSlotCardUI(slotIdx);
    return;
  }

  const diffMv = t.voltageMv - slotTargetMv; // Positive = above target, Negative = below target

  // Phase 1: SETTLING (Resting open-circuit after a Charge or Discharge pass)
  if (k.phase === "SETTLING") {
    const remainSec = Math.ceil((k.settleUntilTime - now) / 1000);
    if (remainSec > 0) {
      k.phaseDetail = `OCV Settling (${remainSec}s)`;
      updateSlotCardUI(slotIdx);
      return;
    }

    // Done settling -> check if cell is holding steady or severely collapsing
    if (diffMv < -Math.max(25, cfg.deadbandMv * 3)) {
      k.consecutiveSettlingFails = (k.consecutiveSettlingFails || 0) + 1;
      if (k.consecutiveSettlingFails >= 3) {
        k.isStalled = true;
        k.stallReason = `Refuses to hold steady (collapsed by ${Math.abs(diffMv)}mV upon settling after 3 passes). Severe self-discharge / high internal leakage. Replace battery for racing.`;
        k.phase = "STALLED";
        k.phaseDetail = "⚠️ UNABLE TO HOLD — REPLACE CELL";
        updateSlotCardUI(slotIdx);
        await sendSlotStop(slotIdx, "Defective: Refuses to hold steady");
        appendLog("ERR", null, null, `[Mini 4WD Fault] Slot ${slotIdx + 1}: ${k.stallReason}`);
        return;
      }
    } else if (Math.abs(diffMv) <= cfg.deadbandMv) {
      k.consecutiveSettlingFails = 0;
    }

    // Evaluate true resting open-circuit voltage
    k.phase = "EVAL_OCV";
  }

  // Phase 2: Actively CHARGING toward Target
  if (k.phase === "CHARGING") {
    const chargingDuration = now - (k.chargeStartTime || now);

    // Stalled / Plateau detection (Battery unable to climb to commanded voltage)
    // Only evaluated when cell has charged for >5 min and is within 50mV of target ceiling
    if (chargingDuration >= 300000 && t.voltageMv >= slotTargetMv - 50) {
      if (now - (k.lastProgressTime || now) >= 180000) {
        const progressMv = t.voltageMv - (k.lastProgressV || t.voltageMv);
        if (progressMv < 2 && t.voltageMv < slotTargetMv - cfg.deadbandMv) {
          k.isStalled = true;
          k.stallReason = `Refuses to climb (voltage plateaued at ${(t.voltageMv / 1000).toFixed(3)}V for >3 min near target ${(slotTargetMv / 1000).toFixed(3)}V). High internal resistance / chemical degradation. Replace battery for racing.`;
          k.phase = "STALLED";
          k.phaseDetail = "⚠️ STALLED — REPLACE CELL";
          updateSlotCardUI(slotIdx);
          await sendSlotStop(slotIdx, "Stalled: Chemical voltage ceiling reached");
          appendLog("ERR", null, null, `[Mini 4WD Fault] Slot ${slotIdx + 1}: ${k.stallReason}`);
          return;
        }
        k.lastProgressV = t.voltageMv;
        k.lastProgressTime = now;
      }
    }

    // High IR warning advisory
    if (t.irMohm >= 80) {
      k.phaseDetail = `Charging (⚠️ High IR: ${t.irMohm}mΩ)`;
    }

    // 1. Hardware Cutoff Reached Naturally:
    // When the charger hardware completes a charge pass, verify whether resting voltage is truly within deadband!
    if (t.chargerStatu >= 5 && t.mode === 0) {
      if (Math.abs(diffMv) <= cfg.deadbandMv) {
        // True target reached!
        k.phase = "HOLDING_READY";
        k.hasSyncedDone = true;
        k.latchGraceUntil = 0;
        k.phaseDetail = `READY @ ${(t.voltageMv / 1000).toFixed(3)}V (Holding)`;
        updateSlotCardUI(slotIdx);
        return;
      }
      // If hardware cut off early (e.g. under load IR rebound), settle and top off with Fine Current!
      k.phase = "SETTLING";
      k.settleUntilTime = now + 4000;
      k.phaseDetail = `Pass Ended (${(t.voltageMv / 1000).toFixed(3)}V) → Settling`;
      updateSlotCardUI(slotIdx);
      return;
    }

    if (t.chargerStatu !== 2 && now - k.lastCmdTime > 3000) {
      k.phase = "SETTLING";
      k.settleUntilTime = now + Math.min(cfg.settleMs, 5000);
      k.phaseDetail = `Pass Complete → Settling`;
      updateSlotCardUI(slotIdx);
      return;
    }

    // 2. High IR load compensation:
    // Under load, voltage reads higher than open-circuit due to I*R drop.
    // If voltage exceeds safety ceiling (target + 35mV), send explicit stop.
    if (t.voltageMv >= slotTargetMv + 35) {
      await sendSlotStop(slotIdx, `Safety cutoff: ${(t.voltageMv / 1000).toFixed(3)}V`);
      k.phase = "SETTLING";
      k.settleUntilTime = now + cfg.settleMs;
      k.phaseDetail = `Settling OCV (${Math.round(cfg.settleMs / 1000)}s)`;
      updateSlotCardUI(slotIdx);
      return;
    }

    k.phaseDetail = `Charging → ${(slotTargetMv / 1000).toFixed(3)}V`;
    updateSlotCardUI(slotIdx);
    return;
  }

  // Phase 3: Actively DISCHARGING toward Target
  if (k.phase === "DISCHARGING") {
    // Account for small voltage sag under discharge load
    const irSagMv = t.irMohm > 0 && t.currentMa > 0 ? Math.min(25, Math.round((t.currentMa * t.irMohm) / 2500)) : 5;
    if (t.voltageMv <= slotTargetMv - irSagMv) {
      await sendSlotStop(slotIdx, `Discharged to ${(t.voltageMv / 1000).toFixed(3)}V (Target ${(slotTargetMv / 1000).toFixed(3)}V)`);
      k.phase = "SETTLING";
      k.settleUntilTime = now + cfg.settleMs;
      k.phaseDetail = `Settling OCV (${Math.round(cfg.settleMs / 1000)}s)`;
      updateSlotCardUI(slotIdx);
      return;
    }
    if (t.chargerStatu !== 3 && now - k.lastCmdTime > 6000) {
      k.phase = "SETTLING";
      k.settleUntilTime = now + cfg.settleMs;
      k.phaseDetail = `HW Cutoff → Settling`;
      updateSlotCardUI(slotIdx);
      return;
    }
    k.phaseDetail = `Discharging → ${(slotTargetMv / 1000).toFixed(3)}V`;
    updateSlotCardUI(slotIdx);
    return;
  }

  // Phase 4: HOLDING_READY (Schmitt-Trigger Tight Hysteresis Hold)
  if (k.phase === "HOLDING_READY") {
    // Hold Deadband:
    // Tight hold window for racing accuracy (cfg.deadbandMv + 3, default ±8mV per cell = ±16mV combined pair)
    const holdDeadbandMv = cfg.deadbandMv + 3;

    if (Math.abs(diffMv) <= holdDeadbandMv) {
      k.outOfBandPolls = 0;
      k.phaseDetail = `READY @ ${(t.voltageMv / 1000).toFixed(3)}V (Holding)`;
      updateSlotCardUI(slotIdx);

      // Check if NC3000 Pro LCD shows DONE with Solid Green LED:
      // - Charge Complete: chargerStatu >= 5 AND mode === 0
      // - Trickle Maintain: chargerStatu === 2 AND currentMa <= trickleMa + 15 AND mode === 0
      const isHwDoneGreen = (t.chargerStatu >= 5 && t.mode === 0) || (t.chargerStatu === 2 && t.currentMa <= (cfg.trickleMa || 30) + 15 && t.mode === 0);

      // If already synced, or within latch grace window, hold quietly (NEVER send repetitive commands)
      if (k.hasSyncedDone || now < k.latchGraceUntil) {
        return;
      }

      // If slot is currently in completed Discharge (mode 1 with chargerStatu >= 5 / Red LED),
      // clear the completed discharge task first so the MCU accepts the charge completion latch cleanly.
      if (t.chargerStatu >= 5 && t.mode === 1 && now - k.lastCmdTime > 2000) {
        k.lastCmdTime = now;
        await sendSlotStop(slotIdx, "Clearing completed discharge to latch solid green charge DONE");
        return;
      }

      // Strictly ONE-SHOT Latch for channels that reached target via discharge or were in standby:
      if (!isHwDoneGreen && now - k.lastCmdTime > 3000) {
        k.hasSyncedDone = true;
        k.latchGraceUntil = now + 8000; // 8 seconds grace window to let hardware transition
        k.lastCmdTime = now;
        const mask = NC3000_SLOT_MASKS[slotIdx];
        const targetMv = Math.max(slotTargetMv, t.voltageMv);
        const doneLatchFrame = buildNc3000SetFrame({
          slotMask: mask,
          model: 0, // Charge mode (triggers Solid Green LED upon completion)
          chargeMa: 200, // NC3000 Pro hardware minimum charge current
          dischargeMa: 200,
          capacityMah: 3500,
          inStopVoltageMv: targetMv,
          outStopVoltageMv: 900,
          inStopCurrentMa: 200, // Immediate cutoff threshold
          outStopCurrentMa: 100,
          deltaVMv: 0, // Disable -dV to prevent false noise cutoff
          trickleMa: cfg.trickleMa || 30, // Hardware trickle maintain
          restartVoltMv: slotTargetMv, // Maintain exact target voltage
          tempProtectC: cfg.tempProtectC || 71,
          inTimeProtectMin: 180
        });
        await sendBytes(doneLatchFrame, `[Keeper Slot ${slotIdx + 1}: Sync Hardware DONE State (Solid Green LED)]`);
      }
      return;
    } else {
      // Voltage drifted outside the hold deadband!
      // Require 2 consecutive telemetry polls (~3 seconds) before breaking out of READY,
      // filtering out transient contact noise.
      k.outOfBandPolls = (k.outOfBandPolls || 0) + 1;
      if (k.outOfBandPolls < 2) {
        k.phaseDetail = `READY @ ${(t.voltageMv / 1000).toFixed(3)}V (Hold Δ ${diffMv > 0 ? "+" : ""}${diffMv}mV)`;
        updateSlotCardUI(slotIdx);
        return;
      }

      // Confirmed genuine drift outside hold deadband
      k.outOfBandPolls = 0;
      k.hasSyncedDone = false;
      k.latchGraceUntil = 0;
      k.phase = "EVAL_OCV";
    }
  }

  // Phase 5: EVAL_OCV & Task Initiation
  // If charger is running an active high-power task unexpectedly (>50mA) outside latch grace window, stop it to measure true resting OCV
  if ((t.chargerStatu === 2 || t.chargerStatu === 3) && t.currentMa > 50 && now >= k.latchGraceUntil) {
    await sendSlotStop(slotIdx, "Stopping active task to measure OCV");
    k.phase = "SETTLING";
    k.settleUntilTime = now + 4000;
    k.phaseDetail = "Measuring OCV (4s)";
    updateSlotCardUI(slotIdx);
    return;
  }

  // Entry deadband: strictly user's configured deadband (default ±5mV per cell / ±10mV pack)
  const effectiveEntryDeadbandMv = cfg.deadbandMv;

  if (Math.abs(diffMv) <= effectiveEntryDeadbandMv) {
    k.phase = "HOLDING_READY";
    k.phaseDetail = `READY @ ${(t.voltageMv / 1000).toFixed(3)}V (Holding)`;
    updateSlotCardUI(slotIdx);
    return;
  }

  const useFine = Math.abs(diffMv) <= 35; // Within 35mV of target, use fine trim current (200mA)
  if (diffMv < -effectiveEntryDeadbandMv) {
    // Battery voltage is below Target - deadband -> Charge toward target
    k.phase = "CHARGING";
    k.passCount++;
    k.phaseDetail = `${useFine ? "Fine Top-Off" : "Charging"} → ${(slotTargetMv / 1000).toFixed(3)}V`;
    updateSlotCardUI(slotIdx);
    await sendSlotChargeToTarget(slotIdx, useFine);
  } else if (diffMv > effectiveEntryDeadbandMv) {
    // Battery voltage is above Target + deadband -> Discharge toward target
    k.phase = "DISCHARGING";
    k.passCount++;
    k.phaseDetail = `${useFine ? "Fine Trim Discharge" : "Discharging"} → ${(slotTargetMv / 1000).toFixed(3)}V`;
    updateSlotCardUI(slotIdx);
    await sendSlotDischargeToTarget(slotIdx, useFine);
  }
}

// Poll all 4 slots (0x91 with masks 0x01, 0x02, 0x04, 0x08)
async function pollAllFourSlotsOnce() {
  if (!gattServer || !gattServer.connected) return;
  for (let i = 0; i < 4; i++) {
    const mask = NC3000_SLOT_MASKS[i];
    const frame = buildSkyrcFrame(new Uint8Array([0x91, mask]));
    await sendBytes(frame, `[Telemetry Poll Slot ${i + 1}]`);
    await new Promise((r) => setTimeout(r, 140));
  }
}

function startTelemetryPoller() {
  if (keeperState.pollTimer) return;
  keeperState.pollTimer = setInterval(async () => {
    if (!gattServer || !gattServer.connected || scanState.running) return;

    const slotIdx = keeperState.pollCursor % 4;
    keeperState.pollCursor = (keeperState.pollCursor + 1) % 4;
    const mask = NC3000_SLOT_MASKS[slotIdx];
    const frame = buildSkyrcFrame(new Uint8Array([0x91, mask]));
    await sendBytes(frame, `[Poll Slot ${slotIdx + 1}]`);
  }, 420); // Polls 1 slot every 420ms -> full 4-slot sweep every ~1.68s
}

function stopTelemetryPoller() {
  if (keeperState.pollTimer) {
    clearInterval(keeperState.pollTimer);
    keeperState.pollTimer = null;
  }
}

const KEEPER_STATUS_ICONS = {
  disconnected: `<svg class="status-icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 2 20 20M9 15H7A5 5 0 0 1 7 7M15 7h2a5 5 0 0 1 3.5 8.5M8 12h5"/></svg>`,
  connectedIdle: `<svg class="status-icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg>`,
  active: `<svg class="status-icon-svg active-pulse" viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
};

function updateKeeperControlButtons() {
  const isConnected = !!(gattServer && gattServer.connected) || document.body.classList.contains("ble-connected") || (statusIndicator && statusIndicator.classList.contains("connected"));
  const p0Active = !!keeperState.pairs?.[0]?.active;
  const p1Active = !!keeperState.pairs?.[1]?.active;
  const anyActive = p0Active || p1Active;
  const cfg = getKeeperConfig();

  const enabledSlotIndices = [];
  for (let i = 0; i < 4; i++) {
    if (cfg.enabledSlots[i]) enabledSlotIndices.push(i);
  }
  const enabledCount = enabledSlotIndices.length;

  const btnStartKeeper = document.getElementById("btnStartKeeper");
  const btnStopKeeper = document.getElementById("btnStopKeeper");
  const btnStartP0 = document.getElementById("btnStartPair-0");
  const btnStopP0 = document.getElementById("btnStopPair-0");
  const btnStartP1 = document.getElementById("btnStartPair-1");
  const btnStopP1 = document.getElementById("btnStopPair-1");

  // Master Start / Stop button: Mutually exclusive display
  if (btnStartKeeper && btnStopKeeper) {
    if (anyActive) {
      btnStartKeeper.style.display = "none";
      btnStopKeeper.style.display = "";
      btnStopKeeper.disabled = !isConnected;
      btnStopKeeper.textContent = "■ Stop Running Slots";
    } else {
      btnStartKeeper.style.display = "";
      btnStartKeeper.disabled = !isConnected || enabledCount === 0;
      btnStopKeeper.style.display = "none";

      if (enabledCount === 4) {
        btnStartKeeper.textContent = "▶ Start All 4 Slots";
      } else if (enabledCount > 0) {
        btnStartKeeper.textContent = `▶ Start Selected Slots (${enabledCount}/4)`;
      } else {
        btnStartKeeper.textContent = "▶ No Slots Selected";
      }
    }
  }

  // Pair 1 Start / Stop button: Mutually exclusive display
  const p0Count = (cfg.enabledSlots[0] ? 1 : 0) + (cfg.enabledSlots[1] ? 1 : 0);
  if (btnStartP0 && btnStopP0) {
    if (p0Active) {
      btnStartP0.style.display = "none";
      btnStopP0.style.display = "";
      btnStopP0.disabled = !isConnected;
    } else {
      btnStartP0.style.display = "";
      btnStartP0.disabled = !isConnected || p0Count === 0;
      btnStopP0.style.display = "none";

      if (p0Count === 2) {
        btnStartP0.textContent = "▶ Start Pair 1 (Slots 1 & 2)";
      } else if (p0Count === 1) {
        const s = cfg.enabledSlots[0] ? 1 : 2;
        btnStartP0.textContent = `▶ Start Pair 1 (Slot ${s})`;
      } else {
        btnStartP0.textContent = "▶ Start Pair 1 (0 Slots)";
      }
    }
  }

  // Pair 2 Start / Stop button: Mutually exclusive display
  const p1Count = (cfg.enabledSlots[2] ? 1 : 0) + (cfg.enabledSlots[3] ? 1 : 0);
  if (btnStartP1 && btnStopP1) {
    if (p1Active) {
      btnStartP1.style.display = "none";
      btnStopP1.style.display = "";
      btnStopP1.disabled = !isConnected;
    } else {
      btnStartP1.style.display = "";
      btnStartP1.disabled = !isConnected || p1Count === 0;
      btnStopP1.style.display = "none";

      if (p1Count === 2) {
        btnStartP1.textContent = "▶ Start Pair 2 (Slots 3 & 4)";
      } else if (p1Count === 1) {
        const s = cfg.enabledSlots[2] ? 3 : 4;
        btnStartP1.textContent = `▶ Start Pair 2 (Slot ${s})`;
      } else {
        btnStartP1.textContent = "▶ Start Pair 2 (0 Slots)";
      }
    }
  }

  updateKeeperHeaderPill();
}

function updateKeeperHeaderPill() {
  const pill = document.getElementById("keeperGlobalStatus");
  const txt = document.getElementById("keeperStatusText");
  const icon = document.getElementById("keeperStatusIcon");
  const isConnected = !!(gattServer && gattServer.connected) || document.body.classList.contains("ble-connected") || (statusIndicator && statusIndicator.classList.contains("connected"));
  const p0Active = !!keeperState.pairs?.[0]?.active;
  const p1Active = !!keeperState.pairs?.[1]?.active;
  const bothActive = p0Active && p1Active;
  const cfg = getKeeperConfig();
  const modeObj = WORKING_MODES[cfg.mode] || WORKING_MODES.RACE_READY;

  if (pill && txt) {
    if (!isConnected) {
      pill.className = "status-pill disconnected";
      txt.textContent = "NC3000 Pro Disconnected";
      if (icon) icon.innerHTML = KEEPER_STATUS_ICONS.disconnected;
    } else if (bothActive) {
      pill.className = "status-pill connected is-running";
      txt.textContent = `${modeObj.name} (Pairs 1 & 2 Active)`;
      if (icon) icon.innerHTML = KEEPER_STATUS_ICONS.active;
    } else if (p0Active) {
      pill.className = "status-pill connected is-running";
      txt.textContent = `${modeObj.name} (Pair 1 Active)`;
      if (icon) icon.innerHTML = KEEPER_STATUS_ICONS.active;
    } else if (p1Active) {
      pill.className = "status-pill connected is-running";
      txt.textContent = `${modeObj.name} (Pair 2 Active)`;
      if (icon) icon.innerHTML = KEEPER_STATUS_ICONS.active;
    } else {
      pill.className = "status-pill connected";
      txt.textContent = "NC3000 Pro Connected (Idle)";
      if (icon) icon.innerHTML = KEEPER_STATUS_ICONS.connectedIdle;
    }
  }

  updateHeaderModePill();
}

async function startPairKeeper(pairIdx) {
  if (!gattServer || !gattServer.connected) {
    showToast("Please connect to your SkyRC NC3000 Pro first.", "warning");
    return;
  }
  const cfg = getKeeperConfig();
  if (!keeperState.pairs) {
    keeperState.pairs = [{ active: false }, { active: false }];
  }

  const slotRange = pairIdx === 0 ? [0, 1] : [2, 3];
  let activeMask = 0;
  const activeSlots = [];
  for (const i of slotRange) {
    if (cfg.enabledSlots[i]) {
      activeMask |= NC3000_SLOT_MASKS[i];
      activeSlots.push(i);
    }
  }

  if (activeMask === 0) {
    showToast(`Pair ${pairIdx + 1} has no active slots selected. Please check Slot ${slotRange[0] + 1} or Slot ${slotRange[1] + 1}.`, "warning");
    return;
  }

  keeperState.pairs[pairIdx].active = true;
  keeperState.active = true;

  const now = Date.now();

  for (const i of slotRange) {
    const isSlotEnabled = cfg.enabledSlots[i];
    const hasCell = slotTelemetry[i].hasBattery;
    keeperState.slots[i].isStalled = false;
    keeperState.slots[i].stallReason = "";
    keeperState.slots[i].wasBatteryPresent = hasCell;
    keeperState.slots[i].lastCmdTime = now;
    keeperState.slots[i].passCount = 0;
    keeperState.slots[i].consecutiveSettlingFails = 0;
    keeperState.slots[i].debounceUntilTime = 0;

    if (!isSlotEnabled) {
      keeperState.slots[i].phase = "IDLE";
      keeperState.slots[i].phaseDetail = "Slot Disabled";
    } else if (cfg.mode === "RACE_READY") {
      keeperState.slots[i].phase = hasCell ? "EVAL_OCV" : "NO_BATTERY";
      keeperState.slots[i].phaseDetail = hasCell ? "Evaluating OCV…" : "Waiting for Battery";
    } else {
      keeperState.slots[i].phase = hasCell ? "NATIVE_ACTIVE" : "NO_BATTERY";
      keeperState.slots[i].phaseDetail = hasCell ? `Starting ${WORKING_MODES[cfg.mode]?.name || "Native"}…` : "Waiting for Battery";
    }
    updateSlotCardUI(i);
  }

  startTelemetryPoller();
  updateKeeperControlButtons();

  const slotNames = activeSlots.map((s) => `Slot ${s + 1}`).join(", ");
  const modeName = WORKING_MODES[cfg.mode]?.name || cfg.mode;

  if (cfg.mode === "RACE_READY") {
    const targetV = (pairIdx === 0 ? cfg.pair1TargetMv : cfg.pair2TargetMv) / 1000;
    const cellTargetV = targetV / 2;
    appendLog(
      "SYS",
      null,
      null,
      `Started Pair ${pairIdx + 1} Keeper (Race Ready Mode - ${slotNames}: ${targetV.toFixed(3)}V total [${cellTargetV.toFixed(3)}V/cell]).`
    );
  } else {
    // Send individual 0x94 frames for each enabled slot in this pair!
    for (let s = 0; s < activeSlots.length; s++) {
      const slotIdx = activeSlots[s];
      const mask = NC3000_SLOT_MASKS[slotIdx];
      const nativeFrame = buildNativeModeFrame(cfg.mode, mask);
      await sendBytes(nativeFrame, `[Start Native ${cfg.mode} on Pair ${pairIdx + 1} Slot ${slotIdx + 1} (Mask 0x0${mask.toString(16)})]`);
      if (s < activeSlots.length - 1) {
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    appendLog(
      "SYS",
      null,
      null,
      `Dispatched Native Hardware Mode: ${modeName} on Pair ${pairIdx + 1} (${slotNames}).`
    );
  }
}

async function stopPairKeeper(pairIdx, stopHardwareSlots = true) {
  if (!keeperState.pairs) {
    keeperState.pairs = [{ active: false }, { active: false }];
  }
  keeperState.pairs[pairIdx].active = false;
  keeperState.pairs[pairIdx].userStoppedUntil = Date.now() + 2500;
  keeperState.active = keeperState.pairs[0].active || keeperState.pairs[1].active;

  const slotRange = pairIdx === 0 ? [0, 1] : [2, 3];
  for (const i of slotRange) {
    keeperState.slots[i].phase = "IDLE";
    keeperState.slots[i].phaseDetail = "Standby";
    updateSlotCardUI(i);
  }

  if (stopHardwareSlots && gattServer && gattServer.connected) {
    for (let s = 0; s < slotRange.length; s++) {
      const slotIdx = slotRange[s];
      const mask = NC3000_SLOT_MASKS[slotIdx];
      const stopPairFrame = buildNc3000StopFrame(mask);
      await sendBytes(stopPairFrame, `[Stop Pair ${pairIdx + 1} Slot ${slotIdx + 1} (0xFE 0x0${mask.toString(16)})]`);
      if (s < slotRange.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  updateKeeperControlButtons();
  appendLog("SYS", null, null, `Stopped Pair ${pairIdx + 1} Keeper.`);
}

async function startAutoKeeper() {
  if (!gattServer || !gattServer.connected) {
    showToast("Please connect to your SkyRC NC3000 Pro first.", "warning");
    return;
  }
  const cfg = getKeeperConfig();

  // Calculate unified active mask across all 4 slots based on checkboxes
  let totalActiveMask = 0;
  const activeSlots = [];
  for (let i = 0; i < 4; i++) {
    if (cfg.enabledSlots[i]) {
      totalActiveMask |= NC3000_SLOT_MASKS[i];
      activeSlots.push(i);
    }
  }

  if (totalActiveMask === 0) {
    showToast("No slots selected! Please check at least one slot tick box to run.", "warning");
    return;
  }

  if (!keeperState.pairs) {
    keeperState.pairs = [{ active: false }, { active: false }];
  }

  // Activate pairs that have at least one enabled slot
  keeperState.pairs[0].active = cfg.enabledSlots[0] || cfg.enabledSlots[1];
  keeperState.pairs[1].active = cfg.enabledSlots[2] || cfg.enabledSlots[3];
  keeperState.active = true;

  // Initialize slot states
  const now = Date.now();
  for (let i = 0; i < 4; i++) {
    const isSlotEnabled = cfg.enabledSlots[i];
    const hasCell = slotTelemetry[i].hasBattery;
    keeperState.slots[i].isStalled = false;
    keeperState.slots[i].stallReason = "";
    keeperState.slots[i].wasBatteryPresent = hasCell;
    keeperState.slots[i].lastCmdTime = now;
    keeperState.slots[i].passCount = 0;
    keeperState.slots[i].consecutiveSettlingFails = 0;
    keeperState.slots[i].debounceUntilTime = 0;

    if (!isSlotEnabled) {
      keeperState.slots[i].phase = "IDLE";
      keeperState.slots[i].phaseDetail = "Slot Disabled";
    } else if (cfg.mode === "RACE_READY") {
      keeperState.slots[i].phase = hasCell ? "EVAL_OCV" : "NO_BATTERY";
      keeperState.slots[i].phaseDetail = hasCell ? "Evaluating OCV…" : "Waiting for Battery";
    } else {
      keeperState.slots[i].phase = hasCell ? "NATIVE_ACTIVE" : "NO_BATTERY";
      keeperState.slots[i].phaseDetail = hasCell ? `Starting ${WORKING_MODES[cfg.mode]?.name || "Native"}…` : "Waiting for Battery";
    }
    updateSlotCardUI(i);
  }

  startTelemetryPoller();
  updateKeeperControlButtons();

  const slotNumbersStr = activeSlots.map((idx) => `Slot ${idx + 1}`).join(", ");
  const modeName = WORKING_MODES[cfg.mode]?.name || cfg.mode;

  if (cfg.mode === "RACE_READY") {
    appendLog(
      "SYS",
      null,
      null,
      `Started Race Ready Keeper on ${slotNumbersStr}.`
    );
  } else {
    if (activeSlots.length === 4) {
      // In SkyRC NC3000 Pro firmware (disassembly 0x8004058/0x8010f4e),
      // position 0x00 triggers loop r7 = 0..3 starting all 4 slots atomically!
      const nativeFrame = buildNativeModeFrame(cfg.mode, 0x00);
      await sendBytes(nativeFrame, `[Start Native ${cfg.mode} on All 4 Slots (Position 0x00)]`);
    } else {
      // For custom slot subsets, send sequential 0x94 frames per slot with 120ms spacing
      for (let s = 0; s < activeSlots.length; s++) {
        const slotIdx = activeSlots[s];
        const mask = NC3000_SLOT_MASKS[slotIdx];
        const nativeFrame = buildNativeModeFrame(cfg.mode, mask);
        await sendBytes(nativeFrame, `[Start Native ${cfg.mode} on Slot ${slotIdx + 1} (Mask 0x0${mask.toString(16)})]`);
        if (s < activeSlots.length - 1) {
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    }
    appendLog(
      "SYS",
      null,
      null,
      `Dispatched Native Hardware Mode: ${modeName} on ${slotNumbersStr}.`
    );
  }
}

async function stopAutoKeeper(stopHardwareSlots = true) {
  if (!keeperState.pairs) {
    keeperState.pairs = [{ active: false }, { active: false }];
  }
  keeperState.pairs[0].active = false;
  keeperState.pairs[1].active = false;
  keeperState.pairs[0].userStoppedUntil = Date.now() + 2500;
  keeperState.pairs[1].userStoppedUntil = Date.now() + 2500;
  keeperState.active = false;

  for (let i = 0; i < 4; i++) {
    keeperState.slots[i].phase = "IDLE";
    keeperState.slots[i].phaseDetail = "Standby";
    updateSlotCardUI(i);
  }

  if (stopHardwareSlots && gattServer && gattServer.connected) {
    // In SkyRC NC3000 Pro firmware (disassembly 0x801169c),
    // position 0x00 triggers loop r4 = 0..3 stopping all 4 slots atomically!
    const stopAllFrame = buildNc3000StopFrame(0x00);
    await sendBytes(stopAllFrame, `[Stop All 4 Slots (0xFE 0x00)]`);
  }

  updateKeeperControlButtons();
  appendLog("SYS", null, null, `Stopped all charger slots.`);
}

// Bind Keeper UI Events
document.getElementById("btnPollOnce")?.addEventListener("click", pollAllFourSlotsOnce);
document.getElementById("btnStartKeeper").addEventListener("click", startAutoKeeper);
document.getElementById("btnStopKeeper").addEventListener("click", () => stopAutoKeeper(true));
document.getElementById("btnStartPair-0")?.addEventListener("click", () => startPairKeeper(0));
document.getElementById("btnStopPair-0")?.addEventListener("click", () => stopPairKeeper(0, true));
document.getElementById("btnStartPair-1")?.addEventListener("click", () => startPairKeeper(1));
document.getElementById("btnStopPair-1")?.addEventListener("click", () => stopPairKeeper(1, true));

// Quick slot selection buttons
document.getElementById("btnSelectAllSlots")?.addEventListener("click", () => {
  for (let s = 0; s < 4; s++) setSlotEnabled(s, true, false);
  syncAllSlotCheckboxesUI();
  saveKeeperPrefs();
});
document.getElementById("btnSelectPair1Slots")?.addEventListener("click", () => {
  setSlotEnabled(0, true, false);
  setSlotEnabled(1, true, false);
  setSlotEnabled(2, false, false);
  setSlotEnabled(3, false, false);
  syncAllSlotCheckboxesUI();
  saveKeeperPrefs();
});
document.getElementById("btnSelectPair2Slots")?.addEventListener("click", () => {
  setSlotEnabled(0, false, false);
  setSlotEnabled(1, false, false);
  setSlotEnabled(2, true, false);
  setSlotEnabled(3, true, false);
  syncAllSlotCheckboxesUI();
  saveKeeperPrefs();
});
document.getElementById("btnClearAllSlots")?.addEventListener("click", () => {
  for (let s = 0; s < 4; s++) setSlotEnabled(s, false, false);
  syncAllSlotCheckboxesUI();
  saveKeeperPrefs();
});

// Slot checkboxes change delegation
document.addEventListener("change", (e) => {
  const target = e.target;
  if (target && target.classList.contains("keeper-slot-chk")) {
    const slotIdx = parseInt(target.getAttribute("data-slot"), 10);
    if (!isNaN(slotIdx) && slotIdx >= 0 && slotIdx < 4) {
      onSlotSelectionChanged(slotIdx, target.checked);
    }
  }
});

document.getElementById("chkAutoPollTelemetry")?.addEventListener("change", (ev) => {
  if (ev.target.checked && gattServer && gattServer.connected) {
    startTelemetryPoller();
  }
});

// Two-way synchronization for Pair 1 & Pair 2 targets
const p1Input = document.getElementById("keeperPair1TargetV");
const p2Input = document.getElementById("keeperPair2TargetV");
const p1Note = document.getElementById("pair1CellTargetNote");
const p2Note = document.getElementById("pair2CellTargetNote");
const linkChk = document.getElementById("chkLinkPairs");

function syncPresetDropdown(targetV) {
  const presetSelect = document.getElementById("raceReadyPresetSelect");
  if (!presetSelect) return;
  const targetFloat = parseFloat(targetV);
  const matchingOpt = Array.from(presetSelect.options).find(
    (o) => o.value !== "custom" && Math.abs(parseFloat(o.value) - targetFloat) < 0.005
  );
  if (matchingOpt) {
    presetSelect.value = matchingOpt.value;
  } else {
    const customOpt = presetSelect.querySelector("option[value='custom']");
    if (customOpt) presetSelect.value = "custom";
  }
}

function syncPairTargets(sourceInput) {
  const p1Val = parseFloat(p1Input.value) || 3.000;
  const p2Val = parseFloat(p2Input.value) || 3.000;

  if (sourceInput === p1Input && linkChk.checked) {
    p2Input.value = p1Input.value;
  } else if (sourceInput === p2Input && linkChk.checked) {
    p1Input.value = p2Input.value;
  }

  const currentP1 = parseFloat(p1Input.value) || 3.000;
  const currentP2 = parseFloat(p2Input.value) || 3.000;

  if (p1Note) p1Note.textContent = `${(currentP1 / 2).toFixed(3)} V / cell`;
  if (p2Note) p2Note.textContent = `${(currentP2 / 2).toFixed(3)} V / cell`;

  syncPresetDropdown(p1Input.value);

  for (let i = 0; i < 4; i++) updateSlotCardUI(i);
  updatePairCardsUI();

  if (keeperState.active) {
    const cfg = getKeeperConfig();
    document.getElementById("keeperStatusText").textContent =
      `Mini 4WD Pair Keeper Active (P1: ${(cfg.pair1TargetMv / 1000).toFixed(2)}V | P2: ${(cfg.pair2TargetMv / 1000).toFixed(2)}V)`;
  }
}

p1Input?.addEventListener("input", () => syncPairTargets(p1Input));
p2Input?.addEventListener("input", () => syncPairTargets(p2Input));
linkChk?.addEventListener("change", () => {
  if (linkChk.checked) {
    p2Input.value = p1Input.value;
    syncPairTargets(p1Input);
  }
});

// Race Ready Preset Dropdown
const racePresetSelect = document.getElementById("raceReadyPresetSelect");
racePresetSelect?.addEventListener("change", (e) => {
  const val = e.target.value;
  if (val === "custom") return;
  const opt = e.target.options[e.target.selectedIndex];
  const pairV = opt.getAttribute("data-pair-v") || val;
  const chg = opt.getAttribute("data-chg");
  const dis = opt.getAttribute("data-dis");

  if (p1Input) p1Input.value = pairV;
  if (p2Input && linkChk.checked) p2Input.value = pairV;
  if (chg && document.getElementById("keeperChargeMa")) document.getElementById("keeperChargeMa").value = chg;
  if (dis && document.getElementById("keeperDischargeMa")) document.getElementById("keeperDischargeMa").value = dis;

  syncPairTargets(p1Input);
  saveKeeperPrefs();

  if (window.gsap) {
    gsap.fromTo(racePresetSelect, { scale: 0.97 }, { scale: 1, duration: 0.22, ease: "power2.out" });
    if (p1Input && p2Input) {
      gsap.fromTo(
        [p1Input, p2Input],
        { backgroundColor: "rgba(6, 182, 212, 0.22)" },
        { backgroundColor: "var(--bg-1)", duration: 0.4, ease: "power2.out" }
      );
    }
  }
});

// Dismiss defective battery warning (supports both slot-level and pair-level dismiss buttons)
document.querySelectorAll(".dismiss-stall-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const slotAttr = btn.getAttribute("data-slot");
    const pairAttr = btn.getAttribute("data-pair");
    let slotsToClear = [];
    if (slotAttr !== null) {
      slotsToClear.push(parseInt(slotAttr, 10));
    } else if (pairAttr !== null) {
      const pairIdx = parseInt(pairAttr, 10);
      slotsToClear = pairIdx === 0 ? [0, 1] : [2, 3];
    }

    for (const slotIdx of slotsToClear) {
      if (keeperState.slots[slotIdx]?.isStalled) {
        keeperState.slots[slotIdx].isStalled = false;
        keeperState.slots[slotIdx].stallReason = "";
        keeperState.slots[slotIdx].consecutiveSettlingFails = 0;
        keeperState.slots[slotIdx].chargeStartTime = 0;
        keeperState.slots[slotIdx].phase = "EVAL_OCV";
        keeperState.slots[slotIdx].phaseDetail = "Evaluating OCV…";
        updateSlotCardUI(slotIdx);
        await sendSlotStop(slotIdx, "Dismiss fault: reset hardware slot latch");
        appendLog("SYS", null, null, `Cleared fault on Slot ${slotIdx + 1}. Hardware slot reset.`);
      }
    }
    updatePairCardsUI();
  });
});

// Pit Display Mode & Audio Alert Controls
const btnTogglePitMode = document.getElementById("btnTogglePitMode");
if (btnTogglePitMode) {
  btnTogglePitMode.addEventListener("click", () => {
    document.body.classList.toggle("pit-mode");
    updatePitModeButtonUI();
    saveKeeperPrefs();
  });
}

const btnToggleAudio = document.getElementById("btnToggleAudio");
if (btnToggleAudio) {
  btnToggleAudio.addEventListener("click", () => {
    initAudioContext();
    audioAlertsEnabled = !audioAlertsEnabled;
    updateAudioButtonUI();
    saveKeeperPrefs();
    if (audioAlertsEnabled) {
      playTone(523.25, 100, "sine", 0.2);
    }
    // Also synchronize physical NC3000 charger buzzer & keypress beep
    if (typeof nc3000HwSettings !== "undefined") {
      nc3000HwSettings.systemBeep = audioAlertsEnabled ? 1 : 0;
      const elNotify = document.getElementById("hwSettingNotifyBeep");
      nc3000HwSettings.notifyBeep = audioAlertsEnabled ? (parseInt(elNotify?.value, 10) || 2) : 0;
      if (typeof syncHwSettingsControlsUI === "function") {
        syncHwSettingsControlsUI();
      }
      if (typeof sendHwSettingsToCharger === "function") {
        sendHwSettingsToCharger(`Sound Toggle (${audioAlertsEnabled ? "Enabled" : "Muted"})`);
      }
    }
  });
}

// Auto-save keeper preferences to localStorage
// Auto-save keeper preferences to localStorage
[
  "keeperWorkingMode",
  "keeperPair1TargetV",
  "keeperPair2TargetV",
  "chkLinkPairs",
  "keeperChargeMa",
  "keeperDischargeMa",
  "keeperFineMa",
  "keeperTrickleMa",
  "keeperSettleSec",
  "keeperDeadbandMv",
  "keeperStallTimeoutMin",
  "keeperTempProtectC",
  "mode0ChargeMa",
  "mode0CutoffMv",
  "mode0DeltaVMv",
  "mode0RestartVoltMv",
  "mode0TrickleMa",
  "mode0CapacityMah",
  "mode0TimerMin",
  "mode1DischargeMa",
  "mode1CutoffMv",
  "mode1StopCurrentMa",
  "mode1TimerMin",
  "mode3CycleSequence",
  "mode3CycleCount",
  "mode3ChargeMa",
  "mode3DischargeMa",
  "mode3CutoffMv",
  "mode3DischargeCutoffMv",
  "mode3DeltaVMv",
  "mode3TrickleMa",
  "mode3TimerMin",
  "mode3RestDischMin",
  "mode3RestChargeMin",
  "mode2CapacityMah",
  "mode5TurboLevel",
  "mode5CutoffMv",
  "mode5DeltaVMv",
  "mode6Stage1Ma",
  "mode6Stage1Pct",
  "mode6Stage2Ma",
  "mode6CutoffMv",
  "mode6DeltaVMv",
  "mode6TrickleMa",
  "mode4CapacityMah",
  "mode4ChargeMa",
  "mode4CutoffMv",
  "mode4DeltaVMv",
  "chkSlot1",
  "chkSlot2",
  "chkSlot3",
  "chkSlot4"
].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", () => {
      saveKeeperPrefs();
      updateTempCutoffNoteUI();
    });
    el.addEventListener("change", () => {
      saveKeeperPrefs();
      updateTempCutoffNoteUI();
    });
  }
});

// Presets & Configuration Slide-in Drawer Controls (Orchestrated with GSAP)
let configDrawerTimeline = null;

function openConfigDrawer() {
  const overlay = document.getElementById("configDrawerOverlay");
  const drawer = document.getElementById("configDrawer");
  const backdrop = document.getElementById("configDrawerBackdrop");
  if (!overlay || !drawer) return;

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");

  if (window.gsap) {
    if (configDrawerTimeline) configDrawerTimeline.kill();

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      gsap.set([backdrop, drawer], { clearProps: "all" });
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    configDrawerTimeline = tl;

    // Reset initial states for smooth entrance
    gsap.set(backdrop, { autoAlpha: 0 });
    gsap.set(drawer, { xPercent: 100 });

    // Animate backdrop & sliding panel
    tl.to(backdrop, { autoAlpha: 1, duration: 0.32, ease: "power2.out" }, 0)
      .to(drawer, { xPercent: 0, duration: 0.42, ease: "power3.out" }, 0);

    // Stagger in drawer contents for an orchestrated, premium reveal
    const header = drawer.querySelector(".drawer-header");
    const presets = drawer.querySelectorAll(".keeper-preset-row select, .keeper-preset-row .preset-label");
    const targets = drawer.querySelectorAll(".highlight-field");
    const otherFields = drawer.querySelectorAll(".keeper-form-grid .k-field:not(.highlight-field)");
    const footer = drawer.querySelector(".drawer-footer");

    if (header) {
      tl.fromTo(header, { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.25, ease: "power2.out" }, "<0.08");
    }
    if (presets.length) {
      tl.fromTo(presets, { scale: 0.95, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, stagger: 0.035, duration: 0.24, ease: "power2.out" }, "<0.05");
    }
    if (targets.length) {
      tl.fromTo(targets, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.04, duration: 0.28, ease: "power2.out" }, "<0.08");
    }
    if (otherFields.length) {
      tl.fromTo(otherFields, { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.02, duration: 0.22, ease: "power2.out" }, "<0.05");
    }
    if (footer) {
      tl.fromTo(footer, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.25, ease: "power2.out" }, "<0.08");
    }
  }
}

function closeConfigDrawer() {
  const overlay = document.getElementById("configDrawerOverlay");
  const drawer = document.getElementById("configDrawer");
  const backdrop = document.getElementById("configDrawerBackdrop");
  if (!overlay || !drawer) return;

  saveKeeperPrefs();

  if (window.gsap) {
    if (configDrawerTimeline) configDrawerTimeline.kill();

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("drawer-open");
      gsap.set([drawer, backdrop], { clearProps: "all" });
      return;
    }

    const tl = gsap.timeline({
      defaults: { ease: "power3.in" },
      onComplete: () => {
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("drawer-open");
        gsap.set([drawer, backdrop], { clearProps: "all" });
      }
    });
    configDrawerTimeline = tl;

    tl.to(drawer, { xPercent: 100, duration: 0.26, ease: "power3.in" }, 0)
      .to(backdrop, { autoAlpha: 0, duration: 0.22, ease: "power2.in" }, 0.04);
  } else {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
  }
}

document.getElementById("btnOpenConfig")?.addEventListener("click", openConfigDrawer);
document.getElementById("btnCloseConfig")?.addEventListener("click", closeConfigDrawer);
document.getElementById("btnApplyConfig")?.addEventListener("click", closeConfigDrawer);
document.getElementById("configDrawerBackdrop")?.addEventListener("click", closeConfigDrawer);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const overlay = document.getElementById("configDrawerOverlay");
    if (overlay && !overlay.classList.contains("hidden")) {
      closeConfigDrawer();
    }
  }
});

/* ==========================================================================
   TELEMETRY ANALYTICS & MULTI-METRIC CHART MODULE
   ========================================================================== */

const telemetryHistory = {
  maxPoints: 1200,
  slots: [[], [], [], []],
  maxCapacity: [0, 0, 0, 0],
  lastHasBattery: [false, false, false, false],
  slotStartTimes: [0, 0, 0, 0],
  selectedSlotView: 0, // 0 = Slot 1, 1 = Slot 2, 2 = Slot 3, 3 = Slot 4, -1 = All 4 Slots Overlay
  overlayMetric: "voltage", // "voltage" | "current" | "ir" | "capacity"
  isPaused: false,
  activeMetrics: {
    voltage: true,
    current: true,
    ir: true,
    capacity: true
  }
};

let telemetryChart = null;
let chartRenderPending = false;

function resetSlotTelemetry(slotIdx, reason = "Manual reset") {
  if (slotIdx < 0 || slotIdx >= 4) return;
  telemetryHistory.slots[slotIdx] = [];
  telemetryHistory.maxCapacity[slotIdx] = 0;
  telemetryHistory.slotStartTimes[slotIdx] = Date.now();

  if (telemetryHistory.selectedSlotView === slotIdx || telemetryHistory.selectedSlotView === -1) {
    updateAnalyticsKpis(slotIdx);
    requestTelemetryChartUpdate(true);
  }
  appendLog("SYS", null, null, `[Telemetry] Slot ${slotIdx + 1} chart data and peak capacity reset (${reason}).`);
}

function updateAnalyticsKpis(slotIdx) {
  const targetSlot = (slotIdx >= 0 && slotIdx < 4) ? slotIdx : 0;
  const t = slotTelemetry[targetSlot];
  const slotData = telemetryHistory.slots[targetSlot] || [];
  const maxMah = telemetryHistory.maxCapacity[targetSlot] || 0;

  const kpiSlotBadge = document.getElementById("kpiSlotBadge");
  if (kpiSlotBadge) {
    kpiSlotBadge.textContent = telemetryHistory.selectedSlotView === -1 ? "ALL SLOTS (REF S1)" : `SLOT ${targetSlot + 1}`;
  }

  const kpiMaxCap = document.getElementById("kpiMaxCapacity");
  if (kpiMaxCap) kpiMaxCap.textContent = maxMah;

  const kpiLiveCap = document.getElementById("kpiLiveCapacity");
  if (kpiLiveCap) kpiLiveCap.textContent = `Current: ${t ? t.capacityMah : 0} mAh`;

  const kpiLiveVolt = document.getElementById("kpiLiveVoltage");
  if (kpiLiveVolt) kpiLiveVolt.textContent = t && t.hasBattery ? (t.voltageMv / 1000).toFixed(3) : "—.———";

  const kpiDeltaV = document.getElementById("kpiDeltaV");
  if (kpiDeltaV) kpiDeltaV.textContent = t && t.hasBattery ? `-ΔV: ${t.deltaVMv} mV` : "-ΔV: — mV";

  const kpiLiveCur = document.getElementById("kpiLiveCurrent");
  if (kpiLiveCur) kpiLiveCur.textContent = t && t.hasBattery ? t.currentMa : 0;

  const kpiCurDir = document.getElementById("kpiCurrentDirection");
  if (kpiCurDir) {
    if (!t || !t.hasBattery || t.currentMa === 0) {
      kpiCurDir.textContent = "IDLE";
      kpiCurDir.className = "kpi-badge badge-neutral";
    } else if (t.mode === 1 || t.chargerStatu === 3) {
      kpiCurDir.textContent = "DISCHARGE";
      kpiCurDir.className = "kpi-badge badge-amber";
    } else {
      kpiCurDir.textContent = "CHARGING";
      kpiCurDir.className = "kpi-badge badge-green";
    }
  }

  const kpiRate = document.getElementById("kpiRateLabel");
  if (kpiRate) kpiRate.textContent = t ? `Mode: ${t.modeLabel}` : "Mode: Standby";

  const kpiLiveIr = document.getElementById("kpiLiveIr");
  if (kpiLiveIr) kpiLiveIr.textContent = t && t.irMohm > 0 ? t.irMohm : "—";

  const kpiIrHealth = document.getElementById("kpiIrHealth");
  if (kpiIrHealth) {
    if (!t || t.irMohm <= 0) {
      kpiIrHealth.textContent = "Cell IR: Not Measured";
    } else if (t.irMohm <= 25) {
      kpiIrHealth.textContent = "Cell IR: Excellent (<25mΩ)";
    } else if (t.irMohm <= 50) {
      kpiIrHealth.textContent = "Cell IR: Good (25-50mΩ)";
    } else if (t.irMohm <= 90) {
      kpiIrHealth.textContent = "Cell IR: Moderate (50-90mΩ)";
    } else {
      kpiIrHealth.textContent = "Cell IR: High (>90mΩ)";
    }
  }

  const kpiRunDur = document.getElementById("kpiRunDuration");
  if (kpiRunDur) {
    const sec = t ? t.durationSec : 0;
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    kpiRunDur.textContent = `${h}:${m}:${s}`;
  }

  const kpiRunPhase = document.getElementById("kpiRunPhase");
  if (kpiRunPhase) {
    kpiRunPhase.textContent = t ? t.chargerStatusLabel : "Standby";
  }

  const kpiSamples = document.getElementById("kpiSamplesRecorded");
  if (kpiSamples) kpiSamples.textContent = `${slotData.length} samples recorded`;

  const pointCount = document.getElementById("analyticsPointCount");
  if (pointCount) pointCount.textContent = `${slotData.length} pts`;
}

function initTelemetryChart() {
  const canvas = document.getElementById("telemetryChartCanvas");
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");
  telemetryChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            color: "#cbd5e1",
            font: { family: '"Fira Code", monospace', size: 11 }
          }
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          borderColor: "#334155",
          borderWidth: 1,
          titleFont: { family: '"Fira Code", monospace', size: 12 },
          bodyFont: { family: '"Fira Code", monospace', size: 11 },
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8", font: { family: '"Fira Code", monospace', size: 10 }, maxTicksLimit: 12 }
        },
        yVoltage: {
          type: "linear",
          position: "left",
          display: true,
          suggestedMin: 0.80,
          suggestedMax: 1.70,
          grid: { color: "rgba(56, 189, 248, 0.1)" },
          ticks: { color: "#38bdf8", font: { family: '"Fira Code", monospace', size: 10 }, callback: v => Number(v).toFixed(2) + "V" }
        },
        yCurrent: {
          type: "linear",
          position: "right",
          display: true,
          suggestedMin: 0,
          suggestedMax: 2500,
          grid: { drawOnChartArea: false },
          ticks: { color: "#22c55e", font: { family: '"Fira Code", monospace', size: 10 }, callback: v => v + "mA" }
        },
        yIr: {
          type: "linear",
          position: "right",
          display: true,
          suggestedMin: 0,
          suggestedMax: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: "#c084fc", font: { family: '"Fira Code", monospace', size: 10 }, callback: v => v + "mΩ" }
        },
        yCapacity: {
          type: "linear",
          position: "right",
          display: true,
          suggestedMin: 0,
          suggestedMax: 2000,
          grid: { drawOnChartArea: false },
          ticks: { color: "#f59e0b", font: { family: '"Fira Code", monospace', size: 10 }, callback: v => v + "mAh" }
        }
      }
    }
  });
  window.telemetryChart = telemetryChart;

  updateTelemetryChart(true);
}

function requestTelemetryChartUpdate(immediate = false) {
  if (immediate) {
    updateTelemetryChart(true);
    return;
  }
  if (chartRenderPending) return;
  chartRenderPending = true;
  requestAnimationFrame(() => {
    chartRenderPending = false;
    updateTelemetryChart();
  });
}

function updateTelemetryChart(force = false) {
  if (!telemetryChart) return;
  const isOverlay = telemetryHistory.selectedSlotView === -1;

  if (isOverlay) {
    const metric = telemetryHistory.overlayMetric || "voltage";
    const s0Data = telemetryHistory.slots[0];
    const s1Data = telemetryHistory.slots[1];
    const s2Data = telemetryHistory.slots[2];
    const s3Data = telemetryHistory.slots[3];
    const maxLen = Math.max(s0Data.length, s1Data.length, s2Data.length, s3Data.length);

    const labels = [];
    for (let i = 0; i < maxLen; i++) {
      const sample = s0Data[i] || s1Data[i] || s2Data[i] || s3Data[i];
      const sec = sample ? sample.elapsedSec : i;
      const m = String(Math.floor(sec / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      labels.push(`${m}:${s}`);
    }

    telemetryChart.data.labels = labels;

    let propName = "v";
    let axisKey = "yVoltage";
    let metricLabel = "Voltage (V)";
    if (metric === "current") {
      propName = "i";
      axisKey = "yCurrent";
      metricLabel = "Current (mA)";
    } else if (metric === "ir") {
      propName = "ir";
      axisKey = "yIr";
      metricLabel = "IR (mΩ)";
    } else if (metric === "capacity") {
      propName = "mah";
      axisKey = "yCapacity";
      metricLabel = "Capacity (mAh)";
    }

    telemetryChart.data.datasets = [
      {
        label: `Slot 1 ${metricLabel}`,
        data: s0Data.map(d => d[propName]),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.08)",
        yAxisID: axisKey,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15
      },
      {
        label: `Slot 2 ${metricLabel}`,
        data: s1Data.map(d => d[propName]),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.08)",
        yAxisID: axisKey,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15
      },
      {
        label: `Slot 3 ${metricLabel}`,
        data: s2Data.map(d => d[propName]),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.08)",
        yAxisID: axisKey,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15
      },
      {
        label: `Slot 4 ${metricLabel}`,
        data: s3Data.map(d => d[propName]),
        borderColor: "#c084fc",
        backgroundColor: "rgba(192, 132, 252, 0.08)",
        yAxisID: axisKey,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15
      }
    ];

    // Toggle scale display based on selected overlay metric
    telemetryChart.options.scales.yVoltage.display = (metric === "voltage");
    telemetryChart.options.scales.yCurrent.display = (metric === "current");
    telemetryChart.options.scales.yIr.display = (metric === "ir");
    telemetryChart.options.scales.yCapacity.display = (metric === "capacity");
  } else {
    // Single Slot View (Defaults to Slot 1 / selectedSlotView)
    const slotIdx = telemetryHistory.selectedSlotView >= 0 && telemetryHistory.selectedSlotView < 4
      ? telemetryHistory.selectedSlotView
      : 0;
    const slotData = telemetryHistory.slots[slotIdx];

    const labels = slotData.map(d => {
      const sec = d.elapsedSec;
      const m = String(Math.floor(sec / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      return `${m}:${s}`;
    });

    telemetryChart.data.labels = labels;
    telemetryChart.data.datasets = [
      {
        label: "Voltage (V)",
        data: slotData.map(d => d.v),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.1)",
        yAxisID: "yVoltage",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15,
        hidden: !telemetryHistory.activeMetrics.voltage
      },
      {
        label: "Current (mA)",
        data: slotData.map(d => d.i),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.05)",
        yAxisID: "yCurrent",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        hidden: !telemetryHistory.activeMetrics.current
      },
      {
        label: "IR (mΩ)",
        data: slotData.map(d => d.ir),
        borderColor: "#c084fc",
        backgroundColor: "rgba(192, 132, 252, 0.05)",
        yAxisID: "yIr",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        hidden: !telemetryHistory.activeMetrics.ir
      },
      {
        label: "Capacity (mAh)",
        data: slotData.map(d => d.mah),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.05)",
        yAxisID: "yCapacity",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        hidden: !telemetryHistory.activeMetrics.capacity
      }
    ];

    telemetryChart.options.scales.yVoltage.display = telemetryHistory.activeMetrics.voltage;
    telemetryChart.options.scales.yCurrent.display = telemetryHistory.activeMetrics.current;
    telemetryChart.options.scales.yIr.display = telemetryHistory.activeMetrics.ir;
    telemetryChart.options.scales.yCapacity.display = telemetryHistory.activeMetrics.capacity;
  }

  telemetryChart.update("none");
}

function switchAnalyticsSlotView(slotIdx) {
  telemetryHistory.selectedSlotView = slotIdx;
  document.querySelectorAll(".analytics-pill-btn").forEach((btn) => {
    const s = parseInt(btn.getAttribute("data-analytics-slot"), 10);
    btn.classList.toggle("active", s === slotIdx);
  });

  const singleToggles = document.getElementById("singleSlotMetricToggles");
  const overlayPills = document.getElementById("overlayMetricPills");
  if (singleToggles) singleToggles.classList.toggle("hidden", slotIdx === -1);
  if (overlayPills) overlayPills.classList.toggle("hidden", slotIdx !== -1);

  const heading = document.getElementById("chartHeadingTitle");
  const subtitle = document.getElementById("chartSubtitle");
  if (slotIdx === -1) {
    const metric = telemetryHistory.overlayMetric || "voltage";
    document.querySelectorAll(".overlay-metric-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-overlay-metric") === metric);
    });

    const overlayTitles = {
      voltage: {
        title: "All 4 Slots Voltage Overlay",
        sub: "Simultaneous multi-slot voltage curve comparison (0.80V – 1.70V)"
      },
      current: {
        title: "All 4 Slots Current Overlay",
        sub: "Simultaneous multi-slot current rate comparison (0 – 2500 mA)"
      },
      ir: {
        title: "All 4 Slots Internal Resistance Overlay",
        sub: "Simultaneous multi-slot cell IR comparison (0 – 100 mΩ)"
      },
      capacity: {
        title: "All 4 Slots Capacity Overlay",
        sub: "Simultaneous multi-slot accumulated mAh comparison"
      }
    };
    const info = overlayTitles[metric] || overlayTitles.voltage;
    if (heading) heading.textContent = info.title;
    if (subtitle) subtitle.textContent = info.sub;
  } else {
    if (heading) heading.textContent = `Slot ${slotIdx + 1} Telemetry Curves`;
    if (subtitle) subtitle.textContent = "Real-time Voltage (V), Current (mA), IR (mΩ) and Capacity (mAh)";
  }

  updateAnalyticsKpis(slotIdx >= 0 ? slotIdx : 0);
  requestTelemetryChartUpdate(true);
}

function switchAppTab(tabId) {
  const tabBtns = document.querySelectorAll(".tab-nav-btn");
  tabBtns.forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-tab") === tabId);
  });

  const keeperBody = document.getElementById("keeperBody");
  const analyticsTabView = document.getElementById("analyticsTabView");

  if (tabId === "dashboard") {
    if (keeperBody) keeperBody.style.display = "";
    if (analyticsTabView) analyticsTabView.classList.add("hidden");
  } else if (tabId === "analytics") {
    if (keeperBody) keeperBody.style.display = "none";
    if (analyticsTabView) analyticsTabView.classList.remove("hidden");
    if (telemetryChart) {
      setTimeout(() => {
        telemetryChart.resize();
        updateTelemetryChart(true);
      }, 50);
    }
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportTelemetryCsv(slotIdx) {
  const targetSlot = (slotIdx >= 0 && slotIdx < 4) ? slotIdx : telemetryHistory.selectedSlotView;
  let rows = [];
  rows.push(["Timestamp_ISO", "Elapsed_Sec", "Slot", "Voltage_V", "Current_mA", "Capacity_mAh", "DeltaV_mV", "IR_mOhm", "Status", "Mode"].join(","));

  if (targetSlot === -1) {
    for (let s = 0; s < 4; s++) {
      telemetryHistory.slots[s].forEach((item) => {
        rows.push([
          new Date(item.t).toISOString(),
          item.elapsedSec,
          s + 1,
          item.v,
          item.i,
          item.mah,
          item.deltaV,
          item.ir,
          `"${item.status || ""}"`,
          `"${item.mode || ""}"`
        ].join(","));
      });
    }
  } else {
    telemetryHistory.slots[targetSlot].forEach((item) => {
      rows.push([
        new Date(item.t).toISOString(),
        item.elapsedSec,
        targetSlot + 1,
        item.v,
        item.i,
        item.mah,
        item.deltaV,
        item.ir,
        `"${item.status || ""}"`,
        `"${item.mode || ""}"`
      ].join(","));
    });
  }

  const csvContent = rows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const filename = targetSlot === -1
    ? `nc3000-telemetry-all-slots-${Date.now()}.csv`
    : `nc3000-telemetry-slot${targetSlot + 1}-${Date.now()}.csv`;
  downloadBlob(blob, filename);
  showToast(`✅ Exported ${rows.length - 1} telemetry rows to ${filename}`);
}

function exportTelemetryJson() {
  const exportData = {
    exportedAt: new Date().toISOString(),
    version: APP_VERSION,
    maxCapacityMah: telemetryHistory.maxCapacity,
    slots: telemetryHistory.slots.map((samples, idx) => ({
      slot: idx + 1,
      sampleCount: samples.length,
      maxCapacityMah: telemetryHistory.maxCapacity[idx],
      samples
    }))
  };
  const jsonContent = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const filename = `nc3000-telemetry-session-${Date.now()}.json`;
  downloadBlob(blob, filename);
  showToast(`✅ Exported full telemetry session JSON`);
}

/* ==========================================================================
   NC3000 HARDWARE SYSTEM SETTINGS MODULE (0x95 / 0x96 / 0x97 / 0x56)
   ========================================================================== */

const nc3000HwSettings = {
  systemBeep: 1, // 0 = Off, 1 = On
  notifyBeep: 2, // 0 = Off/Mute, 1 = Low, 2 = Mid, 3 = High
  endNotifyBeep: 0, // 0 = Single, 1 = Repeat
  lcd: 2, // 0 = Off, 1 = Low, 2 = High
  warning: 1, // 0 = Off, 1 = On
  sleepTime: 3, // 0..8 -> [0, 1, 3, 5, 10, 15, 30, 60, 120] min
  mode: 0 // 0 = °C, 1 = °F
};

function buildNc3000SystemSettingFrame(settings = nc3000HwSettings) {
  // Opcode 0x95, 17-byte payload, length field = 19 (0x13)
  const payload = new Uint8Array(17);
  payload[0] = 0x00; // port / target mask
  payload[1] = (settings.systemBeep ?? 1) & 0xff;
  payload[2] = (settings.notifyBeep ?? 2) & 0xff;
  payload[3] = (settings.endNotifyBeep ?? 0) & 0xff;
  payload[4] = (settings.lcd ?? 2) & 0xff;
  payload[5] = (settings.warning ?? 1) & 0xff;
  payload[6] = (settings.sleepTime ?? 3) & 0xff;
  payload[7] = (settings.mode ?? 0) & 0xff;
  // bytes 8..16 remain 0x00 padding

  const cmdAndPayload = new Uint8Array(18);
  cmdAndPayload[0] = 0x95;
  cmdAndPayload.set(payload, 1);
  return buildSkyrcFrame(cmdAndPayload);
}

function buildNc3000QuerySystemSettingFrame() {
  return new Uint8Array([0x0f, 0x03, 0x96, 0x04, 0x9a]);
}

function buildNc3000ResetFrame() {
  return new Uint8Array([0x0f, 0x03, 0x97, 0x04, 0x9b]);
}

function buildNc3000EditPasswordFrame(pinStr) {
  const digits = String(pinStr || "0000").replace(/\D/g, "").padStart(4, "0").slice(-4);
  const cmdAndPayload = new Uint8Array([
    0x56,
    0x00,
    parseInt(digits[0], 10),
    parseInt(digits[1], 10),
    parseInt(digits[2], 10),
    parseInt(digits[3], 10)
  ]);
  return buildSkyrcFrame(cmdAndPayload);
}

function parseNc3000SystemSettingResponse(bytes) {
  if (bytes.length < 9) return null;
  nc3000HwSettings.systemBeep = bytes[4] & 0xff;
  nc3000HwSettings.notifyBeep = bytes[5] & 0xff;
  nc3000HwSettings.endNotifyBeep = bytes[6] & 0xff;
  nc3000HwSettings.lcd = bytes[7] & 0xff;
  nc3000HwSettings.warning = bytes[8] & 0xff;
  if (bytes.length > 11) {
    nc3000HwSettings.sleepTime = bytes[9] & 0xff;
    nc3000HwSettings.mode = bytes[10] & 0xff;
  }
  syncHwSettingsControlsUI();
  saveHwSettingsPrefs();
  return nc3000HwSettings;
}

function syncHwSettingsControlsUI() {
  const elBeep = document.getElementById("hwSettingKeypressBeep");
  if (elBeep) elBeep.value = String(nc3000HwSettings.systemBeep);

  const elNotify = document.getElementById("hwSettingNotifyBeep");
  if (elNotify) elNotify.value = String(nc3000HwSettings.notifyBeep);

  const elSleep = document.getElementById("hwSettingSleepTime");
  if (elSleep) elSleep.value = String(nc3000HwSettings.sleepTime);

  const elLcd = document.getElementById("hwSettingLcd");
  if (elLcd) elLcd.value = String(nc3000HwSettings.lcd);

  const elEnd = document.getElementById("hwSettingEndNotifyBeep");
  if (elEnd) elEnd.value = String(nc3000HwSettings.endNotifyBeep);

  const elWarn = document.getElementById("hwSettingWarning");
  if (elWarn) elWarn.value = String(nc3000HwSettings.warning);
}

function readHwSettingsFromUI() {
  const elBeep = document.getElementById("hwSettingKeypressBeep");
  if (elBeep) nc3000HwSettings.systemBeep = parseInt(elBeep.value, 10);

  const elNotify = document.getElementById("hwSettingNotifyBeep");
  if (elNotify) nc3000HwSettings.notifyBeep = parseInt(elNotify.value, 10);

  const elSleep = document.getElementById("hwSettingSleepTime");
  if (elSleep) nc3000HwSettings.sleepTime = parseInt(elSleep.value, 10);

  const elLcd = document.getElementById("hwSettingLcd");
  if (elLcd) nc3000HwSettings.lcd = parseInt(elLcd.value, 10);

  const elEnd = document.getElementById("hwSettingEndNotifyBeep");
  if (elEnd) nc3000HwSettings.endNotifyBeep = parseInt(elEnd.value, 10);

  const elWarn = document.getElementById("hwSettingWarning");
  if (elWarn) nc3000HwSettings.warning = parseInt(elWarn.value, 10);

  saveHwSettingsPrefs();
  return nc3000HwSettings;
}

function loadHwSettingsPrefs() {
  try {
    const raw = localStorage.getItem("skyrc_nc3000_hw_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(nc3000HwSettings, parsed);
    }
  } catch (_) {}
  syncHwSettingsControlsUI();
}

function saveHwSettingsPrefs() {
  try {
    localStorage.setItem("skyrc_nc3000_hw_settings", JSON.stringify(nc3000HwSettings));
  } catch (_) {}
}

async function sendHwSettingsToCharger(contextLabel = "Manual") {
  readHwSettingsFromUI();
  const frame = buildNc3000SystemSettingFrame(nc3000HwSettings);
  const txUuid = txCharSelect?.value;
  if (txUuid && characteristicsMap.has(txUuid)) {
    try {
      await sendBytes(frame, `Apply Hardware Settings (${contextLabel}) [0x95]`);
      showToast("⚡ NC3000 hardware settings sent to charger");
    } catch (err) {
      appendLog("ERR", null, null, `Failed to send system settings: ${err.message}`);
    }
  } else {
    appendLog("SYS", null, null, `[Hardware Settings] Saved locally (${contextLabel}). Connect BLE to sync to charger.`);
  }
}

async function queryHwSettingsFromCharger() {
  const frame = buildNc3000QuerySystemSettingFrame();
  const txUuid = txCharSelect?.value;
  if (txUuid && characteristicsMap.has(txUuid)) {
    try {
      await sendBytes(frame, "Query Hardware System Settings [0x96]");
      showToast("🔄 Sent querySystemSetting (0x96) to charger");
    } catch (err) {
      appendLog("ERR", null, null, `Failed to query system settings: ${err.message}`);
    }
  } else {
    showToast("⚠️ Connect BLE to query charger hardware settings");
  }
}

async function factoryResetHw() {
  const confirmed = await showConfirmModal(
    "⚠️ RESTORE FACTORY SETTINGS?",
    "This will send opcode 0x97 to the physical SkyRC NC3000 Pro charger, resetting all internal EEPROM parameters, slot calibrations, and user settings to factory defaults. Are you sure?"
  );
  if (!confirmed) return;

  const frame = buildNc3000ResetFrame();
  const txUuid = txCharSelect?.value;
  if (txUuid && characteristicsMap.has(txUuid)) {
    try {
      await sendBytes(frame, "Restore Factory Default Settings [0x97]");
      showToast("⚠️ Factory reset command dispatched to charger (0x97)");
      appendLog("SYS", null, null, "[Hardware] Factory reset command (0x97) sent to NC3000 charger.");
    } catch (err) {
      appendLog("ERR", null, null, `Factory reset failed: ${err.message}`);
    }
  } else {
    showToast("⚠️ Connect BLE to reset physical charger");
  }
}

async function changeHwPin() {
  const newPin = await showPromptModal(
    "🔒 Change Bluetooth Security PIN",
    "Enter a 4-digit numeric PIN for the SkyRC NC3000 Pro charger:",
    "0000"
  );
  if (newPin === null) return;
  const sanitizedPin = String(newPin).replace(/\D/g, "");
  if (sanitizedPin.length !== 4) {
    showToast("❌ PIN must be exactly 4 numeric digits (0000-9999)");
    return;
  }

  const frame = buildNc3000EditPasswordFrame(sanitizedPin);
  const txUuid = txCharSelect?.value;
  if (txUuid && characteristicsMap.has(txUuid)) {
    try {
      await sendBytes(frame, `Change Bluetooth PIN to ${sanitizedPin} [0x56]`);
      showToast(`🔒 Changed charger PIN to ${sanitizedPin}`);
    } catch (err) {
      appendLog("ERR", null, null, `Failed to update PIN: ${err.message}`);
    }
  } else {
    showToast("⚠️ Connect BLE to send PIN change to charger");
  }
}

// Startup Environment Check
window.addEventListener("DOMContentLoaded", () => {
  if (IS_LOCALHOST) {
    document.body.classList.add("is-localhost");
  } else {
    document.body.classList.remove("is-localhost");
  }

  loadKeeperPrefs();
  updateTempCutoffNoteUI();
  updateAudioButtonUI();
  updatePitModeButtonUI();
  updateKeeperControlButtons();
  updateKeeperHeaderPill();
  updatePairCardsUI();

  // Initialize Profile Manager & Mode Switcher
  populateProfileSelect();
  try {
    const savedActiveProf = localStorage.getItem("skyrc_nc3000_active_profile");
    if (savedActiveProf) {
      const select = document.getElementById("keeperProfileSelect");
      if (select && Array.from(select.options).some(o => o.value === savedActiveProf)) {
        select.value = savedActiveProf;
        applyProfile(savedActiveProf);
      }
    }
  } catch (_) {}

  const currentMode = document.getElementById("keeperWorkingMode")?.value || "RACE_READY";
  switchWorkingMode(currentMode, false);

  // Wire Mode & Profile Manager UI Controls
  document.getElementById("keeperWorkingMode")?.addEventListener("change", (e) => {
    switchWorkingMode(e.target.value, false);
  });
  document.getElementById("keeperProfileSelect")?.addEventListener("change", (e) => {
    applyProfile(e.target.value);
    updateProfileButtonsState();
  });
  document.getElementById("btnSaveNewProfile")?.addEventListener("click", saveCurrentAsNewProfile);
  document.getElementById("btnOverwriteProfile")?.addEventListener("click", overwriteCurrentProfile);
  document.getElementById("btnDeleteProfile")?.addEventListener("click", deleteCurrentProfile);
  document.getElementById("btnResetProfiles")?.addEventListener("click", resetDefaultProfiles);
  document.getElementById("headerModePill")?.addEventListener("click", () => {
    openConfigDrawer();
    document.getElementById("keeperProfileSelect")?.focus();
  });
  document.getElementById("mode2CapacityMah")?.addEventListener("input", (e) => {
    const cap = parseInt(e.target.value, 10) || 1000;
    const chg = Math.round(cap * 0.1);
    const dis = Math.round(cap * 0.2);
    const chgEl = document.getElementById("mode2ChargeMa");
    const disEl = document.getElementById("mode2DischargeMa");
    if (chgEl) chgEl.value = chg;
    if (disEl) disEl.value = dis;
  });
  document.getElementById("mode5TurboLevel")?.addEventListener("change", (e) => {
    const turboRates = [1500, 1800, 2000, 2500, 3000];
    const val = parseInt(e.target.value, 10) || 4;
    const chgEl = document.getElementById("mode5ChargeMa");
    if (chgEl) chgEl.value = turboRates[val] || 3000;
  });

  // Synchronize Version UI elements
  const verBadge = document.getElementById("appVersionBadge");
  if (verBadge) verBadge.textContent = APP_VERSION;
  const verHeader = document.getElementById("drawerVersionHeader");
  if (verHeader) verHeader.textContent = APP_VERSION;
  const verFooter = document.getElementById("drawerVersionFooter");
  if (verFooter) verFooter.textContent = APP_VERSION;
  const siteVer = document.getElementById("siteFooterVersion");
  if (siteVer) siteVer.textContent = APP_VERSION;
  console.log(`[SkyRC NC3000 Pro UI] Version ${APP_VERSION} (Build ${APP_BUILD_DATE}) initialized.`);

  // Initialize Hardware System Settings & Telemetry Charting
  loadHwSettingsPrefs();
  initTelemetryChart();

  // App Tab Navigation
  document.querySelectorAll(".tab-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      if (tabId) switchAppTab(tabId);
    });
  });

  // Analytics Slot Pills
  document.querySelectorAll(".analytics-pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = parseInt(btn.getAttribute("data-analytics-slot"), 10);
      switchAnalyticsSlotView(slot);
    });
  });

  // Analytics Toolbar Controls
  const btnPause = document.getElementById("btnPauseChart");
  if (btnPause) {
    btnPause.addEventListener("click", () => {
      telemetryHistory.isPaused = !telemetryHistory.isPaused;
      btnPause.textContent = telemetryHistory.isPaused ? "▶️ Resume" : "⏸️ Pause";
      btnPause.className = telemetryHistory.isPaused ? "btn small primary" : "btn small";
      showToast(telemetryHistory.isPaused ? "Live chart streaming paused" : "Live chart streaming resumed");
    });
  }

  const btnResetSlotChart = document.getElementById("btnResetSlotChart");
  if (btnResetSlotChart) {
    btnResetSlotChart.addEventListener("click", () => {
      const targetSlot = telemetryHistory.selectedSlotView >= 0 ? telemetryHistory.selectedSlotView : 0;
      resetSlotTelemetry(targetSlot, "User clicked Reset Slot");
      showToast(`🔄 Reset telemetry chart for Slot ${targetSlot + 1}`);
    });
  }

  // Metric Checkbox Toggles
  const metricToggles = [
    { id: "toggleMetricVoltage", key: "voltage" },
    { id: "toggleMetricCurrent", key: "current" },
    { id: "toggleMetricIr", key: "ir" },
    { id: "toggleMetricCapacity", key: "capacity" }
  ];
  metricToggles.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", (e) => {
        telemetryHistory.activeMetrics[key] = !!e.target.checked;
        requestTelemetryChartUpdate(true);
      });
    }
  });

  // Overlay Comparison Metric Pill Buttons
  document.querySelectorAll(".overlay-metric-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const metric = btn.getAttribute("data-overlay-metric");
      if (!metric) return;
      telemetryHistory.overlayMetric = metric;
      document.querySelectorAll(".overlay-metric-pill").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-overlay-metric") === metric);
      });
      switchAnalyticsSlotView(-1);
    });
  });

  // Export Menu & Handlers
  const btnExportMenu = document.getElementById("btnExportMenu");
  const exportDropdown = document.getElementById("exportMenuDropdown");
  if (btnExportMenu && exportDropdown) {
    btnExportMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      exportDropdown.classList.add("hidden");
    });
  }
  document.getElementById("btnExportCsvSlot")?.addEventListener("click", () => {
    exportTelemetryCsv(telemetryHistory.selectedSlotView);
    exportDropdown?.classList.add("hidden");
  });
  document.getElementById("btnExportCsvAll")?.addEventListener("click", () => {
    exportTelemetryCsv(-1);
    exportDropdown?.classList.add("hidden");
  });
  document.getElementById("btnExportJson")?.addEventListener("click", () => {
    exportTelemetryJson();
    exportDropdown?.classList.add("hidden");
  });

  // Hardware System Settings Wiring
  document.getElementById("btnPushHwSettings")?.addEventListener("click", () => sendHwSettingsToCharger("Manual Apply"));
  document.getElementById("btnQueryHwSettings")?.addEventListener("click", queryHwSettingsFromCharger);
  document.getElementById("btnChangeHwPin")?.addEventListener("click", changeHwPin);
  document.getElementById("btnFactoryResetHw")?.addEventListener("click", factoryResetHw);

  [
    "hwSettingKeypressBeep",
    "hwSettingNotifyBeep",
    "hwSettingSleepTime",
    "hwSettingLcd",
    "hwSettingEndNotifyBeep",
    "hwSettingWarning"
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      readHwSettingsFromUI();
    });
  });

  if (!navigator.bluetooth) {
    envWarningEl.classList.remove("hidden");
    envWarningEl.innerHTML =
      "⚠️ <strong>Web Bluetooth is unavailable in this browser.</strong> Please open this page in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Opera</strong> (Windows, Mac, Android). On iOS, open this URL in a Web Bluetooth browser like <strong>Bluefy</strong> or <strong>WebBLE</strong>.";
  } else {
    appendLog("SYS", null, null, "Web Bluetooth API ready. Power on your SkyRC NC3000 Pro and click 'Scan & Connect BLE'.");
  }
});

// Expose key API methods for automated testing and simulation
window.parseAndApplyNc3000SlotTelemetry = parseAndApplyNc3000SlotTelemetry;
window.switchWorkingMode = switchWorkingMode;
window.setStatus = setStatus;
window.keeperState = keeperState;
window.slotTelemetry = slotTelemetry;
window.updateKeeperControlButtons = updateKeeperControlButtons;
window.updateKeeperHeaderPill = updateKeeperHeaderPill;
window.buildNativeModeFrame = buildNativeModeFrame;
window.buildNc3000SetFrame = buildNc3000SetFrame;
window.getCurrentModeParams = getCurrentModeParams;
window.applyProfile = applyProfile;
window.loadProfiles = loadProfiles;
window.saveProfiles = saveProfiles;
window.showToast = showToast;
window.showConfirmModal = showConfirmModal;
window.showPromptModal = showPromptModal;
window.syncPresetDropdown = syncPresetDropdown;
window.DEFAULT_PROFILE_IDS = DEFAULT_PROFILE_IDS;
window.isDefaultProfile = isDefaultProfile;
window.updateProfileButtonsState = updateProfileButtonsState;
window.deleteCurrentProfile = deleteCurrentProfile;
window.saveCurrentAsNewProfile = saveCurrentAsNewProfile;
window.isSlotEnabled = isSlotEnabled;
window.setSlotEnabled = setSlotEnabled;
window.syncAllSlotCheckboxesUI = syncAllSlotCheckboxesUI;
window.onSlotSelectionChanged = onSlotSelectionChanged;
window.startAutoKeeper = startAutoKeeper;
window.stopAutoKeeper = stopAutoKeeper;
window.startPairKeeper = startPairKeeper;
window.stopPairKeeper = stopPairKeeper;
window.getKeeperConfig = getKeeperConfig;
window.telemetryHistory = telemetryHistory;
window.resetSlotTelemetry = resetSlotTelemetry;
window.updateAnalyticsKpis = updateAnalyticsKpis;
window.initTelemetryChart = initTelemetryChart;
window.requestTelemetryChartUpdate = requestTelemetryChartUpdate;
window.updateTelemetryChart = updateTelemetryChart;
window.switchAnalyticsSlotView = switchAnalyticsSlotView;
window.switchAppTab = switchAppTab;
window.exportTelemetryCsv = exportTelemetryCsv;
window.exportTelemetryJson = exportTelemetryJson;
window.nc3000HwSettings = nc3000HwSettings;
window.buildNc3000SystemSettingFrame = buildNc3000SystemSettingFrame;
window.buildNc3000QuerySystemSettingFrame = buildNc3000QuerySystemSettingFrame;
window.buildNc3000ResetFrame = buildNc3000ResetFrame;
window.buildNc3000EditPasswordFrame = buildNc3000EditPasswordFrame;
window.parseNc3000SystemSettingResponse = parseNc3000SystemSettingResponse;
window.syncHwSettingsControlsUI = syncHwSettingsControlsUI;
window.readHwSettingsFromUI = readHwSettingsFromUI;
window.sendHwSettingsToCharger = sendHwSettingsToCharger;
window.queryHwSettingsFromCharger = queryHwSettingsFromCharger;
window.factoryResetHw = factoryResetHw;
window.changeHwPin = changeHwPin;
