/**
 * Settings Page
 * Manage reference data: Scooter Models, Battery Variants, Colours, Block Codes.
 * Tabbed interface with CRUD for each reference table.
 */

const SettingsPage = (() => {
    const { $, $$, toast, formatDate } = Utils;

    // Current active tab
    let activeTab = 'models';

    // Tab configurations
    const tabs = {
        models: {
            label: 'Models',
            resource: 'settings',
            listAction: 'list-models',
            createAction: 'create-model',
            updateAction: 'update-model',
            deactivateAction: 'deactivate-model',
            dataKey: 'models',
            columns: [
                { key: 'code', label: 'Code' },
                { key: 'name', label: 'Name' },
                { key: 'description', label: 'Description', format: (val) => val || '-' },
                { key: 'is_active', label: 'Status', format: (val) =>
                    `<span class="badge ${val ? 'badge-active' : 'badge-inactive'}">${val ? 'Active' : 'Inactive'}</span>`
                }
            ],
            formFields: (item) => [
                { name: 'code', label: 'Code (2 digits)', type: 'text', value: item?.code || '', placeholder: 'e.g. 08', required: true },
                { name: 'name', label: 'Name', type: 'text', value: item?.name || '', placeholder: 'e.g. Advance', required: true },
                { name: 'description', label: 'Description', type: 'text', value: item?.description || '', placeholder: 'e.g. Premium all-rounder' }
            ]
        },
        variants: {
            label: 'Battery Variants',
            resource: 'settings',
            listAction: 'list-variants',
            createAction: 'create-variant',
            updateAction: 'update-variant',
            deactivateAction: 'deactivate-variant',
            dataKey: 'variants',
            columns: [
                { key: 'code', label: 'Code' },
                { key: 'name', label: 'Name' },
                { key: 'capacity_ah', label: 'Capacity', format: (val) => val ? `${val} Ah` : '-' },
                { key: 'voltage', label: 'Voltage', format: (val) => val ? `${val}V` : '-' },
                { key: 'is_active', label: 'Status', format: (val) =>
                    `<span class="badge ${val ? 'badge-active' : 'badge-inactive'}">${val ? 'Active' : 'Inactive'}</span>`
                }
            ],
            formFields: (item) => [
                { name: 'code', label: 'Code (1 letter)', type: 'text', value: item?.code || '', placeholder: 'e.g. C', required: true },
                { name: 'name', label: 'Name', type: 'text', value: item?.name || '', placeholder: 'e.g. 12Ah', required: true },
                { name: 'capacity_ah', label: 'Capacity (Ah)', type: 'number', value: item?.capacity_ah || '', placeholder: '12.0', required: true },
                { name: 'voltage', label: 'Voltage (V)', type: 'number', value: item?.voltage || '48.0', placeholder: '48.0' },
                { name: 'description', label: 'Description', type: 'text', value: item?.description || '', placeholder: 'Maximum range battery' }
            ]
        },
        colours: {
            label: 'Colours',
            resource: 'settings',
            listAction: 'list-colours',
            createAction: 'create-colour',
            updateAction: 'update-colour',
            deactivateAction: 'deactivate-colour',
            dataKey: 'colours',
            columns: [
                { key: 'code', label: 'Code' },
                { key: 'name', label: 'Name' },
                { key: 'hex_colour', label: 'Colour', format: (val) =>
                    val ? `<span style="display:inline-block;width:18px;height:18px;background:${val};border:1px solid #ccc;border-radius:3px;vertical-align:middle;margin-right:6px;"></span>${val}` : '-'
                },
                { key: 'is_active', label: 'Status', format: (val) =>
                    `<span class="badge ${val ? 'badge-active' : 'badge-inactive'}">${val ? 'Active' : 'Inactive'}</span>`
                }
            ],
            formFields: (item) => [
                { name: 'code', label: 'Code (1 digit)', type: 'text', value: item?.code || '', placeholder: 'e.g. 1', required: true },
                { name: 'name', label: 'Name', type: 'text', value: item?.name || '', placeholder: 'e.g. Black', required: true },
                { name: 'hex_colour', label: 'Hex Colour', type: 'text', value: item?.hex_colour || '', placeholder: '#000000' }
            ]
        },
        blocks: {
            label: 'Zone Codes',
            resource: 'settings',
            listAction: 'list-blocks',
            createAction: 'create-block',
            updateAction: 'update-block',
            deactivateAction: 'deactivate-block',
            dataKey: 'blocks',
            columns: [
                { key: 'code', label: 'Code' },
                { key: 'name', label: 'Name' },
                { key: 'regions', label: 'Regions', format: (val) => Array.isArray(val) ? val.join(', ') : '-' },
                { key: 'is_active', label: 'Status', format: (val) =>
                    `<span class="badge ${val ? 'badge-active' : 'badge-inactive'}">${val ? 'Active' : 'Inactive'}</span>`
                }
            ],
            formFields: (item) => [
                { name: 'code', label: 'Code (1 char)', type: 'text', value: item?.code || '', placeholder: 'e.g. 0', required: true },
                { name: 'name', label: 'Name', type: 'text', value: item?.name || '', placeholder: 'e.g. UK/Ireland', required: true },
                { name: 'regions', label: 'Regions (comma-separated)', type: 'text', value: item?.regions ? item.regions.join(', ') : '', placeholder: 'GB, IE' }
            ]
        }
    };

    let currentData = {};

    function renderTabs() {
        let html = '<div class="settings-tabs">';
        for (const [key, tab] of Object.entries(tabs)) {
            const isActive = key === activeTab ? 'active' : '';
            html += `<button class="settings-tab ${isActive}" data-tab="${key}">${tab.label}</button>`;
        }
        html += '</div>';
        html += '<div id="settings-tab-content"></div>';
        return html;
    }

    let loadingTab = false;

    async function loadTab(tabKey) {
        if (loadingTab) return;
        loadingTab = true;
        activeTab = tabKey;
        const tab = tabs[tabKey];

        // Update tab button states
        $$('.settings-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabKey);
        });

        const contentEl = $('#settings-tab-content');
        if (!contentEl) {
            console.warn('Settings: #settings-tab-content not found');
            loadingTab = false;
            return;
        }

        contentEl.innerHTML = Utils.loading(`Loading ${tab.label}...`);

        try {
            console.log(`Settings: Loading ${tab.listAction}...`);
            const result = await API.call(tab.resource, tab.listAction);
            const data = result[tab.dataKey] || [];
            currentData[tabKey] = data;
            console.log(`Settings: Got ${data.length} ${tabKey}`);
            renderTabContent(tabKey, data);
        } catch (err) {
            console.error(`Settings: Failed to load ${tab.label}:`, err);
            contentEl.innerHTML = Utils.errorState(`Failed to load ${tab.label}`);
            toast(err.message, 'error');
        } finally {
            loadingTab = false;
        }
    }

    function renderTabContent(tabKey, data) {
        const tab = tabs[tabKey];
        const contentEl = $('#settings-tab-content');
        if (!contentEl) return;

        // Add create button above table
        let html = `<div style="margin-bottom: 12px; text-align: right;">
            <button class="btn btn-primary" id="settings-create-btn">Add ${tab.label.replace(/s$/, '')}</button>
        </div>`;

        html += '<div id="settings-table-container"></div>';
        contentEl.innerHTML = html;

        // Render table using TableComponent
        TableComponent.render('#settings-table-container', data, tab.columns, {
            onRowClick: (item) => showEditForm(tabKey, item),
            emptyMessage: `No ${tab.label.toLowerCase()} found`
        });

        // Create button handler
        $('#settings-create-btn')?.addEventListener('click', () => showCreateForm(tabKey));
    }

    function showCreateForm(tabKey) {
        const tab = tabs[tabKey];
        const fields = tab.formFields(null);

        FormComponent.show(`Add ${tab.label.replace(/s$/, '')}`, fields, async (formData) => {
            try {
                // Convert regions string to array for block codes
                if (tabKey === 'blocks' && formData.regions) {
                    formData.regions = formData.regions.split(',').map(r => r.trim()).filter(Boolean);
                }
                // Convert numeric fields
                if (tabKey === 'variants') {
                    if (formData.capacity_ah) formData.capacity_ah = parseFloat(formData.capacity_ah);
                    if (formData.voltage) formData.voltage = parseFloat(formData.voltage);
                }

                await API.call(tab.resource, tab.createAction, formData);
                toast(`${tab.label.replace(/s$/, '')} created successfully`, 'success');
                ModalComponent.close();
                await loadTab(tabKey);
                // Refresh ReferenceData cache
                await ReferenceData.loadAll();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    function showEditForm(tabKey, item) {
        const tab = tabs[tabKey];
        const fields = tab.formFields(item);

        // Disable code field for edits (codes shouldn't change)
        const codeField = fields.find(f => f.name === 'code');
        if (codeField) codeField.disabled = true;

        const actions = [
            {
                label: 'Save Changes',
                class: 'btn-primary',
                type: 'submit'
            }
        ];

        // Add deactivate/reactivate button
        if (item.is_active) {
            actions.push({
                label: 'Deactivate',
                class: 'btn-danger',
                onClick: async () => {
                    if (!confirm(`Deactivate this ${tab.label.replace(/s$/, '').toLowerCase()}?`)) return;
                    try {
                        await API.call(tab.resource, tab.deactivateAction, { id: item.id });
                        toast(`${tab.label.replace(/s$/, '')} deactivated`, 'success');
                        ModalComponent.close();
                        await loadTab(tabKey);
                        await ReferenceData.loadAll();
                    } catch (err) {
                        toast(err.message, 'error');
                    }
                }
            });
        }

        FormComponent.show(`Edit ${tab.label.replace(/s$/, '')}`, fields, async (formData) => {
            try {
                // Convert regions string to array for block codes
                if (tabKey === 'blocks' && formData.regions) {
                    formData.regions = formData.regions.split(',').map(r => r.trim()).filter(Boolean);
                }
                // Convert numeric fields
                if (tabKey === 'variants') {
                    if (formData.capacity_ah) formData.capacity_ah = parseFloat(formData.capacity_ah);
                    if (formData.voltage) formData.voltage = parseFloat(formData.voltage);
                }

                await API.call(tab.resource, tab.updateAction, { id: item.id, ...formData });
                toast(`${tab.label.replace(/s$/, '')} updated successfully`, 'success');
                ModalComponent.close();
                await loadTab(tabKey);
                await ReferenceData.loadAll();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    function init() {
        // Tab click handlers are set up in onNavigate
    }

    function onNavigate() {
        const contentEl = $('#settings-content');
        if (!contentEl) return;

        contentEl.innerHTML = renderTabs();

        // Set up tab click handlers
        $$('.settings-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabKey = btn.dataset.tab;
                if (tabKey) loadTab(tabKey);
            });
        });

        // Load default tab
        loadTab(activeTab);
    }

    function onLeave() {
        // Nothing to clean up
    }

    return { init, onNavigate, onLeave };
})();
