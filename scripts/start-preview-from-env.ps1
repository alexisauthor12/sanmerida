$line = Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) {
  Write-Error 'DATABASE_URL no encontrado en .env.local'
  exit 1
}
$db = $line.Split('=', 2)[1].Trim('"')
$env:DATABASE_URL = $db
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = $db
npm run preview:cf
