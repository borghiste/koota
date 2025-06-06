import type { World } from '../world/world';
import type { ActionGetter, ActionInitializer, Actions } from './types';

const actionCache = new WeakMap<World, Map<(...args: any[]) => any, Actions>>();

export function createActions<T extends Actions>(initializer: ActionInitializer<T>): ActionGetter<T> {
	return (world: World): T => {
		let worldCache = actionCache.get(world);

		if (!worldCache) {
			worldCache = new Map();
			actionCache.set(world, worldCache);
		}

		let actions = worldCache.get(initializer);

		if (!actions) {
			actions = initializer(world);
			worldCache.set(initializer, actions);
		}

		return actions as T;
	};
}
