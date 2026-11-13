import asyncio
from playwright.async_api import async_playwright

async def run_slot_tests():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        await page.goto("http://localhost:8080", wait_until="networkidle")

        print("--- TEST 1: Check Slot Mode Bar & Checkbox Presence ---")
        slot_mode_bar = await page.is_visible("#slotModeBar")
        assert slot_mode_bar is True, "Slot mode bar should be visible"
        
        # Check all 4 pills
        for s in range(1, 5):
            bar_chk = await page.is_checked(f"#barChkSlot{s}")
            card_chk = await page.is_checked(f"#cardChkSlot{s}")
            drawer_chk = await page.is_checked(f"#chkSlot{s}")
            assert bar_chk is True, f"Bar slot {s} should be checked by default"
            assert card_chk is True, f"Card slot {s} should be checked by default"
            assert drawer_chk is True, f"Drawer slot {s} should be checked by default"
        print("✓ All 4 slot checkboxes exist and are checked by default across Bar, Card, and Drawer.")

        print("--- TEST 2: Start Button Initial State ---")
        btn_start_text = await page.inner_text("#btnStartKeeper")
        print(f"Start button text: '{btn_start_text}'")
        assert "Start All 4 Slots" in btn_start_text

        summary_text = await page.inner_text("#slotSelectionSummary")
        print(f"Summary text: '{summary_text}'")
        assert "All 4 slots active" in summary_text

        print("--- TEST 3: Checkbox Synchronization (Bar -> Card & Drawer) ---")
        # Uncheck Slot 2 on the bar
        await page.click("label[for='barChkSlot2'], #barChkSlot2 + .slot-pill-btn")
        
        slot2_states = await page.evaluate('''() => {
            return {
                bar: document.getElementById("barChkSlot2")?.checked,
                card: document.getElementById("cardChkSlot2")?.checked,
                drawer: document.getElementById("chkSlot2")?.checked,
                cfg: getKeeperConfig().enabledSlots,
                cardDisabledClass: document.getElementById("slotCard-1")?.classList.contains("slot-disabled"),
                phaseText: document.getElementById("slotKeeperPhase-1")?.textContent
            };
        }''')
        print(f"Slot 2 states after unchecking on bar: {slot2_states}")
        assert slot2_states["bar"] is False
        assert slot2_states["card"] is False
        assert slot2_states["drawer"] is False
        assert slot2_states["cfg"][1] is False
        assert slot2_states["cardDisabledClass"] is True
        assert "Slot Disabled" in slot2_states["phaseText"]

        btn_start_text = await page.inner_text("#btnStartKeeper")
        print(f"Start button with 3 slots: '{btn_start_text}'")
        assert "Start Selected Slots (3/4)" in btn_start_text

        print("--- TEST 4: Checkbox Synchronization (Card -> Bar & Drawer) ---")
        # Re-check Slot 2 on the card
        await page.click("#cardChkSlot2")
        slot2_rechecked = await page.evaluate('''() => {
            return {
                bar: document.getElementById("barChkSlot2")?.checked,
                card: document.getElementById("cardChkSlot2")?.checked,
                drawer: document.getElementById("chkSlot2")?.checked,
                cfg: getKeeperConfig().enabledSlots,
                cardDisabledClass: document.getElementById("slotCard-1")?.classList.contains("slot-disabled"),
                phaseText: document.getElementById("slotKeeperPhase-1")?.textContent
            };
        }''')
        print(f"Slot 2 states after re-checking on card: {slot2_rechecked}")
        assert slot2_rechecked["bar"] is True
        assert slot2_rechecked["card"] is True
        assert slot2_rechecked["drawer"] is True
        assert slot2_rechecked["cfg"][1] is True
        assert slot2_rechecked["cardDisabledClass"] is False

        btn_start_text = await page.inner_text("#btnStartKeeper")
        assert "Start All 4 Slots" in btn_start_text

        print("--- TEST 5: Quick Selection Buttons ---")
        # Click Pair 1 Only
        await page.click("#btnSelectPair1Slots")
        pair1_only_state = await page.evaluate('''() => {
            return {
                cfg: getKeeperConfig().enabledSlots,
                summary: document.getElementById("slotSelectionSummary")?.textContent,
                startAllText: document.getElementById("btnStartKeeper")?.textContent,
                startP0Text: document.getElementById("btnStartPair-0")?.textContent,
                startP1Text: document.getElementById("btnStartPair-1")?.textContent,
                startP1Disabled: document.getElementById("btnStartPair-1")?.disabled
            };
        }''')
        print(f"Pair 1 Only state: {pair1_only_state}")
        assert pair1_only_state["cfg"] == [True, True, False, False]
        assert "Slots 1, 2 active (2/4)" in pair1_only_state["summary"]
        assert "Start Selected Slots (2/4)" in pair1_only_state["startAllText"]
        assert "Start Pair 1 (Slots 1 & 2)" in pair1_only_state["startP0Text"]
        assert "Start Pair 2 (0 Slots)" in pair1_only_state["startP1Text"]
        assert pair1_only_state["startP1Disabled"] is True

        # Click Pair 2 Only
        await page.click("#btnSelectPair2Slots")
        pair2_only_state = await page.evaluate('''() => {
            return {
                cfg: getKeeperConfig().enabledSlots,
                summary: document.getElementById("slotSelectionSummary")?.textContent,
                startP0Text: document.getElementById("btnStartPair-0")?.textContent,
                startP0Disabled: document.getElementById("btnStartPair-0")?.disabled,
                startP1Text: document.getElementById("btnStartPair-1")?.textContent
            };
        }''')
        print(f"Pair 2 Only state: {pair2_only_state}")
        assert pair2_only_state["cfg"] == [False, False, True, True]
        assert "Start Pair 1 (0 Slots)" in pair2_only_state["startP0Text"]
        assert pair2_only_state["startP0Disabled"] is True
        assert "Start Pair 2 (Slots 3 & 4)" in pair2_only_state["startP1Text"]

        # Click Clear
        await page.click("#btnClearAllSlots")
        clear_state = await page.evaluate('''() => {
            return {
                cfg: getKeeperConfig().enabledSlots,
                summary: document.getElementById("slotSelectionSummary")?.textContent,
                startBtnText: document.getElementById("btnStartKeeper")?.textContent,
                startBtnDisabled: document.getElementById("btnStartKeeper")?.disabled
            };
        }''')
        print(f"Clear state: {clear_state}")
        assert clear_state["cfg"] == [False, False, False, False]
        assert "No slots active" in clear_state["summary"]
        assert "No Slots Selected" in clear_state["startBtnText"]
        assert clear_state["startBtnDisabled"] is True

        # Click All 4 Slots
        await page.click("#btnSelectAllSlots")
        all_slots_state = await page.evaluate('''() => {
            return {
                cfg: getKeeperConfig().enabledSlots,
                summary: document.getElementById("slotSelectionSummary")?.textContent,
                startBtnText: document.getElementById("btnStartKeeper")?.textContent
            };
        }''')
        print(f"All 4 Slots state: {all_slots_state}")
        assert all_slots_state["cfg"] == [True, True, True, True]
        assert "All 4 slots active" in all_slots_state["summary"]
        assert "Start All 4 Slots" in all_slots_state["startBtnText"]

        print("--- TEST 6: Simulated Start & Frame Generation Verification ---")
        # Test unified 0x94 frame generation for all 4 slots (0x00 in STM32 firmware) vs individual slot masks
        frame_tests = await page.evaluate('''() => {
            const results = {};
            
            // 1. All 4 slots (Position 0x00 in hardware firmware)
            for (let i = 0; i < 4; i++) setSlotEnabled(i, true, false);
            syncAllSlotCheckboxesUI();
            
            // Mode CHARGE with 0x00 (All 4 slots)
            const frameAllCharge = buildNativeModeFrame("CHARGE", 0x00);
            results.allChargePos = frameAllCharge[3]; // byte 3 is position (0F len cmd pos ...)
            results.allChargeCmd = frameAllCharge[2]; // 0x94
            results.allChargeLen = frameAllCharge.length;

            // Also test if 0x0F is passed, it correctly maps to 0x00
            const frameAllCharge0F = buildNativeModeFrame("CHARGE", 0x0F);
            results.allCharge0FPos = frameAllCharge0F[3];

            // 2. Individual slots: Slot 1 (0x01) and Slot 4 (0x08)
            const frameSlot1 = buildNativeModeFrame("DISCHARGE", 0x01);
            const frameSlot4 = buildNativeModeFrame("DISCHARGE", 0x08);
            results.slot1Pos = frameSlot1[3];
            results.slot4Pos = frameSlot4[3];

            // 3. Individual slots: Slot 2 (0x02) and Slot 3 (0x04)
            const frameSlot2 = buildNativeModeFrame("CYCLE", 0x02);
            const frameSlot3 = buildNativeModeFrame("CYCLE", 0x04);
            results.slot2Pos = frameSlot2[3];
            results.slot3Pos = frameSlot3[3];

            // Reset back to all 4
            for (let i = 0; i < 4; i++) setSlotEnabled(i, true, false);
            syncAllSlotCheckboxesUI();

            return results;
        }''')
        print(f"Frame tests output: {frame_tests}")
        assert frame_tests["allChargeCmd"] == 0x94, "Cmd opcode must be 0x94"
        assert frame_tests["allChargePos"] == 0x00, "All 4 slots position must be 0x00 (STM32 hardware all-slots position)"
        assert frame_tests["allCharge0FPos"] == 0x00, "0x0F input must map to 0x00 for hardware all-slots position"
        assert frame_tests["slot1Pos"] == 0x01, "Slot 1 mask must be 0x01"
        assert frame_tests["slot4Pos"] == 0x08, "Slot 4 mask must be 0x08"
        assert frame_tests["slot2Pos"] == 0x02, "Slot 2 mask must be 0x02"
        assert frame_tests["slot3Pos"] == 0x04, "Slot 3 mask must be 0x04"

        print("--- TEST 7: Stop Frame Generation ---")
        stop_frame_test = await page.evaluate('''() => {
            // Test buildNc3000StopFrame(0x00) for all slots and individual slots
            const stopAll = buildNc3000StopFrame(0x00);
            const stopAll0F = buildNc3000StopFrame(0x0F);
            const stopSlot1 = buildNc3000StopFrame(0x01);
            const stopSlot3 = buildNc3000StopFrame(0x04);
            return {
                cmd: stopAll[2],
                stopAllPos: stopAll[3],
                stopAll0FPos: stopAll0F[3],
                stopSlot1Pos: stopSlot1[3],
                stopSlot3Pos: stopSlot3[3]
            };
        }''')
        print(f"Stop frame test: {stop_frame_test}")
        assert stop_frame_test["cmd"] == 0xFE
        assert stop_frame_test["stopAllPos"] == 0x00, "Stop all must use position 0x00"
        assert stop_frame_test["stopAll0FPos"] == 0x00, "0x0F must map to 0x00 for stop all"
        assert stop_frame_test["stopSlot1Pos"] == 0x01, "Stop slot 1 must use 0x01"
        assert stop_frame_test["stopSlot3Pos"] == 0x04, "Stop slot 3 must use 0x04"

        print("--- TEST 8: LocalStorage Persistence Across Reload ---")
        # Set specific configuration: Slots 1 & 3 enabled, Slots 2 & 4 disabled
        await page.evaluate('''() => {
            setSlotEnabled(0, true, true);
            setSlotEnabled(1, false, true);
            setSlotEnabled(2, true, true);
            setSlotEnabled(3, false, true);
        }''')
        # Reload page
        await page.reload(wait_until="networkidle")

        persisted_state = await page.evaluate('''() => {
            return {
                cfg: getKeeperConfig().enabledSlots,
                bar1: document.getElementById("barChkSlot1")?.checked,
                bar2: document.getElementById("barChkSlot2")?.checked,
                bar3: document.getElementById("barChkSlot3")?.checked,
                bar4: document.getElementById("barChkSlot4")?.checked,
                card1: document.getElementById("cardChkSlot1")?.checked,
                card2: document.getElementById("cardChkSlot2")?.checked,
                card3: document.getElementById("cardChkSlot3")?.checked,
                card4: document.getElementById("cardChkSlot4")?.checked,
                summary: document.getElementById("slotSelectionSummary")?.textContent,
                startText: document.getElementById("btnStartKeeper")?.textContent
            };
        }''')
        print(f"Persisted state after reload: {persisted_state}")
        assert persisted_state["cfg"] == [True, False, True, False]
        assert persisted_state["bar1"] is True and persisted_state["bar2"] is False
        assert persisted_state["bar3"] is True and persisted_state["bar4"] is False
        assert persisted_state["card1"] is True and persisted_state["card2"] is False
        assert persisted_state["card3"] is True and persisted_state["card4"] is False
        assert "Slots 1, 3 active (2/4)" in persisted_state["summary"]
        assert "Start Selected Slots (2/4)" in persisted_state["startText"]

        # Restore back to all 4 slots
        await page.click("#btnSelectAllSlots")

        print("--- ALL SLOT CONFIGURATION TESTS PASSED SUCCESSFULLY! ---")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_slot_tests())
