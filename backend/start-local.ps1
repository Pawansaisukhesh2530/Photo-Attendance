param(
  [string]$Python = "$PSScriptRoot\.venv\Scripts\python.exe",
  [int]$Port = 8010,
  [string]$BindAddress = "0.0.0.0"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path $Python)) { throw "Python environment not found at $Python. See README.md." }
$env:EDUTRACE_ENV = "development"
$env:EDUTRACE_CORS_ORIGINS = "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
$dataRoot = Join-Path $PSScriptRoot "data"
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$env:EDUTRACE_STORAGE_BACKEND = "local"
$env:EDUTRACE_LOCAL_STORAGE_PATH = (Join-Path $dataRoot "private")
$env:EDUTRACE_QUEUE_BACKEND = "local"
$env:EDUTRACE_RECOGNITION_BACKEND = "opencv"
$env:EDUTRACE_YUNET_MODEL_PATH = "models/face_detection_yunet.onnx"
$env:EDUTRACE_SFACE_MODEL_PATH = "models/face_recognition_sface.onnx"
$env:EDUTRACE_MODEL_VERSION = "opencv-yunet-sface-local-v3"
$env:EDUTRACE_MATCH_THRESHOLD = "0.50"
$env:EDUTRACE_PGVECTOR_ENABLED = "false"
& $Python -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
& $Python -m app.seed --email admin@example.edu --password LocalTest123!
if ($LASTEXITCODE -ne 0) { throw "Administrator seed failed." }
& $Python -m app.seed --demo --password LocalTest123!
if ($LASTEXITCODE -ne 0) { throw "Demo seed failed." }
$worker = Start-Process -FilePath $Python -ArgumentList "-m","app.local_worker" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try {
  & $Python -m uvicorn app.main:app --host $BindAddress --port $Port
} finally {
  Stop-Process -Id $worker.Id -ErrorAction SilentlyContinue
}
