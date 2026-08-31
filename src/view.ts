import { CONSTANTS, TARGET, VIEWPORT } from "./constants";
import type {
    ChallengeGoals,
    ChallengeId,
    FallingTarget,
    State,
} from "./types";
import { queryElement } from "./dom";

const bringToForeground = (element: SVGElement): void => {
    element.parentNode?.appendChild(element);
};

const updateAttribute = (
    element: Element,
    name: string,
    value: string,
): void =>
    element.getAttribute(name) === value
        ? undefined
        : element.setAttribute(name, value);

const updateText = (element: Element, value: string): void =>
    element.textContent === value ? undefined : element.replaceChildren(value);

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
    element.classList.contains(className) === enabled
        ? undefined
        : applyClass(element, className, enabled);

const reveal = (element: SVGElement): void => {
    element.setAttribute("visibility", "visible");
    bringToForeground(element);
};

const show = (element: SVGElement): void =>
    element.getAttribute("visibility") === "visible"
        ? undefined
        : reveal(element);

const hide = (element: SVGElement): void =>
    updateAttribute(element, "visibility", "hidden");

const replaceScoreHistory = (
    list: HTMLOListElement,
    scores: ReadonlyArray<number>,
    signature: string,
): void => {
    const items = scores.map((score, index) => {
        const item = document.createElement("li");
        item.textContent = `Game ${index + 1}: ${score}`;
        return item;
    });

    list.replaceChildren(...items);
    list.setAttribute("data-score-history", signature);
};

const updateScoreHistory = (
    list: HTMLOListElement,
    scores: ReadonlyArray<number>,
): void => {
    const signature = JSON.stringify(scores);

    list.getAttribute("data-score-history") === signature
        ? undefined
        : replaceScoreHistory(list, scores, signature);
};

const createSvgElement = (
    namespace: string | null,
    name: string,
    properties: Record<string, string> = {},
): SVGElement => {
    const element = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(properties).forEach(([key, value]) =>
        element.setAttribute(key, value),
    );
    return element;
};

type TargetElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

type BinaryDigitElements = Readonly<{
    rectangle: SVGElement;
    text: SVGElement;
}>;

type ChallengeElement = Readonly<{
    id: ChallengeId;
    element: HTMLElement;
    description: (goals: ChallengeGoals) => string;
}>;

export const render = (): ((state: State) => void) => {
    const svg = queryElement<SVGSVGElement>("#svgCanvas");
    const gameOver = queryElement<SVGElement>("#gameOver");
    const pausedMessage = queryElement<SVGElement>("#paused");
    const pauseButton = queryElement<HTMLButtonElement>("#pauseButton");
    const scoreText = queryElement<HTMLElement>("#scoreText");
    const scoreHistoryList = queryElement<HTMLOListElement>("#scoreHistory");
    const emptyScoreHistory = queryElement<HTMLElement>("#emptyScoreHistory");
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

    svg.setAttribute(
        "viewBox",
        `0 0 ${VIEWPORT.CANVAS_WIDTH} ${VIEWPORT.CANVAS_HEIGHT}`,
    );

    const checkLine = createSvgElement(svg.namespaceURI, "line", {
        x1: "0",
        y1: `${CONSTANTS.CHECK_LINE_Y}`,
        x2: `${VIEWPORT.CANVAS_WIDTH}`,
        y2: `${CONSTANTS.CHECK_LINE_Y}`,
        stroke: "yellow",
        "stroke-width": "3",
        "stroke-dasharray": "8 5",
    });
    const targetLayer = createSvgElement(svg.namespaceURI, "g", {
        id: "targetLayer",
    });

    svg.appendChild(checkLine);
    svg.appendChild(targetLayer);

    const digitWidth = VIEWPORT.CANVAS_WIDTH / CONSTANTS.DIGIT_COUNT;
    const binaryDigitElements: ReadonlyArray<BinaryDigitElements> = Array.from(
        { length: CONSTANTS.DIGIT_COUNT },
        (_, index) => {
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
            const text = createSvgElement(svg.namespaceURI, "text", {
                "data-digit-index": String(index),
                x: `${index * digitWidth + digitWidth / 2}`,
                y: `${VIEWPORT.CANVAS_HEIGHT - 22}`,
                "text-anchor": "middle",
                "font-family": "monospace",
                "font-size": "20",
                fill: "black",
            });

            text.textContent = "0";
            svg.appendChild(rectangle);
            svg.appendChild(text);
            return { rectangle, text };
        },
    );

    const targetElements = new Map<number, TargetElements>();

    const createTargetElements = (target: FallingTarget): TargetElements => {
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
        const text = createSvgElement(svg.namespaceURI, "text", {
            x: `${target.x + TARGET.WIDTH / 2}`,
            y: `${target.y + TARGET.HEIGHT / 2 + 7}`,
            "text-anchor": "middle",
            "font-family": "monospace",
            "font-size": "20",
            fill: "black",
        });

        text.textContent = target.hexadecimalValue.toString(16).toUpperCase();
        targetLayer.appendChild(rectangle);
        targetLayer.appendChild(text);
        return { rectangle, text };
    };

    const removeTargetElements = (
        elements: TargetElements,
        id: number,
    ): void => {
        elements.rectangle.remove();
        elements.text.remove();
        targetElements.delete(id);
    };

    return (state: State): void => {
        updateText(scoreText, String(state.score));
        updateScoreHistory(scoreHistoryList, state.scoreHistory);
        emptyScoreHistory.hidden === state.scoreHistory.length > 0
            ? undefined
            : (emptyScoreHistory.hidden = state.scoreHistory.length > 0);

        challengeElements.forEach(({ id, element, description }) => {
            const isComplete = state.completedChallenges.includes(id);
            const trophy = queryElement<HTMLElement>(".trophy", element);
            const challengeText = queryElement<HTMLElement>(
                ".challengeText",
                element,
            );

            updateClass(element, "completed", isComplete);
            updateText(trophy, isComplete ? "🏆" : "○");
            updateText(challengeText, description(state.challengeGoals));
        });

        binaryDigitElements.forEach(({ rectangle, text }, index) => {
            const currentBit = state.binaryDigits[index];
            updateAttribute(
                rectangle,
                "fill",
                currentBit === 1 ? "#81c784" : "#ef9a9a",
            );
            updateText(text, String(currentBit));
        });

        const activeTargetIds = new Set(state.targets.map(target => target.id));
        state.targets.forEach(target => {
            const existingElements = targetElements.get(target.id);
            const elements = existingElements ?? createTargetElements(target);
            existingElements === undefined
                ? targetElements.set(target.id, elements)
                : undefined;
            updateAttribute(elements.rectangle, "y", String(target.y));
            updateAttribute(
                elements.text,
                "y",
                String(target.y + TARGET.HEIGHT / 2 + 7),
            );
        });
        targetElements.forEach((elements, id) => {
            activeTargetIds.has(id)
                ? undefined
                : removeTargetElements(elements, id);
        });

        state.gameEnd ? show(gameOver) : hide(gameOver);
        state.isPaused && !state.gameEnd
            ? show(pausedMessage)
            : hide(pausedMessage);
        updateText(pauseButton, state.isPaused ? "Resume game" : "Pause game");
        pauseButton.disabled === state.gameEnd
            ? undefined
            : (pauseButton.disabled = state.gameEnd);
    };
};
