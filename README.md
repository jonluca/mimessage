# MiMessage

MiMessage is a free and privacy preserving UI to help search, export and visualize your iMessage conversations. It helps export conversations, search conversations, and visualize stats about your conversations.

![App screenshot](readme-assets/img.png?raw=true "Mimessage App")

## Installation

To install the application, check out the releases tab and download the app for your architecture. https://github.com/jonluca/mimessage/releases

## Release automation

The GitHub Actions `CI` workflow can be run manually to build, Developer ID sign, notarize, staple, and verify both Apple Silicon and Intel artifacts without publishing them. A tag must exactly match `v<package.json version>` before the verified artifacts can be published as a prerelease.

The release job requires these repository Actions secrets:

- `APPLE_API_KEY_P8`: App Store Connect API private key contents
- `APPLE_API_KEY_ID`: App Store Connect API key ID
- `APPLE_API_ISSUER`: App Store Connect issuer ID
- `CSC_LINK`: base64 PKCS#12 containing the Developer ID Application certificate and private key
- `CSC_KEY_PASSWORD`: password protecting that PKCS#12 archive

The legacy `APPLE_ID` and `APPLE_ID_PASSWORD` secrets are not required by the API-key workflow.

## Features

This alternative UI provides several advanced features, including:

- **Semantic Search**: Use OpenAI embeddings stored locally to search your messages by meaning
- **Wrapped**: See the stats for all your iMessage conversations
- **Custom Filters**: Apply custom filters to refine your search results and find exactly what you're looking for.
- **Conversation Export**: Export all the data of a given conversation in a user-friendly format for archival purposes or analysis.
- **Regex Search**: Search your conversations using powerful regular expressions to find specific messages or patterns.
- **Media Export**: Easily export all media (images, videos, etc.) from a conversation to a separate folder.
- **AI Conversation**: Have a conversation with anyone you've talked to before, in their voice

Please note that this application is for viewing and managing iMessage conversations only. It does **NOT** allow you to send messages.

### Wrapped

Mimessage also creates an "iMessage Wrapped" - a Spotify Wrapped, but for your conversations. It will generate some statistics about your conversations.

![Wrapped](readme-assets/wrapped.png?raw=true "My iMessage Wrapped")

Fun sidenote: ChatGPT actually came up with a lot of the stats that would be interesting to see.

![ChatGPT ideas](readme-assets/chatgpt.png?raw=true "ChatGPT generated the stats")

### My stats look wrong

If a lot of your conversations are missing attachments, or the stats look wrong, you can try the following:

- Open up iMessage settings
- Unselect "Enable Messages in iCloud"
- In the prompt, select "Only this device"
- Re-enable Messages in iCloud
- Wait for the messages to sync and download (You can see progress in the bottom right of the iMessage app)

This will force iMessage to download all the attachments and messages to your computer. This process might take a while depending on how many messages you have.

## Creating embedding is slow

The [OpenAI rate limits](https://platform.openai.com/docs/guides/rate-limits/overview) are dependent on your tier and account age. Make sure you're on the "Pay as you go" plan, and your account is at least 48 hours old.

## Developing

First clone the repo, then run `yarn` to install dependencies. Then run `yarn dev` to start the application.

The recommended Node.js version is v24.20.0.

```bash
git clone git@github.com:jonluca/mimessage.git
cd mimessage
yarn install
yarn dev
```

Before submitting changes, run the formatter, linter, and TypeScript checks:

```bash
yarn format:check
yarn lint
yarn typecheck
```

The performance checks use synthetic data and do not read your Messages library or call an embedding API:

```bash
yarn test:renderer     # Electron render counts, selection, and message updates
yarn test:performance  # SQLite query equivalence and before/after timings
yarn test:semantic --benchmark  # Duplicate tokenization and filtered lookup timings
```

Query timings depend on the machine; the benchmark asserts matching results without a wall-clock threshold.

To apply the lint and format fixes only to files that are already staged, run `yarn lint:staged`.

Important note: your IDE or your terminal must have full disk access enabled in permissions. It will also request contacts permissions, to be able to read your contacts to map the phone numbers to names.

## Credits

- [imessage-exporter](https://github.com/ReagentX/imessage-exporter) was used to help understand the database schema
- [BlueBubbles](https://github.com/BlueBubblesApp/bluebubbles-app) was used to understand some messages specific types and enums
