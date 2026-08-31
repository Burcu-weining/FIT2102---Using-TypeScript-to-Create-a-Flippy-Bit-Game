import { CONSTANTS } from "./constants";
import type { ChallengeSetup, RandomResult } from "./types";

const UINT32_RANGE = 0x1_0000_0000;

export const randomInteger = (
    seed: number,
    min: number,
    max: number,
): RandomResult => {
    const nextSeed = (Math.imul(1_664_525, seed) + 1_013_904_223) >>> 0;
    const unitValue = nextSeed / UINT32_RANGE;

    return {
        value: Math.floor(unitValue * (max - min + 1)) + min,
        nextSeed,
    };
};

export const generateChallengeGoals = (seed: number): ChallengeSetup => {
    const scoreResult = randomInteger(
        seed,
        CONSTANTS.MIN_SCORE_CHALLENGE,
        CONSTANTS.MAX_SCORE_CHALLENGE,
    );
    const fastCountResult = randomInteger(
        scoreResult.nextSeed,
        CONSTANTS.MIN_FAST_TARGETS,
        CONSTANTS.MAX_FAST_TARGETS,
    );
    const fastSecondsResult = randomInteger(
        fastCountResult.nextSeed,
        CONSTANTS.MIN_FAST_SECONDS,
        CONSTANTS.MAX_FAST_SECONDS,
    );
    const flawlessResult = randomInteger(
        fastSecondsResult.nextSeed,
        CONSTANTS.MIN_FLAWLESS_SCORE,
        CONSTANTS.MAX_FLAWLESS_SCORE,
    );

    return {
        goals: {
            scoreTarget: scoreResult.value,
            fastTargetCount: fastCountResult.value,
            fastTimeLimitTicks:
                fastSecondsResult.value * (1000 / CONSTANTS.TICK_RATE_MS),
            flawlessScoreTarget: flawlessResult.value,
        },
        nextSeed: flawlessResult.nextSeed,
    };
};

export const createInitialSeed = (): number =>
    Math.floor(Math.random() * UINT32_RANGE) >>> 0;
