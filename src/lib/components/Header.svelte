<script lang="ts">
	import { user } from '$lib/store';
	import { version } from '$app/environment';

	import { notisCount } from '$lib/store';
</script>

<header>
	<div class="left">
		<a href="/">
			<img src="/Logo.png" alt="Logo" height="50px" />
		</a>
		<div class="links">
			<a
				target="_blank"
				href="https://github.com/ssebastianoo/social.giorgiovola.casa/"
				title={`GitHub - ${version}`}
				><svg xmlns="http://www.w3.org/2000/svg" height="1.2em" viewBox="0 0 496 512"
					><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
						d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
					/></svg
				></a
			>
			<a target="_blank" href="https://t.me/giorgiovola" title="Telegram">
				<svg xmlns="http://www.w3.org/2000/svg" height="1.2em" viewBox="0 0 496 512"
					><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
						d="M248,8C111.033,8,0,119.033,0,256S111.033,504,248,504,496,392.967,496,256,384.967,8,248,8ZM362.952,176.66c-3.732,39.215-19.881,134.378-28.1,178.3-3.476,18.584-10.322,24.816-16.948,25.425-14.4,1.326-25.338-9.517-39.287-18.661-21.827-14.308-34.158-23.215-55.346-37.177-24.485-16.135-8.612-25,5.342-39.5,3.652-3.793,67.107-61.51,68.335-66.746.153-.655.3-3.1-1.154-4.384s-3.59-.849-5.135-.5q-3.283.746-104.608,69.142-14.845,10.194-26.894,9.934c-8.855-.191-25.888-5.006-38.551-9.123-15.531-5.048-27.875-7.717-26.8-16.291q.84-6.7,18.45-13.7,108.446-47.248,144.628-62.3c68.872-28.647,83.183-33.623,92.511-33.789,2.052-.034,6.639.474,9.61,2.885a10.452,10.452,0,0,1,3.53,6.716A43.765,43.765,0,0,1,362.952,176.66Z"
					/></svg
				>
			</a>
		</div>
	</div>
	<div class="auth">
		{#if $user}
			<a href="/notifications" class="bell" data-count={$notisCount}>
				<svg xmlns="http://www.w3.org/2000/svg" height="1.2em" fill="white" viewBox="0 0 448 512"
					><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
						d="M224 0c-17.7 0-32 14.3-32 32V49.9C119.5 61.4 64 124.2 64 200v33.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416H424c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6C399.5 322.9 384 278.8 384 233.4V200c0-75.8-55.5-138.6-128-150.1V32c0-17.7-14.3-32-32-32zm0 96h8c57.4 0 104 46.6 104 104v33.4c0 47.9 13.9 94.6 39.7 134.6H72.3C98.1 328 112 281.3 112 233.4V200c0-57.4 46.6-104 104-104h8zm64 352H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7s18.7-28.3 18.7-45.3z"
					/></svg
				>
				{#if $notisCount > 0}
					<p>{$notisCount}</p>
				{/if}
			</a>
			<a href={'/@' + $user.username}>
				<img
					src={$user.avatar || 'https://source.boringavatars.com/beam/50/' + $user.username}
					alt={$user.username + "'s avatar"}
					height="50"
					width="50"
				/>
			</a>
		{:else}
			<p><a href="/login">login</a></p>
		{/if}
	</div>
</header>

<style lang="scss">
	@import 'src/variables.scss';

	header {
		position: fixed;
		top: 0;
		left: 0;
		width: calc(100% - 40px);
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 15px 20px;
		background-color: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(3px);
		z-index: 999;

		.bell {
			display: flex;
			justify-content: center;
			gap: 5px;
			height: 35px;
			border-radius: 100px;

			&[data-count='0']:hover {
				svg {
					fill: $color1;
				}
			}

			&:not([data-count='0']) {
				border: 2px solid $color1;
				width: 55px;

				&:hover {
					text-decoration: none;
					background-color: $color1;
				}
			}
		}

		a {
			display: flex;
			align-items: center;
			color: unset;
		}

		.auth {
			display: flex;
			gap: 20px;
			align-items: center;

			img {
				object-fit: cover;
				border-radius: 50%;
			}
		}

		.left {
			display: flex;
			gap: 10px;

			.links {
				display: flex;
				flex-direction: column;
				justify-content: center;
				gap: 10px;

				svg {
					fill: $color1;

					&:hover {
						fill: $color3;
					}
				}
			}
		}
	}
</style>
