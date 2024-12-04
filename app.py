from flask import Flask, render_template, request, jsonify
import json
from datetime import datetime
import os

app = Flask(__name__)

def load_data():
    try:
        with open('data.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"schedule": {}}

def is_russian_name(text):
    if not text:
        return False
    if not ('А' <= text[0] <= 'Я'):
        return False
    for c in text[1:]:
        if not ('а' <= c <= 'я'):
            return False
    return True

def validate_name(name):
    return is_russian_name(name)

def validate_full_name(full_name):
    parts = full_name.split()
    if len(parts) != 2:
        return False
    surname, name = parts
    return is_russian_name(surname) and is_russian_name(name)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/validate_user', methods=['POST'])
def validate_user():
    data = request.json
    full_name = data.get('full_name')
    class_name = data.get('class')
    
    if not validate_full_name(full_name):
        return jsonify({"success": False, "error": "Неверный формат имени"})
    
    valid_classes = [f"{num}{letter}" for num in range(5, 10) for letter in ['А', 'Б']]
    valid_classes.extend([str(num) for num in range(10, 12)])
    
    if class_name not in valid_classes:
        return jsonify({"success": False, "error": "Неверный класс"})
    
    return jsonify({"success": True})

# Закомментировали эту функцию, так как теперь используем Firebase
# @app.route('/api/homework', methods=['GET', 'POST'])
# def homework():
#     ...

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/schedule')
def schedule():
    with open('data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    class_name = request.args.get('class')
    if class_name:
        return jsonify(data['schedule'].get(class_name, {}))
    return jsonify(data['schedule'])

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)