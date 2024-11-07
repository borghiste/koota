// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useObserve, useObservePassive, useQuery, useQueryFirst, useWorld } from 'koota/react';
import { memo, StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useActions } from './actions';
import { schedule } from './systems/schedule';
import {
	Bullet,
	Explosion,
	Input,
	IsEnemy,
	IsPlayer,
	IsShieldVisible,
	Movement,
	Transform,
} from './traits';
import { between } from './utils/between';
import { useStats } from './utils/use-stats';

export function App() {
	return (
		<Canvas>
			<StrictMode>
				<color attach="background" args={['#111']} />
				<ambientLight intensity={0.2} />
				<directionalLight position={[10, 10, 10]} intensity={0.4} />

				<PerspectiveCamera position={[0, 0, 50]} makeDefault />

				<Player />
				<Enemies />
				<Bullets />
				<Explosions />

				<Simulation />
			</StrictMode>
		</Canvas>
	);
}

function Enemies() {
	const enemies = useQuery(IsEnemy, Transform);
	return (
		<>
			{enemies.map((enemy) => (
				<EnemyRenderer key={enemy.id()} entity={enemy} />
			))}
		</>
	);
}

const EnemyRenderer = memo(({ entity }: { entity: Entity }) => {
	const meshRef = useRef<THREE.Mesh>(null);
	const scaleRef = useRef(0);

	// Set initial values and sync with the entity
	useLayoutEffect(() => {
		if (!meshRef.current) return;

		// Set initial position and orientation
		meshRef.current.position.set(between(-50, 50), between(-50, 50), 0);
		meshRef.current.quaternion.random();

		// Sync transform with the trait
		entity.set(Transform, {
			position: meshRef.current.position,
			rotation: meshRef.current.rotation,
			quaternion: meshRef.current.quaternion,
		});

		entity.set(Movement, { maxSpeed: between(5, 10) });
	}, []);

	useFrame((_, delta) => {
		if (!meshRef.current) return;
		const progress = Math.min(scaleRef.current + delta * 2, 1);
		// Apply easing - this uses cubic easing out
		const eased = 1 - Math.pow(1 - progress, 3);
		scaleRef.current = progress;
		meshRef.current.scale.setScalar(eased);
	});

	return (
		<mesh ref={meshRef}>
			<dodecahedronGeometry />
			<meshBasicMaterial color="white" wireframe />
		</mesh>
	);
});

function Player() {
	const player = useQueryFirst(IsPlayer, Transform);
	const { spawnPlayer } = useActions();

	useLayoutEffect(() => {
		const entity = spawnPlayer();
		return () => entity?.destroy();
	}, [spawnPlayer]);

	return (
		<>{player && <PlayerRenderer entity={player} maxSpeed={50} damping={0.99} thrust={2} />}</>
	);
}

const PlayerRenderer = memo(
	({
		entity,
		maxSpeed = 50,
		damping = 0.99,
		thrust = 2,
	}: {
		entity: Entity;
		maxSpeed?: number;
		damping?: number;
		thrust?: number;
	}) => {
		const ref = useRef<THREE.Group>(null);

		// Thrusting state
		const [isThrusting, setIsThrusting] = useState(false);

		useObservePassive(entity, Input, (input) => {
			if (input && input.length() > 0) setIsThrusting(true);
			else setIsThrusting(false);
		});

		// Shield visibility state
		const isShieldVisible = useObserve(entity, IsShieldVisible);

		// Set initial values and sync with the entity
		useLayoutEffect(() => {
			if (!ref.current) return;

			entity.set(Transform, {
				position: ref.current.position,
				rotation: ref.current.rotation,
				quaternion: ref.current.quaternion,
			});
			entity.set(Movement, { maxSpeed, damping, thrust });
		}, [entity]);

		return (
			<group ref={ref}>
				<mesh>
					<boxGeometry />
					<meshBasicMaterial color="orange" wireframe />
				</mesh>
				{isThrusting && <ThrusterRenderer />}
				{isShieldVisible && <ShieldRenderer />}
			</group>
		);
	}
);

