import { CONSTANTS, TARGET } from "./model";
import type {
    BinaryDigits,
    Bit,
    ChallengeId,
    ChallengeSetup,
    FallingTarget,
    GameEvent,
    RandomResult,
    State,
} from "./model";

const UINT32_RANGE = 0x1_0000_0000;

/**
 * Creates one random-looking whole number between min and max.
 *
 * The same starting seed always produces the same result. The function also
 * returns nextSeed, which is used the next time another random-looking number
 * is needed. This lets the game create different targets without repeatedly
 * calling Math.random or changing a shared variable.
 */
export const randomInteger = (
    seed: number,
    min: number,
    max: number,
): RandomResult => {
    // Use the current seed in a fixed calculation to create the next seed.
    // >>> 0 keeps the result inside the range of a positive 32-bit number.
    const nextSeed = (Math.imul(1_664_525, seed) + 1_013_904_223) >>> 0;
    // Change the seed into a decimal value starting at 0 and staying below 1.
    const unitValue = nextSeed / UINT32_RANGE;

    // Stretch that decimal value to fit between the requested min and max.
    return {
        value: Math.floor(unitValue * (max - min + 1)) + min,
        nextSeed,
    };
};

/** Creates the three random challenge goals shown at the start of a game. */
export const generateChallengeGoals = (seed: number): ChallengeSetup => {
    // First, choose the score needed for the normal score challenge.
    const scoreResult = randomInteger(
        seed,
        CONSTANTS.MIN_SCORE_CHALLENGE,
        CONSTANTS.MAX_SCORE_CHALLENGE,
    );
    // Use the next seed to choose how many targets must be solved quickly.
    const fastCountResult = randomInteger(
        scoreResult.nextSeed,
        CONSTANTS.MIN_FAST_TARGETS,
        CONSTANTS.MAX_FAST_TARGETS,
    );
    // Use the next seed again to choose the time limit for that challenge.
    const fastSecondsResult = randomInteger(
        fastCountResult.nextSeed,
        CONSTANTS.MIN_FAST_SECONDS,
        CONSTANTS.MAX_FAST_SECONDS,
    );
    // Finally, choose the score needed without making a mistake.
    const flawlessResult = randomInteger(
        fastSecondsResult.nextSeed,
        CONSTANTS.MIN_FLAWLESS_SCORE,
        CONSTANTS.MAX_FLAWLESS_SCORE,
    );

    // Return all three goals together, plus the seed needed by later code.
    return {
        goals: {
            scoreTarget: scoreResult.value,
            fastTargetCount: fastCountResult.value,
            // The game measures time in ticks, so convert seconds into ticks.
            fastTimeLimitTicks:
                fastSecondsResult.value * (1000 / CONSTANTS.TICK_RATE_MS),
            flawlessScoreTarget: flawlessResult.value,
        },
        nextSeed: flawlessResult.nextSeed,
    };
};

/**
 * Creates the first seed when the page starts.
 * This is the only place where the game calls Math.random. After this point,
 * randomInteger uses the seed and returns a new seed for every later value.
 */
export const createInitialSeed = (): number =>
    Math.floor(Math.random() * UINT32_RANGE) >>> 0;

/**
 * Stores the starting value of every part of the game.
 * New game states copy these values rather than changing this object.
 */
export const initialState: State = {
    // The eight binary controls all begin at 0.
    binaryDigits: [0, 0, 0, 0, 0, 0, 0, 0],
    // No targets are falling when a game begins.
    targets: [],
    score: 0,
    elapsedTicks: 0,
    targetsSolved: 0,
    fastTargetsSolved: 0,
    // These values are replaced with random challenge goals for a real game.
    challengeGoals: {
        scoreTarget: 10,
        fastTargetCount: 5,
        fastTimeLimitTicks: 150,
        flawlessScoreTarget: 20,
    },
    challengeSeed: 0,
    completedChallenges: [],
    // Previous scores exist only while the page remains open.
    scoreHistory: [],
    isPaused: false,
    gameEnd: false,
};

/** Changes a binary digit from 0 to 1, or from 1 to 0. */
export const flipBit = (bit: Bit): Bit => (bit === 0 ? 1 : 0);

