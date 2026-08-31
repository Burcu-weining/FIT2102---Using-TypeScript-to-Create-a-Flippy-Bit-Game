import { CONSTANTS, TARGET, VIEWPORT } from "./model";
import type {
    ChallengeGoals,
    ChallengeId,
    FallingTarget,
    State,
} from "./model";
import { queryElement } from "./dom";

/**
 * Moves an SVG message to the end of its parent element.
 * SVG elements added later are drawn on top of earlier elements. This keeps
 * messages such as "Paused" and "Game Over" in front of falling targets.
 */
const bringToForeground = (element: SVGElement): void => {
    element.parentNode?.appendChild(element);
};

/**
 * Changes one HTML or SVG attribute only when its value is different.
 * For example, a target's y attribute changes when that target moves down.
 * Skipping an unchanged value prevents unnecessary page updates.
 */
const updateAttribute = (
    element: Element,
    name: string,
    value: string,
): void =>
    element.getAttribute(name) === value
        ? undefined
        : element.setAttribute(name, value);

/** Changes the text only when the new text is different. */
const updateText = (element: Element, value: string): void =>
    element.textContent === value ? undefined : element.replaceChildren(value);

/** Adds a CSS class when enabled is true and removes it when it is false. */
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
    // Call applyClass only when the element does not already have the right class.
    element.classList.contains(className) === enabled
        ? undefined
        : applyClass(element, className, enabled);

/** Makes a hidden SVG message visible and places it above other elements. */
const reveal = (element: SVGElement): void => {
    element.setAttribute("visibility", "visible");
    bringToForeground(element);
};

/** Shows an SVG element only if it is not already visible. */
const show = (element: SVGElement): void =>
    element.getAttribute("visibility") === "visible"
        ? undefined
        : reveal(element);

/** Hides an SVG element only if it is not already hidden. */
const hide = (element: SVGElement): void =>
    updateAttribute(element, "visibility", "hidden");

/**
 * Rebuilds the visible score-history list from the saved score numbers.
 * Each number becomes a list item such as "Game 1: 5".
 */
const replaceScoreHistory = (
    list: HTMLOListElement,
    scores: ReadonlyArray<number>,
    signature: string,
): void => {
    // map creates one new <li> element for every previous score.
    const items = scores.map((score, index) => {
        const item = document.createElement("li");
        item.textContent = `Game ${index + 1}: ${score}`;
        return item;
    });

    // Replace the old list items with the newly created list items.
    list.replaceChildren(...items);
    // Remember which scores are displayed so they can be checked next time.
    list.setAttribute("data-score-history", signature);
};

/** Updates the score history only when the array of scores has changed. */
const updateScoreHistory = (
    list: HTMLOListElement,
    scores: ReadonlyArray<number>,
): void => {
    // Turn the scores into text that can be stored on the HTML list element.
    const signature = JSON.stringify(scores);

    // Matching text means that the correct scores are already displayed.
    list.getAttribute("data-score-history") === signature
        ? undefined
        : replaceScoreHistory(list, scores, signature);
};

/**
 * Creates an SVG shape or text element and sets its starting attributes.
 * SVG elements need createElementNS rather than the normal createElement.
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    properties: Record<string, string> = {},
): SVGElement => {
    // Create the requested SVG element, such as a rectangle, text or line.
    const element = document.createElementNS(namespace, name) as SVGElement;
    // Add every property from the object as an attribute on the new element.
    Object.entries(properties).forEach(([key, value]) =>
        element.setAttribute(key, value),
    );
    return element;
};

// A target is drawn using a rectangle and text showing its hexadecimal value.
type TargetElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

// A binary digit is drawn using a coloured rectangle and a 0 or 1 text element.
type BinaryDigitElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

// Connects each challenge's name, HTML element and displayed sentence.
type ChallengeElement = Readonly<{
    id: ChallengeId;
    element: HTMLElement;
    description: (goals: ChallengeGoals) => string;
}>;

/**
 * Sets up the visible parts of the game, then returns a function that displays
 * each new game state. The returned function runs whenever state$ produces a
 * State. This file changes the page; state.ts only calculates game data.
 */
