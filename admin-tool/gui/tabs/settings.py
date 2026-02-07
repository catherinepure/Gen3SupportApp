"""Settings tab — Supabase connection configuration."""

import os
import tkinter as tk
from tkinter import ttk
from pathlib import Path

from gui.helpers import get_client, reset_client, run_in_thread


class SettingsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        inner = ttk.Frame(self)
        inner.pack(padx=20, pady=20, anchor="nw")

        ttk.Label(inner, text="Supabase Connection",
                  font=("Helvetica", 11, "bold")).grid(
            row=0, column=0, columnspan=2, pady=(0, 12), sticky="w")

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
        ttk.Button(btn_frame, text="Test Connection",
                   command=self.test_connection).pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Save to .env",
                   command=self.save_env).pack(side="left", padx=4)

        self.status_label = ttk.Label(inner, text="")
        self.status_label.grid(row=5, column=0, columnspan=2, sticky="w")

        ttk.Label(inner,
                  text="\nNote: Use the Service Role key (not the anon key).\n"
                       "Found in Supabase Dashboard > Settings > API.",
                  foreground="gray").grid(row=6, column=0, columnspan=2, sticky="w", pady=8)

    def _toggle_key(self):
        self.key_entry.config(show="" if self.show_key_var.get() else "*")

    def test_connection(self):
        reset_client()

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

        def on_done(_):
            self.status_label.config(text="Connected successfully!", foreground="green")
            self.app.set_status("Connected to Supabase")

        def on_error(msg):
            self.status_label.config(text=f"Failed: {msg}", foreground="red")

        run_in_thread(test, on_done, on_error)

    def save_env(self):
        url = self.url_var.get().strip()
        key = self.key_var.get().strip()

        env_path = Path(__file__).parent.parent.parent / ".env"
        with open(env_path, "w") as f:
            f.write(f"SUPABASE_URL={url}\n")
            f.write(f"SUPABASE_SERVICE_KEY={key}\n")

        self.status_label.config(text=f"Saved to {env_path}", foreground="green")

    def refresh(self):
        pass  # No auto-refresh needed
