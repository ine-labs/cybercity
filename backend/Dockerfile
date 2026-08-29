FROM python:3.11-slim

WORKDIR /app

# Install SNMP tools for Scenario 2
RUN apt-get update && apt-get install -y --no-install-recommends \
    snmp \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 8000 = FastAPI/WebSocket, 5020 = Modbus, 5021/udp = SNMP,
# 5022 = IEC 61850, 5023 = DNP3
EXPOSE 8000 5020 5021/udp 5022 5023

CMD ["python", "main.py"]
