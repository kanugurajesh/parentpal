import { ageInMonths, type Child, type Moment, type Pattern, type User } from "@parentpal/shared";
import type { schema } from "../db/client";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

export const toUser = (u: Row<typeof schema.users>): User => ({
  id: u.id,
  isGuest: u.isGuest,
  email: u.email,
  parentRole: u.parentRole,
  firstName: u.firstName,
  createdAt: iso(u.createdAt),
});

export const toChild = (c: Row<typeof schema.children>): Child => ({
  id: c.id,
  nickname: c.nickname,
  sex: c.sex,
  birthMonth: c.birthMonth,
  birthYear: c.birthYear,
  ageMonths: ageInMonths(c.birthMonth, c.birthYear),
});

export const toMoment = (m: Row<typeof schema.moments>): Moment => ({
  id: m.id,
  childId: m.childId,
  text: m.text,
  trigger: m.trigger,
  behavior: m.behavior,
  outcome: m.outcome,
  tagStatus: m.tagStatus,
  createdAt: iso(m.createdAt),
});

export const toPattern = (p: Row<typeof schema.patterns>, momentIds: string[]): Pattern => ({
  id: p.id,
  childId: p.childId,
  title: p.title,
  insight: p.insight,
  suggestion: p.suggestion,
  momentIds,
  createdAt: iso(p.createdAt),
});
