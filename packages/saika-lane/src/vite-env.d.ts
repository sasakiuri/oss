// SPDX-License-Identifier: MIT
/// <reference types="vite/client" />

/** Application version injected by Vite define at build time */
declare const __APP_VERSION__: string;

// Image file imports
declare module '*.png' {
  const src: string;
  export default src;
}

// Audio file imports
declare module '*.mp3' {
  const src: string;
  export default src;
}

declare module '*.wav' {
  const src: string;
  export default src;
}

declare module '*.ogg' {
  const src: string;
  export default src;
}
