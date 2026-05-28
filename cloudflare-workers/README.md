# Cloudflare Workers

These worker files mirror the production Cloudflare setup used by the Reflex Interactive website.

## `reflex-launcher-files.mjs`

Route:

```text
https://cdn.reflexinteractive.com/launcher-files/*
```

Bindings:

```text
GAME_BUCKET = R2 bucket containing launcher-files/
```

Allowed R2 objects:

```text
launcher-files/version.json
launcher-files/Reflex Interactive Launcher.msi
launcher-files/app/*
```

The MSI is used by the website download button for first installs. The `app/*` files are used by installed launchers for manifest-based updates.

## `reflex-games.mjs`

Route:

```text
https://downloads.reflexinteractive.com/download
```

Bindings and variables:

```text
GAME_BUCKET = R2 bucket containing game-files/
FIREBASE_PROJECT_ID = Firebase project ID
FIREBASE_DATABASE_URL = Firebase Realtime Database URL
```

Expected download URL format:

```text
https://downloads.reflexinteractive.com/download?key=game-files/example/win-x64/game.zip&gameId=medlock&filename=game.zip&token=<firebase-id-token>
```

The worker verifies the Firebase ID token, requires verified email, checks the user's `ownedGames`, and only then streams the R2 object.

## `account-page-reflex.mjs`

Route only the account page/subdomain through this worker if you still want a beta banner.

Variables:

```text
ACCOUNT_DEV_MODE=true
```

Leave `ACCOUNT_DEV_MODE` unset or set it to `false` in production to avoid injecting any banner.
