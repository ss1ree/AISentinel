import math

from fastapi import FastAPI, Depends, HTTPException, Response, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from transformers import pipeline
from passlib.context import CryptContext
from jose import jwt
import database 
import docx
import io
from docx import Document
import fitz  # PyMuPDF
import bcrypt
from sentence_transformers import SentenceTransformer, util
import re
from docx2pdf import convert
import tempfile
import os
# import json
from transformers import pipeline, AutoModelForCausalLM, AutoTokenizer
import csv
# import ollama
import torch
from striprtf.striprtf import rtf_to_text
import win32com.client
import pythoncom
from striprtf.striprtf import rtf_to_text
import re
import subprocess
import platform


database.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173"], 
#     allow_credentials=True, # Это разрешает передачу кук
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend-name.vercel.app"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Загружаем модель для сравнения смыслов (около 400 МБ)
print("Загрузка семантической модели...")
semantic_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

model_path = os.path.abspath("./studying/ai_detector_model4")
if os.path.exists(model_path):
    ai_classifier = pipeline(
        "text-classification",
        model=model_path,
        tokenizer=model_path,
        device=0,
        truncation=True,
        max_length=512,
    )
else:
    ai_classifier = None

# Настройки безопасности
SECRET_KEY = "SUPER_SECRET_KEY_FOR_DIPLOMA"
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Хелперы
def get_password_hash(password: str):
    # Превращаем пароль в байты, генерируем соль и хешируем
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_password.decode('utf-8') # Сохраняем как строку

def verify_password(plain_password: str, hashed_password: str):
    password_byte_enc = plain_password.encode('utf-8')
    hashed_password_enc = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_byte_enc, hashed_password_enc)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Функция получения текущего пользователя из куки
def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        return db.query(database.User).filter(database.User.email == email).first()
    except:
        return None
    
def check_formatting(file_bytes, settings: database.CheckSettings):
    errors = []
    try:
        doc = Document(io.BytesIO(file_bytes))
        
        # --- 1. ПРОВЕРКА ПОЛЕЙ СТРАНИЦЫ [Поля] ---
        if doc.sections:
            section = doc.sections[0]
            # Округляем до 1 знака (библиотека выдает в см через .cm)
            m_left = round(section.left_margin.cm, 1)
            m_right = round(section.right_margin.cm, 1)
            m_top = round(section.top_margin.cm, 1)
            m_bottom = round(section.bottom_margin.cm, 1)

            if abs(m_left - settings.margin_left) > 0.1:
                errors.append(f"[Поля] Левое поле: {m_left} см (нужно {settings.margin_left})")
            if abs(m_right - settings.margin_right) > 0.1:
                errors.append(f"[Поля] Правое поле: {m_right} см (нужно {settings.margin_right})")
            if abs(m_top - settings.margin_top) > 0.1:
                errors.append(f"[Поля] Верхнее поле: {m_top} см (нужно {settings.margin_top})")
            if abs(m_bottom - settings.margin_bottom) > 0.1:
                errors.append(f"[Поля] Нижнее поле: {m_bottom} см (нужно {settings.margin_bottom})")

        # --- 2. ПРОВЕРКА ТИПОГРАФИКИ [Типографика] ---
        font_err_shown = False
        size_err_shown = False
        
        for p in doc.paragraphs:
            text = p.text.strip()
            if not text or len(text) < 20: continue # Пропускаем заголовки и пустые строки

            # Проверяем каждый кусок текста (run) в абзаце
            for run in p.runs:
                if not run.text.strip(): continue
                
                # Имя шрифта (берем из run или из стиля абзаца)
                f_name = run.font.name or p.style.font.name
                # Размер шрифта
                f_size = run.font.size.pt if run.font.size else (p.style.font.size.pt if p.style.font.size else None)

                if f_name and f_name != settings.font_name and not font_err_shown:
                    errors.append(f"[Типографика] Шрифт: обнаружен {f_name} (нужен {settings.font_name})")
                    font_err_shown = True
                
                if f_size and round(f_size) != settings.font_size and not size_err_shown:
                    errors.append(f"[Типографика] Размер текста: {round(f_size)}pt (нужен {settings.font_size}pt)")
                    size_err_shown = True
            
            if font_err_shown and size_err_shown: break

        # --- 3. ПРОВЕРКА БИБЛИОГРАФИИ [Библиография] ---
        refs_count = 0
        found_ref_header = False
        for p in doc.paragraphs:
            t = p.text.lower().strip()
            # Маркер начала списка литературы
            if any(x in t for x in ["список литературы", "библиографическ", "references"]):
                found_ref_header = True
                continue
            
            # Считаем наполненные строки после заголовка
            if found_ref_header and len(t) > 10:
                # Если строка начинается с цифры или скобки [1] - это точно ссылка
                if re.match(r'^[\(\[]?\d+[\)\]\.]', t) or len(t) > 30:
                    refs_count += 1
        
        if refs_count < settings.min_references:
            errors.append(f"[Библиография] Источники: найдено {refs_count} (минимум {settings.min_references})")

    except Exception as e:
        print(f"Error in check_formatting: {e}")
        errors.append("[Система] Ошибка при чтении структуры DOCX")
    
    return errors

ppl_model_name = "gpt2"