/** Changes only the bit whose index matches the selected index. */
const updateBit = (bit: Bit, index: number, selectedIndex: number): Bit =>
    index === selectedIndex ? flipBit(bit) : bit;

export const flipBinaryDigit = (
    binaryDigits: BinaryDigits,
    selectedIndex: number,
): BinaryDigits => [
    // Build a new group of eight bits. updateBit changes the selected bit and
    // returns every other bit without changing it.
    updateBit(binaryDigits[0], 0, selectedIndex),
    updateBit(binaryDigits[1], 1, selectedIndex),
    updateBit(binaryDigits[2], 2, selectedIndex),
    updateBit(binaryDigits[3], 3, selectedIndex),
    updateBit(binaryDigits[4], 4, selectedIndex),
    updateBit(binaryDigits[5], 5, selectedIndex),
    updateBit(binaryDigits[6], 6, selectedIndex),
    updateBit(binaryDigits[7], 7, selectedIndex),
];

/**
 * Changes the player's eight binary digits into a normal decimal number.
 * Starting from 0, each bit moves the current value one binary place to the
 * left and then adds the new bit. For example, [1, 0, 1] becomes 5.
 */
export const binaryToDecimal = (binaryDigits: BinaryDigits): number =>
    binaryDigits.reduce<number>(
        (currentValue, bit) => currentValue * 2 + bit,
        0,
    );

/**
 * Creates a fresh game using a supplied seed.
 * It starts from initialState, adds newly generated challenge goals, and keeps
 * any scores recorded from previous games during this browser session.
 */
export const createGameState = (
    seed: number,
    scoreHistory: ReadonlyArray<number> = [],
): State => {
    // Generate the new challenge numbers before building the State object.
    const challengeSetup = generateChallengeGoals(seed);

    // ...initialState copies every starting property into a new object.
    return {
        ...initialState,
        challengeGoals: challengeSetup.goals,
        challengeSeed: challengeSetup.nextSeed,
        scoreHistory,
    };
};

/**
 * Creates the data for one new falling target.
 * Its y-position starts above the top of the canvas, so it enters the visible
 * game area naturally as later ticks move it downward.
 */
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

/**
 * Finds the falling target that is closest to the yellow checking line.
 * A larger y-position means that the target is lower on the canvas.
 * The result is undefined when there are no targets.
 */
export const getLowestTarget = (
    targets: ReadonlyArray<FallingTarget>,
): FallingTarget | undefined =>
    // Compare each target with the lowest target found so far.
    targets.reduce<FallingTarget | undefined>(
        (lowestTarget, currentTarget) =>
            lowestTarget === undefined || currentTarget.y > lowestTarget.y
                ? currentTarget
                : lowestTarget,
        undefined,
    );

/**
 * Calculates how far targets should move during one tick.
 * The speed begins at STARTING_TARGET_SPEED and slowly increases as more ticks
 * pass. Math.min prevents it from going above MAX_TARGET_SPEED.
 */
export const targetSpeed = (elapsedTicks: number): number =>
    Math.min(
        CONSTANTS.STARTING_TARGET_SPEED +
            (CONSTANTS.MAX_TARGET_SPEED - CONSTANTS.STARTING_TARGET_SPEED) *
                (elapsedTicks / CONSTANTS.TICKS_TO_MAX_SPEED),
        CONSTANTS.MAX_TARGET_SPEED,
    );

/** Checks all challenge rules and returns the IDs of completed challenges. */
export const updateCompletedChallenges = (
    state: State,
): ReadonlyArray<ChallengeId> => {
    // Place each challenge ID beside a true or false completion result.
    const challengeResults: ReadonlyArray<readonly [ChallengeId, boolean]> = [
        // Complete when the current score reaches the random score goal.
        ["scoreTarget", state.score >= state.challengeGoals.scoreTarget],
        [
            "timedTarget",
            // Complete when enough targets were solved before the time limit.
            state.fastTargetsSolved >= state.challengeGoals.fastTargetCount,
        ],
        [
            "flawlessTarget",
            // Complete when the score goal is reached before a mistake ends play.
            state.score >= state.challengeGoals.flawlessScoreTarget &&
                !state.gameEnd,
        ],
    ];

    // Start with challenges that were already complete, then add any newly
    // completed IDs. includes prevents the same ID from being added twice.
    return challengeResults.reduce<ReadonlyArray<ChallengeId>>(
        (completed, [challengeId, isComplete]) =>
            isComplete && !completed.includes(challengeId)
                ? [...completed, challengeId]
                : completed,
        state.completedChallenges,
    );
};

