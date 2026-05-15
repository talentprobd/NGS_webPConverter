# NGS Convert — Production build
# Usage: .\build.ps1
Write-Host "Building NGS Convert for production..." -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build complete! Output is in /docs (ready for GitHub Pages)" -ForegroundColor Green
} else {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
