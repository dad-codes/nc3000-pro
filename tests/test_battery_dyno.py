from playwright.sync_api import sync_playwright
import json
import time


def build_0x91_packet(slot_idx, voltage_mv, current_ma, cap_mah, ir_mohm, duration_sec, status=0x03, mode=0x01, err=0x00):
    mask = 1 << slot_idx
    payload = [
        0x0F, 0x15, 0x91, mask,
        (current_ma >> 8) & 0xFF, current_ma & 0xFF,
        (voltage_mv >> 8) & 0xFF, voltage_mv & 0xFF,
        0x00, 0x00,
        (cap_mah >> 8) & 0xFF, cap_mah & 0xFF,
        (duration_sec >> 24) & 0xFF, (duration_sec >> 16) & 0xFF, (duration_sec >> 8) & 0xFF, duration_sec & 0xFF,
        (ir_mohm >> 8) & 0xFF, ir_mohm & 0xFF,
        status & 0xFF,
        mode & 0xFF,
        err & 0xFF,
    ]
    cs = sum(payload) & 0xFF
    payload.append(cs)
    return payload


def test_battery_dyno():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 900})
        page.goto("http://localhost:8080")
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)

        print("--- TEST 1: Battery Test (Motor Dyno) Tab Navigation ---")
        page.click("#tabBtnBatteryTest")
        time.sleep(0.3)
        dyno_visible = page.evaluate("!document.getElementById('batteryTestTabView').classList.contains('hidden')")
        keeper_hidden = page.evaluate("document.getElementById('keeperBody').style.display === 'none'")
        analytics_hidden = page.evaluate("document.getElementById('analyticsTabView').classList.contains('hidden')")
        assert dyno_visible and keeper_hidden and analytics_hidden, "Clicking Battery Test tab must exclusively show #batteryTestTabView"
        print("[PASS] Tab navigation switches cleanly to Battery Test (Motor Dyno)")

        print("\n--- TEST 2: Tamiya Motor Presets, Duplicate-mA Slug Stability & 15W Budget ---")
        page.select_option("#dynoMotorPreset", "fa-130")
        assert page.input_value("#dynoCurrentMa") == "1100", "FA-130 must set 1100 mA"
        assert page.is_hidden("#dynoClampedBanner"), "FA-130 (1.1A) should not show 2.5A clamped banner"

        page.select_option("#dynoMotorPreset", "hyper-dash-3")
        assert page.input_value("#dynoCurrentMa") == "2300", "Hyper-Dash 3 must set 2300 mA"
        assert page.is_visible("#dynoClampedBanner"), "Hyper-Dash 3 (3.0A peak) should show clamped peak banner"

        # Sprint-Dash and Mach-Dash PRO both default to 2500 mA; unique IDs must not snap back
        page.select_option("#dynoMotorPreset", "sprint-dash")
        assert page.evaluate("document.getElementById('dynoMotorPreset').value") == "sprint-dash"
        page.select_option("#dynoMotorPreset", "mach-dash-pro")
        assert page.evaluate("document.getElementById('dynoMotorPreset').value") == "mach-dash-pro"
        assert page.input_value("#dynoCurrentMa") == "2500"

        # Manual edit switches preset to custom
        page.fill("#dynoCurrentMa", "1700")
        page.dispatch_event("#dynoCurrentMa", "input")
        assert page.evaluate("document.getElementById('dynoMotorPreset').value") == "custom"

        # Select Mach-Dash PRO (2500 mA) and enable all 4 slots -> 15W power budget warning appears
        page.select_option("#dynoMotorPreset", "mach-dash-pro")
        page.click("#btnDynoSelectAll")
        assert page.is_visible("#dynoPowerBudgetBanner"), "4 slots @ 2500 mA must display 15W Power Budget warning"
        page.click("#btnDynoQuickPair1")
        assert not page.is_visible("#dynoPowerBudgetBanner"), "Pair 1 @ 2500 mA (~6.3W) must clear 15W warning"
        print("[PASS] Preset IDs, manual override, clamped banner, and 15W budget quick-pair work")

        print("\n--- TEST 3: Mode 1 0x94 Frame Builder (outStopCurrentMa === dischargeMa) ---")
        frame_bytes = page.evaluate("Array.from(window.buildDynoDischargeFrame(0x01, 2500))")
        assert len(frame_bytes) == 44, f"Expected 44-byte 0x94 frame, got {len(frame_bytes)}"
        assert frame_bytes[0] == 0x0F and frame_bytes[1] == 0x2A and frame_bytes[2] == 0x94
        assert frame_bytes[4] == 1, f"Expected mode=1 (Discharge), got {frame_bytes[4]}"
        discharge_ma = (frame_bytes[7] << 8) | frame_bytes[8]
        out_stop_volt_mv = (frame_bytes[13] << 8) | frame_bytes[14]
        out_stop_cur_ma = (frame_bytes[17] << 8) | frame_bytes[18]
        assert discharge_ma == 2500, f"Expected dischargeMa=2500, got {discharge_ma}"
        assert out_stop_volt_mv == 1000, f"Expected outStopVoltageMv=1000, got {out_stop_volt_mv}"
        assert out_stop_cur_ma == 2500, f"Expected outStopCurrentMa=2500 (taper OFF), got {out_stop_cur_ma}"
        cs = sum(frame_bytes[2:43]) & 0xFF
        assert frame_bytes[43] == cs, "Checksum mismatch on 0x94 frame"
        print("[PASS] 0x94 frame disables firmware Linear Current Reduce (outStopCurrentMa == 2500)")

        print("\n--- TEST 4: Simulated 4-Slot Dyno Run, State Isolation, Interpolation & Metrics ---")
        # Initialize clean storage and prepare an active 4-slot 45s @ 2500 mA Dyno run
        page.evaluate("""() => {
            localStorage.removeItem('nc3000_battery_tests_v1');
            window.switchWorkingMode('RACE_READY', false);
            window.keeperState.active = false;
            window.keeperState.pairs[0].active = false;
            window.keeperState.pairs[1].active = false;
            window.dynoState.active = true;
            window.dynoState.lastAnyTelemetryMs = Date.now();
            window.dynoState.activeRun = {
                id: 'dyno_test_run_1',
                createdAt: new Date('2026-11-15T08:00:00Z').toISOString(),
                presetId: 'mach-dash-pro',
                presetLabel: 'Mach-Dash PRO — 2.0–3.5 A',
                ratedMaxMa: 3500,
                targetCurrentMa: 2500,
                dur: 45,
                note: 'NeoChamp Batch A @ 25C Pit',
                abortedReason: null,
                slots: [
                    { slotIdx: 0, cellName: 'NC-A1', v0: 1.485, trickleStart: true, started: false, startedAtMs: 0, finished: false, earlyCutoff: false, thermalFault: false, errorState: 0, elapsedSec: 0, samples: [], metrics: null },
                    { slotIdx: 1, cellName: 'NC-A2', v0: 1.430, trickleStart: false, started: false, startedAtMs: 0, finished: false, earlyCutoff: false, thermalFault: false, errorState: 0, elapsedSec: 0, samples: [], metrics: null },
                    { slotIdx: 2, cellName: 'NC-B1', v0: 1.428, trickleStart: false, started: false, startedAtMs: 0, finished: false, earlyCutoff: false, thermalFault: false, errorState: 0, elapsedSec: 0, samples: [], metrics: null },
                    { slotIdx: 3, cellName: 'NC-B2', v0: 1.425, trickleStart: false, started: false, startedAtMs: 0, finished: false, earlyCutoff: false, thermalFault: false, errorState: 0, elapsedSec: 0, samples: [], metrics: null }
                ]
            };
        }""")

        # Simulate telemetry points skipping t=10 (9s and 11s) to test interpolation & post-5s IR
        slot_baselines = [1320, 1318, 1292, 1290]  # NC-A1 & NC-A2 form a close top pair; NC-B1 & NC-B2 lower
        slot_irs = [18, 19, 25, 26]
        time_steps = [0, 2, 5, 7, 9, 11, 15, 20, 25, 30, 35, 40, 44, 46]

        for t_sec in time_steps:
            for s in range(4):
                # Linear gentle droop during discharge
                v_mv = slot_baselines[s] - int(t_sec * 1.6)
                ir_val = 0 if t_sec < 5 else slot_irs[s]
                pkt = build_0x91_packet(s, v_mv, 2500, max(1, int(t_sec * 0.7)), ir_val, t_sec, status=0x03, mode=0x01)
                page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({pkt}))")

            if t_sec < 45:
                # Verify State Isolation mid-run: Keeper & Dashboard mode must NOT be hijacked!
                mid_state = page.evaluate("""() => ({
                    keeperActive: window.keeperState.active,
                    mode: document.getElementById('keeperWorkingMode').value,
                    dynoActive: window.dynoState.active
                })""")
                assert mid_state["keeperActive"] is False, "Keeper must stay inactive during Dyno run"
                assert mid_state["mode"] == "RACE_READY", "Dashboard mode must not switch to DISCHARGE during Dyno"
                assert mid_state["dynoActive"] is True

        # After t=46 >= dur (45), run must auto-finalize & save
        post_state = page.evaluate("""() => {
            const saved = window.loadDynoSavedRuns();
            return {
                dynoActive: window.dynoState.active,
                keeperActive: window.keeperState.active,
                savedCount: saved.length,
                run: saved[0]
            };
        }""")
        assert post_state["dynoActive"] is False, "Run must auto-finalize once all slots reach dur=45s"
        assert post_state["keeperActive"] is False
        assert post_state["savedCount"] == 1
        s0 = next(x for x in post_state["run"]["slots"] if x["slotIdx"] == 0)
        m0 = s0["metrics"]
        assert m0["v10"] is not None, "V(10s) must be interpolated between t=9s and t=11s"
        assert m0["vEnd"] is not None, "V(45s) must be interpolated between t=44s and t=46s"
        assert m0["irMohm"] == 18, f"Expected post-5s median IR=18 mOhm, got {m0['irMohm']}"
        assert m0["estPeakLoadV"] is not None and m0["estPeakLoadV"] < m0["score"], "Clamped Mach-Dash PRO must project lower Est. V @ 3500 mA Peak"
        assert m0["punchDrop"] is not None and m0["punchDrop"] > 0.1, "Punch Drop (1s) must capture V0 -> V(2s) drop"

        # Check rendered warnings & Est V @ Peak column & Trickle tag in DOM
        warnings_html = page.inner_html("#dynoRunWarnings")
        results_html = page.inner_html("#dynoResultsTbody")
        assert "v0 Spread" in warnings_html and "Trickle Start" in warnings_html
        assert "Trickle" in results_html
        assert page.is_visible("#thEstPeakV"), "Est. V @ Peak column should be visible for Mach-Dash PRO"
        assert page.locator("#dynoSvgChartContainer svg.dyno-svg-chart polyline").count() == 4
        print("[PASS] State isolation, linear checkpoint interpolation, IR sampling, Est. Peak V & SVG chart verified")

        # Post-Dyno Regression Check: Standby (status=0, mode=1), Ready (status=1, mode=1), & Done (status=5, mode=1) must not lock mode to DISCHARGE
        page.evaluate("() => { window.dynoState.cooldownUntil = 0; }")
        for s in range(4):
            standby_pkt = build_0x91_packet(s, 1340, 0, 12, 18, 0, status=0x00, mode=0x01)
            page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({standby_pkt}))")
        page.click("#tabBtnDashboard")
        page.click("#btnOpenConfig")
        time.sleep(0.5)
        page.select_option("#keeperProfileSelect", "native_chg_neochamp")
        for s in range(4):
            standby_pkt = build_0x91_packet(s, 1340, 0, 12, 18, 0, status=0x00, mode=0x01)
            page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({standby_pkt}))")
        assert page.evaluate("document.getElementById('keeperWorkingMode').value") == "CHARGE", (
            "Standby slot retaining mode=1 must not snap Dashboard working mode back to DISCHARGE"
        )
        # Ready slot (status=1, mode=1): repeated polls must not overwrite user's CHARGE mode selection
        ready_pkt_s0 = build_0x91_packet(0, 1350, 0, 0, 18, 0, status=0x01, mode=0x01)
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({ready_pkt_s0}))")
        page.select_option("#keeperProfileSelect", "native_chg_neochamp")
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({ready_pkt_s0}))")
        assert page.evaluate("document.getElementById('keeperWorkingMode').value") == "CHARGE", (
            "Repeated Ready (status=1, mode=1) polls must not overwrite user's CHARGE mode selection"
        )
        # Done slot (status=5, mode=1): repeated polls must not overwrite user's RACE_READY selection
        done_pkt_s0 = build_0x91_packet(0, 1350, 0, 20, 18, 45, status=0x05, mode=0x01)
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({done_pkt_s0}))")
        page.select_option("#keeperProfileSelect", "race_ready_280")
        page.evaluate(f"window.parseAndApplyNc3000SlotTelemetry(new Uint8Array({done_pkt_s0}))")
        assert page.evaluate("document.getElementById('keeperWorkingMode').value") == "RACE_READY", (
            "Repeated Done (status=5, mode=1) polls must not overwrite user's RACE_READY selection"
        )
        page.click("#btnCloseConfig")
        time.sleep(0.4)
        page.evaluate("() => { window.keeperState.active = false; window.keeperState.pairs[0].active = false; window.keeperState.slots.forEach(s => s.lastSyncedHwSig = null); }")
        page.click("#tabBtnBatteryTest")
        print("[PASS] Post-Discharge / Standby, Ready & Done mode=1 telemetry no longer locks Dashboard mode selector")

        print("\n--- TEST 5: dur=10s Edge Case (Punch Drop valid, 10s->End renders '—') ---")
        dur10_metrics = page.evaluate("""() => {
            const fakeSlot = {
                slotIdx: 0, cellName: 'Quick10', v0: 1.430,
                samples: [
                    { t: 1.2, v: 1.320, i: 1800, ir: 0 },
                    { t: 4.0, v: 1.300, i: 1800, ir: 19 },
                    { t: 7.0, v: 1.290, i: 1800, ir: 19 },
                    { t: 10.0, v: 1.280, i: 1800, ir: 19 }
                ]
            };
            return window.computeDynoSlotMetrics(fakeSlot, 10, 1800, 2200);
        }""")
        assert dur10_metrics["punchDrop"] == 0.11, f"Expected punchDrop=0.11V, got {dur10_metrics['punchDrop']}"
        assert dur10_metrics["lateSag"] is None, "10s->End lateSag must be null when dur <= 10s"
        assert dur10_metrics["estPeakLoadV"] is None, "No Est. Peak projection when ratedMaxMa <= target/max"
        print("[PASS] dur=10s Punch Drop & lateSag=null verified")

        print("\n--- TEST 6: Best-Pair Recommender Partitioning & Latest-Cell Deduplication ---")
        pair_check = page.evaluate("""() => {
            const runs = window.loadDynoSavedRuns();
            // Inject an older run for NC-A1 at DIFFERENT current (1100 mA) and an outdated 2500 mA run for NC-A1
            runs.push({
                id: 'dyno_old_1100',
                createdAt: new Date('2026-11-15T06:00:00Z').toISOString(),
                presetId: 'fa-130',
                presetLabel: 'FA-130',
                ratedMaxMa: 1200,
                targetCurrentMa: 1100,
                dur: 45,
                note: '',
                slots: [
                    { slotIdx: 0, cellName: 'SlowCell', v0: 1.43, metrics: { score: 1.3900, vEnd: 1.370, irMohm: 15, punchDrop: 0.04, lateSag: 0.01 } }
                ]
            });
            window.saveDynoRuns(runs);
            window.dynoState.rankingFilterKey = '45_2500';
            window.renderDynoAll();
            return {
                rankRows: document.querySelectorAll('#dynoRankingTbody tr').length,
                recVisible: !document.getElementById('dynoPairRecommenderPanel').classList.contains('hidden'),
                firstPairText: document.querySelector('.dyno-pair-rec-card.rank-1')?.textContent || '',
                filterCount: document.querySelectorAll('.dyno-filter-pill').length
            };
        }""")
        assert pair_check["rankRows"] == 4, f"45s@2500mA pool must contain 4 cells (excluding 1100mA run), got {pair_check['rankRows']}"
        assert pair_check["filterCount"] == 2, "Should render separate filter pills for 45s@2500mA and 45s@1100mA"
        assert pair_check["recVisible"] is True
        assert "NC-A1" in pair_check["firstPairText"] and "NC-A2" in pair_check["firstPairText"], (
            f"Best pair must match NC-A1 + NC-A2, got: {pair_check['firstPairText']}"
        )
        print("[PASS] Pair Recommender & (dur, targetCurrentMa) partitioning verified")

        # Cleanup localStorage so subsequent suites start clean
        page.evaluate("() => localStorage.removeItem('nc3000_battery_tests_v1')")
        print("\n--- ALL BATTERY TEST (MOTOR DYNO) TESTS PASSED! ---")
        browser.close()


if __name__ == "__main__":
    test_battery_dyno()
