-- Hashtags of the posts written before hashtags existed. New posts get theirs from the post API
-- (extractHashtags in src/lib/hashtags.ts); this is the same rule in SQL, close enough for old
-- content: a "#" at the start or after whitespace, a run of letters, digits and underscores
-- with at least one letter, at most 64 characters.
INSERT INTO post_hashtags (post_id, tag)
SELECT DISTINCT p.id, lower(m[2])
FROM posts p, regexp_matches(p.content, '(^|\s)#([[:alnum:]_]+)', 'g') AS m
WHERE m[2] ~ '[[:alpha:]]' AND length(m[2]) <= 64
ON CONFLICT DO NOTHING;
