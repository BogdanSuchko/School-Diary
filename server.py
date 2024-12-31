from netlify.functions.app import app

if __name__ == '__main__':
    # Для локальной разработки
    app.run(host='0.0.0.0', port=5000, debug=True) 