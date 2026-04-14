let currentDeck = [];
let currentIndex = 0;
let isFlipped = false;
let hasFlippedOnce = false; // Tracks if grade buttons should be revealed
let currentDeckName = "";
let currentMode = "daily";

// --- GAMIFICATION PIPELINE ---
async function fetchCoins() {
    try {
        const response = await fetch('/get_coins');
        const data = await response.json();
        document.getElementById('coinCount').innerText = data.coins;
    } catch (e) { console.error("Failed to load coins", e); }
}

function updateCoins(newAmount) {
    const coinEl = document.getElementById('coinCount');
    coinEl.innerText = newAmount;
    coinEl.parentElement.style.transform = 'scale(1.15)';
    setTimeout(() => coinEl.parentElement.style.transform = 'scale(1)', 200);
}

// Custom Toast function to replace standard browser alert
function showToast(message) {
    const toast = document.getElementById('toastNotification');
    const toastMsg = document.getElementById('toastMessage');
    toastMsg.innerText = message;
    
    // Slide it in
    toast.classList.add('show');
    
    // Slide it out gracefully after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// --- NAVIGATION ---
function hideAll() {
    ['dashboardSection', 'deckMenuSection', 'uploadSection', 'reviewSection'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
}

function showDashboardSection() {
    hideAll();
    document.getElementById('dashboardSection').style.display = 'block';
    loadDashboard();
}

function showUploadSection() {
    hideAll();
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('deckName').value = "";
    document.getElementById('pdfUpload').value = "";
    document.getElementById('status').innerText = "";
}

function openDeckMenu(deckName, dueCards, totalCards) {
    hideAll();
    currentDeckName = deckName;
    document.getElementById('deckMenuSection').style.display = 'block';
    document.getElementById('menuDeckTitle').innerText = deckName;
    document.getElementById('menuDeckStats').innerText = `${dueCards} Cards Due  |  ${totalCards} Total Cards`;

    const btnDaily = document.getElementById('btnDaily');
    if (dueCards > 0) {
        btnDaily.disabled = false;
        btnDaily.style.opacity = '1';
        btnDaily.innerHTML = `🔥 Daily Revision (${dueCards} Due)`;
    } else {
        btnDaily.disabled = true;
        btnDaily.style.opacity = '0.5';
        btnDaily.innerHTML = `🔥 Daily Revision (All Caught Up!)`;
    }
}

// --- DASHBOARD PIPELINE ---
async function loadDashboard() {
    const deckListDiv = document.getElementById('deckList');
    deckListDiv.innerHTML = "Loading decks...";
    try {
        const response = await fetch('/get_decks');
        const decks = await response.json();
        
        if (decks.length === 0) { deckListDiv.innerHTML = "<p>No decks yet. Create one!</p>"; return; }

        deckListDiv.innerHTML = "";
        decks.forEach((deck, index) => {
            const btn = document.createElement('button');
            btn.className = 'deck-btn';
            btn.style.animation = `slideInRight 0.4s ease forwards ${index * 0.1}s`;
            btn.style.opacity = "0"; 

            let badgeHtml = deck.due_cards > 0 ? `<span class="deck-due-badge">${deck.due_cards} Due</span>` : `<span style="color:#94a3b8; font-size: 0.9em; font-weight:700;">Caught Up</span>`;
            
            btn.innerHTML = `
                <div>
                    <div style="font-size: 1.1em; font-weight: 700;">${deck.deck_name}</div>
                    <div style="font-size: 0.85em; color: #64748b; margin-top: 4px;">Total Cards: ${deck.total_cards}</div>
                </div>
                ${badgeHtml}
            `;
            btn.onclick = () => openDeckMenu(deck.deck_name, deck.due_cards, deck.total_cards);
            deckListDiv.appendChild(btn);
        });
    } catch (e) { deckListDiv.innerHTML = "Error loading decks."; }
}

// --- 1. THE INGESTION PIPELINE ---
async function processPDF() {
    const fileInput = document.getElementById('pdfUpload');
    const deckNameInput = document.getElementById('deckName').value.trim();
    const statusDiv = document.getElementById('status');

    if (!deckNameInput) { statusDiv.innerText = "Please give your deck a name!"; return; }
    if (!fileInput.files.length) { statusDiv.innerText = "Please select a PDF first!"; return; }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        statusDiv.innerText = "Extracting text from PDF...";
        let response = await fetch('/upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error("Server failed.");
        let data = await response.json();

        statusDiv.innerText = "AI is generating cards...";
        let aiResponse = await fetch('/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.preview })
        });
        
        if (!aiResponse.ok) {
            let err = await aiResponse.json();
            throw new Error(err.error || "Generation failed.");
        }
        
        const generatedCards = await aiResponse.json(); 

        statusDiv.innerText = "Saving to database...";
        await fetch('/save_cards', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deck_name: deckNameInput, cards: generatedCards }) 
        });

        statusDiv.innerText = "Success! Routing to dashboard...";
        setTimeout(showDashboardSection, 1000);
    } catch (error) { statusDiv.innerText = "Error: " + error.message; }
}

