// isomorphic-git expects Node's Buffer; browsers do not have one. Imported first by git.js.
import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;
