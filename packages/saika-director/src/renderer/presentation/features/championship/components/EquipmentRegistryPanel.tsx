import { useEffect, useRef, useState } from 'react';

import { equipmentRegistryService } from '@/renderer/services';
import type { EquipmentDetails, EquipmentRegistryWorkspace } from '@/shared/ipc/contracts/equipmentRegistry.contract';

import { Button } from '../../shared/common/Button';
import { Input } from '../../shared/common/Input';

const blankEquipment: EquipmentDetails = {
  athleteIdentityId: '',
  category: 'RIFLE',
  description: '',
  manufacturer: null,
  serialNumber: null,
  calibre: null,
  sealNumber: null,
  cardReference: null,
  externalRegistrationReference: null,
  manufacturedOn: null,
  validUntil: null,
  retired: false,
};
const fields = [
  ['description', 'Equipment description'],
  ['manufacturer', 'Manufacturer'],
  ['serialNumber', 'Serial number'],
  ['calibre', 'Calibre'],
  ['sealNumber', 'Seal number'],
  ['cardReference', 'Equipment card reference'],
  ['externalRegistrationReference', 'External ISSF registration reference'],
] as const;
const selectStyle = 'rounded border border-vscode-border bg-vscode-input p-2 text-sm';

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function EquipmentRegistryPanel({ championshipId }: { championshipId: string }) {
  const registrationSection = useRef<HTMLDetailsElement>(null);
  const [workspace, setWorkspace] = useState<EquipmentRegistryWorkspace | null>(null);
  const [asOfDate, setAsOfDate] = useState(localDate);
  const [testingDate, setTestingDate] = useState(localDate);
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [details, setDetails] = useState<EquipmentDetails>({ ...blankEquipment });
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [inspectionEquipmentId, setInspectionEquipmentId] = useState('');
  const [outcome, setOutcome] = useState<'PASSED' | 'FAILED' | 'INCOMPLETE'>('INCOMPLETE');
  const [testedItems, setTestedItems] = useState('');
  const [calibrationIds, setCalibrationIds] = useState<string[]>([]);
  const [instrument, setInstrument] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    setWorkspace(null);
    equipmentRegistryService
      .getWorkspace({ championshipId, asOfDate })
      .then((response) => {
        if (disposed) return;
        if (response.success) {
          setWorkspace(response.data);
          setError(null);
        } else setError(response.error.message);
      })
      .catch((error: unknown) => {
        if (!disposed) setError(String(error));
      });
    return () => {
      disposed = true;
    };
  }, [championshipId, asOfDate]);
  const scope = { championshipId, asOfDate, expectedRevision: workspace?.revision ?? 0, officialName, statement };
  const canRecord = Boolean(workspace && officialName.trim() && statement.trim() && !busy);
  async function run(
    operation: () => ReturnType<typeof equipmentRegistryService.saveEquipment>,
    onSaved?: (data: EquipmentRegistryWorkspace) => void,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.success) throw new Error(result.error.message);
      setWorkspace(result.data);
      onSaved?.(result.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const withdrawn = new Set(
    workspace?.entries.flatMap((entry) => (entry.kind === 'WITHDRAWAL' ? [entry.withdrawsId] : [])),
  );
  return (
    <section className="space-y-4 p-4" aria-label="Equipment register">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Equipment register and voluntary inspections</h3>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => equipmentRegistryService.getWorkspace({ championshipId, asOfDate }))}
        >
          Reload register
        </Button>
      </div>
      <p className="text-sm text-vscode-text-muted">
        Register athlete identities in the championship identity panel first. These records support voluntary equipment
        checks. External ISSF registration and equipment cards must be verified by the official.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-3">
        <Input label="Equipment official" value={officialName} onChange={setOfficialName} />
        <Input label="Record statement / correction reason" value={statement} onChange={setStatement} />
        <Input label="Validity assessment date" type="date" value={asOfDate} onChange={setAsOfDate} />
      </fieldset>
      <details ref={registrationSection}>
        <summary className="cursor-pointer font-medium">Register or amend equipment</summary>
        <fieldset disabled={busy} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Registered athlete
            <select
              className={selectStyle}
              value={details.athleteIdentityId}
              disabled={equipmentId !== null}
              onChange={(event) => setDetails({ ...details, athleteIdentityId: event.target.value })}
            >
              <option value="">Choose athlete</option>
              {workspace?.athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.name}
                  {athlete.issfId ? ` (${athlete.issfId})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Equipment category
            <select
              className={selectStyle}
              value={details.category}
              disabled={equipmentId !== null}
              onChange={(event) =>
                setDetails({ ...details, category: event.target.value as EquipmentDetails['category'] })
              }
            >
              {['RIFLE', 'PISTOL', 'JACKET', 'TROUSERS', 'SHOES', 'CYLINDER', 'OTHER'].map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          {fields.map(([key, label]) => (
            <Input
              key={key}
              label={label}
              value={details[key] ?? ''}
              onChange={(value) => setDetails({ ...details, [key]: key === 'description' ? value : value || null })}
            />
          ))}
          <Input
            label="Cylinder manufacture date"
            type="date"
            value={details.manufacturedOn ?? ''}
            onChange={(value) => setDetails({ ...details, manufacturedOn: value || null })}
          />
          <Input
            label="Manufacturer validity date"
            type="date"
            value={details.validUntil ?? ''}
            onChange={(value) => setDetails({ ...details, validUntil: value || null })}
          />
          <label className="text-sm">
            <input
              type="checkbox"
              checked={details.retired}
              onChange={(event) => setDetails({ ...details, retired: event.target.checked })}
            />{' '}
            Retired from register
          </label>
          <Button
            disabled={!canRecord || !details.athleteIdentityId || !details.description.trim()}
            onClick={() =>
              void run(
                () => equipmentRegistryService.saveEquipment({ ...scope, equipmentId, details }),
                (data) => {
                  const saved = data.entries.at(-1);
                  if (saved?.kind === 'EQUIPMENT') setEquipmentId(saved.equipmentId);
                },
              )
            }
          >
            {equipmentId ? 'Save equipment amendment' : 'Register equipment'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEquipmentId(null);
              setDetails({ ...blankEquipment });
            }}
          >
            New equipment form
          </Button>
        </fieldset>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">Daily calibration and inspection</summary>
        <fieldset disabled={busy} className="mt-3 space-y-3">
          <Input
            label="Testing date at the venue"
            type="date"
            value={testingDate}
            onChange={(value) => {
              setTestingDate(value);
              setCalibrationIds([]);
            }}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Testing instrument" value={instrument} onChange={setInstrument} />
            <Input label="Calibration evidence reference" value={reference} onChange={setReference} />
            <Button
              disabled={!canRecord || !instrument.trim() || !reference.trim()}
              onClick={() =>
                void run(() =>
                  equipmentRegistryService.recordCalibration({ ...scope, testingDate, instrument, reference }),
                )
              }
            >
              Record calibration
            </Button>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Equipment to inspect
            <select
              className={selectStyle}
              value={inspectionEquipmentId}
              onChange={(event) => setInspectionEquipmentId(event.target.value)}
            >
              <option value="">Choose equipment</option>
              {workspace?.equipment
                .filter((item) => !item.details.retired)
                .map((item) => (
                  <option key={item.equipmentId} value={item.equipmentId}>
                    {item.athleteName}: {item.details.description}
                  </option>
                ))}
            </select>
          </label>
          <div className="text-sm">Calibration evidence for this testing date</div>
          {workspace?.entries
            .filter(
              (entry) =>
                entry.kind === 'CALIBRATION' &&
                entry.testingDate === testingDate &&
                workspace.activeCalibrationIds.includes(entry.id),
            )
            .map(
              (entry) =>
                entry.kind === 'CALIBRATION' && (
                  <label className="block text-sm" key={entry.id}>
                    <input
                      type="checkbox"
                      checked={calibrationIds.includes(entry.id)}
                      onChange={(event) =>
                        setCalibrationIds(
                          event.target.checked
                            ? [...calibrationIds, entry.id]
                            : calibrationIds.filter((id) => id !== entry.id),
                        )
                      }
                    />{' '}
                    {entry.instrument} — {entry.reference}
                  </label>
                ),
            )}
          {calibrationIds.length === 0 && (
            <p className="text-sm text-vscode-text-muted">
              No calibration selected. The inspection will carry a missing-evidence advisory.
            </p>
          )}
          <Input label="Tests and measurements performed" value={testedItems} onChange={setTestedItems} />
          <label className="flex flex-col gap-1 text-sm">
            Inspection outcome
            <select
              className={selectStyle}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as typeof outcome)}
            >
              <option value="INCOMPLETE">Incomplete</option>
              <option value="PASSED">Passed</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
          <Button
            disabled={!canRecord || !inspectionEquipmentId || !testedItems.trim()}
            onClick={() =>
              void run(() =>
                equipmentRegistryService.recordInspection({
                  ...scope,
                  equipmentId: inspectionEquipmentId,
                  testingDate,
                  outcome,
                  testedItems,
                  calibrationIds,
                }),
              )
            }
          >
            Record equipment inspection
          </Button>
        </fieldset>
      </details>
      <div className="space-y-3">
        {workspace?.equipment.map((item) => {
          const inspection = workspace.entries.find((entry) => entry.id === item.currentInspectionId);
          return (
            <div key={item.equipmentId} className="rounded border border-vscode-border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <strong>
                  {item.athleteName}: {item.details.description}
                </strong>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEquipmentId(item.equipmentId);
                    setDetails({ ...item.details });
                    if (registrationSection.current) registrationSection.current.open = true;
                  }}
                >
                  Amend equipment
                </Button>
              </div>
              <p>
                {item.details.category} · Serial: {item.details.serialNumber ?? '—'} · Seal:{' '}
                {item.details.sealNumber ?? '—'} · Inspections: {item.inspectionCount}
              </p>
              {item.advisories.map((advisory) => (
                <p key={advisory} className="text-vscode-text-muted">
                  {advisory}
                </p>
              ))}
              <p>
                Current inspection:{' '}
                {inspection?.kind === 'INSPECTION' ? `${inspection.outcome} (${inspection.testingDate})` : 'None'}
              </p>
            </div>
          );
        })}
      </div>
      <details>
        <summary className="cursor-pointer font-medium">Registration and inspection history</summary>
        <p className="my-2 text-sm text-vscode-text-muted">
          Withdraw incorrect inspection or calibration entries with a reason, then record the correction. Equipment
          amendments keep the earlier details and inspection links.
        </p>
        {workspace?.entries.map((entry) => (
          <div key={entry.id} className="my-2 rounded border border-vscode-border p-2 text-sm">
            <p>
              {entry.kind} · {entry.officialName} · {entry.recordedAt}
              {withdrawn.has(entry.id) ? ' · WITHDRAWN' : ''}
            </p>
            <p>{entry.statement}</p>
            {entry.kind === 'CALIBRATION' && (
              <p>
                {entry.testingDate} · {entry.instrument} · {entry.reference}
              </p>
            )}
            {entry.kind === 'INSPECTION' && (
              <p>
                {entry.testingDate} · {entry.outcome} · {entry.testedItems} ·{' '}
                {workspace.entries.map((record) =>
                  record.id === entry.equipmentRecordId && record.kind === 'EQUIPMENT'
                    ? `${record.athleteName}: ${record.details.description} (Serial: ${record.details.serialNumber ?? '—'}, seal: ${record.details.sealNumber ?? '—'})`
                    : null,
                )}
              </p>
            )}
            {entry.kind === 'EQUIPMENT' && (
              <p>
                {entry.athleteName} · {entry.details.description} · {entry.details.manufacturer} ·{' '}
                {entry.details.serialNumber} · {entry.details.calibre} · Seal: {entry.details.sealNumber} · Card:{' '}
                {entry.details.cardReference} · External registration: {entry.details.externalRegistrationReference}
              </p>
            )}
            {entry.kind === 'WITHDRAWAL' && (
              <p>
                Withdraws:{' '}
                {workspace.entries.map((record) =>
                  record.id === entry.withdrawsId
                    ? `${record.kind} — ${record.recordedAt} — ${record.statement}`
                    : null,
                )}
              </p>
            )}
            {['CALIBRATION', 'INSPECTION'].includes(entry.kind) && !withdrawn.has(entry.id) && (
              <Button
                variant="secondary"
                size="sm"
                disabled={!canRecord}
                onClick={() => void run(() => equipmentRegistryService.withdraw({ ...scope, withdrawsId: entry.id }))}
              >
                Withdraw record
              </Button>
            )}
          </div>
        ))}
      </details>
    </section>
  );
}
