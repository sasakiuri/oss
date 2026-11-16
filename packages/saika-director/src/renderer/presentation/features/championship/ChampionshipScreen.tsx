import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, CalendarDays, MapPin, PackageOpen, Pencil, Target } from 'lucide-react';
import { Button } from '../shared/common/Button';
import { Card } from '../shared/common/Card';
import { SectionTabs } from '../shared/common/SectionTabs';
import { PageHeader } from '../shared/layout/PageHeader';
import { ChampionshipList } from './components/ChampionshipList';
import { ChampionshipForm } from './components/ChampionshipForm';
import { EventList } from './components/EventList';
import { EventForm } from './components/EventForm';
import { ParticipantEditor } from './components/ParticipantEditor';
import { FiringPointAssignmentEditor } from './components/FiringPointAssignmentEditor';
import { ResultsView } from './components/ResultsView';
import { IncidentReportsView } from './components/IncidentReportsView';
import { EquipmentRegistryPanel } from './components/EquipmentRegistryPanel';
import { EstChampionshipInspectionPanel } from './components/EstChampionshipInspectionPanel';
import { ResultsBookPanel } from './components/ResultsBookPanel';
import { OutdoorEliminationPlanningPanel } from './components/OutdoorEliminationPlanningPanel';
import { PostCompetitionEquipmentControlPanel } from './components/PostCompetitionEquipmentControlPanel';
import { useChampionshipScreenCommands, type ChampionshipScreenNavigation } from './useChampionshipScreenCommands';
import { TargetExaminationsPanel } from '../target-examinations';
import { RangeInterruptionsPanel } from '../range-interruptions';
import { ProtestsPanel } from '../protests';
import { AdjudicationCasesPanel } from '../adjudication-cases';
import { AthleteSanctionsPanel } from '../athlete-sanctions';
import { useChampionshipStore } from '../../stores/domain/championship.store';
import { useChampionshipActions } from '../../hooks/useChampionshipActions';
import type { ChampionshipDto, EventDto } from '@/shared/ipc/contracts/championship.contract';

type View = 'list' | 'create' | 'edit' | 'detail';
type EventTab =
  | 'participants'
  | 'assignments'
  | 'elimination'
  | 'examinations'
  | 'interruptions'
  | 'incidents'
  | 'protests'
  | 'cases'
  | 'equipment-control'
  | 'results';