// --- 2. THE MODES PIPELINE ---
async function startMode(mode) {
    currentMode = mode;
    hideAll();
    document.getElementById('reviewSection').style.display = 'block';
    
    let titleStr = mode === 'daily' ? 'Daily Revision' : mode === 'cram' ? 'Cram Session' : 'Study Mode';
    document.getElementById('reviewTitle').innerText = `${currentDeckName} - ${titleStr}`;
    document.getElementById('reviewStatus').innerText = "Fetching cards...";
    document.querySelector('.card-container').style.display = 'block';

    try {
        const endpoint = mode === 'daily' ? '/get_due_cards' : '/get_all_cards';
        const response = await fetch(`${endpoint}?deck=${encodeURIComponent(currentDeckName)}`);
        currentDeck = await response.json();

        if (currentDeck.length === 0) {
            document.getElementById('reviewStatus').innerText = "No cards found.";
            document.querySelector('.card-container').style.display = 'none';
        } else {
            currentIndex = 0;
            displayCard();
        }
    } catch (error) { console.error("Error fetching cards:", error); }
}

async function displayCard() {
    if (currentIndex >= currentDeck.length || currentIndex < 0) {
        document.getElementById('reviewStatus').innerText = "You have reached the end of the deck.";
        document.querySelector('.card-container').style.display = 'none';
        document.getElementById('gradeButtons').style.display = 'none';
        document.getElementById('studyButtons').style.display = 'none';

        // --- GAMIFICATION: Check for daily reward ---
        if (currentMode === 'daily' && currentDeck.length > 0) {
            try {
                const res = await fetch('/complete_review', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deck_name: currentDeckName })
                });
                const rewardData = await res.json();
                if (rewardData.rewarded) {
                    updateCoins(rewardData.coins);
                    // Use the custom Toast instead of the alert!
                    setTimeout(() => showToast(`Mission Accomplished! +5 Coins for completing your daily revision.`), 100);
                }
            } catch (e) { console.error("Reward error", e); }
        }
        return;
    }

    const card = currentDeck[currentIndex];
    document.getElementById('cardFront').innerText = card.question;
    document.getElementById('cardBack').innerText = card.answer;
    document.getElementById('reviewStatus').innerText = `Card ${currentIndex + 1} of ${currentDeck.length} (${card.card_type})`;
    
    const flashcardContainer = document.querySelector('.card-container');
    const flashcard = document.getElementById('flashcard');
    
    flashcardContainer.style.display = 'block';
    flashcardContainer.classList.add('slide-in');
    setTimeout(() => flashcardContainer.classList.remove('slide-in'), 400);

    // Reset State for the new card
    flashcard.classList.remove('flipped');
    isFlipped = false;
    hasFlippedOnce = false;
    document.getElementById('gradeButtons').style.display = 'none';
    
    document.getElementById('studyButtons').style.display = currentMode === 'study' ? 'flex' : 'none';
}

function flipCard() {
    const flashcard = document.getElementById('flashcard');
    
    // Toggle flip state
    isFlipped = !isFlipped;
    if (isFlipped) {
        flashcard.classList.add('flipped');
    } else {
        flashcard.classList.remove('flipped');
    }

    // Only reveal buttons on the first flip (if not in study mode)
    if (!hasFlippedOnce) {
        hasFlippedOnce = true;
        if (currentMode !== 'study') {
            document.getElementById('gradeButtons').style.display = 'flex';
        }
    }
}

// --- 3. INTERACTIONS ---
async function submitGrade(grade) {
    document.getElementById('gradeButtons').style.display = 'none';

    if (currentMode === 'daily') {
        const cardId = currentDeck[currentIndex].id;
        fetch(`/review_card/${cardId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grade: grade })
        });
    }
    animateToNextCard();
}

function nextCard() { animateToNextCard(); }
function prevCard() {
    if (currentIndex > 0) {
        currentIndex--;
        displayCard();
    }
}

function animateToNextCard() {
    const flashcardContainer = document.querySelector('.card-container');
    flashcardContainer.classList.add('slide-out');
    setTimeout(() => {
        flashcardContainer.classList.remove('slide-out');
        currentIndex++;
        displayCard();
    }, 350);
}

// Initialize on page load
window.onload = () => {
    loadDashboard();
    fetchCoins();
};