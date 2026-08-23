$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) { throw 'Python 3 is required to run the local static server.' }
Set-Location -LiteralPath $projectRoot
if ($python.Name -eq 'py.exe') {
  & $python.Source -3 -m http.server 8080 --bind 127.0.0.1
} else {
  & $python.Source -m http.server 8080 --bind 127.0.0.1
}
