import os
import json
import re
from flask import Flask, render_template, request, jsonify
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
from datetime import datetime
from zoneinfo import ZoneInfo
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from urllib import request as urlrequest

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
TIMEZONE = os.getenv("APP_TIMEZONE", "Europe/Minsk")
scheduler = BackgroundScheduler(timezone=TIMEZONE)


def get_week_meta(now):
    iso_year, iso_week, _ = now.isocalendar()
    week_start = now.date().fromisocalendar(iso_year, iso_week, 1)
    week_end = now.date().fromisocalendar(iso_year, iso_week, 7)
    return iso_year, iso_week, week_start, week_end


def normalize_doc_id(day, lesson):
    return f"{day}_{lesson}".replace(" ", "_").replace("/", "_").replace("(", "_").replace(")", "_").replace(".", "_")


def has_saturday_content(schedule_snapshot, homework_snapshot):
    lessons = schedule_snapshot.get("Суббота", [])
    if not lessons:
        return False

    has_real_lessons = any(
        lesson and lesson not in ("Суббота", "test") and lesson.strip()
        for lesson in lessons
    )
    if has_real_lessons:
        return True

    for lesson in lessons:
        hw = homework_snapshot.get(normalize_doc_id("Суббота", lesson))
        if not hw:
            continue
        if any(
            hw.get(mark)
            for mark in (
                "isTest",
                "isExam",
                "englishTest",
                "englishExam",
                "germanTest",
                "germanExam",
                "firstGroupTest",
                "firstGroupExam",
                "secondGroupTest",
                "secondGroupExam",
            )
        ):
            return True
    return False


def get_effective_schedule():
    with open("data.json", "r", encoding="utf-8") as f:
        base_schedule = json.load(f)["schedule"]["9Б"]

    effective = {day: lessons[:] for day, lessons in base_schedule.items()}

    schedule_doc = db.collection("schedule").document("main").get()
    if schedule_doc.exists:
        for day, lessons in schedule_doc.to_dict().items():
            effective[day] = lessons

    saturday_doc = db.collection("settings").document("saturday").get()
    if saturday_doc.exists and saturday_doc.to_dict().get("enabled"):
        schedule_from = saturday_doc.to_dict().get("scheduleFrom")
        effective["Суббота"] = effective.get(schedule_from, [])[:]
    else:
        effective.pop("Суббота", None)

    return effective


def save_weekly_archive_and_clear_homework():
    now = datetime.now(ZoneInfo(TIMEZONE))
    year, week, week_start, week_end = get_week_meta(now)
    archive_id = f"{year}-W{week:02d}"

    schedule_snapshot = get_effective_schedule()

    homework_snapshot = {}
    homework_docs = db.collection("homework").stream()
    for doc in homework_docs:
        homework_snapshot[doc.id] = doc.to_dict()

    # Субботу архивируем только если там есть реальные уроки или отметки.
    if "Суббота" in schedule_snapshot and not has_saturday_content(schedule_snapshot, homework_snapshot):
        schedule_snapshot.pop("Суббота", None)
        homework_snapshot = {
            doc_id: data
            for doc_id, data in homework_snapshot.items()
            if data.get("day") != "Суббота"
        }

    archive_data = {
        "year": year,
        "week": week,
        "weekStart": firestore.Timestamp.from_datetime(
            datetime.combine(week_start, datetime.min.time(), ZoneInfo(TIMEZONE))
        ),
        "weekEnd": firestore.Timestamp.from_datetime(
            datetime.combine(week_end, datetime.min.time(), ZoneInfo(TIMEZONE))
        ),
        "schedule": schedule_snapshot,
        "homework": homework_snapshot,
        "savedAt": firestore.SERVER_TIMESTAMP,
        "locked": True,
    }
    db.collection("archive").document(archive_id).set(archive_data)

    hw_docs = db.collection("homework").stream()
    batch = db.batch()
    has_homework = False
    for hw_doc in hw_docs:
        has_homework = True
        batch.delete(hw_doc.reference)
    if has_homework:
        batch.commit()

    db.collection("system").document("version").set(
        {"number": firestore.Increment(1)},
        merge=True,
    )
    print(f"[weekly-reset] archived {archive_id} and cleared homework")


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(
        save_weekly_archive_and_clear_homework,
        trigger=CronTrigger(day_of_week="fri", hour=8, minute=0),
        id="weekly_archive_and_clear",
        replace_existing=True,
    )
    scheduler.start()
    print(f"[scheduler] weekly archive/reset: Friday 08:00 ({TIMEZONE})")


if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or os.environ.get("FLASK_ENV") != "development":
    start_scheduler()


def extract_json_payload(raw_text):
    text = (raw_text or "").strip()
    if text.startswith("```"):
        first_nl = text.find("\n")
        last_ticks = text.rfind("```")
        if first_nl != -1 and last_ticks != -1 and last_ticks > first_nl:
            text = text[first_nl + 1:last_ticks].strip()
    return json.loads(text)


