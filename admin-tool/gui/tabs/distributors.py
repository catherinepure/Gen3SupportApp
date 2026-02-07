"""Distributors tab — list, add, edit, detail with addresses/workshops/staff."""

import tkinter as tk
from tkinter import ttk, messagebox

from gui.helpers import get_client, run_in_thread, generate_activation_code
from gui.dialogs import DetailDialog, FormDialog


class DistributorTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Add Distributor", command=self._add).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Edit", command=self._edit).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Regenerate Code", command=self._regenerate_code).pack(side="left", padx=2)
        self.toggle_btn = ttk.Button(toolbar, text="Deactivate", command=self._toggle_active)
        self.toggle_btn.pack(side="left", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("name", "code", "countries", "phone", "email", "active", "created", "id")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("name", text="Name")
        self.tree.heading("code", text="Activation Code")
        self.tree.heading("countries", text="Countries")
        self.tree.heading("phone", text="Phone")
        self.tree.heading("email", text="Email")
        self.tree.heading("active", text="Active")
        self.tree.heading("created", text="Created")
        self.tree.heading("id", text="ID")
        self.tree.column("name", width=160)
        self.tree.column("code", width=150)
        self.tree.column("countries", width=100)
        self.tree.column("phone", width=120)
        self.tree.column("email", width=160)
        self.tree.column("active", width=55, anchor="center")
        self.tree.column("created", width=85)
        self.tree.column("id", width=100)

        self.tree.tag_configure("inactive", foreground="#888888")

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<<TreeviewSelect>>", self._on_select)
        self.tree.bind("<Double-1>", self._on_double_click)

        self._dist_data = []

    def refresh(self):
        self.app.set_status("Loading distributors...")

        def fetch():
            sb = get_client()
            return sb.table("distributors").select("*").order("created_at").execute()

        def on_done(result):
            self._dist_data = result.data
            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                countries = row.get("territory_countries") or []
                countries_str = ", ".join(countries) if isinstance(countries, list) else ""
                tag = () if row.get("is_active", True) else ("inactive",)

                self.tree.insert("", "end", iid=row["id"], values=(
                    row["name"],
                    row["activation_code"],
                    countries_str or "-",
                    row.get("contact_phone") or "-",
                    row.get("contact_email") or "-",
                    "Yes" if row["is_active"] else "No",
                    row["created_at"][:10],
                    row["id"][:8] + "...",
                ), tags=tag)
            self.app.set_status(f"Loaded {len(result.data)} distributors")

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
            messagebox.showwarning("Select", "Select a distributor first")
            return None
        did = sel[0]
        for d in self._dist_data:
            if d["id"] == did:
                return d
        return None

    def _on_double_click(self, event):
        dist = self._get_selected()
        if not dist:
            return

        self.app.set_status("Loading distributor details...")

        def fetch_extra():
            sb = get_client()
            addrs = sb.table("addresses").select("*") \
                .eq("entity_type", "distributor").eq("entity_id", dist["id"]).execute()
            workshops = sb.table("workshops").select("name, is_active") \
                .eq("distributor_id", dist["id"]).order("name").execute()
            scooter_count = sb.table("scooters").select("id", count="exact") \
                .eq("distributor_id", dist["id"]).execute()
            staff = sb.table("users").select("email, first_name, last_name") \
                .eq("distributor_id", dist["id"]).eq("is_active", True).execute()
            return addrs.data, workshops.data, scooter_count.count, staff.data

        def on_done(data):
            addrs, workshops, scooter_count, staff = data
            countries = dist.get("territory_countries") or []
            countries_str = ", ".join(countries) if isinstance(countries, list) else ""

            fields = [
                ("## Distributor Details", ""),
                ("Name", dist["name"]),
                ("Activation Code", dist["activation_code"]),
                ("Countries", countries_str or "-"),
                ("Phone", dist.get("contact_phone") or "-"),
                ("Email", dist.get("contact_email") or "-"),
                ("Active", "Yes" if dist["is_active"] else "No"),
                ("Created", dist["created_at"][:16]),
                ("ID", dist["id"]),
                ("---", ""),
                ("## Summary", ""),
                ("Workshops", str(len(workshops))),
                ("Scooters", str(scooter_count or 0)),
                ("Staff Users", str(len(staff))),
            ]

            if addrs:
                fields.append(("---", ""))
                fields.append(("## Addresses", ""))
                for a in addrs:
                    addr_str = f"{a.get('line1', '')}, {a.get('city', '')} {a.get('postcode', '')} {a.get('country', '')}"
                    fields.append(("Address", addr_str))

            if workshops:
                fields.append(("---", ""))
                fields.append(("## Workshops", ""))
                for w in workshops:
                    status = "active" if w.get("is_active", True) else "inactive"
                    fields.append(("Workshop", f"{w['name']} ({status})"))

            if staff:
                fields.append(("---", ""))
                fields.append(("## Staff", ""))
                for s in staff:
                    name = f"{s.get('first_name') or ''} {s.get('last_name') or ''}".strip()
                    fields.append(("Staff", f"{s['email']} ({name})"))

            DetailDialog(self, f"Distributor: {dist['name']}", fields, height=550)
            self.app.set_status("Ready")

        run_in_thread(fetch_extra, on_done)

    def _add(self):
        field_defs = [
            {"name": "name", "label": "Distributor Name", "type": "text", "required": True},
            {"name": "code", "label": "Activation Code (blank = auto)", "type": "text"},
            {"name": "countries", "label": "Countries (comma-sep ISO)", "type": "text"},
            {"name": "phone", "label": "Phone", "type": "text"},
            {"name": "email", "label": "Email", "type": "text"},
        ]

        dlg = FormDialog(self, "Add Distributor", field_defs)
        self.wait_window(dlg)

        if dlg.result:
            r = dlg.result
            code = r.get("code") or generate_activation_code()

            def create():
                sb = get_client()
                data = {
                    "name": r["name"],
                    "activation_code": code,
                    "is_active": True,
                }
                if r.get("countries"):
                    data["territory_countries"] = [c.strip().upper() for c in r["countries"].split(",") if c.strip()]
                if r.get("phone"):
                    data["contact_phone"] = r["phone"]
                if r.get("email"):
                    data["contact_email"] = r["email"]

                return sb.table("distributors").insert(data).execute()

            def on_done(result):
                if result.data:
                    messagebox.showinfo("Created",
                        f"Distributor: {r['name']}\nCode: {code}\n\n(Copied to clipboard)")
                    self.app.clipboard_clear()
                    self.app.clipboard_append(code)
                    self.refresh()

            run_in_thread(create, on_done)

    def _edit(self):
        dist = self._get_selected()
        if not dist:
            return

        countries = dist.get("territory_countries") or []
        countries_str = ", ".join(countries) if isinstance(countries, list) else ""

        field_defs = [
            {"name": "name", "label": "Name", "type": "text", "required": True},
            {"name": "activation_code", "label": "Activation Code", "type": "text", "required": True},
            {"name": "countries", "label": "Countries (comma-sep ISO)", "type": "text"},
            {"name": "phone", "label": "Phone", "type": "text"},
            {"name": "email", "label": "Email", "type": "text"},
            {"name": "is_active", "label": "Active", "type": "check"},
        ]

        vals = {
            "name": dist["name"],
            "activation_code": dist["activation_code"],
            "countries": countries_str,
            "phone": dist.get("contact_phone") or "",
            "email": dist.get("contact_email") or "",
            "is_active": dist["is_active"],
        }

        dlg = FormDialog(self, f"Edit Distributor: {dist['name']}", field_defs, vals)
        self.wait_window(dlg)

        if dlg.result:
            def save():
                sb = get_client()
                r = dlg.result
                updates = {
                    "name": r["name"],
                    "activation_code": r["activation_code"],
                    "is_active": r["is_active"],
                    "contact_phone": r.get("phone") or None,
                    "contact_email": r.get("email") or None,
                }
                if r.get("countries"):
                    updates["territory_countries"] = [c.strip().upper() for c in r["countries"].split(",") if c.strip()]
                else:
                    updates["territory_countries"] = []

                sb.table("distributors").update(updates).eq("id", dist["id"]).execute()

            run_in_thread(save, lambda _: self.refresh())

    def _regenerate_code(self):
        dist = self._get_selected()
        if not dist:
            return

        new_code = generate_activation_code()
        if not messagebox.askyesno("Regenerate",
                f"Generate new code for '{dist['name']}'?\n"
                f"Old: {dist['activation_code']}\nNew: {new_code}"):
            return

        def update():
            sb = get_client()
            sb.table("distributors").update({"activation_code": new_code}).eq("id", dist["id"]).execute()

        def on_done(_):
            messagebox.showinfo("Done",
                f"New code: {new_code}\n(Copied to clipboard)")
            self.app.clipboard_clear()
            self.app.clipboard_append(new_code)
            self.refresh()

        run_in_thread(update, on_done)

    def _toggle_active(self):
        dist = self._get_selected()
        if not dist:
            return

        new_state = not dist["is_active"]
        action = "Activate" if new_state else "Deactivate"

        if not messagebox.askyesno(action, f"{action} distributor '{dist['name']}'?"):
            return

        def update():
            sb = get_client()
            sb.table("distributors").update({"is_active": new_state}).eq("id", dist["id"]).execute()

        run_in_thread(update, lambda _: self.refresh())
