import os
import fitz
import sqlite3
import json
import ollama  # New import for local AI
from datetime import datetime, timedelta
from google import genai
from google.genai import types
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template

load_dotenv()
client = genai.Client()

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# TOGGLE THIS: True for Ollama (Local), False for Gemini (Cloud)
USE_LOCAL_AI = True 

def get_db_connection():
    conn = sqlite3.connect('database/flashcards.db')
    conn.row_factory = sqlite3.Row
    return conn

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
    return jsonify({"message": "Extracted!", "preview": text[:4000]})

@app.route('/generate', methods=['POST'])
def generate_cards():
    data = request.json
    raw_text = data.get('text', '')
    
    prompt = f"""
    You are an expert teacher. Based on the text below, create a comprehensive deck of flashcards.
    Return ONLY a valid JSON array of objects. 
    Format: [{{"question": "...", "answer": "...", "type": "Concept"}}]
    Text: {raw_text} 
    """

    if USE_LOCAL_AI:
        try:
            # Using Ollama locally
            response = ollama.generate(model='llama3', prompt=prompt)
            # Ollama doesn't always strictly follow the "JSON only" rule, so we clean it
            response_text = response['response']
            start = response_text.find('[')
            end = response_text.rfind(']') + 1
            cards_data = json.loads(response_text[start:end])
            return jsonify(cards_data)
        except Exception as e:
            return jsonify({"error": f"Ollama Error: {str(e)}"}), 500
    else:
        try:
            # Using Gemini Cloud
            response = client.models.generate_content(
                model='gemini-1.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            return jsonify(json.loads(response.text.strip()))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

# ... (Keep existing save_cards, get_due_cards, and review_card routes from previous steps) ...

if __name__ == '__main__':
    app.run(debug=True)