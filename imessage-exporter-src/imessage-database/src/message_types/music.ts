import { Value } from 'plist-js';
import { get_string_from_dict, get_string_from_nested_dict } from '../util/plist';
import { BalloonProvider, PlistParseError } from './variants';

export interface MusicMessage {
    url: string | null;
    preview: string | null;
    artist: string | null;
    album: string | null;
    track_name: string | null;
}

export class MusicMessageClass implements BalloonProvider {
    static from_map(payload: Value): MusicMessage | PlistParseError {
        const { musicMetadata, body } = MusicMessageClass.get_body_and_url(payload);

        if (musicMetadata instanceof PlistParseError || body instanceof PlistParseError) {
            return musicMetadata;
        }

        return {
            url: get_string_from_nested_dict(body, "URL"),
            preview: get_string_from_nested_dict(musicMetadata, "previewURL"),
            artist: get_string_from_dict(musicMetadata, "artist"),
            album: get_string_from_dict(musicMetadata, "album"),
            track_name: get_string_from_dict(musicMetadata, "name"),
        };
    }

    private static get_body_and_url(payload: Value): { musicMetadata: Value | PlistParseError, body: Value | PlistParseError } {
        const base = payload.get("richLinkMetadata") || new PlistParseError("MissingKey", "richLinkMetadata");
        const musicMetadata = base.get("specialization") || new PlistParseError("MissingKey", "specialization");

        return { musicMetadata, body: base };
    }
}

// Test Cases
// ------------
// import { parse_plist } from '../util/plist';
// import { readFileSync } from 'fs';
// import { Value } from 'plist-js';
// import { MusicMessageClass } from '../message_types/music';
//
// test("test_parse_apple_music", () => {
//     const plistPath = "../test_data/music_message/AppleMusic.plist";
//     const plistData = readFileSync(plistPath);
//     const plist = Value.fromBinary(plistData);
//     const parsed = parse_plist(plist);
//     const balloon = MusicMessageClass.from_map(parsed);
//
//     expect(balloon).toEqual({
//         url: "https://music.apple.com/us/album/%D0%BF%D0%B5%D1%81%D0%BD%D1%8C-1/1539641998?i=1539641999",
//         preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/b2/65/b3/b265b31f-facb-3ea3-e6bc-91a8d01c9b2f/mzaf_18233159060539450284.plus.aac.ep.m4a",
//         artist: "��������������",
//         album: "��ани��ида",
//         track_name: "��еснь 1",
//     });
// });
```