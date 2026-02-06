#!/usr/bin/env python3
"""
Gen3 Firmware Updater — Admin GUI
Manages distributors, scooters, firmware versions, and upload logs
via a desktop GUI backed by Supabase.
"""

import os
import sys
import secrets
import string
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, simpledialog
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Supabase helper
# ---------------------------------------------------------------------------

_supabase_client = None


def get_client():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    from supabase import create_client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"
        )
    _supabase_client = create_client(url, key)
    return _supabase_client


def generate_activation_code() -> str:
    chars = string.ascii_uppercase + string.digits
    p1 = "".join(secrets.choice(chars) for _ in range(4))
    p2 = "".join(secrets.choice(chars) for _ in range(4))
    return f"PURE-{p1}-{p2}"


# ---------------------------------------------------------------------------
# Threaded Supabase calls — keeps the GUI responsive
# ---------------------------------------------------------------------------

def run_in_thread(fn, callback=None, error_callback=None):
    """Run fn() in a background thread, then schedule callback on main thread."""
    def _worker():
        try:
            result = fn()
            if callback:
                app.after(0, lambda: callback(result))
        except Exception as e:
            err_msg = str(e)
            if error_callback:
                app.after(0, lambda msg=err_msg: error_callback(msg))
            else:
                app.after(0, lambda msg=err_msg: messagebox.showerror("Error", msg))
    threading.Thread(target=_worker, daemon=True).start()


# ============================================================================
# MAIN APPLICATION
# ============================================================================

class AdminApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Gen3 Firmware Updater — Admin")
        self.geometry("1000x650")
        self.minsize(800, 500)

        # Style
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Treeview", rowheight=26)
        style.configure("TNotebook.Tab", padding=[12, 4])
        style.configure("Header.TLabel", font=("Helvetica", 11, "bold"))
        style.configure("Status.TLabel", font=("Helvetica", 10))
        style.configure("Action.TButton", padding=[10, 4])

        # Status bar at the bottom
        self.status_var = tk.StringVar(value="Ready")
        status_bar = ttk.Label(self, textvariable=self.status_var,
                               style="Status.TLabel", relief="sunken", anchor="w")
        status_bar.pack(side="bottom", fill="x", padx=2, pady=2)

        # Notebook (tabs)
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=6, pady=6)

        # Create tabs
        self.dist_tab = DistributorTab(self.notebook, self)
        self.scooter_tab = ScooterTab(self.notebook, self)
        self.firmware_tab = FirmwareTab(self.notebook, self)
        self.telemetry_tab = TelemetryTab(self.notebook, self)
        self.logs_tab = LogsTab(self.notebook, self)
        self.settings_tab = SettingsTab(self.notebook, self)

        self.notebook.add(self.dist_tab, text="  Distributors  ")
        self.notebook.add(self.scooter_tab, text="  Scooters  ")
        self.notebook.add(self.firmware_tab, text="  Firmware  ")
        self.notebook.add(self.telemetry_tab, text="  Telemetry  ")
        self.notebook.add(self.logs_tab, text="  Upload Logs  ")
        self.notebook.add(self.settings_tab, text="  Settings  ")

        # Refresh when tab changes
        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_changed)

        # Initial load
        self.after(100, self._initial_load)

    def set_status(self, msg):
        self.status_var.set(msg)

    def _initial_load(self):
        try:
            get_client()
            self.set_status("Connected to Supabase")
            self.dist_tab.refresh()
        except Exception as e:
            self.set_status("Not connected — configure Settings tab")
            self.notebook.select(self.settings_tab)
            messagebox.showwarning("Connection", str(e))

    def _on_tab_changed(self, event):
        tab = self.notebook.nametowidget(self.notebook.select())
        if hasattr(tab, "refresh"):
            tab.refresh()


# ============================================================================
# DISTRIBUTORS TAB
# ============================================================================

class DistributorTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Add Distributor", style="Action.TButton",
                    command=self.add_distributor).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Edit", style="Action.TButton",
                    command=self.edit_distributor).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Regenerate Code", style="Action.TButton",
                    command=self.regenerate_code).pack(side="left", padx=2)
        self.toggle_btn = ttk.Button(toolbar, text="Deactivate", style="Action.TButton",
                    command=self.deactivate)
        self.toggle_btn.pack(side="left", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("name", "code", "active", "created", "id")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("name", text="Name")
        self.tree.heading("code", text="Activation Code")
        self.tree.heading("active", text="Active")
        self.tree.heading("created", text="Created")
        self.tree.heading("id", text="ID")
        self.tree.column("name", width=200)
        self.tree.column("code", width=180)
        self.tree.column("active", width=60, anchor="center")
        self.tree.column("created", width=100)
        self.tree.column("id", width=280)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        # Bind selection change to update button text
        self.tree.bind("<<TreeviewSelect>>", self._on_selection_changed)
        # Double-click to copy code
        self.tree.bind("<Double-1>", self._copy_code)

    def refresh(self):
        self.app.set_status("Loading distributors...")

        def fetch():
            sb = get_client()
            return sb.table("distributors").select("*").order("created_at").execute()

        def on_done(result):
            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                self.tree.insert("", "end", values=(
                    row["name"],
                    row["activation_code"],
                    "Yes" if row["is_active"] else "No",
                    row["created_at"][:10],
                    row["id"],
                ))
            self.app.set_status(f"Loaded {len(result.data)} distributors")

        run_in_thread(fetch, on_done)

    def add_distributor(self):
        dlg = AddDistributorDialog(self)
        self.wait_window(dlg)
        if dlg.result:
            name, custom_code = dlg.result
            code = custom_code if custom_code else generate_activation_code()
            self.app.set_status(f"Creating distributor '{name}'...")

            def create():
                sb = get_client()
                return sb.table("distributors").insert({
                    "name": name,
                    "activation_code": code,
                    "is_active": True,
                }).execute()

            def on_done(result):
                if result.data:
                    messagebox.showinfo("Created",
                        f"Distributor: {name}\nActivation Code: {code}\n\n"
                        "(Code copied to clipboard)")
                    self.app.clipboard_clear()
                    self.app.clipboard_append(code)
                    self.refresh()
                else:
                    messagebox.showerror("Error", "Failed to create distributor")

            run_in_thread(create, on_done)

    def regenerate_code(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a distributor first")
            return
        values = self.tree.item(sel[0], "values")
        name, old_code, _, _, dist_id = values
        new_code = generate_activation_code()

        if not messagebox.askyesno("Regenerate",
                f"Generate new code for '{name}'?\n"
                f"Old: {old_code}\nNew: {new_code}"):
            return

        def update():
            sb = get_client()
            sb.table("distributors").update({
                "activation_code": new_code,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", dist_id).execute()

        def on_done(_):
            messagebox.showinfo("Done",
                f"New code for '{name}':\n{new_code}\n\n(Copied to clipboard)")
            self.app.clipboard_clear()
            self.app.clipboard_append(new_code)
            self.refresh()

        run_in_thread(update, on_done)

    def edit_distributor(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a distributor first")
            return
        values = self.tree.item(sel[0], "values")
        current = {
            "name": values[0],
            "activation_code": values[1],
            "is_active": values[2] == "Yes",
            "id": values[4],
        }
        dlg = EditDistributorDialog(self, current)
        self.wait_window(dlg)
        if dlg.result:
            self.app.set_status("Updating distributor...")

            def update():
                sb = get_client()
                sb.table("distributors").update({
                    "name": dlg.result["name"],
                    "activation_code": dlg.result["activation_code"],
                    "is_active": dlg.result["is_active"],
                    "updated_at": datetime.utcnow().isoformat(),
                }).eq("id", current["id"]).execute()

            run_in_thread(update, lambda _: self.refresh())

    def deactivate(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a distributor first")
            return
        values = self.tree.item(sel[0], "values")
        name, _, is_active_text, _, dist_id = values

        # Check current state and toggle
        is_currently_active = (is_active_text == "Yes")
        new_state = not is_currently_active
        action_verb = "activate" if new_state else "deactivate"
        action_title = "Activate" if new_state else "Deactivate"

        if not messagebox.askyesno(action_title, f"{action_title} distributor '{name}'?"):
            return

        def update():
            sb = get_client()
            sb.table("distributors").update({"is_active": new_state}).eq("id", dist_id).execute()

        run_in_thread(update, lambda _: self.refresh())

    def _on_selection_changed(self, event):
        """Update toggle button text based on selected distributor's active state."""
        sel = self.tree.selection()
        if sel:
            values = self.tree.item(sel[0], "values")
            is_active_text = values[2]  # "Yes" or "No"
            if is_active_text == "Yes":
                self.toggle_btn.config(text="Deactivate")
            else:
                self.toggle_btn.config(text="Activate")
        else:
            self.toggle_btn.config(text="Deactivate")

    def _copy_code(self, event):
        sel = self.tree.selection()
        if sel:
            code = self.tree.item(sel[0], "values")[1]
            self.app.clipboard_clear()
            self.app.clipboard_append(code)
            self.app.set_status(f"Copied: {code}")


class EditDistributorDialog(tk.Toplevel):
    def __init__(self, parent, current):
        super().__init__(parent)
        self.title("Edit Distributor")
        self.geometry("420x230")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.result = None

        ttk.Label(self, text="Distributor Name:", style="Header.TLabel").pack(
            anchor="w", padx=12, pady=(12, 2))
        self.name_var = tk.StringVar(value=current["name"])
        ttk.Entry(self, textvariable=self.name_var, width=40).pack(padx=12, pady=2)

        ttk.Label(self, text="Activation Code:").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.code_var = tk.StringVar(value=current["activation_code"])
        ttk.Entry(self, textvariable=self.code_var, width=40).pack(padx=12, pady=2)

        self.active_var = tk.BooleanVar(value=current["is_active"])
        ttk.Checkbutton(self, text="Active", variable=self.active_var).pack(
            anchor="w", padx=12, pady=(8, 2))

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=12)
        ttk.Button(btn_frame, text="Save", command=self._ok).pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        self.bind("<Return>", lambda e: self._ok())

    def _ok(self):
        name = self.name_var.get().strip()
        code = self.code_var.get().strip()
        if not name:
            messagebox.showwarning("Required", "Enter a distributor name", parent=self)
            return
        if not code:
            messagebox.showwarning("Required", "Enter an activation code", parent=self)
            return
        self.result = {
            "name": name,
            "activation_code": code,
            "is_active": self.active_var.get(),
        }
        self.destroy()


class AddDistributorDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("Add Distributor")
        self.geometry("400x180")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.result = None

        ttk.Label(self, text="Distributor Name:", style="Header.TLabel").pack(
            anchor="w", padx=12, pady=(12, 2))
        self.name_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.name_var, width=40).pack(padx=12, pady=2)

        ttk.Label(self, text="Custom Code (leave blank to auto-generate):").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.code_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.code_var, width=40).pack(padx=12, pady=2)

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=12)
        ttk.Button(btn_frame, text="Create", command=self._ok).pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        self.bind("<Return>", lambda e: self._ok())

    def _ok(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showwarning("Required", "Enter a distributor name", parent=self)
            return
        self.result = (name, self.code_var.get().strip() or None)
        self.destroy()


# ============================================================================
# SCOOTERS TAB
# ============================================================================

class ScooterTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Add Scooter", style="Action.TButton",
                    command=self.add_scooter).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Add Batch", style="Action.TButton",
                    command=self.add_batch).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Edit", style="Action.TButton",
                    command=self.edit_scooter).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Remove", style="Action.TButton",
                    command=self.remove_scooter).pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Filter by distributor:").pack(side="left", padx=(12, 2))
        self.filter_var = tk.StringVar(value="All")
        self.filter_combo = ttk.Combobox(toolbar, textvariable=self.filter_var,
                                          state="readonly", width=25)
        self.filter_combo.pack(side="left", padx=2)
        self.filter_combo.bind("<<ComboboxSelected>>", lambda e: self.refresh())

        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("serial", "model", "hw_version", "distributor", "notes", "created")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("serial", text="ZYD Serial")
        self.tree.heading("model", text="Model")
        self.tree.heading("hw_version", text="HW Ver")
        self.tree.heading("distributor", text="Distributor")
        self.tree.heading("notes", text="Notes")
        self.tree.heading("created", text="Created")
        self.tree.column("serial", width=150)
        self.tree.column("model", width=110)
        self.tree.column("hw_version", width=70)
        self.tree.column("distributor", width=150)
        self.tree.column("notes", width=180)
        self.tree.column("created", width=100)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

    def refresh(self):
        self.app.set_status("Loading scooters...")

        def fetch():
            sb = get_client()
            # Also refresh distributor list for filter combo
            dists = sb.table("distributors").select("id, name").order("name").execute()
            dist_map = {d["id"]: d["name"] for d in dists.data}
            dist_names = ["All"] + sorted(dist_map.values())

            query = sb.table("scooters").select("*, distributors(name)")
            filter_name = self.filter_var.get()
            if filter_name and filter_name != "All":
                for did, dname in dist_map.items():
                    if dname == filter_name:
                        query = query.eq("distributor_id", did)
                        break

            result = query.order("created_at").execute()
            return result, dist_names

        def on_done(data):
            result, dist_names = data
            self.filter_combo["values"] = dist_names

            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                dist_info = row.get("distributors", {})
                dname = dist_info.get("name", "?") if isinstance(dist_info, dict) else "?"
                self.tree.insert("", "end", iid=row["id"], values=(
                    row["zyd_serial"],
                    row.get("model") or "",
                    row.get("hw_version") or "-",
                    dname,
                    row.get("notes") or "",
                    row["created_at"][:10],
                ))
            self.app.set_status(f"Loaded {len(result.data)} scooters")

        run_in_thread(fetch, on_done)

    def add_scooter(self):
        dlg = AddScooterDialog(self, self.app)
        self.wait_window(dlg)
        if dlg.result:
            self.refresh()

    def add_batch(self):
        dlg = AddBatchDialog(self, self.app)
        self.wait_window(dlg)
        if dlg.added > 0:
            self.refresh()

    def edit_scooter(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a scooter first")
            return
        scooter_id = sel[0]
        values = self.tree.item(sel[0], "values")
        current = {
            "id": scooter_id,
            "zyd_serial": values[0],
            "model": values[1],
            "distributor_name": values[2],
            "notes": values[3],
        }
        dlg = EditScooterDialog(self, self.app, current)
        self.wait_window(dlg)
        if dlg.result:
            self.refresh()

    def remove_scooter(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a scooter first")
            return
        values = self.tree.item(sel[0], "values")
        serial = values[0]
        scooter_id = sel[0]

        if not messagebox.askyesno("Remove", f"Remove scooter '{serial}'?"):
            return

        def delete():
            sb = get_client()
            sb.table("scooters").delete().eq("id", scooter_id).execute()

        run_in_thread(delete, lambda _: self.refresh())


class AddScooterDialog(tk.Toplevel):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.title("Add Scooter")
        self.geometry("420x320")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.result = None
        self.app = app

        ttk.Label(self, text="ZYD Serial Number:", style="Header.TLabel").pack(
            anchor="w", padx=12, pady=(12, 2))
        self.serial_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.serial_var, width=40).pack(padx=12, pady=2)

        ttk.Label(self, text="Distributor:").pack(anchor="w", padx=12, pady=(8, 2))
        self.dist_var = tk.StringVar()
        self.dist_combo = ttk.Combobox(self, textvariable=self.dist_var,
                                        state="readonly", width=37)
        self.dist_combo.pack(padx=12, pady=2)

        ttk.Label(self, text="Model (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.model_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.model_var, width=40).pack(padx=12, pady=2)

        ttk.Label(self, text="HW Version (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.hw_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.hw_var, width=20).pack(padx=12, pady=2)

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=12)
        ttk.Button(btn_frame, text="Add", command=self._ok).pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        # Load distributors
        self._load_distributors()

    def _load_distributors(self):
        def fetch():
            sb = get_client()
            return sb.table("distributors").select("id, name").eq(
                "is_active", True).order("name").execute()

        def on_done(result):
            self._dists = {d["name"]: d["id"] for d in result.data}
            self.dist_combo["values"] = list(self._dists.keys())
            if self._dists:
                self.dist_combo.current(0)

        run_in_thread(fetch, on_done)

    def _ok(self):
        serial = self.serial_var.get().strip()
        dist_name = self.dist_var.get()
        model = self.model_var.get().strip() or None
        hw_version = self.hw_var.get().strip() or None

        if not serial:
            messagebox.showwarning("Required", "Enter a serial number", parent=self)
            return
        if not dist_name or dist_name not in self._dists:
            messagebox.showwarning("Required", "Select a distributor", parent=self)
            return

        def create():
            sb = get_client()
            return sb.table("scooters").insert({
                "zyd_serial": serial,
                "distributor_id": self._dists[dist_name],
                "model": model,
                "hw_version": hw_version,
            }).execute()

        def on_done(result):
            if result.data:
                self.result = True
                self.destroy()
            else:
                messagebox.showerror("Error", "Failed to add scooter", parent=self)

        def on_error(msg):
            if "duplicate" in msg.lower() or "unique" in msg.lower():
                messagebox.showerror("Duplicate", f"Serial '{serial}' already exists",
                                     parent=self)
            else:
                messagebox.showerror("Error", msg, parent=self)

        run_in_thread(create, on_done, on_error)


class EditScooterDialog(tk.Toplevel):
    def __init__(self, parent, app, current):
        super().__init__(parent)
        self.title("Edit Scooter")
        self.geometry("420x360")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.result = None
        self.app = app
        self._current = current

        ttk.Label(self, text="ZYD Serial Number:", style="Header.TLabel").pack(
            anchor="w", padx=12, pady=(12, 2))
        self.serial_var = tk.StringVar(value=current["zyd_serial"])
        ttk.Entry(self, textvariable=self.serial_var, width=40).pack(padx=12, pady=2)

        ttk.Label(self, text="Distributor:").pack(anchor="w", padx=12, pady=(8, 2))
        self.dist_var = tk.StringVar()
        self.dist_combo = ttk.Combobox(self, textvariable=self.dist_var,
                                        state="readonly", width=37)
        self.dist_combo.pack(padx=12, pady=2)

        ttk.Label(self, text="Model (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.model_var = tk.StringVar(value=current["model"])
        ttk.Entry(self, textvariable=self.model_var, width=40).pack(padx=12, pady=2)

        ttk.Label(self, text="HW Version (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.hw_var = tk.StringVar(value=current.get("hw_version", ""))
        ttk.Entry(self, textvariable=self.hw_var, width=20).pack(padx=12, pady=2)

        ttk.Label(self, text="Notes (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.notes_var = tk.StringVar(value=current["notes"])
        ttk.Entry(self, textvariable=self.notes_var, width=40).pack(padx=12, pady=2)

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=12)
        ttk.Button(btn_frame, text="Save", command=self._ok).pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        self.bind("<Return>", lambda e: self._ok())
        self._load_distributors()

    def _load_distributors(self):
        def fetch():
            sb = get_client()
            return sb.table("distributors").select("id, name").eq(
                "is_active", True).order("name").execute()

        def on_done(result):
            self._dists = {d["name"]: d["id"] for d in result.data}
            self.dist_combo["values"] = list(self._dists.keys())
            # Pre-select current distributor
            current_name = self._current["distributor_name"]
            names = list(self._dists.keys())
            if current_name in names:
                self.dist_combo.current(names.index(current_name))
            elif names:
                self.dist_combo.current(0)

        run_in_thread(fetch, on_done)

    def _ok(self):
        serial = self.serial_var.get().strip()
        dist_name = self.dist_var.get()
        model = self.model_var.get().strip() or None
        hw_version = self.hw_var.get().strip() or None
        notes = self.notes_var.get().strip() or None

        if not serial:
            messagebox.showwarning("Required", "Enter a serial number", parent=self)
            return
        if not dist_name or dist_name not in self._dists:
            messagebox.showwarning("Required", "Select a distributor", parent=self)
            return

        scooter_id = self._current["id"]

        def update():
            sb = get_client()
            return sb.table("scooters").update({
                "zyd_serial": serial,
                "distributor_id": self._dists[dist_name],
                "model": model,
                "hw_version": hw_version,
                "notes": notes,
            }).eq("id", scooter_id).execute()

        def on_done(result):
            self.result = True
            self.destroy()

        def on_error(msg):
            if "duplicate" in msg.lower() or "unique" in msg.lower():
                messagebox.showerror("Duplicate", f"Serial '{serial}' already exists",
                                     parent=self)
            else:
                messagebox.showerror("Error", msg, parent=self)

        run_in_thread(update, on_done, on_error)


class AddBatchDialog(tk.Toplevel):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.title("Add Scooters — Batch")
        self.geometry("480x400")
        self.resizable(True, True)
        self.transient(parent)
        self.grab_set()
        self.app = app
        self.added = 0

        ttk.Label(self, text="Distributor:").pack(anchor="w", padx=12, pady=(12, 2))
        self.dist_var = tk.StringVar()
        self.dist_combo = ttk.Combobox(self, textvariable=self.dist_var,
                                        state="readonly", width=37)
        self.dist_combo.pack(padx=12, pady=2, anchor="w")

        ttk.Label(self, text="Model (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.model_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.model_var, width=40).pack(padx=12, pady=2, anchor="w")

        ttk.Label(self, text="HW Version (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.hw_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.hw_var, width=20).pack(padx=12, pady=2, anchor="w")

        ttk.Label(self, text="Serial numbers (one per line):",
                  style="Header.TLabel").pack(anchor="w", padx=12, pady=(12, 2))
        self.text = tk.Text(self, width=50, height=10)
        self.text.pack(fill="both", expand=True, padx=12, pady=2)

        self.result_var = tk.StringVar()
        ttk.Label(self, textvariable=self.result_var).pack(anchor="w", padx=12, pady=2)

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=8)
        ttk.Button(btn_frame, text="Add All", command=self._ok).pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Close", command=self.destroy).pack(side="right")

        self._load_distributors()

    def _load_distributors(self):
        def fetch():
            sb = get_client()
            return sb.table("distributors").select("id, name").eq(
                "is_active", True).order("name").execute()

        def on_done(result):
            self._dists = {d["name"]: d["id"] for d in result.data}
            self.dist_combo["values"] = list(self._dists.keys())
            if self._dists:
                self.dist_combo.current(0)

        run_in_thread(fetch, on_done)

    def _ok(self):
        dist_name = self.dist_var.get()
        model = self.model_var.get().strip() or None
        hw_version = self.hw_var.get().strip() or None
        serials = [s.strip() for s in self.text.get("1.0", "end").strip().split("\n") if s.strip()]

        if not dist_name or dist_name not in self._dists:
            messagebox.showwarning("Required", "Select a distributor", parent=self)
            return
        if not serials:
            messagebox.showwarning("Required", "Enter at least one serial number", parent=self)
            return

        dist_id = self._dists[dist_name]

        def create_all():
            sb = get_client()
            added = 0
            skipped = 0
            for serial in serials:
                existing = sb.table("scooters").select("id").eq("zyd_serial", serial).execute()
                if existing.data:
                    skipped += 1
                    continue
                sb.table("scooters").insert({
                    "zyd_serial": serial,
                    "distributor_id": dist_id,
                    "model": model,
                    "hw_version": hw_version,
                }).execute()
                added += 1
            return added, skipped

        def on_done(result):
            added, skipped = result
            self.added = added
            self.result_var.set(f"Added: {added}, Skipped (duplicates): {skipped}")
            if added > 0:
                messagebox.showinfo("Done",
                    f"Added {added} scooters, skipped {skipped}", parent=self)

        self.result_var.set("Processing...")
        run_in_thread(create_all, on_done)


# ============================================================================
# FIRMWARE TAB
# ============================================================================

class FirmwareTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Upload Firmware", style="Action.TButton",
                    command=self.upload_firmware).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Edit", style="Action.TButton",
                    command=self.edit_firmware).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Deactivate", style="Action.TButton",
                    command=self.deactivate).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("version", "hw", "access", "min_sw", "file", "size", "active", "created", "notes")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("version", text="Version")
        self.tree.heading("hw", text="Target HW")
        self.tree.heading("access", text="Access")
        self.tree.heading("min_sw", text="Min SW")
        self.tree.heading("file", text="File Path")
        self.tree.heading("size", text="Size")
        self.tree.heading("active", text="Active")
        self.tree.heading("created", text="Created")
        self.tree.heading("notes", text="Release Notes")
        self.tree.column("version", width=80)
        self.tree.column("hw", width=120)
        self.tree.column("access", width=80)
        self.tree.column("min_sw", width=70)
        self.tree.column("file", width=150)
        self.tree.column("size", width=80)
        self.tree.column("active", width=55, anchor="center")
        self.tree.column("created", width=90)
        self.tree.column("notes", width=180)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

    def refresh(self):
        self.app.set_status("Loading firmware versions...")

        def fetch():
            sb = get_client()
            result = sb.table("firmware_versions").select("*").order(
                "created_at", desc=True).execute()

            # Fetch HW targets for each firmware
            hw_targets_map = {}
            for fw in result.data:
                targets_result = sb.table("firmware_hw_targets").select("hw_version").eq(
                    "firmware_version_id", fw["id"]).execute()
                hw_versions = [t["hw_version"] for t in targets_result.data]
                hw_targets_map[fw["id"]] = ", ".join(hw_versions) if hw_versions else "-"

            return result, hw_targets_map

        def on_done(data):
            result, hw_targets_map = data
            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                size = row.get("file_size_bytes") or 0
                size_str = f"{size / 1024:.1f} KB" if size > 0 else "?"
                access_level = row.get("access_level", "distributor")
                hw_targets = hw_targets_map.get(row["id"], "-")

                self.tree.insert("", "end", iid=row["id"], values=(
                    row["version_label"],
                    hw_targets,
                    access_level,
                    row.get("min_sw_version") or "-",
                    row["file_path"],
                    size_str,
                    "Yes" if row["is_active"] else "No",
                    row["created_at"][:10],
                    row.get("release_notes") or "",
                ))
            self.app.set_status(f"Loaded {len(result.data)} firmware versions")

        run_in_thread(fetch, on_done)

    def upload_firmware(self):
        dlg = UploadFirmwareDialog(self, self.app)
        self.wait_window(dlg)
        if dlg.result:
            self.refresh()

    def edit_firmware(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a firmware version first")
            return
        fw_id = sel[0]
        values = self.tree.item(sel[0], "values")

        # Fetch current HW targets
        sb = get_client()
        targets_result = sb.table("firmware_hw_targets").select("hw_version").eq(
            "firmware_version_id", fw_id).execute()
        hw_targets = [t["hw_version"] for t in targets_result.data]

        current = {
            "id": fw_id,
            "version_label": values[0],
            "hw_targets": hw_targets,
            "access_level": values[2],
            "min_sw_version": values[3] if values[3] != "-" else "",
            "is_active": values[6] == "Yes",
            "release_notes": values[8],
        }
        dlg = EditFirmwareDialog(self, current)
        self.wait_window(dlg)
        if dlg.result:
            self.app.set_status("Updating firmware...")

            def update():
                sb = get_client()
                # Update firmware_versions table
                fw_update = {
                    "version_label": dlg.result["version_label"],
                    "min_sw_version": dlg.result.get("min_sw_version") or None,
                    "release_notes": dlg.result.get("release_notes") or None,
                    "access_level": dlg.result["access_level"],
                    "is_active": dlg.result["is_active"],
                }
                sb.table("firmware_versions").update(fw_update).eq("id", fw_id).execute()

                # Update HW targets if changed
                new_hw_targets = dlg.result.get("hw_targets", [])
                if new_hw_targets != hw_targets:
                    # Delete all existing targets
                    sb.table("firmware_hw_targets").delete().eq("firmware_version_id", fw_id).execute()
                    # Insert new targets
                    for hw_ver in new_hw_targets:
                        sb.table("firmware_hw_targets").insert({
                            "firmware_version_id": fw_id,
                            "hw_version": hw_ver,
                        }).execute()

            run_in_thread(update, lambda _: self.refresh())

    def deactivate(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a firmware version first")
            return
        values = self.tree.item(sel[0], "values")
        version = values[0]
        fw_id = sel[0]

        if not messagebox.askyesno("Deactivate",
                f"Deactivate firmware '{version}'?\nIt will no longer be offered to devices."):
            return

        def update():
            sb = get_client()
            sb.table("firmware_versions").update({"is_active": False}).eq("id", fw_id).execute()

        run_in_thread(update, lambda _: self.refresh())


class EditFirmwareDialog(tk.Toplevel):
    def __init__(self, parent, current):
        super().__init__(parent)
        self.title("Edit Firmware Version")
        self.geometry("520x420")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.result = None

        ttk.Label(self, text="Version Label:", style="Header.TLabel").pack(
            anchor="w", padx=12, pady=(12, 2))
        self.version_var = tk.StringVar(value=current["version_label"])
        ttk.Entry(self, textvariable=self.version_var, width=20).pack(
            anchor="w", padx=12, pady=2)

        ttk.Label(self, text="Target HW Versions (comma-separated):").pack(
            anchor="w", padx=12, pady=(8, 2))
        hw_str = ", ".join(current.get("hw_targets", []))
        self.hw_var = tk.StringVar(value=hw_str)
        ttk.Entry(self, textvariable=self.hw_var, width=40).pack(
            anchor="w", padx=12, pady=2)
        ttk.Label(self, text="e.g., V1.0, V1.1, V2.0", foreground="gray").pack(
            anchor="w", padx=12)

        ttk.Label(self, text="Access Level:").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.access_var = tk.StringVar(value=current.get("access_level", "distributor"))
        access_frame = ttk.Frame(self)
        access_frame.pack(anchor="w", padx=12, pady=2)
        ttk.Radiobutton(access_frame, text="Public (anyone)", variable=self.access_var,
                        value="public").pack(side="left", padx=(0, 10))
        ttk.Radiobutton(access_frame, text="Distributor (auth required)", variable=self.access_var,
                        value="distributor").pack(side="left")

        ttk.Label(self, text="Min SW Version (optional):").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.min_sw_var = tk.StringVar(value=current["min_sw_version"])
        ttk.Entry(self, textvariable=self.min_sw_var, width=20).pack(
            anchor="w", padx=12, pady=2)

        ttk.Label(self, text="Release Notes (optional):").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.notes_var = tk.StringVar(value=current["release_notes"])
        ttk.Entry(self, textvariable=self.notes_var, width=60).pack(
            anchor="w", padx=12, pady=2)

        self.active_var = tk.BooleanVar(value=current["is_active"])
        ttk.Checkbutton(self, text="Active", variable=self.active_var).pack(
            anchor="w", padx=12, pady=(8, 2))

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=12)
        ttk.Button(btn_frame, text="Save", command=self._ok).pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        self.bind("<Return>", lambda e: self._ok())

    def _ok(self):
        version = self.version_var.get().strip()
        hw_input = self.hw_var.get().strip()
        if not version or not hw_input:
            messagebox.showwarning("Required",
                "Enter version label and at least one HW version", parent=self)
            return

        # Parse HW versions
        hw_targets = [v.strip() for v in hw_input.split(",") if v.strip()]
        if not hw_targets:
            messagebox.showwarning("Required",
                "Enter at least one hardware version", parent=self)
            return

        self.result = {
            "version_label": version,
            "hw_targets": hw_targets,
            "access_level": self.access_var.get(),
            "min_sw_version": self.min_sw_var.get().strip() or None,
            "release_notes": self.notes_var.get().strip() or None,
            "is_active": self.active_var.get(),
        }
        self.destroy()


class UploadFirmwareDialog(tk.Toplevel):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.title("Upload Firmware")
        self.geometry("540x440")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.app = app
        self.result = None
        self._file_path = None

        # File selection
        file_frame = ttk.Frame(self)
        file_frame.pack(fill="x", padx=12, pady=(12, 2))
        ttk.Label(file_frame, text="Firmware File (.bin):", style="Header.TLabel").pack(
            anchor="w")
        file_row = ttk.Frame(file_frame)
        file_row.pack(fill="x", pady=2)
        self.file_var = tk.StringVar(value="No file selected")
        ttk.Label(file_row, textvariable=self.file_var, width=45).pack(side="left")
        ttk.Button(file_row, text="Browse...", command=self._browse).pack(side="right")

        self.size_var = tk.StringVar()
        ttk.Label(self, textvariable=self.size_var).pack(anchor="w", padx=12)

        # Version label
        ttk.Label(self, text="Version Label (e.g. V2.3):").pack(
            anchor="w", padx=12, pady=(12, 2))
        self.version_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.version_var, width=20).pack(
            anchor="w", padx=12, pady=2)

        # Target HW versions
        ttk.Label(self, text="Target HW Versions (comma-separated):").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.hw_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.hw_var, width=40).pack(
            anchor="w", padx=12, pady=2)
        ttk.Label(self, text="e.g., V1.0, V1.1, V2.0", foreground="gray").pack(
            anchor="w", padx=12)

        # Access level
        ttk.Label(self, text="Access Level:").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.access_var = tk.StringVar(value="distributor")
        access_frame = ttk.Frame(self)
        access_frame.pack(anchor="w", padx=12, pady=2)
        ttk.Radiobutton(access_frame, text="Public (anyone)", variable=self.access_var,
                        value="public").pack(side="left", padx=(0, 10))
        ttk.Radiobutton(access_frame, text="Distributor (auth required)", variable=self.access_var,
                        value="distributor").pack(side="left")

        # Min SW version (optional)
        ttk.Label(self, text="Min SW Version (optional):").pack(
            anchor="w", padx=12, pady=(8, 2))
        self.min_sw_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.min_sw_var, width=20).pack(
            anchor="w", padx=12, pady=2)

        # Buttons
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=12)
        self.upload_btn = ttk.Button(btn_frame, text="Upload", command=self._upload)
        self.upload_btn.pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        self.progress_var = tk.StringVar()
        ttk.Label(self, textvariable=self.progress_var).pack(anchor="w", padx=12)

    def _browse(self):
        path = filedialog.askopenfilename(
            title="Select Firmware Binary",
            filetypes=[("Binary files", "*.bin"), ("All files", "*.*")],
        )
        if path:
            self._file_path = Path(path)
            self.file_var.set(self._file_path.name)
            size = self._file_path.stat().st_size
            self.size_var.set(f"Size: {size / 1024:.1f} KB ({size} bytes)")

    def _upload(self):
        if not self._file_path or not self._file_path.exists():
            messagebox.showwarning("Required", "Select a firmware file", parent=self)
            return
        version = self.version_var.get().strip()
        hw_input = self.hw_var.get().strip()
        if not version or not hw_input:
            messagebox.showwarning("Required",
                "Enter version label and at least one HW version", parent=self)
            return

        # Parse HW versions
        hw_versions = [v.strip() for v in hw_input.split(",") if v.strip()]
        if not hw_versions:
            messagebox.showwarning("Required",
                "Enter at least one hardware version", parent=self)
            return

        min_sw = self.min_sw_var.get().strip() or None
        access_level = self.access_var.get()
        file_size = self._file_path.stat().st_size

        if file_size < 1024:
            messagebox.showerror("Error", "File too small (< 1KB)", parent=self)
            return
        if file_size > 512 * 1024:
            messagebox.showerror("Error", "File too large (> 512KB)", parent=self)
            return

        self.upload_btn.config(state="disabled")
        self.progress_var.set("Uploading to storage...")

        storage_path = self._file_path.name
        with open(self._file_path, "rb") as f:
            file_data = f.read()

        def do_upload():
            sb = get_client()

            # Upload to storage
            try:
                sb.storage.from_("firmware-binaries").upload(
                    storage_path, file_data,
                    file_options={"content-type": "application/octet-stream"},
                )
            except Exception as e:
                if "Duplicate" in str(e) or "already exists" in str(e):
                    sb.storage.from_("firmware-binaries").update(
                        storage_path, file_data,
                        file_options={"content-type": "application/octet-stream"},
                    )
                else:
                    raise

            # Create DB record
            result = sb.table("firmware_versions").insert({
                "version_label": version,
                "file_path": storage_path,
                "file_size_bytes": file_size,
                "target_hw_version": hw_versions[0],  # Use first HW version as primary
                "min_sw_version": min_sw,
                "access_level": access_level,
                "is_active": True,
            }).execute()

            if result.data:
                firmware_id = result.data[0]["id"]
                # Create HW target mappings
                for hw_ver in hw_versions:
                    sb.table("firmware_hw_targets").insert({
                        "firmware_version_id": firmware_id,
                        "hw_version": hw_ver,
                    }).execute()

            return result

        def on_done(result):
            if result.data:
                self.result = True
                hw_list = ", ".join(hw_versions)
                messagebox.showinfo("Uploaded",
                    f"Firmware {version} uploaded successfully\n"
                    f"Target HW: {hw_list}\n"
                    f"Access: {access_level}\n"
                    f"Size: {file_size / 1024:.1f} KB",
                    parent=self)
                self.destroy()
            else:
                self.upload_btn.config(state="normal")
                self.progress_var.set("Failed")
                messagebox.showerror("Error", "Failed to create record", parent=self)

        def on_error(msg):
            self.upload_btn.config(state="normal")
            self.progress_var.set("Failed")
            messagebox.showerror("Upload Error", msg, parent=self)

        run_in_thread(do_upload, on_done, on_error)


