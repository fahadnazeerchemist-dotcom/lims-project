const tagsApp = (() => {
    // --- EVENT LISTENERS SETUP ---
    function setupEventListeners() {
        document.getElementById('label-type').addEventListener('change', toggleFormVisibility);
        document.getElementById('tag-status').addEventListener('change', updateThemeAndRemarks);
        document.getElementById('company-name-tags').addEventListener('input', saveData);
        document.getElementById('logo-upload').addEventListener('change', handleLogoUpload);
        document.querySelectorAll('#label-generator-content .sop-input').forEach(input => input.addEventListener('input', saveData));
        document.getElementById('generate-tags').addEventListener('click', prepareAndPrint);
        
        document.getElementById('fp-params-select').addEventListener('change', () => generateDynamicParamInputs('fp'));
        document.getElementById('rm-params-select').addEventListener('change', () => generateDynamicParamInputs('rm'));
        document.getElementById('total-container-count').addEventListener('input', autoFillTagsToPrint);

        document.getElementById('btn-save-history').addEventListener('click', saveToHistory);
        document.getElementById('btn-load-history').addEventListener('click', loadFromHistory);
        document.getElementById('btn-delete-history').addEventListener('click', deleteFromHistory);

        window.addEventListener('afterprint', cleanupAfterPrint);
    }
    
    function parseTagNumbers(inputString) {
        const numbers = new Set();
        if (!inputString) return [];
        const parts = inputString.split(',');
        for (const part of parts) {
            const trimmedPart = part.trim();
            if (trimmedPart.includes('-')) {
                const [start, end] = trimmedPart.split('-').map(num => parseInt(num.trim(), 10));
                if (!isNaN(start) && !isNaN(end) && end >= start) {
                    for (let i = start; i <= end; i++) { numbers.add(i); }
                }
            } else {
                const num = parseInt(trimmedPart, 10);
                if (!isNaN(num)) { numbers.add(num); }
            }
        }
        return Array.from(numbers).sort((a, b) => a - b);
    }

    function autoFillTagsToPrint() {
        const total = document.getElementById('total-container-count').value;
        const tagsInput = document.getElementById('tags-to-print');
        tagsInput.value = (parseInt(total, 10) > 0) ? `1-${total}` : '';
    }
    
    function updateThemeAndRemarks() {
        const status = document.getElementById('tag-status').value;
        const container = document.getElementById('main-container');
        container.className = 'container';
        container.classList.add(`theme-${status}`);
        const currentForm = document.querySelector('#label-generator-content .form-wrapper:not(.hidden)');
        if (currentForm) {
            const remarksInput = currentForm.querySelector('.remarks-input');
            if (status === 'rejected') remarksInput.value = 'Result does not comply with specifications';
            else if (status === 'sampled') remarksInput.value = 'Sampled for analysis';
            else {
                const labelType = document.getElementById('label-type').value;
                remarksInput.value = labelType === 'finished-product' ? 'Release for' : 'Result complies with specification';
            }
        }
    }

    function toggleFormVisibility() {
        const selectedType = document.getElementById('label-type').value;
        document.querySelectorAll('#label-generator-content .form-wrapper').forEach(form => {
            form.classList.toggle('hidden', form.id !== `${selectedType}-form`);
        });
        const sampledOption = document.getElementById('sampled-option');
        const tagStatusSelect = document.getElementById('tag-status');
        if (selectedType === 'raw-material') {
            sampledOption.style.display = 'block';
        } else {
            sampledOption.style.display = 'none';
            if (tagStatusSelect.value === 'sampled') tagStatusSelect.value = 'released';
        }
        updateThemeAndRemarks();
    }
    
    function handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const logoDataUrl = e.target.result;
            document.getElementById('logo-preview').src = logoDataUrl;
            localStorage.setItem('companyLogo', logoDataUrl);
        }
        reader.readAsDataURL(file);
    }

    function saveData() {
        localStorage.setItem('companyName-tags', document.getElementById('company-name-tags').value);
        document.querySelectorAll('#label-generator-content .sop-input').forEach(input => {
            localStorage.setItem(input.id, input.value);
        });
    }

    function loadSavedData() {
        document.getElementById('company-name-tags').value = localStorage.getItem('companyName-tags') || '';
        document.getElementById('logo-preview').src = localStorage.getItem('companyLogo') || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        document.querySelectorAll('#label-generator-content .sop-input').forEach(input => {
            input.value = localStorage.getItem(input.id) || input.value;
        });
    }

    function setDefaultDates() {
        const today = new Date().toISOString().split('T')[0];
        document.querySelectorAll('#label-generator-content input[type="date"]').forEach(input => {
            if (!input.value) input.value = today;
        });
    }

    function formatDate(dateString) {
        if (!dateString || dateString.toLowerCase() === 'n/a') return dateString;
        try {
            const [year, month, day] = dateString.split('-');
            if (!day || !month || !year) return dateString;
            return `${day}.${month}.${year}`;
        } catch (e) { return dateString; }
    }

    function generateDynamicParamInputs(prefix, savedParams = {}) {
        const select = document.getElementById(`${prefix}-params-select`);
        const container = document.getElementById(`${prefix}-dynamic-params-container`);
        container.innerHTML = '';
        const selectedOptions = Array.from(select.selectedOptions);
        for (const option of selectedOptions) {
            const paramName = option.value;
            const paramId = `${prefix}-param-${paramName.replace(/\s+/g, '-')}`;
            const value = savedParams[paramName] || '';
            const group = document.createElement('div');
            group.className = 'form-group';
            group.innerHTML = `<label for="${paramId}">${paramName}:</label><input type="text" id="${paramId}" class="history-field dynamic-param" value="${value}" data-param-name="${paramName}">`;
            container.appendChild(group);
        }
    }
    
    function getHistory() { return JSON.parse(localStorage.getItem('pharmaLabelHistory')) || {}; }
    function saveHistoryToStorage(history) { localStorage.setItem('pharmaLabelHistory', JSON.stringify(history)); }
    
    function populateHistoryDropdown() {
        const history = getHistory();
        const select = document.getElementById('history-select-tags');
        select.innerHTML = '<option value="">-- Select an entry --</option>';
        for (const key in history) {
            select.innerHTML += `<option value="${key}">${key.replace(/\|\|/g, ' - ')}</option>`;
        }
    }

    function saveToHistory() {
        const currentForm = document.querySelector('#label-generator-content .form-wrapper:not(.hidden)');
        if (!currentForm) return;
        const productNameInput = currentForm.querySelector('input[id$="-product-name"], input[id$="-item-name"]');
        const batchNoInput = currentForm.querySelector('input[id$="-batch-no"], input[id$="-batch-lot-no"]');
        if (!productNameInput || !batchNoInput || !productNameInput.value || !batchNoInput.value) {
            alert('Please enter at least a Product Name and Batch Number to save to history.'); return;
        }
        const historyKey = `${productNameInput.value}||${batchNoInput.value}`;
        const historyData = { labelType: document.getElementById('label-type').value, fields: {} };
        currentForm.querySelectorAll('.history-field').forEach(field => {
            if (field.tagName === 'SELECT' && field.multiple) historyData.fields[field.id] = Array.from(field.selectedOptions).map(opt => opt.value);
            else if (field.classList.contains('dynamic-param')) {
                 if (!historyData.fields.dynamicParams) historyData.fields.dynamicParams = {};
                 historyData.fields.dynamicParams[field.dataset.paramName] = field.value;
            } else historyData.fields[field.id] = field.value;
        });
        const history = getHistory();
        history[historyKey] = historyData;
        saveHistoryToStorage(history);
        populateHistoryDropdown();
        alert(`Entry "${historyKey.replace(/\|\|/g, ' - ')}" saved successfully!`);
    }

    function loadFromHistory() {
        const select = document.getElementById('history-select-tags');
        const historyKey = select.value;
        if (!historyKey) { alert('Please select an entry to load.'); return; }
        const history = getHistory();
        const dataToLoad = history[historyKey];
        if (!dataToLoad) return;
        document.getElementById('label-type').value = dataToLoad.labelType;
        toggleFormVisibility();
        setTimeout(() => {
            for (const fieldId in dataToLoad.fields) {
                const field = document.getElementById(fieldId);
                if (field) {
                    if (field.tagName === 'SELECT' && field.multiple) {
                        const values = dataToLoad.fields[fieldId] || [];
                        Array.from(field.options).forEach(opt => { opt.selected = values.includes(opt.value); });
                    } else field.value = dataToLoad.fields[fieldId];
                }
            }
            if(dataToLoad.fields.dynamicParams) {
                const prefix = dataToLoad.labelType === 'raw-material' ? 'rm' : 'fp';
                generateDynamicParamInputs(prefix, dataToLoad.fields.dynamicParams);
            } else {
                document.getElementById('fp-dynamic-params-container').innerHTML = '';
                document.getElementById('rm-dynamic-params-container').innerHTML = '';
            }
        }, 100); 
    }

    function deleteFromHistory() {
        const select = document.getElementById('history-select-tags');
        const historyKey = select.value;
        if (!historyKey) { alert('Please select an entry to delete.'); return; }
        if (confirm(`Are you sure you want to delete "${historyKey.replace(/\|\|/g, ' - ')}"?`)) {
            const history = getHistory();
            delete history[historyKey];
            saveHistoryToStorage(history);
            populateHistoryDropdown();
            alert('Entry deleted.');
        }
    }

    function prepareAndPrint() {
        const labelType = document.getElementById('label-type').value;
        const tagStatus = document.getElementById('tag-status').value;
        const totalContainers = parseInt(document.getElementById('total-container-count').value, 10) || 0;
        const tagsToPrintStr = document.getElementById('tags-to-print').value;
        const formId = `#${labelType}-form`;
        if (totalContainers <= 0) { alert('Please enter a valid "Total # of Containers".'); return; }
        if (!tagsToPrintStr) { alert('Please enter the container numbers to print.'); return; }
        const containerNumbers = parseTagNumbers(tagsToPrintStr);
        if (containerNumbers.length === 0) { alert('Invalid format for "Container #s to Print".'); return; }
        const data = {};
        document.querySelectorAll(`${formId} .history-field:not(.dynamic-param):not([multiple])`).forEach(input => {
            data[input.id.split('-').slice(1).join('-')] = input.value;
        });
        data.dynamicParams = {};
        document.querySelectorAll(`${formId} .dynamic-param`).forEach(input => {
             data.dynamicParams[input.dataset.paramName] = input.value;
        });
        const companyLogo = document.getElementById('logo-preview').src;
        let sopPrefix = { 'raw-material': 'rm', 'packing-material': 'pm', 'finished-product': 'fp' }[labelType];
        let sopStatusSuffix = tagStatus === 'released' ? 'approved' : tagStatus;
        const sopInputId = `${sopPrefix}-sop-${sopStatusSuffix}`;
        const sopInput = document.getElementById(sopInputId);
        if (!sopInput && (labelType !== 'packing-material' || tagStatus !== 'sampled')) {
            alert(`Error: Could not find document number field with ID: ${sopInputId}`); return; 
        }
        const sopNumber = sopInput ? sopInput.value : '';
        let tagsHtml = '';
        for (const containerNum of containerNumbers) {
             if (containerNum > totalContainers || containerNum < 1) continue;
            tagsHtml += buildTagHtml(labelType, data, tagStatus, sopNumber, companyLogo, containerNum, totalContainers);
        }
        document.body.classList.add('is-printing-tags');
        document.getElementById('print-area-tags').innerHTML = `<div class="print-container">${tagsHtml}</div>`;
        window.print();
    }

    function cleanupAfterPrint() {
        if (document.body.classList.contains('is-printing-tags')) {
            document.body.classList.remove('is-printing-tags');
            document.getElementById('print-area-tags').innerHTML = '';
        }
    }
    
    function buildTagHtml(type, data, status, sop, companyLogo, currentContainer, totalContainers) {
        let statusText, statusColor, headerTitle, subtitle, bodyHtml, dynamicFieldsHtml = '';
        switch (status) {
            case 'released': statusText = 'APPROVED'; statusColor = 'green'; break;
            case 'rejected': statusText = 'REJECTED'; statusColor = 'red'; break;
            case 'sampled': statusText = 'SAMPLED'; statusColor = '#007bff'; break;
        }
        for(const paramName in data.dynamicParams) {
            if(data.dynamicParams[paramName]) { 
                dynamicFieldsHtml += `<div class="field"><span class="field-label">${paramName}:</span><span class="field-value">${data.dynamicParams[paramName]}</span></div>`;
            }
        }
        switch (type) {
            case 'raw-material':
                headerTitle = statusText; subtitle = '(Raw Material)';
                bodyHtml = `<div class="field"><span class="field-label">QC #:</span><span class="field-value">${data['qc-no']||''}</span></div><div class="field"><span class="field-label">Container#:</span><span class="field-value">${currentContainer}/${totalContainers}</span></div><div class="field remarks-field"><span class="field-label">PRODUCT NAME:</span><span class="field-value">${data['product-name']||''}</span></div><div class="field"><span class="field-label">BATCH #:</span><span class="field-value">${data['batch-no']||''}</span></div><div class="field"><span class="field-label">MFG DATE:</span><span class="field-value">${data['mfg-date']||''}</span></div><div class="field"><span class="field-label">EXP. DATE:</span><span class="field-value">${data['exp-date']||''}</span></div><div class="field"><span class="field-label">BATCH SIZE:</span><span class="field-value">${data['batch-size']||''}</span></div><div class="field"><span class="field-label">TEST DATE:</span><span class="field-value">${formatDate(data['test-date'])}</span></div><div class="field"><span class="field-label">RELEASE DATE:</span><span class="field-value">${formatDate(data['release-date'])}</span></div>${dynamicFieldsHtml}<div class="field remarks-field"><span class="field-label">MANUFACTURER:</span><span class="field-value">${data['manufacturer']||''}</span></div><div class="field remarks-field"><span class="field-label">REMARKS:</span><span class="field-value">${data['remarks']||''}</span></div>`;
                break;
            case 'packing-material':
                headerTitle = statusText; subtitle = '(Packing Material)';
                bodyHtml = `<div class="field"><span class="field-label">QC #:</span><span class="field-value">${data['qc-no']||''}</span></div><div class="field"><span class="field-label">Container#:</span><span class="field-value">${currentContainer}/${totalContainers}</span></div><div class="field remarks-field"><span class="field-label">ITEM NAME:</span><span class="field-value">${data['item-name']||''}</span></div><div class="field"><span class="field-label">TOTAL QTY:</span><span class="field-value">${data['total-qty']||''}</span></div><div class="field"><span class="field-label">BATCH LOT #:</span><span class="field-value">${data['batch-lot-no']||''}</span></div><div class="field"><span class="field-label">RECEIVING DT:</span><span class="field-value">${formatDate(data['receiving-date'])}</span></div><div class="field"><span class="field-label">TEST DATE:</span><span class="field-value">${formatDate(data['test-date'])}</span></div><div class="field"><span class="field-label">RELEASE DATE:</span><span class="field-value">${formatDate(data['release-date'])}</span></div><div class="field remarks-field"><span class="field-label">SUPPLIER:</span><span class="field-value">${data['supplier']||''}</span></div><div class="field remarks-field"><span class="field-label">REMARKS:</span><span class="field-value">${data['remarks']||''}</span></div>`;
                break;
            case 'finished-product':
                headerTitle = (status === 'released') ? 'RELEASED' : 'REJECTED'; subtitle = '(Bulk / In-Process / Finished Product)';
                bodyHtml = `<div class="field"><span class="field-label">QC #:</span><span class="field-value">${data['qc-no']||''}</span></div><div class="field"><span class="field-label">Container#:</span><span class="field-value">${currentContainer}/${totalContainers}</span></div><div class="field remarks-field"><span class="field-label">PRODUCT NAME:</span><span class="field-value">${data['product-name']||''}</span></div><div class="field"><span class="field-label">BATCH #:</span><span class="field-value">${data['batch-no']||''}</span></div><div class="field"><span class="field-label">MFG DATE:</span><span class="field-value">${formatDate(data['mfg-date'])}</span></div><div class="field"><span class="field-label">EXP DATE:</span><span class="field-value">${formatDate(data['exp-date'])}</span></div><div class="field"><span class="field-label">BATCH SIZE:</span><span class="field-value">${data['batch-size']||''}</span></div><div class="field"><span class="field-label">TEST DATE:</span><span class="field-value">${formatDate(data['test-date'])}</span></div><div class="field"><span class="field-label">RELEASE DATE:</span><span class="field-value">${formatDate(data['release-date'])}</span></div>${dynamicFieldsHtml}<div class="field remarks-field"><span class="field-label">REMARKS:</span><span class="field-value">${data['remarks']||''}</span></div>`;
                break;
        }
        return `<div class="tag"><div><div class="tag-header"><div class="logo-area"><img src="${companyLogo}" alt="Logo"></div><div class="title-block"><h3 style="color: ${statusColor};">${headerTitle}</h3><p class="subtitle">${subtitle}</p></div><div class="sop-block">${sop}</div></div><div class="tag-body">${bodyHtml}</div></div><div class="tag-footer"><div>QC/ANALYST:</div></div></div>`;
    }

    function init() {
        loadSavedData();
        setDefaultDates();
        setupEventListeners();
        toggleFormVisibility(); 
        populateHistoryDropdown();
        autoFillTagsToPrint();
    }

    return { init };
})();