export const render = (): ((state: State) => void) => {
    // Find the permanent elements that already exist in index.html.
    // Saving them here means we do not search for them again on every game tick.
    const svg = queryElement<SVGSVGElement>("#svgCanvas");
    const gameOver = queryElement<SVGElement>("#gameOver");
    const pausedMessage = queryElement<SVGElement>("#paused");
    const pauseButton = queryElement<HTMLButtonElement>("#pauseButton");
    const scoreText = queryElement<HTMLElement>("#scoreText");
    const scoreHistoryList = queryElement<HTMLOListElement>("#scoreHistory");
    const emptyScoreHistory = queryElement<HTMLElement>("#emptyScoreHistory");

    // Match every challenge with its HTML element and the sentence that will
    // describe its randomly generated goal.
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

    // Make the SVG coordinate system match the game's width and height.
    svg.setAttribute(
        "viewBox",
        `0 0 ${VIEWPORT.CANVAS_WIDTH} ${VIEWPORT.CANVAS_HEIGHT}`,
    );

    // Create the yellow line where a falling target is checked against the
    // binary number selected by the player.
    const checkLine = createSvgElement(svg.namespaceURI, "line", {
        x1: "0",
        y1: `${CONSTANTS.CHECK_LINE_Y}`,
        x2: `${VIEWPORT.CANVAS_WIDTH}`,
        y2: `${CONSTANTS.CHECK_LINE_Y}`,
        stroke: "yellow",
        "stroke-width": "3",
        "stroke-dasharray": "8 5",
    });

    // Create a group that will contain every falling target. This keeps the
    // target shapes together and makes the SVG easier to organise.
    const targetLayer = createSvgElement(svg.namespaceURI, "g", {
        id: "targetLayer",
    });

    // Add the check line and the empty target group to the SVG canvas.
    svg.appendChild(checkLine);
    svg.appendChild(targetLayer);

    // Divide the canvas width equally between the eight binary controls.
    const digitWidth = VIEWPORT.CANVAS_WIDTH / CONSTANTS.DIGIT_COUNT;

    // Create all eight controls. Each one contains a coloured rectangle and a
    // text element that displays either 0 or 1.
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
            // Place the 0 or 1 text in the centre of its rectangle.
            const text = createSvgElement(svg.namespaceURI, "text", {
                "data-digit-index": String(index),
                x: `${index * digitWidth + digitWidth / 2}`,
                y: `${VIEWPORT.CANVAS_HEIGHT - 22}`,
                "text-anchor": "middle",
                "font-family": "monospace",
                "font-size": "20",
                fill: "black",
            });

            // Every digit starts at 0 before the first State is displayed.
            text.textContent = "0";
            // Add both visible parts of the digit to the SVG canvas.
            svg.appendChild(rectangle);
            svg.appendChild(text);
            // Save both elements so future renders can update them directly.
            return { rectangle, text };
        },
    );

    // Save each target's SVG elements under its unique target ID. On the next
    // tick, the same elements can be moved instead of being created again.
    const targetElements = new Map<number, TargetElements>();

    /** Creates the rectangle and hexadecimal text for one new target. */
    const createTargetElements = (target: FallingTarget): TargetElements => {
        // Draw the white rounded rectangle at the target's current position.
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
        // Draw the hexadecimal value in the centre of the rectangle.
        const text = createSvgElement(svg.namespaceURI, "text", {
            x: `${target.x + TARGET.WIDTH / 2}`,
            y: `${target.y + TARGET.HEIGHT / 2 + 7}`,
            "text-anchor": "middle",
            "font-family": "monospace",
            "font-size": "20",
            fill: "black",
        });

        // Convert a number such as 173 into the displayed hexadecimal text AD.
        text.textContent = target.hexadecimalValue.toString(16).toUpperCase();
        // Add both target parts to the target group on the canvas.
        targetLayer.appendChild(rectangle);
        targetLayer.appendChild(text);
        return { rectangle, text };
    };

    /** Removes both visible parts of a target and forgets its saved ID. */
    const removeTargetElements = (
        elements: TargetElements,
        id: number,
    ): void => {
        elements.rectangle.remove();
        elements.text.remove();
        targetElements.delete(id);
    };

    // This returned function runs for every new State produced by state$.
    return (state: State): void => {
        // Display the current score and the scores from previous games.
        updateText(scoreText, String(state.score));
        updateScoreHistory(scoreHistoryList, state.scoreHistory);

        // Hide the "no previous scores" message when score history is available.
        emptyScoreHistory.hidden === state.scoreHistory.length > 0
            ? undefined
            : (emptyScoreHistory.hidden = state.scoreHistory.length > 0);

        // Update the sentence and completion symbol for every challenge.
        challengeElements.forEach(({ id, element, description }) => {
            // Check whether this challenge's ID is in the completed list.
            const isComplete = state.completedChallenges.includes(id);
            // Find the symbol and sentence inside this challenge's HTML element.
            const trophy = queryElement<HTMLElement>(".trophy", element);
            const challengeText = queryElement<HTMLElement>(
                ".challengeText",
                element,
            );

            // A completed challenge becomes green and displays a trophy.
            updateClass(element, "completed", isComplete);
            updateText(trophy, isComplete ? "🏆" : "○");
            updateText(challengeText, description(state.challengeGoals));
        });

        // Update the number and colour displayed by each binary control.
        binaryDigitElements.forEach(({ rectangle, text }, index) => {
            const currentBit = state.binaryDigits[index];
            // Display a 1 with green and a 0 with red.
            updateAttribute(
                rectangle,
                "fill",
                currentBit === 1 ? "#81c784" : "#ef9a9a",
            );
            updateText(text, String(currentBit));
        });

        // Collect the IDs of targets that still exist in the latest State.
        const activeTargetIds = new Set(state.targets.map(target => target.id));

        // Draw a target if it is new, or find its existing SVG elements.
        state.targets.forEach(target => {
            const existingElements = targetElements.get(target.id);
            const elements = existingElements ?? createTargetElements(target);
            // Save newly created target elements so they can be reused next tick.
            existingElements === undefined
                ? targetElements.set(target.id, elements)
                : undefined;
            // Move the rectangle and text to the target's latest y-position.
            updateAttribute(elements.rectangle, "y", String(target.y));
            updateAttribute(
                elements.text,
                "y",
                String(target.y + TARGET.HEIGHT / 2 + 7),
            );
        });

        // Remove visible targets that are no longer in the latest State.
        targetElements.forEach((elements, id) => {
            activeTargetIds.has(id)
                ? undefined
                : removeTargetElements(elements, id);
        });

        // Show Game Over only after the game has ended.
        state.gameEnd ? show(gameOver) : hide(gameOver);
        // Show Paused only while paused and before the game has ended.
        state.isPaused && !state.gameEnd
            ? show(pausedMessage)
            : hide(pausedMessage);
        // Tell the player whether the button will pause or resume the game.
        updateText(pauseButton, state.isPaused ? "Resume game" : "Pause game");
        // Disable pausing after Game Over because the game is no longer running.
        pauseButton.disabled === state.gameEnd
            ? undefined
            : (pauseButton.disabled = state.gameEnd);
    };
};
