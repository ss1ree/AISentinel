FROM python:3.11-slim

# Устанавливаем системные зависимости: LibreOffice для конвертации и зависимости для работы с документами
RUN apt-get update && apt-get install -y \
    libreoffice \
    libmagic1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем и устанавливаем зависимости Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --index-url https://download.pytorch.org/whl/cpu

# Копируем весь код проекта
COPY . .

# Команда для запуска сервера
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]