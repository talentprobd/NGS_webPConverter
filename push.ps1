# NGS Convert — Build, commit, and push to GitHub
# Usage: .\push.ps1 "your commit message"
param(
    [string]$Message = "Update NGS Convert"
)

Write-Host "Building..." -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed, aborting push." -ForegroundColor Red; exit 1 }

Write-Host "Staging changes..." -ForegroundColor Cyan
git add .

$status = git status --porcelain
if (-not $status) {
    Write-Host "Nothing to commit." -ForegroundColor Yellow
    exit 0
}

Write-Host "Committing: $Message" -ForegroundColor Cyan
git commit -m $Message

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "Pushed! GitHub Actions will deploy to Pages automatically." -ForegroundColor Green
} else {
    Write-Host "Push failed. Make sure you have set the remote:" -ForegroundColor Red
    Write-Host "  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git" -ForegroundColor Yellow
}
