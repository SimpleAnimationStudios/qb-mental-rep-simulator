# Crucible research notes, for the Pocket IQ v8 design

Researched Nov 3, 2026 (ET) using only public web pages. Crucible's app itself was not run: it is iOS/Android only and needs an account.

This file paraphrases public descriptions so we can understand the product's flow. No Crucible branding, assets or text is used in Pocket IQ, and every name in our app is original.

## Sources
- https://www.crucibletech.com/ (home page)
- https://www.crucibletech.com/quarterback-simulator/
- https://www.crucibletech.com/build-your-quarterback/
- https://www.crucibletech.com/faq/
- https://www.crucibletech.com/pricing/ (shown in search-result excerpts)
- https://crucibletech.com/for-managers/ (shown in search-result excerpts)
- AFCA interview with Ryan Fitzpatrick, Jun 24, 2026: https://www.afca.com/ryan-fitzpatrick-discusses-coaching-influence-and-quarterback-development-through-crucible/

## What is stated publicly (verified on those pages)

**Product and core loop**
- It is a 3D quarterback simulator for phones, with no headset. It was built by coaches and NFL veteran Ryan Fitzpatrick, its "Chief QB Advisor", to train decision-making.
- The loop: take the snap, read the coverage, make the throw. It then shows "what you saw and what you missed", with instant feedback on the decision and its timing.

**Scoring and stats**
- Every rep gets a SIM Score.
- There is an aggregate "Crucible Sim Score (CSS)", plus stats on completion, decision time, read accuracy, reaction time and coverage recognition.
- Progress over time is shown with charts and graphs, and players can set goals and milestones.

**Difficulty**
- Progressive difficulty scales from youth and high school through college and pro game speed.
- The AFCA interview mentions three levels, each demanding faster decisions.

**Learning**
- Learning modules include tutorials and play or concept breakdowns, coverage recognition, and interactive quizzes.
- Free browser games:
  - "Guess the Coverage": a new coverage every day; name it from a diagram and learn the tell.
  - "QB Reads Quiz": given a concept, a coverage and a defender's reaction, pick where the ball goes.
  - "Football IQ Test": questions on coverages and route diagrams, scored at the end.

**Practice and Playbook mode**
- Players run unlimited reps and installs, and can pick specific scenarios, plays or coverages.
- In the AFCA interview, Fitzpatrick describes repping the same play against a set of about six randomized defenses, giving 200 reps in 30 minutes.

**Competition and community**
- Leaderboards, "locally and globally".
- Achievements for reaching milestones, and a community feature.

**QB traits the site describes**
- Trained by the app: pre-snap reads, progressions, decision speed, pocket presence (the "knowing your hot reads" part) and Football IQ.
- Built on the field instead: arm strength, and accuracy and ball placement.

**Customization**
- Players can change their QB's look: skin tone, voice, name and number, jersey and helmet colours. There are no attribute sliders.

**Coaches and teams**
- Coaches or "Player Managers" can assign reps and build custom Sims in their own terminology.
- Dashboards compare athletes.

**Pricing:** Premium is $9.99 a month; Premium+ ($24.99 a month) adds the coach portal, "Scouting AI" and "Quarterback Lab" installs.

**Rating:** 4.3/5 from 15 App Store ratings, according to the pricing page.

## Not verified (no public screenshots or video could be inspected)
- The exact screen flow and HUD: what the home screen, play-select or concept intro screens look like, and whether there is a pre-snap timer.
- How the throw is input; tapping a receiver is assumed, which is typical for the genre.
- The exact formula and scale of the SIM Score and CSS.
- Session length; "sets of 10" is our own choice.
- Level names; we use Youth, HS, College and Pro based on "youth / high school / college / pro game speed".
- The visual style of the stadium and lighting.

## How Pocket IQ v8 maps these ideas, with original names and implementation
| Public Crucible idea | Pocket IQ v8 |
|---|---|
| Quick, immersive loop with instant feedback | Home screen with a quick Play button; minimal HUD during the live play; feedback card with a score ring, decision time, "best read" and "you missed" |
| SIM Score / CSS | Per-rep SIM score (existing) plus a persistent **Pocket IQ Rating** (an exponential moving average of SIM) |
| Progressive difficulty | Levels Youth → HS → College → Pro, which unlock by rating; they map to the existing difficulty, pre-snap time and pocket-time multipliers |
| Trait stats and progress charts | Session summary after 10 reps: trait breakdown (pre-snap read, progression, decision speed, accuracy, ball security, pocket presence, football IQ) and an SVG chart of session averages |
| Guess the Coverage, QB Reads quiz, IQ test | **Film Room**: Coverage quiz from diagrams, "Where does it go?" concept quiz, and a seeded **Daily Coverage** challenge; coach cards for every coverage, pressure and protection |
| Practice and Playbook mode | **Practice**: choose a play, and optionally a defense, then rep it unscored |
| Leaderboards and achievements | Local-only personal bests and badges, clearly labelled as stored on this device |
