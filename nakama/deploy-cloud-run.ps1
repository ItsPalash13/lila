# Deploy Lila Nakama to Cloud Run (image must already be in Artifact Registry).
# Prereqs in project lila-492319: Artifact Registry repo `nakama`, Cloud SQL instance
# `lila-nakama-db` (asia-south1), database `nakama`, Secret `lila-nakama-postgres`,
# and IAM: default compute SA → roles/cloudsql.client + secretAccessor on that secret.

param(
  [string]$ProjectId = "lila-492319",
  [string]$Region = "asia-south1",
  [string]$Image = "asia-south1-docker.pkg.dev/lila-492319/nakama/nakama:latest",
  [string]$Service = "nakama",
  [string]$CloudSqlInstance = "lila-492319:asia-south1:lila-nakama-db",
  [string]$ComputeSa = "255488740752-compute@developer.gserviceaccount.com"
)

gcloud run deploy $Service `
  --project=$ProjectId `
  --image $Image `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 7350 `
  --min-instances 1 `
  --max-instances 1 `
  --memory 1Gi `
  --cpu 1 `
  --timeout 3600 `
  --add-cloudsql-instances $CloudSqlInstance `
  --set-env-vars "CLOUDSQL_CONNECTION_NAME=$CloudSqlInstance,POSTGRES_USER=postgres,POSTGRES_DB=nakama" `
  --set-secrets "POSTGRES_PASSWORD=lila-nakama-postgres:latest" `
  --service-account $ComputeSa
