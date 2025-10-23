// =================================================================
// =========== LAB LEDGER SCRIPT (Firebase) ========================
// =================================================================
const ledgerApp = (() => {
    const PASSWORD = '12345';
    let inventory = [];
    let transactions = [];
    const EXPIRY_WARNING_DAYS = 30;

    // --- DECLARED VARIABLES (NO DOM ACCESS) ---
    let ledgerContent, addReceiveModal, testUsageModal, editChemicalModal, editHistoryModal;

    const createChemicalRowHTML = () => `
        <div class="form-grid chemical-entry-row" style="gap: 10px; margin-bottom: 10px; align-items: flex-end;">
            <div style="grid-column: 1 / 2;"><label>ID</label><input type="number" class="chemical-id-input" min="1" required></div>
            <div style="grid-column: 2 / 3;"><label>Name</label><input type="text" class="chemical-name-display" readonly></div>
            <div style="grid-column: 3 / 5;"><label>Select Batch</label><select class="chemical-batch-select" required disabled><option>Enter ID first</option></select></div>
            <div style="grid-column: 1 / 3;"><label>Amount Used</label><input type="number" class="amount-used-input" step="any" required></div>
            <div style="grid-column: 3 / 4;"><label>Unit</label><select class="usage-unit-select"><option value="mg">mg</option><option value="g">g</option><option value="mL">mL</option><option value="L">L</option></select></div>
            <div style="grid-column: 4 / 5; text-align: right;"><button type="button" class="remove-row-btn delete-btn" style="padding: 8px 12px;">&times;</button></div>
        </div>`;

    const authenticate = () => prompt('Please enter the password:') === PASSWORD;
    const convertToBaseUnit = (amount, unit, baseUnit) => {
        if (unit === baseUnit) return parseFloat(amount);
        const factors = { 'mg_to_g': 0.001, 'mg_to_kg': 0.000001, 'g_to_kg': 0.001, 'kg_to_g': 1000, 'mL_to_L': 0.001, 'L_to_mL': 1000 };
        const factor = factors[`${unit}_to_${baseUnit}`];
        return factor ? parseFloat(amount) * factor : null;
    };

    const renderInventory = (filter = '') => {
        const tbody = document.querySelector('#inventoryTable tbody');
        tbody.innerHTML = '';
        const lowerFilter = filter.toLowerCase();
        const groupedInventory = inventory.reduce((acc, item) => {
            if (!acc[item.id]) {
                acc[item.id] = { id: item.id, name: item.name, cas: item.cas, totalQuantity: 0, locations: new Set(), baseUnit: item.baseUnit, batches: [] };
            }
            acc[item.id].totalQuantity += item.quantity;
            acc[item.id].locations.add(item.location);
            acc[item.id].batches.push(item);
            return acc;
        }, {});
        const filteredGroups = Object.values(groupedInventory).filter(group => group.name.toLowerCase().includes(lowerFilter) || group.id.toString().includes(lowerFilter));
        filteredGroups.sort((a, b) => a.id - b.id).forEach(group => {
            const hasLowStock = group.batches.some(b => b.quantity > 0 && b.quantity <= b.reorderLevel);
            const isOutOfStock = group.totalQuantity <= 0;
            let status = { text: 'In Stock', class: 'status-ok' };
            if (isOutOfStock) status = { text: 'Out of Stock', class: 'status-out' };
            else if (hasLowStock) status = { text: 'Low Stock', class: 'status-low' };
            tbody.innerHTML += `<tr class="master-inventory-row" data-chemical-id="${group.id}"><td><span class="expand-icon"></span>${group.id}</td><td>${group.name}</td><td>${group.cas}</td><td><strong>${group.totalQuantity.toFixed(6)} ${group.baseUnit}</strong></td><td>${[...group.locations].join(', ')}</td><td><span class="status-badge ${status.class}">${status.text}</span></td><td class="no-print"></td></tr>`;
            group.batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).forEach(item => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const warningDate = new Date(); warningDate.setDate(today.getDate() + EXPIRY_WARNING_DAYS);
                const expiry = item.expiryDate ? new Date(item.expiryDate) : null;
                let batchStatus = { text: 'OK', class: 'status-ok' };
                if (expiry) {
                    if (expiry < today) batchStatus = { text: 'Expired', class: 'status-expired' };
                    else if (expiry <= warningDate) batchStatus = { text: `Expires Soon`, class: 'status-expiring' };
                }
                if (item.quantity <= 0) batchStatus = { text: 'Out of Stock', class: 'status-out' };
                else if (item.quantity <= item.reorderLevel) batchStatus = { text: 'Low Stock', class: 'status-low' };
                const displayExpiry = expiry ? `${expiry.getDate().toString().padStart(2, '0')}/${(expiry.getMonth() + 1).toString().padStart(2, '0')}/${expiry.getFullYear()}` : 'N/A';
                tbody.innerHTML += `<tr class="batch-details-row hidden" data-chemical-id="${group.id}"><td colspan="2">Batch: <strong>${item.batchNumber}</strong></td><td>Expiry: ${displayExpiry}</td><td>Qty: ${item.quantity.toFixed(6)} ${item.baseUnit}</td><td>Location: ${item.location}</td><td><span class="status-badge ${batchStatus.class}">${batchStatus.text}</span></td><td class="no-print"><button class="action-btn edit-btn edit-inventory-btn" data-fbid="${item.fb_id}">Edit</button><button class="action-btn delete-btn delete-inventory-btn" data-fbid="${item.fb_id}">Delete</button></td></tr>`;
            });
        });
    };

    const renderUsageHistory = (filter = '') => {
        const tbody = document.querySelector('#historyTable tbody');
        tbody.innerHTML = '';
        const lowerFilter = filter.toLowerCase();
        const usageTransactions = transactions.filter(t => t.type === 'CONSUMED');
        const filtered = filter ? usageTransactions.filter(t => t.chemicalName.toLowerCase().includes(lowerFilter) || (t.details.testName && t.details.testName.toLowerCase().includes(lowerFilter)) || (t.details.batchNumber && t.details.batchNumber.toLowerCase().includes(lowerFilter))) : usageTransactions;
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(t => {
            const date = t.date.toDate ? t.date.toDate().toLocaleString() : new Date(t.date).toLocaleString();
            tbody.innerHTML += `<tr><td>${date}</td><td>${t.chemicalName}</td><td>${t.amount} ${t.unit}</td><td>${t.details.testName}</td><td>${t.details.batchNumber}</td><td class="no-print"><button class="action-btn edit-btn edit-history-btn" data-id="${t.id}">Edit</button><button class="action-btn delete-btn delete-history-btn" data-id="${t.id}">Delete</button></td></tr>`;
        });
    };

    const handlePrint = (reportType) => {
        let content = '', title = '';
        if (reportType === 'master') {
            title = 'Master Inventory List';
            content = `<h1>${title}</h1><p>As of: ${new Date().toLocaleString()}</p><table border="1"><thead><tr><th>ID</th><th>Name</th><th>Batch #</th><th>CAS</th><th>Current Quantity</th><th>Expiry</th><th>Location</th></tr></thead><tbody>`;
            inventory.sort((a, b) => a.id - b.id).forEach(item => {
                const expiry = item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A';
                content += `<tr><td>${item.id}</td><td>${item.name}</td><td>${item.batchNumber}</td><td>${item.cas}</td><td>${item.quantity.toFixed(6)} ${item.baseUnit}</td><td>${expiry}</td><td>${item.location}</td></tr>`;
            });
            content += '</tbody></table>';
        } else if (reportType === 'low_stock') {
            title = 'Low Stock Order List';
            content = `<h1>${title}</h1><p>As of: ${new Date().toLocaleString()}</p><table border="1"><thead><tr><th>ID</th><th>Name</th><th>Batch #</th><th>Current Qty</th><th>Reorder Level</th><th>Location</th></tr></thead><tbody>`;
            inventory.filter(item => item.quantity <= item.reorderLevel).sort((a, b) => a.id - b.id).forEach(item => {
                content += `<tr><td>${item.id}</td><td>${item.name}</td><td>${item.batchNumber}</td><td>${item.quantity.toFixed(6)} ${item.baseUnit}</td><td>${item.reorderLevel} ${item.baseUnit}</td><td>${item.location}</td></tr>`;
            });
            content += '</tbody></table>';
        } else if (reportType === 'expired') {
            title = 'Expired Chemicals Report';
            const today = new Date(); today.setHours(0, 0, 0, 0);
            content = `<h1>${title}</h1><p>As of: ${new Date().toLocaleString()}</p><table border="1"><thead><tr><th>ID</th><th>Name</th><th>Batch #</th><th>Expiry Date</th><th>Location</th></tr></thead><tbody>`;
            inventory.filter(item => item.expiryDate && new Date(item.expiryDate) < today).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).forEach(item => {
                const expiry = new Date(item.expiryDate).toLocaleDateString();
                content += `<tr><td>${item.id}</td><td>${item.name}</td><td>${item.batchNumber}</td><td>${expiry}</td><td>${item.location}</td></tr>`;
            });
            content += '</tbody></table>';
        } else if (reportType === 'ledger') {
            title = 'Full Transaction Ledger';
            content = `<h1>${title}</h1><p>As of: ${new Date().toLocaleString()}</p><table border="1"><thead><tr><th>Date</th><th>Type</th><th>ID</th><th>Chemical</th><th>Amount</th><th>Details</th></tr></thead><tbody>`;
            transactions.forEach(t => {
                const isSubtraction = ['CONSUMED', 'CORRECTION (SUBTRACT)'].includes(t.type);
                const amountText = isSubtraction ? `-${t.amount} ${t.unit}` : `+${t.amount} ${t.unit}`;
                const detailsText = t.type === 'CONSUMED' ? `${t.details.testName} / ${t.details.batchNumber}` : (t.details.note || '');
                const rowClass = isSubtraction ? 'class="ledger-subtract"' : 'class="ledger-add"';
                const date = t.date.toDate ? t.date.toDate().toLocaleString() : new Date(t.date).toLocaleString();
                content += `<tr ${rowClass}><td>${date}</td><td>${t.type}</td><td>${t.chemicalId}</td><td>${t.chemicalName}</td><td>${amountText}</td><td>${detailsText}</td></tr>`;
            });
            content += '</tbody></table>';
        }
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:sans-serif;} table{width:100%; border-collapse:collapse;} th,td{padding:8px; border:1px solid #ccc; text-align:left;} .ledger-add{background-color:#e6ffed;} .ledger-subtract{background-color:#ffe6e6;}</style></head><body>${content}</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    const openModal = (modalId) => document.getElementById(modalId).style.display = 'flex';
    const closeModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }

    const handleModalCloseAndReset = (modalId) => {
        closeModal(modalId);
        const form = document.querySelector(`#${modalId} form`);
        if (form) form.reset();
        if (modalId === 'testUsageModal') {
            const container = document.getElementById('chemical-entry-container');
            if(container) container.innerHTML = '';
        }
    };

    function initializeFirestoreListeners() {
        db.collection('chemicalInventory').onSnapshot(snapshot => {
            inventory = snapshot.docs.map(doc => ({ ...doc.data(), fb_id: doc.id }));
            renderInventory(document.getElementById('inventorySearch').value);
        });
        db.collection('chemicalTransactions').orderBy("date", "desc").onSnapshot(snapshot => {
            transactions = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            renderUsageHistory(document.getElementById('historyFilter').value);
        });
    }

    async function init() {
        // --- FIX: SELECT ELEMENTS AFTER DOM IS LOADED ---
        ledgerContent = document.getElementById('lab-ledger-content');
        addReceiveModal = document.getElementById('addReceiveModal');
        testUsageModal = document.getElementById('testUsageModal');
        editChemicalModal = document.getElementById('editChemicalModal');
        editHistoryModal = document.getElementById('editHistoryModal');

        initializeFirestoreListeners();
        flatpickr("#stockExpiryDate", { dateFormat: "Y-m-d" });
        flatpickr("#editExpiryDate", { dateFormat: "Y-m-d" });

        ledgerContent.addEventListener('input', e => {
            const target = e.target;
            if (target.id === 'historyFilter') renderUsageHistory(target.value);
            if (target.id === 'inventorySearch') renderInventory(target.value);
        });

        addReceiveModal.addEventListener('input', e => {
            if (e.target.id === 'stockId') {
                const id = parseInt(e.target.value);
                const existing = inventory.find(i => i.id === id);
                if (existing) {
                    document.getElementById('stockName').value = existing.name;
                    document.getElementById('stockCas').value = existing.cas;
                    document.getElementById('stockBaseUnit').value = existing.baseUnit;
                    document.getElementById('stockReorderLevel').value = existing.reorderLevel;
                    document.getElementById('stockLocation').value = existing.location;
                }
            }
        });

        testUsageModal.addEventListener('input', e => {
            const target = e.target;
            if (target.classList.contains('chemical-id-input')) {
                const id = parseInt(target.value);
                const row = target.closest('.chemical-entry-row');
                const nameDisplay = row.querySelector('.chemical-name-display');
                const batchSelect = row.querySelector('.chemical-batch-select');
                nameDisplay.value = id ? (inventory.find(i => i.id === id)?.name || 'NOT FOUND') : '';
                batchSelect.innerHTML = '<option value="">Loading...</option>';
                batchSelect.disabled = true;
                if (id) {
                    const availableBatches = inventory.filter(i => i.id === id && i.quantity > 0);
                    if (availableBatches.length > 0) {
                        batchSelect.innerHTML = '<option value="">-- Select a Batch --</option>';
                        availableBatches.forEach(batch => {
                            const option = document.createElement('option');
                            option.value = batch.batchNumber;
                            option.textContent = `${batch.batchNumber} (Qty: ${batch.quantity.toFixed(4)} ${batch.baseUnit})`;
                            batchSelect.appendChild(option);
                        });
                        batchSelect.disabled = false;
                    } else {
                        batchSelect.innerHTML = '<option value="">No batches in stock</option>';
                    }
                } else {
                    batchSelect.innerHTML = '<option value="">Enter ID first</option>';
                }
            }
        });

        ledgerContent.addEventListener('click', async (e) => {
            const target = e.target;
            const masterRow = target.closest('.master-inventory-row');
            if (masterRow) {
                masterRow.classList.toggle('expanded');
                const chemicalId = masterRow.dataset.chemicalId;
                const detailRows = document.querySelectorAll(`.batch-details-row[data-chemical-id="${chemicalId}"]`);
                detailRows.forEach(row => row.classList.toggle('hidden'));
                return;
            }

            if (target.id === 'addReceiveBtn') {
                document.getElementById('addReceiveForm').reset();
                openModal('addReceiveModal');
            }
            if (target.id === 'recordTestBtn') {
                openModal('testUsageModal');
                document.getElementById('chemical-entry-container').innerHTML = createChemicalRowHTML();
            }
            if (target.id === 'printMasterListBtn') handlePrint('master');
            if (target.id === 'printLedgerBtn') handlePrint('ledger');
            if (target.id === 'printLowStockBtn') handlePrint('low_stock');
            if (target.id === 'printExpiredBtn') handlePrint('expired');
            if (target.classList.contains('edit-inventory-btn')) {
                if (!authenticate()) return;
                const fb_id = target.dataset.fbid;
                const chemical = inventory.find(i => i.fb_id === fb_id);
                if (chemical) {
                    document.getElementById('editChemicalFbId').value = chemical.fb_id;
                    document.getElementById('editChemicalId').value = chemical.id;
                    document.getElementById('editChemicalName').value = chemical.name;
                    document.getElementById('editBatchNumber').value = chemical.batchNumber;
                    document.getElementById('editExpiryDate').value = chemical.expiryDate;
                    document.getElementById('editCasNumber').value = chemical.cas;
                    document.getElementById('editChemicalQuantity').value = chemical.quantity;
                    document.getElementById('editReorderLevel').value = chemical.reorderLevel;
                    document.getElementById('editLocation').value = chemical.location;
                    openModal('editChemicalModal');
                }
            }
            if (target.classList.contains('delete-inventory-btn')) {
                if (!authenticate()) return;
                const fb_id_to_delete = target.dataset.fbid;
                const chemical = inventory.find(i => i.fb_id === fb_id_to_delete);
                if (!chemical) return;
                if (!confirm(`WARNING: This will permanently delete Batch "${chemical.batchNumber}" of "${chemical.name}". This action cannot be undone. Are you sure?`)) return;
                try {
                    await db.collection('chemicalInventory').doc(fb_id_to_delete).delete();
                    alert(`Chemical Batch ${chemical.batchNumber} has been permanently deleted.`);
                } catch (error) { console.error("Error deleting chemical: ", error); alert("Failed to delete chemical. See console for details."); }
            }
            if (target.classList.contains('edit-history-btn')) {
                if (!authenticate()) return;
                const id = target.dataset.id;
                const t = transactions.find(t => t.id === id);
                if (t) {
                    document.getElementById('editHistoryId').value = t.id;
                    document.getElementById('editHistoryChemical').value = t.chemicalName;
                    document.getElementById('editHistoryAmount').value = t.amount;
                    document.getElementById('editHistoryUnit').value = t.unit;
                    document.getElementById('editHistoryTestName').value = t.details.testName;
                    document.getElementById('editHistoryBatchNumber').value = t.details.batchNumber;
                    openModal('editHistoryModal');
                }
            }
            if (target.classList.contains('delete-history-btn')) {
                if (!authenticate()) return;
                if (!confirm("Are you sure you want to delete this usage entry? This will add the stock back to the inventory.")) return;
                const id = target.dataset.id;
                const t = transactions.find(tran => tran.id === id);
                const chemical = inventory.find(i => i.id === t.chemicalId && i.batchNumber === t.details.chemicalBatchNumber);
                if (chemical && t) {
                    try {
                        const amountToRestore = convertToBaseUnit(t.amount, t.unit, chemical.baseUnit);
                        const batch = db.batch();
                        const invRef = db.collection('chemicalInventory').doc(chemical.fb_id);
                        batch.update(invRef, { quantity: firebase.firestore.FieldValue.increment(amountToRestore) });
                        const transacRef = db.collection('chemicalTransactions').doc();
                        batch.set(transacRef, { type: 'CORRECTION (ADD)', chemicalId: chemical.id, chemicalName: chemical.name, amount: t.amount, unit: t.unit, date: new Date(), details: { note: `Reversal of deleted entry for product batch ${t.details.batchNumber}` } });
                        const originalTransacRef = db.collection('chemicalTransactions').doc(id);
                        batch.delete(originalTransacRef);
                        await batch.commit();
                    } catch (error) { console.error("Error reversing transaction: ", error); alert("Failed to reverse transaction."); }
                } else { alert("Could not find the original chemical batch to restore stock to. The batch may have been deleted."); }
            }
        });

        testUsageModal.addEventListener('click', e => {
             if (e.target.id === 'addChemicalRowBtn') {
                document.getElementById('chemical-entry-container').insertAdjacentHTML('beforeend', createChemicalRowHTML());
            }
             if (e.target.classList.contains('remove-row-btn')) {
                e.target.closest('.chemical-entry-row').remove();
            }
        });

        addReceiveModal.querySelector('form').addEventListener('submit', async (e) => {
             e.preventDefault();
             const newId = parseInt(document.getElementById('stockId').value);
             const newBatch = document.getElementById('stockBatchNumber').value;
             if (inventory.some(i => i.id === newId && i.batchNumber === newBatch)) {
                 alert(`Error: Chemical ID ${newId} with Batch Number ${newBatch} already exists.`);
                 return;
             }
             try {
                 const newChemical = { id: newId, name: document.getElementById('stockName').value, batchNumber: newBatch, expiryDate: document.getElementById('stockExpiryDate').value, cas: document.getElementById('stockCas').value, quantity: parseFloat(document.getElementById('stockQuantity').value), baseUnit: document.getElementById('stockBaseUnit').value, reorderLevel: parseFloat(document.getElementById('stockReorderLevel').value), location: document.getElementById('stockLocation').value };
                 await db.collection('chemicalInventory').add(newChemical);
                 await db.collection('chemicalTransactions').add({ type: 'RECEIVED', chemicalId: newChemical.id, chemicalName: newChemical.name, amount: newChemical.quantity, unit: newChemical.baseUnit, date: new Date(), details: { note: `Initial Stock Added for Batch ${newChemical.batchNumber}` } });
                 handleModalCloseAndReset('addReceiveModal');
             } catch(error) { console.error("Error saving chemical batch: ", error); alert("Failed to save chemical batch."); }
        });

        testUsageModal.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const testName = document.getElementById('testName').value, batchNumber = document.getElementById('batchNumber').value;
            let toProcess = [];
            let hasError = false;
            for (const row of document.getElementById('chemical-entry-container').querySelectorAll('.chemical-entry-row')) {
                const id = parseInt(row.querySelector('.chemical-id-input').value);
                const chemicalBatchNum = row.querySelector('.chemical-batch-select').value;
                const amount = parseFloat(row.querySelector('.amount-used-input').value);
                if (!id || !amount || !chemicalBatchNum) continue;
                const chemical = inventory.find(i => i.id === id && i.batchNumber === chemicalBatchNum);
                if (!chemical) { alert(`Error: Chemical ID ${id} with Batch ${chemicalBatchNum} not found.`); hasError = true; break; }
                const amountInBase = convertToBaseUnit(amount, row.querySelector('.usage-unit-select').value, chemical.baseUnit);
                if (amountInBase === null) { alert(`Error: Unit mismatch for ${chemical.name}.`); hasError = true; break; }
                if (amountInBase > chemical.quantity) { alert(`Error: Not enough stock for ${chemical.name} (Batch: ${chemical.batchNumber}). Requested: ${amountInBase}, Available: ${chemical.quantity}.`); hasError = true; break; }
                toProcess.push({ chemical, amount, unit: row.querySelector('.usage-unit-select').value, amountInBase });
            }
            if (hasError) return;
            if (toProcess.length === 0) { alert('No valid chemicals to process.'); return; }
            try {
                const batch = db.batch();
                toProcess.forEach(item => {
                    const invRef = db.collection('chemicalInventory').doc(item.chemical.fb_id);
                    batch.update(invRef, { quantity: firebase.firestore.FieldValue.increment(-item.amountInBase) });
                    const transacRef = db.collection('chemicalTransactions').doc();
                    batch.set(transacRef, { type: 'CONSUMED', chemicalId: item.chemical.id, chemicalName: item.chemical.name, amount: item.amount, unit: item.unit, date: new Date(), details: { testName, batchNumber, chemicalBatchNumber: item.chemical.batchNumber } });
                });
                await batch.commit();
                handleModalCloseAndReset('testUsageModal');
            } catch(error) { console.error("Error processing usage: ", error); alert("An error occurred while deducting stock."); }
        });
        
        editChemicalModal.querySelector('form').addEventListener('submit', async(e) => {
            e.preventDefault();
            const fb_id = document.getElementById('editChemicalFbId').value;
            const chemical = inventory.find(i => i.fb_id === fb_id);
            if(chemical){
                try {
                    const invRef = db.collection('chemicalInventory').doc(chemical.fb_id);
                    const newQty = parseFloat(document.getElementById('editChemicalQuantity').value);
                    const oldQty = chemical.quantity;
                    const diff = newQty - oldQty;
                    const newBatchNum = document.getElementById('editBatchNumber').value;
                    if (inventory.some(i => i.id === chemical.id && i.batchNumber === newBatchNum && i.fb_id !== fb_id)) {
                         alert(`Error: Another entry with ID ${chemical.id} and Batch ${newBatchNum} already exists.`);
                         return;
                    }
                    await invRef.update({ name: document.getElementById('editChemicalName').value, batchNumber: newBatchNum, expiryDate: document.getElementById('editExpiryDate').value, cas: document.getElementById('editCasNumber').value, reorderLevel: parseFloat(document.getElementById('editReorderLevel').value), location: document.getElementById('editLocation').value, quantity: newQty });
                    if (diff !== 0) {
                        await db.collection('chemicalTransactions').add({ type: diff > 0 ? 'CORRECTION (ADD)' : 'CORRECTION (SUBTRACT)', chemicalId: chemical.id, chemicalName: document.getElementById('editChemicalName').value, amount: Math.abs(diff), unit: chemical.baseUnit, date: new Date(), details: { note: `Manual stock correction from ${oldQty.toFixed(6)} to ${newQty.toFixed(6)} for Batch ${newBatchNum}` } });
                    }
                    handleModalCloseAndReset('editChemicalModal');
                } catch (error) { console.error("Error updating chemical: ", error); alert("Failed to update chemical details."); }
            }
        });

        editHistoryModal.querySelector('form').addEventListener('submit', (e) => {
             e.preventDefault();
             alert("Editing history is disabled in this version.");
             handleModalCloseAndReset('editHistoryModal');
        });
    }

    return { init, handleModalClose: handleModalCloseAndReset };
})();