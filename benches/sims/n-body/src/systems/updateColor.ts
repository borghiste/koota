import { Not, type World } from 'koota';
import { Color, Repulse, Velocity } from '../traits';
import { colorFromSpeed } from '../utils/colorFromSpeed';

export const updateColor = ({ world }: { world: World }) => {
	world.query(Velocity, Color, Not(Repulse)).updateEach(([velocity, color]) => {
		const speed = Math.hypot(velocity.x, velocity.y);
		const { r, g, b, a } = colorFromSpeed(speed);

		color.r = r;
		color.g = g;
		color.b = b;
		color.a = a;
	});
};
