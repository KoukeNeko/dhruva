/*
* Dhruva GNOME Extension
* Copyright (C) 2026 NarkAgni
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const PARENS_RE = /\s*\(.*?\)\s*/g;
const BRACKETS_RE = /\s*\[.*?\]\s*/g;
const DASH_RE = /\s+-\s+/;
const QUOTED_RE = /[「『](.+?)[」』]/;

const normalize = text => (text || '').toLowerCase().replace(/\s+/g, '');

export function cleanArtist(artist) {
    return (artist || '').split(',')[0].replace(PARENS_RE, ' ').trim();
}

/**
 * The track and artist names to look lyrics up by, most likely first.
 *
 * A music player reports "Song - Remastered 2011" with the artist apart, but
 * a browser playing a video reports the video's title, such as
 * "Artist - Song (Official Video)" or "Artist - LIVE「Song」", and the channel
 * as the artist. Which side of the dash is the song cannot be told from the
 * text alone, so both readings are returned and the caller tries them in turn.
 */
export function lyricsQueries(title, artist) {
    const stripped = (title || '').replace(PARENS_RE, ' ').replace(BRACKETS_RE, ' ').trim();
    const reported = cleanArtist(artist);
    const parts = stripped.split(DASH_RE);
    const head = parts[0].trim();
    const tail = parts.slice(1).join(' - ').trim();
    const queries = [];

    const quoted = stripped.match(QUOTED_RE);
    if (quoted) {
        const before = stripped.slice(0, quoted.index).trim();
        queries.push({ title: quoted[1].trim(), artist: tail ? head : (before || reported) });
    }

    if (tail) {
        const asVideo = { title: tail, artist: head };
        const asTrack = { title: head, artist: reported };
        // A title led by the artist's own name is never "Song - Suffix"; reading it
        // that way would look the artist's name up as the song.
        const headIsArtist = normalize(reported).includes(normalize(head));
        queries.push(...(headIsArtist ? [asVideo] : [asTrack, asVideo]));
    } else {
        queries.push({ title: stripped, artist: reported });
    }

    return queries.filter(query => query.title);
}

/** Whether a search result is the track that was asked for, not just one by the same artist. */
export function titlesMatch(found, wanted) {
    // "Heroes (2017 Remaster)" is "Heroes"; a short name found somewhere inside a
    // long video title is not that video's song.
    const a = normalize((found || '').replace(PARENS_RE, ' ').replace(BRACKETS_RE, ' '));
    const b = normalize(wanted);
    return a.length > 0 && b.length > 0 && a.startsWith(b);
}

/** Per reported title, so that two videos of one channel never share lyrics. */
export function cacheKey(title, artist) {
    return `${(title || '').trim().toLowerCase()}::${cleanArtist(artist).toLowerCase()}`;
}
