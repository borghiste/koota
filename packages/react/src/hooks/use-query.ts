import { Entity, QueryParameter, QueryResult } from '@koota/core';
import { useEffect, useMemo, useReducer } from 'react';
import { useWorld } from '../world/use-world';

export function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T> {
	const world = useWorld();
	const entities = useMemo(() => world.query(...parameters), [world, ...parameters]);
	const [, forceUpdate] = useReducer((v) => v + 1, 0);

	// Set entities at effect time
	useEffect(() => {
		const mutableEntities = entities as unknown as Entity[];
		mutableEntities.length = 0;
		mutableEntities.push(...world.query(...parameters));

		forceUpdate();
	}, [world]);

	// Subscribe to changes
	useEffect(() => {
		const unsubAdd = world.onAdd(parameters, (entity) => {
			const mutableEntities = entities as unknown as Entity[];
			mutableEntities.push(entity);
			forceUpdate();
		});

		const unsubRemove = world.onRemove(parameters, (entity) => {
			const mutableEntities = entities as unknown as Entity[];
			const index = mutableEntities.indexOf(entity);
			mutableEntities[index] = mutableEntities[mutableEntities.length - 1];
			mutableEntities.pop();
			forceUpdate();
		});

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world]);

	return entities;
}
