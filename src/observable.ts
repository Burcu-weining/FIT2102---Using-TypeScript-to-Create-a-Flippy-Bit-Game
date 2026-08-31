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

import { CONSTANTS, TARGET, VIEWPORT } from "./constants";
import { createInitialSeed, randomInteger } from "./random";
import { createGameState, createTarget, reduceState } from "./state";
import type { GameEvent, State } from "./types";
import { queryElement } from "./dom";

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

const createTargetStream = (
    initialSeed: number,
    activePulse$: Observable<number>,
): Observable<GameEvent> =>
    defer(() =>
        scheduleTarget(
            { seed: initialSeed, nextTargetId: 0 },
            activePulse$,
        ).pipe(
            expand(({ nextSequence }) =>
                scheduleTarget(nextSequence, activePulse$),
            ),
            map(({ event }) => event),
        ),
    );

export const createRestartingTargetStream = (
    initialSeed: number,
    restart$: Observable<unknown>,
    activePulse$: Observable<number>,
): Observable<GameEvent> =>
    restart$.pipe(
        scan(
            seed => randomInteger(seed, 0, CONSTANTS.MAX_TARGET_VALUE).nextSeed,
            initialSeed,
        ),
        startWith(initialSeed),
        switchMap(seed => createTargetStream(seed, activePulse$)),
    );

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
        scan(
            (isPaused, command) => (command === "toggle" ? !isPaused : false),
            false,
        ),
        startWith(false),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const activePulse$ = createActivePulseStream(isPaused$);
    const tick$ = activePulse$.pipe(mapToValue({ type: "Tick" }));
    const spawnTarget$ = createRestartingTargetStream(
        startingState.challengeSeed,
        restartClick$,
        activePulse$,
    );
    const digitKey$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(({ code, repeat }) => !repeat && /^Digit[1-8]$/.test(code)),
        map(
            ({ code }): GameEvent => ({
                type: "FlipBinaryDigit",
                index: Number(code.at(-1)) - 1,
            }),
        ),
    );
    const digitClick$ = fromEvent<MouseEvent>(svg, "click").pipe(
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
    ).pipe(scan(reduceState, startingState), startWith(startingState));
};
