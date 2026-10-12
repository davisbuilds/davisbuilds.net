// Where the operator's telemetry state lives on the producing host: the
// snapshot's candidate, and the last document actually published (the
// baseline for the year-to-date and zero rules).
import { homedir } from 'node:os';
import path from 'node:path';

export const STATE = path.join(process.env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state'), 'davisbuilds.net', 'telemetry');
export const CANDIDATE = path.join(STATE, 'candidate.json');
export const PUBLISHED = path.join(STATE, 'published.json');
