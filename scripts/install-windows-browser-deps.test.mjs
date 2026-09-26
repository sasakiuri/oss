// SPDX-License-Identifier: MIT
// cspell:ignore pscustomobject LASTEXITCODE isnot
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(
  new URL("./install-windows-browser-deps.ps1", import.meta.url),
);

// All host operations are mocked before loading the script. Parameters and paths
// travel as arguments/environment values, never as interpolated PowerShell code.
const fixture = String.raw`
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$global:fixtureCase = $env:NILAY_WINDOWS_DEPS_TEST_CASE
$global:fixtureCalls = New-Object 'System.Collections.Generic.List[string]'
$global:fixtureFeatureQueries = 0

function Assert-Parameters {
    param($Parameters, [string]$Parameter, [string]$Expected)
    if ($Parameters[$Parameter] -ne $Expected -or $Parameters['ErrorAction'] -ne 'Stop') {
        throw "Unexpected provisioning parameters for $Parameter."
    }
}

function Get-CimInstance {
    [CmdletBinding()]
    param([string]$ClassName)
    Assert-Parameters $PSBoundParameters 'ClassName' 'Win32_OperatingSystem'
    $global:fixtureCalls.Add('host')
    switch ($global:fixtureCase) {
        'host-throws' { throw 'fixture host query failed' }
        'unsupported-host' { return [pscustomobject]@{ ProductType = 1 } }
        'missing-host' { return }
        'malformed-host' { return [pscustomobject]@{ Caption = 'fixture' } }
    }
    return [pscustomobject]@{ ProductType = 3 }
}

function Get-WindowsFeature {
    [CmdletBinding()]
    param([string]$Name)
    Assert-Parameters $PSBoundParameters 'Name' 'Server-Media-Foundation'
    $global:fixtureCalls.Add('query')
    $global:fixtureFeatureQueries++
    switch ($global:fixtureCase) {
        'query-throws' { throw 'fixture feature query failed' }
        'query-writes-error' { Write-Error 'fixture feature query error' }
        'missing-feature' { return }
        'wrong-feature' { return [pscustomobject]@{ Name = 'Other-Feature'; Installed = $true } }
        'duplicate-feature' {
            return @(
                [pscustomobject]@{ Name = $Name; Installed = $true },
                [pscustomobject]@{ Name = $Name; Installed = $true }
            )
        }
        'missing-installed' { return [pscustomobject]@{ Name = $Name } }
        'string-installed' { return [pscustomobject]@{ Name = $Name; Installed = 'true' } }
        'null-installed' { return [pscustomobject]@{ Name = $Name; Installed = $null } }
    }
    if ($global:fixtureFeatureQueries -gt 1) {
        switch ($global:fixtureCase) {
            'recheck-throws' { throw 'fixture verification failed' }
            'recheck-missing' { return }
            'recheck-false' { return [pscustomobject]@{ Name = $Name; Installed = $false } }
            'recheck-string' { return [pscustomobject]@{ Name = $Name; Installed = 'true' } }
        }
    }
    $installed = $global:fixtureCase -eq 'already-installed' -or $global:fixtureFeatureQueries -gt 1
    return [pscustomobject]@{ Name = $Name; Installed = $installed }
}

function Install-WindowsFeature {
    [CmdletBinding()]
    param([string]$Name)
    Assert-Parameters $PSBoundParameters 'Name' 'Server-Media-Foundation'
    $global:fixtureCalls.Add('install')
    switch ($global:fixtureCase) {
        'install-throws' { throw 'fixture installation failed' }
        'install-writes-error' { Write-Error 'fixture installation error' }
        'install-false' { return [pscustomobject]@{ Success = $false; RestartNeeded = 'No' } }
        'install-string-success' { return [pscustomobject]@{ Success = 'true'; RestartNeeded = 'No' } }
        'install-missing-success' { return [pscustomobject]@{ RestartNeeded = 'No' } }
        'install-no-result' { return }
        'install-duplicate-result' {
            return @(
                [pscustomobject]@{ Success = $true; RestartNeeded = 'No' },
                [pscustomobject]@{ Success = $true; RestartNeeded = 'No' }
            )
        }
        'reboot-required' { return [pscustomobject]@{ Success = $true; RestartNeeded = 'Yes' } }
        'reboot-unknown' { return [pscustomobject]@{ Success = $true; RestartNeeded = 'Maybe' } }
        'reboot-missing' { return [pscustomobject]@{ Success = $true } }
    }
    return [pscustomobject]@{ Success = $true; RestartNeeded = 'No' }
}

function Get-Command {
    [CmdletBinding()]
    param([string[]]$Name)
    if ($global:fixtureCase -eq 'missing-command') { throw 'fixture ServerManager unavailable' }
    Microsoft.PowerShell.Core\Get-Command @PSBoundParameters
}

function Write-Trace {
    Write-Output ('TRACE:' + (ConvertTo-Json -InputObject @($global:fixtureCalls.ToArray()) -Compress))
}

if ($env:NILAY_WINDOWS_DEPS_TEST_MODE -eq 'entry') {
    & $env:NILAY_WINDOWS_DEPS_TEST_SCRIPT
    $status = $LASTEXITCODE
    Write-Trace
    exit $status
}

. $env:NILAY_WINDOWS_DEPS_TEST_SCRIPT
if ($global:fixtureCalls.Count -ne 0) { throw 'Dot-sourcing performed host operations.' }
Write-Output 'SOURCE:No host operations'

foreach ($case in ($env:NILAY_WINDOWS_DEPS_TEST_CASES | ConvertFrom-Json)) {
    $global:fixtureCase = $case
    $global:fixtureCalls.Clear()
    $global:fixtureFeatureQueries = 0
    $outcome = [ordered]@{ Scenario = $case; Success = $false; Installed = $false; Calls = @(); Error = '' }
    try {
        $result = Install-WindowsBrowserDependencies
        if ($result.Name -ne 'Server-Media-Foundation' -or
            $result.Installed -isnot [bool] -or -not $result.Installed) {
            throw 'Provisioning did not return confirmed Installed=true.'
        }
        $outcome.Success = $true
        $outcome.Installed = $true
    }
    catch {
        $outcome.Error = $_.Exception.Message
    }
    $outcome.Calls = @($global:fixtureCalls.ToArray())
    Write-Output ('CASE:' + (ConvertTo-Json -InputObject $outcome -Compress))
}
exit 0
`;

