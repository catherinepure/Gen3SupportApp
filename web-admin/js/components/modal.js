/**
 * Modal Component
 * Reusable modal dialog system
 */

const ModalComponent = (() => {
    const { $ } = Utils;

    function show(title, content, options = {}) {
        const modal = $('#detail-modal');
        const modalTitle = $('#modal-title');
        const modalBody = $('#modal-body');

        if (!modal || !modalTitle || !modalBody) {
            console.error('Modal elements not found');
            return;
        }

        modalTitle.textContent = title;
        modalBody.innerHTML = content;

        modal.classList.remove('hidden');

        // Handle custom buttons if provided
        if (options.buttons) {
            renderButtons(options.buttons);
        }

        // Handle close callback
        if (options.onClose) {
            modal.dataset.onClose = 'custom';
            modal._customCloseCallback = options.onClose;
        }
    }

    function hide() {
        const modal = $('#detail-modal');
        if (!modal) return;

        // Call custom close callback if exists
        if (modal.dataset.onClose === 'custom' && modal._customCloseCallback) {
            modal._customCloseCallback();
            delete modal._customCloseCallback;
            delete modal.dataset.onClose;
        }

        modal.classList.add('hidden');

        // Clear modal content
        const modalBody = $('#modal-body');
        if (modalBody) {
            modalBody.innerHTML = '';
        }
    }

    function renderButtons(buttons) {
        // TODO: Implement custom buttons in modal footer
        // For now, using default close button
    }

    function confirm(title, message, onConfirm) {
        const content = `
            <p>${message}</p>
            <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="ModalComponent.hide()">Cancel</button>
                <button class="btn btn-danger" id="confirm-action-btn">Confirm</button>
            </div>
        `;

        show(title, content);

        // Set up confirm button
        setTimeout(() => {
            const confirmBtn = $('#confirm-action-btn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    hide();
                    if (onConfirm) onConfirm();
                });
            }
        }, 0);
    }

    function init() {
        // Set up close button
        const closeBtn = $('#modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', hide);
        }

        // Click outside to close
        const modal = $('#detail-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hide();
                }
            });
        }

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hide();
            }
        });
    }

    return {
        show,
        hide,
        confirm,
        init
    };
})();
