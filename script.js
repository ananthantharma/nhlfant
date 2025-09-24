document.addEventListener('DOMContentLoaded', () => {
    // --- CORRECTED TEAM NAME MAP ---
    // This now matches the filenames you provided.
    const teamNameMap = {
        'ANA': 'Anaheim', 'UTA': 'Arizona', 'BOS': 'Boston', 'BUF': 'Buffalo',
        'CGY': 'Calgary', 'CAR': 'Carolina', 'CHI': 'Chicago', 'COL': 'Colorado',
        'CBJ': 'Columbus', 'DAL': 'Dallas', 'DET': 'Detroit', 'EDM': 'Edmonton',
        'FLA': 'Florida', 'LAK': 'Los Angeles', 'MIN': 'Minnesota', 'MTL': 'Montreal',
        'NSH': 'Nashville', 'NJD': 'New Jersey', 'NYI': 'NY Islanders', 'NYR': 'NY Rangers',
        'OTT': 'Ottawa', 'PHI': 'Philadelphia', 'PIT': 'Pittsburgh', 'SJS': 'San Jose',
        'SEA': 'Seattle', 'STL': 'St. Louis', 'TBL': 'Tampa Bay', 'TOR': 'Toronto',
        'UTA': 'Utah', // Added for the new Utah team in your data
        'VAN': 'Vancouver', 'VGK': 'Vegas', 'WSH': 'Washington', 'WPG': 'Winnipeg'
    };

    // --- DOM ELEMENTS ---
    const mainContainer = document.querySelector('main.container');
    const sidebar = document.querySelector('.sidebar');
    const poolWrapper = document.querySelector('.pool-wrapper');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const togglePoolBtn = document.getElementById('toggle-pool-btn');
    const fileInput = document.getElementById('csv-file');
    const jsonFileInput = document.getElementById('json-file');
    const searchInput = document.getElementById('search-input');
    const exportBtn = document.getElementById('export-btn');
    const saveBtn = document.getElementById('save-btn');
    const playerPool = document.getElementById('player-pool');
    const tiersContainer = document.getElementById('tiers-container');
    const updateCriteriaBtn = document.getElementById('update-criteria-btn');
    const sortSelect = document.getElementById('sort-select');
    const filterCheckboxes = document.querySelectorAll('.filter-group input[type="checkbox"]');

    let allPlayersData = [];
    let criteria = {
        pts: { elite: 100, good: 75, low: 40 },
        sog: { elite: 300, good: 225, low: 150 },
        hits: { elite: 200, good: 125, low: 50 },
    };

    initializeCriteriaForm();

    toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    togglePoolBtn.addEventListener('click', () => poolWrapper.classList.toggle('collapsed'));
    
    mainContainer.addEventListener('click', (event) => {
        const star = event.target.closest('.star-icon');
        if (star) {
            star.classList.toggle('favorited');
            return;
        }
        const card = event.target.closest('.player-card');
        if (card) {
            card.classList.toggle('stricken');
        }
    });

    fileInput.addEventListener('change', handleFileUpload);
    jsonFileInput.addEventListener('change', handleLoad);
    saveBtn.addEventListener('click', handleSave);
    updateCriteriaBtn.addEventListener('click', handleCriteriaUpdate);
    sortSelect.addEventListener('change', updateAndRenderPlayerPool);
    filterCheckboxes.forEach(cb => cb.addEventListener('change', updateAndRenderPlayerPool));
    searchInput.addEventListener('keyup', handleSearch);
    exportBtn.addEventListener('click', handleExport);


    function handleSave() {
        if (allPlayersData.length === 0) { alert("Please load a player list before saving."); return; }
        const state = { tiers: {}, favorites: [], stricken: [] };
        tiersContainer.querySelectorAll('.tier-slots').forEach((tier, index) => {
            state.tiers[`tier${index + 1}`] = Array.from(tier.children).map(card => card.id);
        });
        document.querySelectorAll('.star-icon.favorited').forEach(star => state.favorites.push(star.parentElement.id));
        document.querySelectorAll('.player-card.stricken').forEach(card => state.stricken.push(card.id));
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `nhl-tiers-save.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    
    function handleLoad(event) {
        if (allPlayersData.length === 0) {
            alert("Please load the main Player CSV file first.");
            event.target.value = ''; return;
        }
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const state = JSON.parse(e.target.result);
                restoreState(state);
            } catch (error) {
                alert("Error reading save file."); console.error(error);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    function restoreState(state) {
        const allCards = new Map();
        document.querySelectorAll('.player-card').forEach(card => allCards.set(card.id, card));
        playerPool.innerHTML = '';
        tiersContainer.querySelectorAll('.tier-slots').forEach(tier => tier.innerHTML = '');
        for (const tierId in state.tiers) {
            const tierNum = tierId.replace('tier', '');
            const tierElement = tiersContainer.querySelector(`[data-tier-num='${tierNum}']`);
            if (tierElement) {
                state.tiers[tierId].forEach(cardId => {
                    if (allCards.has(cardId)) {
                        tierElement.appendChild(allCards.get(cardId));
                        allCards.delete(cardId);
                    }
                });
            }
        }
        allCards.forEach(card => playerPool.appendChild(card));
        
        document.querySelectorAll('.player-card').forEach(card => {
            card.classList.remove('stricken');
            card.querySelector('.star-icon')?.classList.remove('favorited');
        });
        state.favorites?.forEach(cardId => {
            document.querySelector(`#${cardId} .star-icon`)?.classList.add('favorited');
        });
        state.stricken?.forEach(cardId => {
            document.querySelector(`#${cardId}`)?.classList.add('stricken');
        });
        tiersContainer.querySelectorAll('.tier-slots').forEach(updateSlotCount);
        updateAndRenderPlayerPool();
    }

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        Papa.parse(file, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: (results) => {
                allPlayersData = results.data;
                buildTiers();
                playerPool.innerHTML = '';
                allPlayersData.forEach(player => {
                    if (player && player.PLAYER) playerPool.appendChild(createPlayerCard(player));
                });
                initializeSortable();
                updateAndRenderPlayerPool();
            },
            error: (err) => alert(`Error parsing CSV: ${err}`)
        });
    }

    function handleCriteriaUpdate() {
        for (const stat in criteria) {
            for (const level in criteria[stat]) {
                const inputId = `${stat}-${level}`;
                const inputElement = document.getElementById(inputId);
                if (inputElement) criteria[stat][level] = parseInt(inputElement.value, 10) || 0;
            }
        }
        document.querySelectorAll('.player-card').forEach(card => {
            const playerId = parseInt(card.id.split('-')[1]);
            const playerData = allPlayersData.find(p => p.LWLRANK === playerId);
            if (playerData) {
                const isFavorited = card.querySelector('.star-icon')?.classList.contains('favorited');
                const isStricken = card.classList.contains('stricken');
                card.innerHTML = createPlayerCardInnerHtml(playerData);
                if (isFavorited) card.querySelector('.star-icon').classList.add('favorited');
                if (isStricken) card.classList.add('stricken');
            }
        });
    }

    function buildTiers() {
        tiersContainer.innerHTML = '';
        for (let i = 1; i <= 16; i++) {
            tiersContainer.appendChild(createTierElement(i));
        }
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
            if (sortOrder === 'asc') return valA - valB;
            return valB - valA;
        });
        visibleCards.forEach(card => playerPool.appendChild(card));
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

    function createPlayerCardInnerHtml(player) {
        const posGroup = getPositionGroup(player.YPOS);
        const logoName = teamNameMap[player.TEAM] || player.TEAM;
        const logoSrc = `NHL Logos/${encodeURIComponent(logoName)}.png`;
        let statsHtml = (posGroup === 'goalie')
            ? `<div class="goalie-stats">Goalie Stats N/A</div>`
            : `<div class="stats">
                ${getStatMarkup(player.P_PTS, 'pts')}
                ${getStatMarkup(player.P_SOG, 'sog')}
                ${getStatMarkup(player.P_H, 'hits')}
               </div>`;
        return `
            <img src="${logoSrc}" class="team-logo" alt="${player.TEAM}" onerror="this.style.display='none'">
            <span class="star-icon">☆</span>
            <strong>${player.PLAYER}</strong> 
            (${player.TEAM} - ${player.YPOS})
            ${statsHtml}
        `;
    }

    function createTierElement(tierNum) {
        const tier = document.createElement('div');
        tier.className = 'tier';
        tier.innerHTML = `<h3>Tier ${tierNum} <span class="slot-count">(0/12)</span></h3>`;
        const slots = document.createElement('div');
        slots.className = 'tier-slots';
        slots.dataset.tierNum = tierNum;
        tier.appendChild(slots);
        return tier;
    }
    
    function initializeSortable() {
        const containers = document.querySelectorAll('.tier-slots');
        containers.forEach(container => {
            new Sortable(container, {
                group: 'players', animation: 150,
                onAdd: (evt) => {
                    updateSlotCount(evt.to);
                    if (evt.to.children.length > 12) {
                        alert(`Tier ${evt.to.dataset.tierNum} is full.`);
                        evt.from.appendChild(evt.item);
                        updateSlotCount(evt.to);
                    }
                },
                onRemove: (evt) => {
                    updateSlotCount(evt.from);
                },
                onEnd: (evt) => {
                    if (evt.to === null) {
                        evt.item.style.display = '';
                        evt.from.appendChild(evt.item);
                    }
                },
            });
        });
    }

    function initializeCriteriaForm() {
        for (const stat in criteria) for (const level in criteria[stat]) {
            const inputId = `${stat}-${level}`;
            const inputElement = document.getElementById(inputId);
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
        let className = 'pill-average'; let icon = '';
        const statCriteria = criteria[type]; const typeLabel = type.toUpperCase();
        if (value >= statCriteria.elite) { className = 'pill-elite'; icon = type === 'pts' ? ' 🔥' : type === 'sog' ? ' 🎯' : ' 💥'; }
        else if (value >= statCriteria.good) { className = 'pill-good'; }
        else if (value < statCriteria.low) { className = 'pill-low'; }
        return `<span class="stat-pill ${className}">${value} ${typeLabel}${icon}</span>`;
    }
    function updateSlotCount(tierSlot) {
        if (!tierSlot.dataset.tierNum && tierSlot.id !== 'player-pool') return;
        const count = tierSlot.children.length;
        const countElement = tierSlot.previousElementSibling?.querySelector('.slot-count');
        if (countElement) countElement.textContent = `(${count}/12)`;
    }
    function handleSearch(event) {
        const filterText = event.target.value.toUpperCase();
        updateAndRenderPlayerPool();
        document.querySelectorAll('#player-pool .player-card').forEach(card => {
            if (card.style.display !== 'none') {
                const nameMatch = card.dataset.playerName.toUpperCase().includes(filterText);
                if (!nameMatch) {
                    card.style.display = 'none';
                }
            }
        });
    }
    function handleExport() {
        if (allPlayersData.length === 0) { alert("Please upload a player file first!"); return; }
        let csvContent = "data:text/csv;charset=utf-8,Tier,Rank in Tier,Player,Team,Position,Points,Shots,Hits,Favorited,Stricken\n";
        document.querySelectorAll('#tiers-container .tier-slots').forEach(tier => {
            const tierNum = tier.dataset.tierNum;
            tier.querySelectorAll('.player-card').forEach((card, rank) => {
                const playerId = parseInt(card.id.split('-')[1]);
                const playerData = allPlayersData.find(p => p.LWLRANK === playerId);
                const isFavorited = card.querySelector('.star-icon')?.classList.contains('favorited') ? 'Yes' : 'No';
                const isStricken = card.classList.contains('stricken') ? 'Yes' : 'No';
                if (playerData) csvContent += `${tierNum},${rank + 1},"${playerData.PLAYER}",${playerData.TEAM},${playerData.YPOS},${playerData.P_PTS},${playerData.P_SOG},${playerData.P_H},${isFavorited},${isStricken}\n`;
            });
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "nhl_tiers_export.csv");
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
});