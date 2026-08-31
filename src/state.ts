import { CONSTANTS, TARGET } from "./constants";
import { generateChallengeGoals } from "./random";
import type {
    BinaryDigits,
    Bit,
    ChallengeId,
    FallingTarget,
    GameEvent,
    State,
} from "./types";

export const initialState: State = {
    binaryDigits: [0, 0, 0, 0, 0, 0, 0, 0],
    targets: [],
    score: 0,
    elapsedTicks: 0,
    targetsSolved: 0,
    fastTargetsSolved: 0,
    challengeGoals: {
        scoreTarget: 10,
        fastTargetCount: 5,
        fastTimeLimitTicks: 150,
        flawlessScoreTarget: 20,
    },
    challengeSeed: 0,
    completedChallenges: [],
    scoreHistory: [],
    isPaused: false,
    gameEnd: false,
};

export const flipBit = (bit: Bit): Bit => (bit === 0 ? 1 : 0);

const updateBit = (bit: Bit, index: number, selectedIndex: number): Bit =>
    index === selectedIndex ? flipBit(bit) : bit;

export const flipBinaryDigit = (
    binaryDigits: BinaryDigits,
    selectedIndex: number,
): BinaryDigits => [
    updateBit(binaryDigits[0], 0, selectedIndex),
    updateBit(binaryDigits[1], 1, selectedIndex),
    updateBit(binaryDigits[2], 2, selectedIndex),
    updateBit(binaryDigits[3], 3, selectedIndex),
    updateBit(binaryDigits[4], 4, selectedIndex),
    updateBit(binaryDigits[5], 5, selectedIndex),
    updateBit(binaryDigits[6], 6, selectedIndex),
    updateBit(binaryDigits[7], 7, selectedIndex),
];

export const binaryToDecimal = (binaryDigits: BinaryDigits): number =>
    binaryDigits.reduce<number>(
        (currentValue, bit) => currentValue * 2 + bit,
        0,
    );

export const createGameState = (
    seed: number,
    scoreHistory: ReadonlyArray<number> = [],
): State => {
    const challengeSetup = generateChallengeGoals(seed);

    return {
        ...initialState,
        challengeGoals: challengeSetup.goals,
        challengeSeed: challengeSetup.nextSeed,
        scoreHistory,
    };
};

export const createTarget = (
    id: number,
    hexadecimalValue: number,
    x: number,
): FallingTarget => ({
    id,
    hexadecimalValue,
    x,
    y: -TARGET.HEIGHT,
});

export const getLowestTarget = (
    targets: ReadonlyArray<FallingTarget>,
): FallingTarget | undefined =>
    targets.reduce<FallingTarget | undefined>(
        (lowestTarget, currentTarget) =>
            lowestTarget === undefined || currentTarget.y > lowestTarget.y
                ? currentTarget
                : lowestTarget,
        undefined,
    );

export const targetSpeed = (elapsedTicks: number): number =>
    Math.min(
        CONSTANTS.STARTING_TARGET_SPEED +
            (CONSTANTS.MAX_TARGET_SPEED - CONSTANTS.STARTING_TARGET_SPEED) *
                (elapsedTicks / CONSTANTS.TICKS_TO_MAX_SPEED),
        CONSTANTS.MAX_TARGET_SPEED,
    );

export const updateCompletedChallenges = (
    state: State,
): ReadonlyArray<ChallengeId> => {
    const challengeResults: ReadonlyArray<readonly [ChallengeId, boolean]> = [
        ["scoreTarget", state.score >= state.challengeGoals.scoreTarget],
        [
            "timedTarget",
            state.fastTargetsSolved >= state.challengeGoals.fastTargetCount,
        ],
        [
            "flawlessTarget",
            state.score >= state.challengeGoals.flawlessScoreTarget &&
                !state.gameEnd,
        ],
    ];

    return challengeResults.reduce<ReadonlyArray<ChallengeId>>(
        (completed, [challengeId, isComplete]) =>
            isComplete && !completed.includes(challengeId)
                ? [...completed, challengeId]
                : completed,
        state.completedChallenges,
    );
};

const resolveCorrectTarget = (
    state: State,
    lowestTarget: FallingTarget,
): State => {
    const matchedDuringChallenge =
        state.elapsedTicks <= state.challengeGoals.fastTimeLimitTicks;
    const matchedState: State = {
        ...state,
        targets: state.targets.filter(target => target.id !== lowestTarget.id),
        score: state.score + 1,
        targetsSolved: state.targetsSolved + 1,
        fastTargetsSolved:
            state.fastTargetsSolved + (matchedDuringChallenge ? 1 : 0),
    };

    return {
        ...matchedState,
        completedChallenges: updateCompletedChallenges(matchedState),
    };
};

const resolveLowestTarget = (
    state: State,
    lowestTarget: FallingTarget,
): State =>
    binaryToDecimal(state.binaryDigits) === lowestTarget.hexadecimalValue
        ? resolveCorrectTarget(state, lowestTarget)
        : { ...state, gameEnd: true };

const advanceActiveState = (state: State): State => {
    const movedState: State = {
        ...state,
        elapsedTicks: state.elapsedTicks + 1,
        targets: state.targets.map(target => ({
            ...target,
            y: target.y + targetSpeed(state.elapsedTicks),
        })),
    };
    const lowestTarget = getLowestTarget(movedState.targets);

    return lowestTarget === undefined
        ? movedState
        : lowestTarget.y + TARGET.HEIGHT < CONSTANTS.CHECK_LINE_Y
          ? movedState
          : resolveLowestTarget(movedState, lowestTarget);
};

export const tick = (state: State): State =>
    state.gameEnd || state.isPaused ? state : advanceActiveState(state);

export const restartGame = (state: State): State =>
    createGameState(
        state.challengeSeed,
        state.elapsedTicks > 0
            ? [...state.scoreHistory, state.score]
            : state.scoreHistory,
    );

export const reduceState = (state: State, event: GameEvent): State => {
    switch (event.type) {
        case "FlipBinaryDigit":
            return state.gameEnd || state.isPaused
                ? state
                : {
                      ...state,
                      binaryDigits: flipBinaryDigit(
                          state.binaryDigits,
                          event.index,
                      ),
                  };

        case "SpawnTarget":
            return state.gameEnd || state.isPaused
                ? state
                : { ...state, targets: [...state.targets, event.target] };

        case "Tick":
            return tick(state);

        case "TogglePause":
            return state.gameEnd
                ? state
                : { ...state, isPaused: !state.isPaused };

        case "Restart":
            return restartGame(state);
    }
};
