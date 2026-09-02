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

/*
 * Creates one random whole number between min and max
 *
 * The same starting seed always produces the same result. The function also
 * returns nextSeed, which is used the next time another random number
 * is needed. This lets the game create different random numbers without
 * repeatedly calling Math.random or changing a shared variable.
 */
export const randomInteger = (
    seed: number,
    min: number,
    max: number,
): RandomResult => {
    //uses the current seed in a fixed calculation to create the next seed
    // >>> 0 keeps the result inside the range of a positive 32-bit number
    const nextSeed = (Math.imul(1_664_525, seed) + 1_013_904_223) >>> 0;
    //changes the seed into a decimal value starting at 0 and staying below 1
    const unitValue = nextSeed / UINT32_RANGE;

    //stretches that decimal value to fit between the requested min and max.
    return {
        value: Math.floor(unitValue * (max - min + 1)) + min,
        nextSeed,
    };
};

//creates the three random challenge goals shown at the start of a game
export const generateChallengeGoals = (seed: number): ChallengeSetup => {
    // First, choose the score needed for the normal score challenge.
    const scoreResult = randomInteger(
        seed,
        CONSTANTS.MIN_SCORE_CHALLENGE,
        CONSTANTS.MAX_SCORE_CHALLENGE,
    );
    //uses the next seed to choose how many targets must be solved.
    const fastCountResult = randomInteger(
        scoreResult.nextSeed,
        CONSTANTS.MIN_FAST_TARGETS,
        CONSTANTS.MAX_FAST_TARGETS,
    );
    //uses the next seed again to choose the time limit for the challenge
    const fastSecondsResult = randomInteger(
        fastCountResult.nextSeed,
        CONSTANTS.MIN_FAST_SECONDS,
        CONSTANTS.MAX_FAST_SECONDS,
    );
    //choose the score goal without making a mistake (the challenge)
    const flawlessResult = randomInteger(
        fastSecondsResult.nextSeed,
        CONSTANTS.MIN_FLAWLESS_SCORE,
        CONSTANTS.MAX_FLAWLESS_SCORE,
    );

    //return all three goals together, plus the seed needed later in the code
    return {
        goals: {
            scoreTarget: scoreResult.value,
            fastTargetCount: fastCountResult.value,
            // the game measures time in ticks, so convert seconds into ticks.
            fastTimeLimitTicks:
                fastSecondsResult.value * (1000 / CONSTANTS.TICK_RATE_MS),
            flawlessScoreTarget: flawlessResult.value,
        },
        nextSeed: flawlessResult.nextSeed,
    };
};

/*
 creates the first seed when the page starts. This is the only 
 place where the game calls Math.random. After this point,
 randomInteger uses the seed and returns a new seed using 
 the previous seed
 */
export const createInitialSeed = (): number =>
    Math.floor(Math.random() * UINT32_RANGE) >>> 0;

/*
 Stores the starting value of every part of the game.
 New game states copy these values rather than changing 
 the entire system
 */
export const initialState: State = {
    //the eight binary controls all begin at 0
    binaryDigits: [0, 0, 0, 0, 0, 0, 0, 0],
    //no targets are falling when a game begins
    targets: [],
    score: 0,
    elapsedTicks: 0,
    targetsSolved: 0,
    fastTargetsSolved: 0,
    //these values are replaced with random challenge goals
    challengeGoals: {
        scoreTarget: 10,
        fastTargetCount: 5,
        fastTimeLimitTicks: 150,
        flawlessScoreTarget: 20,
    },
    challengeSeed: 0,
    completedChallenges: [],
    //previous scores exist only while the page remains open
    scoreHistory: [],
    isPaused: false,
    gameEnd: false,
};

export const flipBit = (bit: Bit): Bit => (bit === 0 ? 1 : 0);

/* 
changes only the bit whose index matches the selected index. 
*/
const updateBit = (bit: Bit, index: number, selectedIndex: number): Bit =>
    index === selectedIndex ? flipBit(bit) : bit;

