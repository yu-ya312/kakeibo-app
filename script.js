document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const views = document.querySelectorAll('.view-section');
    const navItems = document.querySelectorAll('#nav-menu li');
    const resetBtn = document.getElementById('reset-btn');
    const pageTitle = document.getElementById('page-title');
    const encodingSelect = document.getElementById('encoding-select');
    
    // Stats
    const grossExpenseEl = document.getElementById('gross-expense');
    const transactionCountBadge = document.getElementById('transaction-count-badge');
    const monthSelectEl = document.getElementById('month-select');
    const fixedInputs = document.querySelectorAll('.fixed-expense-input');
    
    // Table
    const tableBody = document.getElementById('table-body');
    const searchInput = document.getElementById('search-input');
    const headers = document.querySelectorAll('th[data-sort]');
    
    // State
    let globalData = [];
    let currentSort = { key: null, asc: true };
    let categoryChartInst = null;
    let expenseChartInst = null;
    let fixedData = {}; // Store custom inputs based on YYYY/MM

    // --- Data Persistence ---
    function saveData() {
        localStorage.setItem('smartReceipt_globalData', JSON.stringify(globalData));
        localStorage.setItem('smartReceipt_fixedData', JSON.stringify(fixedData));
    }

    function loadData() {
        const storedGlobal = localStorage.getItem('smartReceipt_globalData');
        const storedFixed = localStorage.getItem('smartReceipt_fixedData');
        if (storedGlobal) {
            try { globalData = JSON.parse(storedGlobal); } catch (e) { globalData = []; }
        }
        if (storedFixed) {
            try { fixedData = JSON.parse(storedFixed); } catch (e) { fixedData = {}; }
        }
        
        if (globalData.length > 0) {
            populateMonthSelect();
            monthSelectEl.classList.remove('hidden');
            if (monthSelectEl.options.length > 0) {
                monthSelectEl.selectedIndex = 0; // Load newest month
            }
            renderCurrentMonth();
            switchView('dashboard');
            resetBtn.classList.remove('hidden');
        }
    }

    // --- Navigation & Views ---
    function switchView(target) {
        views.forEach(v => v.classList.add('hidden'));
        document.getElementById(`${target}-view`).classList.remove('hidden');
        
        navItems.forEach(item => {
            if(item.dataset.target === target) item.classList.add('active');
            else item.classList.remove('active');
        });
        
        if(target === 'dashboard') pageTitle.textContent = '支出分析ダッシュボード';
        if(target === 'transactions') pageTitle.textContent = '取引一覧';
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if(globalData.length > 0) switchView(item.dataset.target);
        });
    });

    resetBtn.addEventListener('click', () => {
        // DONT clear globalData. Just show upload view to append.
        views.forEach(v => v.classList.add('hidden'));
        document.getElementById('upload-view').classList.remove('hidden');
        navItems.forEach(i => i.classList.remove('active'));
    });

    // --- File Input & Drag and Drop ---
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        const name = file.name.toLowerCase();
        if (!name.endsWith('.csv') && !name.endsWith('.txt') && !name.endsWith('.text')) {
            alert('❗ ファイル形式エラー\n\nCSVまたはテキストファイル（.csv / .txt）を選択してください。\n対応していないファイル形式です。');
            return;
        }

        if (file.size === 0) {
            alert('❗ 空ファイルエラー\n\n選択されたファイルは空です。\nデータが入ったCSVまたはテキストファイルを選び直してください。');
            return;
        }

        const reader = new FileReader();
        const encoding = encodingSelect.value;
        reader.onload = (e) => {
            const text = e.target.result;
            if (!text || text.trim().length === 0) {
                alert('❗ 空ファイルエラー\n\nファイルの中身が空です。\nデータが入ったファイルを選び直してください。');
                return;
            }
            parseAndProcessData(text);
        };
        reader.readAsText(file, encoding);
    }

    // --- Utilities ---
    // Simple CSV parser that handles quotes
    function parseCSVLine(text) {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur);
        return result.map(s => s.replace(/^"|"$/g, '').trim());
    }

    function guessCategory(name) {
        const n = name.toLowerCase();
        // 食費キーワード
        const foodKeys = ['肉', '鶏', '豚', '牛', '魚', '白菜', 'キャベツ', '野菜', '果物', 'パン', '牛乳', 'コーヒー', 'うどん', 'ヌードル', 'ビスケット', 'チョコ', 'マアム', 'あん', 'マルちゃん', 'ちゃんぽん'];
        // 日用品キーワード
        const dailyKeys = ['袋', 'ごみ', 'ゴミ', 'パンツ', '洗剤', 'シャンプー', 'ペーパー', 'ティッシュ', 'マミーポコ'];
        
        for(let k of dailyKeys) if(n.includes(k)) return '日用品';
        for(let k of foodKeys) if(n.includes(k)) return '食費';
        
        if (name.includes('値引') || name.includes('割引')) return '割引';
        return 'その他';
    }

    function formatCurrency(val) {
        return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(val);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function (s) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[s];
        });
    }

    // --- Core Processing ---
    function parseAndProcessData(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
            alert('❗ データなしエラー\n\nファイルにデータ行が見つかりませんでした。\n「日付, 時刻, 商品名, 金額」の形式で記載されたCSVまたはテキストファイルをお使いください。');
            return;
        }

        // Check if first data line has at least 2 comma-separated columns
        const testLine = parseCSVLine(lines[lines.length > 1 ? 1 : 0]);
        if (testLine.length < 2) {
            alert('❗ フォーマットエラー\n\nファイルの形式が正しくありません。\n各行がカンマ区切り（CSV形式）になっているか確認してください。\n\n例: 2026/03/01,12:00,商品名,500');
            return;
        }

        const header = parseCSVLine(lines[0]);
        let dateIdx = 0, timeIdx = 1, nameIdx = 2, amountIdx = 3, qtIdx = 4;
        let foundHeaders = false;

        const hMap = {};
        for (let i = 0; i < header.length; i++) {
            const h = header[i] ? header[i].replace(/\s+/g, '') : '';
            if (!h) continue;
            
            if (h.includes('日付') || h.includes('購入日') || h.includes('日時')) hMap.date = i;
            else if (h.includes('時間') || h.includes('時刻')) hMap.time = i;
            else if (h === '店舗名' || h === '店名' || h.includes('ショップ')) hMap.shop = i; // skip shop
            else if (h.includes('商品名') || h.includes('品名') || h.includes('内容') || h === '名') hMap.name = i;
            else if (h.includes('数量') || h === '数') hMap.qt = i;
            else if (h === '金額' || h.includes('支払') || h.includes('合計')) hMap.amount = i;
            else if (h.includes('単価') || h === '額') hMap.price = i;
        }

        if (hMap.date !== undefined || hMap.name !== undefined || hMap.amount !== undefined || hMap.price !== undefined) {
             foundHeaders = true;
             dateIdx = hMap.date !== undefined ? hMap.date : 0;
             timeIdx = hMap.time !== undefined ? hMap.time : 1;
             nameIdx = hMap.name !== undefined ? hMap.name : 2;
             qtIdx = hMap.qt !== undefined ? hMap.qt : -1;
             amountIdx = hMap.amount !== undefined ? hMap.amount : (hMap.price !== undefined ? hMap.price : 3);
        }

        let startIndex = foundHeaders ? 1 : 0;

        // Find the current max ID to increment
        let currentMaxId = globalData.length > 0 ? Math.max(...globalData.map(d => d.id)) : 0;
        for (let i = startIndex; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            if (cols.length >= 2) {
                const amount = (amountIdx < cols.length && amountIdx >= 0) ? (parseInt(cols[amountIdx], 10) || 0) : 0;
                const quantity = (qtIdx < cols.length && qtIdx >= 0 && cols[qtIdx]) ? (parseInt(cols[qtIdx], 10) || 1) : 1;
                
                // fallback to default columns if data is lacking
                const dateStr = (dateIdx < cols.length) ? cols[dateIdx] : '';
                const timeStr = (timeIdx < cols.length) ? cols[timeIdx] : '';
                const nameStr = (nameIdx < cols.length) ? cols[nameIdx] : '不明な商品';

                currentMaxId++;
                globalData.push({
                    id: currentMaxId,
                    date: dateStr,
                    time: timeStr,
                    name: nameStr,
                    category: guessCategory(nameStr),
                    quantity: quantity,
                    amount: amount
                });
            }
        }

        if (globalData.length > 0) {
            // Remember current selection to keep it if it still exists
            const currentSelected = monthSelectEl ? monthSelectEl.value : null;

            populateMonthSelect();
            monthSelectEl.classList.remove('hidden');

            if (currentSelected && document.querySelector(`#month-select option[value="${currentSelected}"]`)) {
                monthSelectEl.value = currentSelected;
            } else {
                // If the previously selected month is gone (rare if we append) or nothing was selected, use the newest month
                monthSelectEl.selectedIndex = 0;
            }

            renderCurrentMonth();
        }

        switchView('dashboard');
        resetBtn.classList.remove('hidden');
        saveData();
    }

    function populateMonthSelect() {
        const months = new Set();
        globalData.forEach(item => {
            const parts = item.date.split('/');
            if (parts.length >= 2) {
                months.add(`${parts[0]}/${parts[1]}`);
            }
        });
        const sortedMonths = Array.from(months).sort().reverse();
        monthSelectEl.innerHTML = '';
        sortedMonths.forEach(m => {
            const option = document.createElement('option');
            option.value = m;
            const parts = m.split('/');
            option.textContent = `${parts[0]}年${parts[1]}月`;
            monthSelectEl.appendChild(option);
        });
    }

    function getFilteredData() {
        const selectedMonth = monthSelectEl.value;
        if (!selectedMonth) return globalData;
        return globalData.filter(item => item.date.startsWith(selectedMonth));
    }

    function renderCurrentMonth() {
        const month = monthSelectEl.value;
        const monthFixed = fixedData[month] || {};
        fixedInputs.forEach(input => {
            const key = input.dataset.key;
            input.value = monthFixed[key] || '';
        });

        const data = getFilteredData();
        updateDashboard(data);
        const q = searchInput.value.toLowerCase();
        if (q) {
            const searched = data.filter(item => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q));
            renderTable(searched);
        } else {
            renderTable(data);
        }
    }

    if (monthSelectEl) {
        monthSelectEl.addEventListener('change', () => {
            renderCurrentMonth();
        });
    }

    fixedInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const month = monthSelectEl.value;
            if(!month) return;
            if(!fixedData[month]) fixedData[month] = {};

            const val = parseInt(e.target.value) || 0;
            if(e.target.value === '') {
                delete fixedData[month][e.target.dataset.key];
            } else {
                fixedData[month][e.target.dataset.key] = val;
            }
            
            const data = getFilteredData();
            updateDashboard(data);
            saveData();
        });
    });

    function updateDashboard(data) {
        let gross = 0;
        let categoryTotals = { '食費': 0, '日用品': 0, 'その他': 0 };
        let itemCosts = {};

        const month = monthSelectEl.value;
        let fixedTotal = 0;
        if(month && fixedData[month]) {
            Object.entries(fixedData[month]).forEach(([key, val]) => {
                fixedTotal += val;
                // カテゴリごとの合計をそのまま追加 (例: "電気代": 5000)
                categoryTotals[key] = (categoryTotals[key] || 0) + val;
            });
        }

        data.forEach(item => {
            gross += item.amount; // Allow negative values to reduce the total expense (net cost)

            if (item.amount > 0) {
                if(categoryTotals[item.category] !== undefined) categoryTotals[item.category] += item.amount;
                else categoryTotals['その他'] += item.amount;
                
                itemCosts[item.name] = (itemCosts[item.name] || 0) + item.amount;
            }
        });

        gross += fixedTotal;

        grossExpenseEl.textContent = formatCurrency(gross);
        transactionCountBadge.textContent = `${data.length}件`;

        drawCategoryChart(categoryTotals);
        drawTrendChart(); // Using all global data for trends
    }

    // --- Charts ---
    function drawCategoryChart(categoryTotals) {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        if (categoryChartInst) categoryChartInst.destroy();

        const labels = Object.keys(categoryTotals).filter(k => categoryTotals[k] > 0);
        const data = labels.map(k => categoryTotals[k]);

        // Vibrant distinct colors for many categories
        const colors = ['#f59e0b', '#6366f1', '#94a3b8', '#ec4899', '#10b981', '#14b8a6', '#f43f5e', '#8b5cf6', '#0ea5e9'];
        
        categoryChartInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                },
                cutout: '70%'
            }
        });
    }

    function drawTrendChart() {
        const ctx = document.getElementById('expenseChart').getContext('2d');
        if (expenseChartInst) expenseChartInst.destroy();

        // 1. Determine the past 6 months to show based on selected month, or latest date if none
        let refMonth = monthSelectEl.value;
        if (!refMonth) {
            const allMonths = new Set(globalData.map(d => {
                const parts = d.date.split('/');
                return `${parts[0]}/${parts[1]}`;
            }));
            const sortedAll = Array.from(allMonths).sort().reverse();
            refMonth = sortedAll.length > 0 ? sortedAll[0] : null;
        }
        
        if (!refMonth) return; // No data

        // Generate the 6 month labels ending at refMonth
        let [refYear, refM] = refMonth.split('/').map(Number);
        const last6 = [];
        for(let i = 5; i >= 0; i--) {
            let m = refM - i;
            let y = refYear;
            while(m <= 0) {
                m += 12;
                y -= 1;
            }
            last6.push({ y, m, str: `${y}/${m.toString().padStart(2, '0')}` });
        }

        // 2. Aggregate Data per Year for rendering multi-lines (Since user requested: different years = different colors)
        // X-axis will just be "1月, 2月" string representation of the months. To properly overlay years, 
        // the X axis will literally just be the past 6 months we calculate.

        // Actually user requested: "左に金額、下に12ヶ月を表示したい。年が違うと色が違う線にし、過去6ヶ月を同時に表示したい"
        // Interpretation: X-axis has 12 months (Jan-Dec). Multiple lines for each Year showing the trend, showing past 6 months of data, or just show all data properly.
        // Let's standardise the X-axis as 1月〜12月.
        
        const monthlyTotalsByYear = {}; // { 2024: [null, null, 1000, 2000, ...], 2025: [...] }
        
        // Helper to aggregate
        const addExpense = (year, monthIndex, amount) => {
            if(!monthlyTotalsByYear[year]) monthlyTotalsByYear[year] = new Array(12).fill(null);
            if(monthlyTotalsByYear[year][monthIndex] === null) monthlyTotalsByYear[year][monthIndex] = 0;
            monthlyTotalsByYear[year][monthIndex] += amount;
        };

        // Aggregate Variable Expenses
        globalData.forEach(item => {
            const parts = item.date.split('/');
            if(parts.length >= 2) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1; // 0-11
                
                // Only include positive expenses for trend
                if(item.amount > 0) {
                    addExpense(y, m, item.amount);
                } else {
                    addExpense(y, m, item.amount); // Apply discounts etc
                }
            }
        });

        // Aggregate Fixed Expenses
        Object.entries(fixedData).forEach(([monthStr, inputs]) => {
            const parts = monthStr.split('/');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            
            let fTotal = 0;
            Object.values(inputs).forEach(v => fTotal += v);
            if(fTotal > 0) {
                addExpense(y, m, fTotal);
            }
        });

        // 3. Create Chart Datasets
        const yearColors = [
            'rgb(99, 102, 241)', // Primary Indigo
            'rgb(244, 63, 94)',  // Rose
            'rgb(16, 185, 129)', // Emerald
            'rgb(245, 158, 11)'   // Amber
        ];
        
        const datasets = [];
        let colorIdx = 0;

        Object.keys(monthlyTotalsByYear).sort().forEach(yearStr => {
            const color = yearColors[colorIdx % yearColors.length];
            datasets.push({
                label: `${yearStr}年`,
                data: monthlyTotalsByYear[yearStr],
                borderColor: color,
                backgroundColor: color,
                tension: 0.3,
                borderWidth: 3,
                pointBackgroundColor: 'white',
                pointBorderWidth: 2,
                pointRadius: 4,
                spanGaps: true // CONNECT lines even if some months are missing
            });
            colorIdx++;
        });

        const xLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

        expenseChartInst = new Chart(ctx, {
            type: 'line',
            data: {
                labels: xLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        display: true,
                        position: 'top' 
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatCurrency(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { borderDash: [4, 4] },
                        ticks: {
                            callback: function(value) {
                                return '¥' + value.toLocaleString();
                            }
                        }
                    }, 
                    x: { 
                        grid: { display: false } 
                    } 
                }
            }
        });
    }

    // --- Table ---
    function renderTable(data) {
        tableBody.innerHTML = '';
        let listTotal = 0;
        data.forEach(entry => {
            listTotal += entry.amount;
            const tr = document.createElement('tr');
            
            // Category Badge Class
            let badgeClass = 'cat-other';
            let cat = entry.category;
            if(cat === '割引' || cat === '値引') cat = '値引';

            if(cat === '食費') badgeClass = 'cat-food';
            if(cat === '日用品') badgeClass = 'cat-daily';
            if(cat === '値引') badgeClass = 'cat-discount';

            const amountClass = entry.amount < 0 ? 'text-success' : '';

            tr.innerHTML = `
                <td><input type="text" class="edit-input transparent-input" data-id="${entry.id}" data-field="date" value="${escapeHtml(entry.date)}" style="width: 100px;"></td>
                <td style="width: 120px;">
                    <select class="edit-input transparent-select cat-badge ${badgeClass}" data-id="${entry.id}" data-field="category" style="width: 100%; padding-right: 15px;">
                        <option value="食費" ${cat === '食費' ? 'selected' : ''}>食費</option>
                        <option value="日用品" ${cat === '日用品' ? 'selected' : ''}>日用品</option>
                        <option value="値引" ${cat === '値引' ? 'selected' : ''}>値引</option>
                        <option value="その他" ${cat === 'その他' ? 'selected' : ''}>その他</option>
                    </select>
                </td>
                <td><input type="text" class="edit-input transparent-input" data-id="${entry.id}" data-field="name" value="${escapeHtml(entry.name)}"></td>
                <td class="text-right"><input type="number" class="edit-input transparent-input text-right" data-id="${entry.id}" data-field="quantity" value="${entry.quantity || 1}" style="width: 60px;"></td>
                <td class="text-right ${amountClass}">
                    <input type="number" class="edit-input transparent-input text-right" data-id="${entry.id}" data-field="amount" value="${entry.amount}" style="width: 100px;">
                </td>
                <td class="text-center" style="width: 50px;">
                    <button class="delete-btn" data-id="${entry.id}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; width: 100%; transition: background 0.2s;" title="削除" onmouseover="this.style.backgroundColor='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.backgroundColor='transparent'">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Update list total
        const listTotalEl = document.getElementById('list-total-amount');
        if(listTotalEl) listTotalEl.textContent = formatCurrency(listTotal);
        
        // Add event listeners for editing
        tableBody.querySelectorAll('.edit-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.id, 10);
                const field = e.target.dataset.field;
                let val = e.target.value;

                const item = globalData.find(d => d.id === id);
                if (item) {
                    if (field === 'amount' || field === 'quantity') {
                        val = parseInt(val, 10) || (field === 'quantity' ? 1 : 0);
                        item[field] = val;
                    } else if (field === 'category') {
                        item[field] = val;
                    } else {
                        item[field] = val;
                    }
                    saveData();
                    renderCurrentMonth(); // Re-render to update dashboard stats and list total
                }
            });
        });

        // Add event listeners for delete
        tableBody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id, 10);
                if (confirm('この取引を削除しますか？')) {
                    globalData = globalData.filter(d => d.id !== id);
                    saveData();
                    renderCurrentMonth();
                }
            });
        });
    }

    // Search
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const baseData = getFilteredData();
        const filtered = baseData.filter(item => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q));
        renderTable(filtered);
    });

    // Sort
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const key = header.dataset.sort;
            if (currentSort.key === key) {
                currentSort.asc = !currentSort.asc;
            } else {
                currentSort.key = key;
                currentSort.asc = true;
            }

            headers.forEach(h => h.querySelector('.sort-icon').textContent = '');
            header.querySelector('.sort-icon').textContent = currentSort.asc ? '▲' : '▼';

            let baseData = getFilteredData();
            const q = searchInput.value.toLowerCase();
            if (q) {
                baseData = baseData.filter(item => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q));
            }

            const sorted = [...baseData].sort((a, b) => {
                let valA = a[key];
                let valB = b[key];
                
                if (key === 'amount') {
                    return currentSort.asc ? valA - valB : valB - valA;
                } else {
                    if (valA < valB) return currentSort.asc ? -1 : 1;
                    if (valA > valB) return currentSort.asc ? 1 : -1;
                    return 0;
                }
            });
            renderTable(sorted);
        });
    });

    // 読み込み時にデータを復元
    loadData();
});
