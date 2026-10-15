// SPDX-License-Identifier: MIT
import type { Job } from "../domain.ts";

/** Failures that recover on the next attempt do not send a notification. */
export const REPEATED_FAILURES = 2;

/** A new selection rubric supersedes the active job without failing it. */
export class RubricChanged extends Error {}

export type ActiveJob = Job &
  Required<
    Pick<
      Job,
      "workIds" | "rubric" | "failed" | "created" | "limited" | "deferred"
    >
  >;
