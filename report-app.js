// =================================================================
// =========== DAILY REPORT SCRIPT (Firebase) ======================
// =================================================================
const reportApp = (() => {
    let sterilityLogData = [];
    let unsubscribeReport, unsubscribeSterilityLog;
    let suggestionData = {};
    let activeCell = null;

    // --- DECLARED VARIABLES (NO DOM ACCESS) ---
    let dailyActivityContent, sterilityLogContent, reportDateInput, historySelect, 
        autocompleteBox, sterilityModal, sterilityForm, statusDiv;

    const toDDMMYYYY = (dateStr) => { if (!dateStr || !dateStr.includes('-')) return dateStr; const [y, m, d] = dateStr.split('-'); return `${d}/${m}/${y}`; };
    const toYYYYMMDD = (dateStr) => { if (!dateStr || !dateStr.includes('/')) return dateStr; const [d, m, y] = dateStr.split('/'); return `${y}-${m}-${d}`; };
    const debounce = (func, delay) => { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; };

    function initializeRealtimeListeners() {
        db.collection('reports').orderBy('date', 'desc').onSnapshot(snapshot => {
            const currentlySelectedDate = historySelect.value;
            historySelect.innerHTML = snapshot.docs.map(doc => `<option value="${doc.id}">${toDDMMYYYY(doc.id)}</option>`).join('');
            if (Array.from(historySelect.options).some(opt => opt.value === currentlySelectedDate)) {
                historySelect.value = currentlySelectedDate;
            }
        });
        unsubscribeSterilityLog = db.collection('sterilityLog').orderBy('date', 'desc').onSnapshot(snapshot => {
            sterilityLogData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSterilityLog();
        });
        db.collection('suggestions').onSnapshot(snapshot => {
            suggestionData = {};
            snapshot.forEach(doc => { suggestionData[doc.id] = new Set(doc.data().values); });
        });
        db.collection('healthCheck').doc('connection').onSnapshot(
            () => { statusDiv.textContent = 'Connected'; statusDiv.className = 'connection-status status-connected no-print'; }, 
            () => { statusDiv.textContent = 'Disconnected'; statusDiv.className = 'connection-status status-disconnected no-print'; }
        );
    }

    const loadReportForDate = (dateYMD) => {
        if (!dateYMD) return;
        if (reportDateInput._flatpickr) reportDateInput._flatpickr.setDate(toDDMMYYYY(dateYMD), false);
        historySelect.value = dateYMD;
        if (unsubscribeReport) unsubscribeReport();
        unsubscribeReport = db.collection('reports').doc(dateYMD).onSnapshot(doc => {
            const reportData = doc.exists ? doc.data() : { date: dateYMD, chemicalData: {}, microData: {} };
            renderReport(reportData);
        });
    };

    const updateCellData = async (tableType, rowId, fieldName, value) => {
        const dateYMD = toYYYYMMDD(reportDateInput.value);
        if (!dateYMD || !tableType || !rowId || typeof fieldName === 'undefined') return;
        const docRef = db.collection('reports').doc(dateYMD);
        try {
            await docRef.set({ date: dateYMD, [tableType]: { [rowId]: { [fieldName]: value } } }, { merge: true });
            const trimmedValue = value.trim();
            if (trimmedValue && (!suggestionData[fieldName] || !suggestionData[fieldName].has(trimmedValue))) {
                await db.collection('suggestions').doc(fieldName).set({ values: firebase.firestore.FieldValue.arrayUnion(trimmedValue) }, { merge: true });
            }
        } catch (error) { console.error("Error updating cell:", error); }
    };
    const debouncedUpdate = debounce(updateCellData, 800);

    const renderReport = (report) => {
        renderTable('chemical-table-body', report.chemicalData);
        renderTable('micro-table-body', report.microData);
    };

    const renderTable = (tableId, data) => {
        const tableBody = document.getElementById(tableId);
        if (!tableBody) return;
        const dataArray = !data ? [] : Object.entries(data).map(([id, values]) => ({ id, ...values })).sort((a, b) => (a.id || "").localeCompare(b.id || ""));
        const existingRowIds = new Set([...tableBody.rows].map(r => r.dataset.id));
        const incomingRowIds = new Set(dataArray.map(r => r.id));
        existingRowIds.forEach(id => { if (!incomingRowIds.has(id)) tableBody.querySelector(`tr[data-id="${id}"]`)?.remove(); });
        dataArray.forEach(rowData => {
            let row = tableBody.querySelector(`tr[data-id="${rowData.id}"]`);
            if (row) { updateRowUI(row, rowData); }
            else { tableBody.insertAdjacentHTML('beforeend', generateDailyRowHtml(rowData)); }
        });
        updateAllSerialNumbers();
    };

    const generateDailyRowHtml = (data = {}) => {
        const id = data.id || `row_${Date.now()}`;
        return `<tr data-id="${id}"><td></td><td contenteditable="true" data-field="productName">${data.productName || ''}</td><td contenteditable="true" data-field="bNumber">${data.bNumber || ''}</td><td contenteditable="true" data-field="stage">${data.stage || ''}</td><td contenteditable="true" data-field="activity">${data.activity || ''}</td><td contenteditable="true" data-field="status">${data.status || ''}</td><td contenteditable="true" data-field="section">${data.section || ''}</td><td contenteditable="true" data-field="performedBy">${data.performedBy || ''}</td><td contenteditable="true" data-field="remarks">${data.remarks || ''}</td><td class="action-column no-print"><button class="delete-btn" data-action="delete-daily-row"><i class="fas fa-trash-alt"></i></button></td></tr>`;
    };

    const updateRowUI = (row, data) => {
        ['productName', 'bNumber', 'stage', 'activity', 'status', 'section', 'performedBy', 'remarks'].forEach(field => {
            const cell = row.querySelector(`[data-field="${field}"]`);
            if (cell && document.activeElement !== cell && cell.textContent !== (data[field] || '')) {
                cell.textContent = data[field] || '';
            }
        });
    };
    
    const updateAllSerialNumbers = () => {
        document.querySelectorAll('#chemical-table-body, #micro-table-body, #sterility-table-body').forEach(tbody => {
            tbody.querySelectorAll('tr').forEach((row, index) => { row.cells[0].textContent = index + 1; });
        });
    };

    const renderSterilityLog = () => {
        const searchTerm = document.getElementById('sterility-search').value.toLowerCase();
        const log = sterilityLogData.filter(e => (e.productName || '').toLowerCase().includes(searchTerm) || (e.batchNumber || '').toLowerCase().includes(searchTerm));
        document.getElementById('sterility-table-body').innerHTML = log.map(e => `<tr data-id="${e.id}"><td></td><td>${e.date||''}</td><td>${e.productName||''}</td><td>${e.batchNumber||''}</td><td>${e.activity||''}</td><td>${e.endDate||''}</td><td>${e.releaseDate||''}</td><td>${e.sterilityStatus||''}</td><td>${e.betStatus||''}</td><td>${e.remarks||''}</td><td class="action-column no-print"><button class="edit-btn" data-action="edit-sterility"><i class="fas fa-edit"></i></button><button class="delete-btn" data-action="delete-sterility"><i class="fas fa-trash-alt"></i></button></td></tr>`).join('');
        updateAllSerialNumbers();
    };
    
    const showAutocomplete = (targetCell) => {
        activeCell = targetCell;
        const field = targetCell.dataset.field;
        const query = targetCell.textContent.toLowerCase().trim();
        let suggestions = [];
        if (field === 'productName') {
            suggestions = [...new Set(ledgerApp.getInventory().map(item => item.name))];
        } else {
            suggestions = suggestionData[field] ? [...suggestionData[field]] : [];
        }
        if (!query || !suggestions.length) { hideAutocomplete(); return; }
        const filtered = suggestions.filter(s => s.toLowerCase().includes(query)).slice(0, 10);
        if (!filtered.length) { hideAutocomplete(); return; }
        autocompleteBox.innerHTML = filtered.map(s => `<div class="autocomplete-item">${s}</div>`).join('');
        const rect = targetCell.getBoundingClientRect();
        autocompleteBox.style.left = `${rect.left + window.scrollX}px`;
        autocompleteBox.style.top = `${rect.bottom + window.scrollY}px`;
        autocompleteBox.style.width = `${rect.width}px`;
        autocompleteBox.style.display = 'block';
    };
    const hideAutocomplete = () => { autocompleteBox.style.display = 'none'; activeCell = null; };

    function init() {
        // --- FIX: SELECT ELEMENTS AFTER DOM IS LOADED ---
        dailyActivityContent = document.getElementById('daily-activity-content');
        sterilityLogContent = document.getElementById('sterility-log-content');
        reportDateInput = document.getElementById('report-date');
        historySelect = document.getElementById('history-select');
        autocompleteBox = document.getElementById('autocomplete-box');
        sterilityModal = document.getElementById('sterility-modal');
        sterilityForm = document.getElementById('sterility-form');
        statusDiv = document.getElementById('connection-status');

        const handleInput = (e) => {
            const target = e.target;
            if (target.hasAttribute('contenteditable')) {
                const row = target.closest('tr'); if (!row) return;
                const tableType = row.closest('tbody').id === 'chemical-table-body' ? 'chemicalData' : 'microData';
                debouncedUpdate(tableType, row.dataset.id, target.dataset.field, target.textContent);
                showAutocomplete(target);
            }
            if (target.id === 'sterility-search') {
                debounce(renderSterilityLog, 300)();
            }
        };

        const handleClick = async (e) => {
            const targetElement = e.target.closest('[data-action]');
            if (!targetElement) return;

            const action = targetElement.dataset.action;
            const row = targetElement.closest('tr');
            switch (action) {
                case 'add-row': 
                    const tableType = targetElement.dataset.table === 'chemical-table-body' ? 'chemicalData' : 'microData'; 
                    await updateCellData(tableType, `row_${Date.now()}`, 'productName', ''); 
                    break;
                case 'delete-daily-row': 
                    if (confirm('Delete this row?')) { 
                        const tableTypeDel = row.closest('tbody').id === 'chemical-table-body' ? 'chemicalData' : 'microData'; 
                        await db.collection('reports').doc(toYYYYMMDD(reportDateInput.value)).update({ [`${tableTypeDel}.${row.dataset.id}`]: firebase.firestore.FieldValue.delete() }); 
                    } 
                    break;
                case 'show-sterility-modal': 
                    sterilityForm.reset(); 
                    sterilityForm.querySelector('#sterility-id').value = ''; 
                    document.getElementById('modal-title').textContent = 'Add New Sterility Test'; 
                    sterilityModal.style.display = 'flex'; 
                    flatpickr("#sterility-modal .flatpickr-input", { dateFormat: "d/m/Y", defaultDate: "today"}); 
                    break;
                case 'edit-sterility': 
                    const record = sterilityLogData.find(r => r.id === row.dataset.id); 
                    if (record) { 
                        Object.keys(record).forEach(key => { 
                            const input = sterilityForm.querySelector(`#s-${key}`); 
                            if (input) input.value = record[key]; 
                        }); 
                        sterilityForm.querySelector('#sterility-id').value = record.id; 
                        document.getElementById('modal-title').textContent = 'Edit Sterility Test'; 
                        sterilityModal.style.display = 'flex'; 
                        flatpickr("#sterility-modal .flatpickr-input", { dateFormat: "d/m/Y" }); 
                    } 
                    break;
                case 'delete-sterility': 
                    if (confirm('Delete this sterility record?')) { 
                        await db.collection('sterilityLog').doc(row.dataset.id).delete(); 
                    } 
                    break;
                case 'close-modal':
                    const modal = e.target.closest('.modal');
                    if (modal) modal.style.display = 'none';
                    break;
            }
        };
        
        dailyActivityContent.addEventListener('input', handleInput);
        sterilityLogContent.addEventListener('input', handleInput);
        dailyActivityContent.addEventListener('click', handleClick);
        sterilityLogContent.addEventListener('click', handleClick);

        sterilityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('sterility-id').value;
            const record = { date: document.getElementById('s-date').value, productName: document.getElementById('s-productName').value, batchNumber: document.getElementById('s-batchNumber').value, activity: document.getElementById('s-activity').value, endDate: document.getElementById('s-endDate').value, releaseDate: document.getElementById('s-releaseDate').value, sterilityStatus: document.getElementById('s-sterilityStatus').value, betStatus: document.getElementById('s-betStatus').value, remarks: document.getElementById('s-remarks').value };
            try { 
                if (id) await db.collection('sterilityLog').doc(id).set(record, { merge: true }); 
                else await db.collection('sterilityLog').add(record); 
                sterilityModal.style.display = 'none'; 
            } catch (err) { console.error("Error saving sterility record:", err); }
        });
        
        autocompleteBox.addEventListener('click', (e) => {
            if (e.target.classList.contains('autocomplete-item') && activeCell) {
                const selectedText = e.target.textContent;
                activeCell.textContent = selectedText;
                const row = activeCell.closest('tr');
                const tableType = row.closest('tbody').id === 'chemical-table-body' ? 'chemicalData' : 'microData';
                updateCellData(tableType, row.dataset.id, activeCell.dataset.field, selectedText);
                hideAutocomplete();
                activeCell.focus();
            }
        });
        
        historySelect.addEventListener('change', (e) => loadReportForDate(e.target.value));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideAutocomplete(); });
        
        flatpickr("#report-date", { dateFormat: "d/m/Y", defaultDate: "today", onChange: function(selectedDates, dateStr, instance) { 
            const dateYMD = toYYYYMMDD(dateStr); 
            if (dateYMD) loadReportForDate(dateYMD); 
        }});
        
        initializeRealtimeListeners();
        loadReportForDate(new Date().toISOString().slice(0, 10));
    }

    return { init };
})();

function prepareAndPrint() {
    document.getElementById('print-report-date').textContent = document.getElementById('report-date').value;
    window.print();
}