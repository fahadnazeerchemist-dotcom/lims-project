document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    // =========== GLOBAL EVENT HANDLERS & INITIALIZATION ==============
    // =================================================================
    document.querySelector('.tab-bar').addEventListener('click', e => {
        if (e.target.classList.contains('tab-button')) {
            document.querySelectorAll('.tab-button, .tab-content').forEach(el => el.classList.remove('active'));
            const tabButton = e.target.closest('.tab-button');
            tabButton.classList.add('active');
            const tabId = tabButton.dataset.tab;
            document.getElementById(`${tabId}-content`).classList.add('active');
        }
    });

    // A single, simplified listener to close any modal
    document.addEventListener('click', e => {
        const modalToClose = e.target.closest('.modal');
        const closeButton = e.target.closest('[data-action="close-modal"]');
        const isBackgroundClick = e.target === modalToClose;

        if (modalToClose && (isBackgroundClick || closeButton)) {
            const modalId = modalToClose.id;
            
            // Ledger app has special logic to reset forms
            if (modalId.startsWith('edit') || modalId === 'addReceiveModal' || modalId === 'testUsageModal') {
                ledgerApp.handleModalClose(modalId);
            } 
            // All other modals can just be hidden
            else {
                modalToClose.style.display = 'none';
            }
        }
    });
    
    // Initialize all applications
    ledgerApp.init();
    reportApp.init();
    tagsApp.init();
    requisitionApp.init();
});