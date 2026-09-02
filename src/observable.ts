import {
    NEVER,
    Observable,
    defer,
    expand,
    filter,
    fromEvent,
    interval,
    last,
    map,
    merge,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    take,
} from "rxjs";
import type { OperatorFunction } from "rxjs";

import { CONSTANTS, TARGET, VIEWPORT } from "./model";
import type { GameEvent, State } from "./model";
import {
    createGameState,
    createInitialSeed,
    createTarget,
    randomInteger,
    reduceState,
} from "./state";
import { queryElement } from "./dom";

/*
 TargetSequence keeps track of the current random seed and the ID
 that will be given to the next target. ScheduledTarget then stores
 the updated sequence together with the SpawnTarget event that should
 happen next. This lets the program create targets one after another
 without changing the original data or using too many random
 */
const mapToValue = <const Value>(
    value: Value,
): OperatorFunction<unknown, Value> => map(() => value);

type TargetSequence = Readonly<{
    seed: number;
    nextTargetId: number;
}>;

type ScheduledTarget = Readonly<{
    nextSequence: TargetSequence;
    event: GameEvent;
}>;

/*
 * Prepares the information needed to create one falling target.
 *
 * First, it uses the seed to generate three random values:
 * how long to wait before showing the target, the hexadecimal number displayed
 * on it, and its horizontal position.
 * Each calculation also provides the seed required for the next calculation.
 * This avoids calling Math.random so the function stays pure
 * Next, the function counts signals from activePulse$. One signal is produced
 * every time the running game clock updates. When enough signals have been
 * counted, the function creates a SpawnTarget event. While the game is paused,
 * activePulse$ produces no signals. Therefore, the waiting count also pauses
 * and continues from the same point when the player resumes the game
 */
const scheduleTarget = (
    sequence: TargetSequence,
    activePulse$: Observable<number>,
): Observable<ScheduledTarget> => {
    const delayResult = randomInteger(
        sequence.seed,
        CONSTANTS.MIN_TARGET_SPAWN_MS,
        CONSTANTS.MAX_TARGET_SPAWN_MS,
    );
    const valueResult = randomInteger(
        delayResult.nextSeed,
        0,
        CONSTANTS.MAX_TARGET_VALUE,
    );
    const xResult = randomInteger(
        valueResult.nextSeed,
        0,
        VIEWPORT.CANVAS_WIDTH - TARGET.WIDTH,
    );
    const delayTicks = Math.ceil(delayResult.value / CONSTANTS.TICK_RATE_MS);

    return activePulse$.pipe(
        take(delayTicks),
        last(),
        map(() => ({
            nextSequence: {
                seed: xResult.nextSeed,
                nextTargetId: sequence.nextTargetId + 1,
            },
            event: {
                type: "SpawnTarget" as const,
                target: createTarget(
                    sequence.nextTargetId,
                    valueResult.value,
                    xResult.value,
                ),
            },
        })),
    );
};

/*
 * createTargetStream creates the continuous stream of falling targets.
 * It starts with the initial seed and target ID 0, then scheduleTarget
 * creates the first target. expand keeps creating more target using
 * the updated seed and ID, while map returns only the GameEvent needed
 * by the rest of the game.
 */

const createTargetStream = (
    initialSeed: number,
    activePulse$: Observable<number>,
): Observable<GameEvent> =>
    // defer gives each subscription its own immutable target sequence.
    defer(() =>
        scheduleTarget(
            { seed: initialSeed, nextTargetId: 0 },
            activePulse$,
        ).pipe(
            //expand schedules the next target from the previous target's seed.
            expand(({ nextSequence }) =>
                scheduleTarget(nextSequence, activePulse$),
            ),
            map(({ event }) => event),
        ),
    );

/*
 createRestartingTargetStream makes a new target stream whenever the
 game restarts. scan creates a new seed so the restarted game gets a
 different target sequence, and switchMap stops the old target stream
 before starting a new one with the new seed.
 */

export const createRestartingTargetStream = (
    initialSeed: number,
    restart$: Observable<unknown>,
    activePulse$: Observable<number>,
): Observable<GameEvent> =>
    restart$.pipe(
        //make the seed on restart so a new game receives a new sequence.
        scan(
            seed => randomInteger(seed, 0, CONSTANTS.MAX_TARGET_VALUE).nextSeed,
            initialSeed,
        ),
        startWith(initialSeed),
        //switchMap cancels the old schedule before starting the replacement
        switchMap(seed => createTargetStream(seed, activePulse$)),
    );

