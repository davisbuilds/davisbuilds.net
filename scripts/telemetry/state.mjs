import { homedir } from 'node:os';
import path from 'node:path';

export const STATE = path.join(process.env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state'), 'davisbuilds.net', 'telemetry');
export const CANDIDATE = path.join(STATE, 'candidate.json');
export const PUBLISHED = path.join(STATE, 'published.json');
