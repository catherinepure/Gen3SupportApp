"""Activity Events tab — list, filter, detail, export."""

import json
import tkinter as tk
from tkinter import ttk, messagebox

from gui.helpers import get_client, run_in_thread, export_to_csv
from gui.dialogs import DetailDialog


class EventsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Label(toolbar, text="Type:").pack(side="left", padx=(4, 2))
        self.type_var = tk.StringVar(value="All")
        self.type_combo = ttk.Combobox(toolbar, textvariable=self.type_var,
                                        state="readonly", width=20)
        self.type_combo.pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Scooter:").pack(side="left", padx=(8, 2))
        self.scooter_var = tk.StringVar()
        ttk.Entry(toolbar, textvariable=self.scooter_var, width=14).pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Country:").pack(side="left", padx=(8, 2))
        self.country_var = tk.StringVar()
        ttk.Entry(toolbar, textvariable=self.country_var, width=5).pack(side="left", padx=2)

        ttk.Button(toolbar, text="Filter", command=self.refresh).pack(side="left", padx=4)

        ttk.Button(toolbar, text="Export CSV", command=self._export).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Stats", command=self._show_stats).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("time", "type", "scooter", "user", "country", "device", "id")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("time", text="Time")
        self.tree.heading("type", text="Event Type")
        self.tree.heading("scooter", text="Scooter")
        self.tree.heading("user", text="User")
        self.tree.heading("country", text="Country")
        self.tree.heading("device", text="Device")
        self.tree.heading("id", text="ID")
        self.tree.column("time", width=130)
        self.tree.column("type", width=160)
        self.tree.column("scooter", width=120)
        self.tree.column("user", width=180)
        self.tree.column("country", width=60, anchor="center")
        self.tree.column("device", width=120)
        self.tree.column("id", width=80)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)

        self._event_data = []

    def refresh(self):
        self.app.set_status("Loading events...")

        def fetch():
            sb = get_client()

            # Refresh event types for filter combo
            all_events = sb.table("activity_events").select("event_type").execute()
            types = sorted(set(e["event_type"] for e in all_events.data if e.get("event_type")))

            query = sb.table("activity_events").select("*")

            etype = self.type_var.get()
            if etype and etype != "All":
                query = query.eq("event_type", etype)

            scooter = self.scooter_var.get().strip()
            if scooter:
                query = query.eq("zyd_serial", scooter)

            country = self.country_var.get().strip().upper()
            if country:
                query = query.eq("country", country)

            result = query.order("created_at", desc=True).limit(200).execute()
            return result.data, types

        def on_done(data):
            events, types = data
            self._event_data = events
            self.type_combo["values"] = ["All"] + types

            self.tree.delete(*self.tree.get_children())
            for ev in events:
                self.tree.insert("", "end", iid=ev["id"], values=(
                    (ev.get("created_at") or "")[:16].replace("T", " "),
                    ev.get("event_type") or "-",
                    ev.get("zyd_serial") or "-",
                    (ev.get("user_id") or "-")[:12] + "..." if ev.get("user_id") else "-",
                    ev.get("country") or "-",
                    (ev.get("device_info") or "-")[:20],
                    ev["id"][:8] + "...",
                ))

            self.app.set_status(f"Loaded {len(events)} events")

        run_in_thread(fetch, on_done)

    def _on_double_click(self, event):
        sel = self.tree.selection()
        if not sel:
            return
        eid = sel[0]
        ev = None
        for e in self._event_data:
            if e["id"] == eid:
                ev = e
                break
        if not ev:
            return

        metadata_str = json.dumps(ev.get("metadata"), indent=2) if ev.get("metadata") else "-"

        fields = [
            ("## Event Details", ""),
            ("ID", ev["id"]),
            ("Type", ev.get("event_type") or "-"),
            ("Scooter", ev.get("zyd_serial") or "-"),
            ("User ID", ev.get("user_id") or "-"),
            ("Country", ev.get("country") or "-"),
            ("Device", ev.get("device_info") or "-"),
            ("Created", (ev.get("created_at") or "")[:16]),
            ("---", ""),
            ("## Metadata", ""),
            ("Data", metadata_str),
        ]

        DetailDialog(self, f"Event: {ev.get('event_type', '?')}", fields, height=500)

    def _show_stats(self):
        self.app.set_status("Calculating stats...")

        def fetch():
            sb = get_client()
            return sb.table("activity_events").select("event_type, country, device_info").execute()

        def on_done(result):
            if not result.data:
                messagebox.showinfo("Stats", "No events recorded yet.")
                return

            total = len(result.data)
            type_counts = {}
            country_counts = {}
            for e in result.data:
                t = e.get("event_type") or "unknown"
                type_counts[t] = type_counts.get(t, 0) + 1
                c = e.get("country") or "unknown"
                country_counts[c] = country_counts.get(c, 0) + 1

            lines = [f"Total events: {total}\n"]
            lines.append("By type:")
            for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
                lines.append(f"  {t}: {c}")
            lines.append("\nBy country:")
            for c, cnt in sorted(country_counts.items(), key=lambda x: -x[1]):
                lines.append(f"  {c}: {cnt}")

            messagebox.showinfo("Event Statistics", "\n".join(lines))
            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _export(self):
        if not self._event_data:
            messagebox.showwarning("No Data", "Load events first")
            return

        headers = ["id", "event_type", "zyd_serial", "user_id", "country",
                   "device_info", "metadata", "created_at"]
        rows = []
        for ev in self._event_data:
            rows.append([
                ev.get("id") or "",
                ev.get("event_type") or "",
                ev.get("zyd_serial") or "",
                ev.get("user_id") or "",
                ev.get("country") or "",
                ev.get("device_info") or "",
                json.dumps(ev.get("metadata")) if ev.get("metadata") else "",
                ev.get("created_at") or "",
            ])

        export_to_csv(headers, rows, "events_export.csv")
