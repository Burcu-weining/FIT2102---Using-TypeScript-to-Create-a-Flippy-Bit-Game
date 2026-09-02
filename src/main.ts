/*
This gives typescript access to Vite's type declaations. It is
placed before the imports because typescript reference 
must appear at the start of the file
*/
/// <reference types="vite/client" />

/*
main.ts is the entry point to the game. It connects the observable
game-state stream to render and then exports important functions
and types of testing.
Keeping main.ts small makes the program easier to understand. It
separates the game functionalities.
*/
import "./style.css";
import { fromEvent, switchMap, take } from "rxjs";
import { state$ } from "./observable"; //importing the game stream
import { render } from "./view";
//render displays each emitted game state on the display

/*
These functions are defined in observable.ts, but main.ts
makes them avaliable from one central location
*/
export {
    createActivePulseStream,
    createRestartingTargetStream,
    state$,
} from "./observable";

export {
    binaryToDecimal,
    createGameState,
    generateChallengeGoals,
    createTarget,
    flipBinaryDigit,
    flipBit,
    getLowestTarget,
    initialState,
    randomInteger,
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
} from "./model";

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    click$.pipe(switchMap(() => state$())).subscribe(render());
}
