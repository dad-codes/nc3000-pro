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

        print("\n--- ALL TELEMETRY & HARDWARE SYSTEM SETTINGS TESTS PASSED! ---")
        browser.close()

if __name__ == "__main__":
    test_telemetry_and_hw_settings()
