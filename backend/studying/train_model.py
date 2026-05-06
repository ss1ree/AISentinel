import torch
import pandas as pd
from transformers import (
    AutoTokenizer, 
    AutoModelForSequenceClassification, 
    EarlyStoppingCallback, 
    Trainer, 
    TrainingArguments
)
from datasets import Dataset
import numpy as np
from sklearn.metrics import accuracy_score, f1_score

# 1. Загрузка и подготовка данных
# Важно: если файл несбалансирован, лучше сделать random_sample, 
# чтобы кол-во ИИ и людей было примерно 1:1
df = pd.read_csv("balanced_dataset.csv")

# Балансировка: берем равное количество (например, по 2000 каждого)
df_ai = df[df['label'] == 1].sample(n=2000, random_state=42)
df_human = df[df['label'] == 0].sample(n=2000, random_state=42)
df = pd.concat([df_ai, df_human]).sample(frac=1).reset_index(drop=True)

dataset = Dataset.from_pandas(df).train_test_split(test_size=0.1)

model_name = "kazzand/ru-longformer-base-4096"
tokenizer = AutoTokenizer.from_pretrained(model_name)

# 2. Токенизация
def tokenize_func(batch):
    return tokenizer(
        batch["text"], 
        padding="max_length", 
        truncation=True, 
        max_length=4096
    )

tokenized_datasets = dataset.map(tokenize_func, batched=True, remove_columns=["text"])

# 3. Метрики (добавил F1-score для надежности)
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, predictions)
    f1 = f1_score(labels, predictions, average='binary')
    return {"accuracy": acc, "f1": f1}

# 4. Модель
model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

# 5. Оптимизированные параметры обучения для 6GB VRAM
training_args = TrainingArguments(
    output_dir="./ai_sentinel_results",
    
    # --- Стратегия обучения ---
    num_train_epochs=10,
    learning_rate=1e-5,               
    weight_decay=0.01,
    warmup_steps=200,
    
    # --- Экономия памяти (КРИТИЧНО ДЛЯ 6GB) ---
    per_device_train_batch_size=1,    # Обязательно 1
    gradient_accumulation_steps=16,   # Итоговый batch size = 16
    gradient_checkpointing=True,      # Включает экономию VRAM
    fp16=True,                        # Аппаратное ускорение (требует CUDA)
    
    # --- Оценка и сохранение ---
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1",       # F1 лучше отражает баланс классов
    
    logging_steps=20,
    report_to="none",
    dataloader_pin_memory=False
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_datasets["train"],
    eval_dataset=tokenized_datasets["test"],
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=3)] 
)

print("Начинаю обучение на RTX 4050...")
trainer.train()

# 6. Сохранение
model.save_pretrained("./studying/ai_sentinel_model")
tokenizer.save_pretrained("./studying/ai_sentinel_model")
print("Модель успешно обучена и сохранена!")