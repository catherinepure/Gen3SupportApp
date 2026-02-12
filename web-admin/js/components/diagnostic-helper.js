/**
 * DiagnosticHelper — shared component for requesting diagnostics.
 * Uses FormComponent instead of sequential prompt() dialogs.
 * Used by ScootersPage and LiveRunsPage.
 */
const DiagnosticHelper = (() => {
    const { toast } = Utils;

    /**
     * Show the diagnostic request form for a specific scooter.
     * @param {string} scooterId — Supabase UUID of the scooter
     * @param {Function} onSuccess — callback after successful request
     */
    function showRequestForm(scooterId, onSuccess) {
        const fields = [
            {
                name: 'reason',
                label: 'Reason',
                type: 'textarea',
                required: true,
                placeholder: 'e.g., Investigating battery drain reported by customer'
            },
            {
                name: 'max_duration_minutes',
                label: 'Recording Duration',
                type: 'select',
                value: '30',
                options: [
                    { value: '5', label: '5 minutes' },
                    { value: '10', label: '10 minutes' },
                    { value: '15', label: '15 minutes' },
                    { value: '30', label: '30 minutes' },
                    { value: '60', label: '60 minutes' }
                ]
            },
            {
                name: 'max_recordings',
                label: 'Max Recordings',
                type: 'select',
                value: '1',
                options: [
                    { value: '1', label: '1 recording' },
                    { value: '2', label: '2 recordings' },
                    { value: '3', label: '3 recordings' }
                ]
            },
            {
                name: 'data_types',
                label: 'Data Types',
                type: 'multiselect',
                value: ['telemetry', 'battery_history'],
                options: [
                    { value: 'telemetry', label: 'Live telemetry (speed, temp, RPM)' },
                    { value: 'battery_history', label: 'Battery history (voltage, current, SOC)' },
                    { value: 'fault_log', label: 'Fault log' }
                ]
            }
        ];

        FormComponent.show('Request Diagnostic', fields, async (formData) => {
            const response = await fetch(`${API.baseUrl}/update-scooter`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API.anonKey}`,
                    'apikey': API.anonKey,
                },
                body: JSON.stringify({
                    action: 'request-diagnostic',
                    session_token: API.getSessionToken(),
                    scooter_id: scooterId,
                    diagnostic_config: {
                        reason: formData.reason,
                        max_duration_minutes: parseInt(formData.max_duration_minutes) || 30,
                        max_recordings: parseInt(formData.max_recordings) || 1,
                        data_types: formData.data_types || ['telemetry', 'battery_history']
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to request diagnostic');
            }

            toast('Diagnostic requested successfully', 'success');
            if (onSuccess) onSuccess();
        }, { submitLabel: 'Send Request' });
    }

    /**
     * Show a scooter picker first, then the diagnostic form.
     * Used from the Live Runs page "New Request" button.
     * @param {Function} onSuccess — callback after successful request
     */
    async function showRequestWithPicker(onSuccess) {
        // Fetch scooters to populate picker
        try {
            const result = await API.call('scooters', 'list', { limit: 200 });
            const scooters = result.scooters || [];

            const options = scooters.map(s => ({
                value: s.id,
                label: s.zyd_serial || s.serial_number || s.id.substring(0, 8)
            }));

            if (options.length === 0) {
                toast('No scooters found', 'warning');
                return;
            }

            const pickerFields = [
                {
                    name: 'scooter_id',
                    label: 'Select Scooter',
                    type: 'select',
                    required: true,
                    options: options
                },
                {
                    name: 'reason',
                    label: 'Reason',
                    type: 'textarea',
                    required: true,
                    placeholder: 'e.g., Investigating battery drain reported by customer'
                },
                {
                    name: 'max_duration_minutes',
                    label: 'Recording Duration',
                    type: 'select',
                    value: '30',
                    options: [
                        { value: '5', label: '5 minutes' },
                        { value: '10', label: '10 minutes' },
                        { value: '15', label: '15 minutes' },
                        { value: '30', label: '30 minutes' },
                        { value: '60', label: '60 minutes' }
                    ]
                },
                {
                    name: 'max_recordings',
                    label: 'Max Recordings',
                    type: 'select',
                    value: '1',
                    options: [
                        { value: '1', label: '1 recording' },
                        { value: '2', label: '2 recordings' },
                        { value: '3', label: '3 recordings' }
                    ]
                },
                {
                    name: 'data_types',
                    label: 'Data Types',
                    type: 'multiselect',
                    value: ['telemetry', 'battery_history'],
                    options: [
                        { value: 'telemetry', label: 'Live telemetry (speed, temp, RPM)' },
                        { value: 'battery_history', label: 'Battery history (voltage, current, SOC)' },
                        { value: 'fault_log', label: 'Fault log' }
                    ]
                }
            ];

            FormComponent.show('Request Diagnostic', pickerFields, async (formData) => {
                if (!formData.scooter_id) {
                    throw new Error('Please select a scooter');
                }

                const response = await fetch(`${API.baseUrl}/update-scooter`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API.anonKey}`,
                        'apikey': API.anonKey,
                    },
                    body: JSON.stringify({
                        action: 'request-diagnostic',
                        session_token: API.getSessionToken(),
                        scooter_id: formData.scooter_id,
                        diagnostic_config: {
                            reason: formData.reason,
                            max_duration_minutes: parseInt(formData.max_duration_minutes) || 30,
                            max_recordings: parseInt(formData.max_recordings) || 1,
                            data_types: formData.data_types || ['telemetry', 'battery_history']
                        }
                    })
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to request diagnostic');
                }

                toast('Diagnostic requested successfully', 'success');
                if (onSuccess) onSuccess();
            }, { submitLabel: 'Send Request' });
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    return { showRequestForm, showRequestWithPicker };
})();
