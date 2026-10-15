// SPDX-License-Identifier: MIT
import { START } from "./fixtures.ts";

/** Epoch seconds advance explicitly; sleeps advance by their exact millisecond duration. */
export function fakeClock(start = START) {
  let seconds = start;
  return {
    now: () => seconds,
    set: (value: number) => {
      seconds = value;
    },
    advance: (amount: number) => {
      seconds += amount;
    },
    sleep: async (milliseconds: number) => {
      seconds += milliseconds / 1000;
    },
  };
}
