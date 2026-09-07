import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { scoringDecisionsService } from '@/renderer/services';
import type { AddScoringDecisionPayload, ScoringDecisionDto } from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';
import { Modal } from '../../shared/common/Modal';

import { ScoreCorrectionPanel } from './ScoreCorrectionPanel';

interface ScoringDecisionPanelProps {
  result: {
    id: string;
    playerName: string;
    baseTotalScore: number;
    totalScore: number;
    classificationCode: 'DSQ' | 'DQB' | 'AD_DSQ' | null;
    seriesShotCounts?: readonly number[];
    placementReviewRequired?: boolean;
  };
  resultScope: AddScoringDecisionPayload['resultScope'];
  onClose: () => void;
  onChanged: () => void;
}

type AddDecisionType = AddScoringDecisionPayload['type'];

const DECISION_OPTIONS: Array<{ value: AddDecisionType; label: string }> = [
  { value: 'DEDUCTION', label: 'Point deduction' },
  { value: 'ANNUL_SHOT', label: 'Annul shot' },
  { value: 'MARK_MISS', label: 'Mark miss' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'MALFUNCTION', label: 'Malfunction' },
  { value: 'EXTRA_TIME', label: 'Extra time' },
  { value: 'REPEAT_SHOT', label: 'Repeated shot' },
  { value: 'REPEAT_SERIES', label: 'Repeated series' },
  { value: 'REMARK', label: 'Remark only' },
];

const inputClass =
  'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text focus:border-vscode-focus focus:outline-none';

