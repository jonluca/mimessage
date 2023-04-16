import * as http from "http";
import * as https from "https";
import CacheableLookup from "./DnsCache";

const cacheable = new CacheableLookup({
  maxTtl: 60 * 60, // 1 hour
});

cacheable.install(http.globalAgent);
cacheable.install(https.globalAgent);
