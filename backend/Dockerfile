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
# 5022 = IEC 60870-5-104, 5023 = Modbus (Pipeline), 5025/udp = Serial gateway (Lift Station)
EXPOSE 8000 5020 5021/udp 5022 5023 5025/udp

CMD ["python", "main.py"]
