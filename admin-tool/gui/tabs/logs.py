"""Upload Logs tab — list, filter, detail, stats, by-scooter, export."""

import tkinter as tk
from tkinter import ttk, messagebox

from gui.helpers import get_client, run_in_thread, resolve_fk, export_to_csv
from gui.dialogs import DetailDialog


class LogsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Label(toolbar, text="Status:").pack(side="left", padx=(4, 2))
        self.status_var = tk.StringVar(value="All")
        ttk.Combobox(toolbar, textvariable=self.status_var, state="readonly", width=12,
                     values=["All", "completed", "failed", "started"]
                     ).pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Distributor:").pack(side="left", padx=(8, 2))
        self.dist_var = tk.StringVar(value="All")
        self.dist_combo = ttk.Combobox(toolbar, textvariable=self.dist_var,
                                        state="readonly", width=20)
        self.dist_combo.pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Scooter:").pack(side="left", padx=(8, 2))
        self.scooter_var = tk.StringVar()
        ttk.Entry(toolbar, textvariable=self.scooter_var, width=14).pack(side="left", padx=2)

        ttk.Button(toolbar, text="Filter", command=self.refresh).pack(side="left", padx=4)

        ttk.Button(toolbar, text="Export CSV", command=self._export).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Stats", command=self._show_stats).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("date", "scooter", "firmware", "distributor", "old_sw", "status", "error")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("date", text="Date")
        self.tree.heading("scooter", text="Scooter")
        self.tree.heading("firmware", text="Firmware")
        self.tree.heading("distributor", text="Distributor")
        self.tree.heading("old_sw", text="Old SW")
        self.tree.heading("status", text="Status")
        self.tree.heading("error", text="Error")
        self.tree.column("date", width=130)
        self.tree.column("scooter", width=120)
        self.tree.column("firmware", width=80)
        self.tree.column("distributor", width=140)
        self.tree.column("old_sw", width=70)
        self.tree.column("status", width=80)
        self.tree.column("error", width=250)

        for tag, color in [("completed", "#2E7D32"), ("failed", "#C62828"), ("started", "#EF6C00")]:
            self.tree.tag_configure(tag, foreground=color)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)

        self._log_data = []

    def refresh(self):
        self.app.set_status("Loading upload logs...")

        def fetch():
            sb = get_client()
            dists = sb.table("distributors").select("id, name").order("name").execute()
            dist_map = {d["id"]: d["name"] for d in dists.data}

            query = sb.table("firmware_uploads").select(
                "*, scooters(zyd_serial), firmware_versions(version_label), distributors(name)"
            )

            status = self.status_var.get()
            if status and status != "All":
                query = query.eq("status", status)

            dist_name = self.dist_var.get()
            if dist_name and dist_name != "All":
                for did, dname in dist_map.items():
                    if dname == dist_name:
                        query = query.eq("distributor_id", did)
                        break

            scooter = self.scooter_var.get().strip()
            if scooter:
                sc = sb.table("scooters").select("id").eq("zyd_serial", scooter).execute()
                if sc.data:
                    query = query.eq("scooter_id", sc.data[0]["id"])

            result = query.order("started_at", desc=True).limit(200).execute()
            return result.data, dist_map

        def on_done(data):
            logs, dist_map = data
            self._log_data = logs
            self.dist_combo["values"] = ["All"] + sorted(dist_map.values())

            self.tree.delete(*self.tree.get_children())
            for row in logs:
                serial = resolve_fk(row, "scooters", "zyd_serial")
                fw = resolve_fk(row, "firmware_versions", "version_label")
                dist = resolve_fk(row, "distributors")
                status = row.get("status", "?")
                tag = status if status in ("completed", "failed", "started") else ""

                self.tree.insert("", "end", iid=row["id"], values=(
                    (row.get("started_at") or "")[:16].replace("T", " "),
                    serial,
                    fw,
                    dist,
                    row.get("old_sw_version") or "-",
                    status,
                    (row.get("error_message") or "")[:50],
                ), tags=(tag,) if tag else ())

            self.app.set_status(f"Loaded {len(logs)} upload logs")

        run_in_thread(fetch, on_done)

    def _on_double_click(self, event):
        sel = self.tree.selection()
        if not sel:
            return
        lid = sel[0]
        row = None
        for l in self._log_data:
            if l["id"] == lid:
                row = l
                break
        if not row:
            return

        serial = resolve_fk(row, "scooters", "zyd_serial")
        fw = resolve_fk(row, "firmware_versions", "version_label")
        dist = resolve_fk(row, "distributors")

        fields = [
            ("## Upload Log Details", ""),
            ("ID", row["id"]),
            ("Status", row.get("status") or "-"),
            ("Scooter", serial),
            ("Firmware", fw),
            ("Distributor", dist),
            ("Old HW Version", row.get("old_hw_version") or "-"),
            ("Old SW Version", row.get("old_sw_version") or "-"),
            ("New Version", row.get("new_version") or "-"),
            ("Started", (row.get("started_at") or "-")[:16]),
            ("Completed", (row.get("completed_at") or "-")[:16]),
        ]

        if row.get("error_message"):
            fields.append(("---", ""))
            fields.append(("Error", row["error_message"]))

        DetailDialog(self, f"Upload Log: {row['id'][:8]}...", fields, height=420)

    def _show_stats(self):
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
                f"Total uploads:  {total}\n"
                f"Completed:      {completed}\n"
                f"Failed:         {failed}\n"
                f"In progress:    {started}\n"
                f"Success rate:   {rate}")

        run_in_thread(fetch, on_done)

    def _export(self):
        if not self._log_data:
            messagebox.showwarning("No Data", "Load logs first")
            return

        headers = ["id", "started_at", "completed_at", "scooter", "firmware",
                   "distributor", "old_hw", "old_sw", "new_version", "status", "error"]
        rows = []
        for r in self._log_data:
            rows.append([
                r["id"],
                r.get("started_at") or "",
                r.get("completed_at") or "",
                resolve_fk(r, "scooters", "zyd_serial"),
                resolve_fk(r, "firmware_versions", "version_label"),
                resolve_fk(r, "distributors"),
                r.get("old_hw_version") or "",
                r.get("old_sw_version") or "",
                r.get("new_version") or "",
                r.get("status") or "",
                r.get("error_message") or "",
            ])

        export_to_csv(headers, rows, "upload_logs_export.csv")
