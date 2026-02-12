# Gen3 App — Strategy Alignment

| Strategy Objective | How the App Delivers |
|---|---|
| **Customer Contact & Recall Safety** — Direct contact with every registered customer for safety notices | Mandatory registration at setup captures email/phone. Push notifications (FCM) reach all users instantly. Notification templates allow targeting by role, hardware version, or specific user. |
| **Upsell & Lifecycle Value** — Increase customer lifetime value through accessories, servicing, new scooters | In-app Intercom messaging enables direct sales conversations. Push notification system supports promotional campaigns to segmented audiences. |
| **Usage Confirmation & Protection** — Confirm customers have read safety instructions before riding | Terms & Conditions system enforces acceptance before app use. Version-controlled T&C with region/language support. Full audit trail (IP, device, time-to-read). |
| **Future-Proofing for Leasing & Connected Services** — Scooter lockout for finance defaults, usage-based services | PIN-secured scooter lock/unlock via BLE. Remote lock capability per scooter. User-scooter ownership tracking in database. |
| **Technology Integration** — BLE/Wi-Fi diagnostics, firmware updates, usage logging | Full BLE telemetry (speed, battery, odometer, range). Over-the-air firmware updates. Telemetry logging to cloud on every connection. Headlight, cruise, and lock control via BLE commands. |
| **App-First Support Experience** — Troubleshooting tools and issue tracking | Intercom SDK with Fin AI agent for automated support. In-app message composer and conversation history. |
| **Reliability & Early Warning System** — Field data to flag high-frequency issues pre-emptively | Every BLE connection logs firmware versions, battery health (SOC, voltage, current, temperature), and odometer to Supabase. Data queryable by hardware version, region, and distributor. |
| **Distributor-Led Global Expansion** — Scale through partners with minimal HQ overhead | Distributor portal (web-admin) for scooter management, firmware uploads, and telemetry review. Role-based access (admin/manager/normal). Region-aware T&C and notifications. |
| **Operational Excellence & Lean Operations** — Data-driven decisions, automation | Automated firmware update notifications when new firmware is published. Notification templates with triggers (firmware update, scooter status, scheduled). Cloud-based scooter registry updated automatically on connection. |
| **Product Testing & QA** — Real-world usage data beyond lab testing | Real-world telemetry from every connected scooter: ride patterns, battery degradation, environmental conditions. Data segmented by hardware version and geography. |
| **Scale Advantage** — Every scooter sold improves economics | App infrastructure scales at near-zero marginal cost. Estimated platform cost at 100K connections/month: ~£55–£95/month (see cost table below). Self-service support via Fin AI at £0.72/resolution vs ~£4–£11 for human-handled tickets. |

## Estimated Platform Costs at 100,000 Connections/Month

*All costs converted at $1 = £0.73 (Feb 2026 rate). Services are billed in USD.*

| Service | What It Covers | Usage at 100K Connections/Mo | Est. Monthly Cost |
|---|---|---|---|
| **Supabase Pro** | Database, Edge Functions (2M included), 8GB storage included | ~400K Edge Function calls, ~100K telemetry rows | **£18** |
| **Supabase Compute** | Dedicated Postgres instance | May need upgrade at scale | **£0–£37** |
| **Supabase Storage Overage** | Database storage beyond 8GB included (£0.09/GB) | See storage growth table below | **£0–£7** |
| **SendGrid** | Verification & notification emails | ~10K emails (not every connection = new user) | **£0–£15** |
| **Firebase FCM** | Push notifications | Unlimited — free | **£0** |
| **Intercom Essential** | In-app support + Fin AI | 1 seat + £0.72 per AI resolution | **£21 + usage** |
| | | **Estimated total (excl. Fin AI resolutions)** | **~£55–£95/mo** |

### Database Storage Growth

Each telemetry record is ~750 bytes. With indexes and overhead (~40%), effective storage per row is ~1 KB. Supabase Pro includes 8GB; overage is £0.09/GB.

| Timeframe | Telemetry Rows (cumulative) | Est. DB Size (all tables + indexes) | Storage Overage Cost |
|---|---|---|---|
| **Year 1** | 1.2M | ~1.5 GB | £0 (within 8GB) |
| **Year 2** | 2.4M | ~3.0 GB | £0 (within 8GB) |
| **Year 3** | 3.6M | ~4.5 GB | £0 (within 8GB) |
| **Year 5** | 6.0M | ~7.5 GB | £0 (within 8GB) |
| **Year 5+** | >6.0M | >8 GB | ~£0.09/GB/mo |

**Note:** These estimates assume 100K connections/month = 100K new telemetry rows/month. If the average scooter connects daily (e.g. 10K active scooters x 30 days = 300K rows/month), storage would grow 3x faster. At that rate, the 8GB limit would be reached in ~2 years, adding ~£1.50–£4/month in overage. Even at aggressive growth, storage costs remain negligible.

**Intercom Fin AI:** Resolutions are billed at £0.72 each. At low support volumes (e.g. 2% of users contact support, 70% resolved by AI) this adds ~£1,020/month. This is significantly cheaper than staffing human agents across multiple markets and languages.

**Cost per connection: ~£0.001 (infrastructure only) or ~£0.011 including AI support.**
