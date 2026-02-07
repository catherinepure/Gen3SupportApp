"""
Reusable dialog windows for the Gen3 Admin GUI.
"""

import tkinter as tk
from tkinter import ttk, messagebox


class DetailDialog(tk.Toplevel):
    """Read-only detail panel showing key-value pairs."""

    def __init__(self, parent, title, fields, width=520, height=450):
        super().__init__(parent)
        self.title(title)
        self.geometry(f"{width}x{height}")
        self.resizable(True, True)
        self.transient(parent)
        self.grab_set()

        canvas = tk.Canvas(self)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)
        scroll_frame = ttk.Frame(canvas)

        scroll_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        canvas.create_window((0, 0), window=scroll_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        row = 0
        for label, value in fields:
            if label == "---":
                ttk.Separator(scroll_frame, orient="horizontal").grid(
                    row=row, column=0, columnspan=2, sticky="ew", padx=12, pady=8)
            elif label.startswith("##"):
                ttk.Label(scroll_frame, text=label[2:].strip(),
                          font=("Helvetica", 11, "bold")).grid(
                    row=row, column=0, columnspan=2, sticky="w", padx=12, pady=(12, 4))
            else:
                ttk.Label(scroll_frame, text=label,
                          foreground="gray").grid(row=row, column=0, sticky="nw", padx=(12, 4), pady=2)
                val_label = ttk.Label(scroll_frame, text=str(value), wraplength=350)
                val_label.grid(row=row, column=1, sticky="w", padx=(0, 12), pady=2)
            row += 1

        canvas.pack(side="left", fill="both", expand=True, padx=4, pady=4)
        scrollbar.pack(side="right", fill="y", pady=4)

        ttk.Button(self, text="Close", command=self.destroy).pack(pady=8)


class FormDialog(tk.Toplevel):
    """
    Generic edit/add form dialog.

    field_defs: list of dicts with keys:
        - name: field key
        - label: display label
        - type: "text" | "combo" | "check" | "textarea" | "readonly"
        - values: list of combo values (for type="combo")
        - default: default value
        - required: bool
    """

    def __init__(self, parent, title, field_defs, values=None, width=480, height=None):
        super().__init__(parent)
        self.title(title)
        self.resizable(False, True)
        self.transient(parent)
        self.grab_set()
        self.result = None
        self._fields = {}
        self._field_defs = field_defs

        values = values or {}

        canvas = tk.Canvas(self)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)
        form_frame = ttk.Frame(canvas)

        form_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=form_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        for i, fd in enumerate(field_defs):
            name = fd["name"]
            label = fd.get("label", name)
            ftype = fd.get("type", "text")
            default = values.get(name, fd.get("default", ""))

            ttk.Label(form_frame, text=f"{label}:").grid(
                row=i, column=0, sticky="nw", padx=(12, 4), pady=4)

            if ftype == "text":
                var = tk.StringVar(value=str(default) if default else "")
                entry = ttk.Entry(form_frame, textvariable=var, width=40)
                entry.grid(row=i, column=1, padx=(0, 12), pady=4, sticky="w")
                self._fields[name] = var

            elif ftype == "readonly":
                var = tk.StringVar(value=str(default) if default else "")
                entry = ttk.Entry(form_frame, textvariable=var, width=40, state="readonly")
                entry.grid(row=i, column=1, padx=(0, 12), pady=4, sticky="w")
                self._fields[name] = var

            elif ftype == "combo":
                var = tk.StringVar(value=str(default) if default else "")
                combo = ttk.Combobox(form_frame, textvariable=var,
                                     state="readonly", width=37,
                                     values=fd.get("values", []))
                combo.grid(row=i, column=1, padx=(0, 12), pady=4, sticky="w")
                # Try to select default
                if default and default in fd.get("values", []):
                    combo.set(default)
                self._fields[name] = var

            elif ftype == "check":
                var = tk.BooleanVar(value=bool(default))
                ttk.Checkbutton(form_frame, text=label, variable=var).grid(
                    row=i, column=1, padx=(0, 12), pady=4, sticky="w")
                self._fields[name] = var

            elif ftype == "textarea":
                text_widget = tk.Text(form_frame, width=40, height=5)
                text_widget.grid(row=i, column=1, padx=(0, 12), pady=4, sticky="w")
                if default:
                    text_widget.insert("1.0", str(default))
                self._fields[name] = text_widget

        canvas.pack(side="left", fill="both", expand=True, padx=4, pady=4)
        scrollbar.pack(side="right", fill="y", pady=4)

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=8)
        ttk.Button(btn_frame, text="Save", command=self._ok).pack(side="right", padx=4)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

        self.bind("<Return>", lambda e: self._ok())

        # Auto-size height
        if height:
            self.geometry(f"{width}x{height}")
        else:
            h = min(80 + len(field_defs) * 42, 700)
            self.geometry(f"{width}x{h}")

    def _ok(self):
        result = {}
        for fd in self._field_defs:
            name = fd["name"]
            ftype = fd.get("type", "text")
            widget = self._fields[name]

            if ftype == "textarea":
                result[name] = widget.get("1.0", "end").strip()
            elif ftype == "check":
                result[name] = widget.get()
            else:
                result[name] = widget.get().strip()

            if fd.get("required") and not result[name]:
                messagebox.showwarning("Required",
                    f"{fd.get('label', name)} is required", parent=self)
                return

        self.result = result
        self.destroy()

    def get_result(self):
        return self.result


