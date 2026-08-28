/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import {
    Observable,
    filter,
    fromEvent,
    interval,
    map,
    merge, //merge combines multiple observables.
    scan,
    startWith,
    switchMap,
    take,
    defer,  //creates new random sequence whenever the game starts
    expand,  //schedules the next target after the previous target is emitted
    timer,  //waits once for a specified duration
} from "rxjs";

/*Constants:
 * Values controlling the game dimensions, timing, and difficulty.
 */


const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

const Target = {
    WIDTH: 64,
    HEIGHT: 36,
} as const;

const Constants = {
    DIGIT_COUNT: 8,
    TICK_RATE_MS: 100, // this updates the state 10 times per second
    // Start slowly, then increase smoothly as survival time grows.
    STARTING_TARGET_SPEED: 4,
    MAX_TARGET_SPEED: 10,
    TICKS_TO_MAX_SPEED: 1200,
    //full game targets use random delays from 1-3 secs
    MIN_TARGET_SPAWN_MS: 1000,
    MAX_TARGET_SPAWN_MS: 3000,
    MAX_TARGET_VALUE: 0xff,  //hexadecimal for 255
    CHECK_LINE_Y: 300, // targets are checked at this horizontal line
    CHALLENGE_TIME_LIMIT_TICKS: 150,
} as const;


export type Bit = 0 | 1; //bit can be 0 or 1

/*
 * The player's immutable eight-bit binary digit
 */
export type BinaryDigits = readonly [
    Bit,
    Bit,
    Bit,
    Bit,
    Bit,
    Bit,
    Bit,
    Bit,
];

/*
We also need to define any falling target
 */
export type FallingTarget = Readonly<{
    // a unique number used to identify and remove this target
    id: number;

    // the numeric value the player must represent in binary
    hexadecimalValue: number;

    // the target's current vertical position
    y: number;
}>;

export type ChallengeId =
    | "scoreTen"
    | "fiveInFifteen"
    | "scoreTwenty";


/*
state contains all the info needed to describe the game
*/
export type State = Readonly<{
    //state holds the games current information
    binaryDigits: BinaryDigits;
    targets: ReadonlyArray<FallingTarget>;  //every target currently falling on the screen
    score: number;  //the score afftects what happens on the screen, so it belongs to the game state
    elapsedTicks: number;
    targetsSolved: number;
    fastTargetsSolved: number;
    completedChallenges: ReadonlyArray<ChallengeId>;
    scoreHistory: ReadonlyArray<number>;
    gameEnd: boolean;
}>;


export type GameEvent = //events describe things that can change the game state
    | Readonly<{ type: "Tick" }>  //tick represents time passing
    | Readonly<{ type: "FlipBinaryDigit"; index: number }>  //flipbinarydigit represents a number key being pressed
    | Readonly<{ type: "SpawnTarget"; target: FallingTarget;}>
    | Readonly<{ type: "Restart" }>;

/*
A new game starts with no targets, no score, and all bits off
*/
export const initialState: State = {
    binaryDigits: [0, 0, 0, 0, 0, 0, 0, 0],
    targets: [],
    score: 0,  //every new game begins with 0
    elapsedTicks: 0,
    targetsSolved: 0,
    fastTargetsSolved: 0,
    completedChallenges: [],
    scoreHistory: [],
    gameEnd: false,
};

/*
returns the opposite binary value
*/
export const flipBit = (bit: Bit): Bit => (bit === 0 ? 1 : 0);

/*
this part returns a new set of binary digits with one selected digit that would be flipped
and the original binary digits are not modified.
*/
export const flipBinaryDigit = (
    binaryDigits: BinaryDigits,
    selectedIndex: number,
): BinaryDigits =>
    binaryDigits.map((bit, index) =>
        index === selectedIndex ? flipBit(bit) : bit,
    ) as unknown as BinaryDigits;



/*
 * Converts the player's eight binary digits into a decimal number
 *
 * The calculation reads the bits from left to right
 *
 * Example:
 * 00001101 becomes decimal 13.
 */
export const binaryToDecimal = (binaryDigits: BinaryDigits): number =>
    binaryDigits.reduce<number>(
        (currentValue, bit) => currentValue * 2 + bit,
        0,
    );

