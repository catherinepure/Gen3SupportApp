/**
 * Reference Data Component
 * Loads and caches serial number reference tables (models, variants, colours, blocks).
 * Call ReferenceData.loadAll() during app init; data is then available synchronously.
 */

const ReferenceData = (() => {
    let models = [];
    let variants = [];
    let colours = [];
    let blocks = [];
    let loaded = false;

    /**
     * Load all reference tables from the API.
     * Called once during app initialisation.
     */
    async function loadAll() {
        try {
            const [modelsRes, variantsRes, coloursRes, blocksRes] = await Promise.all([
                API.call('settings', 'list-models'),
                API.call('settings', 'list-variants'),
                API.call('settings', 'list-colours'),
                API.call('settings', 'list-blocks')
            ]);

            models = modelsRes.models || [];
            variants = variantsRes.variants || [];
            colours = coloursRes.colours || [];
            blocks = blocksRes.blocks || [];
            loaded = true;

            console.log(`✓ ReferenceData loaded: ${models.length} models, ${variants.length} variants, ${colours.length} colours, ${blocks.length} blocks`);
        } catch (err) {
            console.warn('ReferenceData: Failed to load reference tables:', err.message);
            // Non-fatal — app can still function without reference data
        }
    }

    function isLoaded() { return loaded; }

    // --- Lookup helpers ---

    function getModelById(id) {
        return models.find(m => m.id === id) || null;
    }

    function getModelByCode(code) {
        return models.find(m => m.code === code) || null;
    }

    function getVariantById(id) {
        return variants.find(v => v.id === id) || null;
    }

    function getVariantByCode(code) {
        return variants.find(v => v.code === code) || null;
    }

    function getColourById(id) {
        return colours.find(c => c.id === id) || null;
    }

    function getColourByCode(code) {
        return colours.find(c => c.code === code) || null;
    }

    function getBlockById(id) {
        return blocks.find(b => b.id === id) || null;
    }

    function getBlockByCode(code) {
        return blocks.find(b => b.code === code) || null;
    }

    // --- Dropdown option helpers (for FormComponent) ---

    function modelOptions(includeEmpty = true) {
        const opts = models
            .filter(m => m.is_active)
            .map(m => ({ value: m.id, label: `${m.code} - ${m.name}` }));
        if (includeEmpty) opts.unshift({ value: '', label: '-- Select Model --' });
        return opts;
    }

    function variantOptions(includeEmpty = true) {
        const opts = variants
            .filter(v => v.is_active)
            .map(v => ({ value: v.id, label: `${v.code} - ${v.name} (${v.capacity_ah}Ah)` }));
        if (includeEmpty) opts.unshift({ value: '', label: '-- Select Variant --' });
        return opts;
    }

    function colourOptions(includeEmpty = true) {
        const opts = colours
            .filter(c => c.is_active)
            .map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }));
        if (includeEmpty) opts.unshift({ value: '', label: '-- Select Colour --' });
        return opts;
    }

    function blockOptions(includeEmpty = true) {
        const opts = blocks
            .filter(b => b.is_active)
            .map(b => ({ value: b.id, label: `${b.code} - ${b.name}` }));
        if (includeEmpty) opts.unshift({ value: '', label: '-- Select Block --' });
        return opts;
    }

    /**
     * Parse a serial number like S008C1-000001 into its components.
     * Returns { block, model, variant, colour, serial } or null.
     */
    function parseSerial(serialNumber) {
        if (!serialNumber) return null;
        const match = serialNumber.match(/^S(\w)(\d{2})(\w)(\w)-(\d{6})$/);
        if (!match) return null;

        const [, blockCode, modelCode, variantCode, colourCode, serial] = match;
        return {
            blockCode,
            modelCode,
            variantCode,
            colourCode,
            serial: parseInt(serial, 10),
            block: getBlockByCode(blockCode),
            model: getModelByCode(modelCode),
            variant: getVariantByCode(variantCode),
            colour: getColourByCode(colourCode)
        };
    }

    return {
        loadAll,
        isLoaded,
        // Raw arrays
        get models() { return models; },
        get variants() { return variants; },
        get colours() { return colours; },
        get blocks() { return blocks; },
        // Lookups
        getModelById,
        getModelByCode,
        getVariantById,
        getVariantByCode,
        getColourById,
        getColourByCode,
        getBlockById,
        getBlockByCode,
        // Dropdown helpers
        modelOptions,
        variantOptions,
        colourOptions,
        blockOptions,
        // Serial parser
        parseSerial
    };
})();
