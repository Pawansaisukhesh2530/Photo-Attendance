param(
  [string]$User = "postgres",
  [string]$Password = $env:PGPASSWORD,
  [string]$Database = "edutrace",
  [int]$Port = 8010,
  [string]$Python = "$PSScriptRoot\.venv\Scripts\python.exe",
  [string]$BindAddress = "0.0.0.0"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path $Python)) { throw "Python environment not found at $Python. See README.md." }
if (-not $Password) { $Password=Read-Host "PostgreSQL password" -MaskInput }
$escapedUser=[Uri]::EscapeDataString($User);$escapedPassword=[Uri]::EscapeDataString($Password)
$env:EDUTRACE_ENV="development"
$env:EDUTRACE_CORS_ORIGINS="http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
$env:EDUTRACE_DATABASE_URL="postgresql+psycopg://${escapedUser}:${escapedPassword}@127.0.0.1:5432/$Database"
$env:EDUTRACE_PGVECTOR_ENABLED="false"
$env:EDUTRACE_STORAGE_BACKEND="local"
$env:EDUTRACE_LOCAL_STORAGE_PATH=(Join-Path $PSScriptRoot "data\private")
$env:EDUTRACE_QUEUE_BACKEND="local"
$env:EDUTRACE_RECOGNITION_BACKEND="opencv"
$env:EDUTRACE_YUNET_MODEL_PATH="models/face_detection_yunet.onnx"
$env:EDUTRACE_SFACE_MODEL_PATH="models/face_recognition_sface.onnx"
$env:EDUTRACE_MODEL_VERSION="opencv-yunet-sface-local-v3"
$env:EDUTRACE_MATCH_THRESHOLD="0.50"
& $Python -m app.ensure_postgres --user $User --password $Password --database $Database
& $Python -m alembic upgrade head
& $Python -m app.seed --email admin@example.edu --password LocalTest123!
& $Python -m app.seed --demo --password LocalTest123!
$worker=Start-Process -FilePath $Python -ArgumentList "-m","app.local_worker" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try { & $Python -m uvicorn app.main:app --host $BindAddress --port $Port }
finally { Stop-Process -Id $worker.Id -ErrorAction SilentlyContinue }
