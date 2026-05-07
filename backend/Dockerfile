# Используем компактный образ Python
FROM python:3.11-slim

# 1. Устанавливаем системные зависимости
# libreoffice — замена MS Word для Linux
# libmagic1 — для определения типов файлов
RUN apt-get update && apt-get install -y \
    libreoffice \
    libmagic1 \
    gcc \
    python3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. Устанавливаем рабочую директорию
WORKDIR /app

# 3. Устанавливаем зависимости Python
COPY requirements.txt .

# ВАЖНО: Сначала устанавливаем версию Torch для CPU (она весит 150МБ вместо 2ГБ)
# Это критически важно, чтобы уложиться в лимиты памяти Railway
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# 4. Копируем остальной код бэкенда
COPY . .

# 5. Указываем порт (Railway сам прокинет нужный порт через переменную среды)
ENV PORT=8080
EXPOSE 8080

# 6. Запуск через uvicorn
# Используем заголовок --forwarded-allow-ips для работы через прокси Railway
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]