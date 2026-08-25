import { describe, expect, it } from "vitest";

import {
    BinaryDigits,
    FallingTarget,
    State,
    binaryToDecimal,
    flipBinaryDigit,
    flipBit,
    getLowestTarget,
    initialState,
    reduceState,
    tick,
    randomInteger,
} from "../src/main";

/**
 * Creates a state for a test.
 *
 * Individual tests can override only the properties they need.
 */
const createTestState = (
    changes: Partial<State> = {},
): State => ({
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
        const original: BinaryDigits = [
            0, 0, 0, 0, 0, 0, 0, 0,
        ];

        const result = flipBinaryDigit(original, 3);

        expect(result).toEqual([
            0, 0, 0, 1, 0, 0, 0, 0,
        ]);

        // The original value must remain unchanged.
        expect(original).toEqual([
            0, 0, 0, 0, 0, 0, 0, 0,
        ]);
    });

    it("converts eight binary digits to decimal", () => {
        const binaryThirteen: BinaryDigits = [
            0, 0, 0, 0, 1, 1, 0, 1,
        ];

        expect(binaryToDecimal(binaryThirteen)).toBe(13);
    });
});

describe("target selection", () => {
    it("returns undefined when there are no targets", () => {
        expect(getLowestTarget([])).toBeUndefined();
    });

    it("returns the target with the greatest y-position", () => {
        const targets: ReadonlyArray<FallingTarget> = [
            {
                id: 0,
                hexadecimalValue: 13,
                y: 40,
            },
            {
                id: 1,
                hexadecimalValue: 42,
                y: 170,
            },
            {
                id: 2,
                hexadecimalValue: 7,
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

        expect(result.binaryDigits).toEqual([
            0, 0, 0, 0, 0, 0, 0, 1,
        ]);
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
            y: 100,
        };

        const state = createTestState({
            targets: [target],
        });

        const result = tick(state);

        expect(result.targets[0].y).toBe(102);
        expect(state.targets[0].y).toBe(100);
    });

    it("removes a correctly matched target at the line", () => {
        const binaryThirteen: BinaryDigits = [
            0, 0, 0, 0, 1, 1, 0, 1,
        ];

        const state = createTestState({
            binaryDigits: binaryThirteen,
            targets: [
                {
                    id: 0,
                    hexadecimalValue: 13,

                    // After moving by 2, its bottom reaches y = 300.
                    y: 262,
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
                    y: 262,
                },
            ],
        });

        const result = tick(state);

        expect(result.gameEnd).toBe(true);
    });
});

describe("random integer generation", () => {
    it("can produce the minimum value", () => {
        const alwaysMinimum = (): number => 0;

        expect(
            randomInteger(1000, 3000, alwaysMinimum),
        ).toBe(1000);
    });

    it("can produce the maximum value", () => {
        const almostOne = (): number => 0.999999;

        expect(
            randomInteger(1000, 3000, almostOne),
        ).toBe(3000);
    });
});

it("adds one point to the existing score", () => {
    const binaryThirteen: BinaryDigits = [
        0, 0, 0, 0, 1, 1, 0, 1,
    ];

    const state = createTestState({
        binaryDigits: binaryThirteen,
        score: 4,
        targets: [
            {
                id: 0,
                hexadecimalValue: 13,

                // After moving by 2, the target reaches the line.
                y: 262,
            },
        ],
    });

    const result = tick(state);

    expect(result.score).toBe(5);
});