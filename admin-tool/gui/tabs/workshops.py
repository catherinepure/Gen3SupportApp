"""Workshops tab — list, add, edit, detail view, addresses."""

import tkinter as tk
from tkinter import ttk, messagebox

from gui.helpers import get_client, run_in_thread, resolve_fk
from gui.dialogs import DetailDialog, FormDialog


class WorkshopsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Add Workshop", command=self._add).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Edit", command=self._edit).pack(side="left", padx=2)

        self.toggle_btn = ttk.Button(toolbar, text="Deactivate", command=self._toggle_active)
        self.toggle_btn.pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Distributor:").pack(side="left", padx=(12, 2))
        self.dist_var = tk.StringVar(value="All")
        self.dist_combo = ttk.Combobox(toolbar, textvariable=self.dist_var,
                                        state="readonly", width=20)
        self.dist_combo.pack(side="left", padx=2)
        self.dist_combo.bind("<<ComboboxSelected>>", lambda e: self.refresh())

        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("name", "distributor", "countries", "phone", "email", "active", "created")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("name", text="Name")
        self.tree.heading("distributor", text="Distributor")
        self.tree.heading("countries", text="Countries")
        self.tree.heading("phone", text="Phone")
        self.tree.heading("email", text="Email")
        self.tree.heading("active", text="Active")
        self.tree.heading("created", text="Created")
        self.tree.column("name", width=180)
        self.tree.column("distributor", width=150)
        self.tree.column("countries", width=120)
        self.tree.column("phone", width=130)
        self.tree.column("email", width=180)
        self.tree.column("active", width=55, anchor="center")
        self.tree.column("created", width=85)

        self.tree.tag_configure("inactive", foreground="#888888")

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

        self._workshop_data = []
        self._dist_map = {}

    def refresh(self):
        self.app.set_status("Loading workshops...")

        def fetch():
            sb = get_client()
            dists = sb.table("distributors").select("id, name").order("name").execute()
            dist_map = {d["id"]: d["name"] for d in dists.data}

            query = sb.table("workshops").select("*, distributors(name)")

            filter_name = self.dist_var.get()
            if filter_name and filter_name != "All":
                for did, dname in dist_map.items():
                    if dname == filter_name:
                        query = query.eq("distributor_id", did)
                        break

            result = query.order("name").execute()
            return result.data, dist_map

        def on_done(data):
            workshops, dist_map = data
            self._workshop_data = workshops
            self._dist_map = dist_map

            self.dist_combo["values"] = ["All"] + sorted(dist_map.values())

            self.tree.delete(*self.tree.get_children())
            for ws in workshops:
                countries = ws.get("territory_countries") or []
                countries_str = ", ".join(countries) if isinstance(countries, list) else str(countries)
                tag = () if ws.get("is_active", True) else ("inactive",)

                self.tree.insert("", "end", iid=ws["id"], values=(
                    ws.get("name") or "",
                    resolve_fk(ws, "distributors"),
                    countries_str or "-",
                    ws.get("contact_phone") or "-",
                    ws.get("contact_email") or "-",
                    "Yes" if ws.get("is_active", True) else "No",
                    (ws.get("created_at") or "")[:10],
                ), tags=tag)

            self.app.set_status(f"Loaded {len(workshops)} workshops")

        run_in_thread(fetch, on_done)

    def _on_select(self, event):
        sel = self.tree.selection()
        if sel:
            vals = self.tree.item(sel[0], "values")
            is_active = vals[5] == "Yes"
            self.toggle_btn.config(text="Deactivate" if is_active else "Activate")

    def _get_selected(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a workshop first")
            return None
        wid = sel[0]
        for ws in self._workshop_data:
            if ws["id"] == wid:
                return ws
        return None

    def _on_double_click(self, event):
        ws = self._get_selected()
        if not ws:
            return

        self.app.set_status("Loading workshop details...")

        def fetch_extra():
            sb = get_client()
            addrs = sb.table("addresses").select("*") \
                .eq("entity_type", "workshop").eq("entity_id", ws["id"]).execute()
            jobs = sb.table("service_jobs").select("id, status") \
                .eq("workshop_id", ws["id"]) \
                .neq("status", "completed").neq("status", "cancelled").execute()
            staff = sb.table("users").select("email, first_name, last_name") \
                .eq("workshop_id", ws["id"]).eq("is_active", True).execute()
            return addrs.data, jobs.data, staff.data

        def on_done(data):
            addrs, jobs, staff = data
            countries = ws.get("territory_countries") or []
            countries_str = ", ".join(countries) if isinstance(countries, list) else ""

            fields = [
                ("## Workshop Details", ""),
                ("Name", ws.get("name") or "-"),
                ("Distributor", resolve_fk(ws, "distributors")),
                ("Countries", countries_str or "-"),
                ("Phone", ws.get("contact_phone") or "-"),
                ("Email", ws.get("contact_email") or "-"),
                ("Active", "Yes" if ws.get("is_active", True) else "No"),
                ("Created", (ws.get("created_at") or "")[:16]),
                ("ID", ws.get("id") or "-"),
            ]

            if addrs:
                fields.append(("---", ""))
                fields.append(("## Addresses", ""))
                for a in addrs:
                    addr_str = f"{a.get('line1', '')}, {a.get('city', '')} {a.get('postcode', '')} {a.get('country', '')}"
                    fields.append(("Address", addr_str))

            fields.append(("---", ""))
            fields.append(("## Active Jobs", str(len(jobs))))

            if staff:
                fields.append(("---", ""))
                fields.append(("## Staff", ""))
                for s in staff:
                    name = f"{s.get('first_name') or ''} {s.get('last_name') or ''}".strip()
                    fields.append(("Staff", f"{s['email']} ({name})"))

            DetailDialog(self, f"Workshop: {ws.get('name', '?')}", fields)
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
                {"name": "name", "label": "Workshop Name", "type": "text", "required": True},
                {"name": "distributor", "label": "Distributor", "type": "combo",
                 "values": dist_names},
                {"name": "countries", "label": "Countries (comma-sep ISO)", "type": "text"},
                {"name": "phone", "label": "Phone", "type": "text"},
                {"name": "email", "label": "Email", "type": "text"},
            ]

            dlg = FormDialog(self, "Add Workshop", field_defs)
            self.wait_window(dlg)

            if dlg.result:
                def create():
                    sb = get_client()
                    r = dlg.result
                    data = {"name": r["name"], "is_active": True}

                    if r.get("distributor") and r["distributor"] in dist_map:
                        data["distributor_id"] = dist_map[r["distributor"]]

                    if r.get("countries"):
                        data["territory_countries"] = [c.strip().upper() for c in r["countries"].split(",") if c.strip()]

                    if r.get("phone"):
                        data["contact_phone"] = r["phone"]
                    if r.get("email"):
                        data["contact_email"] = r["email"]

                    sb.table("workshops").insert(data).execute()

                run_in_thread(create, lambda _: self.refresh())

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _edit(self):
        ws = self._get_selected()
        if not ws:
            return

        self.app.set_status("Loading form data...")

        def fetch():
            sb = get_client()
            return sb.table("distributors").select("id, name").eq("is_active", True).order("name").execute()

        def on_done(result):
            dist_names = ["(none)"] + [d["name"] for d in result.data]
            dist_map = {d["name"]: d["id"] for d in result.data}

            current_dist = resolve_fk(ws, "distributors")
            if current_dist == "-":
                current_dist = "(none)"

            countries = ws.get("territory_countries") or []
            countries_str = ", ".join(countries) if isinstance(countries, list) else ""

            field_defs = [
                {"name": "name", "label": "Name", "type": "text", "required": True},
                {"name": "distributor", "label": "Distributor", "type": "combo",
                 "values": dist_names},
                {"name": "countries", "label": "Countries (comma-sep ISO)", "type": "text"},
                {"name": "phone", "label": "Phone", "type": "text"},
                {"name": "email", "label": "Email", "type": "text"},
                {"name": "is_active", "label": "Active", "type": "check"},
            ]

            vals = {
                "name": ws.get("name") or "",
                "distributor": current_dist,
                "countries": countries_str,
                "phone": ws.get("contact_phone") or "",
                "email": ws.get("contact_email") or "",
                "is_active": ws.get("is_active", True),
            }

            dlg = FormDialog(self, f"Edit Workshop: {ws.get('name', '?')}", field_defs, vals)
            self.wait_window(dlg)

            if dlg.result:
                def save():
                    sb = get_client()
                    r = dlg.result
                    updates = {
                        "name": r["name"],
                        "is_active": r["is_active"],
                        "contact_phone": r.get("phone") or None,
                        "contact_email": r.get("email") or None,
                    }

                    if r.get("countries"):
                        updates["territory_countries"] = [c.strip().upper() for c in r["countries"].split(",") if c.strip()]
                    else:
                        updates["territory_countries"] = []

                    dist_name = r.get("distributor")
                    if dist_name and dist_name != "(none)" and dist_name in dist_map:
                        updates["distributor_id"] = dist_map[dist_name]
                    else:
                        updates["distributor_id"] = None

                    sb.table("workshops").update(updates).eq("id", ws["id"]).execute()

                run_in_thread(save, lambda _: self.refresh())

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _toggle_active(self):
        ws = self._get_selected()
        if not ws:
            return

        new_state = not ws.get("is_active", True)
        action = "Activate" if new_state else "Deactivate"

        if not messagebox.askyesno(action, f"{action} workshop '{ws.get('name', '?')}'?"):
            return

        def update():
            sb = get_client()
            sb.table("workshops").update({"is_active": new_state}).eq("id", ws["id"]).execute()

        run_in_thread(update, lambda _: self.refresh())
