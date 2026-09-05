param(
  [string]$Python = "$env:TEMP\edutrace-backend-venv\Scripts\python.exe",
  [int]$Port = 8000
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path $Python)) { throw "Python environment not found at $Python. See README.md." }
$env:EDUTRACE_ENV = "development"
$env:EDUTRACE_TESTER_ENABLED = "true"
$dataRoot = Join-Path $env:TEMP "edutrace-local"
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$databaseFile = (Join-Path $dataRoot "edutrace.db").Replace("\", "/")
$env:EDUTRACE_DATABASE_URL = "sqlite:///$databaseFile"
$env:EDUTRACE_STORAGE_BACKEND = "local"
$env:EDUTRACE_LOCAL_STORAGE_PATH = (Join-Path $dataRoot "private")
$env:EDUTRACE_QUEUE_BACKEND = "local"
$env:EDUTRACE_RECOGNITION_BACKEND = "opencv"
$env:EDUTRACE_YUNET_MODEL_PATH = "models/face_detection_yunet.onnx"
$env:EDUTRACE_SFACE_MODEL_PATH = "models/face_recognition_sface.onnx"
$env:EDUTRACE_MODEL_VERSION = "opencv-yunet-sface-local-v3"
$env:EDUTRACE_MATCH_THRESHOLD = "0.50"
$worker = Start-Process -FilePath $Python -ArgumentList "-m","app.local_worker" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try {
  & $Python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
} finally {
  Stop-Process -Id $worker.Id -ErrorAction SilentlyContinue
}
