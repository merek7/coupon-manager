FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data

EXPOSE 5000

ENV DATABASE_PATH=/data/coupons.db \
    PORT=5000

CMD ["python", "app.py"]
