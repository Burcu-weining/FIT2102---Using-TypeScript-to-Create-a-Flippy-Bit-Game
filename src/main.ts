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
    catchError,
    filter,
    fromEvent,
    interval,
    map,
    merge, //merge combines multiple observables.
    scan,
    switchMap,
    take,
} from "rxjs";

/** Constants
 * These will control the sonstants throughout the game
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
    TARGET_SPEED: 2, // this moves each target two SVG units on every tick
    TARGET_SPAWN_MS: 2000, // creates a new target every 2 seconds
    CHECK_LINE_Y: 300, // targets are checked at this horizontal line
} as const;


/*
 * The minimum game may use a predefined sequence.
 *
 * The 0x prefix tells the code that these values are hexadecimal:
 * 0x0d = decimal 13
 * 0x2a = decimal 42
 * 0x7f = decimal 127
*/
const TARGET_SEQUENCE = [0x0d, 0x2a, 0x07, 0x35, 0x7f] as const;

export type Bit = 0 | 1; //bit can be 0 or 1
export type BinaryDigits = readonly [Bit, Bit, Bit, Bit, Bit, Bit, Bit, Bit]; //this is a immutable tuple containing 8 digits, the player's binary number contains exactly eight bits


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


/*
state contains all the info needed to describe the game
*/
// State processing
export type State = Readonly<{
    //state holds the games current information
    binaryDigits: BinaryDigits;
    targets: ReadonlyArray<FallingTarget>;  //every target currently falling on the screen
    gameEnd: boolean;
}>;


export type GameEvent = //events describe things that can change the game state
    | Readonly<{ type: "Tick" }>  //tick represents time passing
    | Readonly<{ type: "FlipBinaryDigit"; index: number }>  //flipbinarydigit represents a number key being pressed
    | Readonly<{ type: "SpawnTarget"; target: FallingTarget;}>;

    // The game begins with all 8 binary digits being 0.
export const initialState: State = {
    binaryDigits: [0, 0, 0, 0, 0, 0, 0, 0],
    targets: [],
    gameEnd: false,
};

export const flipBit = (bit: Bit): Bit => (bit === 0 ? 1 : 0);  //this converts 0 to 1 pr 1 to 0

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



/**
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


/**
 * Finds the lowest target on the screen.
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

/**
 * Moves the game forward by one time step.
 *
 * This function:
 * 1. moves existing targets;
 * 2. creates a target when required;
 * 3. finds the lowest target;
 * 4. checks it when it reaches the check line.
 */