function ShieldRenderer() {
	return (
		<mesh>
			<sphereGeometry args={[1.1, 8, 8]} />
			<meshBasicMaterial color="blue" wireframe />
		</mesh>
	);
}

function ThrusterRenderer() {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame(({ clock }) => {
		if (!meshRef.current) return;
		// Create a pulsing effect by using sin wave
		const scale = 0.8 + Math.sin(clock.elapsedTime * 10) * 0.2;
		meshRef.current.scale.setY(scale);
		meshRef.current.position.y = -(1 - scale) / 2;
	});

	return (
		<group position={[0, -1, 0]} rotation={[0, 0, 3.14]}>
			<mesh ref={meshRef}>
				<coneGeometry args={[0.3, 1, 8]} />
				<meshBasicMaterial color="#ff4400" wireframe />
			</mesh>
		</group>
	);
}

function Explosions() {
	const explosions = useQuery(Explosion, Transform);
	return (
		<>
			{explosions.map((explosion) => (
				<ExplosionRenderer key={explosion.id()} entity={explosion} />
			))}
		</>
	);
}

function ExplosionRenderer({ entity }: { entity: Entity }) {
	const groupRef = useRef<THREE.Group>(null);
	const particleCount = entity.get(Explosion).count;

	useLayoutEffect(() => {
		if (!groupRef.current) return;

		// Position the explosion group
		groupRef.current.position.copy(entity.get(Transform).position);

		// Set particle velocities with random offset
		const velocities = entity.get(Explosion).velocities;
		const randomOffset = Math.random() * Math.PI * 2; // Random starting angle

		for (let i = 0; i < particleCount; i++) {
			const angle = randomOffset + (i / particleCount) * Math.PI * 2;
			velocities.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
		}

		return () => {
			velocities.length = 0;
		};
	}, []);

	useFrame((_, delta) => {
		if (!groupRef.current) return;

		const { duration, current } = entity.get(Explosion);
		const progress = current / duration;

		const velocities = entity.get(Explosion).velocities;
		const particles = groupRef.current.children as THREE.Mesh[];

		for (let i = 0; i < particleCount; i++) {
			const particle = particles[i];
			if (!particle) continue;
			particle.position.add(velocities[i].clone().multiplyScalar(delta * 40));

			// Update scale and opacity
			const scale = Math.max(0, 1 - progress);
			particle.scale.setScalar(scale);
			(particle.material as THREE.MeshBasicMaterial).opacity = scale;
		}
	});

	return (
		<group ref={groupRef}>
			{Array.from({ length: particleCount }).map((_, i) => {
				return (
					<mesh key={i}>
						<sphereGeometry args={[0.2, 8, 8]} />
						<meshBasicMaterial color={[1, 0.5, 0]} transparent />
					</mesh>
				);
			})}
		</group>
	);
}

function Bullets() {
	const bullets = useQuery(Bullet, Transform);
	return (
		<>
			{bullets.map((bullet) => (
				<BulletRenderer key={bullet.id()} entity={bullet} />
			))}
		</>
	);
}

const BulletRenderer = memo(({ entity }: { entity: Entity }) => {
	const meshRef = useRef<THREE.Mesh>(null);

	// Set initial values and sync with the entity
	useLayoutEffect(() => {
		if (!meshRef.current) return;

		// Copy current values
		const { position, rotation, quaternion } = entity.get(Transform);
		meshRef.current.position.copy(position);
		meshRef.current.rotation.copy(rotation);
		meshRef.current.quaternion.copy(quaternion);

		// Sync transform with the trait
		entity.set(Transform, {
			position: meshRef.current.position,
			rotation: meshRef.current.rotation,
			quaternion: meshRef.current.quaternion,
		});
	}, []);

	return (
		<mesh ref={meshRef} scale={0.2}>
			<sphereGeometry />
			<meshBasicMaterial color="red" wireframe />
		</mesh>
	);
});

// Simulation runs a schedule.
function Simulation() {
	const world = useWorld();
	const statsApi = useStats({
		enemies: () => world.query(IsEnemy).length,
	});

	useFrame(() => {
		statsApi.measure(() => {
			schedule.run({ world });
		});
		statsApi.updateStats();
	});

	return null;
}
