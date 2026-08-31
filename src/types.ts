export type Bit = 0 | 1;

export type BinaryDigits = readonly [Bit, Bit, Bit, Bit, Bit, Bit, Bit, Bit];

export type FallingTarget = Readonly<{
    id: number;
    hexadecimalValue: number;
    x: number;
    y: number;
}>;

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
