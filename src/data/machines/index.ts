import type {MachineDef} from './types';
import {machines as enhanced_crafting_table} from './enhanced_crafting_table';
import {machines as ancient_altar} from './ancient_altar';
import {machines as me_charger} from './me_charger';
import {machines as ore_crusher} from './ore_crusher';

export type {MachineDef};

export const machines: Record<string, MachineDef> = {
  ...enhanced_crafting_table,
  ...ancient_altar,
  ...me_charger,
  ...ore_crusher,
};
