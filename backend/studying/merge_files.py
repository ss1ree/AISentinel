import pandas as pd
from datasets import load_from_disk
import os

# Пути
HUMAN_DATASET_PATH = 'studying/my_50k_dataset'
AI_CSV_PATH = 'ai_dataset_50k_final.csv'
OUTPUT_FILE = 'final_detector_dataset.csv'

def clean_ai_text(text):
    # Убираем явный мусор, который мы видели на скриншоте
    bad_phrases = ["Контекст:", "Продолжение статьи:", "Напиши статью"]
    for phrase in bad_phrases:
        if phrase in text:
            # Если текст содержит промпт, берем только то, что идет ПОСЛЕ промпта
            text = text.split(phrase)[0] 
    return text.strip()

def process():
    # --- 1. Обработка человеческих текстов ---
    print("Загрузка человеческих текстов...")
    ds = load_from_disk(HUMAN_DATASET_PATH)
    # Берем 6143 записи
    human_df = ds.select(range(9276)).to_pandas()[['text']]
    human_df['label'] = 0
    
    # --- 2. Обработка ИИ текстов ---
    print("Загрузка и очистка ИИ текстов...")
    # Читаем CSV. Если он "битый", используем on_bad_lines='skip'
    ai_df = pd.read_csv(AI_CSV_PATH, on_bad_lines='skip')
    
    # Очистка текста
    ai_df['text'] = ai_df['text'].apply(clean_ai_text)
    
    # Оставляем только те, что длиннее 300 символов (убираем обрывки)
    ai_df = ai_df[ai_df['text'].str.len() > 300]
    
    # Берем ровно 6143 записи
    ai_df = ai_df.head(9276)[['text', 'label']]
    
    # --- 3. Объединение ---
    print(f"Человек: {len(human_df)}, ИИ: {len(ai_df)}")
    final_df = pd.concat([human_df, ai_df], ignore_index=True)
    final_df = final_df.sample(frac=1).reset_index(drop=True)
    
    final_df.to_csv(OUTPUT_FILE, index=False)
    print(f"Готово! Датасет сохранен в {OUTPUT_FILE}")
    print(len(final_df))

if __name__ == "__main__":
    process()