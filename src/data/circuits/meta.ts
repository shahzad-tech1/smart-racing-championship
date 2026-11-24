/** Shared circuit metadata type (kept standalone to avoid import cycles). */
export interface CircuitMeta {
  id: string;
  name: string;
  startVertex: number;
  finishVertex: number;
  laps: number;
  checkpointOrder: readonly number[];
}