# ============================================================================
# TELEMETRY TAB
# ============================================================================

class TelemetryTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Label(toolbar, text="Filter by ZYD:").pack(side="left", padx=(4, 2))
        self.zyd_filter = tk.StringVar()
        ttk.Entry(toolbar, textvariable=self.zyd_filter, width=15).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Filter", command=self.refresh).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Clear", command=self.clear_filter).pack(side="left", padx=2)

        ttk.Button(toolbar, text="Stats", command=self.show_stats).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("captured", "zyd", "hw", "sw", "odometer", "battery", "notes")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("captured", text="Captured")
        self.tree.heading("zyd", text="ZYD Serial")
        self.tree.heading("hw", text="HW Ver")
        self.tree.heading("sw", text="SW Ver")
        self.tree.heading("odometer", text="Odometer (km)")
        self.tree.heading("battery", text="Battery Cycles")
        self.tree.heading("notes", text="Notes")
        self.tree.column("captured", width=130)
        self.tree.column("zyd", width=120)
        self.tree.column("hw", width=70)
        self.tree.column("sw", width=70)
        self.tree.column("odometer", width=100, anchor="e")
        self.tree.column("battery", width=100, anchor="e")
        self.tree.column("notes", width=250)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

    def refresh(self):
        self.app.set_status("Loading telemetry data...")

        def fetch():
            sb = get_client()
            query = sb.table("telemetry_snapshots").select("*")
            zyd = self.zyd_filter.get().strip()
            if zyd:
                query = query.eq("zyd_serial", zyd)

            return query.order("captured_at", desc=True).limit(100).execute()

        def on_done(result):
            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                self.tree.insert("", "end", values=(
                    row["captured_at"][:16].replace("T", " "),
                    row["zyd_serial"],
                    row.get("hw_version") or "-",
                    row.get("sw_version") or "-",
                    f"{row['odometer_km']:.1f}" if row.get("odometer_km") else "-",
                    str(row["battery_cycles"]) if row.get("battery_cycles") else "-",
                    (row.get("notes") or "")[:50],
                ))
            self.app.set_status(f"Loaded {len(result.data)} telemetry snapshots")

        run_in_thread(fetch, on_done)

    def clear_filter(self):
        self.zyd_filter.set("")
        self.refresh()

    def show_stats(self):
        def fetch():
            sb = get_client()
            return sb.table("telemetry_snapshots").select("*").execute()

        def on_done(result):
            total = len(result.data)
            if total == 0:
                messagebox.showinfo("Stats", "No telemetry data yet")
                return

            unique_scooters = len(set(row["zyd_serial"] for row in result.data))
            hw_versions = {}
            sw_versions = {}
            total_odometer = 0
            odometer_count = 0
            total_battery = 0
            battery_count = 0

            for row in result.data:
                hw = row.get("hw_version")
                if hw:
                    hw_versions[hw] = hw_versions.get(hw, 0) + 1

                sw = row.get("sw_version")
                if sw:
                    sw_versions[sw] = sw_versions.get(sw, 0) + 1

                if row.get("odometer_km"):
                    total_odometer += float(row["odometer_km"])
                    odometer_count += 1

                if row.get("battery_cycles"):
                    total_battery += int(row["battery_cycles"])
                    battery_count += 1

            avg_odometer = total_odometer / odometer_count if odometer_count > 0 else 0
            avg_battery = total_battery / battery_count if battery_count > 0 else 0

            hw_str = "\n".join(f"  {hw}: {count}" for hw, count in sorted(hw_versions.items()))
            sw_str = "\n".join(f"  {sw}: {count}" for sw, count in sorted(sw_versions.items()))

            messagebox.showinfo("Telemetry Statistics",
                f"Total snapshots:      {total}\n"
                f"Unique scooters:      {unique_scooters}\n"
                f"Avg odometer (km):    {avg_odometer:.1f}\n"
                f"Avg battery cycles:   {avg_battery:.0f}\n\n"
                f"HW Versions:\n{hw_str}\n\n"
                f"SW Versions:\n{sw_str}")

        run_in_thread(fetch, on_done)