class TreeviewTab(ttk.Frame):
    """
    Base class for tabs with a toolbar + treeview + optional detail pane.
    Subclass and override:
        - define_columns() -> list of (col_id, heading, width, anchor)
        - define_toolbar(toolbar_frame)
        - fetch_data() -> list of row tuples
        - on_double_click(values) for detail view
    """

    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app
        self._columns = self.define_columns()

        # Toolbar
        self._toolbar = ttk.Frame(self)
        self._toolbar.pack(fill="x", padx=4, pady=(4, 0))
        self.define_toolbar(self._toolbar)

        # Treeview
        col_ids = [c[0] for c in self._columns]
        self.tree = ttk.Treeview(self, columns=col_ids, show="headings", selectmode="browse")

        for col_id, heading, width, *rest in self._columns:
            anchor = rest[0] if rest else "w"
            self.tree.heading(col_id, text=heading)
            self.tree.column(col_id, width=width, anchor=anchor)

        # Color tags
        self.tree.tag_configure("green", foreground="#2E7D32")
        self.tree.tag_configure("red", foreground="#C62828")
        self.tree.tag_configure("orange", foreground="#EF6C00")
        self.tree.tag_configure("blue", foreground="#1565C0")
        self.tree.tag_configure("dim", foreground="#888888")

        scroll = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill="both", expand=True, padx=4, pady=4, side="left")
        scroll.pack(fill="y", side="right", pady=4)

        self.tree.bind("<Double-1>", self._on_dbl_click)

    def define_columns(self):
        """Override: return [(col_id, heading, width, anchor?), ...]"""
        return [("id", "ID", 200)]

    def define_toolbar(self, toolbar):
        """Override: add buttons/filters to toolbar."""
        ttk.Button(toolbar, text="Refresh", command=self.refresh).pack(side="right", padx=2)

    def refresh(self):
        """Override in subclass."""
        pass

    def _populate(self, rows, tags_fn=None):
        """Clear tree and insert rows. rows = list of tuples matching columns."""
        self.tree.delete(*self.tree.get_children())
        for row in rows:
            tag = tags_fn(row) if tags_fn else ()
            self.tree.insert("", "end", values=row, tags=tag)

    def _get_selected(self):
        """Return values tuple of selected row, or None."""
        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a row first")
            return None
        return self.tree.item(sel[0], "values")

    def _on_dbl_click(self, event):
        sel = self.tree.selection()
        if sel:
            values = self.tree.item(sel[0], "values")
            self.on_double_click(values)

    def on_double_click(self, values):
        """Override for detail view on double-click."""
        pass
