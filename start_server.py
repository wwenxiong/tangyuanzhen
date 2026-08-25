# -*- coding: utf-8 -*-
"""
Party Training System - Start Script
Run: python start_server.py
"""
import subprocess
import sys
import os
import webbrowser
import threading
import time

def main():
    server_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server")
    os.chdir(server_dir)

    print("=" * 50)
    print("  Party Training System - Starting...")
    print("=" * 50)
    print()

    # Check Node.js
    try:
        r = subprocess.run(["node", "-v"], capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            raise Exception()
        print("[OK] Node.js version:", r.stdout.strip())
    except:
        print("[ERROR] Node.js not found. Please install: https://nodejs.org")
        input("Press Enter to exit...")
        sys.exit(1)

    # Check package.json
    if not os.path.exists(os.path.join(server_dir, "package.json")):
        print("[ERROR] server/package.json not found")
        input("Press Enter to exit...")
        sys.exit(1)

    # Install dependencies
    node_modules = os.path.join(server_dir, "node_modules")
    if not os.path.exists(node_modules):
        print("[1/2] Installing dependencies (1-2 min)...")
        r = subprocess.run(["npm", "install"], cwd=server_dir, shell=True)
        if r.returncode != 0:
            print("[ERROR] npm install failed!")
            input("Press Enter to exit...")
            sys.exit(1)
        print("[OK] Dependencies installed")
    else:
        print("[OK] Dependencies already installed")
    print()

    # Start server
    print("[2/2] Starting server...")
    print()
    port = os.environ.get("PORT", "8080")
    print("=" * 50)
    print(f"  Open browser: http://localhost:{port}")
    print("  Close this window to stop server")
    print("=" * 50)
    print()

    # Auto open browser
    def open_browser():
        time.sleep(2)
        webbrowser.open(f"http://localhost:{port}")
    threading.Thread(target=open_browser, daemon=True).start()

    # Start Node server
    subprocess.run(["node", "index.js"], cwd=server_dir)

if __name__ == "__main__":
    main()