/**
 A function capable of producing a number from 0, but not
 including, 1. Math.random is the main funcitno doing this
 */
type RandomSource = () => number;

/**
 Produces an integer between min and max, including both endpoints
 A random source can be supplied during tests. The real game uses
 math.random by default.
 */
export const randomInteger = (
    min: number,
    max: number,
    randomSource: RandomSource = Math.random,
): number =>
    Math.floor(
        randomSource() * (max - min + 1),
    ) + min;

/*
 Selects the delay before the next target appears.
 Randomness is used by the Observable layer, not by the reducer
 */
const randomTargetDelay = (): number =>
    randomInteger(
        Constants.MIN_TARGET_SPAWN_MS,
        Constants.MAX_TARGET_SPAWN_MS,
    );

/**
 * Creates one target using the predefined hexadecimal sequence
 *
 * The remainder  makes the sequence repeat after it ended
 */
const createTarget = (
    id: number,
    hexadecimalValue: number,
): FallingTarget => ({
    id,
    hexadecimalValue,
    y: -Target.HEIGHT,   // Begin just above the visible box in the game

});


/*
 * Finds the lowest target on the screen
 *
 * A larger y-coordinate means that a target is lower on the grid
 * The function returns undefined when there is no target
 */
export const getLowestTarget = (
    targets: ReadonlyArray<FallingTarget>,
): FallingTarget | undefined =>
    targets.reduce<FallingTarget | undefined>(
        (lowestTarget, currentTarget) =>
            lowestTarget === undefined ||
            currentTarget.y > lowestTarget.y
                ? currentTarget
                : lowestTarget,
        undefined,
    );

/*
 * Calculates target speed from survival time.
 *
 * The speed rises smoothly from 4 to 10 over two minutes and is
 * capped so the game remains functionable.
 */
export const targetSpeed = (elapsedTicks: number): number =>
    Math.min(
        Constants.STARTING_TARGET_SPEED +
            (Constants.MAX_TARGET_SPEED -
                Constants.STARTING_TARGET_SPEED) *
                (elapsedTicks /
                    Constants.TICKS_TO_MAX_SPEED),
        Constants.MAX_TARGET_SPEED,
    );

/*
 Adds every newly satisfied challenge without duplicating the trophies.
 */
export const updateCompletedChallenges = (
    state: State,
): ReadonlyArray<ChallengeId> => {
    const challengeResults: ReadonlyArray<
        readonly [ChallengeId, boolean]
    > = [
        ["scoreTen", state.score >= 10],
        ["fiveInFifteen", state.fastTargetsSolved >= 5],
        ["scoreTwenty", state.score >= 20 && !state.gameEnd],
    ];

    return challengeResults.reduce<ReadonlyArray<ChallengeId>>(
        (completed, [challengeId, isComplete]) =>
            isComplete && !completed.includes(challengeId)
                ? [...completed, challengeId]
                : completed,
        state.completedChallenges,
    );
};

/*
 * Moves the game forward by one time step.
 *
 * This function:
 * 1. moves existing targets
 * 2. creates a target when required
 * 3. finds the lowest target
 * 4. checks it when it reaches the check line
 */
