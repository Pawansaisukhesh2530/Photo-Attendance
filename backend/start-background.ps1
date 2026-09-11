param([int]$Port = 8010)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Backend environment is missing. Install it first." }
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot "data") -Force | Out-Null
$env:EDUTRACE_ENV = "development"
$env:EDUTRACE_CORS_ORIGINS = "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
$dataRoot = Join-Path $PSScriptRoot "data"
$env:EDUTRACE_STORAGE_BACKEND = "local"
$env:EDUTRACE_LOCAL_STORAGE_PATH = (Join-Path $dataRoot "private")
$env:EDUTRACE_QUEUE_BACKEND = "local"
$env:EDUTRACE_RECOGNITION_BACKEND = "insightface"
$env:EDUTRACE_INSIGHTFACE_ROOT = "models\insightface"
$env:EDUTRACE_MIN_ATTENDANCE_FACE_SIZE = "32"
$env:EDUTRACE_MATCH_THRESHOLD = "0.50"
$env:EDUTRACE_MIN_ENROLMENT_IMAGES = "1"
$env:EDUTRACE_PGVECTOR_ENABLED = "false"

& $python -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
& $python -m app.seed --email admin@christuniversity.in --password LocalTest123!
if ($LASTEXITCODE -ne 0) { throw "Administrator seed failed." }
& $python -m app.download_models
if ($LASTEXITCODE -ne 0) { throw "Model download failed." }

$existing = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "API already listening on port $Port (PID $($existing.OwningProcess))."
  exit 0
}

$api = Start-Process -FilePath $python -ArgumentList "-m","uvicorn","app.main:app","--host","0.0.0.0","--port",$Port -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
$worker = Start-Process -FilePath $python -ArgumentList "-m","app.local_worker" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
Write-Output "API PID $($api.Id); worker PID $($worker.Id)."
