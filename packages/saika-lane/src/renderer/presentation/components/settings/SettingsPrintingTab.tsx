// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { reportService } from '@/renderer/services/reportService';
import { settingsService } from '@/renderer/services/settingsService';
import { PrintSettingsSchema, type PrinterDto, type PrintSettingsDto } from '@/shared/ipc/contracts';

const inputClass = 'w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100';
const buttonClass = 'rounded bg-zinc-700 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50';

export function SettingsPrintingTab() {
  const [settings, setSettings] = useState<PrintSettingsDto | null>(null);
  const [printers, setPrinters] = useState<PrinterDto[]>([]);
  const [refreshing, setRefreshing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([settingsService.getAppSettings(), reportService.listPrinters()]).then(
      ([document, list]) => {
        if (cancelled) return;
        if (document.status === 'fulfilled') setSettings(PrintSettingsSchema.parse(document.value.printing ?? {}));
        else setError('Failed to load printing settings. Close Settings and try again.');
        if (list.status === 'fulfilled') setPrinters(list.value);
        else setPrinterError('Failed to load printers. Check the system printer settings and refresh.');
        setRefreshing(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setPrinterError(null);
    try {
      setPrinters(await reportService.listPrinters());
    } catch {
      setPrinters([]);
      setPrinterError('Failed to load printers. Check the system printer settings and refresh.');
    } finally {
      setRefreshing(false);
    }
  };

  const update = (patch: Partial<PrintSettingsDto>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setSaved(false);
    setError(null);
  };
  const missingPrinter = !!settings?.deviceName && !printers.some((printer) => printer.name === settings.deviceName);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await settingsService.savePrintSettings(PrintSettingsSchema.parse(settings));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save printing settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 p-4 text-sm text-zinc-300">
      <p>
        Select a printer to print immediately from Print or Numpad 9. Choose Preview to use the print dialog each time.
      </p>
      <div className="flex items-center justify-between gap-2">
        <span>System printers</span>
        <button type="button" onClick={refresh} disabled={refreshing || saving} className={buttonClass}>
          {refreshing ? 'Loading printers...' : 'Refresh Printers'}
        </button>
      </div>
      {printerError && (
        <p role="alert" className="text-red-400">
          {printerError}
        </p>
      )}
      {!refreshing && !printerError && printers.length === 0 && (
        <p>No printers found. Add a printer in the system settings, then refresh.</p>
      )}
      {settings && (
        <fieldset disabled={saving || refreshing} className="space-y-4 disabled:opacity-50">
          <div className="block space-y-1">
            <label htmlFor="print-printer">Printer</label>
            <select
              id="print-printer"
              value={settings.deviceName}
              onChange={(event) => update({ deviceName: event.target.value })}
              className={inputClass}
            >
              <option value="">Preview (choose printer each time)</option>
              {missingPrinter && <option value={settings.deviceName}>{settings.deviceName} (unavailable)</option>}
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.displayName || printer.name}
                </option>
              ))}
            </select>
          </div>
          {missingPrinter && (
            <p role="alert" className="text-amber-300">
              The saved printer is unavailable. Select a printer or refresh the list.
            </p>
          )}
          <fieldset disabled={!settings.deviceName} className="grid grid-cols-2 gap-4 disabled:opacity-50">
            <div className="space-y-1">
              <label htmlFor="print-paper">Paper Size</label>
              <select
                id="print-paper"
                value={settings.pageSize}
                onChange={(event) => update({ pageSize: PrintSettingsSchema.shape.pageSize.parse(event.target.value) })}
                className={inputClass}
              >
                {PrintSettingsSchema.shape.pageSize.removeDefault().options.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="print-orientation">Orientation</label>
              <select
                id="print-orientation"
                value={String(settings.landscape)}
                onChange={(event) => update({ landscape: event.target.value === 'true' })}
                className={inputClass}
              >
                <option value="false">Portrait</option>
                <option value="true">Landscape</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="print-copies">Copies</label>
              <input
                id="print-copies"
                type="number"
                min="1"
                max="99"
                step="1"
                required
                value={settings.copies}
                onChange={(event) => update({ copies: Number(event.target.value) })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="print-color">Color</label>
              <select
                id="print-color"
                value={String(settings.color)}
                onChange={(event) => update({ color: event.target.value === 'true' })}
                className={inputClass}
              >
                <option value="false">Grayscale</option>
                <option value="true">Color</option>
              </select>
            </div>
            <div className="col-span-2 space-y-1">
              <label htmlFor="print-duplex">Two-sided Printing</label>
              <select
                id="print-duplex"
                value={settings.duplexMode}
                onChange={(event) =>
                  update({ duplexMode: PrintSettingsSchema.shape.duplexMode.parse(event.target.value) })
                }
                className={inputClass}
              >
                <option value="simplex">One-sided</option>
                <option value="longEdge">Two-sided (long edge)</option>
                <option value="shortEdge">Two-sided (short edge)</option>
              </select>
            </div>
          </fieldset>
          <p className="text-xs text-zinc-400">
            Use paper, color and two-sided options supported by your printer. For PDF files or driver-specific options,
            use Preview.
          </p>
          <button
            type="submit"
            disabled={missingPrinter}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Printing Settings'}
          </button>
        </fieldset>
      )}
      {saved && (
        <p role="status" className="text-emerald-400">
          Printing settings saved.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