export const tick = (state: State): State => {
    // A finished game should no longer move or create targets.
    if (state.gameEnd) {
        return state;
    }



    const nextElapsedTicks = state.elapsedTicks + 1;
    const currentTargetSpeed = targetSpeed(state.elapsedTicks);

    /*
     * Create a new array containing moving targets.
     *
     * map does not modify the objects in state targets
     */
    const movedTargets = state.targets.map(target => ({
        ...target,
        y: target.y + currentTargetSpeed,
    }));

    const lowestTarget = getLowestTarget(movedTargets);

    if (lowestTarget === undefined) {  //there is nothing to check when the screen has no targets
        return {
            ...state,
            targets: movedTargets,
            elapsedTicks: nextElapsedTicks,
        };
    }

    const targetReachedCheckLine =
        lowestTarget.y + Target.HEIGHT >=
        Constants.CHECK_LINE_Y;

    if (!targetReachedCheckLine) {
        return {
            ...state,
            targets: movedTargets,
            elapsedTicks: nextElapsedTicks,
        };
    }

    const playerValue = binaryToDecimal(state.binaryDigits);

    const answerIsCorrect =
        playerValue === lowestTarget?.hexadecimalValue;

    if (answerIsCorrect) {
        const matchedDuringChallenge =
            nextElapsedTicks <=
            Constants.CHALLENGE_TIME_LIMIT_TICKS;

        const matchedState: State = {
            ...state,
            targets: movedTargets.filter(
                target => target.id !== lowestTarget.id,
            ),
            score: state.score + 1,
            elapsedTicks: nextElapsedTicks,
            targetsSolved: state.targetsSolved + 1,
            fastTargetsSolved:
                state.fastTargetsSolved +
                (matchedDuringChallenge ? 1 : 0),
        };

        return {
            ...matchedState,
            completedChallenges:
                updateCompletedChallenges(matchedState),
        };
    }

    return {
        ...state,
        targets: movedTargets,
        elapsedTicks: nextElapsedTicks,
        gameEnd: true,
    };
};

/*
 Creates a fresh game while retaining scores from earlier attempts.
 Scores live only in memory and disappear when the page is reloaded.
 */
export const restartGame = (state: State): State => ({
    ...initialState,
    scoreHistory:
        state.elapsedTicks > 0
            ? [...state.scoreHistory, state.score]
            : state.scoreHistory,
});

/*
 * Produces the next state from the current state
 *
 * This function is pure:
 * - it does not modify the existing state;
 * - it does not update the html;
 * - the same inputs always produce the same output.
 */

/**
 * Produces the next state from the current state and an event.
 */
export const reduceState = (
    state: State,
    event: GameEvent,
): State => {
    switch (event.type) {
        case "FlipBinaryDigit":
            return state.gameEnd
                ? state
                : {
                      ...state,
                      binaryDigits: flipBinaryDigit(
                          state.binaryDigits,
                          event.index,
                      ),
                  };

        case "SpawnTarget":
            return state.gameEnd
                ? state
                : {
                    ...state,

                    targets: [
                        ...state.targets,
                        event.target,
                    ],
                };

        case "Tick":
            return tick(state);

        case "Restart":
            return restartGame(state);
    }
};

// Rendering (side effects)

/**
 * Brings an SVG element to the foreground.
 * @param elem SVG element to bring to the foreground
 */
const bringToForeground = (elem: SVGElement): void => {
    elem.parentNode?.appendChild(elem);
};

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "visible");
    bringToForeground(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "hidden");
};

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
): SVGElement => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

/*
 * SVG elements to display one falling target
 */
type TargetElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

/*
 SVG elements used to display one player controlled binary digit.
 */
type BinaryDigitElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

