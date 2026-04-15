// ==========================================
// GLOBAL STATE VARIABLES
// ==========================================
let currentDeck = [];
let currentIndex = 0;
let isFlipped = false;
let hasFlippedOnce = false;
let currentDeckName = "";
let currentMode = "daily";


// ==========================================
// GAMIFICATION & ECONOMY
// ==========================================
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


// ==========================================
// MASCOT ENGINE
// ==========================================
const mascotPhrases = {
    idle: [
        "You're doing great! 🌟",
        "Every card makes your brain stronger! 🧠",
        "I believe in you!",
        "Learning is a superpower! ⚡",
        "Consistency is key! 🗝️",
        "Let's crush this deck! 🔥",
        "Take a deep breath, you got this!"
    ],
    success: [
        "Perfect memory! 🎯",
        "Nailed it! 🚀",
        "You're on fire! 🔥",
        "Wow, incredible! ⭐"
    ],
    struggle: [
        "That's okay, mistakes help us learn! 🌱",
        "We'll get it next time!",
        "Don't give up! 💪",
        "Practice makes perfect!"
    ]
};

let mascotInterval;
let lastMascotMessageTime = 0; 
const MASCOT_COOLDOWN = 60000;

function triggerMascot(type = 'idle', customText = null) {
    const bubble = document.getElementById('mascotSpeech');
    if (!bubble) return;
    
    const now = Date.now();
    if (now - lastMascotMessageTime < MASCOT_COOLDOWN) return;

    bubble.style.transform = 'scale(0.8)';
    bubble.style.opacity = '0';
    
    setTimeout(() => {
        if (customText) {
            bubble.innerText = customText;
        } else if (type === 'progress') {
            const cardsLeft = Math.max(0, currentDeck.length - currentIndex);
            
            if (cardsLeft <= 0) {
                bubble.innerText = "All caught up! 🏆";
            } else if (cardsLeft === 1) {
                bubble.innerText = "Just 1 card left! Finish strong! 🏁";
            } else {
                bubble.innerText = `Only ${cardsLeft} revisions left! Keep going! 💪`;
            }
        } else {
            const list = mascotPhrases[type];
            bubble.innerText = list[Math.floor(Math.random() * list.length)];
        }
        bubble.style.transform = 'scale(1)';
        bubble.style.opacity = '1';
    }, 200);

    startMascotTimer();
}

function startMascotTimer() {
    if (mascotInterval) clearInterval(mascotInterval);
    mascotInterval = setInterval(() => {
        if (document.getElementById('reviewSection').style.display === 'block' && currentDeck.length > 0) {
             if(Math.random() > 0.5) triggerMascot('progress');
             else triggerMascot('idle');
        } else {
            triggerMascot('idle');
        }
    }, 60000); 
}

startMascotTimer();


// ==========================================
// NAVIGATION & UI ROUTING
// ==========================================
function showToast(message) {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastMessage').innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function hideAll() {
    ['dashboardSection', 'deckMenuSection', 'uploadSection', 'reviewSection'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
}

function showDashboardSection() {
    hideAll();
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('modelSelect').style.display = 'block'; 
    loadDashboard();
}

function showUploadSection() {
    hideAll();
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('modelSelect').style.display = 'block'; 
    document.getElementById('deckName').value = "";
    document.getElementById('pdfUpload').value = "";
    document.getElementById('status').innerText = "";
}

function openDeckMenu(deckName, dueCards, totalCards) {
    hideAll();
    currentDeckName = deckName;
    document.getElementById('deckMenuSection').style.display = 'block';
    document.getElementById('modelSelect').style.display = 'block'; 
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


// ==========================================
// DASHBOARD & DATA FETCHING
// ==========================================
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


// ==========================================
// PDF INGESTION & DECK CREATION
// ==========================================
async function processPDF() {
    const fileInput = document.getElementById('pdfUpload');
    const deckNameInput = document.getElementById('deckName').value.trim();
    const statusDiv = document.getElementById('status');
    const selectedModel = document.getElementById('modelSelect').value;

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
            body: JSON.stringify({ text: data.preview, ai_model: selectedModel })
        });
        
        if (!aiResponse.ok) throw new Error((await aiResponse.json()).error || "Generation failed.");
        
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


// ==========================================
// REVIEW ENGINE & SPACED REPETITION
// ==========================================
async function startMode(mode) {
    currentMode = mode;
    hideAll();
    
    document.getElementById('modelSelect').style.display = 'none'; 
    
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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    if (currentIndex >= currentDeck.length || currentIndex < 0) {
        document.getElementById('reviewStatus').innerText = "You have reached the end of the deck.";
        document.querySelector('.card-container').style.display = 'none';
        document.getElementById('gradeButtons').style.display = 'none';
        document.getElementById('studyButtons').style.display = 'none';

        if (currentMode === 'daily' && currentDeck.length > 0) {
            try {
                const res = await fetch('/complete_review', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deck_name: currentDeckName })
                });
                const rewardData = await res.json();
                if (rewardData.rewarded) {
                    updateCoins(rewardData.coins);
                    setTimeout(() => showToast(`Mission Accomplished! +5 Coins for completing daily revision.`), 100);
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

    flashcard.classList.remove('flipped');
    isFlipped = false;
    hasFlippedOnce = false;
    document.getElementById('gradeButtons').style.display = 'none';
    document.getElementById('studyButtons').style.display = currentMode === 'study' ? 'flex' : 'none';
}

function flipCard() {
    const flashcard = document.getElementById('flashcard');
    isFlipped = !isFlipped;
    if (isFlipped) flashcard.classList.add('flipped');
    else flashcard.classList.remove('flipped');

    if (!hasFlippedOnce) {
        hasFlippedOnce = true;
        if (currentMode !== 'study') document.getElementById('gradeButtons').style.display = 'flex';
    }
}

async function submitGrade(grade) {
    document.getElementById('gradeButtons').style.display = 'none';

    if (Math.random() > 0.70) {
        if (grade >= 4) triggerMascot('success');
        else if (grade <= 2) triggerMascot('struggle');
        else triggerMascot('idle');
    }

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
    if (currentIndex > 0) { currentIndex--; displayCard(); }
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


// ==========================================
// VOICE INTERACTION & AI GRADING
// ==========================================
function speakText(side) {
    if (!('speechSynthesis' in window)) {
        showToast("Your browser does not support Voice Teaching.");
        return;
    }
    window.speechSynthesis.cancel();
    const textToRead = side === 'front' ? currentDeck[currentIndex].question : currentDeck[currentIndex].answer;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
}

let isListening = false;

function startDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast("Speech recognition not supported in your browser. Use Chrome.");
        return;
    }
    if (isListening) return;
    isListening = true;
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    const micBtn = document.getElementById('micBtn');
    micBtn.style.color = '#ef4444'; 
    micBtn.style.borderColor = '#ef4444';
    showToast("Listening... Speak your answer!");

    recognition.start();

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        showToast(`Heard: "${transcript}"... AI Grading...`);
        resetMicBtn(micBtn);
        await autoGradeAnswer(transcript);
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            showToast("Mic blocked! Please click the lock icon in your URL bar to allow microphone access.");
        } else if (event.error === 'network') {
            showToast("Network error. Browser speech recognition requires an internet connection.");
        } else if (event.error === 'no-speech') {
            showToast("Didn't catch that. It was too quiet!");
        } else {
            showToast(`Mic error: ${event.error}. Note: This feature works best in Google Chrome.`);
        }
        resetMicBtn(micBtn);
    };
    
    recognition.onend = () => { resetMicBtn(micBtn); };
}

