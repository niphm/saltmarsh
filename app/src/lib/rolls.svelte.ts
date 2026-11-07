/**
 * Dice roller state (F1.10): advantage mode for the next d20 roll and the
 * last 20 rolls on this device. Rolls aren't table state, so they're kept in
 * memory only. All dice math is in the engine (dice.ts).
 */
import { rerollDie, rollD20, rollDamage, type Roll, type RollMode } from "@saltmarsh/schema";
import { nowIso } from "./seed";

export const ROLL_LOG_LIMIT = 20;

export interface LoggedRoll {
  id: number;
  at: string;
  /** Character name. */
  who: string;
  roll: Roll;
}

/** What a sheet hands its components: roll for this character, with its penalties applied. */
export interface Roller {
  d20(label: string, modifier: number): void;
  damage(label: string, dice: string, bonus: number, type?: string): void;
}

export class RollStore {
  /** Applies to the next d20 roll, then resets to normal. */
  mode = $state<RollMode>("normal");
  /** Newest first. */
  log = $state.raw<LoggedRoll[]>([]);
  #nextId = 1;

  d20(who: string, label: string, modifier: number, penalty: number) {
    this.#push(who, rollD20(label, modifier, this.mode, penalty));
    this.mode = "normal";
  }

  damage(who: string, label: string, dice: string, bonus: number, type?: string) {
    this.#push(who, rollDamage(label, dice, bonus, type));
  }

  /** Reroll one die of a logged roll and use the new result. */
  reroll(id: number, dieIndex: number) {
    this.log = this.log.map(e => (e.id === id ? { ...e, roll: rerollDie(e.roll, dieIndex) } : e));
  }

  clear() {
    this.log = [];
  }

  #push(who: string, roll: Roll) {
    this.log = [{ id: this.#nextId++, at: nowIso(), who, roll }, ...this.log].slice(0, ROLL_LOG_LIMIT);
  }
}

export const rolls = new RollStore();
