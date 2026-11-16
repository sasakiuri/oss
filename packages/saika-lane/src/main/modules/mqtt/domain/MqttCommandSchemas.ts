// SPDX-License-Identifier: MIT
import { createCommandSchemas } from '@sasakiuri/saika-protocol/commands';
import { z } from 'zod';

// Preserve compatibility with legacy Lane senders that omitted the human-readable issuer label.
export const laneCommandSchemas = createCommandSchemas(z.string());
