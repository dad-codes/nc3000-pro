import os
import sys
import time
import socket
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright

PORT = 8080

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def start_server_if_needed():
    if not is_port_in_use(PORT):
        print(f"[HTTP] Starting local HTTP server on port {PORT}...")
        server = HTTPServer(('localhost', PORT), SimpleHTTPRequestHandler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        time.sleep(1)
        print(f"[HTTP] Server started on http://localhost:{PORT}")
    else:
        print(f"[HTTP] Port {PORT} already listening.")

def run_mode_settings_and_overlay_test():
    start_server_if_needed()
    os.makedirs("captures", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda msg: print(f"[CONSOLE {msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"[PAGE ERROR STACK] {err} | {getattr(err, 'stack', '')}"))
        page.goto(f"http://localhost:{PORT}")
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        print("\n=======================================================")
        print("TEST 1: Mode Settings Parity & Input Boundaries Check")
        print("=======================================================")

        # 1.1 Mode 0 (Charge)
        m0_cap = page.input_value("#mode0CapacityMah")
        m0_cap_max = page.get_attribute("#mode0CapacityMah", "max")
        m0_cur = page.input_value("#mode0ChargeMa")
        m0_cutoff = page.input_value("#mode0CutoffMv")
        m0_deltav = page.input_value("#mode0DeltaVMv")
        m0_timer = page.input_value("#mode0TimerMin")
        m0_timer_max = page.get_attribute("#mode0TimerMin", "max")

        print(f"Mode 0: cap={m0_cap} (max={m0_cap_max}), cur={m0_cur}mA, cutoff={m0_cutoff}mV, deltaV={m0_deltav}mV, timer={m0_timer}min (max={m0_timer_max})")
        assert m0_cap == "3500", "Mode 0 Capacity must default to 3500 mAh"
        assert int(m0_cap_max) >= 50000, "Mode 0 Capacity max must be >= 50000 mAh"
        assert m0_cur == "1000", "Mode 0 Charge current must default to 1000 mA"
        assert m0_cutoff == "1650", "Mode 0 Cutoff must default to 1650 mV"
        assert m0_deltav == "5", "Mode 0 DeltaV must default to 5 mV"
        assert int(m0_timer_max) >= 1440, "Mode 0 Timer max must be >= 1440 min"

        # 1.2 Mode 1 (Discharge)
        m1_dis = page.input_value("#mode1DischargeMa")
        m1_cutoff = page.input_value("#mode1CutoffMv")
        m1_stop_cur = page.input_value("#mode1StopCurrentMa")
        m1_stop_cur_max = page.get_attribute("#mode1StopCurrentMa", "max")
        m1_timer = page.input_value("#mode1TimerMin")
        m1_timer_max = page.get_attribute("#mode1TimerMin", "max")

        print(f"Mode 1: disCur={m1_dis}mA, cutoff={m1_cutoff}mV, stopCur={m1_stop_cur}mA (max={m1_stop_cur_max}), timer={m1_timer}min (max={m1_timer_max})")
        assert m1_dis == "1000", "Mode 1 Discharge current must default to 1000 mA"
        assert m1_cutoff == "1000", "Mode 1 Cutoff must default to 1000 mV"
        assert m1_stop_cur == "100", "Mode 1 Stop current must default to 100 mA"
        assert int(m1_stop_cur_max) >= 2500, "Mode 1 Stop current max must be >= 2500 mA (Dalvik parity)"
        assert int(m1_timer_max) >= 1440, "Mode 1 Timer max must be >= 1440 min"

        # 1.3 Mode 3 (Cycle)
        m3_seq = page.input_value("#mode3CycleSequence")
        m3_cnt = page.input_value("#mode3CycleCount")
        m3_timer = page.input_value("#mode3TimerMin")
        m3_timer_max = page.get_attribute("#mode3TimerMin", "max")

        print(f"Mode 3: seq={m3_seq}, count={m3_cnt}, timer={m3_timer}min (max={m3_timer_max})")
        assert m3_seq == "3", "Mode 3 Sequence must default to 3 (C->D->C Refresh)"
        assert m3_cnt == "1", "Mode 3 Count must default to 1"
        assert m3_timer == "180", "Mode 3 Safety Timer must default to 180 min"
        assert int(m3_timer_max) >= 1440, "Mode 3 Timer max must be >= 1440 min"

        print("PASS: Mode settings and boundaries verified 1:1 against Dalvik APK!")

        print("\n=======================================================")
        print("TEST 2: Mode 3 Safety Timer Persistence & Profile Hooks")
        print("=======================================================")

        # Open drawer and switch mode to CYCLE so Section is visible
        page.click("#btnOpenConfig")
        time.sleep(0.5)
        page.evaluate("() => window.switchWorkingMode('CYCLE')")
        time.sleep(0.5)

        # Fill Mode 3 Safety Timer
        page.fill("#mode3TimerMin", "240")
        page.evaluate("() => document.getElementById('mode3TimerMin').dispatchEvent(new Event('input'))")
        time.sleep(0.5)

        # Check localStorage persistence
        saved_timer = page.evaluate("""() => {
            const raw = localStorage.getItem('nc3000pro_keeper_prefs_v1');
            const prefs = JSON.parse(raw);
            return prefs ? prefs.mode3TimerMin : null;
        }""")
        print(f"Saved mode3TimerMin in localStorage: {saved_timer}")
        assert saved_timer == "240", "mode3TimerMin must be saved in localStorage"

        # Check getCurrentModeParams
        cycle_params = page.evaluate("() => window.getCurrentModeParams('CYCLE')")
        print(f"getCurrentModeParams('CYCLE'): {cycle_params}")
        assert cycle_params.get("timerMin") == 240, "getCurrentModeParams must include timerMin=240"

        # Check applyProfile restores 180 from default refresh profile
        page.evaluate("() => window.applyProfile('native_cycle_refresh')")
        time.sleep(0.5)
        restored_val = page.input_value("#mode3TimerMin")
        print(f"After applyProfile('native_cycle_refresh'), mode3TimerMin = {restored_val}")
        assert restored_val == "180", "applyProfile must set mode3TimerMin to profile value (180)"

        # Close configuration drawer
        page.click("#btnCloseConfig")
        time.sleep(0.5)

        print("PASS: Mode 3 Safety Timer full persistence lifecycle verified!")

        print("\n=======================================================")
        print("TEST 3: 0x94 Hardware Frame Builder Verification")
        print("=======================================================")

        # Test frame generation for Mode 3 (Cycle)
        cycle_frame = page.evaluate("""() => {
            const frame = window.buildNativeModeFrame('CYCLE', 0x01);
            return Array.from(frame);
        }""")
        print(f"Generated 0x94 Frame for Mode 3 (length={len(cycle_frame)}): {cycle_frame[:10]} ...")
        assert len(cycle_frame) == 44, "Native 0x94 frame must be 44 bytes (2B header + 41B payload + 1B checksum)"
        assert cycle_frame[0] == 0x0f, "Frame header must be 0x0f"
        assert cycle_frame[1] == 0x2a, "Frame length must be 42 (0x2a)"
        assert cycle_frame[2] == 0x94, "Cmd byte must be 0x94"
        assert cycle_frame[3] == 0x01, "Slot posByte must be 0x01"
        assert cycle_frame[4] == 0x03, "Mode model byte must be 0x03 (CYCLE)"

        # datas[27..28] in frame: index 2 (cmd 0x94) + 1 (datas[0]) + 27 = 30
        timer_hi = cycle_frame[30]
        timer_lo = cycle_frame[31]
        timer_val = (timer_hi << 8) | timer_lo
        print(f"Frame timerMin bytes: [{timer_hi:#04x}, {timer_lo:#04x}] -> {timer_val} min")
        assert timer_val == 180, f"Frame timerMin must encode 180 min, got {timer_val}"

        print("PASS: 0x94 BLE frame generation verified!")

        print("\n=======================================================")
        print("TEST 4: Analytics Tab & 4-Slot Multi-Metric Overlay")
        print("=======================================================")

        # Switch to Analytics tab
        page.evaluate("() => window.switchAppTab('analytics')")
        time.sleep(1)

        tab_state = page.evaluate("""() => {
            const tab = document.getElementById('analyticsTabView');
            const btn = document.getElementById('btnAnalyticsSlotAll');
            const drawer = document.getElementById('configDrawerOverlay');
            return {
                tabClass: tab ? tab.className : null,
                tabDisplay: tab ? window.getComputedStyle(tab).display : null,
                btnDisplay: btn ? window.getComputedStyle(btn).display : null,
                btnOffsetParent: btn ? !!btn.offsetParent : null,
                drawerClass: drawer ? drawer.className : null
            };
        }""")
        print(f"Analytics tab state: {tab_state}")

        # Verify initial single slot view
        single_toggles_vis = page.evaluate("!document.getElementById('singleSlotMetricToggles').classList.contains('hidden')")
        overlay_pills_hidden = page.evaluate("document.getElementById('overlayMetricPills').classList.contains('hidden')")
        print(f"Single slot view: singleTogglesVis={single_toggles_vis}, overlayPillsHidden={overlay_pills_hidden}")
        assert single_toggles_vis and overlay_pills_hidden, "Single slot mode must show checkboxes and hide overlay pills"

        # Inject simulated telemetry data into all 4 slots
        page.evaluate("""() => {
            const now = Date.now();
            window.telemetryHistory.slots = [[], [], [], []];
            for (let i = 0; i < 60; i++) {
                // Slot 1
                window.telemetryHistory.slots[0].push({
                    t: now + i*1000, elapsedSec: i, v: +(1.45 - i*0.002).toFixed(3), i: 1000, ir: 18, mah: i*15, status: "CHARGING", mode: "CHARGE"
                });
                // Slot 2
                window.telemetryHistory.slots[1].push({
                    t: now + i*1000, elapsedSec: i, v: +(1.48 - i*0.0018).toFixed(3), i: 1020, ir: 24, mah: i*16, status: "CHARGING", mode: "CHARGE"
                });
                // Slot 3
                window.telemetryHistory.slots[2].push({
                    t: now + i*1000, elapsedSec: i, v: +(1.42 - i*0.0022).toFixed(3), i: 990, ir: 32, mah: i*14, status: "CHARGING", mode: "CHARGE"
                });
                // Slot 4
                window.telemetryHistory.slots[3].push({
                    t: now + i*1000, elapsedSec: i, v: +(1.46 - i*0.0021).toFixed(3), i: 1010, ir: 21, mah: i*15.5, status: "CHARGING", mode: "CHARGE"
                });
            }
        }""")

        # Switch to All 4 Slots Overlay
        print("Before click SlotAll: selectedSlotView =", page.evaluate("window.telemetryHistory.selectedSlotView"))
        page.click("#btnAnalyticsSlotAll")
        time.sleep(0.5)
        print("After click SlotAll: selectedSlotView =", page.evaluate("window.telemetryHistory.selectedSlotView"))

        diag = page.evaluate("""() => {
            const st = document.getElementById('singleSlotMetricToggles');
            const op = document.getElementById('overlayMetricPills');
            return {
                stClass: st ? st.className : null,
                opClass: op ? op.className : null,
                selSlot: window.telemetryHistory.selectedSlotView
            };
        }""")
        print("Diagnostics:", diag)

        single_toggles_hidden = page.evaluate("document.getElementById('singleSlotMetricToggles').classList.contains('hidden')")
        overlay_pills_vis = page.evaluate("!document.getElementById('overlayMetricPills').classList.contains('hidden')")
        print(f"Overlay view: singleTogglesHidden={single_toggles_hidden}, overlayPillsVis={overlay_pills_vis}")
        assert single_toggles_hidden and overlay_pills_vis, "Overlay mode must hide checkboxes and show overlay pills"

        # 4.1 Metric: Voltage Overlay (Default)
        chart_datasets = page.evaluate("window.telemetryChart.data.datasets.length")
        active_metric = page.evaluate("window.telemetryHistory.overlayMetric")
        y_volt_display = page.evaluate("window.telemetryChart.options.scales.yVoltage.display")
        y_cur_display = page.evaluate("window.telemetryChart.options.scales.yCurrent.display")
        heading = page.evaluate("document.getElementById('chartHeadingTitle').textContent")

        print(f"[VOLTAGE] datasets={chart_datasets}, activeMetric={active_metric}, yVoltDisplay={y_volt_display}, heading='{heading}'")
        assert chart_datasets == 4, f"Overlay must have 4 datasets (one per slot), got {chart_datasets}"
        assert active_metric == "voltage", "Default overlay metric should be voltage"
        assert y_volt_display and not y_cur_display, "Only yVoltage should be displayed"
        page.screenshot(path="captures/overlay_voltage.png")

        # 4.2 Metric: Current Overlay
        page.click("#btnOverlayMetricCurrent")
        time.sleep(0.5)

        active_metric = page.evaluate("window.telemetryHistory.overlayMetric")
        chart_datasets = page.evaluate("window.telemetryChart.data.datasets.length")
        ds_label_s1 = page.evaluate("window.telemetryChart.data.datasets[0].label")
        y_cur_display = page.evaluate("window.telemetryChart.options.scales.yCurrent.display")
        y_volt_display = page.evaluate("window.telemetryChart.options.scales.yVoltage.display")
        heading = page.evaluate("document.getElementById('chartHeadingTitle').textContent")

        print(f"[CURRENT] datasets={chart_datasets}, label0='{ds_label_s1}', activeMetric={active_metric}, yCurDisplay={y_cur_display}, heading='{heading}'")
        assert active_metric == "current", "Overlay metric should be current"
        assert chart_datasets == 4, "Current overlay must have 4 datasets"
        assert "Current" in ds_label_s1, f"Dataset 0 label should contain 'Current', got {ds_label_s1}"
        assert y_cur_display and not y_volt_display, "Only yCurrent should be displayed"
        page.screenshot(path="captures/overlay_current.png")

        # 4.3 Metric: IR Overlay
        page.click("#btnOverlayMetricIr")
        time.sleep(0.5)

        active_metric = page.evaluate("window.telemetryHistory.overlayMetric")
        chart_datasets = page.evaluate("window.telemetryChart.data.datasets.length")
        ds_label_s1 = page.evaluate("window.telemetryChart.data.datasets[0].label")
        y_ir_display = page.evaluate("window.telemetryChart.options.scales.yIr.display")
        heading = page.evaluate("document.getElementById('chartHeadingTitle').textContent")

        print(f"[IR] datasets={chart_datasets}, label0='{ds_label_s1}', activeMetric={active_metric}, yIrDisplay={y_ir_display}, heading='{heading}'")
        assert active_metric == "ir", "Overlay metric should be ir"
        assert chart_datasets == 4, "IR overlay must have 4 datasets"
        assert "IR" in ds_label_s1, f"Dataset 0 label should contain 'IR', got {ds_label_s1}"
        assert y_ir_display, "yIr must be displayed"
        page.screenshot(path="captures/overlay_ir.png")

        # 4.4 Metric: Capacity Overlay
        page.click("#btnOverlayMetricCapacity")
        time.sleep(0.5)

        active_metric = page.evaluate("window.telemetryHistory.overlayMetric")
        chart_datasets = page.evaluate("window.telemetryChart.data.datasets.length")
        ds_label_s1 = page.evaluate("window.telemetryChart.data.datasets[0].label")
        y_cap_display = page.evaluate("window.telemetryChart.options.scales.yCapacity.display")
        heading = page.evaluate("document.getElementById('chartHeadingTitle').textContent")

        print(f"[CAPACITY] datasets={chart_datasets}, label0='{ds_label_s1}', activeMetric={active_metric}, yCapDisplay={y_cap_display}, heading='{heading}'")
        assert active_metric == "capacity", "Overlay metric should be capacity"
        assert chart_datasets == 4, "Capacity overlay must have 4 datasets"
        assert "Capacity" in ds_label_s1, f"Dataset 0 label should contain 'Capacity', got {ds_label_s1}"
        assert y_cap_display, "yCapacity must be displayed"
        page.screenshot(path="captures/overlay_capacity.png")

        # 4.5 Switch back to Single Slot Mode (Slot 2)
        page.click("#btnAnalyticsSlot1")
        time.sleep(0.5)

        single_toggles_vis = page.evaluate("!document.getElementById('singleSlotMetricToggles').classList.contains('hidden')")
        overlay_pills_hidden = page.evaluate("document.getElementById('overlayMetricPills').classList.contains('hidden')")
        selected_slot = page.evaluate("window.telemetryHistory.selectedSlotView")
        chart_datasets = page.evaluate("window.telemetryChart.data.datasets.length")
        heading = page.evaluate("document.getElementById('chartHeadingTitle').textContent")

        print(f"[RETURN SINGLE SLOT] slot={selected_slot}, datasets={chart_datasets}, singleTogglesVis={single_toggles_vis}, overlayPillsHidden={overlay_pills_hidden}, heading='{heading}'")
        assert selected_slot == 1, "Selected slot should be 1 (Slot 2)"
        assert single_toggles_vis and overlay_pills_hidden, "Single slot toggles must be restored"
        assert chart_datasets == 4, "Single slot view must have 4 datasets (V, I, IR, Cap)"
        assert "Slot 2" in heading, f"Heading should indicate Slot 2, got {heading}"
        page.screenshot(path="captures/single_slot_restored.png")
        assert "Slot 2" in heading, f"Heading should indicate Slot 2, got {heading}"
        page.screenshot(path="captures/single_slot_restored.png")

        print("\n=======================================================")
        print("ALL TESTS PASSED WITH 100% SUCCESS!")
        print("=======================================================")

        browser.close()

if __name__ == "__main__":
    run_mode_settings_and_overlay_test()
