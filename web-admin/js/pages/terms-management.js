/**
 * Terms Management Page
 * List, view, upload, and manage T&C versions with acceptance statistics.
 * All API calls go through Edge Functions — no direct storage or service_role usage.
 */

const TermsManagementPage = (() => {
    const { $, toast, formatDate, formatBytes, loading, emptyState, errorState } = Utils;

    function init() {
        console.log('[terms-management] Initializing page module');
    }

    async function onNavigate() {
        console.log('[terms-management] Loading page');
        render();
        await loadTermsVersions();
    }

    function render() {
        const user = State.get('user');
        const region = user?.detected_region || 'US';
        const isAdmin = user?.user_level === 'admin';

        const html = `
            <div class="page-header">
                <h2>Terms & Conditions Management</h2>
                <p class="text-secondary">Upload, view, and manage T&C versions${isAdmin ? ' (Global Admin Access)' : ''}</p>
                <div class="page-actions">
                    <button class="btn btn-primary" id="upload-terms-btn">
                        &#8682; Upload New Version
                    </button>
                    <button class="btn btn-secondary" id="refresh-terms-btn">
                        &#8635; Refresh
                    </button>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h3>Filters</h3>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div class="form-group">
                            <label>Status</label>
                            <select class="form-control" id="filter-status">
                                <option value="">All</option>
                                <option value="active" selected>Active Only</option>
                                <option value="inactive">Inactive Only</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Region</label>
                            <select class="form-control" id="filter-region">
                                <option value="">All Regions</option>
                                <option value="US">US - United States</option>
                                <option value="GB">GB - United Kingdom</option>
                                <option value="DE">DE - Germany</option>
                                <option value="FR">FR - France</option>
                                <option value="ES">ES - Spain</option>
                                <option value="IT">IT - Italy</option>
                                <option value="NL">NL - Netherlands</option>
                                <option value="BE">BE - Belgium</option>
                                <option value="AT">AT - Austria</option>
                                <option value="CH">CH - Switzerland</option>
                                <option value="CA">CA - Canada</option>
                                <option value="AU">AU - Australia</option>
                                <option value="NZ">NZ - New Zealand</option>
                                <option value="JP">JP - Japan</option>
                                <option value="CN">CN - China</option>
                                <option value="IN">IN - India</option>
                                <option value="SG">SG - Singapore</option>
                                <option value="HK">HK - Hong Kong</option>
                                <option value="KR">KR - South Korea</option>
                                <option value="BR">BR - Brazil</option>
                                <option value="MX">MX - Mexico</option>
                                <option value="AR">AR - Argentina</option>
                                <option value="ZA">ZA - South Africa</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Language</label>
                            <select class="form-control" id="filter-language">
                                <option value="">All Languages</option>
                                <option value="en">English</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <option value="de">German</option>
                                <option value="zh">Chinese</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Version</label>
                            <input type="text" class="form-control" id="filter-version" placeholder="e.g., 1.0">
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3>T&C Versions</h3>
                </div>
                <div class="card-body">
                    <div id="termsTable">${loading()}</div>
                </div>
            </div>
        `;

        $('#terms-management-page').innerHTML = html;

        // Attach event handlers
        $('#upload-terms-btn')?.addEventListener('click', showUploadDialog);
        $('#refresh-terms-btn')?.addEventListener('click', () => loadTermsVersions());

        // Attach filter handlers
        $('#filter-status')?.addEventListener('change', applyFilters);
        $('#filter-region')?.addEventListener('change', applyFilters);
        $('#filter-language')?.addEventListener('change', applyFilters);
        $('#filter-version')?.addEventListener('input', applyFilters);
    }

    function applyFilters() {
        const allTerms = State.get('allTerms') || [];

        const statusFilter = $('#filter-status')?.value;
        const regionFilter = $('#filter-region')?.value;
        const languageFilter = $('#filter-language')?.value;
        const versionFilter = $('#filter-version')?.value.trim();

        let filtered = allTerms;

        if (statusFilter === 'active') {
            filtered = filtered.filter(t => t.is_active === true);
        } else if (statusFilter === 'inactive') {
            filtered = filtered.filter(t => t.is_active === false);
        }

        if (regionFilter) {
            filtered = filtered.filter(t => t.region_code === regionFilter);
        }

        if (languageFilter) {
            filtered = filtered.filter(t => t.language_code === languageFilter);
        }

        if (versionFilter) {
            filtered = filtered.filter(t => t.version.includes(versionFilter));
        }

        renderTermsTable(filtered);
    }

    // ========================================================================
    // Load terms via Edge Function (uses centralized API config)
    // ========================================================================

    async function loadTermsVersions() {
        try {
            const sessionToken = State.get('sessionToken');

            const response = await fetch(
                `${API.baseUrl}/terms/list`,
                {
                    method: 'GET',
                    headers: {
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                        'X-Session-Token': sessionToken
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to load terms: ${response.status}`);
            }

            const data = await response.json();

            // Store all terms in state for filtering
            State.set('allTerms', data.terms || []);

            // Apply current filters
            applyFilters();

        } catch (error) {
            console.error('[terms-management] Error loading terms:', error);
            const table = $('#termsTable');
            if (table) {
                table.innerHTML = errorState('Error loading terms: ' + error.message);
            }
        }
    }

    // ========================================================================
    // Render terms table
    // ========================================================================

    function renderTermsTable(terms) {
        if (terms.length === 0) {
            $('#termsTable').innerHTML = emptyState('No T&C versions found. Upload your first version to get started.');
            return;
        }

        const tableHtml = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Version</th>
                        <th>Language</th>
                        <th>Region</th>
                        <th>State</th>
                        <th>Status</th>
                        <th>Effective Date</th>
                        <th>File Size</th>
                        <th>Acceptances</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${terms.map(term => `
                        <tr>
                            <td>
                                <strong style="cursor: pointer; color: var(--primary); text-decoration: underline;"
                                        data-action="view-metadata" data-term-id="${term.id}">
                                    ${term.version}
                                </strong>
                            </td>
                            <td>${term.language_code.toUpperCase()}</td>
                            <td>${term.region_code}</td>
                            <td>${term.state_code || ''}</td>
                            <td>
                                ${term.is_active
                                    ? '<span class="badge badge-active">Active</span>'
                                    : '<span class="badge badge-inactive">Inactive</span>'}
                            </td>
                            <td>${formatDate(term.effective_date)}</td>
                            <td>${formatBytes(term.file_size_bytes)}</td>
                            <td>
                                <span class="badge badge-primary">${term.acceptance_count} users</span>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-outline" data-action="view" data-url="${term.public_url}">
                                    View
                                </button>
                                <button class="btn btn-sm btn-outline" data-action="toggle" data-id="${term.id}" data-active="${term.is_active}">
                                    ${term.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        $('#termsTable').innerHTML = tableHtml;

        // Attach event listeners
        $('#termsTable').querySelectorAll('button[data-action="view"]').forEach(btn => {
            btn.addEventListener('click', () => viewTerms(btn.dataset.url));
        });

        $('#termsTable').querySelectorAll('button[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', () => toggleActive(btn.dataset.id, btn.dataset.active !== 'true'));
        });

        $('#termsTable').querySelectorAll('[data-action="view-metadata"]').forEach(el => {
            el.addEventListener('click', () => {
                const termId = el.dataset.termId;
                const allTerms = State.get('allTerms') || [];
                const term = allTerms.find(t => t.id === termId);
                if (term) showMetadataModal(term);
            });
        });
    }

    // ========================================================================
    // View T&C document in modal
    // ========================================================================

    async function viewTerms(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load document: ${response.status}`);
            }

            const htmlContent = await response.text();

            const modalContent = `
                <div style="max-height: 70vh; overflow-y: auto; padding: 20px; border: 1px solid var(--gray-200); border-radius: var(--radius); background: white;">
                    ${htmlContent}
                </div>
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                    <button class="btn btn-sm btn-outline" onclick="window.open('${url}', '_blank')">
                        Open in New Tab
                    </button>
                </div>
            `;

            ModalComponent.show('Terms & Conditions Preview', modalContent, []);

        } catch (error) {
            console.error('[terms-management] Error loading document:', error);
            toast('Failed to load document: ' + error.message, 'error');
        }
    }

    // ========================================================================
    // Toggle active status via Edge Function
    // ========================================================================

    async function toggleActive(termsId, newStatus) {
        try {
            const sessionToken = State.get('sessionToken');

            const response = await fetch(
                `${API.baseUrl}/terms/toggle-active`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                        'X-Session-Token': sessionToken
                    },
                    body: JSON.stringify({
                        session_token: sessionToken,
                        terms_id: termsId,
                        is_active: newStatus
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to toggle status');
            }

            const data = await response.json();
            toast(`T&C ${data.is_active ? 'activated' : 'deactivated'} successfully!`, 'success');

            await loadTermsVersions();

        } catch (error) {
            console.error('[terms-management] Toggle error:', error);
            toast('Failed to update status: ' + error.message, 'error');
        }
    }

    // ========================================================================
    // Metadata modal
    // ========================================================================

    function showMetadataModal(term) {
        const user = State.get('user');
        const isAdmin = user?.user_level === 'admin';

        const metadataHtml = `
            <div class="metadata-view">
                <div style="display: grid; grid-template-columns: 200px 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="font-weight: bold;">ID:</div>
                    <div style="font-family: monospace; font-size: 12px;">${term.id}</div>

                    <div style="font-weight: bold;">Version:</div>
                    <div>${term.version}</div>

                    <div style="font-weight: bold;">Language:</div>
                    <div>${term.language_code.toUpperCase()}</div>

                    <div style="font-weight: bold;">Region:</div>
                    <div>${term.region_code}</div>

                    <div style="font-weight: bold;">State/Province:</div>
                    <div>${term.state_code || '<em style="color: var(--gray-400);">Country-level (no state)</em>'}</div>

                    <div style="font-weight: bold;">Document Type:</div>
                    <div>${term.document_type}</div>

                    <div style="font-weight: bold;">Title:</div>
                    <div>${term.title}</div>

                    <div style="font-weight: bold;">Status:</div>
                    <div>
                        ${term.is_active
                            ? '<span class="badge badge-active">Active</span>'
                            : '<span class="badge badge-inactive">Inactive</span>'}
                    </div>

                    <div style="font-weight: bold;">Effective Date:</div>
                    <div>${formatDate(term.effective_date)}</div>

                    <div style="font-weight: bold;">File Size:</div>
                    <div>${formatBytes(term.file_size_bytes)}</div>

                    <div style="font-weight: bold;">Acceptances:</div>
                    <div><span class="badge badge-primary">${term.acceptance_count} users</span></div>

                    <div style="font-weight: bold;">Storage Path:</div>
                    <div style="font-family: monospace; font-size: 12px; word-break: break-all;">${term.storage_path}</div>

                    <div style="font-weight: bold;">Public URL:</div>
                    <div style="font-family: monospace; font-size: 12px; word-break: break-all;">
                        <a href="${term.public_url}" target="_blank" style="color: var(--primary);">${term.public_url}</a>
                    </div>

                    <div style="font-weight: bold;">Created At:</div>
                    <div>${formatDate(term.created_at)}</div>
                </div>

                ${isAdmin ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--gray-200);">
                        <h4 style="margin-bottom: 15px;">Admin Actions</h4>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="btn btn-sm btn-outline" onclick="window.open('${term.public_url}', '_blank')">
                                View Document
                            </button>
                            <button class="btn btn-sm ${term.is_active ? 'btn-warning' : 'btn-primary'}" id="toggle-status-btn">
                                ${term.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button class="btn btn-sm btn-outline" id="edit-metadata-btn">
                                Edit Metadata
                            </button>
                        </div>
                    </div>
                ` : `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--gray-200);">
                        <button class="btn btn-sm btn-outline" onclick="window.open('${term.public_url}', '_blank')">
                            View Document
                        </button>
                    </div>
                `}
            </div>
        `;

        ModalComponent.show(`T&C Metadata: ${term.version} (${term.region_code})`, metadataHtml, []);

        // Attach admin action handlers if admin
        if (isAdmin) {
            setTimeout(() => {
                const toggleBtn = $('#toggle-status-btn');
                if (toggleBtn) {
                    toggleBtn.addEventListener('click', () => {
                        ModalComponent.hide();
                        toggleActive(term.id, !term.is_active);
                    });
                }

                const editBtn = $('#edit-metadata-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', () => {
                        ModalComponent.hide();
                        showEditMetadataModal(term);
                    });
                }
            }, 0);
        }
    }

    // ========================================================================
    // Edit metadata modal (admin only)
    // ========================================================================

    function showEditMetadataModal(term) {
        const editHtml = `
            <form id="editMetadataForm">
                <div class="form-group">
                    <label>Version</label>
                    <input type="text" class="form-control" value="${term.version}" disabled>
                    <small class="form-text">Version cannot be changed. Upload new version if needed.</small>
                </div>

                <div class="form-group">
                    <label>Language</label>
                    <input type="text" class="form-control" value="${term.language_code.toUpperCase()}" disabled>
                </div>

                <div class="form-group">
                    <label>Region</label>
                    <input type="text" class="form-control" value="${term.region_code}" disabled>
                </div>

                <div class="form-group">
                    <label>State/Province</label>
                    <input type="text" class="form-control" name="state_code" value="${term.state_code || ''}" placeholder="e.g., CA, NSW, QLD">
                    <small class="form-text">ISO 3166-2 subdivision code. Leave blank for country-level T&C.</small>
                </div>

                <div class="form-group">
                    <label>Title *</label>
                    <input type="text" class="form-control" name="title" value="${term.title}" required>
                </div>

                <div class="form-group">
                    <label>Effective Date *</label>
                    <input type="date" class="form-control" name="effective_date"
                           value="${term.effective_date.split('T')[0]}" required>
                </div>

                <div class="form-group">
                    <label>Status *</label>
                    <select class="form-control" name="is_active" required>
                        <option value="true" ${term.is_active ? 'selected' : ''}>Active</option>
                        <option value="false" ${!term.is_active ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
            </form>
        `;

        ModalComponent.show(`Edit Metadata: ${term.version} (${term.region_code})`, editHtml, [
            { label: 'Save Changes', class: 'btn-primary', onClick: () => handleUpdateMetadata(term.id) }
        ]);
    }

    async function handleUpdateMetadata(termId) {
        try {
            const form = $('#editMetadataForm');
            const formData = new FormData(form);
            const sessionToken = State.get('sessionToken');

            const title = formData.get('title');
            const stateCode = formData.get('state_code')?.trim() || null;
            const effectiveDate = formData.get('effective_date');
            const isActive = formData.get('is_active') === 'true';

            const updateResponse = await fetch(
                `${API.baseUrl}/terms/update-metadata`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                        'X-Session-Token': sessionToken
                    },
                    body: JSON.stringify({
                        session_token: sessionToken,
                        terms_id: termId,
                        title: title,
                        state_code: stateCode,
                        effective_date: new Date(effectiveDate).toISOString(),
                        is_active: isActive
                    })
                }
            );

            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                throw new Error(errorData.error || 'Failed to update metadata');
            }

            toast('Metadata updated successfully!', 'success');
            ModalComponent.hide();
            await loadTermsVersions();

        } catch (error) {
            console.error('[terms-management] Update error:', error);
            toast('Failed to update metadata: ' + error.message, 'error');
        }
    }

    // ========================================================================
    // Upload dialog — file uploads go through Edge Function only
    // ========================================================================

    function showUploadDialog() {
        const user = State.get('user');
        const region = user?.detected_region || 'US';

        const dialogHtml = `
            <form id="uploadForm">
                <div class="form-group">
                    <label>Version *</label>
                    <input type="text" class="form-control" name="version"
                           placeholder="e.g., 1.0, 1.1, 2.0" required>
                    <small class="form-text">Use semantic versioning. Version must be unique - no overwrites allowed.</small>
                </div>

                <div class="form-group">
                    <label>Language *</label>
                    <select class="form-control" name="language_code" required>
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="zh">Chinese</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Region *</label>
                    <select class="form-control" name="region_code" required>
                        <option value="US" ${region === 'US' ? 'selected' : ''}>US - United States</option>
                        <option value="GB" ${region === 'GB' ? 'selected' : ''}>GB - United Kingdom</option>
                        <option value="DE" ${region === 'DE' ? 'selected' : ''}>DE - Germany</option>
                        <option value="FR" ${region === 'FR' ? 'selected' : ''}>FR - France</option>
                        <option value="ES" ${region === 'ES' ? 'selected' : ''}>ES - Spain</option>
                        <option value="IT" ${region === 'IT' ? 'selected' : ''}>IT - Italy</option>
                        <option value="NL" ${region === 'NL' ? 'selected' : ''}>NL - Netherlands</option>
                        <option value="BE" ${region === 'BE' ? 'selected' : ''}>BE - Belgium</option>
                        <option value="AT" ${region === 'AT' ? 'selected' : ''}>AT - Austria</option>
                        <option value="CH" ${region === 'CH' ? 'selected' : ''}>CH - Switzerland</option>
                        <option value="CA" ${region === 'CA' ? 'selected' : ''}>CA - Canada</option>
                        <option value="AU" ${region === 'AU' ? 'selected' : ''}>AU - Australia</option>
                        <option value="NZ" ${region === 'NZ' ? 'selected' : ''}>NZ - New Zealand</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>State/Province (Optional)</label>
                    <input type="text" class="form-control" name="state_code"
                           placeholder="e.g., CA, NSW, QLD">
                    <small class="form-text">ISO 3166-2 subdivision code. Leave blank for country-level T&C.</small>
                </div>

                <div class="form-group">
                    <label>Title *</label>
                    <input type="text" class="form-control" name="title"
                           value="Terms & Conditions" required>
                </div>

                <div class="form-group">
                    <label>Effective Date *</label>
                    <input type="date" class="form-control" name="effective_date" required>
                </div>

                <div class="form-group">
                    <label>HTML File *</label>
                    <input type="file" class="form-control" name="file"
                           accept=".html" required>
                    <small class="form-text">Upload an HTML file containing the T&C document.</small>
                </div>
            </form>
        `;

        ModalComponent.show('Upload New T&C Version', dialogHtml, [
            { label: 'Upload', class: 'btn-primary', onClick: handleUpload }
        ]);
    }

    async function handleUpload() {
        try {
            const form = $('#uploadForm');
            const formData = new FormData(form);
            const sessionToken = State.get('sessionToken');

            const version = formData.get('version');
            const languageCode = formData.get('language_code');
            const regionCode = formData.get('region_code');
            const stateCode = formData.get('state_code')?.trim() || null;
            const title = formData.get('title');
            const effectiveDate = formData.get('effective_date');
            const file = formData.get('file');

            if (!file || file.size === 0) {
                throw new Error('Please select a file');
            }

            toast('Uploading file...', 'info');

            // Read file as base64 for Edge Function upload
            const fileContent = await readFileAsBase64(file);

            // Upload via Edge Function (server-side handles storage with service_role)
            const response = await fetch(
                `${API.baseUrl}/terms/upload`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                        'X-Session-Token': sessionToken
                    },
                    body: JSON.stringify({
                        session_token: sessionToken,
                        version,
                        language_code: languageCode,
                        region_code: regionCode,
                        state_code: stateCode,
                        document_type: 'terms',
                        title,
                        effective_date: new Date(effectiveDate).toISOString(),
                        file_size_bytes: file.size,
                        file_content: fileContent,
                        file_name: file.name
                    })
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[terms-management] Upload failed:', errorText);

                let errorMsg;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMsg = errorData.error || `Upload failed (${response.status})`;
                } catch {
                    errorMsg = `Upload failed (${response.status}): ${errorText}`;
                }

                throw new Error(errorMsg);
            }

            const result = await response.json();
            console.log('[terms-management] Upload successful:', result);

            toast('T&C uploaded successfully!', 'success');
            ModalComponent.hide();
            await loadTermsVersions();

        } catch (error) {
            console.error('[terms-management] Upload error:', error);
            toast('Upload failed: ' + error.message, 'error');
        }
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove data URL prefix to get just the base64 content
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    return {
        init,
        onNavigate
    };
})();
