# SkyRC NC3000 Pro: Web Bluetooth Controller and Telemetry Workbench

[![Deploy to Firebase Hosting](https://img.shields.io/badge/Deploy-Firebase%20Hosting-blue.svg)](https://nc3000pro-ui.web.app)
[![Web Bluetooth API](https://img.shields.io/badge/Bluetooth-Web%20BLE%20API-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
[![Release](https://img.shields.io/badge/Release-v1.2.17%20Build%2041-brightgreen.svg)](https://nc3000pro-ui.web.app)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-success.svg)](tests/)

A web interface for the SkyRC NC3000 Pro (SK-100209) AA/AAA charger. It controls charging, discharging, and battery matching for Mini 4WD cars over Web Bluetooth, with live charts and full access to the charger's native operating modes.

Live web app: [https://nc3000pro-ui.web.app](https://nc3000pro-ui.web.app)

---

## Table of contents
1. [Features](#features)
2. [Operating modes](#operating-modes)
   - [Race Ready mode (target-voltage balancer)](#race-ready-mode-target-voltage-balancer)
   - [Mode 0: Charge](#mode-0-charge)
   - [Mode 1: Discharge](#mode-1-discharge)
   - [Mode 2: Break-in](#mode-2-break-in)
   - [Mode 3: Cycle and refresh](#mode-3-cycle-and-refresh)
   - [Mode 4: Storage mode](#mode-4-storage-mode)
   - [Mode 5: Turbo charge](#mode-5-turbo-charge)
3. [Telemetry and charts](#telemetry-and-charts)
4. [Hardware system settings](#hardware-system-settings)
5. [BLE protocol (0x94 frame format)](#ble-protocol-0x94-frame-format)
6. [Development and testing](#development-and-testing)

---

## Features

- Runs in Chromium browsers (Chrome, Edge, Opera) on desktop and Android through the Web Bluetooth API, and in WebBLE or Bluefy on iOS. No app store installation required.
- Tracks two battery pairs in series (Pair 1: slots 1 and 2; Pair 2: slots 3 and 4) with voltage bars and balance deltas.
- Race Ready balancer pulses cells at 200 mA to reach a target pack voltage, then checks open-circuit voltage after a rest period.
- Supports all native firmware modes: Charge, Discharge, Cycle, Break-in, Storage, and Turbo (up to 3.0A), using the parameter ranges from the charger firmware.
- Plots real-time voltage, current, internal resistance, and capacity for each bay, with single-slot and four-slot comparison views.
- Configures hardware settings directly: beeper volume, LCD backlight duration, sleep timeout, and Bluetooth PIN.
- Setting temperature cutoff to 71°C disables thermal cutoff in firmware, preventing false stops on older units with drifting thermistors.
- Setting the safety timer to 0 disables the timer limit for prolonged cycling or capacity testing.

---

## Operating modes

The controller uses two paths:
1. Closed-loop software control: used by Race Ready mode to balance individual cells to a target pack voltage.
2. Direct firmware commands: used by Modes 0 through 5 to package parameters into native `0x94` protocol frames sent directly to the charger microcontroller.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WORKING MODE SELECTOR                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────────────┐         ┌──────────────────────────────┐
│       RACE READY MODE         │         │   NATIVE HARDWARE MODES      │
│  (Custom Target Balancer)     │         │  (Modes 0, 1, 2, 3, 4, 5)    │
├───────────────────────────────┤         ├──────────────────────────────┤
│ • Evaluates Open-Circuit OCV  │         │ • Encodes Native 0x94 Packet │
│ • Micro-Steps Charge/Discharge│         │ • Dispatches directly to MCU │
│ • 200mA Fine Pulse Finishing  │         │ • Firmware manages algorithm │
│ • Multi-Pass Settling Check   │         │ • Web UI monitors telemetry  │
│ • Solid Green LED Sync Latch  │         │ • Displays Live Status & Cap │
└───────────────────────────────┘         └──────────────────────────────┘
```

### Race Ready mode (target-voltage balancer)
- Target voltage: 1.800V to 3.500V combined pair (0.900V to 1.750V per cell).
- Deadband: Default +/- 5 mV per cell (+/- 10 mV total pack).
- Finishing current: 200 mA step-down current.
- Settling duration: 15 seconds open-circuit rest to measure electrochemical resting voltage rather than surface charge.
- Completion signal: After reaching target and passing the settling check, the app sends a brief top-off packet (1750 mV, 0 mA trickle) so the charger turns its slot LED solid green and shows DONE on the LCD.

### Mode 0: Charge
- Current: 200 mA to 3000 mA (50 mA steps).
- Cutoff voltage: 1200 mV to 1650 mV (default 1650 mV).
- Peak cutoff (-Delta V): 0 to 20 mV (default 5 mV; 0 disables peak detection).
- Trickle current: 0 to 100 mA (default 30 mA).
- Safety limits: Capacity limit from 100 to 50,000 mAh; timer from 0 to 1440 minutes (0 disables the timer).

### Mode 1: Discharge
- Discharge current: 100 mA to 2000 mA.
- Cutoff voltage: 850 mV to 1400 mV (default 1000 mV / 1.00V).
- Stop current: 0 to 2500 mA cutoff threshold (50 mA steps).
- Safety timer: 0 to 1440 minutes (0 disables the timer).

### Mode 2: Break-in
- Capacity: 100 mAh to 50,000 mAh (default 1000 mAh).
- Charge rate: Scaled to 0.1C for 16 hours (IEC 61951-2 standard).
- Discharge rate: Scaled to 0.2C down to a 1.00V cutoff.

### Mode 3: Cycle and refresh
- Cycle sequence: D->C, C->D, D->C->D, or C->D->C.
- Cycle count: 1 to 99 repeats.
- Current rates: 200 to 3000 mA charge, 100 to 2500 mA discharge.
- Safety timer: 0 to 1440 minutes (0 disables the timer; default 180 minutes).

### Mode 4: Storage mode
- Target voltage: 1100 mV to 1350 mV (default 1200 mV). Charges or discharges cells until they reach the storage target.

### Mode 5: Turbo charge
- Presets: 1500 mA, 1800 mA, 2000 mA, 2500 mA, and 3000 mA.

---

## Telemetry and charts

The Analytics tab provides real-time data for each slot and four-slot comparison curves:
- Voltage overlay: Compares voltage curves across all four slots (0.80V to 1.70V).
- Current overlay: Compares active current across slots (0 to 2500 mA).
- Internal resistance (IR) overlay: Shows contact resistance and cell degradation (0 to 100 mOhm).
- Capacity overlay: Tracks delivered mAh across slots.
- Data export: Saves single-slot or four-slot records as timestamped CSV or JSON files.

---

## Hardware system settings

The configuration drawer provides controls for charger firmware registers:
- Beeper volume: Off, Low, Medium, High.
- LCD backlight timeout: 30s, 1m, 2m, 5m, or Always On.
- Sleep timeout: 1m, 2m, 5m, 10m, or Disabled.
- Bluetooth PIN: Updates charger pairing PIN via frame `0x56`.
- Factory reset: Resets system registers via frame `0x97`.

---

## BLE protocol (0x94 frame format)

Working mode parameters are sent in a 44-byte frame (`0x0F 0x2A 0x94 ...`):

| Byte range | Field name | Type | Description |
| :--- | :--- | :--- | :--- |
| `payload[0..1]` | `Header` | `uint16_be` | Frame prefix: `0x0F 0x2A` (42-byte payload) |
| `payload[2]` | `Command` | `uint8` | `0x94` (`SET_WORKING_MODE_COMMAND`) |
| `payload[3]` | `Slot Mask` | `uint8` | Bitmask: `0x00` (All 4 Bays), `0x01` (Bay 1), `0x02` (Bay 2), `0x04` (Bay 3), `0x08` (Bay 4) |
| `datas[0]` | `Position` | `uint8` | Active slot target |
| `datas[1]` | `Model` | `uint8` | Working mode: `0`=Charge, `1`=Discharge, `2`=Break-in, `3`=Cycle, `4`=Storage, `5`=Turbo |
| `datas[2..3]` | `chargeE` | `uint16_be` | Charge rate in mA (Big-Endian) |
| `datas[4..5]` | `dischargeE` | `uint16_be` | Discharge rate in mA (Big-Endian) |
| `datas[6..7]` | `capacity` | `uint16_be` | Capacity ceiling in mAh (100 to 50,000 mAh) |
| `datas[8..9]` | `inStopVoltage` | `uint16_be` | Charge cutoff voltage in mV |
| `datas[10..11]` | `outStopVoltage` | `uint16_be` | Discharge cutoff voltage in mV |
| `datas[12..13]` | `inStopCurrent` | `uint16_be` | Charge stop current in mA |
| `datas[14..15]` | `outStopCurrent` | `uint16_be` | Discharge stop current in mA (0 to 2500 mA) |
| `datas[16..17]` | `chargeRestTime` | `uint16_be` | Rest duration after charge (minutes) |
| `datas[18..19]` | `dischargeRestTime` | `uint16_be` | Rest duration after discharge (minutes) |
| `datas[20]` | `cycleCount` | `uint8` | Repeat cycles (1 to 99) |
| `datas[21]` | `cycleMode` | `uint8` | Sequence index (`0`=D>C, `1`=C>D, `2`=D>C>D, `3`=C>D>C) |
| `datas[22]` | `detalV` | `uint8` | Negative Delta-V in mV (0 = Off) |
| `datas[23]` | `track` | `uint8` | Trickle maintenance current divided by 10 (`trickleMa / 10`) |
| `datas[24..25]` | `restartVolt` | `uint16_be` | Holding restart threshold in mV |
| `datas[26]` | `tempProtect` | `uint8` | Temperature cutoff in °C (71 = OFF / NTC Bypass) |
| `datas[27..28]` | `inTimeProtect` | `uint16_be` | Safety timer in minutes (0 = OFF, 10 to 1440 min) |
| `datas[29..30]` | `inMaxbostCapacity` | `uint16_be` | MaxBoost capacity limit in mAh |
| `datas[31]` | `truboMode` | `uint8` | Turbo flag (`2` = Active Turbo 3.0A) |
| `datas[32..39]` | `reserved` | `bytes` | Protocol alignment padding |
| `payload[43]` | `Checksum` | `uint8` | Additive 8-bit checksum ($\sum \text{bytes} \pmod{256}$) |

---

## Development and testing

### Prerequisites
- Node.js (v18+)
- Python (v3.10+) with Playwright: `pip install playwright && playwright install chromium`

### Running locally
```bash
# Clone the repository
git clone https://github.com/dad-codes/nc3000-pro.git
cd nc3000-pro

# Start the local development server
npm start
# Opens at http://localhost:8080
```

### Running tests
Run the integration test suite:
```bash
npm test
# or
python tests/run_all_tests.py
```

### Deploying to Firebase Hosting
```bash
npm run deploy
```

---

## License

MIT License. Maintained by [dad-codes.com](https://dad-codes.com).