export const flipBinaryDigit = (
    binaryDigits: BinaryDigits,
    selectedIndex: number,
): BinaryDigits => [
    //builds a new group of eight bits. updateBit changes the selected bit and
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
/*
flipbit only changes one bit, and flipbinarydigit receives all 8 digits
and the position selected by the player, and it creates a new 8 digit group 
where only the selected bits are changed.
*/

/*
this function converts the player's eight binary digit to a normal decimal
number that can be compared with a target closest to the line
reduce --> reads the binary digit one by one from left to right
 */
export const binaryToDecimal = (binaryDigits: BinaryDigits): number =>
    binaryDigits.reduce<number>(
        (currentValue, bit) => currentValue * 2 + bit,
        0,
    );

/*
 creates a fresh game using a seed.
 It starts from initialState, adds new generated challenge goals, and keeps
 any scores recorded from previous games in the score history
 */
export const createGameState = (
    seed: number,
    scoreHistory: ReadonlyArray<number> = [],
): State => {
    //generates the new challenge numbers before building the State object.
    const challengeSetup = generateChallengeGoals(seed);

    //...initialState copies every starting value into a new object.
    return {
        ...initialState,
        challengeGoals: challengeSetup.goals,
        challengeSeed: challengeSetup.nextSeed,
        scoreHistory,
    };
};

/*
 Creates the data for one new falling target.
 Its y-position starts above the top of the canvas, 
 so it enters the visible game box where target falls
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

/*
finds the falling target that is closest to the yellow checking line.
A larger y-position means that the target is closer to the line
The result is undefined when there are no targets
 */
export const getLowestTarget = (
    targets: ReadonlyArray<FallingTarget>,
): FallingTarget | undefined =>
    //compare each target with the lowest target found so far
    targets.reduce<FallingTarget | undefined>(
        (lowestTarget, currentTarget) =>
            lowestTarget === undefined || currentTarget.y > lowestTarget.y
                ? currentTarget
                : lowestTarget,
        undefined,
    );

/*
 calculates how far targets should move during one tick.
 The speed begins at STARTING_TARGET_SPEED and slowly increases as player 
 keeps going. Math.min prevents it from going above max_target_speed.
 */
export const targetSpeed = (elapsedTicks: number): number =>
    Math.min(
        CONSTANTS.STARTING_TARGET_SPEED +
            (CONSTANTS.MAX_TARGET_SPEED - CONSTANTS.STARTING_TARGET_SPEED) *
                (elapsedTicks / CONSTANTS.TICKS_TO_MAX_SPEED),
        CONSTANTS.MAX_TARGET_SPEED,
    );

/*
 checks all challenge rules and returns the IDs of completed challenges
 */
export const updateCompletedChallenges = (
    state: State,
): ReadonlyArray<ChallengeId> => {
    //if challenge completed, then true, if not, then false
    const challengeResults: ReadonlyArray<readonly [ChallengeId, boolean]> = [
        //complete when the current score reaches the random score goal
        ["scoreTarget", state.score >= state.challengeGoals.scoreTarget],
        [
            "timedTarget",
            //complete when enough targets were solved before the time limit
            state.fastTargetsSolved >= state.challengeGoals.fastTargetCount,
        ],
        [
            "flawlessTarget",
            //complete when the score goal is reached before a mistake ends play
            state.score >= state.challengeGoals.flawlessScoreTarget &&
                !state.gameEnd,
        ],
    ];

    //starts with challenges that were already complete, then adding any new
    // completed IDs. includes prevents the same ID from being added twice
    return challengeResults.reduce<ReadonlyArray<ChallengeId>>(
        (completed, [challengeId, isComplete]) =>
            isComplete && !completed.includes(challengeId)
                ? [...completed, challengeId]
                : completed,
        state.completedChallenges,
    );
};

/*
 updates the state after the player correctly matches a target
 */
const resolveCorrectTarget = (
    state: State,
    lowestTarget: FallingTarget,
): State => {
    //check whether the correct answer happened before the timed limit ended
    const matchedDuringChallenge =
        state.elapsedTicks <= state.challengeGoals.fastTimeLimitTicks;

    //create a new State containing the result of the correct answer
    const matchedState: State = {
        //copies every unchanged things from the old game state
        ...state,
        //removes the solved target while keeping all other targets
        targets: state.targets.filter(target => target.id !== lowestTarget.id),
        //gives one point and record one more solved target
        score: state.score + 1,
        targetsSolved: state.targetsSolved + 1,
        //adds to the timed count only if the answer was given and correct
        //before the time limit
        fastTargetsSolved:
            state.fastTargetsSolved + (matchedDuringChallenge ? 1 : 0),
    };

    //checks whether this new score has any matching challenge requirements
    return {
        ...matchedState,
        completedChallenges: updateCompletedChallenges(matchedState),
    };
};

/*
 checks the target that reached the yellow line
 A correct binary value gives a point. A different value makes 
 it game over
 */
const resolveLowestTarget = (
    state: State,
    lowestTarget: FallingTarget,
): State =>
    binaryToDecimal(state.binaryDigits) === lowestTarget.hexadecimalValue
        ? resolveCorrectTarget(state, lowestTarget)
        : { ...state, gameEnd: true };

/*
makes the running game continue as time passes
*/
const advanceActiveState = (state: State): State => {
    //create the next state with one more tick
    const movedState: State = {
        ...state,
        elapsedTicks: state.elapsedTicks + 1,
        //create a new target array and move every target down
        targets: state.targets.map(target => ({
            ...target,
            y: target.y + targetSpeed(state.elapsedTicks),
        })),
    };
    //only the lowest target can be the next one to cross the checking line
    const lowestTarget = getLowestTarget(movedState.targets);

    //with no target, only movement and time need updating. If the lowest target
    //has not reached the line, keep moving. Otherwise, check the player's
    //answer
    return lowestTarget === undefined
        ? movedState
        : lowestTarget.y + TARGET.HEIGHT < CONSTANTS.CHECK_LINE_Y
          ? movedState
          : resolveLowestTarget(movedState, lowestTarget);
};

/*
 * handles one signal from the game clock.
 * A finished or paused game does not move. A running game moves forward
 */
export const tick = (state: State): State =>
    state.gameEnd || state.isPaused ? state : advanceActiveState(state);

/*
 creates a fresh State after the restart button is pressed.
 If the previous game had started, its final score is added to scoreHistory.
 The saved challenge seed is used to generate different goals for the new 
 game so it can be randomized
 */
export const restartGame = (state: State): State =>
    createGameState(
        state.challengeSeed,
        state.elapsedTicks > 0
            ? [...state.scoreHistory, state.score]
            : state.scoreHistory,
    );

/*
 Receives the current state and one GameEvent, then returns the next state.
 The event type tells the function what happened. Every case creates new data
 when a change is needed instead of directly changing the current State.
 */
export const reduceState = (state: State, event: GameEvent): State => {
    switch (event.type) {
        case "FlipBinaryDigit":
            //ignores input after game over or while paused. Otherwise, copy the
            //state and replace binaryDigits with the new digits
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
            //ignores new targets when play is inactive. During, create a new
            //target array containing all existing targets and the new target
            return state.gameEnd || state.isPaused
                ? state
                : { ...state, targets: [...state.targets, event.target] };

        case "Tick":
            //continue moving time and targets when the game is active
            return tick(state);

        case "TogglePause":
            //do not pause after Game Over. Otherwise, reverse isPaused
            return state.gameEnd
                ? state
                : { ...state, isPaused: !state.isPaused };

        case "Restart":
            //replace the current state with a new created game state
            return restartGame(state);
    }
};