test(
  "Windows PowerShell provisions browser dependencies and fails closed",
  {
    skip:
      process.platform !== "win32" &&
      "Windows PowerShell 5.1 execution requires a Windows runner",
  },
  async (t) => {
    // Spaces, apostrophes, dollar signs, and semicolons must remain literal paths.
    const directory = mkdtempSync(
      join(tmpdir(), "windows browser deps ' $ ; "),
    );
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const fixturePath = join(directory, "mock feature cmdlets.ps1");
    writeFileSync(fixturePath, fixture);

    function run(scenario, cases = []) {
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          fixturePath,
        ],
        {
          shell: false,
          encoding: "utf8",
          timeout: 30_000,
          env: {
            ...process.env,
            NILAY_WINDOWS_DEPS_TEST_SCRIPT: scriptPath,
            NILAY_WINDOWS_DEPS_TEST_CASE: scenario,
            NILAY_WINDOWS_DEPS_TEST_MODE: cases.length ? "batch" : "entry",
            NILAY_WINDOWS_DEPS_TEST_CASES: JSON.stringify(cases),
          },
        },
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      return result;
    }

    const successCases = [
      ["already-installed", ["host", "query"]],
      ["install-success", ["host", "query", "install", "query"]],
    ];

    const failureCases = [
      ["host-throws", ["host"]],
      ["unsupported-host", ["host"]],
      ["missing-host", ["host"]],
      ["malformed-host", ["host"]],
      ["missing-command", ["host"]],
      ...[
        "query-throws",
        "query-writes-error",
        "missing-feature",
        "wrong-feature",
        "duplicate-feature",
        "missing-installed",
        "string-installed",
        "null-installed",
      ].map((scenario) => [scenario, ["host", "query"]]),
      ...[
        "install-throws",
        "install-writes-error",
        "install-false",
        "install-string-success",
        "install-missing-success",
        "install-no-result",
        "install-duplicate-result",
        "reboot-required",
        "reboot-unknown",
        "reboot-missing",
      ].map((scenario) => [scenario, ["host", "query", "install"]]),
      ...[
        "recheck-throws",
        "recheck-missing",
        "recheck-false",
        "recheck-string",
      ].map((scenario) => [scenario, ["host", "query", "install", "query"]]),
    ];

    // Share one PowerShell session for function cases to keep pre-install tests fast.
    const cases = [...successCases, ...failureCases];
    const batch = run(
      "batch",
      cases.map(([scenario]) => scenario),
    );
    assert.equal(batch.status, 0, batch.stdout + batch.stderr);
    assert.match(batch.stdout, /^SOURCE:No host operations\r?$/m);
    const outcomes = [...batch.stdout.matchAll(/^CASE:(.*)$/gm)].map((match) =>
      JSON.parse(match[1]),
    );
    assert.equal(outcomes.length, cases.length, batch.stdout + batch.stderr);
    for (const [index, [scenario, calls]] of cases.entries()) {
      await t.test(scenario, () => {
        const outcome = outcomes[index];
        const success = index < successCases.length;
        assert.equal(outcome.Scenario, scenario);
        assert.equal(outcome.Success, success, outcome.Error);
        assert.equal(outcome.Installed, success);
        assert.deepEqual(outcome.Calls, calls);
        assert.equal(outcome.Error === "", success);
      });
    }

    for (const [scenario, calls] of successCases) {
      await t.test(`the executable entry point succeeds: ${scenario}`, () => {
        const result = run(scenario);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const trace = result.stdout.match(/^TRACE:(.*)$/m);
        assert.ok(trace, result.stdout + result.stderr);
        assert.deepEqual(JSON.parse(trace[1]), calls);
        assert.match(
          result.stdout,
          /Verified Server-Media-Foundation Installed=true/,
        );
      });
    }

    await t.test("the executable entry point exits nonzero on failure", () => {
      const result = run("install-false");
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const trace = result.stdout.match(/^TRACE:(.*)$/m);
      assert.ok(trace, result.stdout + result.stderr);
      assert.deepEqual(JSON.parse(trace[1]), ["host", "query", "install"]);
      assert.match(
        result.stderr,
        /Windows browser dependency provisioning failed/,
      );
      assert.doesNotMatch(result.stdout, /Verified/);
    });
  },
);
