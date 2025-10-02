document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENTS & GLOBAL STATE---
    const mainContainer = document.querySelector('main.container');
    const fileInput = document.getElementById('csv-file');
    const jsonFileInput = document.getElementById('json-file');
    const saveBtn = document.getElementById('save-btn');
    const exportBtn = document.getElementById('export-btn');
    const playerPool = document.getElementById('player-pool');
    const tiersContainer = document.getElementById('tiers-container');
    const updateCriteriaBtn = document.getElementById('update-criteria-btn');
    const sortSelect = document.getElementById('sort-select');
    const filterCheckboxes = document.querySelectorAll('.filter-group input[type="checkbox"]');
    const searchInput = document.getElementById('search-input');
    
    let allPlayersData = [];
    let criteria = {
        pts: { elite: 100, good: 75, low: 40 },
        sog: { elite: 300, good: 225, low: 150 },
        hits: { elite: 200, good: 125, low: 50 },
    };
    const glowClasses = ['favorite-glow', 'must-draft-glow', 'sleeper-glow', 'value-glow', 'glass-glow'];
    const btnClassMap = {
        'star-icon': 'favorite-glow',
        'must-draft-btn': 'must-draft-glow',
        'sleeper-btn': 'sleeper-glow',
        'value-btn': 'value-glow',
        'glass-btn': 'glass-glow'
    };

    // --- EVENT LISTENERS ---
    fileInput.addEventListener('change', handleFileUpload);
    jsonFileInput.addEventListener('change', handleLoad);
    saveBtn.addEventListener('click', handleSave);
    exportBtn.addEventListener('click', handleExport);
    updateCriteriaBtn.addEventListener('click', handleCriteriaUpdate);
    sortSelect.addEventListener('change', updateAndRenderPlayerPool);
    filterCheckboxes.forEach(cb => cb.addEventListener('change', updateAndRenderPlayerPool));
    searchInput.addEventListener('keyup', handleSearch);

    mainContainer.addEventListener('click', (event) => {
        const target = event.target;
        const card = target.closest('.player-card');
        if (!card) return;

        if (target.closest('.action-btn')) {
            handleGlowToggle(target, card);
        } else if (!target.closest('.card-actions')) {
            card.classList.toggle('inactive');
        }
    });

    // --- FILE UPLOAD LOGIC FOR XLSX ONLY ---
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Get player stats from the first sheet
                    const mainSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const mainData = XLSX.utils.sheet_to_json(mainSheet);

                    // Get power play players from the "PP Units" sheet
                    let pppPlayers = new Set();
                    const pppSheetName = "PP Units";
                    
                    if (workbook.SheetNames.includes(pppSheetName)) {
                        const pppSheet = workbook.Sheets[pppSheetName];
                        const pppData = XLSX.utils.sheet_to_json(pppSheet);
                        const pppColumns = ['P1', 'P2', 'P3', 'P4', 'P5', 'S1', 'S2', 'S3', 'S4', 'S5'];
                        
                        pppData.forEach(row => {
                            pppColumns.forEach(col => {
                                if (row[col] && typeof row[col] === 'string') {
                                    pppPlayers.add(row[col].trim().toLowerCase());
                                }
                            });
                        });
                    }
                    
                    // Add PPP flag to main data
                    mainData.forEach(player => {
                        if (player.PLAYER && typeof player.PLAYER === 'string' && pppPlayers.has(player.PLAYER.trim().toLowerCase())) {
                            player.is_ppp = true;
                        }
                    });

                    processPlayerData(mainData);
                } catch (error) {
                    alert("An error occurred reading the Excel file. Please ensure it is a valid file.");
                    console.error(error);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert("Unsupported file type. Please upload an Excel (.xlsx) file.");
        }
    }

    function processPlayerData(data) {
        allPlayersData = data.filter(p => p && p.PLAYER);
        buildTiers();
        playerPool.innerHTML = '';
        allPlayersData.forEach(player => playerPool.appendChild(createPlayerCard(player)));
        initializeSortable();
        updateAndRenderPlayerPool();
    }
    
    function handleGlowToggle(button, card) {
        let activeGlowClass = null;
        for (const btnClass in btnClassMap) {
            if (button.classList.contains(btnClass)) {
                activeGlowClass = btnClassMap[btnClass];
                break;
            }
        }
        if (!activeGlowClass) return;

        const isAlreadyActive = button.classList.contains('active');
        card.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('active'));
        card.classList.remove(...glowClasses);

        if (!isAlreadyActive) {
            button.classList.add('active');
            card.classList.add(activeGlowClass);
        }
    }
    
    function handleSave() {
        if (allPlayersData.length === 0) { alert("Please load a player list before saving."); return; }
        const state = {
            tiers: {},
            cardStatuses: {},
            inactive: []
        };
        tiersContainer.querySelectorAll('.tier-slots').forEach((tier, index) => {
            state.tiers[`tier${index + 1}`] = Array.from(tier.children).map(card => card.id);
        });

        document.querySelectorAll('.player-card').forEach(card => {
            for (const glow of glowClasses) {
                if (card.classList.contains(glow)) {
                    state.cardStatuses[card.id] = glow;
                    break;
                }
            }
        });
        document.querySelectorAll('.player-card.inactive').forEach(el => state.inactive.push(el.id));

        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `nhl-tiers-save.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    
    function handleLoad(event) {
        if (allPlayersData.length === 0) { alert("Load a Player XLSX first."); event.target.value = ''; return; }
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try { restoreState(JSON.parse(e.target.result)); } 
            catch (error) { alert("Error reading save file."); console.error(error); }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    function restoreState(state) {
        const allCards = new Map();
        document.querySelectorAll('.player-card').forEach(card => allCards.set(card.id, card));

        document.querySelectorAll('.player-card').forEach(card => {
            card.classList.remove(...glowClasses, 'inactive');
            card.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('active'));
        });

        playerPool.innerHTML = '';
        tiersContainer.querySelectorAll('.tier-slots').forEach(tier => tier.innerHTML = '');
        for (const tierId in state.tiers) {
            const tierElement = tiersContainer.querySelector(`[data-tier-num='${tierId.replace('tier', '')}']`);
            if (tierElement) {
                state.tiers[tierId].forEach(cardId => {
                    if (allCards.has(cardId)) { tierElement.appendChild(allCards.get(cardId)); allCards.delete(cardId); }
                });
            }
        }
        allCards.forEach(card => playerPool.appendChild(card));

        for (const cardId in state.cardStatuses) {
            const card = document.getElementById(cardId);
            const glowClass = state.cardStatuses[cardId];
            if (card && glowClass) {
                card.classList.add(glowClass);
                for(const btnClass in btnClassMap){
                    if(btnClassMap[btnClass] === glowClass){
                        card.querySelector(`.${btnClass}`)?.classList.add('active');
                        break;
                    }
                }
            }
        }
        state.inactive.forEach(id => document.getElementById(id)?.classList.add('inactive'));
        updateAndRenderPlayerPool();
    }
    
    function buildTiers() {
        tiersContainer.innerHTML = '';
        for (let i = 1; i <= 16; i++) {
            tiersContainer.appendChild(createTierElement(i));
        }
    }

    function initializeSortable() {
        document.querySelectorAll('.tier-slots').forEach(container => {
            new Sortable(container, { group: 'players', animation: 150 });
        });
    }

    function createPlayerCard(player) {
        const card = document.createElement('div');
        const posGroup = getPositionGroup(player.YPOS);
        card.className = 'player-card';
        card.id = `player-${player.LWLRANK}`;
        card.dataset.playerName = player.PLAYER;
        card.classList.add(`border-${posGroup}`);
        card.innerHTML = createPlayerCardInnerHtml(player);
        return card;
    }

    function createPlayerCardStatsHtml(player) {
         return getPositionGroup(player.YPOS) === 'goalie'
            ? `<div class="goalie-stats">Goalie Stats N/A</div>`
            : `<div class="stats">
                ${getStatMarkup(player.P_PTS, 'pts')}
                ${getStatMarkup(player.P_SOG, 'sog')}
                ${getStatMarkup(player.P_H, 'hits')}
              </div>`;
    }

    function createPlayerCardInnerHtml(player) {
        const pppIndicator = player.is_ppp ? '<strong class="ppp-indicator">PPP</strong>' : '';
        return `
            <div class="card-header">
                <div>
                    <div class="player-name">${player.PLAYER}</div>
                    <div class="player-info">${player.TEAM} - ${player.YPOS} ${pppIndicator}</div>
                </div>
                <div class="card-actions">
                    <span class="action-btn star-icon" title="Favorite Player">⭐</span>
                    <span class="action-btn must-draft-btn" title="Mark as Must-Draft">🎯</span>
                    <span class="action-btn sleeper-btn" title="Mark as Sleeper">🔥</span>
                    <span class="action-btn value-btn" title="Mark as Value Pick">💰</span>
                    <span class="action-btn glass-btn" title="Toggle Glass Effect">💎</span>
                </div>
            </div>
            ${createPlayerCardStatsHtml(player)}
        `;
    }

    function createTierElement(tierNum) {
        const tier = document.createElement('div');
        tier.className = 'tier';
        tier.innerHTML = `<h3>Tier ${tierNum}</h3>`;
        const slots = document.createElement('div');
        slots.className = 'tier-slots';
        slots.dataset.tierNum = tierNum;
        tier.appendChild(slots);
        return tier;
    }

    function handleCriteriaUpdate() {
        for (const stat in criteria) {
            for (const level in criteria[stat]) {
                const inputElement = document.getElementById(`${stat}-${level}`);
                if (inputElement) criteria[stat][level] = parseInt(inputElement.value, 10) || 0;
            }
        }
        document.querySelectorAll('.player-card').forEach(card => {
            const playerId = parseInt(card.id.split('-')[1]);
            const playerData = allPlayersData.find(p => p.LWLRANK === playerId);
            if (playerData) {
                const statsContainer = card.querySelector('.stats, .goalie-stats');
                if (statsContainer) statsContainer.outerHTML = createPlayerCardStatsHtml(playerData);
            }
        });
    }

    function updateAndRenderPlayerPool() {
        if (allPlayersData.length === 0) return;
        const [sortKey, sortOrder] = sortSelect.value.split('-');
        const activeFilters = new Set();
        filterCheckboxes.forEach(cb => { if (cb.checked) activeFilters.add(cb.value); });
        const cardsInPool = Array.from(playerPool.children);
        cardsInPool.forEach(card => {
            const playerId = parseInt(card.id.split('-')[1]);
            const playerData = allPlayersData.find(p => p.LWLRANK === playerId);
            if (!playerData) { card.style.display = 'none'; return; }
            const posGroup = getPositionGroup(playerData.YPOS);
            card.style.display = activeFilters.has(posGroup) ? '' : 'none';
        });
        const visibleCards = cardsInPool.filter(card => card.style.display !== 'none');
        visibleCards.sort((a, b) => {
            const playerA = allPlayersData.find(p => p.LWLRANK === parseInt(a.id.split('-')[1]));
            const playerB = allPlayersData.find(p => p.LWLRANK === parseInt(b.id.split('-')[1]));
            if (!playerA || !playerB) return 0;
            const valA = playerA[sortKey] ?? 0;
            const valB = playerB[sortKey] ?? 0;
            return (sortOrder === 'asc') ? valA - valB : valB - valA;
        });
        visibleCards.forEach(card => playerPool.appendChild(card));
    }

    function initializeCriteriaForm() {
        for (const stat in criteria) for (const level in criteria[stat]) {
            const inputElement = document.getElementById(`${stat}-${level}`);
            if (inputElement) inputElement.value = criteria[stat][level];
        }
    }

    function getPositionGroup(ypos) {
        if (!ypos) return 'forward';
        if (ypos.includes('G')) return 'goalie';
        if (ypos.includes('D')) return 'defenseman';
        return 'forward';
    }

    function getStatMarkup(value, type) {
        let className = 'pill-average';
        const statCriteria = criteria[type];
        if (value >= statCriteria.elite) className = 'pill-elite';
        else if (value >= statCriteria.good) className = 'pill-good';
        else if (value < statCriteria.low) className = 'pill-low';
        return `<span class="stat-pill ${className}">${value} ${type.toUpperCase()}</span>`;
    }

    function handleSearch() {
        const filter = searchInput.value.toUpperCase();
        document.querySelectorAll('#player-pool .player-card').forEach(card => {
            if (card.style.display !== 'none' || card.dataset.playerName.toUpperCase().includes(filter)) {
                 card.style.display = card.dataset.playerName.toUpperCase().includes(filter) ? "" : "none";
            }
        });
    }

    function handleExport() {
        if (allPlayersData.length === 0) { alert("Upload a player file first!"); return; }
        let csvContent = "data:text/csv;charset=utf-8,Tier,Player,Team,Position,Status\n";
        document.querySelectorAll('#tiers-container .tier-slots').forEach(tier => {
            const tierNum = tier.dataset.tierNum;
            tier.querySelectorAll('.player-card').forEach((card) => {
                const playerId = parseInt(card.id.split('-')[1]);
                const playerData = allPlayersData.find(p => p.LWLRANK === playerId);
                let status = 'Normal';
                if (card.classList.contains('inactive')) {
                    status = 'Inactive';
                } else {
                    for (const glow of glowClasses) {
                        if (card.classList.contains(glow)) {
                            status = glow.replace('-glow', '').replace(/^\w/, c => c.toUpperCase());
                            break;
                        }
                    }
                }
                if (playerData) csvContent += `${tierNum},"${playerData.PLAYER}",${playerData.TEAM},${playerData.YPOS},"${status}"\n`;
            });
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "nhl_tiers_export.csv");
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
});