ppl_tokenizer = AutoTokenizer.from_pretrained(ppl_model_name)
ppl_model = AutoModelForCausalLM.from_pretrained(ppl_model_name)

def calculate_perplexity(text):

    encodings = ppl_tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=1024
    )

    input_ids = encodings.input_ids

    with torch.no_grad():
        outputs = ppl_model(input_ids, labels=input_ids)

    loss = outputs.loss.item()   # tensor → float
    perplexity = math.exp(loss)  # float

    return perplexity

def split_into_chunks(text, chunk_size=4000):

    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i+chunk_size])
        chunks.append(chunk)

    return chunks

# def run_ai_logic(text: str):
#     # Очистка и ограничение текста (для скорости берем первые ~4000 символов)
#     # Лама понимает и больше, но для быстрой детекции этого хватит
#     sample_text = " ".join(text.split())[:4000]

#     prompt = f"""
#     Ты — эксперт-криминалист по цифровым текстам. Проанализируй фрагмент научной работы.
#     Определи: сгенерирован ли он ИИ (ChatGPT, Llama и др.) или написан человеком.
    
#     Обрати внимание на:
#     1. Избыточную структурированность и "идеальность" списков.
#     2. Типичные вводные фразы ИИ ("важно отметить", "таким образом", "в заключение стоит сказать").
#     3. Однообразие синтаксических конструкций.

#     Текст для анализа:
#     {sample_text}

#     Верни ответ СТРОГО в формате JSON:
#     {{
#       "label": "AI" или "Human",
#       "score": вероятность ИИ от 0.0 до 1.0,
#     }}
#     """

#     try:
#         # Вызов локальной модели
#         response = ollama.chat(
#             model='llama3.1:8b', 
#             messages=[{'role': 'user', 'content': prompt}],
#             format='json' # Заставляем модель выдать чистый JSON
#         )
        
#         # Парсим результат
#         result = json.loads(response['message']['content'])
        
#         # Приводим к формату, который ждет твой фронтенд и база
#         label = result.get("label", "Human")
#         score = float(result.get("score", 0.0))

#         return label, score, 1

#     except Exception as e:
#         print(f"Ollama Error: {e}")
#         return "Error", 0.0, 0, f"Ошибка локальной нейросети: {str(e)}"

# def run_ai_logic(text: str):
#     # Берем текст (не более 512 токенов, так как DistilBERT плохо работает с 15000)
#     sample_text = " ".join(text.split())[:512]

#     # 1. Получаем предсказание от DistilBERT
#     # Модель выдаст список: [{'label': 'LABEL_0', 'score': 0.95}]
#     result = ai_classifier(sample_text)[0]
    
#     # Предположим: LABEL_1 - это AI, LABEL_0 - это Human
#     # Если ваша модель выдала LABEL_1, значит это AI.
#     # Если результат LABEL_0, score 0.9, значит вероятность AI = 0.1
    
#     # Приводим к единой шкале (вероятность того, что это ИИ)
#     if result['label'] == 'LABEL_1':
#         ai_prob = result['score']
#     else:
#         ai_prob = 1.0 - result['score']

#     # 2. Perplexity (оставляем как было)
#     ppl = calculate_perplexity(sample_text)
#     if ppl < 25:
#         ppl_score = 0.8
#     elif ppl < 40:
#         ppl_score = 0.5
#     else:
#         ppl_score = 0.2

#     # 3. Комбинирование (вес BERT теперь важнее — 0.7)
#     final_score = (ai_prob * 0.7) + (ppl_score * 0.3)

#     label = "AI" if final_score > 0.5 else "Human"

#     return label, final_score, 1

def clean_text_thoroughly(text: str) -> str:
    # 1. Заменяем переносы строк на пробелы
    text = text.replace('\n', ' ').replace('\r', ' ')
    # 2. split() без аргументов делит строку по ЛЮБОМУ количеству пробельных символов
    # 3. join() собирает слова обратно через ОДИН пробел
    return " ".join(text.split())