const render = (): ((state: State) => void) => {
    const svg = document.querySelector(
        "#svgCanvas",
    ) as SVGSVGElement;

    const gameOver = document.querySelector(
        "#gameOver",
    ) as SVGElement;

    const scoreText = document.querySelector(
        "#scoreText",
    ) as HTMLElement;

    const scoreHistoryList = document.querySelector(
        "#scoreHistory",
    ) as HTMLOListElement;

    const emptyScoreHistory = document.querySelector(
        "#emptyScoreHistory",
    ) as HTMLElement;

    const challengeElements: ReadonlyArray<
        Readonly<{
            id: ChallengeId;
            element: HTMLElement;
        }>
    > = [
        {
            id: "scoreTen",
            element: document.querySelector(
                "#challengeScoreTen",
            ) as HTMLElement,
        },
        {
            id: "fiveInFifteen",
            element: document.querySelector(
                "#challengeFastFive",
            ) as HTMLElement,
        },
        {
            id: "scoreTwenty",
            element: document.querySelector(
                "#challengeScoreTwenty",
            ) as HTMLElement,
        },
    ];

    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );

    /**
     * Static elements are created once because their structure and
     * position do not change between state emissions.
     */
    const checkLine = createSvgElement(
        svg.namespaceURI,
        "line",
        {
            x1: "0",
            y1: `${Constants.CHECK_LINE_Y}`,
            x2: `${Viewport.CANVAS_WIDTH}`,
            y2: `${Constants.CHECK_LINE_Y}`,
            stroke: "yellow",
            "stroke-width": "3",
            "stroke-dasharray": "8 5",
        },
    );

    const targetLayer = createSvgElement(
        svg.namespaceURI,
        "g",
        { id: "targetLayer" },
    );

    svg.appendChild(checkLine);
    svg.appendChild(targetLayer);

    const digitWidth =
        Viewport.CANVAS_WIDTH / Constants.DIGIT_COUNT;

    const binaryDigitElements: ReadonlyArray<BinaryDigitElements> =
        Array.from(
            { length: Constants.DIGIT_COUNT },
            (_, index) => {
                const rectangle = createSvgElement(
                    svg.namespaceURI,
                    "rect",
                    {
                        "data-digit-index": String(index),
                        x: `${index * digitWidth + 4}`,
                        y: `${Viewport.CANVAS_HEIGHT - 50}`,
                        width: `${digitWidth - 8}`,
                        height: "40",
                        fill: "#ef9a9a",
                        stroke: "black",
                        "stroke-width": "2",
                    },
                );

                const text = createSvgElement(
                    svg.namespaceURI,
                    "text",
                    {
                        "data-digit-index": String(index),
                        x: `${
                            index * digitWidth +
                            digitWidth / 2
                        }`,
                        y: `${Viewport.CANVAS_HEIGHT - 22}`,
                        "text-anchor": "middle",
                        "font-family": "monospace",
                        "font-size": "20",
                        fill: "black",
                    },
                );

                text.textContent = "0";
                svg.appendChild(rectangle);
                svg.appendChild(text);

                return { rectangle, text };
            },
        );

    /**
     This mutable map is rendering-only. Functional game
     state remains immutable and contains no DOM elements.
     */
    const targetElements = new Map<number, TargetElements>();
    let renderedScoreHistory: ReadonlyArray<number> | undefined;

    const createTargetElements = (
        target: FallingTarget,
    ): TargetElements => {
        const targetX =
            Viewport.CANVAS_WIDTH / 2 -
            Target.WIDTH / 2;

        const rectangle = createSvgElement(
            svg.namespaceURI,
            "rect",
            {
                x: `${targetX}`,
                y: `${target.y}`,
                width: `${Target.WIDTH}`,
                height: `${Target.HEIGHT}`,
                rx: "6",
                fill: "white",
                stroke: "black",
                "stroke-width": "2",
            },
        );

        const text = createSvgElement(
            svg.namespaceURI,
            "text",
            {
                x: `${Viewport.CANVAS_WIDTH / 2}`,
                y: `${target.y + Target.HEIGHT / 2 + 7}`,
                "text-anchor": "middle",
                "font-family": "monospace",
                "font-size": "20",
                fill: "black",
            },
        );

        text.textContent = target.hexadecimalValue
            .toString(16)
            .toUpperCase();

        targetLayer.appendChild(rectangle);
        targetLayer.appendChild(text);

        return { rectangle, text };
    };

    return (state: State): void => {
        scoreText.textContent = String(state.score);

        if (renderedScoreHistory !== state.scoreHistory) {
            const historyItems = state.scoreHistory.map(
                (score, index) => {
                    const item = document.createElement("li");
                    item.textContent = `Game ${index + 1}: ${score}`;
                    return item;
                },
            );

            scoreHistoryList.replaceChildren(...historyItems);
            emptyScoreHistory.hidden =
                state.scoreHistory.length > 0;
            renderedScoreHistory = state.scoreHistory;
        }

        challengeElements.forEach(({ id, element }) => {
            const isComplete =
                state.completedChallenges.includes(id);
            const trophy = element.querySelector(
                ".trophy",
            ) as HTMLElement;

            element.classList.toggle("completed", isComplete);
            trophy.textContent = isComplete ? "🏆" : "○";
        });

        binaryDigitElements.forEach(
            ({ rectangle, text }, index) => {
                const currentBit = state.binaryDigits[index];

                rectangle.setAttribute(
                    "fill",
                    currentBit === 1
                        ? "#81c784"
                        : "#ef9a9a",
                );
                text.textContent = String(currentBit);
            },
        );

        const activeTargetIds = new Set(
            state.targets.map(target => target.id),
        );

        state.targets.forEach(target => {
            const existingElements = targetElements.get(target.id);
            const elements =
                existingElements ?? createTargetElements(target);

            if (existingElements === undefined) {
                targetElements.set(target.id, elements);
            }

            elements.rectangle.setAttribute("y", String(target.y));
            elements.text.setAttribute(
                "y",
                String(target.y + Target.HEIGHT / 2 + 7),
            );
        });

        targetElements.forEach((elements, id) => {
            if (!activeTargetIds.has(id)) {
                elements.rectangle.remove();
                elements.text.remove();
                targetElements.delete(id);
            }
        });

        if (state.gameEnd) {
            show(gameOver);
        } else {
            hide(gameOver);
        }
    };
};


