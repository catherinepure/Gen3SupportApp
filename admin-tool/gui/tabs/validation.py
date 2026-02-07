"""Validation tab — data integrity checks: orphaned scooters, expired sessions, stale jobs."""

import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime, timezone

from gui.helpers import get_client, run_in_thread


class ValidationTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Title
        ttk.Label(self, text="Data Integrity Checks",
                  font=("Helvetica", 13, "bold")).pack(anchor="w", padx=12, pady=(12, 4))
        ttk.Label(self, text="Run checks to find potential data issues in the database.",
                  foreground="gray").pack(anchor="w", padx=12, pady=(0, 12))

        # Buttons
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill="x", padx=12, pady=4)

        ttk.Button(btn_frame, text="Check Orphaned Scooters",
                   command=self._check_orphans).pack(side="left", padx=4, pady=4)
        ttk.Button(btn_frame, text="Check Expired Sessions",
                   command=self._check_sessions).pack(side="left", padx=4, pady=4)
        ttk.Button(btn_frame, text="Check Stale Jobs",
                   command=self._check_stale_jobs).pack(side="left", padx=4, pady=4)
        ttk.Button(btn_frame, text="Run All Checks",
                   command=self._run_all).pack(side="left", padx=4, pady=4)

        # Results area
        self.results_text = tk.Text(self, wrap="word", font=("Courier", 10))
        scroll = ttk.Scrollbar(self, orient="vertical", command=self.results_text.yview)
        self.results_text.configure(yscrollcommand=scroll.set)
        self.results_text.pack(fill="both", expand=True, padx=12, pady=8, side="left")
        scroll.pack(fill="y", side="right", pady=8)

    def _append(self, text):
        self.results_text.insert("end", text + "\n")
        self.results_text.see("end")

    def _clear(self):
        self.results_text.delete("1.0", "end")

    def _check_orphans(self):
        self._clear()
        self._append("=== Orphaned Scooters (no distributor) ===\n")
        self.app.set_status("Checking orphaned scooters...")

        def fetch():
            sb = get_client()
            return sb.table("scooters").select("zyd_serial, model, created_at") \
                .is_("distributor_id", "null").execute()

        def on_done(result):
            if not result.data:
                self._append("No orphaned scooters found.")
            else:
                self._append(f"Found {len(result.data)} orphaned scooters:\n")
                for s in result.data:
                    self._append(f"  {s['zyd_serial']:<20} {s.get('model') or '-':<15} {(s.get('created_at') or '')[:10]}")

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _check_sessions(self):
        self._clear()
        self._append("=== Expired Sessions ===\n")
        self.app.set_status("Checking expired sessions...")

        def fetch():
            sb = get_client()
            now = datetime.now(timezone.utc).isoformat()
            return sb.table("sessions").select("id, user_id, expires_at") \
                .lt("expires_at", now).execute()

        def on_done(result):
            if not result.data:
                self._append("No expired sessions found.")
            else:
                self._append(f"Found {len(result.data)} expired sessions:\n")
                for s in result.data:
                    self._append(f"  User: {(s.get('user_id') or '')[:12]}...  Expired: {(s.get('expires_at') or '')[:16]}")

                self._append("")
                if messagebox.askyesno("Cleanup",
                        f"Delete {len(result.data)} expired sessions?"):
                    def cleanup():
                        sb = get_client()
                        now = datetime.now(timezone.utc).isoformat()
                        sb.table("sessions").delete().lt("expires_at", now).execute()
                        return len(result.data)

                    def on_cleaned(count):
                        self._append(f"\nDeleted {count} expired sessions.")
                        self.app.set_status("Ready")

                    run_in_thread(cleanup, on_cleaned)
                    return

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _check_stale_jobs(self):
        self._clear()
        self._append("=== Stale Service Jobs (open > 30 days) ===\n")
        self.app.set_status("Checking stale jobs...")

        def fetch():
            sb = get_client()
            from datetime import timedelta
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()

            return sb.table("service_jobs").select(
                "id, status, booked_date, scooters(zyd_serial), workshops(name)"
            ).in_("status", ["booked", "in_progress", "awaiting_parts"]) \
                .lt("booked_date", cutoff).execute()

        def on_done(result):
            if not result.data:
                self._append("No stale jobs found.")
            else:
                self._append(f"Found {len(result.data)} stale jobs:\n")
                for j in result.data:
                    sc = j.get("scooters") or {}
                    serial = sc.get("zyd_serial", "?") if isinstance(sc, dict) else "?"
                    ws = j.get("workshops") or {}
                    ws_name = ws.get("name", "?") if isinstance(ws, dict) else "?"
                    self._append(
                        f"  [{j['status']:<18}] {serial:<16} @ {ws_name:<20} Booked: {j.get('booked_date') or '?'}"
                    )

            self.app.set_status("Ready")

        run_in_thread(fetch, on_done)

    def _run_all(self):
        self._clear()
        self.app.set_status("Running all checks...")

        def fetch_all():
            sb = get_client()

            # Orphans
            orphans = sb.table("scooters").select("zyd_serial") \
                .is_("distributor_id", "null").execute()

            # Expired sessions
            now = datetime.now(timezone.utc).isoformat()
            expired = sb.table("sessions").select("id") \
                .lt("expires_at", now).execute()

            # Stale jobs
            from datetime import timedelta
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
            stale = sb.table("service_jobs").select("id") \
                .in_("status", ["booked", "in_progress", "awaiting_parts"]) \
                .lt("booked_date", cutoff).execute()

            return len(orphans.data), len(expired.data), len(stale.data)

        def on_done(data):
            orphans, expired, stale = data
            self._append("=== Data Integrity Summary ===\n")
            self._append(f"  Orphaned scooters (no distributor):  {orphans}")
            self._append(f"  Expired sessions:                    {expired}")
            self._append(f"  Stale service jobs (> 30 days):      {stale}")
            self._append("")

            total = orphans + expired + stale
            if total == 0:
                self._append("All checks passed — no issues found.")
            else:
                self._append(f"Total issues: {total}")
                self._append("Use the individual check buttons for details.")

            self.app.set_status("Ready")

        run_in_thread(fetch_all, on_done)

    def refresh(self):
        """Auto-refresh on tab selection."""
        pass  # Don't auto-run checks, let user trigger them
