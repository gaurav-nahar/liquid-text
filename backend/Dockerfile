# 1. Base image (Python use karenge)
FROM python:3.13.9
# 2. Working directory set karenge
WORKDIR /app
# 3. Pehle requirements copy karke install karenge (cache optimize karne ke liye)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# 4. Baaki saara backend code copy karenge
COPY . .
# 5. FastAPI kis port pe chalega
EXPOSE 8000
# 6. Command run karne ke liye
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]