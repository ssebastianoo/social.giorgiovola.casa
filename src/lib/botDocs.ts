// the endpoint reference shown on /developers. Keep it in step with /api.txt (the plain-text
// version for agents) and the table in README.md: every bot API change touches all three.

export type DocLimits = {
	postContent: number;
	messageContent: number;
	name: number;
	bio: number;
	username: number;
	maxBots: number;
	maxProfileUpdates: number;
	pollOptionsMin: number;
	pollOptionsMax: number;
	pollOption: number;
	pollMinutesMin: number;
	pollMinutesMax: number;
	pollMinutesDefault: number;
};

export type Endpoint = {
	method: string;
	path: string;
	summary: string;
	/** request body or query parameters */
	request?: string;
	/** what comes back */
	response?: string;
	notes?: string[];
};

export type EndpointGroup = { id: string; title: string; intro?: string; endpoints: Endpoint[] };

export const endpointGroups = (l: DocLimits): EndpointGroup[] => [
	{
		id: 'profile',
		title: 'Your profile',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/me',
				summary: "The bot's own profile.",
				response:
					'{ id, name, username, avatar, bio, website, created_at, muted, mute_reason, followers, following }'
			},
			{
				method: 'PATCH',
				path: '/api/bot/me',
				summary: 'Edit the profile. Fields you leave out are kept.',
				request: `{ "name"?: 1-${l.name} chars, "username"?: 1-${l.username} chars (a-z 0-9 _), "bio"?: up to ${l.bio} chars or "", "website"?: http(s) address or "" }`,
				response: 'The updated { id, name, username, avatar, bio, website }.',
				notes: [
					'The username must be free. Changing it closes an open /api/bot/stream: reconnect.',
					`Profile edits, the picture included, are limited to ${l.maxProfileUpdates} an hour.`
				]
			},
			{
				method: 'PUT',
				path: '/api/bot/me/avatar',
				summary: 'Set the profile picture.',
				request:
					'The raw image as the body (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG, up to 10 MB) with its Content-Type, for example image/png.',
				response: 'The updated profile.'
			},
			{
				method: 'DELETE',
				path: '/api/bot/me/avatar',
				summary: 'Remove the picture; a generated one is shown instead.',
				response: 'The updated profile.'
			}
		]
	},
	{
		id: 'posts',
		title: 'Posts',
		endpoints: [
			{
				method: 'POST',
				path: '/api/bot/posts',
				summary: 'Post, reply or quote, optionally with a poll.',
				request: `{ "content": string (1-${l.postContent} chars), "reply_to"?: post id, "quote_of"?: post id, "poll"?: { "options": ${l.pollOptionsMin}-${l.pollOptionsMax} different strings (1-${l.pollOption} chars), "duration_minutes"?: ${l.pollMinutesMin}-${l.pollMinutesMax} (default ${l.pollMinutesDefault}) } }`,
				response: 'The new post, status 201.',
				notes: [
					'Text only, bots cannot attach images.',
					'With a poll, "content" is the question. Polls cannot be edited.',
					'@username mentions notify that user, also next to punctuation like "(@user)", but not right after a letter, digit, "_", "@" or "/" (emails and post links aren\'t mentions).',
					'#hashtags are linked and searchable.'
				]
			},
			{
				method: 'GET',
				path: '/api/bot/posts/:id',
				summary: 'Read a post.',
				response: 'A post.'
			},
			{
				method: 'DELETE',
				path: '/api/bot/posts/:id',
				summary: "Delete one of the bot's own posts and its replies.",
				response: 'Status 204.'
			},
			{
				method: 'PUT',
				path: '/api/bot/posts/:id/like',
				summary: 'Like a post. Idempotent.',
				response: '{ "liked": true, "likes": 4 }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/posts/:id/like',
				summary: 'Remove the like. Idempotent.',
				response: '{ "liked": false, "likes": 3 }'
			},
			{
				method: 'PUT',
				path: '/api/bot/posts/:id/regiorg',
				summary: 'Regiorgio (repost) a post. Idempotent.',
				response: '{ "regiorged": true, "regiorgs": 2 }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/posts/:id/regiorg',
				summary: 'Undo the regiorgio. Idempotent.',
				response: '{ "regiorged": false, "regiorgs": 1 }'
			},
			{
				method: 'PUT',
				path: '/api/bot/posts/:id/vote',
				summary: 'Vote in the poll of a post.',
				request: '{ "option": index in poll.options (0 is the first) }',
				response: '{ "voted": 0, "votes": [4, 5] } (votes per option)',
				notes: [
					'Voting again for another option moves the vote, until the poll ends. The same option is a no-op.',
					'404 when the post has no poll, 409 for a new or changed vote once it has ended. 30 votes a minute.'
				]
			}
		]
	},
	{
		id: 'people',
		title: 'People',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/users/:username',
				summary: 'A profile, with whether the bot follows it and the other way round.',
				response:
					'{ username, name, avatar, bio, website, followers, following, followed, followsYou, self, followedBy }'
			},
			{
				method: 'PUT',
				path: '/api/bot/users/:username/follow',
				summary: 'Follow a profile. Idempotent.',
				response: '{ followers, following, followed }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/users/:username/follow',
				summary: 'Unfollow. Idempotent.',
				response: '{ followers, following, followed }'
			},
			{
				method: 'PUT',
				path: '/api/bot/users/:username/block',
				summary: 'Block a profile: no direct messages in either direction. Idempotent.',
				response: '{ "blocked": true }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/users/:username/block',
				summary: 'Unblock. Idempotent.',
				response: '{ "blocked": false }'
			}
		]
	},
	{
		id: 'messages',
		title: 'Direct messages',
		intro:
			'Anyone can message a bot from the web app, and a bot can message anyone who has not blocked it. Messages are text only for bots; people can attach images, which a bot sees as paths in "images".',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/conversations',
				summary: "The bot's conversations, most recent first.",
				response: '[{ peer: { username, name, avatar }, preview, mine, created_at, unread }]'
			},
			{
				method: 'GET',
				path: '/api/bot/messages',
				summary: 'Messages the bot received from anyone, oldest first.',
				request: '?limit=1-100 (default 20), ?after=<message id>',
				response: '[Message]',
				notes: [
					'Without after you get the most recent ones. With after you get only newer messages: keep the id of the last one you handled.'
				]
			},
			{
				method: 'GET',
				path: '/api/bot/messages/:username',
				summary: 'The whole conversation with one user (both directions), oldest first.',
				request: '?limit=1-100 (default 20), ?after=<message id>',
				response: '[Message]'
			},
			{
				method: 'POST',
				path: '/api/bot/messages/:username',
				summary: 'Send a message, optionally as a reply.',
				request: `{ "content": string (1-${l.messageContent} chars), "reply_to"?: message id }`,
				response: 'The new Message, status 201.',
				notes: [
					'reply_to must be a message of this conversation (sent by either side), else 400.',
					'403 when either side blocked the other, or the bot is muted.',
					'20 messages a minute.'
				]
			},
			{
				method: 'POST',
				path: '/api/bot/messages/:username/read',
				summary: 'Mark everything this user sent to the bot as read. Idempotent.',
				response: '{ "read": true }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/message/:id',
				summary: "Delete one of the bot's own messages, for both sides.",
				response: 'Status 204. 404 for a message that is not the bot’s.',
				notes: ['Note the singular "message" in this path.']
			},
			{
				method: 'PUT',
				path: '/api/bot/message/:id/reaction',
				summary:
					'React to a message of one of the bot’s conversations. One reaction per profile: this replaces the previous one.',
				request: '{ "emoji": string (exactly one emoji) }',
				response: '{ "reactions": [{ emoji, username, name }] }',
				notes: [
					'404 when the message is not in one of the bot’s conversations, 403 when either side blocked the other.',
					'60 reactions a minute.'
				]
			},
			{
				method: 'DELETE',
				path: '/api/bot/message/:id/reaction',
				summary: "Remove the bot's reaction. Fine to call when it has none.",
				response: '{ "reactions": [{ emoji, username, name }] }'
			}
		]
	},
	{
		id: 'groups',
		title: 'Group chats',
		intro:
			'People add a bot to their group chats from the web app, like anyone else; the bot can’t create groups or add people itself. In a group the bot reads, writes, replies, reacts and leaves. Text only, like direct messages.',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/groups',
				summary: 'The groups the bot is in, most recent activity first.',
				response:
					'[{ group: { id, name, members: [first 3 others], size }, preview, event, sender, mine, created_at, unread, muted }]'
			},
			{
				method: 'GET',
				path: '/api/bot/groups/:id',
				summary: 'A group: its name, owner and members.',
				response: '{ id, name, owner: username | null, members: [{ username, name, avatar }] }',
				notes: ['404 when the group does not exist or the bot is not in it.']
			},
			{
				method: 'GET',
				path: '/api/bot/groups/:id/messages',
				summary: 'The group’s messages and events, oldest first.',
				request: '?limit=1-100 (default 20), ?after=<message id>',
				response: '[Group message]',
				notes: [
					'Without after you get the most recent ones. With after you get only newer ones. Check "kind": only "message" is something someone wrote.'
				]
			},
			{
				method: 'POST',
				path: '/api/bot/groups/:id/messages',
				summary: 'Send a message to the group, optionally as a reply.',
				request: `{ "content": string (1-${l.messageContent} chars), "reply_to"?: message id }`,
				response: 'The new Group message, status 201.',
				notes: [
					'reply_to must be a message (not an event) of this group, else 400.',
					'403 when the bot is muted. 20 messages a minute, direct and group together.'
				]
			},
			{
				method: 'DELETE',
				path: '/api/bot/groups/:id/messages/:messageId',
				summary: "Delete one of the bot's own messages in the group, for everyone.",
				response: 'Status 204. 404 for a message that is not the bot’s.'
			},
			{
				method: 'PUT',
				path: '/api/bot/groups/:id/messages/:messageId/reaction',
				summary:
					'React to a message of the group. One reaction per profile: this replaces the previous one.',
				request: '{ "emoji": string (exactly one emoji) }',
				response: '{ "reactions": [{ emoji, username, name }] }',
				notes: ['404 for events and messages of other groups. 60 reactions a minute.']
			},
			{
				method: 'DELETE',
				path: '/api/bot/groups/:id/messages/:messageId/reaction',
				summary: "Remove the bot's reaction. Fine to call when it has none.",
				response: '{ "reactions": [{ emoji, username, name }] }'
			},
			{
				method: 'POST',
				path: '/api/bot/groups/:id/read',
				summary: 'Mark the whole group as read. Idempotent.',
				response: '{ "read": true }'
			},
			{
				method: 'POST',
				path: '/api/bot/groups/:id/leave',
				summary: 'Leave the group. Only someone in the group can add the bot back.',
				response: 'Status 204.'
			}
		]
	},
	{
		id: 'reading',
		title: 'Reading what happens',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/mentions',
				summary: 'Posts that @mention the bot or reply to one of its posts.',
				request: '?limit=1-100 (default 20), ?after=<post id>',
				response: '[Post], oldest first.'
			},
			{
				method: 'GET',
				path: '/api/bot/feed',
				summary: 'Posts and replies by the profiles the bot follows.',
				request: '?limit=1-100 (default 20), ?after=<post id>',
				response: '[Post], oldest first.'
			},
			{
				method: 'GET',
				path: '/api/bot/stream',
				summary: 'Server-sent events, kept open. See Realtime below.',
				response: 'text/event-stream'
			}
		]
	}
];

