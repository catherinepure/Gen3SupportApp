"""Scooters tab — list, search, add, edit, status mgmt, user-link, export."""

import tkinter as tk
import tkinter.simpledialog
from tkinter import ttk, messagebox

from gui.helpers import get_client, run_in_thread, resolve_fk, export_to_csv
from gui.dialogs import DetailDialog, FormDialog


SCOOTER_STATUSES = ["active", "in_service", "stolen", "decommissioned"]


class ScooterTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar row 1
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Add Scooter", command=self._add).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Add Batch", command=self._add_batch).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Edit", command=self._edit).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Set Status", command=self._set_status).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Link User", command=self._link_user).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Unlink User", command=self._unlink_user).pack(side="left", padx=2)

        ttk.Button(toolbar, text="Export CSV", command=self._export).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Toolbar row 2 — filters
        filter_bar = ttk.Frame(self)
        filter_bar.pack(fill="x", padx=4, pady=(2, 0))

        ttk.Label(filter_bar, text="Search:").pack(side="left", padx=(4, 2))
        self.search_var = tk.StringVar()
        search_entry = ttk.Entry(filter_bar, textvariable=self.search_var, width=15)
        search_entry.pack(side="left", padx=2)
        search_entry.bind("<Return>", lambda e: self.refresh())

        ttk.Label(filter_bar, text="  Distributor:").pack(side="left", padx=(8, 2))
        self.dist_var = tk.StringVar(value="All")
        self.dist_combo = ttk.Combobox(filter_bar, textvariable=self.dist_var,
                                        state="readonly", width=20)
        self.dist_combo.pack(side="left", padx=2)

        ttk.Label(filter_bar, text="  Status:").pack(side="left", padx=(8, 2))
        self.status_var = tk.StringVar(value="All")
        ttk.Combobox(filter_bar, textvariable=self.status_var, state="readonly", width=14,
                     values=["All"] + SCOOTER_STATUSES).pack(side="left", padx=2)

        ttk.Button(filter_bar, text="Filter", command=self.refresh).pack(side="left", padx=4)
        ttk.Button(filter_bar, text="Clear", command=self._clear_filters).pack(side="left", padx=2)

        # Treeview
        cols = ("serial", "model", "hw", "status", "country", "distributor", "fw", "notes", "created")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("serial", text="ZYD Serial")
        self.tree.heading("model", text="Model")
        self.tree.heading("hw", text="HW Ver")
        self.tree.heading("status", text="Status")
        self.tree.heading("country", text="Country")
        self.tree.heading("distributor", text="Distributor")
        self.tree.heading("fw", text="Firmware")
        self.tree.heading("notes", text="Notes")
        self.tree.heading("created", text="Created")
        self.tree.column("serial", width=130)
        self.tree.column("model", width=90)
        self.tree.column("hw", width=60)
        self.tree.column("status", width=100)
        self.tree.column("country", width=60, anchor="center")
        self.tree.column("distributor", width=130)
        self.tree.column("fw", width=80)
        self.tree.column("notes", width=150)
        self.tree.column("created", width=85)

        for tag, color in [("active", "#2E7D32"), ("in_service", "#EF6C00"),
                           ("stolen", "#C62828"), ("decommissioned", "#888888")]:
            self.tree.tag_configure(tag, foreground=color)

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)

        self._scooter_data = []
        self._dist_map = {}

    def refresh(self):
        self.app.set_status("Loading scooters...")

        def fetch():
            sb = get_client()
            dists = sb.table("distributors").select("id, name").order("name").execute()
            dist_map = {d["id"]: d["name"] for d in dists.data}

            query = sb.table("scooters").select("*, distributors(name)")

            # Apply filters
            search = self.search_var.get().strip()
            if search:
                query = query.or_(
                    f"zyd_serial.ilike.%{search}%,model.ilike.%{search}%"
                )

            dist_name = self.dist_var.get()
            if dist_name and dist_name != "All":
                for did, dname in dist_map.items():
                    if dname == dist_name:
                        query = query.eq("distributor_id", did)
                        break

            status = self.status_var.get()
            if status and status != "All":
                query = query.eq("status", status)

            result = query.order("created_at", desc=True).limit(300).execute()
            return result.data, dist_map

        def on_done(data):
            scooters, dist_map = data
            self._scooter_data = scooters
            self._dist_map = dist_map
            self.dist_combo["values"] = ["All"] + sorted(dist_map.values())

            self.tree.delete(*self.tree.get_children())
            for row in scooters:
                status = row.get("status") or "active"
                tag = status if status in ("active", "in_service", "stolen", "decommissioned") else ""

                self.tree.insert("", "end", iid=row["id"], values=(
                    row["zyd_serial"],
                    row.get("model") or "-",
                    row.get("hw_version") or "-",
                    status,
                    row.get("country_of_registration") or "-",
                    resolve_fk(row, "distributors"),
                    row.get("firmware_version") or "-",
                    (row.get("notes") or "")[:30],
                    row["created_at"][:10],
                ), tags=(tag,) if tag else ())

            self.app.set_status(f"Loaded {len(scooters)} scooters")

        run_in_thread(fetch, on_done)

    def _clear_filters(self):
        self.search_var.set("")
        self.dist_var.set("All")
        self.status_var.set("All")
        self.refresh()

    def _get_selected(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a scooter first")
            return None
        sid = sel[0]
        for s in self._scooter_data:
            if s["id"] == sid:
                return s
        return None

    def _on_double_click(self, event):
        scooter = self._get_selected()
        if not scooter:
            return

        self.app.set_status("Loading scooter details...")

        def fetch_extra():
            sb = get_client()
            # Owners
            owners = sb.table("user_scooters").select(
                "*, users(email, first_name, last_name)"
            ).eq("scooter_id", scooter["id"]).execute()

            # Service jobs
            jobs = sb.table("service_jobs").select(
                "id, status, issue_description, booked_date, workshops(name)"
            ).eq("scooter_id", scooter["id"]).order("booked_date", desc=True).limit(10).execute()

            # Telemetry
            telemetry = sb.table("telemetry_snapshots").select("*") \
                .eq("zyd_serial", scooter["zyd_serial"]) \
                .order("captured_at", desc=True).limit(1).execute()

            return owners.data, jobs.data, telemetry.data

        def on_done(data):
            owners, jobs, telemetry = data
            status = scooter.get("status") or "active"

            fields = [
                ("## Scooter Details", ""),
                ("ZYD Serial", scooter["zyd_serial"]),
                ("Model", scooter.get("model") or "-"),
                ("HW Version", scooter.get("hw_version") or "-"),
                ("Status", status),
                ("Firmware", scooter.get("firmware_version") or "-"),
                ("Country", scooter.get("country_of_registration") or "-"),
                ("Distributor", resolve_fk(scooter, "distributors")),
                ("Notes", scooter.get("notes") or "-"),
                ("Created", scooter["created_at"][:16]),
                ("ID", scooter["id"]),
            ]

            if owners:
                fields.append(("---", ""))
                fields.append(("## Owners", ""))
                for o in owners:
                    u = o.get("users") or {}
                    if isinstance(u, dict):
                        email = u.get("email", "?")
                        name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                        primary = " (primary)" if o.get("is_primary") else ""
                        fields.append(("Owner", f"{email} ({name}){primary}"))

            if telemetry:
                t = telemetry[0]
                fields.append(("---", ""))
                fields.append(("## Latest Telemetry", f"({t['captured_at'][:16]})"))
                fields.append(("SW Version", t.get("sw_version") or "-"))
                fields.append(("Odometer", f"{t['odometer_km']:.1f} km" if t.get("odometer_km") else "-"))
                fields.append(("Battery Cycles", str(t.get("battery_cycles") or "-")))
                fields.append(("Battery Health", str(t.get("battery_health") or "-")))
                fields.append(("Error Codes", str(t.get("error_codes") or "-")))

            if jobs:
                fields.append(("---", ""))
                fields.append(("## Service Jobs", ""))
                for j in jobs:
                    ws = resolve_fk(j, "workshops")
                    issue = (j.get("issue_description") or "")[:40]
                    fields.append(("Job", f"[{j['status']}] {ws} — {issue} ({(j.get('booked_date') or '')[:10]})"))

            DetailDialog(self, f"Scooter: {scooter['zyd_serial']}", fields, height=600)
            self.app.set_status("Ready")

        run_in_thread(fetch_extra, on_done)

    def _add(self):
        self.app.set_status("Loading distributors...")

        def fetch():
            sb = get_client()
            return sb.table("distributors").select("id, name").eq("is_active", True).order("name").execute()

        def on_done(result):
            dist_names = [d["name"] for d in result.data]
            dist_map = {d["name"]: d["id"] for d in result.data}

            field_defs = [
                {"name": "serial", "label": "ZYD Serial", "type": "text", "required": True},
                {"name": "distributor", "label": "Distributor", "type": "combo",
                 "values": dist_names, "required": True},
                {"name": "model", "label": "Model", "type": "text"},
                {"name": "hw_version", "label": "HW Version", "type": "text"},
            ]

            dlg = FormDialog(self, "Add Scooter", field_defs)
            self.wait_window(dlg)

            if dlg.result:
                def create():
                    sb = get_client()
                    r = dlg.result
                    sb.table("scooters").insert({
                        "zyd_serial": r["serial"],
                        "distributor_id": dist_map[r["distributor"]],
                        "model": r.get("model") or None,
                        "hw_version": r.get("hw_version") or None,
                    }).execute()

                run_in_thread(create, lambda _: self.refresh())

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _add_batch(self):
        """Batch add scooters via a text area."""
        self.app.set_status("Loading distributors...")

        def fetch():
            sb = get_client()
            return sb.table("distributors").select("id, name").eq("is_active", True).order("name").execute()

        def on_done(result):
            dist_names = [d["name"] for d in result.data]
            dist_map = {d["name"]: d["id"] for d in result.data}

            # Custom batch dialog
            dlg = tk.Toplevel(self)
            dlg.title("Add Scooters — Batch")
            dlg.geometry("480x420")
            dlg.transient(self)
            dlg.grab_set()
            dlg.added = 0

            ttk.Label(dlg, text="Distributor:").pack(anchor="w", padx=12, pady=(12, 2))
            dist_var = tk.StringVar()
            combo = ttk.Combobox(dlg, textvariable=dist_var, state="readonly",
                                  width=37, values=dist_names)
            combo.pack(padx=12, pady=2, anchor="w")
            if dist_names:
                combo.current(0)

            ttk.Label(dlg, text="Model (optional):").pack(anchor="w", padx=12, pady=(8, 2))
            model_var = tk.StringVar()
            ttk.Entry(dlg, textvariable=model_var, width=40).pack(padx=12, pady=2, anchor="w")

            ttk.Label(dlg, text="HW Version (optional):").pack(anchor="w", padx=12, pady=(8, 2))
            hw_var = tk.StringVar()
            ttk.Entry(dlg, textvariable=hw_var, width=20).pack(padx=12, pady=2, anchor="w")

            ttk.Label(dlg, text="Serial numbers (one per line):").pack(anchor="w", padx=12, pady=(12, 2))
            text = tk.Text(dlg, width=50, height=10)
            text.pack(fill="both", expand=True, padx=12, pady=2)

            result_var = tk.StringVar()
            ttk.Label(dlg, textvariable=result_var).pack(anchor="w", padx=12, pady=2)

            def do_add():
                dn = dist_var.get()
                if not dn or dn not in dist_map:
                    messagebox.showwarning("Required", "Select a distributor", parent=dlg)
                    return
                serials = [s.strip() for s in text.get("1.0", "end").strip().split("\n") if s.strip()]
                if not serials:
                    messagebox.showwarning("Required", "Enter at least one serial", parent=dlg)
                    return

                did = dist_map[dn]
                model = model_var.get().strip() or None
                hw = hw_var.get().strip() or None
                result_var.set("Processing...")

                def create_all():
                    sb = get_client()
                    added, skipped = 0, 0
                    for serial in serials:
                        existing = sb.table("scooters").select("id").eq("zyd_serial", serial).execute()
                        if existing.data:
                            skipped += 1
                            continue
                        sb.table("scooters").insert({
                            "zyd_serial": serial, "distributor_id": did,
                            "model": model, "hw_version": hw,
                        }).execute()
                        added += 1
                    return added, skipped

                def on_batch_done(res):
                    added, skipped = res
                    dlg.added = added
                    result_var.set(f"Added: {added}, Skipped: {skipped}")
                    if added > 0:
                        messagebox.showinfo("Done", f"Added {added}, skipped {skipped}", parent=dlg)

                run_in_thread(create_all, on_batch_done)

            btn_frame = ttk.Frame(dlg)
            btn_frame.pack(fill="x", padx=12, pady=8)
            ttk.Button(btn_frame, text="Add All", command=do_add).pack(side="right", padx=4)
            ttk.Button(btn_frame, text="Close", command=dlg.destroy).pack(side="right")

            self.wait_window(dlg)
            if dlg.added > 0:
                self.refresh()

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _edit(self):
        scooter = self._get_selected()
        if not scooter:
            return

        self.app.set_status("Loading form data...")

        def fetch():
            sb = get_client()
            return sb.table("distributors").select("id, name").eq("is_active", True).order("name").execute()

        def on_done(result):
            dist_names = ["(none)"] + [d["name"] for d in result.data]
            dist_map = {d["name"]: d["id"] for d in result.data}
            current_dist = resolve_fk(scooter, "distributors")
            if current_dist == "-":
                current_dist = "(none)"

            field_defs = [
                {"name": "serial", "label": "ZYD Serial", "type": "text", "required": True},
                {"name": "model", "label": "Model", "type": "text"},
                {"name": "hw_version", "label": "HW Version", "type": "text"},
                {"name": "status", "label": "Status", "type": "combo", "values": SCOOTER_STATUSES},
                {"name": "country", "label": "Country (ISO)", "type": "text"},
                {"name": "distributor", "label": "Distributor", "type": "combo", "values": dist_names},
                {"name": "notes", "label": "Notes", "type": "text"},
            ]

            vals = {
                "serial": scooter["zyd_serial"],
                "model": scooter.get("model") or "",
                "hw_version": scooter.get("hw_version") or "",
                "status": scooter.get("status") or "active",
                "country": scooter.get("country_of_registration") or "",
                "distributor": current_dist,
                "notes": scooter.get("notes") or "",
            }

            dlg = FormDialog(self, f"Edit Scooter: {scooter['zyd_serial']}", field_defs, vals)
            self.wait_window(dlg)

            if dlg.result:
                def save():
                    sb = get_client()
                    r = dlg.result
                    updates = {
                        "zyd_serial": r["serial"],
                        "model": r.get("model") or None,
                        "hw_version": r.get("hw_version") or None,
                        "status": r.get("status") or "active",
                        "country_of_registration": r.get("country").upper() if r.get("country") else None,
                        "notes": r.get("notes") or None,
                    }

                    dn = r.get("distributor")
                    if dn and dn != "(none)" and dn in dist_map:
                        updates["distributor_id"] = dist_map[dn]
                    else:
                        updates["distributor_id"] = None

                    sb.table("scooters").update(updates).eq("id", scooter["id"]).execute()

                run_in_thread(save, lambda _: self.refresh())

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _set_status(self):
        scooter = self._get_selected()
        if not scooter:
            return

        current = scooter.get("status") or "active"

        field_defs = [
            {"name": "status", "label": f"Status (currently: {current})", "type": "combo",
             "values": SCOOTER_STATUSES, "required": True},
        ]

        dlg = FormDialog(self, f"Set Status: {scooter['zyd_serial']}", field_defs,
                         {"status": current})
        self.wait_window(dlg)

        if dlg.result and dlg.result["status"] != current:
            new_status = dlg.result["status"]

            if not messagebox.askyesno("Confirm",
                    f"Change {scooter['zyd_serial']} from '{current}' to '{new_status}'?"):
                return

            def update():
                sb = get_client()
                sb.table("scooters").update({"status": new_status}).eq("id", scooter["id"]).execute()

            run_in_thread(update, lambda _: self.refresh())

    def _link_user(self):
        scooter = self._get_selected()
        if not scooter:
            return

        email = tkinter.simpledialog.askstring("Link User",
            f"Enter user email to link to scooter {scooter['zyd_serial']}:",
            parent=self)
        if not email:
            return

        def link():
            sb = get_client()
            user = sb.table("users").select("id").eq("email", email.lower().strip()).execute()
            if not user.data:
                raise Exception(f"User not found: {email}")

            existing = sb.table("user_scooters").select("id") \
                .eq("user_id", user.data[0]["id"]) \
                .eq("scooter_id", scooter["id"]).execute()
            if existing.data:
                raise Exception(f"Already linked to {email}")

            sb.table("user_scooters").insert({
                "user_id": user.data[0]["id"],
                "scooter_id": scooter["id"],
                "zyd_serial": scooter["zyd_serial"],
            }).execute()

        def on_done(_):
            messagebox.showinfo("Linked", f"Scooter {scooter['zyd_serial']} linked to {email}")

        run_in_thread(link, on_done)

    def _unlink_user(self):
        scooter = self._get_selected()
        if not scooter:
            return

        email = tkinter.simpledialog.askstring("Unlink User",
            f"Enter user email to unlink from scooter {scooter['zyd_serial']}:",
            parent=self)
        if not email:
            return

        def unlink():
            sb = get_client()
            user = sb.table("users").select("id").eq("email", email.lower().strip()).execute()
            if not user.data:
                raise Exception(f"User not found: {email}")

            link = sb.table("user_scooters").select("id") \
                .eq("user_id", user.data[0]["id"]) \
                .eq("scooter_id", scooter["id"]).execute()
            if not link.data:
                raise Exception(f"No link found between {scooter['zyd_serial']} and {email}")

            sb.table("user_scooters").delete().eq("id", link.data[0]["id"]).execute()

        def on_done(_):
            messagebox.showinfo("Unlinked", f"Scooter {scooter['zyd_serial']} unlinked from {email}")

        run_in_thread(unlink, on_done)

    def _export(self):
        if not self._scooter_data:
            messagebox.showwarning("No Data", "Load scooters first")
            return

        headers = ["zyd_serial", "model", "hw_version", "status", "country",
                   "distributor", "firmware_version", "notes", "created_at"]
        rows = []
        for s in self._scooter_data:
            rows.append([
                s.get("zyd_serial") or "",
                s.get("model") or "",
                s.get("hw_version") or "",
                s.get("status") or "",
                s.get("country_of_registration") or "",
                resolve_fk(s, "distributors"),
                s.get("firmware_version") or "",
                s.get("notes") or "",
                (s.get("created_at") or "")[:16],
            ])

        export_to_csv(headers, rows, "scooters_export.csv")
