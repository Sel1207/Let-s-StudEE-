# Lets StudEE!

Lets StudEE is a browser-based study timer for practicing questions across subject banks. Choose topics, set their relative priority, and let the app read each question before starting its matching countdown.

## Use the app

Open [lets-studee.vercel.app](https://lets-studee.vercel.app). Foundational Math comes preloaded with 30 questions; other topic banks start empty. Add or edit questions under **Manage questions**. Banks, settings, topic priorities, and results are saved in the browser's local storage. Use the JSON backup controls to preserve or transfer your data.

Add one question per line. A duration prefix is optional; without one, the default from Settings is used.

```text
20 | What is twelve squared?
1m | Explain the fundamental theorem of calculus.
What is the derivative of x squared?
```

Available durations include 20, 30, 45, 60, and 90 seconds, and 1, 2, or 3 minutes. Questions are read twice before the timer starts. Speech defaults to Microsoft Liam Online (Natural), English (Canada), at normal speed when available, with an English voice fallback.

Topic priority is relative: `1x` is standard and `5x` is five times as likely within the active question pool. `0` excludes that topic. The displayed percentage is its current share of the pool.

## Keyboard shortcuts

- `Space`: Read a question or move to the next one
- `R`: Hear the question again during the countdown
- `Q`: Reveal the question

## Develop

Requires Node.js and npm.

```sh
npm install
npm run dev
```

Run checks with `npm test`, `npm run lint`, and `npm run build`.
