FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data

EXPOSE 5076

ENV DATABASE_PATH=/data/coupons.db \
    PORT=5076

CMD ["gunicorn", "--bind", "0.0.0.0:5076", "--workers", "2", "--timeout", "120", "app:app"]
