import { registerForInitHook } from './init';
import { registerForReadyHook } from './ready';

export function registerForHooks() {
    registerForInitHook();
    registerForReadyHook();
}
