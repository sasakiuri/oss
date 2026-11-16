import { z } from 'zod';
import { commandDataResponseSchema, defineContract, query, queryResponseSchema, command } from '@sasakiuri/saika-ipc';

const CompetitionAnnouncementSettingsSchema = z.object({ enabled: z.boolean() });

export type CompetitionAnnouncementSettingsDto = z.infer<typeof CompetitionAnnouncementSettingsSchema>;

export const competitionAnnouncementsContract = defineContract('competitionAnnouncements', {
  getSettings: query(queryResponseSchema(CompetitionAnnouncementSettingsSchema)),
  setSettings: command(
    CompetitionAnnouncementSettingsSchema,
    commandDataResponseSchema(CompetitionAnnouncementSettingsSchema),
  ),
});
