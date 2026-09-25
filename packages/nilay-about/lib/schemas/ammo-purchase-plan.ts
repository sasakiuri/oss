import { z } from 'zod';

import { optionalDateSchema } from './permit-deadlines';

/** The columns of 別記様式第二号: 実包, 空包, 銃用雷管 (個), 無煙火薬, 黒色猟用火薬 (グラム). */
export const AMMO_KINDS = ['cartridge', 'blank', 'primer', 'smokeless', 'blackPowder'] as const;
export const ammoKindSchema = z.enum(AMMO_KINDS);
export type AmmoKind = z.infer<typeof ammoKindSchema>;

export const AMMO_PLAN_MAX_ROWS = 24;
export const AMMO_PLAN_MAX_TEXT = 60;
export const AMMO_PLAN_MAX_QUANTITY = 1_000_000;

const text = z.string().max(AMMO_PLAN_MAX_TEXT);
/** A count or a mass in grams; NaN while a field is being typed is kept out of the saved state by the store. */
const quantity = z.number().int().min(0).max(AMMO_PLAN_MAX_QUANTITY);

export const ammoPlanRowSchema = z.object({
  id: z.string().min(1).max(40),
  from: optionalDateSchema,
  to: optionalDateSchema,
  kind: ammoKindSchema,
  /** 番径 or name of the cartridge, as the form's 名称 column. */
  name: text,
  quantity,
  /** 事由: 狩猟, 有害鳥獣駆除, 標的射撃 and the like, in the reader's words. */
  reason: text,
  place: text,
  note: text,
});
export type AmmoPlanRow = z.infer<typeof ammoPlanRowSchema>;

export const ammoPlanSettingsSchema = z.object({
  periodFrom: optionalDateSchema,
  periodTo: optionalDateSchema,
  /** The quantities asked for in the application, by kind. Null when that kind is not applied for. */
  requested: z.object({
    cartridge: quantity.nullable(),
    blank: quantity.nullable(),
    primer: quantity.nullable(),
    smokeless: quantity.nullable(),
    blackPowder: quantity.nullable(),
  }),
  rows: z.array(ammoPlanRowSchema).max(AMMO_PLAN_MAX_ROWS),
});
export type AmmoPlanSettings = z.infer<typeof ammoPlanSettingsSchema>;