export function ChampionshipScreen() {
  const [view, setView] = useState<View>('list');
  const [editTarget, setEditTarget] = useState<ChampionshipDto | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editEventTarget, setEditEventTarget] = useState<EventDto | null>(null);
  const [eventTab, setEventTab] = useState<EventTab>('participants');

  const selectedChampionship = useChampionshipStore((s) => s.selectedChampionship);
  const selectedEventId = useChampionshipStore((s) => s.selectedEventId);
  const participants = useChampionshipStore((s) => s.participants);
  const firingPointAssignments = useChampionshipStore((s) => s.firingPointAssignments);

  const championshipActions = useChampionshipActions();
  const { loadParticipants, loadFiringPointAssignments, setSelectedEventId } = championshipActions;

  const navigation = useMemo<ChampionshipScreenNavigation>(
    () => ({
      showList: () => setView('list'),
      showDetail: () => setView('detail'),
      closeChampionshipEdit: () => {
        setView('detail');
        setEditTarget(null);
      },
      hideEventForm: () => setShowEventForm(false),
      closeEventForm: () => {
        setShowEventForm(false);
        setEditEventTarget(null);
      },
    }),
    [],
  );
  const commands = useChampionshipScreenCommands({
    actions: championshipActions,
    selectedChampionship,
    selectedEventId,
    participants,
    editTarget,
    editEventTarget,
    navigation,
  });

  const handleEventSelect = useCallback(
    async (eventId: string) => {
      setSelectedEventId(eventId);
      setEventTab('participants');
      await Promise.all([loadParticipants(eventId), loadFiringPointAssignments(eventId)]);
    },
    [loadParticipants, loadFiringPointAssignments, setSelectedEventId],
  );

  const handleEventEdit = useCallback((event: EventDto) => {
    setEditEventTarget(event);
    setShowEventForm(true);
  }, []);

  const handleBack = useCallback(() => {
    setView('list');
    setSelectedEventId(null);
    setEventTab('participants');
  }, [setSelectedEventId]);

  const selectedEvent = selectedChampionship?.events.find((event) => event.id === selectedEventId);

  return (
    <div className="min-h-full">
      {view === 'list' && <ChampionshipList onSelect={commands.openChampionship} onCreate={() => setView('create')} />}

      {view === 'create' && (
        <div className="min-h-full">
          <PageHeader
            title="New championship"
            actions={
              <Button variant="secondary" size="sm" onClick={() => setView('list')}>
                <ArrowLeft size={16} aria-hidden="true" />
                Championships
              </Button>
            }
          />
          <div className="p-5">
            <Card className="max-w-xl">
              <ChampionshipForm onSubmit={commands.submitNewChampionship} onCancel={() => setView('list')} />
            </Card>
          </div>
        </div>
      )}

      {view === 'edit' && editTarget && (
        <div className="min-h-full">
          <PageHeader title="Edit championship" description={editTarget.name} />
          <div className="p-5">
            <Card className="max-w-xl">
              <ChampionshipForm
                championship={editTarget}
                onSubmit={commands.submitChampionshipEdit}
                onCancel={navigation.closeChampionshipEdit}
              />
            </Card>
          </div>
        </div>
      )}

      {view === 'detail' && selectedChampionship && (
        <div className="min-h-full">
          <PageHeader
            title={selectedChampionship.name}
            description={
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} aria-hidden="true" />
                  {selectedChampionship.date}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden="true" />
                  {selectedChampionship.venue}
                </span>
              </span>
            }
            actions={
              <>
                <Button variant="secondary" size="sm" onClick={handleBack}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  Championships
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditTarget(selectedChampionship);
                    setView('edit');
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Edit details
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={commands.exportingEvidence}
                  onClick={() => void commands.exportEvidence()}
                >
                  <PackageOpen size={16} aria-hidden="true" />
                  {commands.exportingEvidence ? 'Exporting…' : 'Export evidence'}
                </Button>
              </>
            }
          />

          <div className="grid items-start gap-4 p-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-sm border border-vscode-border bg-vscode-bg-light">
              <EventList
                events={selectedChampionship.events}
                selectedEventId={selectedEventId}
                onSelect={handleEventSelect}
                onAdd={() => {
                  setEditEventTarget(null);
                  setShowEventForm(true);
                }}
                onEdit={handleEventEdit}
                onDelete={commands.confirmAndDeleteEvent}
              />
            </aside>

            {showEventForm ? (
              <section className="max-w-xl overflow-hidden rounded-sm border border-vscode-border bg-vscode-bg-light">
                <EventForm
                  event={editEventTarget ?? undefined}
                  onSubmit={editEventTarget ? commands.submitEventEdit : commands.submitNewEvent}
                  onCancel={navigation.closeEventForm}
                />
              </section>
            ) : selectedEventId ? (
              <section className="min-w-0 overflow-hidden rounded-sm border border-vscode-border bg-vscode-bg-light">
                <SectionTabs<EventTab>
                  label="Event workspace"
                  prefix="event"
                  value={eventTab}
                  onChange={setEventTab}
                  tabs={[
                    { id: 'participants', label: 'Participants' },
                    { id: 'assignments', label: 'Firing-Point Assignment' },
                    ...(selectedEvent?.round === 'Elimination'
                      ? [{ id: 'elimination' as const, label: 'Elimination Plan' }]
                      : []),
                    { id: 'results', label: 'Results' },
                    { id: 'examinations', label: 'Target Examination' },
                    { id: 'interruptions', label: 'Interruptions' },
                    { id: 'incidents', label: 'Incidents' },
                    { id: 'protests', label: 'Protests' },
                    { id: 'cases', label: 'Cases' },
                    { id: 'equipment-control', label: 'Equipment Control' },
                  ]}
                />
                {eventTab === 'participants' && (
                  <div
                    id="event-participants-panel"
                    role="tabpanel"
                    aria-labelledby="event-participants-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <ParticipantEditor
                      key={selectedEventId}
                      participants={participants}
                      onSave={commands.saveEventParticipants}
                    />
                  </div>
                )}
                {eventTab === 'assignments' && (
                  <div
                    id="event-assignments-panel"
                    role="tabpanel"
                    aria-labelledby="event-assignments-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <FiringPointAssignmentEditor
                      key={selectedEventId}
                      assignments={firingPointAssignments}
                      participants={participants}
                      onSave={commands.saveEventAssignments}
                      eventId={selectedEventId}
                      competitionTypeId={selectedEvent?.eventType ?? ''}
                      round={selectedEvent?.round}
                      onAssignmentsApplied={async () => {
                        await loadFiringPointAssignments(selectedEventId);
                      }}
                    />
                  </div>
                )}
                {eventTab === 'results' && (
                  <div
                    id="event-results-panel"
                    role="tabpanel"
                    aria-labelledby="event-results-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <ResultsView
                      eventId={selectedEventId}
                      eventName={selectedEvent?.name}
                      round={selectedEvent?.round}
                    />
                  </div>
                )}
                {eventTab === 'elimination' && (
                  <div
                    id="event-elimination-panel"
                    role="tabpanel"
                    aria-labelledby="event-elimination-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <OutdoorEliminationPlanningPanel key={selectedEventId} eventId={selectedEventId} />
                  </div>
                )}
                {eventTab === 'incidents' && (
                  <div
                    id="event-incidents-panel"
                    role="tabpanel"
                    aria-labelledby="event-incidents-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <IncidentReportsView
                      key={selectedEventId}
                      eventId={selectedEventId}
                      eventName={selectedEvent?.name}
                      participants={participants}
                    />
                  </div>
                )}
                {eventTab === 'examinations' && (
                  <div
                    id="event-examinations-panel"
                    role="tabpanel"
                    aria-labelledby="event-examinations-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <TargetExaminationsPanel
                      key={selectedEventId}
                      primaryScope={{ scopeType: 'EVENT', scopeId: selectedEventId }}
                    />
                  </div>
                )}
                {eventTab === 'interruptions' && (
                  <div
                    id="event-interruptions-panel"
                    role="tabpanel"
                    aria-labelledby="event-interruptions-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <RangeInterruptionsPanel
                      key={selectedEventId}
                      primaryScope={{ scopeType: 'EVENT', scopeId: selectedEventId }}
                    />
                  </div>
                )}
                {eventTab === 'protests' && (
                  <div
                    id="event-protests-panel"
                    role="tabpanel"
                    aria-labelledby="event-protests-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <ProtestsPanel key={selectedEventId} scopeId={selectedEventId} />
                  </div>
                )}
                {eventTab === 'cases' && (
                  <div
                    id="event-cases-panel"
                    role="tabpanel"
                    aria-labelledby="event-cases-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <AdjudicationCasesPanel key={selectedEventId} eventId={selectedEventId} />
                  </div>
                )}
                {eventTab === 'equipment-control' && (
                  <div
                    id="event-equipment-control-panel"
                    role="tabpanel"
                    aria-labelledby="event-equipment-control-tab"
                    tabIndex={0}
                    className="p-4"
                  >
                    <PostCompetitionEquipmentControlPanel
                      key={selectedEventId}
                      championshipId={selectedChampionship.id}
                      eventId={selectedEventId}
                      participants={participants}
                    />
                  </div>
                )}
              </section>
            ) : (
              <section className="flex min-h-28 items-start gap-3 border-y border-vscode-border px-4 py-5">
                <Target size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-vscode-dimmed" />
                <div>
                  <p className="text-[13px] font-medium text-vscode-text">
                    {selectedChampionship.events.length > 0 ? 'Select an event' : 'No event selected'}
                  </p>
                  <p className="mt-1 text-xs text-vscode-text-muted">
                    {selectedChampionship.events.length > 0
                      ? 'The entry list, firing-point assignment, incident reports and results will open here.'
                      : 'Add an event from the panel on the left.'}
                  </p>
                </div>
              </section>
            )}
          </div>
          <section aria-label="Championship records" className="px-5 pb-5">
            <h3 className="mb-3 text-sm font-semibold text-vscode-text">Championship records</h3>
            <details className="operation-section">
              <summary>Target inspections</summary>
              <EstChampionshipInspectionPanel
                key={`est-inspection:${selectedChampionship.id}`}
                championshipId={selectedChampionship.id}
              />
            </details>
            <details className="operation-section">
              <summary>Athlete sanctions</summary>
              <AthleteSanctionsPanel
                key={`athlete-sanctions:${selectedChampionship.id}`}
                championshipId={selectedChampionship.id}
              />
            </details>
            <details className="operation-section">
              <summary>Results Book</summary>
              <ResultsBookPanel
                key={`results-book:${selectedChampionship.id}`}
                championshipId={selectedChampionship.id}
              />
            </details>
            <details className="operation-section">
              <summary>Equipment register</summary>
              <EquipmentRegistryPanel key={selectedChampionship.id} championshipId={selectedChampionship.id} />
            </details>
          </section>
        </div>
      )}
    </div>
  );
}