/** Updates the State after the player correctly matches a target. */
const resolveCorrectTarget = (
    state: State,
    lowestTarget: FallingTarget,
): State => {
    // Check whether the correct answer happened before the timed limit ended.
    const matchedDuringChallenge =
        state.elapsedTicks <= state.challengeGoals.fastTimeLimitTicks;

    // Create a new State containing the result of the correct answer.
    const matchedState: State = {
        // Copy every unchanged property from the old State.
        ...state,
        // Remove the solved target while keeping all other targets.
        targets: state.targets.filter(target => target.id !== lowestTarget.id),
        // Award one point and record one more solved target.
        score: state.score + 1,
        targetsSolved: state.targetsSolved + 1,
        // Add to the timed count only if the answer was within the time limit.
        fastTargetsSolved:
            state.fastTargetsSolved + (matchedDuringChallenge ? 1 : 0),
    };

    // Check whether this new score has completed any challenge.
    return {
        ...matchedState,
        completedChallenges: updateCompletedChallenges(matchedState),
    };
};

/**
 * Checks the target that reached the yellow line.
 * A correct binary value awards a point. A different value ends the game.
 */
const resolveLowestTarget = (
    state: State,
    lowestTarget: FallingTarget,
): State =>
    binaryToDecimal(state.binaryDigits) === lowestTarget.hexadecimalValue
        ? resolveCorrectTarget(state, lowestTarget)
        : { ...state, gameEnd: true };

/** Moves the running game forward by one clock tick. */
const advanceActiveState = (state: State): State => {
    // Create the next State with one more elapsed tick.
    const movedState: State = {
        ...state,
        elapsedTicks: state.elapsedTicks + 1,
        // Create a new target array and move every target downward.
        targets: state.targets.map(target => ({
            ...target,
            y: target.y + targetSpeed(state.elapsedTicks),
        })),
    };
    // Only the lowest target can be the next one to cross the checking line.
    const lowestTarget = getLowestTarget(movedState.targets);

    // With no target, only movement and time need updating. If the lowest target
    // has not reached the line, keep moving. Otherwise, check the player's answer.
    return lowestTarget === undefined
        ? movedState
        : lowestTarget.y + TARGET.HEIGHT < CONSTANTS.CHECK_LINE_Y
          ? movedState
          : resolveLowestTarget(movedState, lowestTarget);
};

/**
 * Handles one signal from the game clock.
 * A finished or paused game does not move. A running game moves forward once.
 */
export const tick = (state: State): State =>
    state.gameEnd || state.isPaused ? state : advanceActiveState(state);

/**
 * Creates a fresh State after the restart button is pressed.
 * If the previous game had started, its final score is added to scoreHistory.
 * The saved challenge seed is used to generate different goals for the new game.
 */
export const restartGame = (state: State): State =>
    createGameState(
        state.challengeSeed,
        state.elapsedTicks > 0
            ? [...state.scoreHistory, state.score]
            : state.scoreHistory,
    );

/**
 * Receives the current State and one GameEvent, then returns the next State.
 * The event type tells the function what happened. Every case creates new data
 * when a change is needed instead of directly changing the current State.
 */
export const reduceState = (state: State, event: GameEvent): State => {
    switch (event.type) {
        case "FlipBinaryDigit":
            // Ignore input after Game Over or while paused. Otherwise, copy the
            // State and replace binaryDigits with the newly flipped digits.
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
            // Ignore new targets when play is inactive. During play, create a new
            // target array containing all existing targets and the new target.
            return state.gameEnd || state.isPaused
                ? state
                : { ...state, targets: [...state.targets, event.target] };

        case "Tick":
            // Move time and targets forward once when the game is active.
            return tick(state);

        case "TogglePause":
            // Do not pause after Game Over. Otherwise, reverse isPaused.
            return state.gameEnd
                ? state
                : { ...state, isPaused: !state.isPaused };

        case "Restart":
            // Replace the current State with a newly created game State.
            return restartGame(state);
    }
};