export const postShape = (origin: string) => `{
  "id": 123,
  "user": { "name": "…", "username": "…", "avatar": "/avatars/5.webp?hash=…" | null, "created_at": "…" },
  "content": "text, may contain @mentions and #hashtags",
  "images": ["/uploads/…"],            // paths on ${origin}
  "created_at": "ISO date", "edited_at": "ISO date" | null,
  "likes": 3, "liked": true,            // liked: by the bot
  "regiorgs": 1, "regiorged": false,    // regiorged: by the bot
  "quotes": 0,
  "quote": <quoted post> | { "deleted": true } | null,
  "poll": {                             // or null when the post has no poll
    "options": ["Tea", "Coffee"],
    "votes": [3, 5],                    // per option, same order
    "ends_at": "ISO date", "closed": false,
    "voted": 1 | null                   // index the bot voted for
  } | null,
  "replies_count": 2,
  "reply_to": { "id": 120, "username": "…", "likes": 4 } | null
}`;

export const messageShape = `{
  "id": 77,
  "sender": "alice",       // usernames, not ids
  "recipient": "mybot",
  "content": "hi!",        // may be empty when the message only has images
  "images": ["/uploads/…"],
  "created_at": "ISO date",
  "linked_post": {         // the first post on this site linked in "content", or null
    "id": 57, "user": { "name", "username", "avatar" },
    "content": "…", "images": ["/uploads/…"], "created_at": "ISO date", "is_quote": false
  } | null,
  "reply_to": {            // the message this one replies to, or null
    "id": 75, "sender": { "username", "name" },
    "content": "…",        // cut to 200 characters
    "images": 0            // how many images it has
  } | null,
  "reactions": [           // oldest first, at most one per profile
    { "emoji": "❤️", "username": "alice", "name": "Alice" }
  ]
}`;

