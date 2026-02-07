#!/usr/bin/env python3
"""
Gen3 Firmware Updater — Admin GUI
Launcher script. Run this to open the admin desktop application.

All tab modules, helpers, and dialogs live under the gui/ package.
"""

import sys
from pathlib import Path

# Ensure admin-tool directory is on the path
sys.path.insert(0, str(Path(__file__).parent))

from gui.app import AdminApp

if __name__ == "__main__":
    app = AdminApp()
    app.mainloop()
