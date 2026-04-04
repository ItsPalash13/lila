# Build (Cloud Build) + deploy static frontend to Cloud Run.
param(
  [string]$ProjectId = "lila-492319",
  [string]$Region = "asia-south1",
  [string]$Service = "lila-frontend",
  [string]$Image = "asia-south1-docker.pkg.dev/lila-492319/lila-frontend/lila-web:latest",
  [string]$NakamaHost = "nakama-255488740752.asia-south1.run.app",
  [string]$NakamaServerKey = "defaultkey"
)

$frontendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $frontendDir
try {
  gcloud builds submit . `
    --project=$ProjectId `
    --config=cloudbuild.yaml `
    --substitutions="_NAKAMA_HOST=$NakamaHost,_NAKAMA_SERVER_KEY=$NakamaServerKey"

  gcloud run deploy $Service `
    --project=$ProjectId `
    --image $Image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --port 80 `
    --min-instances 0 `
    --max-instances 10 `
    --memory 256Mi `
    --cpu 1 `
    --service-account 255488740752-compute@developer.gserviceaccount.com
}
finally {
  Pop-Location
}
