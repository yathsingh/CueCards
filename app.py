import os
import fitz  # PyMuPDF
import sqlite3
import json
from datetime import datetime, timedelta
from google import genai
from google.genai import types
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template

# Initialize environment and AI client
load_dotenv()
client = genai.Client()

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- DATABASE HELPER ---
def get_db_connection():
    conn = sqlite3.connect('database/flashcards.db')
    conn.row_factory = sqlite3.Row
    return conn

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_pdf():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)

    text = ""
    with fitz.open(filepath) as doc:
        for page in doc:
            text += page.get_text()

    return jsonify({"message": "Text extracted successfully!", "preview": text[:4000]})

@app.route('/generate', methods=['POST'])
def generate_cards():
    data = request.json
    raw_text = data.get('text', '')

    if not raw_text:
        return jsonify({"error": "No text provided"}), 400

    prompt = f"""
    You are an expert teacher. Based on the text below, create a comprehensive deck of flashcards.
    
    Requirements:
    1. Include definitions, key concepts, and "edge cases" or common pitfalls.
    2. Ensure cards are designed for active recall.
    3. Return ONLY a valid JSON array of objects.
    
    Format:
    [
      {{"question": "...", "answer": "...", "type": "Concept/Definition/Pitfall"}}
    ]

    Text: {raw_text} 
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        
        cleaned_text = response.text.replace('```json', '').replace('```', '').strip()
        cards_data = json.loads(cleaned_text)
        return jsonify(cards_data)
        
    except Exception as e:
        error_msg = str(e)
        print(f"API Error: {error_msg}")
        
        # FIX: Gracefully handle the Rate Limit / Quota Exceeded error
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            return jsonify({"error": "AI Rate Limit Reached! Please wait 60 seconds and try again."}), 429
            
        return jsonify({"error": error_msg}), 500

@app.route('/save_cards', methods=['POST'])
def save_cards():
    cards = request.json.get('cards', [])
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for card in cards:
        cursor.execute('''
            INSERT INTO cards (question, answer, card_type)
            VALUES (?, ?, ?)
        ''', (card.get('question', ''), card.get('answer', ''), card.get('type', 'Concept')))
        
    conn.commit()
    conn.close()
    return jsonify({"message": f"{len(cards)} cards saved to database!"})

@app.route('/get_due_cards', methods=['GET'])
def get_due_cards():
    conn = get_db_connection()
    due_cards = conn.execute('''
        SELECT * FROM cards 
        WHERE next_review_date <= date('now')
    ''').fetchall()
    conn.close()
    
    return jsonify([dict(card) for card in due_cards])

@app.route('/review_card/<int:card_id>', methods=['POST'])
def review_card(card_id):
    grade = request.json.get('grade')
    if grade is None or not (0 <= grade <= 5):
        return jsonify({"error": "Invalid grade (must be 0-5)"}), 400

    conn = get_db_connection()
    card = conn.execute('SELECT * FROM cards WHERE id = ?', (card_id,)).fetchone()
    
    if not card:
        return jsonify({"error": "Card not found"}), 404

    repetition = card['repetition']
    interval = card['interval']
    ef = card['ease_factor']

    if grade >= 3:
        if repetition == 0:
            interval = 1
        elif repetition == 1:
            interval = 6
        else:
            interval = round(interval * ef)
        repetition += 1
    else:
        repetition = 0
        interval = 1

    ef = ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    if ef < 1.3:
        ef = 1.3

    next_review_date = datetime.now() + timedelta(days=interval)

    conn.execute('''
        UPDATE cards 
        SET repetition = ?, interval = ?, ease_factor = ?, next_review_date = ?
        WHERE id = ?
    ''', (repetition, interval, ef, next_review_date.strftime('%Y-%m-%d'), card_id))
    
    conn.commit()
    conn.close()

    return jsonify({"message": "Card updated", "next_review": next_review_date.strftime('%Y-%m-%d')})

if __name__ == '__main__':
    app.run(debug=True)