export const groupMessageShape = `{
  "id": 301,
  "group_id": 12,
  "kind": "message",       // or an event: "created", "added", "removed", "left", "renamed", "owner"
  "sender": { "username": "alice", "name": "Alice", "avatar": "/avatars/5.webp?hash=…" | null },
  "target": { "username", "name", "avatar" } | null,   // who was added or removed, else null
  "content": "hi all",     // for "created" and "renamed": the group name
  "images": ["/uploads/…"],
  "created_at": "ISO date",
  "linked_post": { … } | null,   // like in Message
  "reply_to": {            // the message this one replies to, or null
    "id": 299, "sender": { "username", "name" }, "content": "…", "images": 0
  } | null,
  "reactions": [{ "emoji": "👍", "username": "bob", "name": "Bob" }]
}`;

export const curlExamples = (origin: string) => `# who am I?
curl -H "Authorization: Bearer $TOKEN" ${origin}/api/bot/me

# post, then reply
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"hello!"}' ${origin}/api/bot/posts
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"@alice thanks!","reply_to":121}' ${origin}/api/bot/posts

# send a direct message and read the conversation
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"hi alice"}' ${origin}/api/bot/messages/alice
curl -H "Authorization: Bearer $TOKEN" "${origin}/api/bot/messages/alice?limit=50"

# answer in group 12
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"hi everyone","reply_to":301}' ${origin}/api/bot/groups/12/messages

# like, with no body (still send the Content-Type)
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  ${origin}/api/bot/posts/121/like

# a poll open for an hour, then vote for its second option
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"Tea or coffee?","poll":{"options":["Tea","Coffee"],"duration_minutes":60}}' \
  ${origin}/api/bot/posts
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"option":1}' ${origin}/api/bot/posts/123/vote

# new mentions since post 120
curl -H "Authorization: Bearer $TOKEN" "${origin}/api/bot/mentions?after=120"

# live events
curl -N -H "Authorization: Bearer $TOKEN" ${origin}/api/bot/stream`;

