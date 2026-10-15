// SPDX-License-Identifier: MIT
import { choiceAnswer } from "../../src/jev/evaluation.ts";

/** Protocol-validation fixtures also carry the provider's unused confidence field. */
export function selected(
  value: string,
  options: Iterable<string>,
  probability = 1,
) {
  return { ...choiceAnswer(value, [...options], probability), confidence: 0.5 };
}

/** Runtime fixtures intentionally use a literal remainder, preserving their exact doubles. */
export function choiceWithRemainder(
  value: string,
  options: string[],
  probability: number,
  remainder: number,
) {
  return {
    ...choiceAnswer(value, options, probability),
    probabilities: Object.fromEntries(
      options.map((name) => [
        name,
        name === value ? probability : remainder / (options.length - 1),
      ]),
    ),
  };
}
