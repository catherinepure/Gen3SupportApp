"""Service Jobs tab — list, create, detail, update status, export."""

import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime

from gui.helpers import get_client, run_in_thread, resolve_fk, export_to_csv, SERVICE_JOB_SELECT
from gui.dialogs import DetailDialog, FormDialog


STATUS_COLORS = {
    "booked": "blue",
    "in_progress": "orange",
    "awaiting_parts": "orange",
    "ready_for_collection": "green",
    "completed": "green",
    "cancelled": "dim",
}

VALID_TRANSITIONS = {
    "booked": ["in_progress", "cancelled"],
    "in_progress": ["awaiting_parts", "ready_for_collection", "completed", "cancelled"],
    "awaiting_parts": ["in_progress", "cancelled"],
    "ready_for_collection": ["completed", "cancelled"],
}


class ServiceJobsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Create Job", command=self._create).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Update Status", command=self._update_status).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Cancel Job", command=self._cancel).pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Status:").pack(side="left", padx=(12, 2))
        self.status_var = tk.StringVar(value="All")
        ttk.Combobox(toolbar, textvariable=self.status_var, state="readonly", width=18,
                     values=["All", "booked", "in_progress", "awaiting_parts",
                             "ready_for_collection", "completed", "cancelled"]
                     ).pack(side="left", padx=2)

        ttk.Button(toolbar, text="Export CSV", command=self._export).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("status", "scooter", "customer", "workshop", "issue", "booked", "completed", "id")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("status", text="Status")
        self.tree.heading("scooter", text="Scooter")
        self.tree.heading("customer", text="Customer")
        self.tree.heading("workshop", text="Workshop")
        self.tree.heading("issue", text="Issue")
        self.tree.heading("booked", text="Booked")
        self.tree.heading("completed", text="Completed")
        self.tree.heading("id", text="ID")
        self.tree.column("status", width=130)
        self.tree.column("scooter", width=120)
        self.tree.column("customer", width=160)
        self.tree.column("workshop", width=130)
        self.tree.column("issue", width=200)
        self.tree.column("booked", width=85)
        self.tree.column("completed", width=85)
        self.tree.column("id", width=80)

        for tag, color in [("blue", "#1565C0"), ("orange", "#EF6C00"),
                           ("green", "#2E7D32"), ("dim", "#888888")]:
            self.tree.tag_configure(tag, foreground=color)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)

        self._job_data = []

    def refresh(self):
        self.app.set_status("Loading service jobs...")

        def fetch():
            sb = get_client()
            query = sb.table("service_jobs").select(SERVICE_JOB_SELECT)

            status = self.status_var.get()
            if status and status != "All":
                query = query.eq("status", status)

            return query.order("booked_date", desc=True).limit(200).execute()

        def on_done(result):
            self._job_data = result.data
            self.tree.delete(*self.tree.get_children())

            for row in result.data:
                scooter_serial = resolve_fk(row, "scooters", "zyd_serial")
                ws_name = resolve_fk(row, "workshops")
                cust = row.get("users") or {}
                cust_str = cust.get("email", "-") if isinstance(cust, dict) else "-"
                status = row.get("status", "?")
                tag = STATUS_COLORS.get(status, "")

                self.tree.insert("", "end", iid=row["id"], values=(
                    status,
                    scooter_serial,
                    cust_str,
                    ws_name,
                    (row.get("issue_description") or "")[:40],
                    (row.get("booked_date") or "")[:10],
                    (row.get("completed_date") or "-")[:10],
                    row["id"][:8] + "...",
                ), tags=(tag,) if tag else ())

            self.app.set_status(f"Loaded {len(result.data)} service jobs")

        run_in_thread(fetch, on_done)

    def _get_selected_job(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a service job first")
            return None
        jid = sel[0]
        for j in self._job_data:
            if j["id"] == jid:
                return j
        return None

    def _on_double_click(self, event):
        job = self._get_selected_job()
        if not job:
            return

        scooter_serial = resolve_fk(job, "scooters", "zyd_serial")
        scooter_model = resolve_fk(job, "scooters", "model")
        ws_name = resolve_fk(job, "workshops")
        cust = job.get("users") or {}
        if isinstance(cust, dict):
            cust_str = f"{cust.get('email', '-')} ({cust.get('first_name', '')} {cust.get('last_name', '')})"
        else:
            cust_str = "-"

        fields = [
            ("## Service Job Details", ""),
            ("Status", job.get("status") or "-"),
            ("Scooter", f"{scooter_serial} ({scooter_model})"),
            ("Customer", cust_str),
            ("Workshop", ws_name),
            ("Issue", job.get("issue_description") or "-"),
            ("Booked", (job.get("booked_date") or "-")[:16]),
            ("Completed", (job.get("completed_date") or "-")[:16]),
            ("---", ""),
            ("## Technical", ""),
            ("Technician Notes", job.get("technician_notes") or "-"),
            ("Parts Used", job.get("parts_used") or "-"),
            ("FW Updated", "Yes" if job.get("firmware_updated") else "No"),
            ("FW Before", job.get("firmware_version_before") or "-"),
            ("FW After", job.get("firmware_version_after") or "-"),
            ("---", ""),
            ("ID", job.get("id") or "-"),
            ("Created", (job.get("created_at") or "")[:16]),
        ]

        DetailDialog(self, f"Service Job: {job['id'][:8]}...", fields)

    def _create(self):
        self.app.set_status("Loading form data...")

        def fetch():
            sb = get_client()
            workshops = sb.table("workshops").select("id, name").eq("is_active", True).order("name").execute()
            return workshops.data

        def on_done(ws_data):
            ws_names = [w["name"] for w in ws_data]
            ws_map = {w["name"]: w["id"] for w in ws_data}

            field_defs = [
                {"name": "scooter_serial", "label": "Scooter Serial", "type": "text", "required": True},
                {"name": "workshop", "label": "Workshop", "type": "combo", "values": ws_names, "required": True},
                {"name": "customer_email", "label": "Customer Email (optional)", "type": "text"},
                {"name": "issue", "label": "Issue Description", "type": "textarea"},
            ]

            dlg = FormDialog(self, "Create Service Job", field_defs)
            self.wait_window(dlg)

            if dlg.result:
                def create():
                    sb = get_client()
                    r = dlg.result

                    # Resolve scooter
                    scooter = sb.table("scooters").select("id").eq("zyd_serial", r["scooter_serial"]).execute()
                    if not scooter.data:
                        raise Exception(f"Scooter not found: {r['scooter_serial']}")

                    ws_id = ws_map.get(r["workshop"])
                    if not ws_id:
                        raise Exception(f"Workshop not found: {r['workshop']}")

                    data = {
                        "scooter_id": scooter.data[0]["id"],
                        "workshop_id": ws_id,
                        "status": "booked",
                        "issue_description": r.get("issue") or None,
                        "booked_date": datetime.utcnow().date().isoformat(),
                    }

                    # Resolve customer if provided
                    if r.get("customer_email"):
                        user = sb.table("users").select("id").eq("email", r["customer_email"].lower()).execute()
                        if user.data:
                            data["customer_id"] = user.data[0]["id"]

                    sb.table("service_jobs").insert(data).execute()
                    sb.table("scooters").update({"status": "in_service"}).eq("id", scooter.data[0]["id"]).execute()

                run_in_thread(create, lambda _: self.refresh())

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _update_status(self):
        job = self._get_selected_job()
        if not job:
            return

        current = job.get("status", "")
        allowed = VALID_TRANSITIONS.get(current, [])

        if not allowed:
            messagebox.showinfo("Status", f"Job is '{current}' — no further transitions available.")
            return

        field_defs = [
            {"name": "status", "label": "New Status", "type": "combo", "values": allowed, "required": True},
            {"name": "notes", "label": "Technician Notes", "type": "textarea"},
            {"name": "parts", "label": "Parts Used", "type": "text"},
        ]

        dlg = FormDialog(self, f"Update Job ({current} →)", field_defs)
        self.wait_window(dlg)

        if dlg.result:
            def update():
                sb = get_client()
                r = dlg.result
                updates = {
                    "status": r["status"],
                    "updated_at": datetime.utcnow().isoformat(),
                }
                if r.get("notes"):
                    updates["technician_notes"] = r["notes"]
                if r.get("parts"):
                    updates["parts_used"] = r["parts"]
                if r["status"] == "completed":
                    updates["completed_date"] = datetime.utcnow().date().isoformat()
                    # Restore scooter status
                    sb.table("scooters").update({"status": "active"}).eq("id", job["scooter_id"]).execute()

                sb.table("service_jobs").update(updates).eq("id", job["id"]).execute()

            run_in_thread(update, lambda _: self.refresh())

    def _cancel(self):
        job = self._get_selected_job()
        if not job:
            return

        if job["status"] in ("completed", "cancelled"):
            messagebox.showinfo("Status", f"Cannot cancel — already '{job['status']}'")
            return

        if not messagebox.askyesno("Cancel", f"Cancel service job {job['id'][:8]}...?"):
            return

        def cancel():
            sb = get_client()
            sb.table("service_jobs").update({
                "status": "cancelled",
                "completed_date": datetime.utcnow().date().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", job["id"]).execute()
            sb.table("scooters").update({"status": "active"}).eq("id", job["scooter_id"]).execute()

        run_in_thread(cancel, lambda _: self.refresh())

    def _export(self):
        if not self._job_data:
            messagebox.showwarning("No Data", "Load service jobs first")
            return

        headers = ["id", "status", "scooter", "workshop", "customer", "issue",
                   "technician_notes", "parts_used", "fw_updated", "booked", "completed"]
        rows = []
        for j in self._job_data:
            cust = j.get("users") or {}
            cust_str = cust.get("email", "") if isinstance(cust, dict) else ""
            rows.append([
                j["id"],
                j.get("status") or "",
                resolve_fk(j, "scooters", "zyd_serial"),
                resolve_fk(j, "workshops"),
                cust_str,
                j.get("issue_description") or "",
                j.get("technician_notes") or "",
                j.get("parts_used") or "",
                "Yes" if j.get("firmware_updated") else "No",
                j.get("booked_date") or "",
                j.get("completed_date") or "",
            ])

        export_to_csv(headers, rows, "service_jobs_export.csv")
