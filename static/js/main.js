let currentDeck = [];
let currentIndex = 0;
let isFlipped = false;
let currentDeckName = "";

// --- NAVIGATION ---
function showDashboardSection() {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('reviewSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('status').innerText = "";
    loadDashboard();
}

function showUploadSection() {
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('deckName').value = "";
    document.getElementById('pdfUpload').value = "";
}

// --- DASHBOARD PIPELINE ---
async function loadDashboard() {
    const deckListDiv = document.getElementById('deckList');
    deckListDiv.innerHTML = "Loading decks...";
    
    try {
        const response = await fetch('/get_decks');
        const decks = await response.json();
        
        if (decks.length === 0) {
            deckListDiv.innerHTML = "<p>No decks yet. Create one!</p>";
            return;
        }

        deckListDiv.innerHTML = "";
        decks.forEach((deck, index) => {
            const btn = document.createElement('button');
            btn.className = 'deck-btn'; // Use new CSS class
            
            // Stagger animation for loading
            btn.style.animation = `slideInRight 0.4s ease forwards ${index * 0.1}s`;
            btn.style.opacity = "0"; 

            let badgeHtml = deck.due_cards > 0 ? `<span class="deck-due-badge">${deck.due_cards} Due</span>` : `<span style="color:#94a3b8; font-size: 0.9em;">All Caught Up</span>`;
            
            btn.innerHTML = `
                <div>
                    <div style="font-size: 1.1em; font-weight: 700;">${deck.deck_name}</div>
                    <div style="font-size: 0.85em; color: #64748b; margin-top: 4px;">Total Cards: ${deck.total_cards}</div>
                </div>
                ${badgeHtml}
            `;
            
            if (deck.due_cards > 0) {
                btn.onclick = () => startReview(deck.deck_name);
            } else {
                btn.style.opacity = "0.7";
                btn.onclick = () => alert("You're all caught up on this deck! Come back tomorrow.");
            }
            deckListDiv.appendChild(btn);
        });
    } catch (e) {
        deckListDiv.innerHTML = "Error loading decks.";
    }
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
        if (!response.ok) throw new Error("Server communication failed.");
        let data = await response.json();

        statusDiv.innerText = "AI is studying the text and generating cards...";
        let aiResponse = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.preview })
        });
        
        if (!aiResponse.ok) {
            let errorObj = await aiResponse.json();
            throw new Error(errorObj.error || "Generation failed.");
        }
        
        const generatedCards = await aiResponse.json(); 

        statusDiv.innerText = "Saving to database...";
        await fetch('/save_cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deck_name: deckNameInput, cards: generatedCards }) 
        });

        statusDiv.innerText = "Success! Routing to dashboard...";
        setTimeout(showDashboardSection, 1000);

    } catch (error) {
        statusDiv.innerText = "Error: " + error.message;
        if (error.message === "Failed to fetch") {
            statusDiv.innerText = "Error: Cannot connect to server. Is your Flask app running?";
        }
    }
}

// --- 2. THE REVIEW PIPELINE ---
async function startReview(deckName) {
    currentDeckName = deckName;
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('reviewSection').style.display = 'block';
    document.getElementById('reviewTitle').innerText = `Reviewing: ${deckName}`;
    document.getElementById('reviewStatus').innerText = "Fetching due cards...";
    document.querySelector('.card-container').style.display = 'block';

    try {
        const response = await fetch(`/get_due_cards?deck=${encodeURIComponent(deckName)}`);
        currentDeck = await response.json();

        if (currentDeck.length === 0) {
            document.getElementById('reviewStatus').innerText = "You're all caught up for today!";
            document.querySelector('.card-container').style.display = 'none';
        } else {
            currentIndex = 0;
            displayCard();
        }
    } catch (error) {
        console.error("Error fetching cards:", error);
    }
}

function displayCard() {
    if (currentIndex >= currentDeck.length) {
        document.getElementById('reviewStatus').innerText = "Session complete! Great job.";
        document.querySelector('.card-container').style.display = 'none';
        document.getElementById('gradeButtons').style.display = 'none';
        return;
    }

    const card = currentDeck[currentIndex];
    document.getElementById('cardFront').innerText = card.question;
    document.getElementById('cardBack').innerText = card.answer;
    document.getElementById('reviewStatus').innerText = `Card ${currentIndex + 1} of ${currentDeck.length} (${card.card_type})`;
    
    const flashcardContainer = document.querySelector('.card-container');
    const flashcard = document.getElementById('flashcard');
    
    // Animate Card Entrance
    flashcardContainer.classList.add('slide-in');
    setTimeout(() => flashcardContainer.classList.remove('slide-in'), 400);

    // Reset Flip State
    flashcard.classList.remove('flipped');
    isFlipped = false;
    document.getElementById('gradeButtons').style.display = 'none';
}

function flipCard() {
    if (!isFlipped) {
        document.getElementById('flashcard').classList.add('flipped');
        document.getElementById('gradeButtons').style.display = 'flex';
        isFlipped = true;
    }
}

// --- 3. THE SM-2 GRADING & EXIT ANIMATION ---
async function submitGrade(grade) {
    const cardId = currentDeck[currentIndex].id;
    document.getElementById('gradeButtons').style.display = 'none';

    try {
        // Send grade to backend asynchronously 
        fetch(`/review_card/${cardId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grade: grade })
        });
        
        // Trigger Exit Animation
        const flashcardContainer = document.querySelector('.card-container');
        flashcardContainer.classList.add('slide-out');

        // Wait for animation to finish, then load next card
        setTimeout(() => {
            flashcardContainer.classList.remove('slide-out');
            currentIndex++;
            displayCard();
        }, 350);

    } catch (error) {
        console.error("Error submitting grade:", error);
        document.getElementById('reviewStatus').innerText = "Error saving progress.";
    }
}

window.onload = loadDashboard;