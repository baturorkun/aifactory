FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/rag /tmp/aifactory-rag
RUN python -m pip install --no-cache-dir /tmp/aifactory-rag \
    && rm -rf /tmp/aifactory-rag

COPY factory.config.json /app/factory.config.json

EXPOSE 8765

CMD ["sh", "-c", "aifactory-rag db migrate && exec aifactory-rag api start --host 0.0.0.0 --port 8765"]
