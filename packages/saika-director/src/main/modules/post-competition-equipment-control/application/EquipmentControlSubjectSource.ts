export interface EquipmentControlSubject {
  readonly championshipId: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly eventType: string;
  readonly round: string;
  readonly participantId: string;
  readonly athleteName: string;
  readonly startNumber: string | null;
  readonly gender: string;
}

export interface IEquipmentControlSubjectSource {
  find(eventId: string, participantId: string): EquipmentControlSubject | null;
}
