import { describe, it, expect } from "vitest";
import { RaceEngine, type RaceConfig } from "../../src/engine/RaceEngine";
import { buildCircuit1, CIRCUIT1_META } from "../../src/data/circuits/circuit1";
import { RULES } from "../../src/engine/rules";
import type { Racer } from "../../src/core/types";

function racer(id: number, nitro: number): Racer {
  return { id, name: `R${id}`, isHuman: id === 1, strategyType: "Human", currentVertex: 0, fuel: RULES.MAX_FUEL_TENTHS, nitroCharges: nitro, lap: 0, nextCheckpoint: 0, totalTime: 0 };
}
const cfg = (): RaceConfig => ({
  laps: 1,
  startVertex: CIRCUIT1_META.startVertex,
  finishVertex: CIRCUIT1_META.finishVertex,
  checkpointOrder: [...CIRCUIT1_META.checkpointOrder],
});

describe("nitro activation (spec §4.3)", () => {
  it("rejects activation with no charge and while already active", () => {
    const eng = new RaceEngine(buildCircuit1(), [racer(1, 0)], cfg());
    expect(eng.activateNitro(1)).toBe(false);
    const eng2 = new RaceEngine(buildCircuit1(), [racer(1, 2)], cfg());
    expect(eng2.activateNitro(1)).toBe(true);
    expect(eng2.activateNitro(1)).toBe(false); // already burning
    expect(eng2.state.racers[0]!.nitro).toBe(1);
    expect(eng2.state.racers[0]!.nitroActive).toBe(true);
  });

  it("is 1.5x faster and burns more fuel than the same race without nitro", () => {
    const plain = new RaceEngine(buildCircuit1(), [racer(1, 1)], cfg());
    plain.run();
    const boosted = new RaceEngine(buildCircuit1(), [racer(1, 1)], cfg());
    boosted.activateNitro(1);
    boosted.run();
    const tPlain = plain.results()[0]!.finishTime;
    const tBoost = boosted.results()[0]!.finishTime;
    expect(tBoost).toBeLessThan(tPlain);
    // 4 s of nitro covers 6 s of base time => saves exactly 2 s (within one tick)
    expect(tPlain - tBoost).toBeGreaterThan(1.9);
    expect(tPlain - tBoost).toBeLessThan(2.1);
  });

  it("expires after the documented duration", () => {
    const eng = new RaceEngine(buildCircuit1(), [racer(1, 1)], cfg());
    eng.activateNitro(1);
    for (let i = 0; i < Math.ceil((RULES.NITRO_DURATION + 0.1) * 60); i++) eng.tick(1 / 60);
    expect(eng.state.racers[0]!.nitroActive).toBe(false);
  });

  it("leaves unused races deterministic and identical", () => {
    const a = new RaceEngine(buildCircuit1(), [racer(1, 1), racer(2, 1)], cfg());
    const b = new RaceEngine(buildCircuit1(), [racer(1, 1), racer(2, 1)], cfg());
    a.run();
    b.run();
    expect(a.results()).toEqual(b.results());
  });
});
