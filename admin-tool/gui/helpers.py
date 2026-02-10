"""
Shared helpers for the Pure eScooter Admin GUI.
Supabase client, threading, code generation, FK resolution, CSV export.
"""

import csv
import os
import secrets
import string
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Supabase client singleton
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


def reset_client():
    """Force reconnection on next get_client() call."""
    global _supabase_client
    _supabase_client = None


def generate_activation_code() -> str:
    chars = string.ascii_uppercase + string.digits
    p1 = "".join(secrets.choice(chars) for _ in range(4))
    p2 = "".join(secrets.choice(chars) for _ in range(4))
    return f"PURE-{p1}-{p2}"


# ---------------------------------------------------------------------------
# FK join safety
# ---------------------------------------------------------------------------

def resolve_fk(row, fk_field, name_field="name"):
    """Safely extract a name from a Supabase foreign-key join object."""
    obj = row.get(fk_field)
    if isinstance(obj, dict):
        return obj.get(name_field, "-")
    return "-"


# ---------------------------------------------------------------------------
# Threaded Supabase calls — keeps the GUI responsive
# ---------------------------------------------------------------------------

# Set by AdminApp on startup so threads can schedule callbacks
_app_ref = None


def set_app_ref(app):
    global _app_ref
    _app_ref = app


def run_in_thread(fn, callback=None, error_callback=None):
    """Run fn() in a background thread, then schedule callback on main thread."""
    def _worker():
        try:
            result = fn()
            if callback and _app_ref:
                _app_ref.after(0, lambda: callback(result))
        except Exception as e:
            err_msg = str(e)
            if error_callback and _app_ref:
                _app_ref.after(0, lambda msg=err_msg: error_callback(msg))
            elif _app_ref:
                _app_ref.after(0, lambda msg=err_msg: messagebox.showerror("Error", msg))
    threading.Thread(target=_worker, daemon=True).start()


# ---------------------------------------------------------------------------
# CSV export helper
# ---------------------------------------------------------------------------

def export_to_csv(headers, rows, default_name="export.csv"):
    """Ask user for save location and write CSV. Returns True on success."""
    path = filedialog.asksaveasfilename(
        defaultextension=".csv",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        initialfile=default_name,
    )
    if not path:
        return False

    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

    messagebox.showinfo("Exported", f"Exported {len(rows)} rows to:\n{path}")
    return True


# ---------------------------------------------------------------------------
# Shared select constants
# ---------------------------------------------------------------------------

USER_SELECT = "*, distributors(name), workshops(name)"

SERVICE_JOB_SELECT = (
    "*, scooters(zyd_serial, model), workshops(name), "
    "users!service_jobs_customer_id_fkey(email, first_name, last_name)"
)
