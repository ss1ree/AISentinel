# Используем компактный образ Python
FROM python:3.11-slim

# 1. Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    libreoffice \
    libmagic1 \
    gcc \
    python3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. Создаем пользователя для Hugging Face (UID 1000)
# Это защитит от ошибок "Permission Denied" при работе Transformers/Torch
RUN useradd -m -u 1000 user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

# 3. Устанавливаем зависимости Python
COPY requirements.txt .

# Сначала устанавливаем версию Torch для CPU (критично для экономии памяти на HF Spaces)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Сразу создаем папки под кэш моделей в доступном для пользователя месте
RUN mkdir -p /tmp/huggingface_cache /tmp/sentence_transformers_cache && chmod -R 777 /tmp

# 4. Копируем остальной код бэкенда и передаем права пользователю user
COPY --chown=user:user . .

# Переключаемся на безопасного пользователя
USER user

# 5. Указываем порт для Hugging Face (ОБЯЗАТЕЛЬНО 7860)
ENV PORT=7860
EXPOSE 7860

# 6. Запуск через uvicorn на порту 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 7860"]