function resetMicBtn(btn) {
    btn.style.color = 'inherit';
    btn.style.borderColor = '#475569';
    isListening = false;
}

async function autoGradeAnswer(spokenText) {
    const card = currentDeck[currentIndex];
    const selectedModel = document.getElementById('modelSelect').value;
    
    try {
        const response = await fetch('/auto_grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: card.question, correct_answer: card.answer, user_answer: spokenText, ai_model: selectedModel })
        });
        
        const data = await response.json();
        if(data.error) throw new Error(data.error);
        
        const grade = data.grade;
        showToast(`AI Graded: ${grade}/5`);
        
        const flashcard = document.getElementById('flashcard');
        
        if (!isFlipped) flipCard();
        document.getElementById('gradeButtons').style.display = 'none';

        if (grade >= 3) {
            flashcard.classList.add('glow-success');
            playTone(600, 'sine', 0.1); 
            playTone(800, 'sine', 0.15, 0.1); 
        } else {
            flashcard.classList.add('glow-fail');
            playTone(200, 'sawtooth', 0.3); 
        }
        
        setTimeout(() => {
            flashcard.classList.remove('glow-success', 'glow-fail');
            if (currentMode !== 'study') submitGrade(grade);
        }, 2500);

    } catch (error) {
        showToast("Error connecting to AI Grader.");
        console.error(error);
    }
}


// ==========================================
// AUDIO SYNTHESIS
// ==========================================
function playTone(freq, type, duration, delay=0) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.value = freq;
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const startTime = ctx.currentTime + delay;
    osc.start(startTime);
    gain.gain.setValueAtTime(0.1, startTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, startTime + duration);
    osc.stop(startTime + duration);
}


// ==========================================
// DELETION LOGIC
// ==========================================
async function deleteCurrentCard() {
    if (!confirm("Are you sure you want to delete this card forever?")) return;
    
    const cardId = currentDeck[currentIndex].id;
    try {
        await fetch(`/delete_card/${cardId}`, { method: 'DELETE' });
        showToast("Card deleted! 🗑️");
        
        currentDeck.splice(currentIndex, 1);
        
        if (currentDeck.length === 0) {
            displayCard(); 
            return;
        }
        
        if (currentIndex >= currentDeck.length) {
            currentIndex = currentDeck.length - 1;
        }
        
        const flashcardContainer = document.querySelector('.card-container');
        flashcardContainer.classList.add('slide-out');
        setTimeout(() => {
            flashcardContainer.classList.remove('slide-out');
            displayCard();
        }, 350);

    } catch (e) {
        console.error("Failed to delete card", e);
    }
}

async function deleteCurrentDeck() {
    if (!confirm(`🚨 WARNING: Are you sure you want to delete the ENTIRE deck "${currentDeckName}"?\n\nThis will permanently erase all cards and progress.`)) return;
    
    try {
        const response = await fetch('/delete_deck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deck_name: currentDeckName })
        });
        
        if (!response.ok) throw new Error("Failed to delete deck");
        
        showToast(`Deck deleted! 🗑️`);
        showDashboardSection(); 
    } catch (e) {
        console.error("Failed to delete deck", e);
        showToast("Error deleting deck.");
    }
}


// ==========================================
// INITIALIZATION
// ==========================================
window.onload = () => {
    loadDashboard();
    fetchCoins();
};