# ============================================================================
# UPLOAD LOGS TAB
# ============================================================================

class LogsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Label(toolbar, text="Status:").pack(side="left", padx=(4, 2))
        self.status_filter = tk.StringVar(value="All")
        status_combo = ttk.Combobox(toolbar, textvariable=self.status_filter,
                                     state="readonly", width=12,
                                     values=["All", "completed", "failed", "started"])
        status_combo.pack(side="left", padx=2)
        status_combo.bind("<<ComboboxSelected>>", lambda e: self.refresh())

        ttk.Label(toolbar, text="  Distributor:").pack(side="left", padx=(8, 2))
        self.dist_filter = tk.StringVar(value="All")
        self.dist_combo = ttk.Combobox(toolbar, textvariable=self.dist_filter,
                                        state="readonly", width=25)
        self.dist_combo.pack(side="left", padx=2)
        self.dist_combo.bind("<<ComboboxSelected>>", lambda e: self.refresh())

        ttk.Button(toolbar, text="Stats", command=self.show_stats).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("date", "serial", "firmware", "distributor", "old_sw", "status", "error")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("date", text="Date")
        self.tree.heading("serial", text="Scooter")
        self.tree.heading("firmware", text="Firmware")
        self.tree.heading("distributor", text="Distributor")
        self.tree.heading("old_sw", text="Old SW")
        self.tree.heading("status", text="Status")
        self.tree.heading("error", text="Error")
        self.tree.column("date", width=130)
        self.tree.column("serial", width=140)
        self.tree.column("firmware", width=80)
        self.tree.column("distributor", width=150)
        self.tree.column("old_sw", width=70)
        self.tree.column("status", width=80)
        self.tree.column("error", width=250)

        # Color tags
        self.tree.tag_configure("completed", foreground="#2E7D32")
        self.tree.tag_configure("failed", foreground="#C62828")
        self.tree.tag_configure("started", foreground="#EF6C00")

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

    def refresh(self):
        self.app.set_status("Loading upload logs...")

        def fetch():
            sb = get_client()

            # Refresh distributor list for filter
            dists = sb.table("distributors").select("id, name").order("name").execute()
            dist_map = {d["id"]: d["name"] for d in dists.data}
            dist_names = ["All"] + sorted(dist_map.values())

            query = sb.table("firmware_uploads").select(
                "*, scooters(zyd_serial), firmware_versions(version_label), distributors(name)"
            )

            status_val = self.status_filter.get()
            if status_val and status_val != "All":
                query = query.eq("status", status_val)

            dist_name = self.dist_filter.get()
            if dist_name and dist_name != "All":
                for did, dname in dist_map.items():
                    if dname == dist_name:
                        query = query.eq("distributor_id", did)
                        break

            result = query.order("started_at", desc=True).limit(100).execute()
            return result, dist_names

        def on_done(data):
            result, dist_names = data
            self.dist_combo["values"] = dist_names

            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                serial_obj = row.get("scooters", {})
                serial = serial_obj.get("zyd_serial", "?") if isinstance(serial_obj, dict) else "?"

                fw_obj = row.get("firmware_versions", {})
                fw = fw_obj.get("version_label", "?") if isinstance(fw_obj, dict) else "?"

                dist_obj = row.get("distributors", {})
                dname = dist_obj.get("name", "?") if isinstance(dist_obj, dict) else "?"

                status_val = row.get("status", "?")
                tag = status_val if status_val in ("completed", "failed", "started") else ""

                self.tree.insert("", "end", values=(
                    (row.get("started_at") or "")[:16].replace("T", " "),
                    serial,
                    fw,
                    dname,
                    row.get("old_sw_version") or "-",
                    status_val,
                    (row.get("error_message") or "")[:60],
                ), tags=(tag,))

            self.app.set_status(f"Loaded {len(result.data)} upload logs")

        run_in_thread(fetch, on_done)

    def show_stats(self):
        def fetch():
            sb = get_client()
            return sb.table("firmware_uploads").select("status").execute()

        def on_done(result):
            total = len(result.data)
            completed = sum(1 for r in result.data if r["status"] == "completed")
            failed = sum(1 for r in result.data if r["status"] == "failed")
            started = sum(1 for r in result.data if r["status"] == "started")
            rate = f"{completed / total * 100:.1f}%" if total > 0 else "N/A"

            messagebox.showinfo("Upload Statistics",
                f"Total uploads:    {total}\n"
                f"Completed:        {completed}\n"
                f"Failed:           {failed}\n"
                f"In progress:      {started}\n"
                f"Success rate:     {rate}")

        run_in_thread(fetch, on_done)


