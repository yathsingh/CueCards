import os
import fitz
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template

load_dotenv()
app = Flask(__name__)
app.logger.setLevel(logging.INFO)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- TOGGLE THIS: True for Ollama (Local), False for Gemini (Cloud) ---
USE_LOCAL_AI = False

if not USE_LOCAL_AI:
    from google import genai
    from google.genai import types
    try:
        client = genai.Client()
    except Exception as e:
        app.logger.error(f"Failed to initialize Gemini Client: {e}")
        client = None
else:
    import ollama

def get_db_connection():
    os.makedirs('database', exist_ok=True)
    conn = sqlite3.connect('database/flashcards.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_pdf():
    if 'file' not in request.files: return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    text = ""
    try:
        with fitz.open(filepath) as doc:
            for page in doc: text += page.get_text()
        return jsonify({"message": "Extracted successfully!", "preview": text[:4000]})
    except Exception as e:
        return jsonify({"error": f"PDF parsing failed: {str(e)}"}), 500

@app.route('/generate', methods=['POST'])
def generate_cards():
    data = request.json
    raw_text = data.get('text', '')
    if not raw_text: return jsonify({"error": "No text provided"}), 400

    prompt = f"""
    You are an expert teacher. Based on the text below, create a comprehensive deck of flashcards.
    Requirements:
    1. Include definitions, key concepts, and "edge cases" or common pitfalls.
    2. Ensure cards are designed for active recall.
    3. Return ONLY a valid JSON array of objects.
    Format: [{{"question": "...", "answer": "...", "type": "Concept"}}]
    Text: {raw_text} 
    """

    if USE_LOCAL_AI:
        try:
            response = ollama.generate(model='llama3', prompt=prompt)
            response_text = response.get('response', '')
            start, end = response_text.find('['), response_text.rfind(']') + 1
            if start != -1 and end != -1: return jsonify(json.loads(response_text[start:end]))
            return jsonify({"error": "Failed to parse JSON"}), 500
        except Exception as e: return jsonify({"error": f"Ollama Error: {str(e)}"}), 500
    else:
        if not client: return jsonify({"error": "Cloud AI client not initialized."}), 500
        try:
            response = client.models.generate_content(
                model='gemini-3-flash-preview',
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            return jsonify(json.loads(response.text.strip()))
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                return jsonify({"error": "AI Rate Limit Reached! Wait 60s."}), 429
            return jsonify({"error": str(e)}), 500

@app.route('/save_cards', methods=['POST'])
def save_cards():
    data = request.json
    cards, deck_name = data.get('cards', []), data.get('deck_name', 'Untitled Deck')
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        for card in cards:
            cursor.execute('INSERT INTO cards (deck_name, question, answer, card_type) VALUES (?, ?, ?, ?)', 
                           (deck_name, card.get('question', ''), card.get('answer', ''), card.get('type', 'Concept')))
        conn.commit()
        conn.close()
        return jsonify({"message": f"{len(cards)} cards saved!"})
    except Exception as e: return jsonify({"error": "Failed to save cards."}), 500

@app.route('/get_decks', methods=['GET'])
def get_decks():
    try:
        conn = get_db_connection()
        decks = conn.execute('''
            SELECT deck_name, COUNT(*) as total_cards, SUM(CASE WHEN next_review_date <= date('now') THEN 1 ELSE 0 END) as due_cards
            FROM cards GROUP BY deck_name
        ''').fetchall()
        conn.close()
        return jsonify([{"deck_name": d["deck_name"], "total_cards": d["total_cards"], "due_cards": d["due_cards"] or 0} for d in decks])
    except Exception as e: return jsonify({"error": "Failed to fetch decks."}), 500

@app.route('/get_due_cards', methods=['GET'])
def get_due_cards():
    deck_name = request.args.get('deck')
    try:
        conn = get_db_connection()
        cards = conn.execute('SELECT * FROM cards WHERE next_review_date <= date("now") AND deck_name = ?', (deck_name,)).fetchall() if deck_name else []
        conn.close()
        return jsonify([dict(card) for card in cards])
    except Exception as e: return jsonify({"error": "Failed to fetch cards."}), 500

# NEW ROUTE: For Cram & Study Modes
@app.route('/get_all_cards', methods=['GET'])
def get_all_cards():
    deck_name = request.args.get('deck')
    try:
        conn = get_db_connection()
        cards = conn.execute('SELECT * FROM cards WHERE deck_name = ?', (deck_name,)).fetchall() if deck_name else []
        conn.close()
        return jsonify([dict(card) for card in cards])
    except Exception as e: return jsonify({"error": "Failed to fetch cards."}), 500

@app.route('/review_card/<int:card_id>', methods=['POST'])
def review_card(card_id):
    grade = request.json.get('grade')
    if grade is None or not (0 <= grade <= 5): return jsonify({"error": "Invalid grade"}), 400
    try:
        conn = get_db_connection()
        card = conn.execute('SELECT * FROM cards WHERE id = ?', (card_id,)).fetchone()
        if not card: return jsonify({"error": "Card not found"}), 404

        repetition, interval, ef = card['repetition'], card['interval'], card['ease_factor']
        if grade >= 3:
            if repetition == 0: interval = 1
            elif repetition == 1: interval = 6
            else: interval = round(interval * ef)
            repetition += 1
        else:
            repetition, interval = 0, 1

        ef = max(1.3, ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))
        next_review_date = datetime.now() + timedelta(days=interval)
        
        conn.execute('UPDATE cards SET repetition=?, interval=?, ease_factor=?, next_review_date=? WHERE id=?', 
                     (repetition, interval, ef, next_review_date.strftime('%Y-%m-%d'), card_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "Card updated"})
    except Exception as e: return jsonify({"error": "Failed to update card progress."}), 500

if __name__ == '__main__':
    app.run(debug=True)