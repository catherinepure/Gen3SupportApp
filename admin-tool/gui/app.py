"""
Gen3 Firmware Updater — Admin GUI Application
Main window with tabbed notebook for all admin functions.
"""

import tkinter as tk
from tkinter import ttk, messagebox

from gui.helpers import get_client, set_app_ref
from gui.tabs.distributors import DistributorTab
from gui.tabs.workshops import WorkshopsTab
from gui.tabs.users import UsersTab
from gui.tabs.scooters import ScooterTab
from gui.tabs.service_jobs import ServiceJobsTab
from gui.tabs.firmware import FirmwareTab
from gui.tabs.telemetry import TelemetryTab
from gui.tabs.logs import LogsTab
from gui.tabs.events import EventsTab
from gui.tabs.validation import ValidationTab
from gui.tabs.settings import SettingsTab


class AdminApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Gen3 Firmware Updater — Admin")
        self.geometry("1100x700")
        self.minsize(900, 550)

        # Register app ref for threaded callbacks
        set_app_ref(self)

        # Style
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Treeview", rowheight=26)
        style.configure("TNotebook.Tab", padding=[10, 4])
        style.configure("Header.TLabel", font=("Helvetica", 11, "bold"))
        style.configure("Status.TLabel", font=("Helvetica", 10))

        # Status bar
        self.status_var = tk.StringVar(value="Ready")
        status_bar = ttk.Label(self, textvariable=self.status_var,
                               style="Status.TLabel", relief="sunken", anchor="w")
        status_bar.pack(side="bottom", fill="x", padx=2, pady=2)

        # Notebook (tabs)
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=6, pady=6)

        # Create all tabs
        self.users_tab = UsersTab(self.notebook, self)
        self.scooter_tab = ScooterTab(self.notebook, self)
        self.dist_tab = DistributorTab(self.notebook, self)
        self.workshop_tab = WorkshopsTab(self.notebook, self)
        self.service_tab = ServiceJobsTab(self.notebook, self)
        self.firmware_tab = FirmwareTab(self.notebook, self)
        self.telemetry_tab = TelemetryTab(self.notebook, self)
        self.logs_tab = LogsTab(self.notebook, self)
        self.events_tab = EventsTab(self.notebook, self)
        self.validation_tab = ValidationTab(self.notebook, self)
        self.settings_tab = SettingsTab(self.notebook, self)

        # Add tabs in logical order
        self.notebook.add(self.users_tab, text="  Users  ")
        self.notebook.add(self.scooter_tab, text="  Scooters  ")
        self.notebook.add(self.dist_tab, text="  Distributors  ")
        self.notebook.add(self.workshop_tab, text="  Workshops  ")
        self.notebook.add(self.service_tab, text="  Service Jobs  ")
        self.notebook.add(self.firmware_tab, text="  Firmware  ")
        self.notebook.add(self.telemetry_tab, text="  Telemetry  ")
        self.notebook.add(self.logs_tab, text="  Upload Logs  ")
        self.notebook.add(self.events_tab, text="  Events  ")
        self.notebook.add(self.validation_tab, text="  Validation  ")
        self.notebook.add(self.settings_tab, text="  Settings  ")

        # Refresh on tab switch
        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_changed)

        # Initial load
        self.after(100, self._initial_load)

    def set_status(self, msg):
        self.status_var.set(msg)

    def _initial_load(self):
        try:
            get_client()
            self.set_status("Connected to Supabase")
            self.users_tab.refresh()
        except Exception as e:
            self.set_status("Not connected — configure Settings tab")
            self.notebook.select(self.settings_tab)
            messagebox.showwarning("Connection", str(e))

    def _on_tab_changed(self, event):
        tab = self.notebook.nametowidget(self.notebook.select())
        if hasattr(tab, "refresh"):
            tab.refresh()
