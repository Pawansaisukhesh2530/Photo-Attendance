param(
  [string]$Python = "$PSScriptRoot\.venv\Scripts\python.exe"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path $Python)) { throw "Python environment not found at $Python." }
& $Python -m pip uninstall -y onnxruntime
& $Python -m pip install --upgrade --force-reinstall "onnxruntime-gpu[cuda,cudnn]"
if ($LASTEXITCODE -ne 0) { throw "ONNX Runtime GPU installation failed." }
& $Python -m app.download_models
if ($LASTEXITCODE -ne 0) { throw "InsightFace CUDA provider verification failed." }