/*
 createActivePulseStream controls the game's timer while pausing and
 resuming. When the game is paused, NEVER stops timer values from being
 produced. When the game resumes, interval starts producing values again
 at the chosen rate. share lets other parts of the game use the same
 timer stream instead of creating other timers.
 */
export const createActivePulseStream = (
    isPaused$: Observable<boolean>,
    tickRateMs: number = CONSTANTS.TICK_RATE_MS,
): Observable<number> =>
    isPaused$.pipe(
        switchMap(isPaused => (isPaused ? NEVER : interval(tickRateMs))),
        share(),
    );

const getClickedDigitElement = (event: MouseEvent): Element | null =>
    event.target instanceof Element
        ? event.target.closest("[data-digit-index]")
        : null;

/*
 builds the event streams and reduces them into the single 
 game-state observable. DOM reads happen once during setup, 
 state changes are handled by the pure reduceState function 
 used by scan.
 */
export const state$ = (): Observable<State> => {
    const svg = queryElement<SVGSVGElement>("#svgCanvas");
    const restartButton = queryElement<HTMLButtonElement>("#restartButton");
    const pauseButton = queryElement<HTMLButtonElement>("#pauseButton");
    const startingState = createGameState(createInitialSeed());
    const pauseClick$ = fromEvent(pauseButton, "click").pipe(share());
    const restartClick$ = fromEvent(restartButton, "click").pipe(share());
    const isPaused$ = merge(
        pauseClick$.pipe(mapToValue("toggle")),
        restartClick$.pipe(mapToValue("resume")),
    ).pipe(
        //pause clicks stops the value, restarting always resumes the game
        scan(
            (isPaused, command) => (command === "toggle" ? !isPaused : false),
            false,
        ),
        startWith(false),
        //both clocks need the latest pause value without separate state.
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    /*
     * These streams connect the game timer, target spawning, and keyboard
     * controls. activePulse$ produces ticks while the game is running,
     * tick$ turns each pulse into a Tick event, and spawnTarget$ creates
     * the target events. digitKey$ waits for keys 1-8 and converts a
     * the press into a FlipBinaryDigit event for the matching bit.
     */

    const activePulse$ = createActivePulseStream(isPaused$);
    const tick$ = activePulse$.pipe(mapToValue({ type: "Tick" }));
    const spawnTarget$ = createRestartingTargetStream(
        startingState.challengeSeed,
        restartClick$,
        activePulse$,
    );
    const digitKey$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        // Ignore held-key repeats and accept only the eight digit controls.
        filter(({ code, repeat }) => !repeat && /^Digit[1-8]$/.test(code)),
        map(
            ({ code }): GameEvent => ({
                type: "FlipBinaryDigit",
                index: Number(code.at(-1)) - 1,
            }),
        ),
    );

    /*
     * digitClick$ is for mouse clicks on the binary digits, finds which
     * digit was clicked, checks that the index is valid, and turns it into a
     * FlipBinaryDigit event. restart$ and pause$ convert button clicks into
     * Restart and TogglePause events. merge combines all game events into one
     * stream, and scan uses each event to produce the next game state.
     */

    const digitClick$ = fromEvent<MouseEvent>(svg, "click").pipe(
        // Event delegation handles clicks on either a digit's text or rectangle.
        map(getClickedDigitElement),
        filter((element): element is Element => element !== null),
        map(element => Number(element.getAttribute("data-digit-index"))),
        filter(
            index =>
                Number.isInteger(index) &&
                index >= 0 &&
                index < CONSTANTS.DIGIT_COUNT,
        ),
        map((index): GameEvent => ({ type: "FlipBinaryDigit", index })),
    );
    const restart$ = restartClick$.pipe(mapToValue({ type: "Restart" }));
    const pause$ = pauseClick$.pipe(mapToValue({ type: "TogglePause" }));

    return merge(
        tick$,
        spawnTarget$,
        digitKey$,
        digitClick$,
        restart$,
        pause$,
        //scan is the state-management boundary, every event creates a state.
    ).pipe(scan(reduceState, startingState), startWith(startingState));
};