export const tick = (state: State): State => {
    // A finished game should no longer move or create targets.
    if (state.gameEnd) {
        return state;
    }



    /**
     * Create a new array containing moved targets.
     *
     * map does not modify the objects in state.targets.
     */
    const movedTargets = state.targets.map(target => ({
        ...target,
        y: target.y + Constants.TARGET_SPEED,
    }));

    const lowestTarget = getLowestTarget(movedTargets);

    if (lowestTarget === undefined) {  //there is nothing to check when the screen has no targets
        return {
            ...state,
            targets: movedTargets,
        };
    }

    const targetReachedCheckLine =
        lowestTarget.y + Target.HEIGHT >=
        Constants.CHECK_LINE_Y;

    if (!targetReachedCheckLine) {
        return {
            ...state,
            targets: movedTargets,
        };
    }

    const playerValue = binaryToDecimal(state.binaryDigits);

    const answerIsCorrect =
        playerValue === lowestTarget?.hexadecimalValue;

    if (answerIsCorrect) {  //this resolves only the lowest target and the targets above it remains in the array
        return {
            ...state,
            targets: movedTargets.filter(
                target => target.id !== lowestTarget.id,
            ),
        };
    }

    return {
        ...state,
        targets: movedTargets,
        gameEnd: true,
    };
};
/**
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

const render = (): ((s: State) => void) => {
    const svg = document.querySelector(
        "#svgCanvas",
    ) as SVGSVGElement;

    const gameOver = document.querySelector(
        "#gameOver",
    ) as SVGElement;

    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );

    /**
     * Renders the current state to the canvas.
     *
     * State processing is kept outside this function. Updating the
     * SVG is a side effect, so it belongs in the rendering section.
     */
    return (s: State): void => {
        /**
         * Remove the elements created by the previous render.
         *
         * The game-over group from index.html is not removed because
         * it does not have the "game-element" class.
         */
        svg.querySelectorAll(".game-element").forEach(element => {
            element.remove();
        });

        /**
         * Draw the horizontal line where targets are checked.
         */
        const checkLine = createSvgElement(
            svg.namespaceURI,
            "line",
            {
                class: "game-element",
                x1: "0",
                y1: `${Constants.CHECK_LINE_Y}`,
                x2: `${Viewport.CANVAS_WIDTH}`,
                y2: `${Constants.CHECK_LINE_Y}`,
                stroke: "yellow",
                "stroke-width": "3",
                "stroke-dasharray": "8 5",
            },
        );

        svg.appendChild(checkLine);

        /**
         * Draw every target currently stored in state.
         */
        s.targets.forEach(target => {
            const targetX =
                Viewport.CANVAS_WIDTH / 2 -
                Target.WIDTH / 2;

            const targetRectangle = createSvgElement(
                svg.namespaceURI,
                "rect",
                {
                    class: "game-element",
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

            const targetText = createSvgElement(
                svg.namespaceURI,
                "text",
                {
                    class: "game-element",
                    x: `${Viewport.CANVAS_WIDTH / 2}`,
                    y: `${target.y + Target.HEIGHT / 2 + 7}`,
                    "text-anchor": "middle",
                    "font-family": "monospace",
                    "font-size": "20",
                    fill: "black",
                },
            );

            /**
             * Display the value using hexadecimal characters.
             *
             * For example:
             * decimal 13 becomes "D"
             * decimal 42 becomes "2A"
             */
            targetText.textContent =
                target.hexadecimalValue
                    .toString(16)
                    .toUpperCase();

            svg.appendChild(targetRectangle);
            svg.appendChild(targetText);
        });

        /**
         * Draw the player's eight binary digits.
         */
        const digitWidth =
            Viewport.CANVAS_WIDTH / Constants.DIGIT_COUNT;

        Array.from({
            length: Constants.DIGIT_COUNT,
        }).forEach((_, index) => {
            const currentBit = s.binaryDigits[index];

            const bitRectangle = createSvgElement(
                svg.namespaceURI,
                "rect",
                {
                    class: "game-element",
                    x: `${index * digitWidth + 4}`,
                    y: `${Viewport.CANVAS_HEIGHT - 50}`,
                    width: `${digitWidth - 8}`,
                    height: "40",
                    fill:
                        currentBit === 1
                            ? "#81c784"
                            : "#ef9a9a",
                    stroke: "black",
                    "stroke-width": "2",
                },
            );

            const bitText = createSvgElement(
                svg.namespaceURI,
                "text",
                {
                    class: "game-element",
                    x: `${
                        index * digitWidth + digitWidth / 2
                    }`,
                    y: `${Viewport.CANVAS_HEIGHT - 22}`,
                    "text-anchor": "middle",
                    "font-family": "monospace",
                    "font-size": "20",
                    fill: "black",
                },
            );

            bitText.textContent = String(currentBit);

            svg.appendChild(bitRectangle);
            svg.appendChild(bitText);
        });

        /**
         * Display the existing game-over group from index.html only
         * when state.gameEnd is true.
         */
        if (s.gameEnd) {
            show(gameOver);
        } else {
            hide(gameOver);
        }
    };
};

export const state$ = (): Observable<State> => {
    const tick$ = interval(Constants.TICK_RATE_MS).pipe(
        map((): GameEvent => ({ type: "Tick" })),
    );

  /**
     * Target-creation stream.
     *
     * interval emits increasing numbers:
     * 0, 1, 2, 3, ...
     *
     * We use each emitted number as the target's unique ID.
     */
  const spawnTarget$ = interval(
    Constants.TARGET_SPAWN_MS,
).pipe(
    map((id): GameEvent => {
        const hexadecimalValue =
            TARGET_SEQUENCE[
                id % TARGET_SEQUENCE.length
            ];

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

    return merge(tick$, spawnTarget$, digitKey$).pipe(scan(reduceState, initialState));  //this combines the timer events and keyboard events
};  //scan remembers the previous state and uses the reducer to calculate the next one

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    click$.pipe(switchMap(() => state$())).subscribe(render());
}
