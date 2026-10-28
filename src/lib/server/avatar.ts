// Port of the "beam" variant of boring-avatars (https://github.com/boringdesigners/boring-avatars)
const SIZE = 36;
const COLORS = ['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90'];

function hashCode(name: string) {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash << 5) - hash + name.charCodeAt(i);
		hash = hash & hash;
	}
	return Math.abs(hash);
}

const getDigit = (number: number, ntn: number) => Math.floor((number / Math.pow(10, ntn)) % 10);
const getBoolean = (number: number, ntn: number) => !(getDigit(number, ntn) % 2);

function getUnit(number: number, range: number, index?: number) {
	const value = number % range;
	if (index && getDigit(number, index) % 2 === 0) return -value;
	return value;
}

function getContrast(hex: string) {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000000' : '#FFFFFF';
}

export function generateAvatar(name: string, size = 80) {
	const num = hashCode(name);
	const wrapperColor = COLORS[num % COLORS.length];
	const faceColor = getContrast(wrapperColor);
	const backgroundColor = COLORS[(num + 13) % COLORS.length];

	const preTranslateX = getUnit(num, 10, 1);
	const wrapperTranslateX = preTranslateX < 5 ? preTranslateX + SIZE / 9 : preTranslateX;
	const preTranslateY = getUnit(num, 10, 2);
	const wrapperTranslateY = preTranslateY < 5 ? preTranslateY + SIZE / 9 : preTranslateY;

	const wrapperRotate = getUnit(num, 360);
	const wrapperScale = 1 + getUnit(num, SIZE / 12) / 10;
	const isMouthOpen = getBoolean(num, 2);
	const isCircle = getBoolean(num, 1);
	const eyeSpread = getUnit(num, 5);
	const mouthSpread = getUnit(num, 3);
	const faceRotate = getUnit(num, 10, 3);
	const faceTranslateX =
		wrapperTranslateX > SIZE / 6 ? wrapperTranslateX / 2 : getUnit(num, 8, 1);
	const faceTranslateY =
		wrapperTranslateY > SIZE / 6 ? wrapperTranslateY / 2 : getUnit(num, 7, 2);

	const mouth = isMouthOpen
		? `<path d="M15 ${19 + mouthSpread}c2 1 4 1 6 0" stroke="${faceColor}" fill="none" stroke-linecap="round"/>`
		: `<path d="M13,${19 + mouthSpread} a1,0.75 0 0,0 10,0" fill="${faceColor}"/>`;

	return `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 2}" fill="#FFFFFF"/></mask>
<g mask="url(#m)">
<rect width="${SIZE}" height="${SIZE}" fill="${backgroundColor}"/>
<rect x="0" y="0" width="${SIZE}" height="${SIZE}" transform="translate(${wrapperTranslateX} ${wrapperTranslateY}) rotate(${wrapperRotate} ${SIZE / 2} ${SIZE / 2}) scale(${wrapperScale})" fill="${wrapperColor}" rx="${isCircle ? SIZE : SIZE / 6}"/>
<g transform="translate(${faceTranslateX} ${faceTranslateY}) rotate(${faceRotate} ${SIZE / 2} ${SIZE / 2})">
${mouth}
<rect x="${14 - eyeSpread}" y="14" width="1.5" height="2" rx="1" stroke="none" fill="${faceColor}"/>
<rect x="${20 + eyeSpread}" y="14" width="1.5" height="2" rx="1" stroke="none" fill="${faceColor}"/>
</g>
</g>
</svg>`;
}
