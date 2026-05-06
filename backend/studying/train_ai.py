import ollama
import pandas as pd
import os
from datasets import load_from_disk
import time

# Пути
DATASET_PATH = 'studying/my_50k_dataset'
OUTPUT_FILE = 'ai_dataset_50k_final.csv'

ds = load_from_disk(DATASET_PATH)

def get_clean_ai_text(title):
    # Промпт стал лаконичнее, чтобы не тратить токены на инструкции
    prompt = f"Напиши большую академическую статью на тему: {title}. Только текст статьи, без вступлений и советов. Не пиши что ты что-то можешь или не можешь, чистый текст без твоих комментариев."
    
    response = ollama.chat(
        model='llama3.1:8b', # Сменили модель
        messages=[{'role': 'user', 'content': prompt}],
        options={
            'temperature': 0.8,  # Стабильнее = быстрее
            'top_k': 40
        }
    )
    return response['message']['content'].strip()

# Проверка прогресса
if os.path.exists(OUTPUT_FILE):
    existing_df = pd.read_csv(OUTPUT_FILE)
    start_index = len(existing_df)
else:
    start_index = 0
    pd.DataFrame(columns=['text', 'label']).to_csv(OUTPUT_FILE, index=False)

print(f"Начинаем с индекса {start_index}...")

for i in range(start_index, 10000):
    try:
        # Берем тему
        topic = ds[i]['text'][:100]
        text = get_clean_ai_text(topic)
        
        # Дополнительная проверка на мусор в Llama 3.1 (она может писать на англ, если промпт на англ)
        # Если модель начала писать не по-русски, лучше пропустить
        if len(text) > 900:
            new_row = pd.DataFrame({'text': [text], 'label': [1]})
            new_row.to_csv(OUTPUT_FILE, mode='a', header=False, index=False)
            
        if i % 5 == 0:
            print(f"Готово: {i}/10000. Последний текст: {text[:50]}...")
            
    except Exception as e:
        print(f"Ошибка на {i}: {e}")
        time.sleep(5) # Пауза при ошибке