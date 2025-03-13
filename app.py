import os
import json
from flask import Flask, render_template, request, jsonify
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

app = Flask(__name__)

# Загружаем учетные данные Firebase из переменной окружения
cred_path = os.getenv('FIREBASE_CREDENTIALS_PATH', 'firebase_credentials.json')
with open(cred_path, 'r') as f:
    cred_dict = json.load(f)
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)
db = firestore.client()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/schedule')
def schedule():
    return render_template('schedule.html')

@app.route('/api/schedule')
def get_schedule():
    try:
        with open('data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data['schedule']['8Б'])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/homework', methods=['GET', 'POST', 'DELETE'])
def homework():
    try:
        if request.method == 'GET':
            homework_ref = db.collection('homework')
            docs = homework_ref.stream()
            homework_list = []
            for doc in docs:
                homework_list.append(doc.to_dict())
            return jsonify(homework_list)
            
        elif request.method == 'POST':
            data = request.json
            homework_ref = db.collection('homework').document(f"{data['day']}_{data['lesson']}")
            homework_ref.set(data)
            return jsonify({"success": True})
            
        elif request.method == 'DELETE':
            data = request.json
            homework_ref = db.collection('homework').document(f"{data['day']}_{data['lesson']}")
            homework_ref.delete()
            return jsonify({"success": True})
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)