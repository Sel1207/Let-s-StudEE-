# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # Let's StudEE!

  Lets StudEE is a browser-based study timer for practicing questions across separate subject banks. Choose topics, set their relative priority, and let the app read each question before starting its matching countdown.

  ## Use the app

  Open [lets-studee.vercel.app](https://lets-studee.vercel.app), then choose **Manage questions** to add questions to a subject. A new browser starts with empty banks. Your banks, settings, topic priorities, and results are saved in that browser's local storage. Use the JSON backup controls to move or preserve your data.

  Add one question per line. A duration prefix is optional; without one, the default from Settings is used.

  ```text
  20 | What is twelve squared?
  1m | Explain the fundamental theorem of calculus.
  What is the derivative of x squared?
  ```

  Available durations include 20, 30, 45, 60, and 90 seconds, and 1, 2, or 3 minutes. Write questions as you want them spoken; the app uses your browser's built-in speech synthesis.

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
  {
