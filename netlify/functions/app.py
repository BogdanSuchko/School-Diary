from flask import Flask, render_template, request, jsonify
import json
import os
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore
from netlify_lambda_wsgi import make_aws_lambda_wsgi_handler

app = Flask(__name__, 
           static_folder='static',
           template_folder='templates')

# Инициализация Firebase Admin SDK
cred = credentials.Certificate("serviceAccountKey.json")
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

# Обработчик для AWS Lambda
handler = make_aws_lambda_wsgi_handler(app) 