/**
 Finds the binary digit associated with a mouse click.

 The event target may be the rectangle or its text. closest finds
 the nearest element containing a data-digit-index attribute
 */
const getClickedDigitElement = (
    event: MouseEvent,
): Element | null =>
    event.target instanceof Element
        ? event.target.closest("[data-digit-index]")
        : null;


export const state$ = (): Observable<State> => {
    const svg = document.querySelector(
        "#svgCanvas",
    ) as SVGSVGElement;

    const restartButton = document.querySelector(
        "#restartButton",
    ) as HTMLButtonElement;

    const tick$ = interval(Constants.TICK_RATE_MS).pipe(
        map((): GameEvent => ({ type: "Tick" })),
    );

 /**
 Create an increasing sequence of target ID
 
 The first timer waits for a random delay and emits 0.
 expand then schedules ID 1 after another random delay,
 followed by ID 2, and so on.
 */
const targetId$ = defer(() =>
    timer(randomTargetDelay()).pipe(
        expand(id =>
            timer(randomTargetDelay()).pipe(
                map(() => id + 1),
            ),
        ),
    ),
);

/**
 Turn each emitted ID into a SpawnTarget event.
 
 Random values are generated here, outside the reducer. The event
 contains all the information needed for a deterministic update.
  
 The resulting SpawnTarget event already contains the target’s ID and value,
 allowing reduceState to remain pure and predictable.
 */
const spawnTarget$ = targetId$.pipe(
    map((id): GameEvent => {
        const hexadecimalValue = randomInteger(
            0,
            Constants.MAX_TARGET_VALUE,
        );

        return {
            type: "SpawnTarget",
            target: createTarget(
                id,
                hexadecimalValue,
            ),
        };
    }),
);


    const digitKey$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(({ code, repeat }) => !repeat && /^Digit[1-8]$/.test(code)),  //only keyboard keys 1-8 are allowed
        map(
            ({ code }): GameEvent => ({
                type: "FlipBinaryDigit",
                index: Number(code.at(-1)) - 1,  //array starts at index 0
            }),
        ),
    );

    /**
     * Convert clicks on binary digits into FlipBinaryDigit events.
     * One listener on the SVG handles both rectangles and their text.
     */
    const digitClick$ = fromEvent<MouseEvent>(svg, "click").pipe(
        map(getClickedDigitElement),
        filter(
            (element): element is Element =>
                element !== null,
        ),
        map(element =>
            Number(
                element.getAttribute("data-digit-index"),
            ),
        ),
        filter(
            index =>
                Number.isInteger(index) &&
                index >= 0 &&
                index < Constants.DIGIT_COUNT,
        ),
        map(
            (index): GameEvent => ({
                type: "FlipBinaryDigit",
                index,
            }),
        ),
    );

    const restart$ = fromEvent(restartButton, "click").pipe(
        map((): GameEvent => ({ type: "Restart" })),
    );

    return merge(
        tick$,
        spawnTarget$,
        digitKey$,
        digitClick$,
        restart$,
    ).pipe(
        scan(reduceState, initialState),
        startWith(initialState),
    );
};  //scan remembers the previous state and uses the reducer to calculate the next one

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    click$.pipe(switchMap(() => state$())).subscribe(render());
}
