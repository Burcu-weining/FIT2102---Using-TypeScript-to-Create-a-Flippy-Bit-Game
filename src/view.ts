import { CONSTANTS, TARGET, VIEWPORT } from "./model";
import type {
    ChallengeGoals,
    ChallengeId,
    FallingTarget,
    State,
} from "./model";
import { queryElement } from "./dom";

/*
 * moves an SVG message to the back.
 * This keeps messages "Paused" and "Game Over" in front
 * so other things don't block it
 */
const bringToForeground = (element: SVGElement): void => {
    element.parentNode?.appendChild(element);
};

/**
 * Changes one HTML or SVG attribute only when its value is different.
 * For example, a target's y attribute changes when that target moves down.
 * Skipping an unchanged value saves efficiency
 */
const updateAttribute = (
    element: Element,
    name: string,
    value: string,
): void =>
    element.getAttribute(name) === value
        ? undefined
        : element.setAttribute(name, value);

/**
 * shows the supplied text inside an HTML or SVG element.
 * First, it compares the text already on the page with the new value. If both
 * are the same, then nothing changes. If they are different,
 * replaceChildren removes the old content and inserts the new text. It could
 * change the score or the buttons
 */
const updateText = (element: Element, value: string): void =>
    element.textContent === value ? undefined : element.replaceChildren(value);

/*
updates the number or words shown on the page. Element is the page element
to update, and value is the new text to display. It checks the current text and 
only updates when it needs to be changed
*/
const applyClass = (
    element: Element,
    className: string,
    enabled: boolean,
): void => {
    element.classList.toggle(className, enabled);
};

const updateClass = (
    element: Element,
    className: string,
    enabled: boolean,
): void =>
    // Call applyClass only when the element does not already have the right
    // class.
    element.classList.contains(className) === enabled
        ? undefined
        : applyClass(element, className, enabled);

/*
 Makes a hidden SVG message visible and places it above other elements
 reveal = shows the visual SVG object and make sure it appears above 
 the other game graphics. 
*/
const reveal = (element: SVGElement): void => {
    element.setAttribute("visibility", "visible");
    bringToForeground(element);
};

/* 
 shows an SVG element only if it is not visible. 
*/
const show = (element: SVGElement): void =>
    element.getAttribute("visibility") === "visible"
        ? undefined
        : reveal(element);

/*
hides an SVG element only if it is not hidden. 
*/
const hide = (element: SVGElement): void =>
    updateAttribute(element, "visibility", "hidden");

/*
 * rebuilds the score-history list from the saved score
 * Each number becomes a list item
 */
const replaceScoreHistory = (
    list: HTMLOListElement,
    scores: ReadonlyArray<number>,
    signature: string, //short string of the complete scores listed
): void => {
    // map creates one new <li> element for every previous score
    const items = scores.map((score, index) => {
        const item = document.createElement("li");
        item.textContent = `Game ${index + 1}: ${score}`;
        return item;
    });

    // replace the old list items with the new created list
    list.replaceChildren(...items);
    // remember which scores are displayed so they can be checked next time
    list.setAttribute("data-score-history", signature);
};

/*
Updates the score history only when the array of scores has changed 
*/
const updateScoreHistory = (
    list: HTMLOListElement,
    scores: ReadonlyArray<number>,
): void => {
    // turn the scores into text that can be stored on the HTML list element
    const signature = JSON.stringify(scores);

    // Matching text means that the correct scores are already displayed.
    list.getAttribute("data-score-history") === signature
        ? undefined
        : replaceScoreHistory(list, scores, signature);
};

/*
creates visual objects for the game. e.g. a rectangle, text of hexa decimal
numbers, the yellow check line.
 */
const createSvgElement = (
    //tells the browser that the new object belongs to SVG rather than normal
    //HTML
    namespace: string | null,
    name: string,
    properties: Record<string, string> = {},
): SVGElement => {
    const element = document.createElementNS(namespace, name) as SVGElement;
    // Add every property from the object as an attribute on the new element.
    Object.entries(properties).forEach(([key, value]) =>
        element.setAttribute(key, value),
    );
    return element;
};

//target is made using a rectangle and text showing its hexadecimal value.
type TargetElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

//binary digit is made using a coloured rectangle and a 0 or 1 text element.
type BinaryDigitElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

// connects each challenge's name, HTML element and displayed sentence.
type ChallengeElement = Readonly<{
    id: ChallengeId;
    element: HTMLElement;
    description: (goals: ChallengeGoals) => string;
}>;

/*
 sets up the visible parts of the game, then returns a function that displays
 each new game state. The returned function runs whenever state$ produces a
 state
 */
