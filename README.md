# Assignment 1 - FIT2102 Flippy Bit

Name: Tu Wei Ning
Student ID: 35175257

## Game Overview

Flippy Bit is an eight-bit binary digit matching game implemented in TypeScript with
RxJS and Functional Programming. Hexadecimal targets fall toward a
check line at the bottom and acts like a finish line, and the player must type the
binary digits to the matching value using keyboard 1-8 to flip between 0 and 1
before the lowest target reaches that line.

## Basic Game Rule Rundown

- Press number keys 1-8 to flip the binary digit, or clicking it with a mouse.
- Click on the pause game button to stop and later resume the current game without starting a new one.
- Click on the restart game button to start a new game at any time, even when the game is running.
- Multiple targets coming donw, with the lowest target haveing to be solved first.
- One point for every correct binary number entered, and it shows up on the screen
- Game over when the binary value does not match the target at the check line, or when there is no input(excluding when 00000000 is the correct answer)

## Implemented Features

- 8 binary digits and hexadecimal falling targets
- Random target values from 0 to FF
- Random target spawn in between 1-3 seconds
- Random target falling positions within the canvas of the game (left to right)
- Gradually increasing target speed, the longer the player goes, the faster the game becomes
- Keyboard and mouse both work on changing the binary digits.
- Restart button works during the game, when the game is paused, and when the game is over.
- The score history that lasts until the browser page is refreshed, it keeps track of the history score

## How and Where is each feature implemented?

- Eight binary controls — `view.ts`, `observable.ts`, and `state.ts`.
  `view.ts` draws the eight digits. `observable.ts` detects mouse clicks and
  keyboard keys 1–8, while `state.ts` changes the selected digit between zero
  and one.
- Falling hexadecimal targets — `observable.ts`, `state.ts`, and `view.ts`.
  `observable.ts` requests new targets, `state.ts` creates and moves their data,
  and `view.ts` displays their values from `00` to `FF` on the screen.
- Random target delays - `observable.ts` and `state.ts`. `state.ts` provides
  the seeded random-number calculation. `observable.ts` uses it to choose a
  delay between 1-3 seconds before creating each target
- Random target positions — `observable.ts` and `state.ts`.
  `observable.ts` uses the seeded random number function from `state.ts` to
  choose each target's horizontal position while keeping it inside the canvas.
- Multiple targets and lowest-target checking — `state.ts`. The State can
  contain several targets at once. `getLowestTarget` finds the target closest to
  the yellow line so that target is checked first.
- Scoring — `state.ts` and `view.ts`. `state.ts` adds one point after a
  correct match and removes the solved target. `view.ts` displays the updated
  score.
- Game Over — `state.ts` and `view.ts`. `state.ts` ends the game when the
  lowest target reaches the line without matching the selected binary value.
  `view.ts` then displays the Game Over message.
- Increasing target speed — `state.ts`. `targetSpeed` starts targets at a
  slow speed and increases their movement as more game ticks pass. The speed
  stops increasing when it reaches the maximum.
- Restart — `observable.ts` and `state.ts`. `observable.ts` detects a restart
  click and begins a new target schedule. `state.ts` creates a fresh game State,
  whether the previous game was running, paused, or over.
- Pause and resume — `observable.ts`, `state.ts`, and `view.ts`.
  `observable.ts` stops the game clock while paused, so movement, elapsed time,
  and target waiting times stop together. `state.ts` records the pause setting,
  and `view.ts` updates the message and button text.
- Score history — `state.ts` and `view.ts`. `state.ts` adds the
  previous score to a list when the player restarts. `view.ts` displays that
  list, which disappears when the web page is refreshed or closed.

# My Files

- index.html: Contains the page structure for the game, including the SVG
  canvas, buttons, score, challenges, and score-history panel. The TypeScript
  files find these elements using their IDs and update them while the game runs.
- src/main.ts: Acts as the starting point of the program. It starts the
  game after the player's first mouse click and exports the functions and types
  that are needed by other files
- src/model.ts: Stores the game constants and types. It defines the structure of
  bits, targets, challenges, events, and the complete game state.
- src/state.ts: Contains the game calculations. It creates random
  values from a seed, moves targets, checks answers, updates scores and
  challenges, and returns the next game State.
- src/observable.ts: Handles events that happen over time, including timer,
  keyboard input, mouse input, pause, restart, and target creation. It
  combines these events and uses them to produce the latest game state.
- src/view.ts: Displays each new game state on the page. It creates and
  updates the SVG targets, binary digits, score, challenges, history, pause, and
  Game Over message.
- src/dom.ts: Provides a reusable function for finding an HTML or SVG
  element. It also gives a clear error if a required element cannot be found.
- src/style.css`: Controls the colours, spacing, fonts, button appearance,
  and page layout. It also provides visual after successful challenges.
- test/main.test.ts: Contains the automated tests for the main game
  calculations and important Observable behaviour.

## Advanced Challanges - HD Requirement

- Pause Button: When the player is playing the game and they want to pause it, they can
  click on the button and the game will pause while saving the histroy of the previous
  game scores or how far they are at the challanges. If the player wants to start the
  game, just press on the button again and the game continues running again.

- History score tracker: The player's score is tracked under the game with a history
  tracker. The user can see their score tracker.

- Random Challange: Each time the player opens the game and restarts the game, there is
  a 3 challange section the user can try to accomplish. If the challange is accomplished,
  a trophy appears indicating the challange is completed.

## AI Citation

I have used Chatgpt, Claude in this assignment to give me ideas of how to implment my ideas into code, checking if the codes are in proper functional and FRP style. I also used Chatgpt to generate code that I can further develop from. Eventually, I also used Chatgpt to check I did not do or implement anything that is not allowed in this assignment.

Setup (requires node.js):

```bash
> npm install
```

Start tests:

```bash
> npm test
```

Serve up the App (and ctrl-click the URL that appears in the console)

```bash
> npm run dev
```

To format your code, for the assignment specifications:

```bash
npx prettier . --write
```

The configuration for this is set in `.prettierrc.json`. Feel free to change this to your heart's desire, but try to ensure it still fits the assignment guidelines.

If you are using VS Code, you can also install the [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode). This skeleton code is set up to automatically format your code on save. You can disable this in `.vscode/settings.json` by changing `"editor.formatOnSave": true` to `"editor.formatOnSave": false`.
