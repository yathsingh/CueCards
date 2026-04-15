<div align="center">
  <img src="static/img/Cue.png" alt="Cue the Mascot" width="200"/>
  
  # CueCards: The Active AI Tutor
  **Don't just flip flashcards. *Speak* to them.**
  
  [![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
  [![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey.svg)](https://flask.palletsprojects.com/)
  [![Gemini API](https://img.shields.io/badge/Google-Gemini_AI-orange.svg)](https://ai.google.dev/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

  *A submission for the Cuemath AI Builder Challenge*
</div>

---

## 🚀 The Vision
**Problem Picked:** Problem 1 - The Flashcard Engine (Retention vs. Cramming).

Most flashcard apps are passive, manual, and boring. You spend hours typing out cards, and reviewing them feels like a chore. **CueCards** reinvents the study process by combining the mathematical rigor of the **SM-2 Spaced Repetition Algorithm** with a hands-free, **Voice-Activated AI Grader**. 

It’s not just a deck of cards; it's an interactive tutor.

---

## ✨ Standout Features

### 🎙️ Conversational AI Grading (Active Recall)
Instead of clicking "Reveal Answer" and self-assessing, click the Mic 🎙️. 
1. The browser's **Web Speech API** transcribes your spoken answer.
2. The backend routes your answer to **Gemini 1.5 Flash**.
3. The LLM acts as a strict tutor, evaluating your response for *semantic meaning* (not just exact keyword matching) and automatically assigns a grade from 0 to 5.
4. The UI rewards you with a glowing success animation, a satisfying audio chime, and auto-advances. **100% hands-free studying.**

### 📄 One-Click PDF Ingestion
Drop your dense engineering textbook or lecture slides into the upload zone. The app uses `PyMuPDF` to extract the text and prompts the LLM to architect a comprehensive JSON array of flashcards—complete with core concepts, definitions, and edge cases—in seconds.

### 🧠 True Spaced Repetition (SM-2)
Under the hood, CueCards uses a robust SQLite schema to track your repetition state, interval, and Ease Factor (EF) using the optimal SM-2 algorithm:
> $EF' = EF + (0.1 - (5 - q) \cdot (0.08 + (5 - q) \cdot 0.02))$

### 🎮 Gamification & Cue the Mascot
Meet **Cue**, your animated study companion. Cue tracks your progress mathematically. He stays quiet when you're in the zone, chimes in every 60 seconds with dynamic encouragement based on how many cards are left in your session, and reacts to your grades. Plus, finishing your Daily Revisions earns you coins 🪙 to build a daily study habit.

### ☁️💻 Hybrid AI Architecture
A sleek UI toggle lets you hot-swap the backend brain. Running this locally? Switch to **Local (Ollama)** for 100% offline, privacy-first AI grading. Running in production? Switch to **Gemini 3 Flash** for lightning-fast cloud inference.

---

## 🛠️ Technical Trade-offs & Decisions 

* **Semantic vs. Exact Matching:** Human memory relies on concepts, not exact strings. If a card's answer is "Canine" and the user speaks "A type of dog," basic code gives them a 0. By routing spoken text through an LLM prompt, we achieve true conceptual grading.
* **UX Physics & State Management:** To make the digital cards feel tangible, I implemented 3D-perspective CSS backface-visibility flipping alongside Javascript state locks to ensure grading buttons only appear *after* a card has been actively attempted.
* **Deployment Database Context:** This live demo is hosted on Render's free tier. Because Render uses an ephemeral file system, the local SQLite database resets on server spin-down. In a true production environment, the SQLAlchemy/DB connection string would be migrated to a managed PostgreSQL instance.

---

## 💻 Run it Locally

Want to spin up CueCards on your own machine? It takes less than 2 minutes.

**1. Clone the repo:**
```bash
git clone https://github.com/yathsingh/CueCards.git

cd CueCards