import "./style.css";

import { fromEvent, switchMap, take } from "rxjs";

import { state$ } from "./observable";
import { render } from "./view";

export {
    createActivePulseStream,
    createRestartingTargetStream,
    state$,
} from "./observable";
export { generateChallengeGoals, randomInteger } from "./random";
export {
    binaryToDecimal,
    createGameState,
    createTarget,
    flipBinaryDigit,
    flipBit,
    getLowestTarget,
    initialState,
    reduceState,
    restartGame,
    targetSpeed,
    tick,
    updateCompletedChallenges,
} from "./state";
export type {
    BinaryDigits,
    Bit,
    ChallengeGoals,
    ChallengeId,
    ChallengeSetup,
    FallingTarget,
    GameEvent,
    RandomResult,
    State,
} from "./types";

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    click$.pipe(switchMap(() => state$())).subscribe(render());
}
