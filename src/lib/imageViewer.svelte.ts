// the full screen image preview is a single overlay mounted in the root layout
export const viewer = $state<{ images: string[]; index: number }>({ images: [], index: 0 });

export const openImage = (images: string[], index = 0) => {
	viewer.images = images;
	viewer.index = index;
};

export const closeImage = () => {
	viewer.images = [];
};
