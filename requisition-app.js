const requisitionApp = (() => {
    let itemRowCount = 1;
    let approvedItems = {};
    
    function init() {
        approvedItems = JSON.parse(localStorage.getItem('approvedLabItems')) || {};
        if (Object.keys(approvedItems).length === 0) {
          approvedItems = {
            "ethanol": { brand: "Sigma-Aldrich" }, "methanol": { brand: "Merck" }, "hydrochloric acid": { brand: "Fisher Scientific" },
            "sodium hydroxide": { brand: "Thermo Scientific" }, "acetone": { brand: "VWR" }, "benzene": { brand: "Sigma-Aldrich" }, "glycerol": { brand: "Thermo Scientific" }
          };
          localStorage.setItem('approvedLabItems', JSON.stringify(approvedItems));
        }

        setupEventListeners();
        setCurrentDate();
        setNextRequisitionNumber();
        displayHistory();
        suggestItem(0);
    }
    
    function setupEventListeners() {
        document.getElementById('add-req-item-btn').addEventListener('click', addItemRow);
        document.getElementById('save-req-btn').addEventListener('click', saveRequisition);
        document.getElementById('clear-req-btn').addEventListener('click', clearForm);
        document.getElementById('print-req-btn').addEventListener('click', printRequisition);

        const reqContent = document.getElementById('purchase-requisition-content');
        
        reqContent.addEventListener('input', e => {
            if (e.target.classList.contains('item-description-input')) {
                const rowIndex = e.target.dataset.rowIndex;
                showAutocomplete(rowIndex);
            }
        });

        reqContent.addEventListener('click', e => {
            const target = e.target;
            if (target.classList.contains('delete-req-row')) {
                deleteItemRow(target.dataset.rowId);
            }
            if (target.closest('.autocomplete-item')) {
                const itemDiv = target.closest('.autocomplete-item');
                const rowIndex = itemDiv.dataset.rowIndex;
                const input = document.getElementById(`itemDescription_${rowIndex}`);
                const autocompleteList = document.getElementById(`autocomplete-list_${rowIndex}`);
                input.value = itemDiv.querySelector('input').value;
                autocompleteList.innerHTML = "";
                autocompleteList.style.display = "none";
                suggestItem(rowIndex);
            }
             if (target.classList.contains('load-req-btn')) {
                loadRequisition(parseInt(target.dataset.index, 10));
            }
            if (target.classList.contains('delete-req-btn')) {
                deleteRequisition(parseInt(target.dataset.index, 10));
            }
        });

        document.addEventListener("click", function(e) {
          if (!e.target.closest('.autocomplete-container')) {
            closeAllLists();
          }
        });

        // FIX: ROBUST PRINT CLEANUP
        window.addEventListener('afterprint', () => {
            if (document.body.classList.contains('is-printing-req')) {
                document.body.classList.remove('is-printing-req');
            }
        });
    }

    function setCurrentDate() {
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('date-req').value = today;
    }

    function setNextRequisitionNumber() {
        const history = JSON.parse(localStorage.getItem('purchaseRequisitionHistory')) || [];
        let nextReqNum = "LR-001";
        if (history.length > 0) {
            const lastReqNum = history[history.length - 1].requisitionNo;
            const matches = lastReqNum.match(/\d+/g);
            if (matches) {
                const lastNumPart = matches[matches.length - 1];
                const nextNum = parseInt(lastNumPart, 10) + 1;
                const prefix = lastReqNum.substring(0, lastReqNum.lastIndexOf(lastNumPart));
                nextReqNum = `${prefix}${String(nextNum).padStart(lastNumPart.length, '0')}`;
            }
        }
        document.getElementById('requisitionNo').value = nextReqNum;
    }

    function addItemRow() {
        const tbody = document.getElementById('itemDetailsBody');
        const newRow = tbody.insertRow();
        newRow.id = `itemRow_${itemRowCount}`;
        newRow.innerHTML = `
            <td>${tbody.rows.length}</td>
            <td>
              <div class="autocomplete-container">
                <input type="text" id="itemDescription_${itemRowCount}" class="item-description-input" data-row-index="${itemRowCount}">
                <div id="autocomplete-list_${itemRowCount}" class="autocomplete-items"></div>
              </div>
            </td>
            <td id="brandCell_${itemRowCount}"><input type="text" id="brand_${itemRowCount}" list="brandOptions_${itemRowCount}"></td>
            <td><input type="text" id="packSize_${itemRowCount}" list="packSizeOptions"></td>
            <td><input type="number" id="quantity_${itemRowCount}"></td>
            <td><input type="text" id="remarks_${itemRowCount}"></td>
            <td><button class="danger delete-req-row" data-row-id="itemRow_${itemRowCount}">Delete</button></td>`;
        itemRowCount++;
    }

    function deleteItemRow(rowId) {
        const row = document.getElementById(rowId);
        if (row) {
            row.remove();
            const tbody = document.getElementById('itemDetailsBody');
            tbody.querySelectorAll('tr').forEach((r, i) => { r.cells[0].textContent = i + 1; });
        }
    }

    function showAutocomplete(rowIndex) {
        const input = document.getElementById(`itemDescription_${rowIndex}`);
        const searchTerm = input.value.trim().toLowerCase();
        const autocompleteList = document.getElementById(`autocomplete-list_${rowIndex}`);
        
        closeAllLists(rowIndex);

        // FIX: EXPLICITLY HIDE THE BOX IF THE INPUT IS EMPTY
        if (!searchTerm) {
            autocompleteList.innerHTML = "";
            autocompleteList.style.display = "none";
            return;
        }

        const matchingItems = Object.keys(approvedItems).filter(item => item.toLowerCase().includes(searchTerm));
        if (matchingItems.length === 0) {
            autocompleteList.innerHTML = "";
            autocompleteList.style.display = "none";
            return;
        }

        autocompleteList.innerHTML = ""; // Clear previous results
        autocompleteList.style.display = "block";
        matchingItems.forEach(item => {
            const itemDiv = document.createElement("DIV");
            itemDiv.className = 'autocomplete-item';
            itemDiv.dataset.rowIndex = rowIndex;
            const bolded = item.replace(new RegExp(`(${searchTerm})`, 'gi'), '<strong>$1</strong>');
            itemDiv.innerHTML = `${bolded}<input type='hidden' value='${item}'>`;
            autocompleteList.appendChild(itemDiv);
        });
    }
    
    function closeAllLists(exceptRowIndex = -1) {
        document.querySelectorAll(".autocomplete-items").forEach(list => {
            const listRowIndex = parseInt(list.id.split('_')[1]);
            if (listRowIndex !== exceptRowIndex) {
                list.innerHTML = "";
                list.style.display = "none";
            }
        });
    }

    function suggestItem(rowIndex) {
        const itemDescInput = document.getElementById(`itemDescription_${rowIndex}`);
        const itemName = itemDescInput.value.trim().toLowerCase();
        if (itemName && approvedItems[itemName]) {
            const itemData = approvedItems[itemName];
            let brandOptions = '';
            if (Array.isArray(itemData)) {
                itemData.forEach(option => { brandOptions += `<option value="${option.brand}">`; });
                document.getElementById(`brand_${rowIndex}`).value = itemData[0].brand;
            } else {
                brandOptions = `<option value="${itemData.brand}">`;
                document.getElementById(`brand_${rowIndex}`).value = itemData.brand;
            }
            let datalist = document.getElementById(`brandOptions_${rowIndex}`);
            if (!datalist) {
                datalist = document.createElement('datalist');
                datalist.id = `brandOptions_${rowIndex}`;
                document.body.appendChild(datalist);
            }
            datalist.innerHTML = brandOptions;
            document.getElementById(`brand_${rowIndex}`).setAttribute('list', `brandOptions_${rowIndex}`);
        }
    }

    function saveRequisition() {
        const requisition = {
            requisitionNo: document.getElementById('requisitionNo').value, date: document.getElementById('date-req').value,
            department: document.getElementById('department').value, requestedBy: document.getElementById('requestedBy').value, items: []
        };
        document.getElementById('itemDetailsBody').querySelectorAll('tr').forEach(row => {
            const rowIndex = row.id.split('_')[1]; 
            const item = {
                itemDescription: document.getElementById(`itemDescription_${rowIndex}`).value, brand: document.getElementById(`brand_${rowIndex}`).value,
                packSize: document.getElementById(`packSize_${rowIndex}`).value, quantity: document.getElementById(`quantity_${rowIndex}`).value,
                remarks: document.getElementById(`remarks_${rowIndex}`).value
            };
            if(item.itemDescription) requisition.items.push(item);
            const itemName = item.itemDescription.trim().toLowerCase();
            if (itemName && item.brand) {
                const newItemData = { brand: item.brand };
                if (approvedItems[itemName]) {
                    if (Array.isArray(approvedItems[itemName])) {
                        if (!approvedItems[itemName].some(b => b.brand.toLowerCase() === item.brand.toLowerCase())) {
                            approvedItems[itemName].push(newItemData);
                        }
                    } else if (approvedItems[itemName].brand.toLowerCase() !== item.brand.toLowerCase()) {
                        approvedItems[itemName] = [approvedItems[itemName], newItemData];
                    }
                } else approvedItems[itemName] = newItemData;
            }
        });
        localStorage.setItem('approvedLabItems', JSON.stringify(approvedItems));
        let history = JSON.parse(localStorage.getItem('purchaseRequisitionHistory')) || [];
        const existingIndex = history.findIndex(h => h.requisitionNo === requisition.requisitionNo);
        if(existingIndex > -1) history[existingIndex] = requisition;
        else history.push(requisition);
        localStorage.setItem('purchaseRequisitionHistory', JSON.stringify(history));
        alert('Purchase Requisition saved successfully!');
        displayHistory();
        setNextRequisitionNumber();
    }

    function displayHistory() {
        const historyBody = document.getElementById('historyBody-req');
        historyBody.innerHTML = '';
        const history = JSON.parse(localStorage.getItem('purchaseRequisitionHistory')) || [];
        history.forEach((entry, index) => {
            historyBody.innerHTML += `<tr><td>${entry.requisitionNo}</td><td>${entry.date}</td><td>${entry.department}</td><td>${entry.requestedBy}</td>
            <td><button class="secondary load-req-btn" data-index="${index}">Load</button><button class="danger delete-req-btn" data-index="${index}">Delete</button></td></tr>`;
        });
    }

    function loadRequisition(index) {
        const history = JSON.parse(localStorage.getItem('purchaseRequisitionHistory')) || [];
        const entry = history[index];
        document.getElementById('requisitionNo').value = entry.requisitionNo;
        document.getElementById('date-req').value = entry.date;
        document.getElementById('department').value = entry.department;
        document.getElementById('requestedBy').value = entry.requestedBy;
        const tbody = document.getElementById('itemDetailsBody');
        tbody.innerHTML = ''; itemRowCount = 0;
        entry.items.forEach((item, i) => {
            addItemRow();
            const newRowId = itemRowCount - 1; 
            const row = document.getElementById(`itemRow_${newRowId}`);
            row.querySelector('.item-description-input').value = item.itemDescription;
            row.querySelector(`#brand_${newRowId}`).value = item.brand;
            row.querySelector(`#packSize_${newRowId}`).value = item.packSize || '';
            row.querySelector(`#quantity_${newRowId}`).value = item.quantity;
            row.querySelector(`#remarks_${newRowId}`).value = item.remarks || '';
            if (approvedItems[item.itemDescription.trim().toLowerCase()]) suggestItem(newRowId);
        });
    }

    function deleteRequisition(index) {
        if (confirm('Are you sure you want to delete this purchase requisition entry?')) {
            let history = JSON.parse(localStorage.getItem('purchaseRequisitionHistory')) || [];
            history.splice(index, 1);
            localStorage.setItem('purchaseRequisitionHistory', JSON.stringify(history));
            displayHistory();
        }
    }

    function clearForm() {
        setNextRequisitionNumber();
        setCurrentDate();
        document.getElementById('department').value = 'QC Lab';
        document.getElementById('requestedBy').value = 'Fahad Nazeer';
        document.getElementById('itemDetailsBody').innerHTML = ''; 
        itemRowCount = 0;
        addItemRow(); 
    }

    function printRequisition() {
        // The afterprint event listener will handle removing the class
        document.body.classList.add('is-printing-req');
        window.print();
    }

    return { init };
})();