def run_ai_logic(text: str):
    if not ai_classifier:
        return "Disabled", 0.0, 0

    # 1. Очистка текста
    clean_text = clean_text_thoroughly(text)
    words = clean_text.split()

    if not words:
        return "Human", 0.0, 0

    # 2. Улучшенное разбиение (Chunking) с ПЕРЕКРЫТИЕМ (overlap)
    # Берем по 300 слов, перекрытие 50 слов, чтобы не разрывать смысл на стыках
    chunk_size = 300
    overlap = 50
    
    chunks =[]
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i+chunk_size])
        if chunk.strip():
            chunks.append(chunk)

    # 3. Защита от перегрузки для огромных диссертаций
    # Берем равномерную выборку из 100 кусков, если текст слишком большой
    max_chunks = 100
    if len(chunks) > max_chunks:
        step = len(chunks) / max_chunks
        chunks = [chunks[int(i * step)] for i in range(max_chunks)]

    # 4. Анализ текста (Батчинг)
    # batch_size=8 значительно ускоряет работу модели на GPU и CPU
    try:
        results = ai_classifier(chunks, truncation=True, max_length=512, batch_size=8)
    except Exception as e:
        print(f"Ошибка инференса классификатора: {e}")
        return "Error", 0.0, 0

    # 5. Обработка результатов
    ai_scores =[]
    for result in results:
        # Учитываем возможные варианты названия лейблов ИИ после дообучения
        ai_labels =['LABEL_1', 'AI', '1', 'ai', 'fake']
        is_ai = result['label'] in ai_labels
        
        # Если модель уверена, что это ИИ - берем её score, иначе берем обратную вероятность
        score = result['score'] if is_ai else (1.0 - result['score'])
        ai_scores.append(score)

    if not ai_scores:
        return "Human", 0.0, 0

    # 6. Продвинутая логика (Top-K + Штраф за ИИ-вставки)
    
    # 6.1. Считаем, какая доля текста явно сгенерирована (score > 0.8)
    ai_chunks_count = sum(1 for s in ai_scores if s > 0.8)
    ai_ratio = ai_chunks_count / len(ai_scores)
    
    # 6.2. Берем топ 30% самых подозрительных кусков (но не менее 1 куска)
    k = max(1, int(len(ai_scores) * 0.3))
    top_scores = sorted(ai_scores, reverse=True)[:k]
    base_score = sum(top_scores) / len(top_scores)
    
    # 6.3. Финальная оценка:
    # Если больше 65% текста явно написано нейросетью, мы жестко маркируем документ как AI
    if ai_ratio > 0.65:
        final_score = max(base_score, 0.75) # Ставим минимум 75% вероятности ИИ
    else:
        final_score = base_score
        
    # Порог принятия решения — 50%
    label = "AI" if final_score > 0.65 else "Human"
    
    return label, round(float(final_score), 2), len(chunks)

# Функция для извлечения текста
async def extract_text_from_file_bytes(file_bytes: bytes, filename: str):
    content = ""
    extension = filename.split(".")[-1].lower()
    
    try:
        if extension == "docx":
            # Читаем docx из байтов в памяти
            doc = docx.Document(io.BytesIO(file_bytes))
            content = "\n".join([p.text for p in doc.paragraphs])
            
        elif extension == "pdf":
            # Читаем pdf из байтов в памяти
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                content += page.get_text()
                
        elif extension == "rtf":
            # Читаем RTF. Используем cp1251 или utf-8 с игнорированием битых байтов
            raw_text = file_bytes.decode("cp1251", errors="ignore")
            content = rtf_to_text(raw_text)
                
        elif extension == "txt":
            content = file_bytes.decode("utf-8")
            
    except Exception as e:
        print(f"Ошибка при извлечении текста: {e}")
        
    return content

def check_semantic_rules(doc, settings: database.CheckSettings):
    errors = []
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    full_text_lower = "\n".join(paragraphs).lower()

    # Извлекаем блоки для анализа
    org_ru, org_en = "", ""
    abstract_text = ""
    main_body = ""
    
    for i, p in enumerate(paragraphs):
        p_low = p.lower()
        
        # 1. Поиск организаций (университеты)
        if i < 15:
            if any(x in p_low for x in ["университет", "институт", "академия", "university", "institute", "reshetnev"]):
                if re.search('[а-яА-Я]', p): org_ru = p
                else: org_en = p
        
        # 2. УМНЫЙ ПОИСК АННОТАЦИИ
        # Ищем либо само слово "Аннотация", либо характерное начало текста
        if not abstract_text:
            if any(x in p_low for x in ["аннотация", "abstract", "в работе анализируются", "in the paper", "в статье"]):
                abstract_text = p
                continue # Чтобы этот же абзац не попал в main_body

        # 3. Поиск основного текста (первый длинный кусок после 15-го абзаца или после аннотации)
        if len(p) > 400 and not main_body:
            main_body = p

    # --- ПРОВЕРКИ ---

    # 1. Проверка перевода организации
    if settings.check_translation:
        if org_ru and org_en:
            emb1 = semantic_model.encode(org_ru, convert_to_tensor=True)
            emb2 = semantic_model.encode(org_en, convert_to_tensor=True)
            similarity = util.pytorch_cos_sim(emb1, emb2).item()
            if similarity < 0.7:
                errors.append(f"[NLP] Перевод организации: сходство {int(similarity*100)}% (проверьте блоки RU/EN)")
        elif not org_en and not org_ru:
            # Не считаем критической ошибкой, если это не статья с шапкой
            pass

    # 2. Проверка аннотации
    if settings.check_abstract:
        if abstract_text and main_body:
            emb_a = semantic_model.encode(abstract_text, convert_to_tensor=True)
            emb_m = semantic_model.encode(main_body[:1000], convert_to_tensor=True)
            sim = util.pytorch_cos_sim(emb_a, emb_m).item()
            if sim < 0.35: # Порог чуть снижен для более гибкой проверки
                errors.append(f"[NLP] Аннотация: слабое соответствие теме статьи ({int(sim*100)}%)")
        elif not abstract_text:
            # Если текст найден, но не помечен как аннотация
            errors.append("[NLP] Блок аннотации не найден (нет заголовка или фразы 'В работе...')")

    # 3. Экспертные заключения
    if settings.check_expert:
        expert_keywords = [
            "экспертное заключение", "экспортный контроль", 
            "разрешение на публикацию", "сведений не содержит",
            "open publication", "expert conclusion"
        ]
        if not any(word in full_text_lower for word in expert_keywords):
            errors.append("[Экспертиза] Не найдено упоминание об экспертном заключении")

    return errors

