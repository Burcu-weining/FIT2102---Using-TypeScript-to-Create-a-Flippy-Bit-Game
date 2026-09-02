/*
model.ts defines the game's data model, the constants,
types, and permitted events used throughout the game. 
It does not run the game or change its state
*/

/*
viewpoint stores the dimensions of the SVG game pixels.
*/
export const VIEWPORT = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

/*
Defining the size for each hexadecimal boxes
*/
export const TARGET = {
    WIDTH: 64,
    HEIGHT: 36,
} as const;

export const CONSTANTS = {
    DIGIT_COUNT: 8,
    TICK_RATE_MS: 100,
    STARTING_TARGET_SPEED: 2.5,
    MAX_TARGET_SPEED: 10,
    TICKS_TO_MAX_SPEED: 1200,
    MIN_TARGET_SPAWN_MS: 1000,
    MAX_TARGET_SPAWN_MS: 3000,
    MAX_TARGET_VALUE: 0xff, //255
    CHECK_LINE_Y: 300,
    MIN_SCORE_CHALLENGE: 8,
    MAX_SCORE_CHALLENGE: 12,
    MIN_FAST_TARGETS: 3,
    MAX_FAST_TARGETS: 6,
    MIN_FAST_SECONDS: 12,
    MAX_FAST_SECONDS: 20,
    MIN_FLAWLESS_SCORE: 15,
    MAX_FLAWLESS_SCORE: 25,
} as const;

export type Bit = 0 | 1;

export type BinaryDigits = readonly [Bit, Bit, Bit, Bit, Bit, Bit, Bit, Bit];

/*
This describes the falling target, id uniquely identifies
the falling target, and x and y is its position.
*/
export type FallingTarget = Readonly<{
    id: number;
    hexadecimalValue: number;
    x: number;
    y: number;
}>;

/*
This defines the challenge the player can try to beat
while playing the game
*/

/*
ChallengeId is used so the game can identify which challenge has 
been completed. When a challenge is complete, the ID is stored.
So now, the game can use that ID to remember which challenge is complete,
display the trophy, and turn the text green. 
This prevents the same challenge being added more than once
*/
export type ChallengeId = "scoreTarget" | "timedTarget" | "flawlessTarget";
export type ChallengeGoals = Readonly<{
    scoreTarget: number;
    fastTargetCount: number;
    fastTimeLimitTicks: number;
    flawlessScoreTarget: number;
}>;

export type State = Readonly<{
    binaryDigits: BinaryDigits;
    targets: ReadonlyArray<FallingTarget>;
    score: number;
    elapsedTicks: number;
    targetsSolved: number;
    fastTargetsSolved: number;
    challengeGoals: ChallengeGoals;
    challengeSeed: number;
    completedChallenges: ReadonlyArray<ChallengeId>;
    scoreHistory: ReadonlyArray<number>;
    isPaused: boolean;
    gameEnd: boolean;
}>;

/*
GameEvent lists every event that is allowed to change
the state
*/
export type GameEvent =
    | Readonly<{ type: "Tick" }>
    | Readonly<{ type: "FlipBinaryDigit"; index: number }>
    | Readonly<{ type: "SpawnTarget"; target: FallingTarget }>
    | Readonly<{ type: "TogglePause" }>
    | Readonly<{ type: "Restart" }>;

export type RandomResult = Readonly<{
    value: number;
    nextSeed: number;
}>;

export type ChallengeSetup = Readonly<{
    goals: ChallengeGoals;
    nextSeed: number;
}>;
