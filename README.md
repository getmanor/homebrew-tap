# MANOR Homebrew tap

Install MANOR Edge, the menu bar app that runs a home's on-site edge, on an
Apple silicon Mac with macOS 13 or later:

```bash
brew install --cask getmanor/tap/manor-edge
```

This installs the same signed, notarized app as
[mymanor.click/download](https://mymanor.click/download). Open MANOR Edge from
Applications and pair the Mac with a key from your account.

## Updates

The app updates itself, so `brew upgrade` leaves it alone. This tap follows
the current production release: a scheduled workflow
(`.github/workflows/update-cask.yml`) reads the public downloads manifest every
hour, re-renders `Casks/manor-edge.rb` and commits when the version or checksum
changes. It checks the download's SHA-256 before committing.

## Uninstalling

`brew uninstall --cask manor-edge` removes the app only. It does not disconnect
the Mac from its home. To remove the edge, choose **Disconnect This Mac…** in
the app first. `--zap` also removes the app's caches and preferences, never
pairing or edge data.

If MANOR Edge is already in Applications from the disk image, let Homebrew
manage it with:

```bash
brew install --cask --adopt getmanor/tap/manor-edge
```
