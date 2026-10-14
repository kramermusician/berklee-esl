# Sentence Crane

A split-screen crane game for ESL1 and ESL3. One to four players, one gamepad each. Every player has a pit of word blocks: one sentence plus one extra word that does not belong. Move the crane, grab a word, lift it into the next slot. A wrong word bounces back and jams the claw for about a second. Each correct sentence is a point, and the round is 60 seconds by default.

The cousin of Hangul Crane (the Playdate Korean game), built for the browser. Input module and player colors come from Key Party.

## Endpoint (done-when)

Done when Kramer can connect 1-4 gamepads to the MacBook, open Sentence Crane in Chrome, pick a grammar function (or mixed), and run a 60-second race where each player crane-builds their own different sentences, then see scores and a review of every sentence built.

## Launch

- Local: `./run.sh` (port 8777, opens Chrome). Opening `index.html` straight from Finder also works in Chrome.
- Site: `https://kramermusician.github.io/berklee-esl/tools/sentence-crane/` once pushed.

Press X once on each pad to wake it (a pad is invisible to the browser until a button is pressed), then X again to join.

## Controls

PS4 pad, standard mapping: stick or d-pad moves the crane, X grabs and then lifts the word into the sentence, circle drops the word back, triangle twice skips the sentence. Join screen: X joins, circle leaves, up/down pick a row, left/right change it, Options starts. Results: Options plays again, circle goes back to setup.

Keyboard players (for testing): WASD with F grab, R drop, H skip; arrows with comma grab, ' drop, / skip. Enter starts, Esc returns to setup.

## How a round works

- Layout: 1 player full screen, 2 players top and bottom, 3 or 4 players in quadrants (with 3, the fourth quadrant is a big timer and scoreboard).
- Fairness: sentences are dealt in waves. Wave N gives every player a different sentence from the same function, picked for similar length, so players at the same point face comparable work and cannot copy each other.
- Feedback: lifting the extra word shows that sentence's `why` line. A real word in the wrong place says it comes later. After three misses on one slot, the correct block glows.
- Results: ranking by sentences, ties broken by fewer misses. The review lists every sentence each player built, skipped, or ran out of time on, with the function words in gold and the extra word explained. It stays up until someone presses a button, so it works as the class debrief.

## Sentence bank

`js/sentences.js`: 7 functions (compare, contrast, hedge, cause and effect, condition, purpose, time order), 97 sentences, music and student-life topics, 6 to 10 words. Format notes are at the top of the file. Rules for a new sentence:

- Function words in `[brackets]`. Punctuation stays on its word.
- The distractor is a real learner mistake (then/than, although plus but, during plus a clause). For hedges it is a word that is too strong (must, always, prove). It must never be a word that also works.
- If a second word order is also correct English, add it to `alts` so the game accepts it.
- The `why` line is one full sentence a B1 reader can parse. The tips and `why` lines passed `scripts/utilities/voice_gate.py --level B1 --strict` on 2026-10-08; re-run it after edits (dump the lines to a text file first).

The page runs a self-check at boot (alt orders use the same words, distractor not in the sentence, length range) and shows the error instead of the game if one fails.

## Testing

`?bots=4&auto=1` starts a round with four bots that play by themselves (and sometimes grab the wrong word). `?mode=hedge` and `?seconds=45` preset the join screen. `document.body.dataset.state` and `.scores` mirror the game for scripted checks.

Verified 2026-10-08 in headless Chrome with bots at 1, 2, 3 and 4 players. Real PS4 pads not yet verified by an agent; same input code as Key Party.
