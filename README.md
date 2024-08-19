# MiMessage

MiMessage is a free and privacy preserving UI to help search, export and visualize your iMessage conversations. It helps export conversations, search conversations, and visualize stats about your conversations.

![App screenshot](readme-assets/img.png?raw=true "Mimessage App")

## Installation

To install the application, check out the releases tab and download the app for your architecture. https://github.com/jonluca/mimessage/releases

## Features

This alternative UI provides several advanced features, including:

- **Semantic Search**: Using OpenAI and a locally running version of chroma you can do semantic search on your messages
- **Wrapped**: See the stats for all your iMessage conversations
- **Custom Filters**: Apply custom filters to refine your search results and find exactly what you're looking for.
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

The [OpenAI rate limits](https://platform.openai.com/docs/guides/rate-limits/overview) are dependent on your tier and account age. Make sure you're on the "Pay as you go" plan, and your acount is at least 48 hours old.

## Developing

First clone the repo, then run `yarn` to install dependencies. Then run `yarn dev` to start the application.

The recommended node version is v19

```bash
git clone git@github.com:jonluca/mimessage.git
cd mimessage
yarn install
yarn dev
```

Important note: your IDE or your terminal must have full disk access enabled in permissions. It will also request contacts permissions, to be able to read your contacts to map the phone numbers to names.

## Credits

- [imessage-exporter](https://github.com/ReagentX/imessage-exporter) was used to help understand the database schema
- [BlueBubbles](https://github.com/BlueBubblesApp/bluebubbles-app) was used to understand some messages specific types and enums
