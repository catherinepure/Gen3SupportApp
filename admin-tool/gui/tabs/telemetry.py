"""Telemetry tab — list, filter, detail, stats, export, health-check."""

import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime, timezone

from gui.helpers import get_client, run_in_thread, export_to_csv
from gui.dialogs import DetailDialog


class TelemetryTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Label(toolbar, text="Scooter:").pack(side="left", padx=(4, 2))
        self.zyd_var = tk.StringVar()
        entry = ttk.Entry(toolbar, textvariable=self.zyd_var, width=15)
        entry.pack(side="left", padx=2)
        entry.bind("<Return>", lambda e: self.refresh())
        ttk.Button(toolbar, text="Filter", command=self.refresh).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Clear", command=self._clear).pack(side="left", padx=2)

        ttk.Button(toolbar, text="Export CSV", command=self._export).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Health Check", command=self._health_check).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Stats", command=self._show_stats).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("captured", "zyd", "hw", "sw", "odometer", "bat_cycles", "bat_health", "errors", "notes")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("captured", text="Captured")
        self.tree.heading("zyd", text="Scooter")
        self.tree.heading("hw", text="HW")
        self.tree.heading("sw", text="SW")
        self.tree.heading("odometer", text="Odometer (km)")
        self.tree.heading("bat_cycles", text="Bat Cycles")
        self.tree.heading("bat_health", text="Bat Health")
        self.tree.heading("errors", text="Errors")
        self.tree.heading("notes", text="Notes")
        self.tree.column("captured", width=130)
        self.tree.column("zyd", width=120)
        self.tree.column("hw", width=60)
        self.tree.column("sw", width=60)
        self.tree.column("odometer", width=95, anchor="e")
        self.tree.column("bat_cycles", width=80, anchor="e")
        self.tree.column("bat_health", width=80, anchor="e")
        self.tree.column("errors", width=80)
        self.tree.column("notes", width=180)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)

        self._telemetry_data = []

    def refresh(self):
        self.app.set_status("Loading telemetry...")

        def fetch():
            sb = get_client()
            query = sb.table("telemetry_snapshots").select("*")
            zyd = self.zyd_var.get().strip()
            if zyd:
                query = query.eq("zyd_serial", zyd)
            return query.order("captured_at", desc=True).limit(200).execute()

        def on_done(result):
            self._telemetry_data = result.data
            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                self.tree.insert("", "end", values=(
                    row["captured_at"][:16].replace("T", " "),
                    row["zyd_serial"],
                    row.get("hw_version") or "-",
                    row.get("sw_version") or "-",
                    f"{row['odometer_km']:.1f}" if row.get("odometer_km") else "-",
                    str(row["battery_cycles"]) if row.get("battery_cycles") else "-",
                    str(row["battery_health"]) if row.get("battery_health") else "-",
                    str(row["error_codes"]) if row.get("error_codes") else "-",
                    (row.get("notes") or "")[:30],
                ))
            self.app.set_status(f"Loaded {len(result.data)} snapshots")

        run_in_thread(fetch, on_done)

    def _clear(self):
        self.zyd_var.set("")
        self.refresh()

    def _on_double_click(self, event):
        sel = self.tree.selection()
        if not sel:
            return
        idx = self.tree.index(sel[0])
        if idx >= len(self._telemetry_data):
            return
        row = self._telemetry_data[idx]

        fields = [
            ("## Telemetry Snapshot", ""),
            ("Scooter", row["zyd_serial"]),
            ("Captured", row["captured_at"][:16]),
            ("HW Version", row.get("hw_version") or "-"),
            ("SW Version", row.get("sw_version") or "-"),
            ("Odometer (km)", f"{row['odometer_km']:.1f}" if row.get("odometer_km") else "-"),
            ("Battery Cycles", str(row.get("battery_cycles") or "-")),
            ("Battery Health", str(row.get("battery_health") or "-")),
            ("Error Codes", str(row.get("error_codes") or "-")),
            ("Notes", row.get("notes") or "-"),
            ("ID", row.get("id") or "-"),
        ]

        DetailDialog(self, f"Telemetry: {row['zyd_serial']}", fields, height=400)

    def _show_stats(self):
        self.app.set_status("Calculating stats...")

        def fetch():
            sb = get_client()
            return sb.table("telemetry_snapshots").select("*").execute()

        def on_done(result):
            total = len(result.data)
            if total == 0:
                messagebox.showinfo("Stats", "No telemetry data yet")
                return

            unique = len(set(r["zyd_serial"] for r in result.data))
            hw = {}
            sw = {}
            odo_total = 0
            odo_count = 0
            bat_total = 0
            bat_count = 0

            for r in result.data:
                h = r.get("hw_version")
                if h:
                    hw[h] = hw.get(h, 0) + 1
                s = r.get("sw_version")
                if s:
                    sw[s] = sw.get(s, 0) + 1
                if r.get("odometer_km"):
                    odo_total += float(r["odometer_km"])
                    odo_count += 1
                if r.get("battery_cycles"):
                    bat_total += int(r["battery_cycles"])
                    bat_count += 1

            hw_str = "\n".join(f"  {k}: {v}" for k, v in sorted(hw.items()))
            sw_str = "\n".join(f"  {k}: {v}" for k, v in sorted(sw.items()))

            messagebox.showinfo("Telemetry Statistics",
                f"Total snapshots: {total}\n"
                f"Unique scooters: {unique}\n"
                f"Avg odometer: {odo_total / odo_count:.1f} km\n" if odo_count else ""
                f"Avg battery cycles: {bat_total / bat_count:.0f}\n\n" if bat_count else ""
                f"HW Versions:\n{hw_str}\n\nSW Versions:\n{sw_str}")
            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _health_check(self):
        self.app.set_status("Running health check...")

        def fetch():
            sb = get_client()
            return sb.table("telemetry_snapshots").select("*") \
                .order("captured_at", desc=True).execute()

        def on_done(result):
            if not result.data:
                messagebox.showinfo("Health Check", "No telemetry data.")
                return

            latest_by_scooter = {}
            for r in result.data:
                serial = r["zyd_serial"]
                if serial not in latest_by_scooter:
                    latest_by_scooter[serial] = r

            issues = []
            now = datetime.now(timezone.utc)

            for serial, snap in latest_by_scooter.items():
                probs = []

                cycles = snap.get("battery_cycles")
                if cycles and int(cycles) > 500:
                    probs.append(f"High battery cycles: {cycles}")

                health = snap.get("battery_health")
                if health and float(health) < 70:
                    probs.append(f"Low battery health: {health}%")

                errors = snap.get("error_codes")
                if errors and str(errors) not in ("", "0", "None", "null"):
                    probs.append(f"Error codes: {errors}")

                captured = snap.get("captured_at", "")
                if captured:
                    try:
                        cap_dt = datetime.fromisoformat(captured.replace("Z", "+00:00"))
                        age = (now - cap_dt).days
                        if age > 90:
                            probs.append(f"Stale data: {age} days")
                    except (ValueError, TypeError):
                        pass

                if probs:
                    issues.append((serial, probs))

            if not issues:
                messagebox.showinfo("Health Check",
                    f"No issues detected across {len(latest_by_scooter)} scooters.")
            else:
                lines = [f"Issues found on {len(issues)} of {len(latest_by_scooter)} scooters:\n"]
                for serial, probs in sorted(issues):
                    lines.append(f"  {serial}: {'; '.join(probs)}")
                messagebox.showwarning("Health Check", "\n".join(lines))

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _export(self):
        if not self._telemetry_data:
            messagebox.showwarning("No Data", "Load telemetry first")
            return

        headers = ["captured_at", "zyd_serial", "hw_version", "sw_version",
                   "odometer_km", "battery_cycles", "battery_health", "error_codes", "notes"]
        rows = []
        for r in self._telemetry_data:
            rows.append([
                r.get("captured_at") or "",
                r["zyd_serial"],
                r.get("hw_version") or "",
                r.get("sw_version") or "",
                r.get("odometer_km") or "",
                r.get("battery_cycles") or "",
                r.get("battery_health") or "",
                r.get("error_codes") or "",
                r.get("notes") or "",
            ])

        export_to_csv(headers, rows, "telemetry_export.csv")
