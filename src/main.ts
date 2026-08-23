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
    TICK_RATE_MS: 500, // Might need to change this!
} as const;

type Bit = 0 | 1; //bit can be 0 or 1
type BinaryDigits = readonly [Bit, Bit, Bit, Bit, Bit, Bit, Bit, Bit]; //this is a immutable tuple containing 8 digits, the player's binary number contains exactly eight bits

/*
state contains all the info needed to describe the game
*/
// State processing
type State = Readonly<{
    //state holds the games current information
    binaryDigits: BinaryDigits;
    gameEnd: boolean;
}>;


type GameEvent = //events describe things that can change the game state
    | Readonly<{ type: "Tick" }>  //tick represents time passing
    | Readonly<{ type: "FlipBinaryDigit"; index: number }>;  //flipbinarydigit represents a number key being pressed

// The game begins with all 8 binary digits being 0.
const initialState: State = {
    binaryDigits: [0, 0, 0, 0, 0, 0, 0, 0],
    gameEnd: false,
};

const flipBit = (bit: Bit): Bit => (bit === 0 ? 1 : 0);  //this converts 0 to 1 pr 1 to 0

/*
this part returns a new set of binary digits with one selected digit that would be flipped
and the original binary digits are not modified.
*/
const flipBinaryDigit = (
    binaryDigits: BinaryDigits,
    selectedIndex: number,
): BinaryDigits =>
    binaryDigits.map((bit, index) =>
        index === selectedIndex ? flipBit(bit) : bit,
    ) as unknown as BinaryDigits;

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (state: State): State => state;


/**
 * Produces the next state from the current state
 *
 * This function is pure:
 * - it does not modify the existing state;
 * - it does not update the html;
 * - the same inputs always produce the same output.
 */

const reduceState = (state: State, event: GameEvent): State => {
    switch (event.type) {
        case "FlipBinaryDigit":
            return {
                ...state,
                binaryDigits: flipBinaryDigit(
                    state.binaryDigits,
                    event.index,
                ),
            };

        case "Tick":
            return state;
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
    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;

    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );


    /**
     * Renders the current state to the canvas.
     *
     * In MVC terms, this updates the View using the Model.
     *
     * @param s Current state
     */
    return (s: State) => {
        // Draw a static falling target as a demonstration
        const target = createSvgElement(svg.namespaceURI, "rect", {
            x: `${Viewport.CANVAS_WIDTH / 2 - Target.WIDTH / 2}`,
            y: "40",
            width: `${Target.WIDTH}`,
            height: `${Target.HEIGHT}`,
            rx: "6",
            fill: "white",
            stroke: "black",
            "stroke-width": "2",
        });
        const targetText = createSvgElement(svg.namespaceURI, "text", {
            x: `${Viewport.CANVAS_WIDTH / 2}`,
            y: `${40 + Target.HEIGHT / 2 + 8}`,
            "text-anchor": "middle",
            "font-family": "monospace",
            fill: "black",
        });
        targetText.textContent = "13";
        svg.appendChild(target);
        svg.appendChild(targetText);

        // Draw the row of digit toggles as a demonstration
        const digitWidth = Viewport.CANVAS_WIDTH / Constants.DIGIT_COUNT;
        Array.from({ length: Constants.DIGIT_COUNT }).forEach((_, i) => {
            const currentBit = s.binaryDigits[i];
            const bitRectangle = createSvgElement(svg.namespaceURI, "rect", {
                x: `${i * digitWidth + 4}`,
                y: `${Viewport.CANVAS_HEIGHT - 50}`,
                width: `${digitWidth - 8}`,
                height: "40",
                fill: currentBit === 1 ? "#81c784" : "#ef9a9a",
                stroke: "black",
                "stroke-width": "2",
            });
            const bitText = createSvgElement(svg.namespaceURI, "text", {
                x: `${i * digitWidth + digitWidth / 2}`,
                y: `${Viewport.CANVAS_HEIGHT - 22}`,
                "text-anchor": "middle",
                "font-family": "monospace",
                fill: "black",
            });
            bitText.textContent = String(currentBit);
            svg.appendChild(bitRectangle);
            svg.appendChild(bitText);
        });
    };
};

export const state$ = (): Observable<State> => {
    const tick$ = interval(Constants.TICK_RATE_MS).pipe(
        map((): GameEvent => ({ type: "Tick" })),
    );

    const digitKey$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
        filter(({ code }) => /^Digit[1-8]$/.test(code)),  //only keyboard keys 1-8 are allowed
        map(
            ({ code }): GameEvent => ({
                type: "FlipBinaryDigit",
                index: Number(code.at(-1)) - 1,  //array starts at index 0
            }),
        ),
    );

    return merge(tick$, digitKey$).pipe(scan(reduceState, initialState));  //this combines the timer events and keyboard events
};  //scan remembers the previous state and uses the reducer to calculate the next one

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    click$.pipe(switchMap(() => state$())).subscribe(render());
}
