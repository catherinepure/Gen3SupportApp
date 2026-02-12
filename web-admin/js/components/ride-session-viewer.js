/**
 * RideSessionViewer — shared component for viewing ride session details.
 * Used by ScootersPage (scooter detail) and LiveRunsPage.
 */
const RideSessionViewer = (() => {
    const { toast, formatDate } = Utils;

    async function show(sessionId) {
        try {
            const [sessionResp, samplesResp] = await Promise.all([
                fetch(`${API.supabaseUrl}/rest/v1/ride_sessions?id=eq.${sessionId}&select=*,scooters(zyd_serial,serial_number)`, {
                    headers: { 'apikey': API.anonKey, 'Authorization': `Bearer ${API.anonKey}` }
                }),
                fetch(`${API.supabaseUrl}/rest/v1/ride_telemetry?ride_session_id=eq.${sessionId}&select=*&order=sample_index.asc&limit=1000`, {
                    headers: { 'apikey': API.anonKey, 'Authorization': `Bearer ${API.anonKey}` }
                })
            ]);

            const sessions = await sessionResp.json();
            const samples = await samplesResp.json();
            const session = sessions[0];

            if (!session) {
                toast('Session not found', 'error');
                return;
            }

            const scooterLabel = session.scooters?.zyd_serial || session.scooters?.serial_number || session.scooter_id?.substring(0, 8) || 'Unknown';
            const duration = session.started_at && session.ended_at
                ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000)
                : 0;

            const triggerBadge = session.trigger_type === 'diagnostic'
                ? '<span class="badge badge-warning">diagnostic</span>'
                : '<span class="badge badge-inactive">manual</span>';

            const sections = [
                {
                    title: 'Session Info',
                    fields: [
                        { label: 'Scooter', value: scooterLabel },
                        { label: 'Trigger', value: triggerBadge, type: 'html' },
                        { label: 'Started', value: session.started_at, type: 'date' },
                        { label: 'Ended', value: session.ended_at, type: 'date' },
                        { label: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s` },
                        { label: 'Samples', value: `${session.sample_count || samples.length}` },
                        { label: 'Status', value: session.status }
                    ]
                }
            ];

            if (session.diagnostic_config) {
                const dc = session.diagnostic_config;
                const dcFields = [];
                if (dc.reason) dcFields.push({ label: 'Reason', value: dc.reason });
                if (dc.max_duration_minutes) dcFields.push({ label: 'Max Duration', value: `${dc.max_duration_minutes} min` });
                if (dc.data_types && dc.data_types.length > 0) dcFields.push({ label: 'Data Types', value: dc.data_types.join(', ') });
                sections.push({ title: 'Diagnostic Config', fields: dcFields });
            }

            // Summary stats
            if (samples.length > 0) {
                const speeds = samples.map(s => s.speed_kmh).filter(v => v != null);
                const batts = samples.map(s => s.battery_percent).filter(v => v != null);
                const faults = samples.filter(s => s.fault_code && s.fault_code !== 0);
                const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
                const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
                const battStart = batts.length ? batts[0] : '-';
                const battEnd = batts.length ? batts[batts.length - 1] : '-';

                sections.push({
                    title: 'Summary',
                    fields: [
                        { label: 'Max Speed', value: `${maxSpeed} km/h` },
                        { label: 'Avg Speed', value: `${avgSpeed} km/h` },
                        { label: 'Battery Start', value: `${battStart}%` },
                        { label: 'Battery End', value: `${battEnd}%` },
                        { label: 'Faults Detected', value: faults.length > 0
                            ? `<span style="color: red; font-weight: bold;">${faults.length} fault(s)</span>`
                            : 'None', type: 'html' }
                    ]
                });
            }

            // Samples table
            if (samples.length > 0) {
                let samplesHtml = `
                    <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width:100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="border-bottom: 1px solid #ddd; position: sticky; top: 0; background: white;">
                                <th style="padding:4px;">#</th>
                                <th style="padding:4px;">Time</th>
                                <th style="padding:4px;">Speed</th>
                                <th style="padding:4px;">Voltage</th>
                                <th style="padding:4px;">Current</th>
                                <th style="padding:4px;">Batt%</th>
                                <th style="padding:4px;">Motor&deg;C</th>
                                <th style="padding:4px;">Ctrl&deg;C</th>
                                <th style="padding:4px;">RPM</th>
                                <th style="padding:4px;">Fault</th>
                            </tr>
                        </thead>
                        <tbody>`;

                samples.forEach(s => {
                    const time = s.recorded_at ? new Date(s.recorded_at).toLocaleTimeString() : '-';
                    const faultStyle = s.fault_code ? 'color: red; font-weight: bold;' : '';
                    samplesHtml += `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding:4px;">${s.sample_index}</td>
                            <td style="padding:4px;">${time}</td>
                            <td style="padding:4px;">${s.speed_kmh ?? '-'} km/h</td>
                            <td style="padding:4px;">${s.battery_voltage ?? '-'}V</td>
                            <td style="padding:4px;">${s.battery_current ?? '-'}A</td>
                            <td style="padding:4px;">${s.battery_percent ?? '-'}%</td>
                            <td style="padding:4px;">${s.motor_temp ?? '-'}&deg;C</td>
                            <td style="padding:4px;">${s.controller_temp ?? '-'}&deg;C</td>
                            <td style="padding:4px;">${s.motor_rpm ?? '-'}</td>
                            <td style="padding:4px; ${faultStyle}">${s.fault_code ? '0x' + s.fault_code.toString(16).toUpperCase() : '-'}</td>
                        </tr>`;
                });

                samplesHtml += '</tbody></table></div>';
                sections.push({
                    title: `Telemetry Samples (${samples.length})`,
                    html: samplesHtml
                });
            }

            DetailModal.show('Ride Session: ' + scooterLabel, {
                sections,
                breadcrumbs: [
                    { label: 'Live Runs', onClick: () => { ModalComponent.close(); } },
                    { label: 'Session ' + sessionId.substring(0, 8) }
                ]
            });
        } catch (err) {
            toast('Failed to load ride session', 'error');
            console.error(err);
        }
    }

    return { show };
})();