export const render = (): ((state: State) => void) => {
    // find the permanent elements that already exist in index.html
    // saving them here means we don't search for it again in every game tick
    const svg = queryElement<SVGSVGElement>("#svgCanvas");
    const gameOver = queryElement<SVGElement>("#gameOver");
    const pausedMessage = queryElement<SVGElement>("#paused");
    const pauseButton = queryElement<HTMLButtonElement>("#pauseButton");
    const scoreText = queryElement<HTMLElement>("#scoreText");
    const scoreHistoryList = queryElement<HTMLOListElement>("#scoreHistory");
    const emptyScoreHistory = queryElement<HTMLElement>("#emptyScoreHistory");

    // Match every challenge with its HTML element and the sentence that will
    // describe its randomly generated challenge
    const challengeElements: ReadonlyArray<ChallengeElement> = [
        {
            id: "scoreTarget",
            element: queryElement<HTMLElement>("#challengeScoreTarget"),
            description: goals => `Reach score ${goals.scoreTarget}`,
        },
        {
            id: "timedTarget",
            element: queryElement<HTMLElement>("#challengeTimedTarget"),
            description: goals =>
                `Solve ${goals.fastTargetCount} in ${
                    (goals.fastTimeLimitTicks * CONSTANTS.TICK_RATE_MS) / 1000
                } seconds`,
        },
        {
            id: "flawlessTarget",
            element: queryElement<HTMLElement>("#challengeFlawlessTarget"),
            description: goals =>
                `Reach score ${goals.flawlessScoreTarget} without a mistake`,
        },
    ];

    // make the SVG system match the games width and height.
    svg.setAttribute(
        "viewBox",
        `0 0 ${VIEWPORT.CANVAS_WIDTH} ${VIEWPORT.CANVAS_HEIGHT}`,
    );

    /*
    creates the yellow line where the target falling is checked
    if the user entered the right binary number
    */
    const checkLine = createSvgElement(svg.namespaceURI, "line", {
        x1: "0",
        y1: `${CONSTANTS.CHECK_LINE_Y}`,
        x2: `${VIEWPORT.CANVAS_WIDTH}`,
        y2: `${CONSTANTS.CHECK_LINE_Y}`,
        stroke: "yellow",
        "stroke-width": "3",
        "stroke-dasharray": "8 5",
    });

    /*
    this part creates an empty SVG group for holding the falling
    target.
    svg.namespaceURI --> this tells the browser to make a SVG element
    rather than HTML object, and g means "group" in SVG.
    The group is named targetLayer, and after creating it, appendChild 
    saves the group inside the SVG canvas
    */
    const targetLayer = createSvgElement(svg.namespaceURI, "g", {
        id: "targetLayer",
    });

    // adds the check line and the empty target group to the SVG part
    svg.appendChild(checkLine);
    svg.appendChild(targetLayer);

    // divides the canvas width equally between the eight binary controls
    const digitWidth = VIEWPORT.CANVAS_WIDTH / CONSTANTS.DIGIT_COUNT;

    /*creates all eight bits. Each contains a coloured rectangle and a
      text that displays either 0 or 1.
    */
    const binaryDigitElements: ReadonlyArray<BinaryDigitElements> = Array.from(
        { length: CONSTANTS.DIGIT_COUNT },
        (_, index) => {
            // data-digit-index tells the click stream which digit was selected.
            const rectangle = createSvgElement(svg.namespaceURI, "rect", {
                "data-digit-index": String(index),
                x: `${index * digitWidth + 4}`,
                y: `${VIEWPORT.CANVAS_HEIGHT - 50}`,
                width: `${digitWidth - 8}`,
                height: "40",
                fill: "#ef9a9a",
                stroke: "black",
                "stroke-width": "2",
            });
            // places 0 or 1 in the middle of the box
            const text = createSvgElement(svg.namespaceURI, "text", {
                "data-digit-index": String(index),
                x: `${index * digitWidth + digitWidth / 2}`,
                y: `${VIEWPORT.CANVAS_HEIGHT - 22}`,
                "text-anchor": "middle",
                "font-family": "monospace",
                "font-size": "20",
                fill: "black",
            });

            // every digit should be 0 before the game begins
            text.textContent = "0";
            // adds both visible parts of the digit to the SVG game.
            svg.appendChild(rectangle);
            svg.appendChild(text);
            // saves both elements so future renders can update them directly
            return { rectangle, text };
        },
    );

    // saves each target's SVG elements under a unique target ID. On the next
    // tick, the same elements can be moved instead of being created again.
    const targetElements = new Map<number, TargetElements>();

    /*
     creates the rectangle and hexadecimal number for a new target
     */
    const createTargetElements = (target: FallingTarget): TargetElements => {
        // draws the white rectangle at the target's current position
        const rectangle = createSvgElement(svg.namespaceURI, "rect", {
            x: `${target.x}`,
            y: `${target.y}`,
            width: `${TARGET.WIDTH}`,
            height: `${TARGET.HEIGHT}`,
            rx: "6",
            fill: "white",
            stroke: "black",
            "stroke-width": "2",
        });
        // draws the hexadecimal value in the center of the rectangle
        const text = createSvgElement(svg.namespaceURI, "text", {
            x: `${target.x + TARGET.WIDTH / 2}`,
            y: `${target.y + TARGET.HEIGHT / 2 + 7}`,
            "text-anchor": "middle",
            "font-family": "monospace",
            "font-size": "20",
            fill: "black",
        });

        //converts the number into the hexadecimal text in the game
        text.textContent = target.hexadecimalValue.toString(16).toUpperCase();
        //adds both the box and the hexa number to the screen
        targetLayer.appendChild(rectangle);
        targetLayer.appendChild(text);
        return { rectangle, text };
    };

    /*
    this code chunk removes the hexadecimal number and the box if the 
    player matches the binary digit with the hexa number
    */
    const removeTargetElements = (
        elements: TargetElements,
        id: number,
    ): void => {
        elements.rectangle.remove();
        elements.text.remove();
        targetElements.delete(id);
    };

    //this return function runs whenever a new state is produced
    return (state: State): void => {
        //shows the new score and also saves the previous scores
        updateText(scoreText, String(state.score));
        updateScoreHistory(scoreHistoryList, state.scoreHistory);

        //hides the "no previous games" line when there is score history
        emptyScoreHistory.hidden === state.scoreHistory.length > 0
            ? undefined
            : (emptyScoreHistory.hidden = state.scoreHistory.length > 0);

        /*
        this part updates the challenge section. An id that identifies the
        challenge, an HTML element, and a function that creates the sentence.
        The code goes through every challenge and state.completedChallenges is
        an array that checks if the challenge is completed
        */
        //updates the sentence and completed symbol for every challenge
        challengeElements.forEach(({ id, element, description }) => {
            //checks whether this challenge ID is in the completed list
            const isComplete = state.completedChallenges.includes(id);
            //finds the symbol and sentence inside this challenge's HTML element
            const trophy = queryElement<HTMLElement>(".trophy", element);
            const challengeText = queryElement<HTMLElement>(
                ".challengeText",
                element,
            );

            //completed challenge becomes green text and shows a trophy
            updateClass(element, "completed", isComplete);
            updateText(trophy, isComplete ? "🏆" : "○");
            updateText(challengeText, description(state.challengeGoals));
        });

        //updates the number and colour of the binary
        binaryDigitElements.forEach(({ rectangle, text }, index) => {
            const currentBit = state.binaryDigits[index];
            //shows a 1 with green and a 0 with red
            updateAttribute(
                rectangle,
                "fill",
                currentBit === 1 ? "#81c784" : "#ef9a9a",
            );
            updateText(text, String(currentBit));
        });

        /*
        This code keeps the falling targets on the screen matching with the 
        latest game state. It creates the rectangle and text for new targets, 
        reuses and moves the existing target elements as they fall, and removes 
        targets that have been solved. This avoids recreating every target on 
        every game update.
        */

        //takes all the targets and extracts their id, so the rendering code
        //can know which targets still exist in the game
        const activeTargetIds = new Set(state.targets.map(target => target.id));

        //draws a target if it is new, or find its existing SVG elements
        state.targets.forEach(target => {
            const existingElements = targetElements.get(target.id);
            const elements = existingElements ?? createTargetElements(target);
            //save new created target elements so they can be reused next tick
            existingElements === undefined
                ? targetElements.set(target.id, elements)
                : undefined;
            //move the rectangle and word to the target's latest y position
            updateAttribute(elements.rectangle, "y", String(target.y));
            updateAttribute(
                elements.text,
                "y",
                String(target.y + TARGET.HEIGHT / 2 + 7),
            );
        });

        //removes visible targets that are no longer in the latest game
        targetElements.forEach((elements, id) => {
            activeTargetIds.has(id)
                ? undefined
                : removeTargetElements(elements, id);
        });

        //shows Game Over only after the game ends
        state.gameEnd ? show(gameOver) : hide(gameOver);
        //shows Paused only while paused and before the game has ended
        state.isPaused && !state.gameEnd
            ? show(pausedMessage)
            : hide(pausedMessage);
        //tells the player whether the button will pause or resume the game
        updateText(pauseButton, state.isPaused ? "Resume game" : "Pause game");
        //disables pausing after Game Over because the game is not running
        //anymore
        pauseButton.disabled === state.gameEnd
            ? undefined
            : (pauseButton.disabled = state.gameEnd);
    };
};
