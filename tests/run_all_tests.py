"""
SkyRC NC3000 Pro UI - Automated Test Suite Runner
Runs end-to-end integration tests using Playwright against the local web application.

Usage:
    pip install playwright
    playwright install chromium
    python tests/run_all_tests.py
"""

import sys
import time
import socket
import threading
import subprocess
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 8080
TESTS_DIR = Path(__file__).resolve().parent
ROOT_DIR = TESTS_DIR.parent

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def start_http_server():
    if not is_port_in_use(PORT):
        print(f"[HTTP] Starting background HTTP server on port {PORT} from {ROOT_DIR}...")
        server = HTTPServer(('localhost', PORT), lambda *args: SimpleHTTPRequestHandler(*args, directory=str(ROOT_DIR)))
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        time.sleep(1)
        print(f"[HTTP] Server running on http://localhost:{PORT}")
        return server
    else:
        print(f"[HTTP] Server already running on port {PORT}")
        return None

def main():
    server = start_http_server()

    test_scripts = [
        "test_mode_settings_and_overlay.py",
        "test_telemetry_and_hw_settings.py",
        "test_slot_mode_configuration.py"
    ]

    all_passed = True
    print("\n=======================================================")
    print("RUNNING AUTOMATED E2E INTEGRATION SUITES")
    print("=======================================================\n")

    for script in test_scripts:
        script_path = TESTS_DIR / script
        print(f"--> Executing {script}...")
        result = subprocess.run([sys.executable, str(script_path)], cwd=str(ROOT_DIR))
        if result.returncode != 0:
            print(f"[FAIL] {script} exited with error code {result.returncode}")
            all_passed = False
        else:
            print(f"[PASS] {script} completed successfully!\n")

    if server:
        server.shutdown()

    if all_passed:
        print("\n=======================================================")
        print("ALL TEST SUITES PASSED (100% SUCCESS)")
        print("=======================================================")
        sys.exit(0)
    else:
        print("\n[ERROR] One or more test suites failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
