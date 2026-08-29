import { describe, expect, it } from "vitest";

import {
    BinaryDigits,
    FallingTarget,
    State,
    binaryToDecimal,
    createTarget,
    flipBinaryDigit,
    flipBit,
    generateChallengeGoals,
    getLowestTarget,
    initialState,
    reduceState,
    tick,
    randomInteger,
    targetSpeed,
} from "../src/main";

/**
 * Creates a state for a test.
 *
 * Individual tests can override only the properties they need.
 */
const createTestState = (changes: Partial<State> = {}): State => ({
    ...initialState,
    ...changes,
});

describe("binary digit functions", () => {
    it("flips zero to one", () => {
        expect(flipBit(0)).toBe(1);
    });

    it("flips one to zero", () => {
        expect(flipBit(1)).toBe(0);
    });

    it("flips only the selected binary digit", () => {
        const original: BinaryDigits = [0, 0, 0, 0, 0, 0, 0, 0];

        const result = flipBinaryDigit(original, 3);

        expect(result).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);

        // The original value must remain unchanged.
        expect(original).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it("converts eight binary digits to decimal", () => {
        const binaryThirteen: BinaryDigits = [0, 0, 0, 0, 1, 1, 0, 1];

        expect(binaryToDecimal(binaryThirteen)).toBe(13);
    });
});

describe("target selection", () => {
    it("creates a target at the supplied horizontal position", () => {
        const target = createTarget(4, 42, 275);

        expect(target).toEqual({
            id: 4,
            hexadecimalValue: 42,
            x: 275,
            y: -36,
        });
    });

    it("returns undefined when there are no targets", () => {
        expect(getLowestTarget([])).toBeUndefined();
    });

    it("returns the target with the greatest y-position", () => {
        const targets: ReadonlyArray<FallingTarget> = [
            {
                id: 0,
                hexadecimalValue: 13,
                x: 100,
                y: 40,
            },
            {
                id: 1,
                hexadecimalValue: 42,
                x: 200,
                y: 170,
            },
            {
                id: 2,
                hexadecimalValue: 7,
                x: 300,
                y: 90,
            },
        ];

        expect(getLowestTarget(targets)?.id).toBe(1);
    });
});

describe("game state reducer", () => {
    it("adds a target after a SpawnTarget event", () => {
        const target: FallingTarget = {
            id: 0,
            hexadecimalValue: 13,
            x: 100,
            y: -36,
        };

        const result = reduceState(initialState, {
            type: "SpawnTarget",
            target,
        });

        expect(result.targets).toEqual([target]);
        expect(initialState.targets).toEqual([]);
    });

    it("flips a digit after a FlipBinaryDigit event", () => {
        const result = reduceState(initialState, {
            type: "FlipBinaryDigit",
            index: 7,
        });

        expect(result.binaryDigits).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    });

    it("ignores input after the game ends", () => {
        const endedState = createTestState({
            gameEnd: true,
        });

        const result = reduceState(endedState, {
            type: "FlipBinaryDigit",
            index: 0,
        });

        expect(result).toBe(endedState);
    });
});

describe("target movement", () => {
    it("moves every target without mutating the old state", () => {
        const target: FallingTarget = {
            id: 0,
            hexadecimalValue: 13,
            x: 100,
            y: 100,
        };

        const state = createTestState({
            targets: [target],
        });

        const result = tick(state);

        expect(result.targets[0].y).toBe(104);
        expect(state.targets[0].y).toBe(100);
    });

    it("removes a correctly matched target at the line", () => {
        const binaryThirteen: BinaryDigits = [0, 0, 0, 0, 1, 1, 0, 1];

        const state = createTestState({
            binaryDigits: binaryThirteen,
            targets: [
                {
                    id: 0,
                    hexadecimalValue: 13,
                    x: 100,

                    // At the starting speed, its bottom reaches 300.
                    y: 260,
                },
            ],
        });

        const result = tick(state);

        expect(result.targets).toEqual([]);
        expect(result.gameEnd).toBe(false);
        expect(result.score).toBe(1);
    });

    it("ends the game when the answer is incorrect", () => {
        const state = createTestState({
            targets: [
                {
                    id: 0,
                    hexadecimalValue: 13,
                    x: 100,
                    y: 260,
                },
            ],
        });

        const result = tick(state);

        expect(result.gameEnd).toBe(true);
    });
});

describe("random integer generation", () => {
    it("produces the same result from the same seed", () => {
        expect(randomInteger(123, 0, 255)).toEqual(randomInteger(123, 0, 255));
    });

    it("produces a value inside the requested range", () => {
        const result = randomInteger(123, 1000, 3000);

        expect(result.value).toBeGreaterThanOrEqual(1000);
        expect(result.value).toBeLessThanOrEqual(3000);
    });

    it("uses the returned seed for the next value", () => {
        const first = randomInteger(123, 0, 255);
        const second = randomInteger(first.nextSeed, 0, 255);

        expect(second.nextSeed).not.toBe(first.nextSeed);
    });
});

it("adds one point to the existing score", () => {
    const binaryThirteen: BinaryDigits = [0, 0, 0, 0, 1, 1, 0, 1];

    const state = createTestState({
        binaryDigits: binaryThirteen,
        score: 4,
        targets: [
            {
                id: 0,
                hexadecimalValue: 13,
                x: 100,

                // At the starting speed, its bottom reaches 300.
                y: 260,
            },
        ],
    });

    const result = tick(state);

    expect(result.score).toBe(5);
});

describe("target speed", () => {
    it("starts at the slowest speed", () => {
        expect(targetSpeed(0)).toBe(4);
    });

    it("increases gradually with survival time", () => {
        expect(targetSpeed(600)).toBe(7);
    });

    it("reaches the maximum speed after two minutes", () => {
        expect(targetSpeed(1200)).toBe(10);
    });

    it("does not exceed the maximum speed", () => {
        expect(targetSpeed(2400)).toBe(10);
    });
});

describe("challenges", () => {
    const binaryThirteen: BinaryDigits = [0, 0, 0, 0, 1, 1, 0, 1];

    const targetThirteen: FallingTarget = {
        id: 0,
        hexadecimalValue: 13,
        x: 100,
        y: 260,
    };

    it("generates the same challenge goals from the same seed", () => {
        expect(generateChallengeGoals(123)).toEqual(
            generateChallengeGoals(123),
        );
    });

    it("generates achievable challenge goals inside the chosen ranges", () => {
        const { goals } = generateChallengeGoals(123);

        expect(goals.scoreTarget).toBeGreaterThanOrEqual(8);
        expect(goals.scoreTarget).toBeLessThanOrEqual(12);
        expect(goals.fastTargetCount).toBeGreaterThanOrEqual(3);
        expect(goals.fastTargetCount).toBeLessThanOrEqual(6);
        expect(goals.fastTimeLimitTicks).toBeGreaterThanOrEqual(120);
        expect(goals.fastTimeLimitTicks).toBeLessThanOrEqual(200);
        expect(goals.flawlessScoreTarget).toBeGreaterThanOrEqual(15);
        expect(goals.flawlessScoreTarget).toBeLessThanOrEqual(25);
    });

    it("changes challenge goals when the game restarts", () => {
        const setup = generateChallengeGoals(123);
        const state = createTestState({
            challengeGoals: setup.goals,
            challengeSeed: setup.nextSeed,
        });
        const result = reduceState(state, { type: "Restart" });

        expect(result.challengeGoals).not.toEqual(state.challengeGoals);
    });

    it("awards a trophy after reaching score 10", () => {
        const result = tick(
            createTestState({
                binaryDigits: binaryThirteen,
                targets: [targetThirteen],
                score: 9,
            }),
        );

        expect(result.completedChallenges).toContain("scoreTen");
    });

    it("awards a trophy for five matches in 15 seconds", () => {
        const result = tick(
            createTestState({
                binaryDigits: binaryThirteen,
                targets: [targetThirteen],
                elapsedTicks: 100,
                fastTargetsSolved: 4,
            }),
        );

        expect(result.completedChallenges).toContain("fiveInFifteen");
    });

    it("does not count fast matches after 15 seconds", () => {
        const result = tick(
            createTestState({
                binaryDigits: binaryThirteen,
                targets: [targetThirteen],
                elapsedTicks: 151,
                fastTargetsSolved: 4,
            }),
        );

        expect(result.fastTargetsSolved).toBe(4);
        expect(result.completedChallenges).not.toContain("fiveInFifteen");
    });

    it("awards a trophy after reaching score 20", () => {
        const result = tick(
            createTestState({
                binaryDigits: binaryThirteen,
                targets: [targetThirteen],
                score: 19,
            }),
        );

        expect(result.completedChallenges).toContain("scoreTwenty");
    });
});

describe("score history", () => {
    it("records the score when a played game restarts", () => {
        const result = reduceState(
            createTestState({
                score: 7,
                elapsedTicks: 50,
                binaryDigits: [1, 1, 1, 1, 1, 1, 1, 1],
                targets: [
                    {
                        id: 1,
                        hexadecimalValue: 13,
                        x: 100,
                        y: 100,
                    },
                ],
            }),
            { type: "Restart" },
        );

        expect(result.scoreHistory).toEqual([7]);
        expect(result.score).toBe(0);
        expect(result.targets).toEqual([]);
        expect(result.binaryDigits).toEqual(initialState.binaryDigits);
        expect(result.elapsedTicks).toBe(0);
    });

    it("appends scores from multiple games", () => {
        const result = reduceState(
            createTestState({
                score: 3,
                elapsedTicks: 20,
                scoreHistory: [7],
            }),
            { type: "Restart" },
        );

        expect(result.scoreHistory).toEqual([7, 3]);
    });

    it("does not record an unplayed game", () => {
        const result = reduceState(initialState, { type: "Restart" });

        expect(result.scoreHistory).toEqual([]);
    });
});
