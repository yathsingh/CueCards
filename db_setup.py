import sqlite3
import os

DB_PATH = os.path.join("database", "flashcards.db")

def init_db():
    os.makedirs("database", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_name TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            card_type TEXT,
            
            -- SM-2 Algorithm Columns
            next_review_date DATE DEFAULT CURRENT_DATE,
            interval INTEGER DEFAULT 0,
            repetition INTEGER DEFAULT 0,
            ease_factor REAL DEFAULT 2.5
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully with Deck Management!")

if __name__ == "__main__":
    init_db()