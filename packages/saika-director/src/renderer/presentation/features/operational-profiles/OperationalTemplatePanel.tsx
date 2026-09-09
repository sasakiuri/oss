import { useEffect, useRef, useState } from 'react';

import { operationalTemplatesService } from '@/renderer/services';
import type {
  OperationalProfileMode,
  OperationalProfilePreviewDto,
  OperationalTemplateDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

export function OperationalTemplatePanel({
  modes,
  settings,
  onChoose,
  disabled,
}: {
  modes: Record<string, OperationalProfileMode>;
  settings: OperationalProfilePreviewDto['changes'] | null;
  onChoose: (modes: Record<string, OperationalProfileMode>) => void;
  disabled: boolean;
}) {
  const [templates, setTemplates] = useState<OperationalTemplateDto[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    void operationalTemplatesService
      .list({})
      .then((response) => {
        if (disposed) return;
        if (!response.success) throw new Error(response.error.message);
        setTemplates(response.data);
      })
      .catch((caught: unknown) => {
        if (!disposed) setError(errorMessage(caught));
      });
    return () => {
      disposed = true;
    };
  }, [refresh]);

  const selected = templates?.find((template) => template.id === selectedId);
  const compatible =
    !!settings &&
    !!selected &&
    Object.entries(selected.modes).every(([id, mode]) => {
      const setting = settings.find((item) => item.id === id);
      return !!setting && (setting.supportedModes ?? ['DISABLED', 'ADVISORY', 'REQUIRED']).includes(mode);
    });
  const canSave = !!templates && !!settings && name.trim().length > 0 && Object.keys(modes).length > 0;
  const select = (id: string) => {
    const template = templates?.find((item) => item.id === id);
    setSelectedId(id);
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setError(null);
    setMessage(null);
  };
  const save = async (replace: boolean) => {
    if (busy || disabled || !canSave || (replace && !selected)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await operationalTemplatesService.save({
        name,
        description,
        modes,
        ...(replace && selected ? { id: selected.id, expectedRevision: selected.revision } : { expectedRevision: 0 }),
      });
      if (!mounted.current) return;
      if (!response.success) throw new Error(response.error.message);
      setTemplates((current) => [...(current ?? []).filter((item) => item.id !== response.data.id), response.data]);
      setSelectedId(response.data.id);
      setName(response.data.name);
      setDescription(response.data.description);
      setMessage('Template saved.');
    } catch (caught) {
      if (mounted.current) setError(errorMessage(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const remove = async () => {
    if (busy || disabled || !selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await operationalTemplatesService.remove({
        id: selected.id,
        expectedRevision: selected.revision,
      });
      if (!mounted.current) return;
      if (!response.success) throw new Error(response.error?.message ?? 'Unable to remove template');
      setTemplates((current) => (current ?? []).filter((item) => item.id !== selected.id));
      select('');
      setMessage('Template removed.');
    } catch (caught) {
      if (mounted.current) setError(errorMessage(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section aria-label="Saved operational templates" className="space-y-2">
      <h3 className="text-sm font-semibold">Saved templates</h3>
      <p className="text-xs text-vscode-text-muted">
        Save the settings you have selected for reuse in other competitions. Loading adds them to the current draft;
        review the changes before applying. Templates are stored on this Director and contain modes only.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
      <fieldset disabled={disabled || busy} className="space-y-2">
        <label className="block text-xs">
          Saved operational template
          <select
            value={selectedId}
            onChange={(event) => select(event.target.value)}
            className="ml-2 border border-vscode-border bg-vscode-input p-1"
          >
            <option value="">New template</option>
            {templates?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!compatible}
            onClick={() => {
              if (selected && compatible) {
                onChoose({ ...selected.modes });
                setMessage(null);
              }
            }}
          >
            Add template to proposed settings
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setTemplates(null);
              select('');
              setRefresh((value) => value + 1);
            }}
          >
            Reload templates
          </Button>
          <Button size="sm" variant="danger" disabled={!selected} onClick={() => void remove()}>
            Remove template
          </Button>
        </div>
        {selected && settings && !compatible && (
          <p className="text-xs">This template contains settings or modes unavailable in this Director.</p>
        )}
        <label className="block text-xs">
          Template name
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="ml-2 border border-vscode-border bg-vscode-input p-1"
          />
        </label>
        <label className="block text-xs">
          Template description
          <input
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            className="ml-2 border border-vscode-border bg-vscode-input p-1"
          />
        </label>
        <p className="text-xs text-vscode-text-muted">{Object.keys(modes).length} selected settings will be saved.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!canSave} onClick={() => void save(false)}>
            Save as new template
          </Button>
          <Button size="sm" variant="secondary" disabled={!canSave || !selected} onClick={() => void save(true)}>
            Replace template with proposed settings
          </Button>
        </div>
      </fieldset>
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
