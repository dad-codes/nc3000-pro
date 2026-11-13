# SkyRC NC3000 Octa (SK-100228) Integration Architecture & Roadmap

This document outlines the engineering specification, protocol architecture, and phase-by-phase implementation plan to integrate full support for the **SkyRC NC3000 Octa (SK-100228)** into the **NC3000 Pro Workbench** web application.

---

## 1. Executive Summary & Goals

### 1.1 Objective
Deliver a unified, zero-configuration Web Bluetooth workbench that automatically identifies and supports both:
1. **SkyRC NC3000 Pro (SK-100209)** — 4 slots, 2 battery pairs.
2. **SkyRC NC3000 Octa (SK-100228)** — 8 slots, up to 4 battery pairs, 2.5A continuous discharge across all bays, and Mode 6 (3-Stage Racing Charge).

### 1.2 Key Deliverables
- **Unified BLE Protocol Adapter**: Auto-detects connected hardware using non-intrusive probe frames (`0x9A` vs `0x91`).
- **Dynamic 4-Slot / 8-Slot Layout**: Expands from 2 series pairs to 4 series pairs for Mini 4WD racers.
- **Motor Power Draw Simulation Benchmark (`#dyno`)**: Reverse engineered from [peaktest.app](https://peaktest.app/#test), providing a 2.5A high-current loaded-voltage battery tester.
- **Mode 6 (3-Stage Charging) Drawer**: Full support for segmented discharge &rarr; 80% bulk charge &rarr; high-current thermal warmup for pre-race battery preparation.

---

## 2. Protocol Specification & Differences

Both devices utilize Nordic/TI BLE UART transparent bridges on Service `0xFFE0` / Characteristic `0xFFE1`, but have distinct telemetry framing and addressing schemes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WEB BLUETOOTH GATT LINK                         │
│                    Service: 0xFFE0 | Char: 0xFFE1                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │   NC3000 PRO (4-BAY)   │      │   NC3000 OCTA (8-BAY)  │
       ├────────────────────────┤      ├────────────────────────┤
       │ • Telemetry: 0x91      │      │ • Telemetry: 0x9A      │
       │ • 22B per-slot packet  │      │ • 142B multi-slot frame│
       │ • Polled round-robin   │      │ • Polled once / 1000ms │
       │ • Mask: (1 << ch)      │      │ • Index: (ch + 1)      │
       │ • Max Disch: 2.0A      │      │ • Max Disch: 2.5A      │
       │ • Modes: 0 to 5        │      │ • Modes: 0 to 6 (3-Stg)│
       └────────────────────────┘      └────────────────────────┘
```

### 2.1 Protocol Framing Comparison

| Protocol Attribute | NC3000 Pro (SK-100209) | NC3000 Octa (SK-100228) |
| :--- | :--- | :--- |
| **Telemetry Request** | `[0x0F, 0x03, 0x91, (1<<ch), chk]` | `[0x0F, 0x03, 0x9A, 0x00, 0x9A]` |
| **Response Opcode & Length** | Opcode `0x91`, 22 bytes total | Opcode `0x9A`, 142 bytes total |
| **Payload Structure** | Single 17-byte slot block | Header + `deviceMode` + 8 &times; 17-byte slot blocks |
| **Polling Cadence** | 250 ms per slot (1.0s full cycle) | 1000 ms single query |
| **Slot Argument in 0x94 / 0xFE** | Bitmask: `1, 2, 4, 8` | 1-indexed byte: `1, 2, 3, 4, 5, 6, 7, 8` |
| **Discharge Stop Frame (0xFE)** | `[0x0F, 0x03, 0xFE, (1<<ch), sum]` | `[0x0F, 0x03, 0xFE, (ch+1), sum]` |
| **Hardware Settings (0x96)** | Supported (frame `0x96`) | Supported (frame `0x96`) |
| **Device Info (0x57)** | Returns SKU `100209` | Returns SKU `100228` |

### 2.2 17-Byte Slot Block Format (Identical Across Both)
Offset inside single-slot frame (`+4`) or 8-slot frame (`5 + ch * 17`):
- `+0..1`: Active Current (uint16_be, mA)
- `+2..3`: Loaded Voltage (uint16_be, mV)
- `+4..5`: Delta-V Drop (uint16_be, mV)
- `+6..7`: Accumulated Capacity (uint16_be, mAh)
- `+8..11`: Duration (uint32_be, seconds)
- `+12..13`: Internal Resistance (uint16_be, m&Omega;)
- `+14`: Status (0=Idle/Empty, 1=Ready, 2=Charge, 3=Discharge, 4=Rest, 5/6=Done)
- `+15`: Mode (0=Charge, 1=Discharge, 2=Break-in, 3=Cycle, 4=MaxBoost/Storage, 5=Turbo, 6=3-Stage)
- `+16`: Error Code (0=None, 1..13)

---

## 3. Architecture & Code Changes

### 3.1 Protocol Abstraction Layer (`BleProtocolAdapter`)
Refactor BLE communications in `app.js` into an adapter pattern:
```javascript
class BleProtocolAdapter {
  constructor() {
    this.model = null; // 'pro' | 'octa'
    this.probeCount = 0;
  }

  get slotCount() {
    return this.model === 'octa' ? 8 : 4;
  }

  slotArg(ch) {
    return this.model === 'pro' ? (1 << ch) : (ch + 1);
  }

  nextStatusRequest(proSlotIdx) {
    if (this.model === 'octa') return [0x0F, 0x03, 0x9A, 0x00, 0x9A];
    if (this.model === 'pro') {
      const mask = 1 << proSlotIdx;
      return [0x0F, 0x03, 0x91, mask, (0x91 + mask) & 0xFF];
    }
    // Probing sequence: alternate 0x9A and 0x91 until device responds
    this.probeCount++;
    return (this.probeCount % 2 === 1)
      ? [0x0F, 0x03, 0x9A, 0x00, 0x9A]
      : [0x0F, 0x03, 0x91, 0x01, 0x92];
  }
}
```

### 3.2 Dynamic UI Layout Adaptation
- Add CSS class `.octa-8bay` to the root container when `model === 'octa'`.
- Default view displays 4 pairs (Pair 1: Bays 1-2, Pair 2: Bays 3-4, Pair 3: Bays 5-6, Pair 4: Bays 7-8).
- Color system: Register CSS variables `--s5` through `--s8` for distinct chart overlays.

### 3.3 Motor Power Draw Simulation (`#dyno`)
Port the reverse-engineered high-current dynamometer test from PeakTest:
- Constant 2.50 A discharge for a defined run duration (default 45s, configurable 10-180s).
- Pre-clear slot using `stopSlot(ch)` if slot was previously active or trickling.
- Send `0x94` frame with:
  - Discharge rate: `2500` mA
  - Cutoff voltage: `1000` mV
  - Safety capacity: `300` mAh
  - Safety timer: `10` minutes
  - Thermal cutoff: `71` &deg;C (bypass false alarms)
- Real-time logging:
  - Mean Loaded Voltage: $\bar{V} = \frac{1}{N}\sum V(t)$
  - Sag Drop: $V(10\text{s}) - V(\text{final})$
  - Current check: Alerts user if current is outside 2.30A–2.70A.
  - Multi-run history saved to `localStorage`.

---

## 4. Phase-by-Phase Implementation Roadmap

### Phase 1: Protocol Abstraction & Discovery (Days 1–2)
- [ ] Implement `BleProtocolAdapter` class in `app.js`.
- [ ] Add dual-probe initialization (`0x9A` & `0x91`).
- [ ] Add 142-byte frame reassembly buffer and checksum validation.
- [ ] Update `stopSlot` and `sendWorkingMode` to use dynamic `slotArg(ch)`.

### Phase 2: Telemetry & Multi-Bay UI Expansion (Days 3–4)
- [ ] Expand telemetry state array from 4 to 8 elements.
- [ ] Define colors for slots 5 through 8 (`--s5`: teal, `--s6`: pink, `--s7`: orange, `--s8`: lime).
- [ ] Implement responsive 4-pair layout for Mini 4WD car batteries.
- [ ] Update Chart.js multi-slot overlay view to support up to 8 active curves.

### Phase 3: Motor Dyno / Power Draw Simulation Tab (Days 5–6)
- [ ] Create dedicated "Motor Dyno" tab in `index.html`.
- [ ] Build slot selection picker and countdown timer.
- [ ] Implement 2.5A discharge state machine with 3.5s BLE timeout protection.
- [ ] Build leaderboard ranking table (Mean Loaded V, Sag Drop, Delta vs Run Average).
- [ ] Add CSV export for motor dyno test runs.

### Phase 4: Mode 6 (3-Stage Racing Charge) Support (Day 7)
- [ ] Add Mode 6 to drawer working mode dropdown.
- [ ] Expose 3-stage parameters: Stage 1 discharge cutoff, Stage 2 bulk capacity percentage, Stage 3 boost current.
- [ ] Verify safety parameter limits against official manual specifications.

### Phase 5: Verification & End-to-End Testing (Day 8)
- [ ] Mock BLE tests validating frame generation for both Pro and Octa targets.
- [ ] Playwright browser automation tests for 8-bay layout responsiveness.
- [ ] Firmware query regression tests against `http://upgrade.skyrc.com`.