def normalize_ai_homework_text(text):
    value = str(text or "").strip()
    # Номер задания всегда без пробела после "№": "№35", не "№ 35"
    value = re.sub(r"№\s+(\d)", r"№\1", value)
    # Частая OCR-ошибка: "6/B" вместо "G/B"
    value = re.sub(r"\b6\s*/\s*[BbВв]\b", "G/B", value)
    # Нормализуем допустимый вариант S/B
    value = re.sub(r"\b[Ss]\s*/\s*[BbВв]\b", "S/B", value)
    # Нормализуем G/B по регистру и кириллической В
    value = re.sub(r"\b[Gg]\s*/\s*[BbВв]\b", "G/B", value)
    return value

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
        return jsonify(data['schedule']['9Б'])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/homework', methods=['GET', 'POST', 'DELETE'])
def homework():
    try:
        if request.method == 'GET':
            homework_ref = db.collection('homework')
            docs = homework_ref.stream()
            homework_list =[]
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


@app.route('/api/ai-homework-extract', methods=['POST'])
def ai_homework_extract():
    try:
        payload = request.json or {}
        images = payload.get("images", [])
        if not isinstance(images, list) or len(images) == 0:
            return jsonify({"error": "Нужно загрузить хотя бы 1 фото"}), 400
        if len(images) > 3:
            return jsonify({"error": "Можно загрузить максимум 3 фото"}), 400

        api_key = os.getenv("COMET_API_KEY")
        if not api_key:
            return jsonify({"error": "COMET_API_KEY не настроен на сервере"}), 500

        content_parts = [
            {
                "type": "text",
                "text": (
                    "Ты помощник для извлечения ДЗ из фото школьного дневника.\n"
                    "Верни СТРОГО JSON без пояснений в формате:\n"
                    "{\n"
                    '  "items":[\n'
                    "    {\n"
                    '      "day":"Понедельник|Вторник|Среда|Четверг|Пятница|Суббота",\n'
                    '      "lessonNumber":1,\n'
                    '      "homeworkText":"...",\n'
                    '      "isTest":false,\n'
                    '      "isExam":false,\n'
                    '      "confidence":0.0\n'
                    "    }\n"
                    "  ]\n"
                    "}\n"
                    "Правила:\n"
                    "- lessonNumber только число от 1 до 7.\n"
                "- Не пропускай строку только из-за низкой уверенности: лучше вернуть запись с меньшим confidence.\n"
                    "- homeworkText должен быть чистым текстом без markdown.\n"
                "- НЕ включай в homeworkText название предмета/урока и двоеточие (например, не пиши 'Физика: ...').\n"
                "- Если видишь конструкцию вида 6/B, это почти всегда G/B (так и верни). Допустим также вариант S/B.\n"
                "- Если используешь знак №, всегда пиши без пробела: №35, №46.\n"
                    "- confidence от 0 до 1.\n"
                    "- Не дублируй одинаковые записи."
                ),
            }
        ]
        for img in images:
            content_parts.append({"type": "image_url", "image_url": {"url": img}})

        comet_payload = {
            "model": "gemini-3.1-flash-lite-preview-thinking",
            "messages": [{"role": "user", "content": content_parts}],
            "temperature": 0.1,
        }

        req = urlrequest.Request(
            "https://api.cometapi.com/v1/chat/completions",
            data=json.dumps(comet_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlrequest.urlopen(req, timeout=90) as resp:
            raw = json.loads(resp.read().decode("utf-8"))

        ai_text = (
            raw.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        parsed = extract_json_payload(ai_text)
        items = parsed.get("items", [])
        if not isinstance(items, list):
            return jsonify({"error": "ИИ вернул неверный формат"}), 500

        normalized = []
        for item in items:
            day = str(item.get("day", "")).strip()
            lesson_number = item.get("lessonNumber")
            if isinstance(lesson_number, str) and lesson_number.strip().isdigit():
                lesson_number = int(lesson_number.strip())
            homework_text = normalize_ai_homework_text(item.get("homeworkText", ""))
            if day not in ("Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"):
                continue
            if not isinstance(lesson_number, int) or lesson_number < 1 or lesson_number > 7:
                continue
            if not homework_text:
                continue
            normalized.append(
                {
                    "day": day,
                    "lessonNumber": lesson_number,
                    "homeworkText": homework_text,
                    "isTest": bool(item.get("isTest", False)),
                    "isExam": bool(item.get("isExam", False)),
                    "confidence": float(item.get("confidence", 0.0)),
                }
            )

        return jsonify({"items": normalized})
    except Exception as e:
        return jsonify({"error": f"Ошибка AI-импорта: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)