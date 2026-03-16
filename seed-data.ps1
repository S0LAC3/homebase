$SUPABASE_URL = "https://rksnsohhustvxknbaxko.supabase.co"
$SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrc25zb2hodXN0dnhrbmJheGtvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzYxMDU4MSwiZXhwIjoyMDg5MTg2NTgxfQ._TYcecG_RVVGKy10rVm9j5R4zR77mEE7v1NhR69K4v0"

$HEADERS = @{
    "apikey"        = $SERVICE_KEY
    "Authorization" = "Bearer $SERVICE_KEY"
    "Content-Type"  = "application/json"
    "Prefer"        = "return=representation"
}

$USERS = @(
    @{ id = "71116702-0398-4339-8754-eb337a3f4ece"; name = "Solace" },
    @{ id = "7a8eea80-9da1-4a2c-88ed-984b8952980f"; name = "Maxabillion" }
)

foreach ($USER in $USERS) {
    Write-Host "=== Seeding data for $($USER.name) ($($USER.id)) ===" -ForegroundColor Cyan

    # --- PROPERTIES ---
    $PROPS = @(
        @{
            user_id              = $USER.id
            address              = "4821 Fremont Ave N"
            city                 = "Seattle"
            state                = "WA"
            zip                  = "98103"
            price                = 785000
            sqft                 = 1920
            bedrooms             = 3
            bathrooms            = 2.0
            hoa_monthly          = 0
            property_tax_annual  = 7850
            year_built           = 2003
            listing_url          = $null
            notes                = "Charming craftsman near Fremont. Great walkability."
        },
        @{
            user_id              = $USER.id
            address              = "312 19th Ave E"
            city                 = "Seattle"
            state                = "WA"
            zip                  = "98112"
            price                = 895000
            sqft                 = 2150
            bedrooms             = 4
            bathrooms            = 2.5
            hoa_monthly          = 0
            property_tax_annual  = 8950
            year_built           = 1998
            listing_url          = $null
            notes                = "Capitol Hill gem. Close to parks and restaurants."
        }
    )

    $propIds = @()
    foreach ($PROP in $PROPS) {
        $BODY = $PROP | ConvertTo-Json
        try {
            $RESULT = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/properties" `
                -Method POST `
                -Headers $HEADERS `
                -Body $BODY
            $propId = $RESULT[0].id
            $propIds += $propId
            Write-Host "  + Property: $($PROP.address) -> $propId" -ForegroundColor Green
        } catch {
            Write-Host "  ! Property failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # --- BUDGET ITEMS ---
    $BUDGET_ITEMS = @(
        @{
            user_id     = $USER.id
            category    = "Income"
            description = "Primary Salary"
            amount      = 9500
            is_income   = $true
        },
        @{
            user_id     = $USER.id
            category    = "Income"
            description = "Freelance / Side Income"
            amount      = 1200
            is_income   = $true
        },
        @{
            user_id     = $USER.id
            category    = "Housing"
            description = "Current Rent"
            amount      = 2200
            is_income   = $false
        },
        @{
            user_id     = $USER.id
            category    = "Utilities"
            description = "Utilities (Electric, Internet, Gas)"
            amount      = 280
            is_income   = $false
        },
        @{
            user_id     = $USER.id
            category    = "Food"
            description = "Groceries"
            amount      = 550
            is_income   = $false
        }
    )

    foreach ($ITEM in $BUDGET_ITEMS) {
        $BODY = $ITEM | ConvertTo-Json
        try {
            $RESULT = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/budget_items" `
                -Method POST `
                -Headers $HEADERS `
                -Body $BODY
            Write-Host "  + Budget: $($ITEM.description)" -ForegroundColor Green
        } catch {
            Write-Host "  ! Budget failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # --- MORTGAGE SCENARIOS ---
    $scenPrices = @(785000, 895000)
    for ($i = 0; $i -lt $propIds.Count; $i++) {
        $price = $scenPrices[$i]
        $downPct = 3.5
        $downAmt = [math]::Round($price * $downPct / 100)
        $loanAmt = $price - $downAmt
        $rate = 6.75
        $termYears = 30
        $monthlyRate = $rate / 100 / 12
        $numPayments = $termYears * 12
        $monthlyPI = [math]::Round($loanAmt * $monthlyRate * [math]::Pow(1 + $monthlyRate, $numPayments) / ([math]::Pow(1 + $monthlyRate, $numPayments) - 1), 2)
        $mip = [math]::Round($loanAmt * 0.0055 / 12, 2)
        $propTax = [math]::Round($scenPrices[$i] * 0.01 / 12, 2)
        $totalMonthly = $monthlyPI + $mip + $propTax

        $SCEN = @{
            property_id          = $propIds[$i]
            user_id              = $USER.id
            loan_type            = "FHA"
            purchase_price       = $price
            down_payment_percent = $downPct
            down_payment_amount  = $downAmt
            interest_rate        = $rate
            loan_term_years      = $termYears
            monthly_payment      = $monthlyPI
            monthly_mip_or_pmi   = $mip
            total_monthly_cost   = [math]::Round($totalMonthly, 2)
        }

        $BODY = $SCEN | ConvertTo-Json
        try {
            $RESULT = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/mortgage_scenarios" `
                -Method POST `
                -Headers $HEADERS `
                -Body $BODY
            Write-Host "  + Mortgage scenario for property $($propIds[$i])" -ForegroundColor Green
        } catch {
            Write-Host "  ! Mortgage scenario failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
}

Write-Host "Done seeding!" -ForegroundColor Yellow
