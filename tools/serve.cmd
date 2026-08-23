@echo off
setlocal

set "MAZE_BITERS_PORT=8080"
if not "%~1"=="" set "MAZE_BITERS_PORT=%~1"

pushd "%~dp0.." || exit /b 1

set "MAZE_BITERS_CODEX_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%MAZE_BITERS_CODEX_PYTHON%" goto serve_codex_python

where python >nul 2>&1
if not errorlevel 1 goto serve_python

where py >nul 2>&1
if not errorlevel 1 goto serve_py

echo Python 3 was not found. Install Python or run this project from Codex.
popd
exit /b 1

:serve_codex_python
"%MAZE_BITERS_CODEX_PYTHON%" -m http.server %MAZE_BITERS_PORT% --bind 127.0.0.1
set "MAZE_BITERS_EXIT=%ERRORLEVEL%"
popd
exit /b %MAZE_BITERS_EXIT%

:serve_python
python -m http.server %MAZE_BITERS_PORT% --bind 127.0.0.1
set "MAZE_BITERS_EXIT=%ERRORLEVEL%"
popd
exit /b %MAZE_BITERS_EXIT%

:serve_py
py -3 -m http.server %MAZE_BITERS_PORT% --bind 127.0.0.1
set "MAZE_BITERS_EXIT=%ERRORLEVEL%"
popd
exit /b %MAZE_BITERS_EXIT%
