"""Users tab — search, list, detail, edit, sessions, export."""

import tkinter as tk
from tkinter import ttk, messagebox

from gui.helpers import get_client, run_in_thread, resolve_fk, export_to_csv, USER_SELECT
from gui.dialogs import DetailDialog, FormDialog


class UsersTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # --- Toolbar ---
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Label(toolbar, text="Search:").pack(side="left", padx=(4, 2))
        self.search_var = tk.StringVar()
        search_entry = ttk.Entry(toolbar, textvariable=self.search_var, width=20)
        search_entry.pack(side="left", padx=2)
        search_entry.bind("<Return>", lambda e: self.refresh())
        ttk.Button(toolbar, text="Search", command=self.refresh).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Clear", command=self._clear_search).pack(side="left", padx=2)

        ttk.Label(toolbar, text="  Level:").pack(side="left", padx=(8, 2))
        self.level_var = tk.StringVar(value="All")
        ttk.Combobox(toolbar, textvariable=self.level_var, state="readonly", width=12,
                     values=["All", "user", "distributor", "maintenance", "admin"]
                     ).pack(side="left", padx=2)

        ttk.Button(toolbar, text="Export CSV", command=self._export).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Edit", command=self._edit).pack(side="right", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # --- Treeview ---
        cols = ("email", "name", "level", "roles", "country", "distributor",
                "workshop", "verified", "active", "created")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("email", text="Email")
        self.tree.heading("name", text="Name")
        self.tree.heading("level", text="Level")
        self.tree.heading("roles", text="Roles")
        self.tree.heading("country", text="Country")
        self.tree.heading("distributor", text="Distributor")
        self.tree.heading("workshop", text="Workshop")
        self.tree.heading("verified", text="Verified")
        self.tree.heading("active", text="Active")
        self.tree.heading("created", text="Created")
        self.tree.column("email", width=180)
        self.tree.column("name", width=130)
        self.tree.column("level", width=80)
        self.tree.column("roles", width=130)
        self.tree.column("country", width=60, anchor="center")
        self.tree.column("distributor", width=120)
        self.tree.column("workshop", width=120)
        self.tree.column("verified", width=60, anchor="center")
        self.tree.column("active", width=55, anchor="center")
        self.tree.column("created", width=85)

        self.tree.tag_configure("inactive", foreground="#888888")

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)

        # Store full user data for detail/edit
        self._user_data = []

    def refresh(self):
        self.app.set_status("Loading users...")

        def fetch():
            sb = get_client()
            query = sb.table("users").select(USER_SELECT)

            level = self.level_var.get()
            if level and level != "All":
                query = query.eq("user_level", level)

            search = self.search_var.get().strip()
            if search:
                query = query.or_(
                    f"email.ilike.%{search}%,"
                    f"first_name.ilike.%{search}%,"
                    f"last_name.ilike.%{search}%"
                )

            return query.order("created_at", desc=True).limit(200).execute()

        def on_done(result):
            self._user_data = result.data
            self.tree.delete(*self.tree.get_children())
            for row in result.data:
                roles = row.get("roles") or []
                roles_str = ", ".join(roles) if isinstance(roles, list) else str(roles)
                name = f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip()
                tag = () if row.get("is_active", True) else ("inactive",)

                self.tree.insert("", "end", iid=row["id"], values=(
                    row.get("email") or "",
                    name or "-",
                    row.get("user_level") or "-",
                    roles_str or "-",
                    row.get("home_country") or "-",
                    resolve_fk(row, "distributors"),
                    resolve_fk(row, "workshops"),
                    "Yes" if row.get("is_verified") else "No",
                    "Yes" if row.get("is_active", True) else "No",
                    (row.get("created_at") or "")[:10],
                ), tags=tag)
            self.app.set_status(f"Loaded {len(result.data)} users")

        run_in_thread(fetch, on_done)

    def _clear_search(self):
        self.search_var.set("")
        self.level_var.set("All")
        self.refresh()

    def _get_selected_user(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a user first")
            return None
        uid = sel[0]
        for u in self._user_data:
            if u["id"] == uid:
                return u
        return None

    def _on_double_click(self, event):
        user = self._get_selected_user()
        if not user:
            return
        self._show_detail(user)

    def _show_detail(self, user):
        roles = user.get("roles") or []
        roles_str = ", ".join(roles) if isinstance(roles, list) else str(roles)
        name = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()

        fields = [
            ("## User Details", ""),
            ("Email", user.get("email") or "-"),
            ("Name", name or "-"),
            ("User Level", user.get("user_level") or "-"),
            ("Roles", roles_str or "-"),
            ("Home Country", user.get("home_country") or "-"),
            ("Current Country", user.get("current_country") or "-"),
            ("Distributor", resolve_fk(user, "distributors")),
            ("Workshop", resolve_fk(user, "workshops")),
            ("Verified", "Yes" if user.get("is_verified") else "No"),
            ("Active", "Yes" if user.get("is_active", True) else "No"),
            ("Created", (user.get("created_at") or "")[:16]),
            ("ID", user.get("id") or "-"),
        ]

        # Fetch linked scooters
        self.app.set_status("Loading user details...")

        def fetch_extra():
            sb = get_client()
            links = sb.table("user_scooters").select(
                "*, scooters(zyd_serial, model, status)"
            ).eq("user_id", user["id"]).execute()

            sessions = sb.table("sessions").select("id, created_at, expires_at") \
                .eq("user_id", user["id"]).order("created_at", desc=True).limit(5).execute()

            return links.data, sessions.data

        def on_done(data):
            links, sessions = data
            extra = list(fields)

            if links:
                extra.append(("---", ""))
                extra.append(("## Linked Scooters", ""))
                for link in links:
                    sc = link.get("scooters") or {}
                    if isinstance(sc, dict):
                        serial = sc.get("zyd_serial", "?")
                        model = sc.get("model") or ""
                        status = sc.get("status") or ""
                        primary = " (primary)" if link.get("is_primary") else ""
                        extra.append(("Scooter", f"{serial} {model} [{status}]{primary}"))

            if sessions:
                extra.append(("---", ""))
                extra.append(("## Recent Sessions", ""))
                for s in sessions:
                    created = (s.get("created_at") or "")[:16]
                    expires = (s.get("expires_at") or "")[:16]
                    extra.append(("Session", f"{created} → {expires}"))

            DetailDialog(self, f"User: {user.get('email', '?')}", extra)
            self.app.set_status("Ready")

        run_in_thread(fetch_extra, on_done)

    def _edit(self):
        user = self._get_selected_user()
        if not user:
            return

        # Need distributor and workshop lists for combos
        self.app.set_status("Loading form data...")

        def fetch_lists():
            sb = get_client()
            dists = sb.table("distributors").select("id, name").eq("is_active", True).order("name").execute()
            workshops = sb.table("workshops").select("id, name").eq("is_active", True).order("name").execute()
            return dists.data, workshops.data

        def on_done(data):
            dists, workshops = data
            dist_names = ["(none)"] + [d["name"] for d in dists]
            ws_names = ["(none)"] + [w["name"] for w in workshops]
            dist_map = {d["name"]: d["id"] for d in dists}
            ws_map = {w["name"]: w["id"] for w in workshops}

            current_dist = resolve_fk(user, "distributors")
            current_ws = resolve_fk(user, "workshops")
            if current_dist == "-":
                current_dist = "(none)"
            if current_ws == "-":
                current_ws = "(none)"

            roles = user.get("roles") or []
            roles_str = ", ".join(roles) if isinstance(roles, list) else str(roles)

            field_defs = [
                {"name": "email", "label": "Email", "type": "readonly",
                 "default": user.get("email")},
                {"name": "first_name", "label": "First Name", "type": "text"},
                {"name": "last_name", "label": "Last Name", "type": "text"},
                {"name": "user_level", "label": "User Level", "type": "combo",
                 "values": ["user", "distributor", "maintenance", "admin"]},
                {"name": "roles", "label": "Roles (comma-sep)", "type": "text"},
                {"name": "home_country", "label": "Home Country", "type": "text"},
                {"name": "current_country", "label": "Current Country", "type": "text"},
                {"name": "distributor", "label": "Distributor", "type": "combo",
                 "values": dist_names},
                {"name": "workshop", "label": "Workshop", "type": "combo",
                 "values": ws_names},
                {"name": "is_verified", "label": "Verified", "type": "check"},
                {"name": "is_active", "label": "Active", "type": "check"},
            ]

            vals = {
                "email": user.get("email") or "",
                "first_name": user.get("first_name") or "",
                "last_name": user.get("last_name") or "",
                "user_level": user.get("user_level") or "user",
                "roles": roles_str,
                "home_country": user.get("home_country") or "",
                "current_country": user.get("current_country") or "",
                "distributor": current_dist,
                "workshop": current_ws,
                "is_verified": user.get("is_verified", False),
                "is_active": user.get("is_active", True),
            }

            dlg = FormDialog(self, f"Edit User: {user.get('email', '?')}", field_defs, vals)
            self.wait_window(dlg)

            if dlg.result:
                self.app.set_status("Saving user...")

                def save():
                    sb = get_client()
                    r = dlg.result
                    updates = {
                        "first_name": r["first_name"] or None,
                        "last_name": r["last_name"] or None,
                        "user_level": r["user_level"],
                        "home_country": r["home_country"].upper() if r["home_country"] else None,
                        "current_country": r["current_country"].upper() if r["current_country"] else None,
                        "is_verified": r["is_verified"],
                        "is_active": r["is_active"],
                    }

                    # Parse roles
                    roles_input = r.get("roles", "")
                    if roles_input:
                        updates["roles"] = [x.strip() for x in roles_input.split(",") if x.strip()]
                    else:
                        updates["roles"] = []

                    # Resolve distributor
                    dist_name = r.get("distributor")
                    if dist_name and dist_name != "(none)" and dist_name in dist_map:
                        updates["distributor_id"] = dist_map[dist_name]
                    else:
                        updates["distributor_id"] = None

                    # Resolve workshop
                    ws_name = r.get("workshop")
                    if ws_name and ws_name != "(none)" and ws_name in ws_map:
                        updates["workshop_id"] = ws_map[ws_name]
                    else:
                        updates["workshop_id"] = None

                    sb.table("users").update(updates).eq("id", user["id"]).execute()

                run_in_thread(save, lambda _: self.refresh())

            self.app.set_status("Ready")

        run_in_thread(fetch_lists, on_done)

    def _export(self):
        if not self._user_data:
            messagebox.showwarning("No Data", "Load users first")
            return

        headers = ["email", "first_name", "last_name", "user_level", "roles",
                   "home_country", "current_country", "distributor", "workshop",
                   "is_verified", "is_active", "created_at"]
        rows = []
        for u in self._user_data:
            roles = u.get("roles") or []
            rows.append([
                u.get("email") or "",
                u.get("first_name") or "",
                u.get("last_name") or "",
                u.get("user_level") or "",
                ",".join(roles) if isinstance(roles, list) else str(roles),
                u.get("home_country") or "",
                u.get("current_country") or "",
                resolve_fk(u, "distributors"),
                resolve_fk(u, "workshops"),
                "Yes" if u.get("is_verified") else "No",
                "Yes" if u.get("is_active", True) else "No",
                (u.get("created_at") or "")[:16],
            ])

        export_to_csv(headers, rows, "users_export.csv")