# Зависимость для получения сессии БД
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/register")
def register(email: str, password: str, db: Session = Depends(get_db)):
    # Bcrypt не принимает пароли длиннее 72 символов
    if len(password.encode('utf-8')) > 72:
        return {"error": "Пароль слишком длинный (максимум 72 символа)"}
        
    if db.query(database.User).filter(database.User.email == email).first():
        return {"error": "Email уже занят"}
    
    new_user = database.User(email=email, hashed_password=get_password_hash(password))
    db.add(new_user)
    db.commit()
    return {"message": "Успешно"}

@app.post("/login")
def login(email: str, password: str, response: Response, db: Session = Depends(get_db)):
    # ... логика проверки пароля ...
    user = db.query(database.User).filter(database.User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        return {"error": "Неверные данные"}
    
    token = jwt.encode({"sub": user.email}, SECRET_KEY, algorithm=ALGORITHM)
    
    # Устанавливаем куку правильно
    response.set_cookie(
        key="access_token", 
        value=token, 
        httponly=True, 
        max_age=604800, 
        samesite="lax",   # Обязательно "lax" для работы между портами 5173 и 8000
        secure=False,      # Обязательно False, так как у тебя нет SSL/HTTPS
        domain=None        # На localhost лучше не указывать домен явно
    )
    return {"email": user.email}

@app.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Вышли"}

@app.get("/me")
def me(user: database.User = Depends(get_current_user)):
    if not user: return {"error": "Not logged in"}
    return {"email": user.email}

@app.get("/")
def home():
    return {"message": "AI Detector API is running"}

@app.post("/feedback/{result_id}")
def save_feedback(result_id: int, correct: bool, db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: raise HTTPException(status_code=401)
    
    # 1. Ищем запись в базе
    db_result = db.query(database.DetectionResult).filter(
        database.DetectionResult.id == result_id,
        database.DetectionResult.owner_id == user.id
    ).first()
    
    if not db_result:
        raise HTTPException(status_code=404, detail="Результат не найден")

    # Предотвращаем повторную запись, если фидбек уже был
    if db_result.user_feedback is not None:
        return {"status": "already_done", "message": "Фидбек уже учтен"}

    # 2. Определяем ПРАВИЛЬНУЮ метку для обучения
    # Если модель сказала AI и пользователь нажал "Да" (correct=True) -> это 1 (AI)
    # Если модель сказала AI и пользователь нажал "Нет" (correct=False) -> это 0 (Human)
    if correct:
        final_label = 1 if db_result.label == "AI" else 0
    else:
        final_label = 0 if db_result.label == "AI" else 1

    # 3. Дописываем данные в balanced_dataset.csv
    file_path = "studying/balanced_dataset.csv"
    try:
        # 'a' означает append (дозапись в конец файла)
        with open(file_path, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            # Очищаем текст от лишних переносов строк, чтобы не сломать CSV структуру
            clean_text = " ".join(db_result.text_content.split())
            writer.writerow([clean_text, final_label])
    except Exception as e:
        print(f"Ошибка записи в CSV: {e}")

    # 4. Сохраняем статус в базу данных
    db_result.user_feedback = correct
    db.commit()
    
    return {"status": "success", "message": "Данные сохранены и добавлены в датасет"}

@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    total = db.query(database.DetectionResult).filter(database.DetectionResult.user_feedback != None).count()
    correct = db.query(database.DetectionResult).filter(database.DetectionResult.user_feedback == True).count()
    
    accuracy = (correct / total * 100) if total > 0 else 0
    return {"user_accuracy": f"{accuracy:.1f}%", "total_feedbacks": total}

@app.post("/analyze")
def analyze_text_endpoint(
    text: str, 
    db: Session = Depends(get_db), 
    user: database.User = Depends(get_current_user)
):
    if not user: 
        raise HTTPException(status_code=401, detail="Необходимо войти в систему")
    
    # 1. Считаем ИИ (теперь получаем 4 значения)
    label, score, chunks = run_ai_logic(text)
    # 2. Сохраняем в базу данных (filename у нас тут None, так как это просто текст)
    db_result = database.DetectionResult(
        text_content=text,
        filename=None, 
        label=label,
        score=float(score),
        owner_id=user.id,
        format_errors=None, # Для простого текста нормоконтроль не проводим
        page_count=0
    )
    
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    
    # 3. Возвращаем результат фронтенду
    return {
        "id": db_result.id, 
        "label": label, 
        "score": score, 
        "chunks_analyzed": chunks
    }

@app.post("/norm-control")
async def norm_control(file: UploadFile = File(...), db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: raise HTTPException(status_code=401)
    
    # Получаем настройки пользователя (или создаем дефолтные)
    settings = db.query(database.CheckSettings).filter(database.CheckSettings.owner_id == user.id).first()
    if not settings:
        settings = database.CheckSettings(owner_id=user.id)
        db.add(settings)
        db.commit()

    content = await file.read()
    doc = docx.Document(io.BytesIO(content))
    
    errors = []
    
    # 1. Проверка полей (Margins)
    section = doc.sections[0]
    # Переводим из EMU в см (1 см = 360000 EMU)
    if round(section.left_margin.cm, 1) != settings.margin_left:
        errors.append(f"Поле слева: {round(section.left_margin.cm, 1)}см (нужно {settings.margin_left}см)")
    
    # 2. Проверка шрифта и размера (по первому абзацу текста)
    for paragraph in doc.paragraphs:
        if paragraph.text.strip(): # Пропускаем пустые строки
            # Проверка шрифта
            font = paragraph.runs[0].font
            if font.name and font.name != settings.font_name:
                errors.append(f"Шрифт: обнаружен {font.name} (нужен {settings.font_name})")
            
            # Проверка размера
            if font.size and font.size.pt != settings.font_size:
                errors.append(f"Размер шрифта: {font.size.pt}pt (нужно {settings.font_size}pt)")
            break # Проверяем только начало для примера

    # 3. Проверка литературы (Блок 4)
    # Ищем заголовок "Библиографический список" или "Список литературы"
    refs_count = 0
    found_refs = False
    for p in doc.paragraphs:
        if "библиографический" in p.text.lower() or "литература" in p.text.lower():
            found_refs = True
            continue
        if found_refs and p.text.strip():
            refs_count += 1
            
    if refs_count < settings.min_references:
        errors.append(f"Список источников: найдено {refs_count} (минимум {settings.min_references})")

    return {
        "status": "success" if not errors else "warning",
        "errors": errors,
        "checked_params": {
            "font": settings.font_name,
            "size": settings.font_size,
            "margins": f"{settings.margin_left}/{settings.margin_right}"
        }
    }

@app.post("/settings/reset")
def reset_settings(db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: 
        raise HTTPException(status_code=401)
    
    db_settings = db.query(database.CheckSettings).filter(database.CheckSettings.owner_id == user.id).first()
    
    if not db_settings:
        db_settings = database.CheckSettings(owner_id=user.id)
        db.add(db_settings)
    
    # Устанавливаем эталонные значения АПАК
    db_settings.font_name = "Times New Roman"
    db_settings.font_size = 12
    db_settings.margin_left = 2.0
    db_settings.margin_right = 2.0
    db_settings.margin_top = 2.5
    db_settings.margin_bottom = 2.5
    db_settings.min_references = 3
    db_settings.check_translation = True
    db_settings.check_abstract = True
    db_settings.check_expert = True
    db_settings.feedback_enabled = True
    db_settings.check_apak = False
    
    db.commit()
    db.refresh(db_settings)
    return db_settings

@app.get("/settings")
def get_settings(db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: raise HTTPException(status_code=401)
    settings = db.query(database.CheckSettings).filter(database.CheckSettings.owner_id == user.id).first()
    if not settings:
        settings = database.CheckSettings(owner_id=user.id)
        db.add(settings)
        db.commit()
    return settings

@app.post("/settings")
def update_settings(new_settings: dict, db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: raise HTTPException(status_code=401)
    db_settings = db.query(database.CheckSettings).filter(database.CheckSettings.owner_id == user.id).first()
    
    if not db_settings:
        db_settings = database.CheckSettings(owner_id=user.id)
        db.add(db_settings)

    # Обновляем все поля, включая новые тумблеры
    for key, value in new_settings.items():
        if hasattr(db_settings, key) and key not in ['id', 'owner_id']:
            setattr(db_settings, key, value)
            
    db.commit()
    return {"message": "ok"}

def convert_to_pdf_linux(input_path, output_dir):
    """Универсальная конвертация в PDF через LibreOffice для Linux"""
    try:
        subprocess.run([
            'soffice', '--headless', '--convert-to', 'pdf', 
            '--outdir', output_dir, input_path
        ], check=True)
        return True
    except Exception as e:
        print(f"Ошибка LibreOffice: {e}")
        return False

def convert_doc_to_docx(file_bytes: bytes) -> bytes:
    if platform.system() == "Windows":
        import win32com.client
        import pythoncom
        import tempfile
        import os
        
        with tempfile.TemporaryDirectory() as temp_dir:
            doc_path = os.path.abspath(os.path.join(temp_dir, "temp.doc"))
            docx_path = os.path.abspath(os.path.join(temp_dir, "temp.docx"))
            
            # Сохраняем присланные байты как .doc
            with open(doc_path, "wb") as f:
                f.write(file_bytes)
                
            try:
                # Запускаем скрытый Word для конвертации
                pythoncom.CoInitialize()
                word = win32com.client.DispatchEx("Word.Application")
                word.Visible = False
                
                # Открываем .doc и пересохраняем как .docx (FileFormat=16)
                wb_doc = word.Documents.Open(doc_path)
                wb_doc.SaveAs(docx_path, FileFormat=16)
                wb_doc.Close(0)
            except Exception as e:
                print(f"Ошибка конвертации DOC в DOCX: {e}")
            finally:
                word.Quit()
                
            # Возвращаем новые байты .docx (если получилось)
            if os.path.exists(docx_path):
                with open(docx_path, "rb") as f:
                    return f.read()
    else:
        with tempfile.TemporaryDirectory() as temp_dir:
            in_path = os.path.join(temp_dir, "temp.doc")
            with open(in_path, "wb") as f: f.write(file_bytes)
            
            if convert_to_pdf_linux(in_path, temp_dir):
                # После конвертации в PDF мы не получим DOCX напрямую, 
                # но для анализа ИИ нам хватит текста из PDF
                pdf_path = os.path.join(temp_dir, "temp.pdf")
                # Для упрощения в облаке: если это .doc, просто берем текст из него через PDF
                doc = fitz.open(pdf_path)
                text = "".join([page.get_text() for page in doc])
                # Создаем временный docx чтобы не ломать логику дальше
                new_docx = docx.Document()
                new_docx.add_paragraph(text)
                out_io = io.BytesIO()
                new_docx.save(out_io)
                return out_io.getvalue()
    return file_bytes # Если ошибка - возвращаем оригинал
    

def get_page_count(file_bytes: bytes, filename: str) -> int:
    ext = filename.split(".")[-1].lower()
    try:
        if ext == "pdf":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            return doc.page_count
            
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = os.path.join(temp_dir, f"temp.{ext}")
            with open(file_path, "wb") as f: f.write(file_bytes)

            if platform.system() == "Windows":
                if ext == "docx":
                    with tempfile.TemporaryDirectory() as temp_dir:
                        docx_path = os.path.abspath(os.path.join(temp_dir, "temp.docx"))
                        pdf_path = os.path.abspath(os.path.join(temp_dir, "temp.pdf"))
                        
                        with open(docx_path, "wb") as f:
                            f.write(file_bytes)
                        
                        convert(docx_path, pdf_path)
                        
                        temp_pdf = fitz.open(pdf_path)
                        pages = temp_pdf.page_count
                        temp_pdf.close()
                        return pages
                        
                elif ext == "rtf":
                    with tempfile.TemporaryDirectory() as temp_dir:
                        # ВАЖНО: Word понимает только абсолютные пути
                        rtf_path = os.path.abspath(os.path.join(temp_dir, "temp.rtf"))
                        pdf_path = os.path.abspath(os.path.join(temp_dir, "temp.pdf"))
                        
                        with open(rtf_path, "wb") as f:
                            f.write(file_bytes)
                        
                        try:
                            # Инициализация COM-объекта (ОБЯЗАТЕЛЬНО для FastAPI)
                            pythoncom.CoInitialize()
                            word = win32com.client.DispatchEx("Word.Application")
                            word.Visible = False # Прячем окно Word
                            
                            # Открываем RTF и сохраняем как PDF (17 = wdFormatPDF)
                            doc = word.Documents.Open(rtf_path)
                            doc.SaveAs(pdf_path, FileFormat=17)
                            doc.Close(0) # 0 = не сохранять изменения
                            word.Quit()
                            
                            # Читаем страницы из полученного PDF
                            temp_pdf = fitz.open(pdf_path)
                            pages = temp_pdf.page_count
                            temp_pdf.close()
                            return pages
                            
                        except Exception as word_err:
                            print(f"Ошибка Word при конвертации RTF: {word_err}")
                            # УМНЫЙ FALLBACK: Если Word упал, считаем страницы по чистому тексту
                            raw_text = file_bytes.decode("cp1251", errors="ignore")
                            clean_text = rtf_to_text(raw_text) # Очищаем от тяжелых тегов!
                            return max(1, len(clean_text) // 3000)
                    
                elif ext == "txt":
                    # Для обычного текста эвристика работает нормально
                    return max(1, len(file_bytes) // 3000)
            else:
                convert_to_pdf_linux(file_path, temp_dir)
            
            pdf_result = os.path.join(temp_dir, "temp.pdf")
            if os.path.exists(pdf_result):
                temp_pdf = fitz.open(pdf_result)
                pages = temp_pdf.page_count
                temp_pdf.close()
                return pages
        return 1
                
    except Exception as e:
        print(f"Ошибка точного подсчета страниц: {e}")
        return 1
                
    except Exception as e:
        print(f"Ошибка точного подсчета страниц через Word: {e}")
        # Если Word не установлен или произошла ошибка, 
        # возвращаем эвристику (длина текста / 3000)
        return 1

def process_docx_apak(file_bytes: bytes, settings: database.CheckSettings):
    doc = docx.Document(io.BytesIO(file_bytes))
    errors = []
    html_lines = []
    
    current_block = "header" 
    empty_lines = 0
    found_abstract = False
    valid_single_letters = ['а', 'и', 'в', 'о', 'у', 'с', 'к', 'я', 'б', 'ж', 'z', 'a', 'i']

    for p in doc.paragraphs:
        raw_text = p.text.replace('\t', '    ').replace('\x0c', '')
        stripped_text = raw_text.strip()
        
        has_image = len(p._element.xpath('.//w:drawing')) > 0 or len(p._element.xpath('.//w:pict')) > 0

        if not stripped_text:
            if not has_image:
                empty_lines += 1
            html_lines.append("<div style='height: 1em;'></div>")
            continue
            
        lower_text = stripped_text.lower()
        
        # --- 1. ОПРЕДЕЛЕНИЕ БЛОКА И ВЫРАВНИВАНИЯ ---
        alignment = "justify" # По умолчанию (основной текст, аннотация, источники)
        indent = "0.5cm"      # По умолчанию для текста
        
        # УДК (Всегда слева, 12pt)
        if lower_text.startswith("удк"):
            current_block = "header"
            alignment = "left"
            indent = "0"

        # Копирайт (Всегда справа, 12pt)
        elif "©" in lower_text or "(c)" in lower_text:
            current_block = "copyright"
            alignment = "right"
            indent = "0"
            if settings.check_apak and empty_lines != 2:
                errors.append(f"[АПАК] Перед копирайтом нужно 2 пустые строки")

        # Университет (Центр, 11pt)
        elif any(x in lower_text for x in ["сибирский государственный", "reshetnev", "university", "федеральное", "г. красноярск"]):
            current_block = "university"
            alignment = "center"
            indent = "0"
            
        # Заголовки, ФИО и Научный руководитель (Центр, 12pt)
        # Если строка короткая и мы в начале документа (до аннотации) — это заголовок/ФИО
        elif not found_abstract and (len(stripped_text) < 100 or "руководитель" in lower_text or "supervisor" in lower_text):
            alignment = "center"
            indent = "0"

        # Аннотация и ключевые слова (По ширине, Курсив, 12pt)
        elif any(x in lower_text for x in ["аннотация", "abstract", "ключевые слова", "keywords", "в работе", "in the paper"]):
            current_block = "abstract"
            found_abstract = True
            alignment = "justify"
            indent = "0.5cm"

        # Библиографический заголовок (Центр, 12pt)
        elif "библиографическ" in lower_text or "литература" in lower_text:
            current_block = "references"
            alignment = "center"
            indent = "0"

        # Рисунки (Центр)
        is_figure_caption = stripped_text.startswith("Рис.") or stripped_text.startswith("Fig.")
        if is_figure_caption or has_image:
            alignment = "center"
            indent = "0"

        # --- 2. УСТАНОВКА ОЖИДАЕМОГО РАЗМЕРА ---
        expected_size = 11 if current_block == "university" else 12
        empty_lines = 0

        # --- 3. СТИЛЬ АБЗАЦА ---
        p_style = f"margin: 0; line-height: 1.0; white-space: pre-wrap; vertical-align: baseline; "
        p_style += f"text-align: {alignment}; text-indent: {indent}; "
        
        if current_block == "abstract":
            p_style += "font-style: italic; "

        p_html = f"<p style='{p_style}'>"
        
        for run in p.runs:
            if not run.text: continue
            t = run.text.replace("<", "&lt;").replace(">", "&gt;")
            
            # Проверка шрифта
            f_size = run.font.size.pt if run.font.size else (p.style.font.size.pt if p.style.font.size else None)
            if not is_figure_caption and f_size and abs(round(f_size) - expected_size) > 0.1:
                errors.append(f"[Шрифт] Ожидался {expected_size}pt")
                t = f"<mark style='background-color: #fecaca; color: #991b1b; padding: 0;'>{t}</mark>"

            # Типографика (пробелы)
            if settings.check_apak:
                if "  " in t:
                    errors.append(f"[Пробелы] Лишние пробелы")
                    t = t.replace("  ", "<span style='background-color: #fef08a; box-shadow: 0 2px 0 #ca8a04;'>  </span>")

                # Разрыв слов
                def sub_standalone(m):
                    letter = m.group(2)
                    if letter.lower() not in valid_single_letters:
                        errors.append(f"[Типографика] Разрыв слова '{letter}'")
                        return f"{m.group(1)}<mark style='background-color: #ffedd5; outline: 1px solid #ea580c; outline-offset: -1px;'>{letter}</mark> "
                    return m.group(0)
                t = re.sub(r'(^|\s)([а-яА-ЯёЁ])\s', sub_standalone, t)

                def sub_illegal_start(m):
                    errors.append(f"[Типографика] Разрыв слова")
                    return f"{m.group(1)}<mark style='background-color: #ffedd5; outline: 1px solid #ea580c;'>{m.group(2)}</mark>{m.group(3)}"
                t = re.sub(r'(^|\s)([ьыъЬЫЪ])([а-яА-ЯёЁ]+)', sub_illegal_start, t)

            if run.bold: t = f"<b>{t}</b>"
            if run.italic: t = f"<i>{t}</i>"
            p_html += t
            
        p_html += "</p>"
        html_lines.append(p_html)

    return "".join(html_lines), list(dict.fromkeys(errors))

# эндпоинт для загрузки файлов
@app.post("/analyze-file")
async def analyze_file(file: UploadFile = File(...), db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: raise HTTPException(status_code=401)
    
    # 1. Получаем настройки и читаем файл
    settings = db.query(database.CheckSettings).filter(database.CheckSettings.owner_id == user.id).first()
    file_bytes = await file.read()
    filename = file.filename
    ext = filename.split(".")[-1].lower()
    
    # 2. Если файл .doc — незаметно превращаем его в .docx для работы парсера
    if ext == "doc":
        converted_bytes = convert_doc_to_docx(file_bytes)
        if converted_bytes != file_bytes:
            file_bytes = converted_bytes
            ext = "docx"
            filename = filename + "x"
    
    # 3. Извлекаем чистый текст для ИИ-детектора
    text = await extract_text_from_file_bytes(file_bytes, filename)
    
    # 4. Инициализируем переменные результата
    html_content = ""
    format_errors = []
    label, score, chunks = "Disabled", 0.0, 0
    
    # 5. ЗАПУСКАЕМ УМНЫЙ ПАРСЕР АПАК (только для DOCX/DOC)
    if ext == "docx":
        # Наш новый парсер возвращает готовый HTML с подсветкой и список технических ошибок
        html_content, format_errors = process_docx_apak(file_bytes, settings)
        
        # Если включен нормоконтроль — добавляем семантические проверки (перевод, аннотация)
        if settings.norm_enabled:
            doc_obj = docx.Document(io.BytesIO(file_bytes))
            semantic_errors = check_semantic_rules(doc_obj, settings)
            format_errors.extend(semantic_errors)
    else:
        # Для PDF или TXT просто выводим текст в теге <pre>, чтобы сохранить пробелы
        html_content = f"<div style='white-space: pre-wrap; font-family: serif;'>{text}</div>"

    # 6. Проверка на ИИ (Детектор)
    if settings.ai_enabled:
        # run_ai_logic теперь возвращает 3 параметра (без подсветки ИИ, так как мы её убрали)
        label, score, chunks = run_ai_logic(text)
        
    # 7. Считаем страницы
    page_count = get_page_count(file_bytes, filename)

    # 8. Сохраняем итоговый результат в базу данных
    db_result = database.DetectionResult(
        text_content=text,
        html_content=html_content, # Сохраняем HTML с красной подсветкой АПАК
        filename=filename,
        label=label,
        score=float(score),
        format_errors=format_errors,
        page_count=page_count,
        owner_id=user.id
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    
    # 9. Отдаем фронтенду
    return {
        "id": db_result.id, 
        "label": label, 
        "score": score, 
        "format_errors": format_errors, 
        "html_content": html_content, 
        "page_count": page_count, 
        "filename": filename
    }

@app.get("/history")
def get_history(db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: return []
    return db.query(database.DetectionResult).filter(database.DetectionResult.owner_id == user.id).all()

# ==========================================
# ФУНКЦИИ УДАЛЕНИЯ ИСТОРИИ И АДМИН-ПАНЕЛЬ
# ==========================================

# СНАЧАЛА СТАТИЧЕСКИЙ ПУТЬ
@app.delete("/history/all")
def delete_all_my_history(db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: raise HTTPException(status_code=401)
    db.query(database.DetectionResult).filter(database.DetectionResult.owner_id == user.id).delete()
    db.commit()
    return {"message": "Вся ваша история очищена"}

# 2. ПОТОМ ПУТЬ С ПАРАМЕТРОМ
@app.delete("/history/{result_id}")
def delete_history_item(result_id: int, db: Session = Depends(get_db), user: database.User = Depends(get_current_user)):
    if not user: raise HTTPException(status_code=401)
    item = db.query(database.DetectionResult).filter(
        database.DetectionResult.id == result_id, 
        database.DetectionResult.owner_id == user.id
    ).first()
    if not item: raise HTTPException(status_code=404, detail="Скан не найден")
    db.delete(item)
    db.commit()
    return {"message": "Удалено"}

# --- ЗАЩИТА АДМИНКИ ---
def get_admin_user(user: database.User = Depends(get_current_user)):
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен. Вы не администратор.")
    return user

# Получить всех пользователей (для админки)
@app.get("/admin/users")
def admin_get_users(db: Session = Depends(get_db), admin: database.User = Depends(get_admin_user)):
    users = db.query(database.User).all()
    # Возвращаем юзеров и количество их сканов
    return[{"id": u.id, "email": u.email, "role": u.role, "scans_count": len(u.results)} for u in users]

# Создать нового админа или пользователя
@app.post("/admin/users")
def admin_create_user(email: str, password: str, role: str = "user", db: Session = Depends(get_db), admin: database.User = Depends(get_admin_user)):
    if db.query(database.User).filter(database.User.email == email).first():
        raise HTTPException(status_code=400, detail="Email занят")
    new_user = database.User(email=email, hashed_password=get_password_hash(password), role=role)
    db.add(new_user)
    db.commit()
    return {"message": f"Пользователь {email} ({role}) создан!"}

# Удалить любого пользователя (для админки)
@app.delete("/admin/users/{target_id}")
def admin_delete_user(target_id: int, db: Session = Depends(get_db), admin: database.User = Depends(get_admin_user)):
    user_to_delete = db.query(database.User).filter(database.User.id == target_id).first()
    if not user_to_delete: raise HTTPException(status_code=404)
    # Сначала удаляем все его сканы, настройки и отзывы
    db.query(database.DetectionResult).filter(database.DetectionResult.owner_id == target_id).delete()
    db.query(database.CheckSettings).filter(database.CheckSettings.owner_id == target_id).delete()
    db.delete(user_to_delete)
    db.commit()
    return {"message": "Пользователь и все его данные удалены"}

# Удалить ВСЮ историю ВООБЩЕ У ВСЕХ (кнопка паники)
@app.delete("/admin/history/wipe-all")
def admin_wipe_all_history(db: Session = Depends(get_db), admin: database.User = Depends(get_admin_user)):
    db.query(database.DetectionResult).delete()
    db.commit()
    return {"message": "Глобальная база сканов полностью очищена"}