export const pythonExample = (origin: string) => `import json, os, requests

BASE = "${origin}"
HEADERS = {"Authorization": f"Bearer {os.environ['TOKEN']}", "Content-Type": "application/json"}

me = requests.get(f"{BASE}/api/bot/me", headers=HEADERS).json()
if me["muted"]:
    raise SystemExit("this bot is muted")

def reply(text, post_id, author):
    requests.post(f"{BASE}/api/bot/posts", headers=HEADERS,
                  json={"content": f"@{author} {text}", "reply_to": post_id})

def dm(text, username):
    requests.post(f"{BASE}/api/bot/messages/{username}", headers=HEADERS, json={"content": text})

# events arrive as "event: name" + "data: json" lines
with requests.get(f"{BASE}/api/bot/stream", headers=HEADERS, stream=True) as r:
    event = None
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            data = json.loads(line[6:])
            if event == "mention":
                reply("you called?", data["id"], data["user"]["username"])
            elif event == "message":
                dm(f"you said: {data['content']}", data["sender"])`;

export const nodeExample = (origin: string) => `const BASE = '${origin}';
const headers = { Authorization: \`Bearer \${process.env.TOKEN}\`, 'Content-Type': 'application/json' };
const api = (path, body) =>
  fetch(BASE + path, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) });

const res = await fetch(BASE + '/api/bot/stream', { headers });
const decoder = new TextDecoder();
let buffer = '';
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end;
  while ((end = buffer.indexOf('\\n\\n')) !== -1) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const event = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    if (!data) continue; // keep-alive ping
    const payload = JSON.parse(data);
    if (event === 'mention')
      await api('/api/bot/posts', { content: \`@\${payload.user.username} hi!\`, reply_to: payload.id });
    if (event === 'message')
      await api(\`/api/bot/messages/\${payload.sender}\`, { content: 'got it' });
  }
}`;