export function ScoringDecisionPanel({ result, resultScope, onClose, onChanged }: ScoringDecisionPanelProps) {
  const [decisions, setDecisions] = useState<ScoringDecisionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<AddDecisionType>('DEDUCTION');
  const [policy, setPolicy] = useState<'SPECIFIC_SHOT' | 'LOWEST_SHOT_IN_SERIES'>('LOWEST_SHOT_IN_SERIES');
  const [points, setPoints] = useState('2.0');
  const [seriesNumber, setSeriesNumber] = useState('1');
  const [shotNumber, setShotNumber] = useState('1');
  const [ruleReference, setRuleReference] = useState(resultScope === 'FINAL' ? '6.17 / 6.14.6' : '6.14.6 / 6.14.7');
  const [incidentReportNumber, setIncidentReportNumber] = useState('');
  const [publicRemark, setPublicRemark] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await scoringDecisionsService.listByResult({ resultId: result.id, resultScope });
      if (!response.success) throw new Error(response.error.message);
      setDecisions(response.data.decisions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load scoring decisions');
    } finally {
      setLoading(false);
    }
  }, [result.id, resultScope]);

  useEffect(() => {
    void loadDecisions();
  }, [loadDecisions]);

  const isShotDecision = type === 'ANNUL_SHOT' || type === 'MARK_MISS';
  const showSeries = type === 'DEDUCTION' || isShotDecision;
  const showShot = isShotDecision || (type === 'DEDUCTION' && policy === 'SPECIFIC_SHOT');
  const effectivePolicy = useMemo<AddScoringDecisionPayload['applicationPolicy']>(() => {
    if (isShotDecision) return 'SPECIFIC_SHOT';
    if (type === 'DEDUCTION') return policy;
    return 'NONE';
  }, [isShotDecision, policy, type]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setSaving(true);
      setError(null);
      try {
        const parsedSeries = Number.parseInt(seriesNumber, 10) - 1;
        const parsedShot = Number.parseInt(shotNumber, 10) - 1;
        const payload: AddScoringDecisionPayload = {
          resultId: result.id,
          resultScope,
          type,
          applicationPolicy: effectivePolicy,
          ruleReference,
          publicRemark,
          officialName,
          ...(incidentReportNumber.trim() ? { incidentReportNumber } : {}),
          ...(internalNote.trim() ? { internalNote } : {}),
          ...(type === 'DEDUCTION' ? { pointsX10: Math.round(Number.parseFloat(points) * 10) } : {}),
          ...(showSeries ? { seriesIndex: parsedSeries } : {}),
          ...(showShot ? { shotIndex: parsedShot } : {}),
        };
        const response = await scoringDecisionsService.add(payload);
        if (!response.success) throw new Error(response.error.message);
        setPublicRemark('');
        setInternalNote('');
        await loadDecisions();
        onChanged();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to append scoring decision');
      } finally {
        setSaving(false);
      }
    },
    [
      effectivePolicy,
      incidentReportNumber,
      internalNote,
      loadDecisions,
      officialName,
      onChanged,
      points,
      publicRemark,
      result.id,
      resultScope,
      ruleReference,
      seriesNumber,
      shotNumber,
      showSeries,
      showShot,
      type,
    ],
  );

  const handleRevoke = useCallback(async () => {
    if (!revokeTargetId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await scoringDecisionsService.revoke({
        decisionId: revokeTargetId,
        ruleReference,
        reason: revokeReason,
        officialName,
        ...(incidentReportNumber.trim() ? { incidentReportNumber } : {}),
        ...(internalNote.trim() ? { internalNote } : {}),
      });
      if (!response.success) throw new Error(response.error.message);
      setRevokeTargetId(null);
      setRevokeReason('');
      await loadDecisions();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to revoke scoring decision');
    } finally {
      setSaving(false);
    }
  }, [
    incidentReportNumber,
    internalNote,
    loadDecisions,
    officialName,
    onChanged,
    revokeReason,
    revokeTargetId,
    ruleReference,
  ]);

  return (
    <Modal isOpen onClose={onClose} title={`Scoring decisions — ${result.playerName}`}>
      <div className="space-y-5">
        <div className="rounded-[3px] border border-vscode-border bg-vscode-bg px-3 py-2 text-[13px]">
          <div className="flex justify-between gap-4">
            <span className="text-vscode-text-muted">Source score</span>
            <span className="tabular-nums text-vscode-text">{result.baseTotalScore.toFixed(1)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-vscode-text-muted">Projected score</span>
            <span className="font-semibold tabular-nums text-vscode-text">
              {result.classificationCode ?? result.totalScore.toFixed(1)}
            </span>
          </div>
          {result.seriesShotCounts && (
            <p className="mt-2 text-xs text-vscode-text-muted">
              Available series: {result.seriesShotCounts.map((shots, index) => `S${index + 1} (${shots})`).join(', ')}
            </p>
          )}
          {result.placementReviewRequired && (
            <p className="mt-2 border-l-2 border-vscode-warning pl-2 text-xs text-vscode-warning">
              Final placement requires an explicit jury review after this score or classification intervention.
            </p>
          )}
        </div>

        {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}

        <ScoreCorrectionPanel resultId={result.id} resultScope={resultScope} onChanged={onChanged} />
        <form onSubmit={handleSubmit} className="space-y-3" aria-label="Add scoring decision">
          <h3 className="text-[13px] font-semibold text-vscode-text">Append official decision</h3>
          <p className="border-l-2 border-vscode-border pl-2 text-xs text-vscode-text-muted">
            Record DSQ, DQB, and AD-DSQ in Championship athlete identity and sanctions so every required phase or event
            is covered.
          </p>
          <label className="block text-xs text-vscode-text-muted">
            Decision
            <select
              className={`${inputClass} mt-1`}
              value={type}
              onChange={(event) => setType(event.target.value as AddDecisionType)}
            >
              {DECISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {type === 'DEDUCTION' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-vscode-text-muted">
                Application
                <select
                  className={`${inputClass} mt-1`}
                  value={policy}
                  onChange={(event) => setPolicy(event.target.value as typeof policy)}
                >
                  <option value="LOWEST_SHOT_IN_SERIES">Lowest shot in selected series</option>
                  <option value="SPECIFIC_SHOT">Specific shot</option>
                </select>
              </label>
              <label className="text-xs text-vscode-text-muted">
                Points
                <input
                  className={`${inputClass} mt-1`}
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={points}
                  onChange={(event) => setPoints(event.target.value)}
                />
              </label>
            </div>
          )}

          {(showSeries || showShot) && (
            <div className="grid grid-cols-2 gap-3">
              {showSeries && (
                <label className="text-xs text-vscode-text-muted">
                  Series #
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="1"
                    required
                    value={seriesNumber}
                    onChange={(event) => setSeriesNumber(event.target.value)}
                  />
                </label>
              )}
              {showShot && (
                <label className="text-xs text-vscode-text-muted">
                  Absolute shot #
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="1"
                    required
                    value={shotNumber}
                    onChange={(event) => setShotNumber(event.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-vscode-text-muted">
              ISSF rule reference
              <input
                className={`${inputClass} mt-1`}
                required
                value={ruleReference}
                onChange={(event) => setRuleReference(event.target.value)}
              />
            </label>
            <label className="text-xs text-vscode-text-muted">
              Incident report #
              <input
                className={`${inputClass} mt-1`}
                value={incidentReportNumber}
                onChange={(event) => setIncidentReportNumber(event.target.value)}
              />
            </label>
          </div>
          <label className="block text-xs text-vscode-text-muted">
            Public result-list remark
            <textarea
              className={`${inputClass} mt-1 min-h-16 resize-y`}
              required
              value={publicRemark}
              onChange={(event) => setPublicRemark(event.target.value)}
            />
          </label>
          <label className="block text-xs text-vscode-text-muted">
            Internal note
            <textarea
              className={`${inputClass} mt-1 min-h-12 resize-y`}
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </label>
          <label className="block text-xs text-vscode-text-muted">
            Official / jury member
            <input
              className={`${inputClass} mt-1`}
              required
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Append decision'}
            </Button>
          </div>
        </form>

        <section className="space-y-2 border-t border-vscode-border pt-4">
          <h3 className="text-[13px] font-semibold text-vscode-text">Decision history</h3>
          {loading && <p className="text-xs text-vscode-text-muted">Loading…</p>}
          {!loading && decisions.length === 0 && (
            <p className="text-xs text-vscode-text-muted">No manual scoring decisions.</p>
          )}
          {decisions.map((decision) => (
            <div key={decision.id} className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={decision.active ? 'font-semibold text-vscode-text' : 'text-vscode-dimmed'}>
                    {decision.type.replaceAll('_', ' ')}
                  </span>
                  <span className="ml-2 text-vscode-text-muted">
                    {decision.active ? 'Active' : decision.type === 'REVOCATION' ? 'Audit entry' : 'Revoked'}
                  </span>
                </div>
                {decision.active && decision.type !== 'REVOCATION' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setRevokeTargetId(decision.id);
                      setRevokeReason('');
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </div>
              <p className="mt-1 text-vscode-text">{decision.publicRemark}</p>
              <p className="mt-1 text-vscode-text-muted">
                Rule {decision.ruleReference}
                {decision.incidentReportNumber ? ` · IR ${decision.incidentReportNumber}` : ''} ·{' '}
                {decision.officialName}
              </p>
              {(decision.pointsX10 !== null || decision.seriesIndex !== null || decision.shotIndex !== null) && (
                <p className="mt-1 text-vscode-text-muted">
                  {decision.pointsX10 !== null ? `−${(decision.pointsX10 / 10).toFixed(1)} points` : ''}
                  {decision.seriesIndex !== null ? ` · Series ${decision.seriesIndex + 1}` : ''}
                  {decision.shotIndex !== null ? ` · Shot ${decision.shotIndex + 1}` : ''}
                </p>
              )}
            </div>
          ))}

          {revokeTargetId && (
            <div className="space-y-2 rounded-[3px] border border-vscode-error/50 bg-vscode-error/5 p-3">
              <label className="block text-xs text-vscode-text-muted">
                Revocation reason
                <textarea
                  className={`${inputClass} mt-1 min-h-14 resize-y`}
                  required
                  value={revokeReason}
                  onChange={(event) => setRevokeReason(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRevokeTargetId(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={saving || !revokeReason.trim() || !officialName.trim() || !ruleReference.trim()}
                  onClick={handleRevoke}
                >
                  Append revocation
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
