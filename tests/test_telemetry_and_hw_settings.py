import time
from playwright.sync_api import sync_playwright

def test_telemetry_and_hw_settings():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080")
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        print("--- TEST 1: Chart.js & Tab Navigation Check ---")
        chart_loaded = page.evaluate("typeof Chart !== 'undefined'")
        print("Chart.js loaded:", chart_loaded)
        assert chart_loaded, "Chart.js must be loaded and available globally"

        active_tab = page.evaluate("""() => {
            const activeBtn = document.querySelector('.tab-nav-btn.active');
            return activeBtn ? activeBtn.getAttribute('data-tab') : null;
        }""")
        print("Default active tab:", active_tab)
        assert active_tab == "dashboard", "Default active tab should be 'dashboard'"

        dash_visible = page.evaluate("document.getElementById('keeperBody').style.display !== 'none'")
        analytics_hidden = page.evaluate("document.getElementById('analyticsTabView').classList.contains('hidden')")
        print("Dashboard visible:", dash_visible, "| Analytics tab hidden:", analytics_hidden)
        assert dash_visible and analytics_hidden, "Dashboard must be visible and analytics tab hidden by default"

        # Switch to Analytics tab
        page.click("#tabBtnAnalytics")
        time.sleep(0.5)
        analytics_visible = page.evaluate("!document.getElementById('analyticsTabView').classList.contains('hidden')")
        dash_hidden = page.evaluate("document.getElementById('keeperBody').style.display === 'none'")
        print("After click Analytics -> Analytics visible:", analytics_visible, "| Dashboard hidden:", dash_hidden)
        assert analytics_visible and dash_hidden, "Analytics view must be visible and dashboard hidden"

        # Switch back to Dashboard tab
        page.click("#tabBtnDashboard")
        time.sleep(0.5)
        dash_restored = page.evaluate("document.getElementById('keeperBody').style.display !== 'none'")
        print("After click Dashboard -> Dashboard restored:", dash_restored)
        assert dash_restored, "Dashboard must be restored"

        # Switch to Analytics tab for analytics interactions
        page.click("#tabBtnAnalytics")
        time.sleep(0.5)

        print("\n--- TEST 2: Per-Slot View Default & Pill Switching ---")
        default_slot_view = page.evaluate("window.telemetryHistory.selectedSlotView")
        heading_text = page.evaluate("document.getElementById('chartHeadingTitle').textContent")
        kpi_slot_badge = page.evaluate("document.getElementById('kpiSlotBadge').textContent")
        print(f"Default slot view: {default_slot_view} | Heading: '{heading_text}' | Badge: '{kpi_slot_badge}'")
        assert default_slot_view == 0, "Default slot view must be Slot 1 (index 0)"
        assert "Slot 1" in heading_text, "Heading should mention Slot 1"
        assert kpi_slot_badge == "SLOT 1", "Badge should show SLOT 1"

        # Switch to Slot 3
        page.click("#btnAnalyticsSlot2")
        slot_3_view = page.evaluate("window.telemetryHistory.selectedSlotView")
        heading_slot_3 = page.evaluate("document.getElementById('chartHeadingTitle').textContent")
        kpi_slot_3_badge = page.evaluate("document.getElementById('kpiSlotBadge').textContent")
        print(f"Switched to Slot 3 -> view: {slot_3_view} | Heading: '{heading_slot_3}' | Badge: '{kpi_slot_3_badge}'")
        assert slot_3_view == 2, "Selected slot view should now be 2"
        assert "Slot 3" in heading_slot_3, "Heading should mention Slot 3"
        assert kpi_slot_3_badge == "SLOT 3", "Badge should show SLOT 3"

        # Switch to All-4-Slots Overlay
        page.click("#btnAnalyticsSlotAll")
        overlay_view = page.evaluate("window.telemetryHistory.selectedSlotView")
        heading_overlay = page.evaluate("document.getElementById('chartHeadingTitle').textContent")
        print(f"Switched to All Slots Overlay -> view: {overlay_view} | Heading: '{heading_overlay}'")
        assert overlay_view == -1, "Selected slot view should be -1 for overlay"
        assert "All 4 Slots" in heading_overlay, "Heading should mention All 4 Slots Overlay"

        # Reset back to Slot 1
        page.click("#btnAnalyticsSlot0")

        print("\n--- TEST 3: Telemetry Ingestion, Max Capacity & Battery Insertion Reset ---")
        # Ingest 3 telemetry frames on Slot 1 (mask=0x01)
        # Helper to construct 0x91 telemetry packet:
        # [0x0F, len=0x15, 0x91, mask=0x01, cur_hi, cur_lo, v_hi, v_lo, -dv_hi, -dv_lo, cap_hi, cap_lo, dur[4], ir_hi, ir_lo, status, mode, err, cs]
        def make_telemetry_frame(slot_idx, voltage_mv, current_ma, cap_mah, ir_mohm, duration_sec=10):
            mask = 1 << slot_idx
            payload = [
                0x0F, 0x15, 0x91, mask,
                (current_ma >> 8) & 0xff, current_ma & 0xff,
                (voltage_mv >> 8) & 0xff, voltage_mv & 0xff,
                0x00, 0x05, # deltaV = 5mV
                (cap_mah >> 8) & 0xff, cap_mah & 0xff,
                (duration_sec >> 24) & 0xff, (duration_sec >> 16) & 0xff, (duration_sec >> 8) & 0xff, duration_sec & 0xff,
                (ir_mohm >> 8) & 0xff, ir_mohm & 0xff,
                0x02, # chargerStatu = charging
                0x00, # mode = charge
                0x00  # errorState = 0
            ]
            cs = sum(payload) & 0xff
            payload.append(cs)
            return payload

        # Frame 1: Slot 1 cell inserted at 1420mV, 800mA, 50mAh, 18mOhm
        f1 = make_telemetry_frame(0, 1420, 800, 50, 18, 120)
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({f1}))")

        # Frame 2: Slot 1 cell at 1435mV, 800mA, 150mAh, 19mOhm
        f2 = make_telemetry_frame(0, 1435, 800, 150, 19, 180)
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({f2}))")

        # Ingest 1 frame on Slot 2 (mask=0x02) at 1410mV, 500mA, 85mAh, 22mOhm
        f_s2 = make_telemetry_frame(1, 1410, 500, 85, 22, 90)
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({f_s2}))")

        s1_pts = page.evaluate("window.telemetryHistory.slots[0].length")
        s2_pts = page.evaluate("window.telemetryHistory.slots[1].length")
        s1_max_cap = page.evaluate("window.telemetryHistory.maxCapacity[0]")
        s2_max_cap = page.evaluate("window.telemetryHistory.maxCapacity[1]")
        kpi_max_cap_text = page.evaluate("document.getElementById('kpiMaxCapacity').textContent")
        kpi_live_volt_text = page.evaluate("document.getElementById('kpiLiveVoltage').textContent")
        kpi_live_ir_text = page.evaluate("document.getElementById('kpiLiveIr').textContent")
        print(f"Slot 1 points: {s1_pts}, Max Cap: {s1_max_cap}mAh (KPI text: '{kpi_max_cap_text}')")
        print(f"Slot 2 points: {s2_pts}, Max Cap: {s2_max_cap}mAh")
        print(f"Slot 1 Live Voltage: '{kpi_live_volt_text}', Live IR: '{kpi_live_ir_text}'")

        assert s1_pts >= 1, "Slot 1 should have recorded samples"
        assert s1_max_cap == 150, "Slot 1 max capacity should be 150 mAh"
        assert s2_max_cap == 85, "Slot 2 max capacity should be 85 mAh"
        assert kpi_max_cap_text == "150", "KPI Max Capacity card should display 150"
        assert kpi_live_volt_text == "1.435", "KPI Live Voltage should display 1.435V"
        assert kpi_live_ir_text == "19", "KPI Live IR should display 19mΩ"

        # Now simulate battery removal from Slot 1 (voltage = 0mV -> hasBattery = false)
        f_empty = make_telemetry_frame(0, 0, 0, 0, 0, 0)
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({f_empty}))")
        has_cell_after_pull = page.evaluate("window.telemetryHistory.lastHasBattery[0]")
        print("After battery pulled from Slot 1 -> hasBattery:", has_cell_after_pull)
        assert has_cell_after_pull is False, "Slot 1 battery presence should be false after removal"

        # Now simulate a NEW battery inserted into Slot 1 (voltage = 1460mV -> hasBattery = true)
        # Requirement: "when a new battery is inserted reset the chart data for that slot"
        f_new = make_telemetry_frame(0, 1460, 1000, 10, 15, 5)
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({f_new}))")

        s1_pts_after_new = page.evaluate("window.telemetryHistory.slots[0].length")
        s1_max_cap_after_new = page.evaluate("window.telemetryHistory.maxCapacity[0]")
        s2_pts_untouched = page.evaluate("window.telemetryHistory.slots[1].length")
        s2_max_cap_untouched = page.evaluate("window.telemetryHistory.maxCapacity[1]")
        print(f"After NEW cell inserted in Slot 1 -> Slot 1 pts: {s1_pts_after_new}, Max Cap: {s1_max_cap_after_new}mAh")
        print(f"Slot 2 untouched check -> Slot 2 pts: {s2_pts_untouched}, Max Cap: {s2_max_cap_untouched}mAh")

        assert s1_pts_after_new == 1, "Slot 1 should have been reset and now contains only the new sample (1 pt)"
        assert s1_max_cap_after_new == 10, "Slot 1 max capacity should be reset to new sample value (10 mAh)"
        assert s2_pts_untouched >= 1, "Slot 2 telemetry points must remain intact"
        assert s2_max_cap_untouched == 85, "Slot 2 max capacity must remain 85 mAh"

        print("\n--- TEST 4: CSV & JSON Telemetry Export Data Generation ---")
        csv_slot1 = page.evaluate("""() => {
            let rows = [];
            rows.push(["Timestamp_ISO", "Elapsed_Sec", "Slot", "Voltage_V", "Current_mA", "Capacity_mAh", "DeltaV_mV", "IR_mOhm", "Status", "Mode"].join(","));
            window.telemetryHistory.slots[0].forEach(item => {
                rows.push([new Date(item.t).toISOString(), item.elapsedSec, 1, item.v, item.i, item.mah, item.deltaV, item.ir, `"${item.status||''}"`, `"${item.mode||''}"`].join(","));
            });
            return rows.join("\\r\\n");
        }""")
        print("Generated Slot 1 CSV lines:", len(csv_slot1.splitlines()))
        assert "Timestamp_ISO" in csv_slot1 and "1.46" in csv_slot1, "CSV should contain headers and slot sample data"

        json_export = page.evaluate("""() => {
            return JSON.stringify({
                version: 'v1.2.13',
                maxCapacityMah: window.telemetryHistory.maxCapacity,
                slots: window.telemetryHistory.slots
            });
        }""")
        print("Generated JSON length:", len(json_export))
        assert '"maxCapacityMah"' in json_export and '"slots"' in json_export, "Export JSON must contain valid session schema"

        print("\n--- TEST 5: NC3000 Hardware System Settings Frames & DALVIK Opcodes ---")
        # 1. Query Hardware Settings frame (0x96)
        query_frame = page.evaluate("Array.from(window.buildNc3000QuerySystemSettingFrame())")
        print("Query frame (0x96):", [f"0x{b:02X}" for b in query_frame])
        assert query_frame == [0x0F, 0x03, 0x96, 0x04, 0x9A], "Query frame must exactly equal 0F 03 96 04 9A"

        # 2. Reset frame (0x97)
        reset_frame = page.evaluate("Array.from(window.buildNc3000ResetFrame())")
        print("Reset frame (0x97):", [f"0x{b:02X}" for b in reset_frame])
        assert reset_frame == [0x0F, 0x03, 0x97, 0x04, 0x9B], "Reset frame must exactly equal 0F 03 97 04 9B"

        # 3. Edit Password frame (0x56)
        pin_frame = page.evaluate("Array.from(window.buildNc3000EditPasswordFrame('1234'))")
        print("PIN frame (0x56 for '1234'):", [f"0x{b:02X}" for b in pin_frame])
        assert pin_frame[0] == 0x0F and pin_frame[1] == 0x07 and pin_frame[2] == 0x56, "PIN frame header must match"
        assert pin_frame[3:8] == [0x00, 1, 2, 3, 4], "PIN frame payload must match [0x00, 1, 2, 3, 4]"

        # 4. Set Hardware Settings frame (0x95)
        hw_settings = {
            "systemBeep": 1,
            "notifyBeep": 3, # High volume
            "endNotifyBeep": 1, # Repeat
            "lcd": 2, # High
            "warning": 1,
            "sleepTime": 5, # 15 min
            "mode": 0
        }
        set_frame = page.evaluate(f"Array.from(window.buildNc3000SystemSettingFrame({hw_settings}))")
        print(f"Set settings frame (0x95, {len(set_frame)}B):", [f"0x{b:02X}" for b in set_frame])
        assert len(set_frame) == 21, "0x95 frame must be exactly 21 bytes"
        assert set_frame[0] == 0x0F and set_frame[1] == 0x13 and set_frame[2] == 0x95, "Header must be 0F 13 95"
        assert set_frame[4] == 1, "Payload byte 1 (systemBeep) should be 1"
        assert set_frame[5] == 3, "Payload byte 2 (notifyBeep volume) should be 3 (High)"
        assert set_frame[6] == 1, "Payload byte 3 (endNotifyBeep) should be 1"
        assert set_frame[7] == 2, "Payload byte 4 (lcd) should be 2"
        assert set_frame[8] == 1, "Payload byte 5 (warning) should be 1"
        assert set_frame[9] == 5, "Payload byte 6 (sleepTime) should be 5"
        assert set_frame[10] == 0, "Payload byte 7 (mode) should be 0"

        # 5. Test response parsing for 0x96
        # Incoming response: [0x0F, len=0x0B, 0x96, mask=0x00, beep=0, notify=1, end=0, lcd=1, warn=1, sleep=4, mode=0, cs]
        resp_payload = [0x0F, 0x0B, 0x96, 0x00, 0x00, 0x01, 0x00, 0x01, 0x01, 0x04, 0x00]
        resp_payload.append(sum(resp_payload) & 0xff)
        parsed_hw = page.evaluate(f"window.parseNc3000SystemSettingResponse(new Uint8Array({resp_payload}))")
        print("Parsed incoming 0x96 settings:", parsed_hw)
        assert parsed_hw["systemBeep"] == 0, "systemBeep parsed correctly"
        assert parsed_hw["notifyBeep"] == 1, "notifyBeep volume parsed correctly"
        assert parsed_hw["sleepTime"] == 4, "sleepTime parsed correctly"

        # 6. Test Audio Toggle button controls both web audio and physical NC3000 buzzer
        audio_btn_text = page.evaluate("document.getElementById('btnToggleAudio').textContent")
        print(f"Initial audio button text: '{audio_btn_text}'")
        assert "Sound: ON" in audio_btn_text

        # Click audio button to toggle OFF
        page.evaluate("document.getElementById('btnToggleAudio').click()")
        audio_btn_text_off = page.evaluate("document.getElementById('btnToggleAudio').textContent")
        hw_beep_off = page.evaluate("window.nc3000HwSettings.systemBeep")
        hw_notify_off = page.evaluate("window.nc3000HwSettings.notifyBeep")
        print(f"After audio toggle OFF -> hwBeep: {hw_beep_off}, hwNotifyVol: {hw_notify_off}, btnText: '{audio_btn_text_off}'")
        assert "Sound: OFF" in audio_btn_text_off, "Button text should be Sound: OFF"
        assert hw_beep_off == 0, "NC3000 hardware keypress beep should be muted (0)"
        assert hw_notify_off == 0, "NC3000 hardware notify beep volume should be muted (0)"

        # Click audio button to toggle back ON
        page.evaluate("document.getElementById('btnToggleAudio').click()")
        audio_btn_text_on = page.evaluate("document.getElementById('btnToggleAudio').textContent")
        hw_beep_on = page.evaluate("window.nc3000HwSettings.systemBeep")
        hw_notify_on = page.evaluate("window.nc3000HwSettings.notifyBeep")
        print(f"After audio toggle ON -> hwBeep: {hw_beep_on}, hwNotifyVol: {hw_notify_on}, btnText: '{audio_btn_text_on}'")
        assert "Sound: ON" in audio_btn_text_on, "Button text should be Sound: ON"
        assert hw_beep_on == 1, "NC3000 hardware keypress beep should be enabled (1)"
        assert hw_notify_on > 0, "NC3000 hardware notify beep volume should be unmuted (>0)"

        print("\n--- TEST 6: Hardware Mode Detection, Ready/Resting States & BLE Split Reassembly ---")
        # 1. Test 20-byte packet with Cycle Mode running (simulating MTU-limited BLE transmission)
        page.evaluate("""() => {
            window.switchWorkingMode('RACE_READY', false);
            window.keeperState.active = false;
            window.keeperState.pairs[0].active = false;
            // Build 20-byte packet with mode 3 (Cycle)
            const b = new Uint8Array([
                0x0f, 0x13, 0x91, 0x01,
                0x03, 0xe8, // current = 1000mA
                0x05, 0x8c, // volt = 1420mV
                0x00, 0x05, // deltaV = 5mV
                0x01, 0x2c, // cap = 300mAh
                0x00, 0x00, 0x00, 0x78, // dur = 120s
                0x00, 0x16, // IR = 22mOhm
                0x02,       // chargerStatu = 2 (Charging)
                0x03        // mode = 3 (Cycle)
            ]);
            window.parseAndApplyNc3000SlotTelemetry(b);
        }""")
        mode_val = page.evaluate("document.getElementById('keeperWorkingMode').value")
        pill_text = page.evaluate("document.getElementById('headerModePill').textContent")
        p0_active = page.evaluate("window.keeperState.pairs[0].active")
        delta_label = page.evaluate("document.getElementById('slotDelta-0').textContent")
        print(f"20-Byte Packet Cycle Detection -> mode: {mode_val}, pill: '{pill_text}', p0Active: {p0_active}, slotLabel: '{delta_label}'")
        assert mode_val == "CYCLE", "Mode should be CYCLE even with 20-byte packet"
        assert "MODE 3: CYCLE" in pill_text, "Pill text should show MODE 3: CYCLE"
        assert p0_active is True, "Pair 0 should be active for running cycle"
        assert "Cycle" in delta_label, "Slot delta label should display Cycle"

        # 2. Test Ready state (chargerStatu = 1, current = 0mA) with Break-in mode
        page.evaluate("""() => {
            window.switchWorkingMode('RACE_READY', false);
            window.keeperState.active = false;
            window.keeperState.pairs[0].active = false;
            const b = new Uint8Array([
                0x0f, 0x13, 0x91, 0x01,
                0x00, 0x00, // current = 0mA
                0x05, 0x82, // volt = 1410mV
                0x00, 0x05, // deltaV = 5mV
                0x00, 0x00, // cap = 0mAh
                0x00, 0x00, 0x00, 0x00, // dur = 0s
                0x00, 0x18, // IR = 24mOhm
                0x01,       // chargerStatu = 1 (Ready)
                0x02,       // mode = 2 (Break-in)
                0x00, 0xff
            ]);
            window.parseAndApplyNc3000SlotTelemetry(b);
        }""")
        ready_mode = page.evaluate("document.getElementById('keeperWorkingMode').value")
        ready_phase = page.evaluate("window.keeperState.slots[0].phase")
        print(f"Ready State Break-in Detection -> mode: {ready_mode}, phase: '{ready_phase}'")
        assert ready_mode == "BREAKIN", "Ready state with mode 2 must switch mode to BREAKIN"
        assert ready_phase == "READY", "Slot phase should be READY"

        # 3. Test BLE split chunk notification reassembly
        page.evaluate("""() => {
            window.switchWorkingMode('RACE_READY', false);
            window.keeperState.active = false;
            window.keeperState.pairs[0].active = false;
            const full22 = new Uint8Array([
                0x0f, 0x13, 0x91, 0x01,
                0x0b, 0xb8, // 3000mA
                0x05, 0x82, // 1410mV
                0x00, 0x05,
                0x01, 0xf4, // 500mAh
                0x00, 0x00, 0x01, 0x2c, // 300s
                0x00, 0x14, // 20mOhm
                0x02,       // 2 (Charging)
                0x05,       // 5 (Turbo)
                0x00,       // err 0
                0xaa        // checksum
            ]);
            const chunk1 = full22.slice(0, 20);
            const chunk2 = full22.slice(20, 22);
            window.onNotification('0000ffe1-0000-1000-8000-00805f9b34fb', new DataView(chunk1.buffer, chunk1.byteOffset, chunk1.byteLength));
            window.onNotification('0000ffe1-0000-1000-8000-00805f9b34fb', new DataView(chunk2.buffer, chunk2.byteOffset, chunk2.byteLength));
        }""")
        split_mode = page.evaluate("document.getElementById('keeperWorkingMode').value")
        split_p0 = page.evaluate("window.keeperState.pairs[0].active")
        print(f"Split BLE Chunk Reassembly -> mode: {split_mode}, p0Active: {split_p0}")
        assert split_mode == "TURBO", "Reassembled split frame must detect TURBO mode"
        assert split_p0 is True, "Pair 0 must be active after reassembled turbo frame"

        # Clean state
        page.evaluate("() => { window.switchWorkingMode('RACE_READY', false); window.keeperState.active = false; window.keeperState.pairs[0].active = false; }")

        print("\n--- TEST 7: Bluefy iOS BLE UUID Normalization & Progressive Fallback ---")
        bluefy_res = page.evaluate("""async () => {
            const optionalServices = window.buildOptionalServices();
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
            const allValidStrings = Array.isArray(optionalServices)
                && optionalServices.length > 0
                && optionalServices.every((u) => typeof u === 'string' && uuidRegex.test(u));

            const normCheck = {
                fromNum: window.normalizeBleUuid(0xffe0),
                fromAlias: window.normalizeBleUuid('generic_access'),
                fromShortHex: window.normalizeBleUuid('FFE1')
            };

            const requestCalls = [];
            const writes = [];
            const mockChar = {
                uuid: 'FFE1',
                properties: {},
                startNotifications: async () => {},
                addEventListener: () => {},
                writeValue: async (buf) => { writes.push(Array.from(new Uint8Array(buf.buffer || buf))); }
            };
            const mockService = {
                uuid: 'FFE0',
                isPrimary: true,
                getCharacteristics: async () => [],
                getCharacteristic: async (u) => {
                    if (u === '0000ffe1-0000-1000-8000-00805f9b34fb') return mockChar;
                    throw new Error('Characteristic not found');
                }
            };
            const mockServer = {
                connected: true,
                getPrimaryServices: async () => {
                    throw new Error('Request payload could not be parsed');
                },
                getPrimaryService: async (u) => {
                    if (u === '0000ffe0-0000-1000-8000-00805f9b34fb') return mockService;
                    throw new Error('Service not found');
                },
                disconnect: () => { mockServer.connected = false; }
            };
            const mockDevice = {
                name: 'NC3000 Pro Mock',
                id: 'ios-bluefy-mock-1',
                gatt: {
                    connected: false,
                    connect: async () => { mockDevice.gatt.connected = true; return mockServer; },
                    disconnect: () => { mockDevice.gatt.connected = false; mockServer.connected = false; }
                },
                addEventListener: () => {}
            };

            const origBluetoothDescriptor = Object.getOwnPropertyDescriptor(navigator, 'bluetooth');
            Object.defineProperty(navigator, 'bluetooth', {
                configurable: true,
                value: {
                    requestDevice: async (opts) => {
                        requestCalls.push(opts);
                        if (requestCalls.length === 1) {
                            throw new Error('Request payload could not be parsed');
                        }
                        return mockDevice;
                    }
                }
            });

            await window.connectBle();
            const statusAfterConnect = document.getElementById('keeperStatusText').textContent;
            const bleConnectedClass = document.body.classList.contains('ble-connected');
            const infoName = document.getElementById('infoName').textContent;
            const txSelected = document.getElementById('txCharSelect').value;

            // Verify user cancellation stops immediately without retrying fallbacks
            let cancelCallCount = 0;
            Object.defineProperty(navigator, 'bluetooth', {
                configurable: true,
                value: {
                    requestDevice: async () => {
                        cancelCallCount++;
                        const e = new Error('User cancelled the requestDevice() chooser.');
                        e.name = 'NotFoundError';
                        throw e;
                    }
                }
            });
            await window.connectBle();

            if (origBluetoothDescriptor) {
                Object.defineProperty(navigator, 'bluetooth', origBluetoothDescriptor);
            }

            return {
                allValidStrings,
                optionalCount: optionalServices.length,
                hasNoAliases: !optionalServices.includes('generic_access') && !optionalServices.includes('battery_service'),
                hasSkyrcUuid: optionalServices.includes('0000ffe0-0000-1000-8000-00805f9b34fb'),
                normCheck,
                requestCallsCount: requestCalls.length,
                secondCallOptions: requestCalls[1],
                statusAfterConnect,
                bleConnectedClass,
                infoName,
                txSelected,
                cancelCallCount
            };
        }""")
        print("Bluefy iOS BLE fallback test result:", bluefy_res)
        assert bluefy_res["allValidStrings"] is True, "buildOptionalServices() must return only 36-char lowercase UUID strings"
        assert bluefy_res["hasNoAliases"] is True, "buildOptionalServices() must not contain raw GATT alias strings"
        assert bluefy_res["hasSkyrcUuid"] is True, "buildOptionalServices() must include canonical 0xFFE0 UUID"
        assert bluefy_res["normCheck"]["fromNum"] == "0000ffe0-0000-1000-8000-00805f9b34fb"
        assert bluefy_res["normCheck"]["fromAlias"] == "00001800-0000-1000-8000-00805f9b34fb"
        assert bluefy_res["normCheck"]["fromShortHex"] == "0000ffe1-0000-1000-8000-00805f9b34fb"
        assert bluefy_res["requestCallsCount"] == 2, f"Expected fallback to 2nd requestDevice attempt, got {bluefy_res['requestCallsCount']}"
        assert bluefy_res["secondCallOptions"] == {
            "acceptAllDevices": True,
            "optionalServices": ["0000ffe0-0000-1000-8000-00805f9b34fb"]
        }
        assert "Connected" in bluefy_res["statusAfterConnect"], f"Expected Connected status, got {bluefy_res['statusAfterConnect']}"
        assert bluefy_res["bleConnectedClass"] is True, "document.body must have ble-connected class"
        assert bluefy_res["infoName"] == "NC3000 Pro Mock", f"Expected infoName NC3000 Pro Mock, got {bluefy_res['infoName']}"
        assert bluefy_res["txSelected"] == "0000ffe1-0000-1000-8000-00805f9b34fb", f"Expected normalized 0xFFE1 TX, got {bluefy_res['txSelected']}"
        assert bluefy_res["cancelCallCount"] == 1, "User cancellation (NotFoundError) must not trigger retry fallbacks"
        print("[PASS] Bluefy iOS BLE UUID normalization & progressive fallback verified")

        print("\n--- TEST 7: Mini4WDTournament.com Direct App Tabs & Always-Visible Promotion ---")
        page.click("#tabBtnDashboard")
        time.sleep(0.2)
        promo_dom = page.evaluate("""() => {
            const tabsGroup = document.getElementById('companionTabsGroup');
            const navSuite = document.getElementById('navPromoMini4wd');
            const navTournament = document.getElementById('navTabTournament');
            const navBreakIn = document.getElementById('navTabMotorBreakIn');
            const navTrack = document.getElementById('navTabTrackEditor');
            const cardTournament = document.getElementById('promoCardTournament');
            const cardBreakIn = document.getElementById('promoCardMotorBreakIn');
            const cardTrack = document.getElementById('promoCardTrackEditor');
            const banner = document.getElementById('mini4wdPromoBanner');
            const dynoCallout = document.getElementById('dynoMini4wdCallout');
            const dynoLink = dynoCallout?.querySelector('a.callout-link');
            const footerLink = document.querySelector('#siteFooter a.footer-promo-link');
            const bannerText = banner ? banner.innerText : '';
            const allExtTargetsValid = [
                navSuite, navTournament, navBreakIn, navTrack,
                cardTournament, cardBreakIn, cardTrack,
                dynoLink, footerLink, document.getElementById('btnPromoLaunchMain')
            ].every(el =>
                el &&
                el.getAttribute('target') === '_blank' &&
                (el.getAttribute('rel') || '').includes('noopener')
            );
            return {
                hasTabsGroup: !!tabsGroup,
                hasBanner: !!banner,
                hasDynoCallout: !!dynoCallout,
                hasFooterLink: !!footerLink,
                allExtTargetsValid,
                navTournamentHref: navTournament?.getAttribute('href'),
                navBreakInHref: navBreakIn?.getAttribute('href'),
                navTrackHref: navTrack?.getAttribute('href'),
                cardTournamentHref: cardTournament?.getAttribute('href'),
                cardBreakInHref: cardBreakIn?.getAttribute('href'),
                cardTrackHref: cardTrack?.getAttribute('href'),
                dynoLinkHref: dynoLink?.getAttribute('href'),
                footerHref: footerLink?.getAttribute('href'),
                hasTournamentFeature: bannerText.includes('Tournament Management'),
                hasBreakInFeature: bannerText.includes('Motor Break-In'),
                hasTrackEditorFeature: bannerText.includes('Track Editor'),
                tabsVisibleNormal: tabsGroup ? getComputedStyle(tabsGroup).display !== 'none' : false,
                bannerVisibleNormal: banner ? getComputedStyle(banner).display !== 'none' : false,
                gridVisibleBefore: banner ? getComputedStyle(banner.querySelector('.promo-features-grid')).display !== 'none' : false
            };
        }""")
        print("Promo DOM check:", promo_dom)
        assert promo_dom["hasTabsGroup"] and promo_dom["hasBanner"] and promo_dom["hasDynoCallout"] and promo_dom["hasFooterLink"]
        assert promo_dom["allExtTargetsValid"], "All promo links must open in a new tab with rel=noopener"
        assert promo_dom["navTournamentHref"] == "https://mini4wdtournament.com/tournament-manager/"
        assert promo_dom["navBreakInHref"] == "https://mini4wdtournament.com/motor-timer/"
        assert promo_dom["navTrackHref"] == "https://mini4wdtournament.com/track-editor/"
        assert promo_dom["cardTournamentHref"] == "https://mini4wdtournament.com/tournament-manager/"
        assert promo_dom["cardBreakInHref"] == "https://mini4wdtournament.com/motor-timer/"
        assert promo_dom["cardTrackHref"] == "https://mini4wdtournament.com/track-editor/"
        assert promo_dom["dynoLinkHref"] == "https://mini4wdtournament.com/motor-timer/"
        assert promo_dom["footerHref"] == "https://mini4wdtournament.com/"
        assert promo_dom["hasTournamentFeature"] and promo_dom["hasBreakInFeature"] and promo_dom["hasTrackEditorFeature"]
        assert promo_dom["tabsVisibleNormal"] and promo_dom["bannerVisibleNormal"] and promo_dom["gridVisibleBefore"]

        # Test Minimize/Expand toggle and localStorage persistence across reload
        page.click("#btnTogglePromoBanner")
        time.sleep(0.15)
        compact_state = page.evaluate("""() => {
            const banner = document.getElementById('mini4wdPromoBanner');
            const grid = banner.querySelector('.promo-features-grid');
            const btn = document.getElementById('btnTogglePromoBanner');
            return {
                hasCompactClass: banner.classList.contains('is-compact'),
                gridDisplay: getComputedStyle(grid).display,
                btnText: btn.textContent.trim(),
                ariaExpanded: btn.getAttribute('aria-expanded'),
                stored: localStorage.getItem('skyrc_nc3000_promo_compact')
            };
        }""")
        assert compact_state["hasCompactClass"] is True
        assert compact_state["gridDisplay"] == "none"
        assert compact_state["ariaExpanded"] == "false"
        assert compact_state["stored"] == "1"

        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(0.3)
        persisted_compact = page.evaluate("""() => {
            const banner = document.getElementById('mini4wdPromoBanner');
            return banner.classList.contains('is-compact') && getComputedStyle(banner.querySelector('.promo-features-grid')).display === 'none';
        }""")
        assert persisted_compact is True, "Compact promo banner state must persist across reload"

        # Restore expanded state
        page.click("#btnTogglePromoBanner")
        time.sleep(0.15)
        assert page.evaluate("!document.getElementById('mini4wdPromoBanner').classList.contains('is-compact')")

        # Verify companion tabs and banner remain visible in BOTH Pit Display Mode AND Production (non-localhost) Mode
        page.click("#btnTogglePitMode")
        time.sleep(0.15)
        pit_visible = page.evaluate("""() => {
            const tabsGroup = document.getElementById('companionTabsGroup');
            const banner = document.getElementById('mini4wdPromoBanner');
            return document.body.classList.contains('pit-mode') &&
                getComputedStyle(tabsGroup).display !== 'none' &&
                getComputedStyle(banner).display !== 'none';
        }""")
        assert pit_visible is True, "Companion tabs and promo banner must stay visible in Pit Display Mode"
        page.click("#btnTogglePitMode")
        time.sleep(0.15)

        prod_visible = page.evaluate("""() => {
            document.body.classList.remove('is-localhost');
            const tabsGroup = document.getElementById('companionTabsGroup');
            const banner = document.getElementById('mini4wdPromoBanner');
            const navTournament = document.getElementById('navTabTournament');
            const navBreakIn = document.getElementById('navTabMotorBreakIn');
            const navTrack = document.getElementById('navTabTrackEditor');
            const res = {
                tabsVisible: getComputedStyle(tabsGroup).display !== 'none',
                bannerVisible: getComputedStyle(banner).display !== 'none',
                tournamentVisible: getComputedStyle(navTournament).display !== 'none',
                breakInVisible: getComputedStyle(navBreakIn).display !== 'none',
                trackVisible: getComputedStyle(navTrack).display !== 'none'
            };
            document.body.classList.add('is-localhost');
            return res;
        }""")
        assert all(prod_visible.values()), f"Companion tabs and banner must be visible in production (non-localhost) normal mode: {prod_visible}"

        # Verify no horizontal overflow and visible tabs on mobile viewport (390x844)
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.2)
        mobile_check = page.evaluate("""() => ({
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            tabsVisible: getComputedStyle(document.getElementById('companionTabsGroup')).display !== 'none',
            tournamentVisible: getComputedStyle(document.getElementById('navTabTournament')).display !== 'none'
        })""")
        assert mobile_check["overflow"] is False, "Mobile viewport must not horizontally overflow with promo UI"
        assert mobile_check["tabsVisible"] and mobile_check["tournamentVisible"], "Companion app tabs must stay visible on mobile"
        print("[PASS] Mini4WDTournament.com direct app tabs, always-visible normal/pit/prod modes, persistence, and mobile responsiveness verified")

        print("\n--- ALL TELEMETRY & HARDWARE SYSTEM SETTINGS TESTS PASSED! ---")
        browser.close()

if __name__ == "__main__":
    test_telemetry_and_hw_settings()
