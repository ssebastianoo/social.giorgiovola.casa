// state for the /install page. chromium fires `beforeinstallprompt` once the app is installable and
// lets us open its install dialog from our own button; safari on ios never does. the root layout
// imports this module, so the listener is attached before the event fires, also when the page is
// opened later by navigating client side.

type InstallEvent = Event & {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export const installState = $state<{
	event: InstallEvent | null;
	standalone: boolean;
	ios: boolean;
}>({ event: null, standalone: false, ios: false });

// ipads report themselves as a mac
const isIos = () =>
	/iphone|ipad|ipod/i.test(navigator.userAgent) ||
	(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (typeof window !== 'undefined') {
	installState.standalone =
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	installState.ios = isIos();

	window.addEventListener('beforeinstallprompt', (e) => {
		// keep it for our own button instead of the browser's mini infobar
		e.preventDefault();
		installState.event = e as InstallEvent;
	});
	window.addEventListener('appinstalled', () => {
		installState.event = null;
		installState.standalone = true;
	});
}

export const promptInstall = async () => {
	const event = installState.event;
	if (!event) return;
	// an event can only be used once
	installState.event = null;
	await event.prompt();
	await event.userChoice;
};
