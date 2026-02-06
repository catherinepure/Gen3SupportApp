#!/usr/bin/env python3
"""
Gen3 Firmware Updater — Admin Tool
Manages distributors, scooters, firmware versions, and upload logs
in the Supabase backend.

Usage:
    python admin.py [command] [options]

Run `python admin.py --help` for full command list.
"""

import os
import sys
import secrets
import string
from datetime import datetime
from pathlib import Path

import click
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

load_dotenv()
console = Console()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_client() -> Client:
    """Create Supabase client using the service role key (bypasses RLS)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        console.print("[red]Error:[/red] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        console.print("Copy .env.example to .env and fill in your values.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def generate_activation_code() -> str:
    """Generate a readable activation code like PURE-XXXX-XXXX."""
    chars = string.ascii_uppercase + string.digits
    part1 = "".join(secrets.choice(chars) for _ in range(4))
    part2 = "".join(secrets.choice(chars) for _ in range(4))
    return f"PURE-{part1}-{part2}"


# ---------------------------------------------------------------------------
# CLI Group
# ---------------------------------------------------------------------------

@click.group()
def cli():
    """Gen3 Firmware Updater — Admin Tool"""
    pass


# ===========================================================================
# DISTRIBUTORS
# ===========================================================================

@cli.group()
def distributor():
    """Manage distributors."""
    pass


@distributor.command("list")
def distributor_list():
    """List all distributors."""
    sb = get_client()
    result = sb.table("distributors").select("*").order("created_at").execute()

    table = Table(title="Distributors")
    table.add_column("Name", style="cyan")
    table.add_column("Activation Code", style="green")
    table.add_column("Active", style="yellow")
    table.add_column("Created", style="dim")
    table.add_column("ID", style="dim")

    for row in result.data:
        table.add_row(
            row["name"],
            row["activation_code"],
            "Yes" if row["is_active"] else "No",
            row["created_at"][:10],
            row["id"][:8] + "...",
        )

    console.print(table)
    console.print(f"\nTotal: {len(result.data)} distributors")


@distributor.command("add")
@click.argument("name")
@click.option("--code", default=None, help="Custom activation code (auto-generated if omitted)")
def distributor_add(name, code):
    """Add a new distributor. Generates an activation code automatically."""
    sb = get_client()

    if code is None:
        code = generate_activation_code()

    # Check for duplicate code
    existing = sb.table("distributors").select("id").eq("activation_code", code).execute()
    if existing.data:
        console.print(f"[red]Error:[/red] Activation code '{code}' already exists.")
        return

    result = sb.table("distributors").insert({
        "name": name,
        "activation_code": code,
        "is_active": True,
    }).execute()

    if result.data:
        row = result.data[0]
        console.print(Panel(
            f"[bold green]Distributor created[/bold green]\n\n"
            f"  Name:            {row['name']}\n"
            f"  Activation Code: [bold yellow]{row['activation_code']}[/bold yellow]\n"
            f"  ID:              {row['id']}",
            title="New Distributor",
        ))
    else:
        console.print("[red]Failed to create distributor.[/red]")


@distributor.command("deactivate")
@click.argument("name_or_code")
def distributor_deactivate(name_or_code):
    """Deactivate a distributor by name or activation code."""
    sb = get_client()

    # Try to find by code first, then by name
    result = sb.table("distributors").select("*").eq("activation_code", name_or_code).execute()
    if not result.data:
        result = sb.table("distributors").select("*").eq("name", name_or_code).execute()
    if not result.data:
        console.print(f"[red]Distributor not found:[/red] {name_or_code}")
        return

    row = result.data[0]
    if not Confirm.ask(f"Deactivate distributor '{row['name']}' ({row['activation_code']})?"):
        return

    sb.table("distributors").update({"is_active": False}).eq("id", row["id"]).execute()
    console.print(f"[yellow]Distributor '{row['name']}' deactivated.[/yellow]")


@distributor.command("reactivate")
@click.argument("name_or_code")
def distributor_reactivate(name_or_code):
    """Reactivate a deactivated distributor by name or activation code."""
    sb = get_client()

    # Try to find by code first, then by name
    result = sb.table("distributors").select("*").eq("activation_code", name_or_code).execute()
    if not result.data:
        result = sb.table("distributors").select("*").eq("name", name_or_code).execute()
    if not result.data:
        console.print(f"[red]Distributor not found:[/red] {name_or_code}")
        return

    row = result.data[0]

    if row["is_active"]:
        console.print(f"[yellow]Distributor '{row['name']}' is already active.[/yellow]")
        return

    if not Confirm.ask(f"Reactivate distributor '{row['name']}' ({row['activation_code']})?"):
        return

    sb.table("distributors").update({"is_active": True}).eq("id", row["id"]).execute()
    console.print(f"[green]Distributor '{row['name']}' reactivated.[/green]")


@distributor.command("regenerate-code")
@click.argument("name")
def distributor_regenerate(name):
    """Generate a new activation code for a distributor."""
    sb = get_client()

    result = sb.table("distributors").select("*").eq("name", name).execute()
    if not result.data:
        console.print(f"[red]Distributor not found:[/red] {name}")
        return

    row = result.data[0]
    new_code = generate_activation_code()

    sb.table("distributors").update({
        "activation_code": new_code,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", row["id"]).execute()

    console.print(f"New activation code for '{name}': [bold yellow]{new_code}[/bold yellow]")


# ===========================================================================
# SCOOTERS
# ===========================================================================

@cli.group()
def scooter():
    """Manage scooters."""
    pass


@scooter.command("list")
@click.option("--distributor", "-d", default=None, help="Filter by distributor name")
def scooter_list(distributor):
    """List all scooters, optionally filtered by distributor."""
    sb = get_client()

    query = sb.table("scooters").select("*, distributors(name)")
    if distributor:
        # Get distributor ID first
        dist = sb.table("distributors").select("id").eq("name", distributor).execute()
        if not dist.data:
            console.print(f"[red]Distributor not found:[/red] {distributor}")
            return
        query = query.eq("distributor_id", dist.data[0]["id"])

    result = query.order("created_at").execute()

    table = Table(title="Scooters")
    table.add_column("ZYD Serial", style="cyan")
    table.add_column("Model", style="green")
    table.add_column("HW Ver", style="magenta")
    table.add_column("Distributor", style="yellow")
    table.add_column("Notes", style="dim")
    table.add_column("Created", style="dim")

    for row in result.data:
        dist_name = row.get("distributors", {})
        if isinstance(dist_name, dict):
            dist_name = dist_name.get("name", "?")
        else:
            dist_name = "?"
        table.add_row(
            row["zyd_serial"],
            row.get("model") or "",
            row.get("hw_version") or "-",
            dist_name,
            row.get("notes") or "",
            row["created_at"][:10],
        )

    console.print(table)
    console.print(f"\nTotal: {len(result.data)} scooters")


@scooter.command("add")
@click.argument("zyd_serial")
@click.argument("distributor_name")
@click.option("--model", default=None, help="Scooter model name")
@click.option("--hw-version", default=None, help="Hardware version (e.g., V1.0)")
@click.option("--notes", default=None, help="Optional notes")
def scooter_add(zyd_serial, distributor_name, model, hw_version, notes):
    """Add a scooter and assign it to a distributor."""
    sb = get_client()

    # Find distributor
    dist = sb.table("distributors").select("id, name").eq("name", distributor_name).execute()
    if not dist.data:
        console.print(f"[red]Distributor not found:[/red] {distributor_name}")
        return

    # Check for duplicate serial
    existing = sb.table("scooters").select("id").eq("zyd_serial", zyd_serial).execute()
    if existing.data:
        console.print(f"[red]Scooter serial already exists:[/red] {zyd_serial}")
        return

    result = sb.table("scooters").insert({
        "zyd_serial": zyd_serial,
        "distributor_id": dist.data[0]["id"],
        "model": model,
        "hw_version": hw_version,
        "notes": notes,
    }).execute()

    if result.data:
        console.print(
            f"[green]Scooter added:[/green] {zyd_serial} -> {dist.data[0]['name']}"
        )
    else:
        console.print("[red]Failed to add scooter.[/red]")


@scooter.command("add-batch")
@click.argument("distributor_name")
@click.argument("serials", nargs=-1)
@click.option("--model", default=None, help="Model for all scooters")
@click.option("--hw-version", default=None, help="Hardware version for all scooters")
def scooter_add_batch(distributor_name, serials, model, hw_version):
    """Add multiple scooters at once.

    Example: python admin.py scooter add-batch "My Dist" ZYD001 ZYD002 ZYD003 --hw-version V1.0
    """
    sb = get_client()

    dist = sb.table("distributors").select("id, name").eq("name", distributor_name).execute()
    if not dist.data:
        console.print(f"[red]Distributor not found:[/red] {distributor_name}")
        return

    dist_id = dist.data[0]["id"]
    added = 0
    skipped = 0

    for serial in serials:
        serial = serial.strip()
        if not serial:
            continue

        existing = sb.table("scooters").select("id").eq("zyd_serial", serial).execute()
        if existing.data:
            console.print(f"  [yellow]Skipped (exists):[/yellow] {serial}")
            skipped += 1
            continue

        sb.table("scooters").insert({
            "zyd_serial": serial,
            "distributor_id": dist_id,
            "model": model,
            "hw_version": hw_version,
        }).execute()
        console.print(f"  [green]Added:[/green] {serial}")
        added += 1

    console.print(f"\nDone: {added} added, {skipped} skipped")


@scooter.command("remove")
@click.argument("zyd_serial")
def scooter_remove(zyd_serial):
    """Remove a scooter by serial number."""
    sb = get_client()

    existing = sb.table("scooters").select("*").eq("zyd_serial", zyd_serial).execute()
    if not existing.data:
        console.print(f"[red]Scooter not found:[/red] {zyd_serial}")
        return

    if not Confirm.ask(f"Remove scooter '{zyd_serial}'?"):
        return

    sb.table("scooters").delete().eq("zyd_serial", zyd_serial).execute()
    console.print(f"[yellow]Scooter '{zyd_serial}' removed.[/yellow]")


# ===========================================================================
# FIRMWARE
# ===========================================================================

@cli.group()
def firmware():
    """Manage firmware versions and binaries."""
    pass


@firmware.command("list")
def firmware_list():
    """List all firmware versions."""
    sb = get_client()
    result = sb.table("firmware_versions").select("*").order("created_at", desc=True).execute()

    # Fetch HW targets for each firmware
    hw_targets_map = {}
    for fw in result.data:
        targets_result = sb.table("firmware_hw_targets").select("hw_version").eq("firmware_version_id", fw["id"]).execute()
        hw_versions = [t["hw_version"] for t in targets_result.data]
        hw_targets_map[fw["id"]] = ", ".join(hw_versions) if hw_versions else "-"

    table = Table(title="Firmware Versions")
    table.add_column("Version", style="cyan")
    table.add_column("Target HW", style="green")
    table.add_column("Access", style="magenta")
    table.add_column("Min SW", style="yellow")
    table.add_column("File Path", style="dim")
    table.add_column("Size", style="dim")
    table.add_column("Active", style="yellow")
    table.add_column("Created", style="dim")

    for row in result.data:
        size = row.get("file_size_bytes") or 0
        size_str = f"{size / 1024:.1f} KB" if size > 0 else "?"
        access_level = row.get("access_level", "distributor")
        table.add_row(
            row["version_label"],
            hw_targets_map.get(row["id"], "-"),
            access_level,
            row.get("min_sw_version") or "-",
            row["file_path"],
            size_str,
            "Yes" if row["is_active"] else "No",
            row["created_at"][:10],
        )

    console.print(table)
    console.print(f"\nTotal: {len(result.data)} firmware versions")


@firmware.command("upload")
@click.argument("file_path", type=click.Path(exists=True))
@click.argument("version_label")
@click.argument("target_hw_versions")
@click.option("--min-sw", default=None, help="Minimum current SW version required")
@click.option("--notes", default=None, help="Release notes")
@click.option("--access", type=click.Choice(["public", "distributor"]), default="distributor",
              help="Access level: public (anyone) or distributor (auth required)")
def firmware_upload(file_path, version_label, target_hw_versions, min_sw, notes, access):
    """Upload a firmware binary and create a version record.

    TARGET_HW_VERSIONS can be a single version or comma-separated list.

    Examples:
        python admin.py firmware upload ./fw.bin V2.3 V1.0
        python admin.py firmware upload ./fw.bin V2.3 "V1.0,V1.1,V2.0" --access public
    """
    sb = get_client()
    file_path = Path(file_path)

    # Parse HW versions (support comma-separated)
    hw_versions = [v.strip() for v in target_hw_versions.split(",")]

    if not file_path.suffix == ".bin":
        if not Confirm.ask(f"File does not have .bin extension ({file_path.name}). Continue?"):
            return

    file_size = file_path.stat().st_size
    if file_size < 1024:
        console.print("[red]Error:[/red] File too small (< 1KB). Are you sure this is firmware?")
        return
    if file_size > 512 * 1024:
        console.print("[red]Error:[/red] File too large (> 512KB).")
        return

    console.print(f"File:       {file_path.name}")
    console.print(f"Size:       {file_size / 1024:.1f} KB ({file_size} bytes)")
    console.print(f"Version:    {version_label}")
    console.print(f"Target HW:  {', '.join(hw_versions)}")
    console.print(f"Access:     {access}")
    if min_sw:
        console.print(f"Min SW:     {min_sw}")
    console.print()

    if not Confirm.ask("Upload this firmware?"):
        return

    # Upload to storage bucket
    storage_path = file_path.name
    console.print(f"Uploading to storage bucket 'firmware-binaries/{storage_path}'...")

    with open(file_path, "rb") as f:
        file_data = f.read()

    try:
        sb.storage.from_("firmware-binaries").upload(
            storage_path,
            file_data,
            file_options={"content-type": "application/octet-stream"},
        )
        console.print("[green]File uploaded to storage.[/green]")
    except Exception as e:
        error_msg = str(e)
        if "Duplicate" in error_msg or "already exists" in error_msg:
            if Confirm.ask("File already exists in storage. Overwrite?"):
                sb.storage.from_("firmware-binaries").update(
                    storage_path,
                    file_data,
                    file_options={"content-type": "application/octet-stream"},
                )
                console.print("[yellow]File overwritten in storage.[/yellow]")
            else:
                return
        else:
            console.print(f"[red]Upload failed:[/red] {e}")
            return

    # Create database record
    result = sb.table("firmware_versions").insert({
        "version_label": version_label,
        "file_path": storage_path,
        "file_size_bytes": file_size,
        "min_sw_version": min_sw,
        "release_notes": notes,
        "access_level": access,
        "is_active": True,
    }).execute()

    if result.data:
        firmware_id = result.data[0]["id"]

        # Create HW target mappings
        console.print("[cyan]Creating HW target mappings...[/cyan]")
        for hw_ver in hw_versions:
            sb.table("firmware_hw_targets").insert({
                "firmware_version_id": firmware_id,
                "hw_version": hw_ver,
            }).execute()
            console.print(f"  [green]✓[/green] Linked to HW {hw_ver}")

        console.print(Panel(
            f"[bold green]Firmware version created[/bold green]\n\n"
            f"  Version:    {version_label}\n"
            f"  Target HW:  {', '.join(hw_versions)}\n"
            f"  Access:     {access}\n"
            f"  File:       {storage_path}\n"
            f"  Size:       {file_size / 1024:.1f} KB\n"
            f"  ID:         {firmware_id}",
            title="Firmware Uploaded",
        ))
    else:
        console.print("[red]Failed to create firmware record.[/red]")


@firmware.command("deactivate")
@click.argument("version_label")
def firmware_deactivate(version_label):
    """Deactivate a firmware version (stops it being offered to devices)."""
    sb = get_client()

    result = sb.table("firmware_versions").select("*").eq("version_label", version_label).execute()
    if not result.data:
        console.print(f"[red]Firmware version not found:[/red] {version_label}")
        return

    row = result.data[0]
    if not Confirm.ask(f"Deactivate firmware '{row['version_label']}'?"):
        return

    sb.table("firmware_versions").update({"is_active": False}).eq("id", row["id"]).execute()
    console.print(f"[yellow]Firmware '{version_label}' deactivated.[/yellow]")


@firmware.command("add-hw-target")
@click.argument("version_label")
@click.argument("hw_version")
def firmware_add_hw_target(version_label, hw_version):
    """Add a hardware version target to existing firmware.

    Example: python admin.py firmware add-hw-target V2.3 V1.1
    """
    sb = get_client()

    # Find firmware
    result = sb.table("firmware_versions").select("id, version_label").eq("version_label", version_label).execute()
    if not result.data:
        console.print(f"[red]Firmware version not found:[/red] {version_label}")
        return

    firmware_id = result.data[0]["id"]

    # Check if already exists
    existing = sb.table("firmware_hw_targets").select("id").eq("firmware_version_id", firmware_id).eq("hw_version", hw_version).execute()
    if existing.data:
        console.print(f"[yellow]HW version '{hw_version}' already linked to firmware '{version_label}'[/yellow]")
        return

    # Add mapping
    sb.table("firmware_hw_targets").insert({
        "firmware_version_id": firmware_id,
        "hw_version": hw_version,
    }).execute()

    console.print(f"[green]Added HW version '{hw_version}' to firmware '{version_label}'[/green]")


@firmware.command("remove-hw-target")
@click.argument("version_label")
@click.argument("hw_version")
def firmware_remove_hw_target(version_label, hw_version):
    """Remove a hardware version target from firmware.

    Example: python admin.py firmware remove-hw-target V2.3 V1.0
    """
    sb = get_client()

    # Find firmware
    result = sb.table("firmware_versions").select("id, version_label").eq("version_label", version_label).execute()
    if not result.data:
        console.print(f"[red]Firmware version not found:[/red] {version_label}")
        return

    firmware_id = result.data[0]["id"]

    # Check if exists
    existing = sb.table("firmware_hw_targets").select("id").eq("firmware_version_id", firmware_id).eq("hw_version", hw_version).execute()
    if not existing.data:
        console.print(f"[yellow]HW version '{hw_version}' not linked to firmware '{version_label}'[/yellow]")
        return

    if not Confirm.ask(f"Remove HW target '{hw_version}' from firmware '{version_label}'?"):
        return

    # Remove mapping
    sb.table("firmware_hw_targets").delete().eq("id", existing.data[0]["id"]).execute()
    console.print(f"[yellow]Removed HW version '{hw_version}' from firmware '{version_label}'[/yellow]")


@firmware.command("set-access")
@click.argument("version_label")
@click.argument("access_level", type=click.Choice(["public", "distributor"]))
def firmware_set_access(version_label, access_level):
    """Change the access level of firmware (public or distributor).

    Example: python admin.py firmware set-access V2.3 public
    """
    sb = get_client()

    result = sb.table("firmware_versions").select("id, version_label, access_level").eq("version_label", version_label).execute()
    if not result.data:
        console.print(f"[red]Firmware version not found:[/red] {version_label}")
        return

    row = result.data[0]
    old_access = row.get("access_level", "distributor")

    if old_access == access_level:
        console.print(f"[yellow]Firmware '{version_label}' is already '{access_level}'[/yellow]")
        return

    if not Confirm.ask(f"Change firmware '{version_label}' access from '{old_access}' to '{access_level}'?"):
        return

    sb.table("firmware_versions").update({"access_level": access_level}).eq("id", row["id"]).execute()
    console.print(f"[green]Firmware '{version_label}' access changed to '{access_level}'[/green]")


# ===========================================================================
# TELEMETRY
# ===========================================================================

@cli.group()
def telemetry():
    """View telemetry data from scooters."""
    pass


@telemetry.command("list")
@click.option("--limit", "-n", default=50, help="Number of records to show")
@click.option("--zyd", default=None, help="Filter by ZYD serial number")
def telemetry_list(limit, zyd):
    """List telemetry snapshots."""
    sb = get_client()

    query = sb.table("telemetry_snapshots").select("*")
    if zyd:
        query = query.eq("zyd_serial", zyd)

    result = query.order("captured_at", desc=True).limit(limit).execute()

    table = Table(title="Telemetry Snapshots")
    table.add_column("Captured", style="dim")
    table.add_column("ZYD Serial", style="cyan")
    table.add_column("HW Ver", style="green")
    table.add_column("SW Ver", style="yellow")
    table.add_column("Odometer (km)", style="blue")
    table.add_column("Battery Cycles", style="magenta")
    table.add_column("Notes", style="dim")

    for row in result.data:
        table.add_row(
            row["captured_at"][:16].replace("T", " "),
            row["zyd_serial"],
            row.get("hw_version") or "-",
            row.get("sw_version") or "-",
            f"{row['odometer_km']:.1f}" if row.get("odometer_km") else "-",
            str(row["battery_cycles"]) if row.get("battery_cycles") else "-",
            (row.get("notes") or "")[:30],
        )

    console.print(table)
    console.print(f"\nShowing {len(result.data)} of {limit} max records")


@telemetry.command("stats")
def telemetry_stats():
    """Show telemetry statistics."""
    sb = get_client()

    all_data = sb.table("telemetry_snapshots").select("*").execute()
    total = len(all_data.data)

    if total == 0:
        console.print("[yellow]No telemetry data yet.[/yellow]")
        return

    unique_scooters = len(set(row["zyd_serial"] for row in all_data.data))
    hw_versions = {}
    sw_versions = {}
    total_odometer = 0
    odometer_count = 0
    total_battery_cycles = 0
    battery_count = 0

    for row in all_data.data:
        hw = row.get("hw_version")
        if hw:
            hw_versions[hw] = hw_versions.get(hw, 0) + 1

        sw = row.get("sw_version")
        if sw:
            sw_versions[sw] = sw_versions.get(sw, 0) + 1

        if row.get("odometer_km"):
            total_odometer += float(row["odometer_km"])
            odometer_count += 1

        if row.get("battery_cycles"):
            total_battery_cycles += int(row["battery_cycles"])
            battery_count += 1

    avg_odometer = total_odometer / odometer_count if odometer_count > 0 else 0
    avg_battery = total_battery_cycles / battery_count if battery_count > 0 else 0

    console.print(Panel(
        f"[bold]Telemetry Statistics[/bold]\n\n"
        f"  Total snapshots:      {total}\n"
        f"  Unique scooters:      {unique_scooters}\n"
        f"  Avg odometer (km):    {avg_odometer:.1f}\n"
        f"  Avg battery cycles:   {avg_battery:.0f}\n\n"
        f"[bold]HW Versions:[/bold]\n" +
        "\n".join(f"  {hw}: {count}" for hw, count in sorted(hw_versions.items())) +
        f"\n\n[bold]SW Versions:[/bold]\n" +
        "\n".join(f"  {sw}: {count}" for sw, count in sorted(sw_versions.items())),
        title="Telemetry Stats",
    ))


# ===========================================================================
# UPLOAD LOGS
# ===========================================================================

@cli.group()
def logs():
    """View firmware upload logs."""
    pass


@logs.command("list")
@click.option("--distributor", "-d", default=None, help="Filter by distributor name")
@click.option("--status", "-s", default=None, help="Filter by status (started/completed/failed)")
@click.option("--limit", "-n", default=50, help="Number of records to show")
def logs_list(distributor, status, limit):
    """List firmware upload logs."""
    sb = get_client()

    query = sb.table("firmware_uploads").select(
        "*, scooters(zyd_serial), firmware_versions(version_label), distributors(name)"
    )

    if status:
        query = query.eq("status", status)

    if distributor:
        dist = sb.table("distributors").select("id").eq("name", distributor).execute()
        if not dist.data:
            console.print(f"[red]Distributor not found:[/red] {distributor}")
            return
        query = query.eq("distributor_id", dist.data[0]["id"])

    result = query.order("started_at", desc=True).limit(limit).execute()

    table = Table(title="Firmware Upload Logs")
    table.add_column("Date", style="dim")
    table.add_column("Scooter", style="cyan")
    table.add_column("Firmware", style="green")
    table.add_column("Distributor", style="yellow")
    table.add_column("Old SW", style="dim")
    table.add_column("Status")
    table.add_column("Error", style="red")

    for row in result.data:
        serial = row.get("scooters", {})
        if isinstance(serial, dict):
            serial = serial.get("zyd_serial", "?")
        else:
            serial = "?"

        fw = row.get("firmware_versions", {})
        if isinstance(fw, dict):
            fw = fw.get("version_label", "?")
        else:
            fw = "?"

        dist_name = row.get("distributors", {})
        if isinstance(dist_name, dict):
            dist_name = dist_name.get("name", "?")
        else:
            dist_name = "?"

        status_val = row.get("status", "?")
        if status_val == "completed":
            status_display = "[green]completed[/green]"
        elif status_val == "failed":
            status_display = "[red]failed[/red]"
        else:
            status_display = f"[yellow]{status_val}[/yellow]"

        table.add_row(
            (row.get("started_at") or "")[:16],
            serial,
            fw,
            dist_name,
            row.get("old_sw_version") or "-",
            status_display,
            (row.get("error_message") or "")[:40],
        )

    console.print(table)
    console.print(f"\nShowing {len(result.data)} of {limit} max records")


@logs.command("stats")
def logs_stats():
    """Show upload statistics summary."""
    sb = get_client()

    all_uploads = sb.table("firmware_uploads").select("status").execute()

    total = len(all_uploads.data)
    completed = sum(1 for r in all_uploads.data if r["status"] == "completed")
    failed = sum(1 for r in all_uploads.data if r["status"] == "failed")
    started = sum(1 for r in all_uploads.data if r["status"] == "started")

    console.print(Panel(
        f"[bold]Upload Statistics[/bold]\n\n"
        f"  Total uploads:   {total}\n"
        f"  Completed:       [green]{completed}[/green]\n"
        f"  Failed:          [red]{failed}[/red]\n"
        f"  In progress:     [yellow]{started}[/yellow]\n"
        f"  Success rate:    {completed / total * 100:.1f}%" if total > 0 else "N/A",
        title="Stats",
    ))


# ===========================================================================
# QUICK SETUP
# ===========================================================================

@cli.command("setup")
def quick_setup():
    """Interactive setup wizard — create a distributor, add scooters, upload firmware."""
    sb = get_client()

    console.print(Panel(
        "[bold]Gen3 Firmware Updater — Quick Setup[/bold]\n\n"
        "This wizard will walk you through:\n"
        "  1. Creating a distributor with an activation code\n"
        "  2. Adding scooter serial numbers\n"
        "  3. Uploading firmware",
        title="Setup Wizard",
    ))

    # Step 1: Distributor
    console.print("\n[bold]Step 1: Create Distributor[/bold]")
    dist_name = Prompt.ask("Distributor name")
    code = generate_activation_code()

    result = sb.table("distributors").insert({
        "name": dist_name,
        "activation_code": code,
        "is_active": True,
    }).execute()

    if not result.data:
        console.print("[red]Failed to create distributor.[/red]")
        return

    dist_id = result.data[0]["id"]
    console.print(f"  Created: {dist_name}")
    console.print(f"  Activation Code: [bold yellow]{code}[/bold yellow]")

    # Step 2: Scooters
    console.print("\n[bold]Step 2: Add Scooters[/bold]")
    console.print("Enter ZYD serial numbers (one per line, empty line to finish):")

    scooter_count = 0
    while True:
        serial = Prompt.ask("  Serial", default="")
        if not serial:
            break

        existing = sb.table("scooters").select("id").eq("zyd_serial", serial).execute()
        if existing.data:
            console.print(f"  [yellow]Already exists, skipping[/yellow]")
            continue

        sb.table("scooters").insert({
            "zyd_serial": serial,
            "distributor_id": dist_id,
        }).execute()
        scooter_count += 1
        console.print(f"  [green]Added[/green]")

    console.print(f"  Total scooters added: {scooter_count}")

    # Step 3: Firmware
    console.print("\n[bold]Step 3: Upload Firmware[/bold]")
    if Confirm.ask("Upload a firmware file now?"):
        fw_path = Prompt.ask("Path to .bin file")
        fw_path = Path(fw_path.strip().strip("'\""))

        if not fw_path.exists():
            console.print(f"[red]File not found:[/red] {fw_path}")
            return

        version_label = Prompt.ask("Firmware version label (e.g. V2.3)")
        target_hw = Prompt.ask("Target controller HW version (e.g. V1.0)")

        file_size = fw_path.stat().st_size
        storage_path = fw_path.name

        with open(fw_path, "rb") as f:
            file_data = f.read()

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
                console.print(f"[red]Upload failed:[/red] {e}")
                return

        sb.table("firmware_versions").insert({
            "version_label": version_label,
            "file_path": storage_path,
            "file_size_bytes": file_size,
            "target_hw_version": target_hw,
            "is_active": True,
        }).execute()

        console.print(f"  [green]Firmware uploaded:[/green] {version_label} ({file_size / 1024:.1f} KB)")

    # Summary
    console.print(Panel(
        f"[bold green]Setup Complete![/bold green]\n\n"
        f"  Distributor:     {dist_name}\n"
        f"  Activation Code: [bold yellow]{code}[/bold yellow]\n"
        f"  Scooters Added:  {scooter_count}\n\n"
        f"Give the activation code to the distributor.\n"
        f"They enter it in the Android app to begin updating scooters.",
        title="Done",
    ))


# ===========================================================================
# ENTRY POINT
# ===========================================================================

if __name__ == "__main__":
    cli()
