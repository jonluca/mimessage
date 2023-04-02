import { Value } from "plist";
import { get_string_from_dict, get_string_from_nested_dict } from "../util/plist";
import { PlistParseError } from "../error/plist";
import { BalloonProvider } from "./variants/BalloonProvider";

export interface AppMessage {
  image?: string;
  url?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  subcaption?: string;
  trailing_caption?: string;
  trailing_subcaption?: string;
  app_name?: string;
  ldtext?: string;
}

export class AppMessageImpl implements BalloonProvider<AppMessage> {
  static fromMap(payload: Value): Result<AppMessage, PlistParseError> {
    const userInfo = payload.asDictionary()?.get("userInfo");
    if (!userInfo) {
      return Err(new PlistParseError("MissingKey", "userInfo"));
    }

    return Ok({
      image: get_string_from_dict(payload, "image"),
      url: get_string_from_nested_dict(payload, "URL"),
      title: get_string_from_dict(userInfo, "image-title"),
      subtitle: get_string_from_dict(userInfo, "image-subtitle"),
      caption: get_string_from_dict(userInfo, "caption"),
      subcaption: get_string_from_dict(userInfo, "subcaption"),
      trailing_caption: get_string_from_dict(userInfo, "secondary-subcaption"),
      trailing_subcaption: get_string_from_dict(userInfo, "tertiary-subcaption"),
      app_name: get_string_from_dict(payload, "an"),
      ldtext: get_string_from_dict(payload, "ldtext"),
    });
  }
}
```