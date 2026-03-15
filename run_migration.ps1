$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrc25zb2hodXN0dnhrbmJheGtvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzYxMDU4MSwiZXhwIjoyMDg5MTg2NTgxfQ._TYcecG_RVVGKy10rVm9j5R4zR77mEE7v1NhR69K4v0"
$sql = Get-Content "C:\Users\solom\.openclaw\workspace\homebase\supabase\migrations\001_initial_schema.sql" -Raw
$headers = @{
    "apikey" = $serviceKey
    "Authorization" = "Bearer $serviceKey"
    "Content-Type" = "application/json"
}

$body = @{ query = $sql } | ConvertTo-Json -Depth 5 -Compress

try {
    $response = Invoke-RestMethod -Uri "https://rksnsohhustvxknbaxko.supabase.co/rest/v1/rpc/" -Method POST -Headers $headers -Body $body
    Write-Output "REST RPC response:"
    Write-Output $response
} catch {
    Write-Output "REST RPC failed: $($_.Exception.Message)"
    Write-Output "Status: $($_.Exception.Response.StatusCode)"
    Write-Output "Trying pg_query endpoint..."
    
    # Try the Supabase SQL query endpoint (used by dashboard)
    try {
        $headers2 = @{
            "apikey" = $serviceKey
            "Authorization" = "Bearer $serviceKey"
            "Content-Type" = "application/json"
        }
        $body2 = @{ query = $sql } | ConvertTo-Json -Depth 5 -Compress
        $response2 = Invoke-RestMethod -Uri "https://rksnsohhustvxknbaxko.supabase.co/pg/query" -Method POST -Headers $headers2 -Body $body2
        Write-Output "pg/query response:"
        Write-Output ($response2 | ConvertTo-Json -Depth 10)
    } catch {
        Write-Output "pg/query also failed: $($_.Exception.Message)"
        Write-Output "Will try Management API..."
    }
}