# ============================================================================
# SETTINGS TAB
# ============================================================================

class SettingsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        inner = ttk.Frame(self)
        inner.pack(padx=20, pady=20, anchor="nw")

        ttk.Label(inner, text="Supabase Connection",
                  style="Header.TLabel").grid(row=0, column=0, columnspan=2, pady=(0, 12),
                                              sticky="w")

        ttk.Label(inner, text="Supabase URL:").grid(row=1, column=0, sticky="w", pady=4)
        self.url_var = tk.StringVar(value=os.getenv("SUPABASE_URL", ""))
        ttk.Entry(inner, textvariable=self.url_var, width=60).grid(
            row=1, column=1, padx=8, pady=4)

        ttk.Label(inner, text="Service Role Key:").grid(row=2, column=0, sticky="w", pady=4)
        self.key_var = tk.StringVar(value=os.getenv("SUPABASE_SERVICE_KEY", ""))
        self.key_entry = ttk.Entry(inner, textvariable=self.key_var, width=60, show="*")
        self.key_entry.grid(row=2, column=1, padx=8, pady=4)

        self.show_key_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(inner, text="Show key", variable=self.show_key_var,
                         command=self._toggle_key).grid(row=3, column=1, sticky="w", padx=8)

        btn_frame = ttk.Frame(inner)
        btn_frame.grid(row=4, column=0, columnspan=2, pady=16, sticky="w")
        ttk.Button(btn_frame, text="Test Connection", style="Action.TButton",
                    command=self.test_connection).pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Save to .env", style="Action.TButton",
                    command=self.save_env).pack(side="left", padx=4)

        self.status_label = ttk.Label(inner, text="")
        self.status_label.grid(row=5, column=0, columnspan=2, sticky="w")

        # Info
        ttk.Label(inner, text="\nNote: Use the Service Role key (not the anon key).\n"
                  "Found in Supabase Dashboard > Settings > API.",
                  foreground="gray").grid(row=6, column=0, columnspan=2, sticky="w", pady=8)

    def _toggle_key(self):
        self.key_entry.config(show="" if self.show_key_var.get() else "*")

    def test_connection(self):
        global _supabase_client
        _supabase_client = None

        url = self.url_var.get().strip()
        key = self.key_var.get().strip()

        if not url or not key:
            self.status_label.config(text="Enter URL and key first", foreground="red")
            return

        os.environ["SUPABASE_URL"] = url
        os.environ["SUPABASE_SERVICE_KEY"] = key

        self.status_label.config(text="Testing...", foreground="gray")

        def test():
            sb = get_client()
            return sb.table("distributors").select("id").limit(1).execute()

        def on_done(result):
            self.status_label.config(text="Connected successfully!", foreground="green")
            self.app.set_status("Connected to Supabase")

        def on_error(msg):
            self.status_label.config(text=f"Failed: {msg}", foreground="red")

        run_in_thread(test, on_done, on_error)

    def save_env(self):
        url = self.url_var.get().strip()
        key = self.key_var.get().strip()

        env_path = Path(__file__).parent / ".env"
        with open(env_path, "w") as f:
            f.write(f"SUPABASE_URL={url}\n")
            f.write(f"SUPABASE_SERVICE_KEY={key}\n")

        self.status_label.config(text=f"Saved to {env_path}", foreground="green")


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    app = AdminApp()
    app.mainloop()
