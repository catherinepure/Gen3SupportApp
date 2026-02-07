"""Firmware tab — list, upload, edit, detail, deactivate/reactivate."""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from pathlib import Path

from gui.helpers import get_client, run_in_thread
from gui.dialogs import DetailDialog, FormDialog


class FirmwareTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(toolbar, text="Upload Firmware", command=self._upload).pack(side="left", padx=2)
        ttk.Button(toolbar, text="Edit", command=self._edit).pack(side="left", padx=2)
        self.toggle_btn = ttk.Button(toolbar, text="Deactivate", command=self._toggle_active)
        self.toggle_btn.pack(side="left", padx=2)
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

        # Treeview
        cols = ("version", "hw", "access", "min_sw", "file", "size", "active", "created", "notes")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("version", text="Version")
        self.tree.heading("hw", text="Target HW")
        self.tree.heading("access", text="Access")
        self.tree.heading("min_sw", text="Min SW")
        self.tree.heading("file", text="File Path")
        self.tree.heading("size", text="Size")
        self.tree.heading("active", text="Active")
        self.tree.heading("created", text="Created")
        self.tree.heading("notes", text="Release Notes")
        self.tree.column("version", width=80)
        self.tree.column("hw", width=120)
        self.tree.column("access", width=80)
        self.tree.column("min_sw", width=70)
        self.tree.column("file", width=140)
        self.tree.column("size", width=70)
        self.tree.column("active", width=55, anchor="center")
        self.tree.column("created", width=85)
        self.tree.column("notes", width=180)

        self.tree.tag_configure("inactive", foreground="#888888")

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_double_click)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

        self._fw_data = []
        self._hw_targets_map = {}

    def refresh(self):
        self.app.set_status("Loading firmware versions...")

        def fetch():
            sb = get_client()
            result = sb.table("firmware_versions").select("*").order("created_at", desc=True).execute()

            hw_targets_map = {}
            for fw in result.data:
                targets = sb.table("firmware_hw_targets").select("hw_version").eq(
                    "firmware_version_id", fw["id"]).execute()
                hw_versions = [t["hw_version"] for t in targets.data]
                hw_targets_map[fw["id"]] = ", ".join(hw_versions) if hw_versions else "-"

            return result.data, hw_targets_map

        def on_done(data):
            fws, hw_map = data
            self._fw_data = fws
            self._hw_targets_map = hw_map

            self.tree.delete(*self.tree.get_children())
            for row in fws:
                size = row.get("file_size_bytes") or 0
                size_str = f"{size / 1024:.1f} KB" if size > 0 else "?"
                tag = () if row.get("is_active", True) else ("inactive",)

                self.tree.insert("", "end", iid=row["id"], values=(
                    row["version_label"],
                    hw_map.get(row["id"], "-"),
                    row.get("access_level", "distributor"),
                    row.get("min_sw_version") or "-",
                    row["file_path"],
                    size_str,
                    "Yes" if row["is_active"] else "No",
                    row["created_at"][:10],
                    (row.get("release_notes") or "")[:40],
                ), tags=tag)

            self.app.set_status(f"Loaded {len(fws)} firmware versions")

        run_in_thread(fetch, on_done)

    def _on_select(self, event):
        sel = self.tree.selection()
        if sel:
            vals = self.tree.item(sel[0], "values")
            is_active = vals[6] == "Yes"
            self.toggle_btn.config(text="Deactivate" if is_active else "Reactivate")

    def _get_selected(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a firmware version first")
            return None
        fid = sel[0]
        for f in self._fw_data:
            if f["id"] == fid:
                return f
        return None

    def _on_double_click(self, event):
        fw = self._get_selected()
        if not fw:
            return

        self.app.set_status("Loading firmware details...")

        def fetch_extra():
            sb = get_client()
            uploads = sb.table("firmware_uploads").select("status").eq(
                "firmware_version_id", fw["id"]).execute()
            return uploads.data

        def on_done(uploads):
            total = len(uploads)
            completed = sum(1 for u in uploads if u["status"] == "completed")
            failed = sum(1 for u in uploads if u["status"] == "failed")

            size = fw.get("file_size_bytes") or 0
            size_str = f"{size / 1024:.1f} KB ({size} bytes)" if size > 0 else "Unknown"

            fields = [
                ("## Firmware Details", ""),
                ("Version", fw["version_label"]),
                ("File", fw.get("file_path") or "-"),
                ("Size", size_str),
                ("Target HW", self._hw_targets_map.get(fw["id"], "-")),
                ("Min SW", fw.get("min_sw_version") or "-"),
                ("Access", fw.get("access_level", "distributor")),
                ("Active", "Yes" if fw.get("is_active") else "No"),
                ("Release Notes", fw.get("release_notes") or "-"),
                ("Created", fw.get("created_at", "")[:16]),
                ("ID", fw["id"]),
            ]

            if total > 0:
                rate = f"{completed / total * 100:.1f}%" if total > 0 else "N/A"
                fields.append(("---", ""))
                fields.append(("## Upload Stats", ""))
                fields.append(("Total uploads", str(total)))
                fields.append(("Completed", str(completed)))
                fields.append(("Failed", str(failed)))
                fields.append(("Success rate", rate))

            DetailDialog(self, f"Firmware: {fw['version_label']}", fields)
            self.app.set_status("Ready")

        run_in_thread(fetch_extra, on_done)

    def _upload(self):
        """Upload a new firmware binary."""
        dlg = UploadFirmwareDialog(self, self.app)
        self.wait_window(dlg)
        if dlg.result:
            self.refresh()

    def _edit(self):
        fw = self._get_selected()
        if not fw:
            return

        hw_str = self._hw_targets_map.get(fw["id"], "")

        field_defs = [
            {"name": "version_label", "label": "Version Label", "type": "text", "required": True},
            {"name": "hw_targets", "label": "Target HW (comma-sep)", "type": "text", "required": True},
            {"name": "access_level", "label": "Access Level", "type": "combo",
             "values": ["public", "distributor"]},
            {"name": "min_sw_version", "label": "Min SW Version", "type": "text"},
            {"name": "release_notes", "label": "Release Notes", "type": "text"},
            {"name": "is_active", "label": "Active", "type": "check"},
        ]

        vals = {
            "version_label": fw["version_label"],
            "hw_targets": hw_str,
            "access_level": fw.get("access_level", "distributor"),
            "min_sw_version": fw.get("min_sw_version") or "",
            "release_notes": fw.get("release_notes") or "",
            "is_active": fw.get("is_active", True),
        }

        dlg = FormDialog(self, f"Edit Firmware: {fw['version_label']}", field_defs, vals)
        self.wait_window(dlg)

        if dlg.result:
            def save():
                sb = get_client()
                r = dlg.result
                updates = {
                    "version_label": r["version_label"],
                    "access_level": r["access_level"],
                    "min_sw_version": r.get("min_sw_version") or None,
                    "release_notes": r.get("release_notes") or None,
                    "is_active": r["is_active"],
                }
                sb.table("firmware_versions").update(updates).eq("id", fw["id"]).execute()

                # Update HW targets
                new_hw = [v.strip() for v in r["hw_targets"].split(",") if v.strip()]
                old_hw = [v.strip() for v in (self._hw_targets_map.get(fw["id"], "")).split(",") if v.strip()]

                if sorted(new_hw) != sorted(old_hw):
                    sb.table("firmware_hw_targets").delete().eq("firmware_version_id", fw["id"]).execute()
                    for hw_ver in new_hw:
                        sb.table("firmware_hw_targets").insert({
                            "firmware_version_id": fw["id"],
                            "hw_version": hw_ver,
                        }).execute()

            run_in_thread(save, lambda _: self.refresh())

    def _toggle_active(self):
        fw = self._get_selected()
        if not fw:
            return

        new_state = not fw.get("is_active", True)
        action = "Reactivate" if new_state else "Deactivate"

        if not messagebox.askyesno(action, f"{action} firmware '{fw['version_label']}'?"):
            return

        def update():
            sb = get_client()
            sb.table("firmware_versions").update({"is_active": new_state}).eq("id", fw["id"]).execute()

        run_in_thread(update, lambda _: self.refresh())


class UploadFirmwareDialog(tk.Toplevel):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.title("Upload Firmware")
        self.geometry("540x440")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.app = app
        self.result = None
        self._file_path = None

        # File selection
        file_frame = ttk.Frame(self)
        file_frame.pack(fill="x", padx=12, pady=(12, 2))
        ttk.Label(file_frame, text="Firmware File (.bin):",
                  font=("Helvetica", 11, "bold")).pack(anchor="w")
        file_row = ttk.Frame(file_frame)
        file_row.pack(fill="x", pady=2)
        self.file_var = tk.StringVar(value="No file selected")
        ttk.Label(file_row, textvariable=self.file_var, width=45).pack(side="left")
        ttk.Button(file_row, text="Browse...", command=self._browse).pack(side="right")

        self.size_var = tk.StringVar()
        ttk.Label(self, textvariable=self.size_var).pack(anchor="w", padx=12)

        ttk.Label(self, text="Version Label (e.g. V2.3):").pack(anchor="w", padx=12, pady=(12, 2))
        self.version_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.version_var, width=20).pack(anchor="w", padx=12, pady=2)

        ttk.Label(self, text="Target HW Versions (comma-separated):").pack(anchor="w", padx=12, pady=(8, 2))
        self.hw_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.hw_var, width=40).pack(anchor="w", padx=12, pady=2)

        ttk.Label(self, text="Access Level:").pack(anchor="w", padx=12, pady=(8, 2))
        self.access_var = tk.StringVar(value="distributor")
        af = ttk.Frame(self)
        af.pack(anchor="w", padx=12, pady=2)
        ttk.Radiobutton(af, text="Public", variable=self.access_var, value="public").pack(side="left", padx=(0, 10))
        ttk.Radiobutton(af, text="Distributor", variable=self.access_var, value="distributor").pack(side="left")

        ttk.Label(self, text="Min SW Version (optional):").pack(anchor="w", padx=12, pady=(8, 2))
        self.min_sw_var = tk.StringVar()
        ttk.Entry(self, textvariable=self.min_sw_var, width=20).pack(anchor="w", padx=12, pady=2)

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=12)
        self.upload_btn = ttk.Button(btn_frame, text="Upload", command=self._do_upload)
        self.upload_btn.pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        self.progress_var = tk.StringVar()
        ttk.Label(self, textvariable=self.progress_var).pack(anchor="w", padx=12)

    def _browse(self):
        path = filedialog.askopenfilename(
            title="Select Firmware Binary",
            filetypes=[("Binary files", "*.bin"), ("All files", "*.*")],
        )
        if path:
            self._file_path = Path(path)
            self.file_var.set(self._file_path.name)
            size = self._file_path.stat().st_size
            self.size_var.set(f"Size: {size / 1024:.1f} KB ({size} bytes)")

    def _do_upload(self):
        if not self._file_path or not self._file_path.exists():
            messagebox.showwarning("Required", "Select a firmware file", parent=self)
            return
        version = self.version_var.get().strip()
        hw_input = self.hw_var.get().strip()
        if not version or not hw_input:
            messagebox.showwarning("Required", "Enter version and HW versions", parent=self)
            return

        hw_versions = [v.strip() for v in hw_input.split(",") if v.strip()]
        min_sw = self.min_sw_var.get().strip() or None
        access_level = self.access_var.get()
        file_size = self._file_path.stat().st_size

        if file_size < 1024:
            messagebox.showerror("Error", "File too small (< 1KB)", parent=self)
            return
        if file_size > 512 * 1024:
            messagebox.showerror("Error", "File too large (> 512KB)", parent=self)
            return

        self.upload_btn.config(state="disabled")
        self.progress_var.set("Uploading...")

        storage_path = self._file_path.name
        with open(self._file_path, "rb") as f:
            file_data = f.read()

        def do_upload():
            sb = get_client()
            try:
                sb.storage.from_("firmware-binaries").upload(
                    storage_path, file_data,
                    file_options={"content-type": "application/octet-stream"},
                )
            except Exception as e:
                if "Duplicate" in str(e) or "already exists" in str(e):
                    sb.storage.from_("firmware-binaries").update(
                        storage_path, file_data,
                        file_options={"content-type": "application/octet-stream"},
                    )
                else:
                    raise

            result = sb.table("firmware_versions").insert({
                "version_label": version,
                "file_path": storage_path,
                "file_size_bytes": file_size,
                "min_sw_version": min_sw,
                "access_level": access_level,
                "is_active": True,
            }).execute()

            if result.data:
                firmware_id = result.data[0]["id"]
                for hw_ver in hw_versions:
                    sb.table("firmware_hw_targets").insert({
                        "firmware_version_id": firmware_id,
                        "hw_version": hw_ver,
                    }).execute()

            return result

        def on_done(result):
            if result.data:
                self.result = True
                messagebox.showinfo("Uploaded",
                    f"Firmware {version} uploaded\nHW: {', '.join(hw_versions)}", parent=self)
                self.destroy()
            else:
                self.upload_btn.config(state="normal")
                self.progress_var.set("Failed")

        def on_error(msg):
            self.upload_btn.config(state="normal")
            self.progress_var.set("Failed")
            messagebox.showerror("Error", msg, parent=self)

        run_in_thread(do_upload, on_done, on_error)
