# SPDX-License-Identifier: MIT
# Prepare Playwright's expensive Windows Server prerequisite alongside npm ci.
# Playwright's normal --with-deps provisioning still runs afterward.
function Install-WindowsBrowserDependencies {
    [CmdletBinding()]
    param()

    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $featureName = 'Server-Media-Foundation'

    $operatingSystems = @(Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop)
    if ($operatingSystems.Count -ne 1 -or $operatingSystems[0].ProductType -ne 3) {
        throw 'Windows browser dependency provisioning requires Windows Server (ProductType 3).'
    }

    # Command discovery also fails explicitly when ServerManager is unavailable.
    Get-Command -Name Get-WindowsFeature, Install-WindowsFeature -ErrorAction Stop | Out-Null

    function Get-MediaFoundationFeature {
        $features = @(Get-WindowsFeature -Name $featureName -ErrorAction Stop)
        if ($features.Count -ne 1 -or $features[0].Name -ne $featureName -or
            $features[0].Installed -isnot [bool]) {
            throw "Expected exactly one $featureName record with a boolean Installed state."
        }
        return $features[0]
    }

    $feature = Get-MediaFoundationFeature
    if (-not $feature.Installed) {
        Write-Host "Installing $featureName."
        # Use the runner's existing permissions. Never elevate or request restart.
        $results = @(Install-WindowsFeature -Name $featureName -ErrorAction Stop)
        if ($results.Count -ne 1 -or $results[0].Success -isnot [bool] -or
            -not $results[0].Success) {
            throw "Installing $featureName did not report Success=true."
        }
        # Do not report preparation as complete on a host requiring a reboot or
        # without an installed feature; later browser checks cannot repair that state.
        if ([string]$results[0].RestartNeeded -ne 'No') {
            throw "Installing $featureName did not confirm that no reboot is required."
        }

        $feature = Get-MediaFoundationFeature
        if (-not $feature.Installed) {
            throw "$featureName was not Installed after provisioning."
        }
    }

    Write-Host "Verified $featureName Installed=true."
    return [pscustomobject]@{ Name = $featureName; Installed = $true }
}

# Dot-sourcing defines the function without inspecting or modifying the host.
if ($MyInvocation.InvocationName -ne '.') {
    try {
        Install-WindowsBrowserDependencies | Out-Null
        exit 0
    }
    catch {
        [Console]::Error.WriteLine("Windows browser dependency provisioning failed: $($_.Exception.Message)")
        exit 1
    }
}
