let currentDeck = [];
let currentIndex = 0;
let isFlipped = false;

// --- 1. THE INGESTION PIPELINE ---
async function processPDF() {
    const fileInput = document.getElementById('pdfUpload');
    const statusDiv = document.getElementById('status');

    if (!fileInput.files.length) {
        statusDiv.innerText = "Please select a PDF first!";
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        // Step A: Extract Text
        statusDiv.innerText = "Extracting text from PDF...";
        let response = await fetch('/upload', { method: 'POST', body: formData });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${response.status} - ${errorText}`);
        }
        let data = await response.json();
        
        if (data.error) throw new Error(data.error);

        // Step B: Generate Cards via Gemini
        statusDiv.innerText = "AI is studying the text and generating cards (this takes a few seconds)...";
        let aiResponse = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.preview })
        });
        
        if (!aiResponse.ok) {
            let errorText = await aiResponse.text();
            try {
                let errorObj = JSON.parse(errorText);
                throw new Error(errorObj.error || "Failed to generate cards");
            } catch (e) {
                throw new Error(`Server Error: ${aiResponse.status}`);
            }
        }
        
        // FIX: The backend now returns a ready-to-use JSON Object. No JSON.parse needed.
        const generatedCards = await aiResponse.json(); 

        // Step C: Save to SQLite
        statusDiv.innerText = "Saving cards to your database...";
        await fetch('/save_cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards: generatedCards })
        });

        statusDiv.innerText = "Cards generated and saved successfully!";
        
        // Automatically start reviewing
        setTimeout(startReview, 1500);

    } catch (error) {
        statusDiv.innerText = "Error: " + error.message;
        console.error(error);
    }
}

// --- 2. THE REVIEW PIPELINE ---
async function startReview() {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('reviewSection').style.display = 'block';
    document.getElementById('reviewStatus').innerText = "Fetching due cards...";

    try {
        const response = await fetch('/get_due_cards');
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
    
    // Reset state for the new card
    const flashcard = document.getElementById('flashcard');
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

// --- 3. THE SM-2 GRADING ---
async function submitGrade(grade) {
    const cardId = currentDeck[currentIndex].id;
    
    // Hide buttons while processing
    document.getElementById('gradeButtons').style.display = 'none';

    try {
        await fetch(`/review_card/${cardId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grade: grade })
        });
        
        // Move to next card
        currentIndex++;
        displayCard();

    } catch (error) {
        console.error("Error submitting grade:", error);
        document.getElementById('reviewStatus').innerText = "Error saving progress.";
    }
}