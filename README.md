# Mimessage

Welcome to the iMessage Alternative UI project! This is an open-source alternative user interface for Apple's native iMessage application, built using TypeScript, Electron, and Kysely.

![App screenshot](img.png?raw=true "Mimessage App")

## Features

This alternative UI provides several advanced features, including:

1. **Regex Search**: Search your conversations using powerful regular expressions to find specific messages or patterns.
2. **Custom Filters**: Apply custom filters to refine your search results and find exactly what you're looking for.
3. **Conversation Export**: Export all the data of a given conversation in a user-friendly format for archival purposes or analysis.
4. **Media Export**: Easily export all media (images, videos, etc.) from a conversation to a separate folder.
5. **AI Conversation**: Have a conversation with anyone you've talked to before, in their voice

Please note that this application is for viewing and managing iMessage conversations only. It does **NOT** allow you to send messages.

## Installation

To install the application, check out the releases tab and download the app for your architecture.https://github.com/jonluca/mimessage/releases

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

A lot of the heavy lifting for the db schema was done by https://github.com/ReagentX/imessage-exporter and https://github.com/BlueBubblesApp/bluebubbles-app
