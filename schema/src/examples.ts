/**
 * Bundled example characters as raw (unvalidated) JSON, in display order.
 * Consumers validate with `Character.safeParse` so a bad example shows an
 * error instead of crashing.
 */
import tidewick from "../examples/tidewick.json";
import kenpachi from "../examples/kenpachi.json";

export const examples: readonly unknown[] = [tidewick, kenpachi];
